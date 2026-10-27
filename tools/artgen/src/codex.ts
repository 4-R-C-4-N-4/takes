// Codex image-gen invocation. One call at a time, never parallel; verified
// pattern from the task brief. Caches raw PNGs under .artgen-cache/ so runs
// are resumable (skips pieces whose cached PNG already exists).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface CodexGenOpts {
  /** Repo/worktree root (must be a git work dir; codex runs with cwd inside it). */
  repoRoot: string;
  /** Piece id, used for cache + output file naming. */
  id: string;
  /** Attempt number (1-based), appended to the cache filename so retries don't clobber. */
  attempt: number;
  /** Full prompt text. */
  prompt: string;
  /** Directory (relative to repoRoot) to cache raw PNGs in; gitignored. */
  cacheDir?: string;
  timeoutSec?: number;
}

export interface CodexGenResult {
  pngPath: string; // absolute path to the cached raw PNG
  fromCache: boolean;
}

/** Run one codex image-gen call for a piece, or reuse a cached result. */
export async function generatePieceImage(opts: CodexGenOpts): Promise<CodexGenResult> {
  const cacheDir = opts.cacheDir ?? '.artgen-cache';
  const absCacheDir = path.join(opts.repoRoot, cacheDir);
  mkdirSync(absCacheDir, { recursive: true });
  const cachedPng = path.join(absCacheDir, `${opts.id}-${opts.attempt}.png`);

  if (existsSync(cachedPng)) {
    return { pngPath: cachedPng, fromCache: true };
  }

  const relPng = path.relative(opts.repoRoot, cachedPng);
  const runDir = path.join(absCacheDir, `${opts.id}-${opts.attempt}-run`);
  mkdirSync(runDir, { recursive: true });
  const lastTxt = path.join(runDir, 'last.txt');
  const eventsJsonl = path.join(runDir, 'events.jsonl');
  const errTxt = path.join(runDir, 'err.txt');

  const callStart = Date.now();
  const instructions =
    `Use your image generation tool to create ONE image: ${opts.prompt} ` +
    `Save the resulting PNG into ${path.dirname(relPng)} as ${path.basename(relPng)} ` +
    `(copy it from wherever the tool writes it). Then run: file ${relPng}.`;

  const timeout = opts.timeoutSec ?? 300;
  const cmd =
    `timeout ${timeout} codex exec --sandbox workspace-write --json -o ${shq(lastTxt)} ` +
    `${shq(instructions)} > ${shq(eventsJsonl)} 2> ${shq(errTxt)} < /dev/null`;

  try {
    execSync(cmd, { cwd: opts.repoRoot, shell: '/bin/bash', stdio: 'inherit' });
  } catch {
    // fall through to fallback discovery below; codex exec may exit non-zero
    // even on partial success, or timeout.
  }

  if (existsSync(cachedPng)) {
    return { pngPath: cachedPng, fromCache: false };
  }

  // Fallback: newest file under ~/.codex/generated_images/*/ with mtime >= callStart.
  const genDir = path.join(os.homedir(), '.codex', 'generated_images');
  const found = findNewestImage(genDir, callStart);
  if (found) {
    const { copyFileSync } = await import('node:fs');
    copyFileSync(found, cachedPng);
    return { pngPath: cachedPng, fromCache: false };
  }

  throw new Error(`codex image gen failed for ${opts.id} attempt ${opts.attempt}: no output PNG found (see ${runDir})`);
}

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function findNewestImage(dir: string, sinceMs: number): string | null {
  if (!existsSync(dir)) return null;
  let best: { file: string; mtime: number } | null = null;
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(png|jpg|jpeg)$/i.test(entry.name)) {
        const st = statSync(full);
        if (st.mtimeMs >= sinceMs - 1000 && (!best || st.mtimeMs > best.mtime)) {
          best = { file: full, mtime: st.mtimeMs };
        }
      }
    }
  };
  walk(dir);
  return best ? (best as { file: string }).file : null;
}
