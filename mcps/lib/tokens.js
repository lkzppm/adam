// Shared token-counting helper for adam's MCP servers.
//
// Uses gpt-tokenizer (pure JS, no WASM, no network) with the cl100k_base
// encoding — the closest free approximation for Claude's tokenizer.
// In practice this is within ~3-8% of Anthropic's own count_tokens API for
// English prose and code, which is well inside the precision needed for
// "is this spec too big" decisions.
//
// All offline. Zero deps beyond gpt-tokenizer + the MCP SDK.

import { encode } from "gpt-tokenizer/encoding/cl100k_base";

export function countTokens(text) {
  return encode(text).length;
}

export const ENCODING = "cl100k_base";
