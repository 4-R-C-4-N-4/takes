/** Async long-lived Fairy-Stockfish UCI process driver (one process per worker, Threads=1). */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fsfPath } from '@takes/betza';

export interface SearchResult {
  bestmove: string | null;
  /** Last reported score (centipawns, from the side-to-move's perspective), if any. */
  scoreCp: number | null;
  mate: number | null;
}

export class FsfProcess {
  private proc: ChildProcessWithoutNullStreams;
  private rl: ReturnType<typeof createInterface>;
  private pending: Array<(line: string) => boolean> = [];
  private buffer: string[] = [];
  private closed = false;

  constructor(private readonly hashMb = 16) {
    const bin = fsfPath();
    if (!bin) throw new Error('Fairy-Stockfish not found (set FSF_PATH)');
    this.proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => this.onLine(line));
    this.proc.on('exit', () => { this.closed = true; });
  }

  private onLine(line: string): void {
    this.buffer.push(line);
  }

  private send(cmd: string): void {
    this.proc.stdin.write(cmd + '\n');
  }

  /** Sends cmd, then waits until a line matches `done`, collecting all lines seen in between. */
  private async waitFor(done: (line: string) => boolean, cmd?: string, timeoutMs = 30000): Promise<string[]> {
    this.buffer = [];
    if (cmd) this.send(cmd);
    const start = Date.now();
    while (!this.buffer.some(done)) {
      if (this.closed) throw new Error('fsf process closed unexpectedly');
      if (Date.now() - start > timeoutMs) throw new Error(`fsf timed out waiting for response to: ${cmd ?? '(none)'}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    return this.buffer;
  }

  private started = false;

  /** One-time UCI handshake + static options. Call setVariant() per game after this. */
  async start(): Promise<void> {
    if (this.started) return;
    await this.waitFor((l) => l.includes('uciok'), 'uci');
    this.send('setoption name UCI_Chess960 value true');
    this.send('setoption name Threads value 1');
    this.send(`setoption name Hash value ${this.hashMb}`);
    this.started = true;
  }

  /** Loads a (possibly per-game) variant ini. FSF accepts re-setting VariantPath/UCI_Variant
   * repeatedly within one process (verified empirically) — no process restart needed per game. */
  async setVariant(ini: string, variant: string): Promise<void> {
    await this.start();
    const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'fsf-'));
    const iniPath = join(dir, 'variants.ini');
    writeFileSync(iniPath, ini);
    this.send(`setoption name VariantPath value ${iniPath}`);
    this.send(`setoption name UCI_Variant value ${variant}`);
    await this.waitFor((l) => l.includes('readyok'), 'isready');
  }

  /** @deprecated kept for tests; delegates to start()+setVariant(). */
  async init(ini: string, variant: string): Promise<void> {
    await this.start();
    await this.setVariant(ini, variant);
  }

  async newGame(): Promise<void> {
    this.send('ucinewgame');
    await this.waitFor((l) => l.includes('readyok'), 'isready');
  }

  /** Sets the position and searches a fixed node budget. */
  async goNodes(fen: string, nodes: number): Promise<SearchResult> {
    const lines = await this.waitFor((l) => l.startsWith('bestmove'), `position fen ${fen}\ngo nodes ${nodes}`, 60000);
    let scoreCp: number | null = null;
    let mate: number | null = null;
    for (const l of lines) {
      const cpm = /score cp (-?\d+)/.exec(l);
      if (cpm) scoreCp = Number(cpm[1]);
      const mm = /score mate (-?\d+)/.exec(l);
      if (mm) mate = Number(mm[1]);
    }
    const bm = /^bestmove (\S+)/.exec(lines[lines.length - 1]!);
    return { bestmove: bm && bm[1] !== '(none)' ? bm[1]! : null, scoreCp, mate };
  }

  quit(): void {
    if (this.closed) return;
    try { this.send('quit'); } catch { /* ignore */ }
    this.proc.kill('SIGKILL');
    this.closed = true;
  }
}
