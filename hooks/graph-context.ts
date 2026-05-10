#!/usr/bin/env node
/**
 * adam — graph re-index hook
 *
 * PostToolUse on Edit|Write|MultiEdit — kicks off a detached
 * `gitnexus analyze --skip-git` so the next graph query reads a
 * working-tree-current index. Fire-and-forget; the agent isn't
 * notified, so we never inject "graph is stale" noise into the chat.
 *
 * Bails silently if there's no `.gitnexus/` index — adam degrades to
 * spec-only mode and Claude works off the static spec content.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";

interface HookInput {
  hook_event_name?: string;
  tool_name?: string;
  cwd?: string;
}

interface GraphRoot {
  gitNexusDir: string;
  repoRoot: string;
}

function readInput(): HookInput {
  try {
    return JSON.parse(fs.readFileSync(0, "utf-8")) as HookInput;
  } catch {
    return {};
  }
}

function isGlobalRegistryDir(candidate: string): boolean {
  if (fs.existsSync(path.join(candidate, "meta.json"))) return false;
  return (
    fs.existsSync(path.join(candidate, "registry.json")) ||
    fs.existsSync(path.join(candidate, "repos"))
  );
}

function findGitNexusRoot(startDir: string): GraphRoot | null {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, ".gitnexus");
    if (fs.existsSync(candidate) && !isGlobalRegistryDir(candidate)) {
      return { gitNexusDir: candidate, repoRoot: dir };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function gitnexusOnPath(): boolean {
  const isWin = process.platform === "win32";
  const which = spawnSync(isWin ? "where" : "which", ["gitnexus"], {
    encoding: "utf-8",
    timeout: 3000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return which.status === 0;
}

function handlePostToolUse(input: HookInput): void {
  const tool = input.tool_name ?? "";
  if (!/^(Edit|Write|MultiEdit)$/.test(tool)) return;

  const cwd = input.cwd ?? process.cwd();
  if (!path.isAbsolute(cwd)) return;
  const found = findGitNexusRoot(cwd);
  if (!found) return;

  // Lockfile guard: skip if another analyze is already running. GitNexus's
  // LadybugDB is single-writer; concurrent analyze calls collide on the WAL.
  // The user's next prompt still gets a fresh-enough graph because the
  // already-running analyze will finish well before any human-paced prompt.
  const lockPath = path.join(found.gitNexusDir, ".analyze.lock");
  try {
    const lockStat = fs.existsSync(lockPath) ? fs.statSync(lockPath) : null;
    // Treat stale locks (>2 min old) as crashed runs and proceed anyway.
    if (lockStat && Date.now() - lockStat.mtimeMs < 120000) return;
    fs.writeFileSync(lockPath, String(process.pid));
  } catch {
    /* couldn't write lock — best-effort, proceed without */
  }

  // Mark stale so external tools (or a future SessionStart hook) can tell
  // the graph isn't current. The detached analyze below will clear .stale
  // when it succeeds (by overwriting meta.json's lastIndexed).
  try {
    fs.writeFileSync(path.join(found.gitNexusDir, ".stale"), new Date().toISOString());
  } catch {
    /* ignore */
  }

  // Detached re-index — agent never blocks on this.
  try {
    const isWin = process.platform === "win32";
    const onPath = gitnexusOnPath();
    const cmd = onPath ? (isWin ? "gitnexus.cmd" : "gitnexus") : isWin ? "npx.cmd" : "npx";
    const args = onPath ? ["analyze", "--skip-git"] : ["-y", "gitnexus", "analyze", "--skip-git"];
    const child = spawn(cmd, args, {
      cwd: found.repoRoot,
      detached: true,
      stdio: "ignore",
    });
    child.on("exit", () => {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    });
    child.unref();
  } catch {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

try {
  const input = readInput();
  if (input.hook_event_name === "PostToolUse") handlePostToolUse(input);
} catch (err) {
  if (process.env["ADAM_HOOK_DEBUG"]) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("adam hook error:", message.slice(0, 200));
  }
}
