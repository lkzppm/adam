#!/usr/bin/env node
// adam token-count MCP server
//
// Tools:
//   - count(path | text)   → tokens for a file or string
//   - count_many(paths)    → tokens for many files at once
//
// Uses gpt-tokenizer (cl100k_base) — pure JavaScript, no WASM, no network,
// no API key. Counts are within a few percent of Anthropic's own tokenizer
// for English prose and code; more than precise enough for "is this spec
// too big" / "what's the context budget" decisions.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { countTokens, ENCODING } from "../lib/tokens.js";

async function countPath(path) {
  const abs = resolve(path);
  const s = await stat(abs);
  if (!s.isFile()) throw new Error(`Not a file: ${path}`);
  const text = await readFile(abs, "utf8");
  return {
    path,
    bytes: s.size,
    chars: text.length,
    tokens: countTokens(text),
    encoding: ENCODING,
  };
}

const server = new Server(
  { name: "adam-token-count", version: "0.3.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "count",
      description:
        "Count tokens for a file path or for raw text using gpt-tokenizer's cl100k_base encoding. Returns {path|null, bytes|null, chars, tokens, encoding}. Pure-JS, fully offline, zero API calls. Within ~3-8% of Anthropic's tokenizer for English prose/code.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or working-directory-relative file path. Mutually exclusive with `text`." },
          text: { type: "string", description: "Raw text to count. Mutually exclusive with `path`." },
        },
      },
    },
    {
      name: "count_many",
      description:
        "Count tokens for multiple file paths in one call. Returns an array of {path, bytes, chars, tokens, encoding} entries; on error a per-entry {path, error} is returned in place.",
      inputSchema: {
        type: "object",
        properties: {
          paths: { type: "array", items: { type: "string" }, description: "List of file paths." },
        },
        required: ["paths"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "count") {
    if (args.path && args.text) throw new Error("Provide either `path` or `text`, not both.");
    if (!args.path && !args.text) throw new Error("Provide either `path` or `text`.");
    let result;
    if (args.path) {
      result = await countPath(args.path);
    } else {
      result = {
        path: null,
        bytes: null,
        chars: args.text.length,
        tokens: countTokens(args.text),
        encoding: ENCODING,
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "count_many") {
    if (!Array.isArray(args.paths)) throw new Error("`paths` must be an array.");
    const results = await Promise.all(
      args.paths.map(async (p) => {
        try { return await countPath(p); }
        catch (err) { return { path: p, error: err.message }; }
      }),
    );
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
