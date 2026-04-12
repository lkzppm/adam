import { build } from "esbuild";
import { rmSync, mkdirSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

const common = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  legalComments: "none",
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'module';\nconst require = createRequire(import.meta.url);",
  },
};

await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/index.js" });
await build({ ...common, entryPoints: ["src/reindex.ts"], outfile: "dist/reindex.js" });

console.log("built dist/index.js + dist/reindex.js");
