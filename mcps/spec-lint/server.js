#!/usr/bin/env node
// adam spec-lint MCP server
//
// One tool: `lint` — verify the spec-driven workflow is well integrated.
// Inspects spec/, CLAUDE.md, and .claude/ at a given project root, returns a
// structured report of errors and warnings. Read-only.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { countTokens } from "../lib/tokens.js";

const TOKEN_WARN = 4000;
const TOKEN_ERROR = 6000;
const CLAUDE_MD_TOKEN_WARN = 2000;

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

function extractMarkdownLinks(text) {
  const links = [];
  const re = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    links.push({ text: m[1], target: m[2] });
  }
  return links;
}

function extractTableSpecRows(claudeMd) {
  // Find the spec index table — heuristic: a markdown table whose header row contains "Spec" and "Read when".
  const lines = claudeMd.split("\n");
  const rows = [];
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inTable) {
      if (/^\|.*Spec.*\|.*Read when/i.test(line)) {
        inTable = true;
        // Skip the separator row
        i++;
        continue;
      }
    } else {
      if (!line.trim().startsWith("|")) {
        inTable = false;
        continue;
      }
      const cells = line.split("|").map((c) => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (cells.length >= 2) {
        // Extract first link in cell 0 — that's the spec path
        const linkMatch = cells[0].match(/\[([^\]]*)\]\(([^)]+)\)/);
        if (linkMatch) {
          rows.push({
            label: linkMatch[1],
            path: linkMatch[2],
            description: cells[1],
            tokens: cells[2] || null,
          });
        }
      }
    }
  }
  return rows;
}

async function listSpecFiles(specDir) {
  if (!existsSync(specDir)) return [];
  const entries = await readdir(specDir);
  return entries.filter((e) => e.endsWith(".md") && e !== "INDEX.md");
}

async function lint(projectRoot) {
  const root = resolve(projectRoot);
  const errors = [];
  const warnings = [];
  const info = [];

  const specDir = join(root, "spec");
  const claudeMdPath = join(root, "CLAUDE.md");
  const indexPath = join(specDir, "INDEX.md");
  const dotClaudeDir = join(root, ".claude");

  // 1. spec/ exists
  if (!existsSync(specDir)) {
    errors.push(`spec/ directory missing at ${root}`);
    return finalize({ errors, warnings, info });
  }

  // 2. CLAUDE.md exists
  if (!existsSync(claudeMdPath)) {
    errors.push("CLAUDE.md missing at project root");
  }

  // 3. spec/INDEX.md exists
  if (!existsSync(indexPath)) {
    errors.push("spec/INDEX.md missing");
  }

  const specFiles = await listSpecFiles(specDir);
  if (specFiles.length === 0) {
    warnings.push("spec/ directory exists but contains no spec files (only INDEX.md or empty)");
  }

  // 4. Each spec has frontmatter; check token sizes
  const specsByName = {};
  for (const file of specFiles) {
    const fpath = join(specDir, file);
    const text = await readFile(fpath, "utf8");
    const fm = parseFrontmatter(text);
    const tokens = countTokens(text);
    specsByName[file] = { path: fpath, text, fm, tokens };

    if (!fm) {
      warnings.push(`spec/${file} has no YAML frontmatter`);
    } else {
      for (const required of ["name", "description", "updated"]) {
        if (!fm[required]) {
          warnings.push(`spec/${file} frontmatter missing '${required}' field`);
        }
      }
    }

    if (tokens > TOKEN_ERROR) {
      errors.push(`spec/${file} is ${tokens} tokens — exceeds hard ceiling ${TOKEN_ERROR} (split into multiple specs)`);
    } else if (tokens > TOKEN_WARN) {
      warnings.push(`spec/${file} is ${tokens} tokens — exceeds soft ceiling ${TOKEN_WARN} (consider splitting)`);
    }
  }

  // 5. Cross-reference resolution within spec/*.md
  for (const [file, info] of Object.entries(specsByName)) {
    const links = extractMarkdownLinks(info.text);
    for (const link of links) {
      const tgt = link.target;
      if (tgt.startsWith("http") || tgt.startsWith("#") || tgt.startsWith("mailto:")) continue;
      // Resolve relative to the spec file
      let resolved;
      if (tgt.startsWith("./") || tgt.startsWith("../")) {
        resolved = resolve(specDir, tgt.split("#")[0]);
      } else if (tgt.startsWith("/")) {
        resolved = resolve(root, "." + tgt.split("#")[0]);
      } else {
        resolved = resolve(specDir, tgt.split("#")[0]);
      }
      if (!existsSync(resolved)) {
        warnings.push(`spec/${file} has broken link: ${link.target}`);
      }
    }
  }

  // 6. CLAUDE.md ↔ spec/ consistency
  let claudeMdRows = [];
  let claudeMdTokens = 0;
  if (existsSync(claudeMdPath)) {
    const claudeMd = await readFile(claudeMdPath, "utf8");
    claudeMdTokens = countTokens(claudeMd);
    claudeMdRows = extractTableSpecRows(claudeMd);

    if (claudeMdRows.length === 0) {
      errors.push("CLAUDE.md does not contain a spec index table (expected a markdown table with 'Spec' and 'Read when' columns)");
    }

    if (claudeMdTokens > CLAUDE_MD_TOKEN_WARN) {
      warnings.push(`CLAUDE.md is ${claudeMdTokens} tokens — exceeds ${CLAUDE_MD_TOKEN_WARN} soft ceiling. CLAUDE.md is a brief, push detail into specs.`);
    }

    // Every spec/*.md (excluding INDEX) should be referenced
    const referenced = new Set(
      claudeMdRows
        .map((r) => r.path.replace(/^\.\//, ""))
        .map((p) => p.split("/").pop()),
    );
    for (const file of specFiles) {
      if (!referenced.has(file)) {
        warnings.push(`spec/${file} not referenced in CLAUDE.md spec index table`);
      }
    }

    // Every row should resolve to a real file
    for (const row of claudeMdRows) {
      const tgt = row.path.replace(/^\.\//, "");
      const resolved = resolve(root, tgt);
      if (!existsSync(resolved)) {
        errors.push(`CLAUDE.md spec table references missing file: ${row.path}`);
      }
    }
  }

  // 7. spec/INDEX.md consistency (lighter check — just that it lists each spec)
  if (existsSync(indexPath)) {
    const indexText = await readFile(indexPath, "utf8");
    for (const file of specFiles) {
      if (!indexText.includes(file) && !indexText.includes(file.replace(/\.md$/, ""))) {
        warnings.push(`spec/${file} not mentioned in spec/INDEX.md`);
      }
    }
  }

  // 8. .claude/ presence (info-level — not required, but nice to confirm)
  if (existsSync(dotClaudeDir)) {
    const dotClaudeEntries = await readdir(dotClaudeDir);
    info.push(`.claude/ exists with: ${dotClaudeEntries.join(", ") || "(empty)"}`);
  } else {
    info.push(".claude/ not present — that's fine if no project-local agents/hooks are needed");
  }

  return finalize({ errors, warnings, info, specsByName, claudeMdRows, claudeMdTokens });
}

function finalize({ errors, warnings, info, specsByName = {}, claudeMdRows = [], claudeMdTokens = 0 }) {
  const tokenSummary = Object.entries(specsByName).map(([file, s]) => ({
    file: `spec/${file}`,
    tokens: s.tokens,
  }));
  if (claudeMdTokens) tokenSummary.push({ file: "CLAUDE.md", tokens: claudeMdTokens });
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    info,
    tokenSummary,
    indexRows: claudeMdRows,
  };
}

const server = new Server(
  { name: "adam-spec-lint", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lint",
      description:
        "Lint the spec-driven Claude Code ecosystem at the given project root. Returns {ok, errors, warnings, info, tokenSummary, indexRows}. Checks: spec/ exists, CLAUDE.md exists with a spec index table, INDEX.md exists, every spec is referenced, table rows resolve, frontmatter is sane, no spec exceeds token ceilings, and cross-spec links resolve.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Project root path. Defaults to the current working directory.",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== "lint") throw new Error(`Unknown tool: ${name}`);
  const root = args.path || process.cwd();
  const result = await lint(root);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
