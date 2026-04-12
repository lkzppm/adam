import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import matter from "gray-matter";
import { encode } from "gpt-tokenizer";

type SpecFrontmatter = {
  name?: string;
  description?: string;
  agents?: string[];
  tags?: string[];
  tokens?: number;
  updated?: string;
};

type SpecRecord = {
  name: string;
  description: string;
  agents: string[];
  tags: string[];
  tokens: number;
  path: string;
  updated: string | null;
};

const SPEC_DIR = process.env.ADAM_SPEC_DIR ?? join(process.cwd(), "spec");

const countCache = new Map<string, { mtimeMs: number; tokens: number }>();

function countTokens(path: string, body: string): number {
  const st = statSync(path);
  const cached = countCache.get(path);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.tokens;
  const tokens = encode(body).length;
  countCache.set(path, { mtimeMs: st.mtimeMs, tokens });
  return tokens;
}

function listSpecFiles(): string[] {
  if (!existsSync(SPEC_DIR)) return [];
  return readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith(".md") && f !== "INDEX.md")
    .map((f) => join(SPEC_DIR, f));
}

function loadSpec(path: string): SpecRecord {
  const raw = readFileSync(path, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data as SpecFrontmatter;
  const name = fm.name ?? basename(path, ".md");
  const tokens = countTokens(path, parsed.content);
  return {
    name,
    description: fm.description ?? "",
    agents: Array.isArray(fm.agents) ? fm.agents : [],
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    tokens,
    path,
    updated: fm.updated ?? null,
  };
}

function loadAll(): SpecRecord[] {
  return listSpecFiles().map(loadSpec);
}

function findSpecBody(name: string): { front: SpecFrontmatter; body: string; path: string } | null {
  for (const path of listSpecFiles()) {
    const raw = readFileSync(path, "utf8");
    const parsed = matter(raw);
    const fm = parsed.data as SpecFrontmatter;
    const specName = fm.name ?? basename(path, ".md");
    if (specName === name) {
      return { front: fm, body: parsed.content, path };
    }
  }
  return null;
}

const server = new McpServer({ name: "adam-context-mcp", version: "0.1.0" });

server.registerTool(
  "list_specs",
  {
    description:
      "List spec files in the project's spec/ folder. Optionally filter by agent role name or tag. Returns name, description, tokens, path — NOT the body.",
    inputSchema: {
      agent: z.string().optional().describe("Only return specs whose frontmatter `agents:` includes this name."),
      tag: z.string().optional().describe("Only return specs whose frontmatter `tags:` includes this tag."),
    },
  },
  async ({ agent, tag }) => {
    const all = loadAll();
    const filtered = all.filter(
      (s) => (agent ? s.agents.includes(agent) : true) && (tag ? s.tags.includes(tag) : true),
    );
    const rows = filtered.map((s) => ({
      name: s.name,
      description: s.description,
      tokens: s.tokens,
      agents: s.agents,
      tags: s.tags,
      path: s.path,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
    };
  },
);

server.registerTool(
  "read_spec",
  {
    description: "Read the full markdown body of one spec by name.",
    inputSchema: {
      name: z.string().describe("The `name` field from the spec's frontmatter."),
    },
  },
  async ({ name }) => {
    const found = findSpecBody(name);
    if (!found) {
      return {
        content: [{ type: "text", text: `Spec "${name}" not found in ${SPEC_DIR}` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: found.body }] };
  },
);

server.registerTool(
  "search_specs",
  {
    description:
      "Keyword substring search across spec bodies (case-insensitive). Returns name + snippet for each match.",
    inputSchema: {
      query: z.string().describe("Substring to search for. Case-insensitive."),
      limit: z.number().int().positive().optional().describe("Max results (default 10)."),
    },
  },
  async ({ query, limit }) => {
    const max = limit ?? 10;
    const needle = query.toLowerCase();
    const hits: { name: string; snippet: string }[] = [];
    for (const path of listSpecFiles()) {
      if (hits.length >= max) break;
      const raw = readFileSync(path, "utf8");
      const parsed = matter(raw);
      const body = parsed.content;
      const idx = body.toLowerCase().indexOf(needle);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 60);
      const end = Math.min(body.length, idx + query.length + 60);
      const snippet = body.slice(start, end).replace(/\s+/g, " ").trim();
      const fm = parsed.data as SpecFrontmatter;
      hits.push({
        name: fm.name ?? basename(path, ".md"),
        snippet: `…${snippet}…`,
      });
    }
    return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
  },
);

server.registerTool(
  "spec_index",
  {
    description:
      "Return the parsed spec index as structured JSON (every spec's name, description, agents, tags, tokens). Use this BEFORE dispatching work to know what context is available.",
    inputSchema: {},
  },
  async () => {
    const all = loadAll();
    const total = all.reduce((sum, s) => sum + s.tokens, 0);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              spec_dir: SPEC_DIR,
              total_specs: all.length,
              total_tokens: total,
              specs: all.map((s) => ({
                name: s.name,
                description: s.description,
                agents: s.agents,
                tags: s.tags,
                tokens: s.tokens,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[adam-context-mcp] ready — spec dir: ${SPEC_DIR}`);
