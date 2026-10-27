/** Server-side Fairy-Stockfish bot [DECISIONS D12]. One long-lived UCI process per server,
 * serialized request queue, timeout + restart on crash. Variant ini generated per-game. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Ruleset } from '@takes/library';
import { fsfPath, variantIni, variantName } from '@takes/betza';

export interface BotEngine {
  bestMove(fen: string, movesUci: string[], opts: { movetimeMs: number; skillLevel: number; variantIniPath: string; variantName: string }): Promise<string>;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_OPTS: Record<Difficulty, { skillLevel: number; movetimeMs: number }> = {
  easy: { skillLevel: 0, movetimeMs: 100 },
  medium: { skillLevel: 8, movetimeMs: 300 },
  hard: { skillLevel: 20, movetimeMs: 1000 },
};

interface PendingRequest {
  resolve: (uci: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/** Writes a per-game variant.ini (unique variant name per game so promotion/own-set works) and
 * returns {path, name}. */
export function writeGameVariantIni(ruleset: Ruleset, gameCode: string, promotion: { w: string[]; b: string[] }, startFen: string): { path: string; name: string } {
  const name = variantName(ruleset) + '_' + gameCode.toLowerCase();
  const ini = variantIni(ruleset, { name, promotion, startFen });
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'takes-fsf-'));
  const path = join(dir, 'variants.ini');
  writeFileSync(path, ini);
  return { path, name };
}

/** One long-lived Fairy-Stockfish process. Requests are serialized through a queue; a stuck or
 * crashed process is detected and restarted. */
export class FsfBot implements BotEngine {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = '';
  private queue: Array<() => void> = [];
  private busy = false;
  private pending: PendingRequest | null = null;
  private lastVariantSetup: string | null = null; // dedupe setoption calls

  static available(): boolean {
    return fsfPath() !== null;
  }

  private ensureProc(): ChildProcessWithoutNullStreams {
    if (this.proc && !this.proc.killed) return this.proc;
    const bin = fsfPath();
    if (!bin) throw new Error('Fairy-Stockfish binary not found (set FSF_PATH)');
    const proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = '';
    this.lastVariantSetup = null;
    proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
    proc.on('exit', () => {
      if (this.proc === proc) this.proc = null;
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        p.reject(new Error('fsf process exited'));
      }
    });
    this.proc = proc;
    return proc;
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (line.startsWith('bestmove') && this.pending) {
        const parts = line.split(/\s+/);
        const uci = parts[1] ?? '0000';
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        p.resolve(uci);
        this.drainQueue();
      }
    }
  }

  private drainQueue(): void {
    this.busy = false;
    const next = this.queue.shift();
    if (next) { this.busy = true; next(); }
  }

  async bestMove(fen: string, movesUci: string[], opts: { movetimeMs: number; skillLevel: number; variantIniPath: string; variantName: string }): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const run = () => {
        try {
          const proc = this.ensureProc();
          const setupKey = `${opts.variantIniPath}|${opts.variantName}`;
          const lines: string[] = [];
          if (this.lastVariantSetup !== setupKey) {
            lines.push(`setoption name VariantPath value ${opts.variantIniPath}`);
            lines.push(`setoption name UCI_Variant value ${opts.variantName}`);
            lines.push('setoption name UCI_Chess960 value true');
            this.lastVariantSetup = setupKey;
          }
          lines.push(`setoption name Skill Level value ${opts.skillLevel}`);
          const posLine = movesUci.length > 0
            ? `position fen ${fen} moves ${movesUci.join(' ')}`
            : `position fen ${fen}`;
          lines.push(posLine);
          lines.push(`go movetime ${opts.movetimeMs}`);
          const timeoutMs = opts.movetimeMs + 5000;
          const timer = setTimeout(() => {
            this.pending = null;
            try { proc.kill(); } catch { /* ignore */ }
            this.proc = null;
            reject(new Error('fsf bestmove timed out'));
            this.drainQueue();
          }, timeoutMs);
          this.pending = { resolve: (uci) => resolve(uci), reject, timer };
          proc.stdin.write(lines.join('\n') + '\n');
        } catch (e) {
          this.busy = false;
          reject(e instanceof Error ? e : new Error(String(e)));
          this.drainQueue();
        }
      };
      if (this.busy) this.queue.push(run);
      else { this.busy = true; run(); }
    });
  }

  dispose(): void {
    if (this.proc) {
      try { this.proc.stdin.write('quit\n'); } catch { /* ignore */ }
      try { this.proc.kill(); } catch { /* ignore */ }
      this.proc = null;
    }
  }
}
