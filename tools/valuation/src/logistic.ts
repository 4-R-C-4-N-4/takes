/** Logistic calibration: map a self-play score (0..1) to a material delta in pawns, and invert. */

export interface LogisticFit { a: number; b: number; }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Fits p = sigmoid(a + b*x) to (x, p) pairs via gradient descent on log-loss. Optional per-point
 * weights (e.g. game counts) downweight noisy low-n anchors relative to well-sampled ones. */
export function fitLogistic(xs: number[], ps: number[], iters = 4000, lr = 0.05, weights?: number[]): LogisticFit {
  if (xs.length !== ps.length || xs.length < 2) throw new Error('need >= 2 points to fit');
  if (xs.some((x) => !Number.isFinite(x)) || new Set(xs).size < 2 || ps.some((p) => !Number.isFinite(p) || p < 0 || p > 1)) throw new Error('invalid calibration points');
  if (weights && (weights.length !== xs.length || weights.some((w) => !Number.isFinite(w) || w < 0))) throw new Error('invalid calibration weights');
  let a = 0;
  let b = 0.5;
  const n = xs.length;
  const w = weights ?? xs.map(() => 1);
  const wSum = w.reduce((s, x) => s + x, 0);
  if (wSum <= 0) throw new Error('no scored calibration games');
  for (let it = 0; it < iters; it++) {
    let ga = 0;
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i]!;
      const p = clamp(ps[i]!, 1e-6, 1 - 1e-6);
      const pred = 1 / (1 + Math.exp(-(a + b * x)));
      const err = (pred - p) * w[i]!;
      ga += err;
      gb += err * x;
    }
    a -= (lr * ga) / wSum;
    b -= (lr * gb) / wSum;
  }
  return { a, b };
}

export function sigmoid(a: number, b: number, x: number): number { return 1 / (1 + Math.exp(-(a + b * x))); }

/** Inverts the fitted curve: given an observed score p, returns the implied material delta x in pawns. */
export function invertLogistic(fit: LogisticFit, p: number): number {
  if (!Number.isFinite(fit.a) || !Number.isFinite(fit.b) || fit.b <= 1e-6) throw new Error('calibration slope must be finite and positive');
  const pc = clamp(p, 1e-6, 1 - 1e-6);
  const logit = Math.log(pc / (1 - pc));
  return (logit - fit.a) / fit.b;
}

/** Inverts and clamps to the calibrated anchor range [lo, hi] (in delta-pawns); reports whether the
 * raw inversion fell outside that range (extrapolation is unreliable — report, don't trust the number). */
export function invertLogisticClamped(fit: LogisticFit, p: number, rangeLo: number, rangeHi: number): { value: number; raw: number; outOfRange: boolean } {
  const raw = invertLogistic(fit, p);
  const value = clamp(raw, rangeLo, rangeHi);
  return { value, raw, outOfRange: raw < rangeLo || raw > rangeHi };
}

/** Approximate binomial Wilson half-width (draw scores are fractional, not Bernoulli) for score p = (W + D/2) / N. */
export function scoreWithCi(wins: number, draws: number, losses: number): { p: number; ciHalfWidth: number } {
  const n = wins + draws + losses;
  const p = (wins + draws / 2) / n;
  if (n === 0) return { p: 0.5, ciHalfWidth: 1 };
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const lo = (center - margin) / denom;
  const hi = (center + margin) / denom;
  return { p, ciHalfWidth: (hi - lo) / 2 };
}

/** Nominal iid-game bootstrap range conditional on a fixed calibration. This is not a joint
 * calibration-and-opening confidence interval; repeated openings and paired games violate iid sampling.
 * Clamps to [rangeLo, rangeHi] when given, reporting out-of-range extrapolation via `outOfRange`. */
export function bootstrapValueCi(
  outcomes: Array<-1 | 0 | 1>,
  fit: LogisticFit,
  refValuePawns: number,
  samples = 2000,
  seed = 1,
  range?: { lo: number; hi: number },
): { estimate: number; lo: number; hi: number; raw: number; outOfRange: boolean } {
  if (!outcomes.length) throw new Error('no scored games');
  if (samples < 40) throw new Error('need at least 40 bootstrap samples');
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const scoreOf = (xs: Array<-1 | 0 | 1>) => {
    const wins = xs.filter((v) => v === 1).length;
    const draws = xs.filter((v) => v === 0).length;
    const losses = xs.filter((v) => v === -1).length;
    const n = wins + draws + losses;
    return n === 0 ? 0.5 : (wins + draws / 2) / n;
  };
  const invert = (p: number) => (range ? invertLogisticClamped(fit, p, range.lo, range.hi) : { value: invertLogistic(fit, p), raw: invertLogistic(fit, p), outOfRange: false });
  const atPoint = invert(scoreOf(outcomes));
  const point = refValuePawns + atPoint.value;
  const n = outcomes.length;
  const ests: number[] = [];
  for (let i = 0; i < samples; i++) {
    const resample: Array<-1 | 0 | 1> = [];
    for (let j = 0; j < n; j++) resample.push(outcomes[Math.floor(rand() * n)]!);
    ests.push(refValuePawns + invert(scoreOf(resample)).value);
  }
  ests.sort((x, y) => x - y);
  const lo = ests[Math.floor(0.025 * ests.length)]!;
  const hi = ests[Math.min(ests.length - 1, Math.floor(0.975 * ests.length))]!;
  return { estimate: point, lo, hi, raw: refValuePawns + atPoint.raw, outOfRange: atPoint.outOfRange };
}
