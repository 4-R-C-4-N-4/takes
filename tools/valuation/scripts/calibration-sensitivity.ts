/** Leave-one-anchor-opening-out sensitivity, NOT a calibration confidence interval. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitLogistic, invertLogistic } from '../src/logistic.js';
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/valuation/recovery');
const calibration = JSON.parse(readFileSync(resolve(dir, 'calibration.json'), 'utf8'));
const trials = calibration.trials as { label: string; deltaPawns: number; result: number; excluded: boolean }[];
const fits = [...new Set(trials.map((t) => t.label))].map((omit) => {
  const buckets = new Map<number, number[]>();
  for (const trial of trials) {
    if (trial.label === omit || trial.excluded) continue;
    const list = buckets.get(trial.deltaPawns) ?? [];
    list.push((trial.result + 1) / 2);
    buckets.set(trial.deltaPawns, list);
  }
  const entries = [...buckets];
  return { omittedAnchor: omit, fit: fitLogistic(entries.map(([x]) => x), entries.map(([, scores]) => scores.reduce((s, x) => s + x, 0) / scores.length), 4000, 0.05, entries.map(([, scores]) => scores.length)) };
});
const rows = readdirSync(dir).filter((file) => file.endsWith('.json')).map((source) => ({ source, data: JSON.parse(readFileSync(resolve(dir, source), 'utf8')) })).filter(({ data }) => data.iterations).map(({ source, data: d }) => {
  const it = d.iterations.at(-1);
  const p = (it.wins + it.draws / 2) / it.games;
  const values = fits.map(({ fit }) => d.referenceValuePawns + invertLogistic(fit, p) / d.sameTierCount);
  return { source, point: d.finalEstimate, min: Math.min(...values), max: Math.max(...values) };
});
writeFileSync(resolve(dir, 'calibration-sensitivity.json'), JSON.stringify({ scope: 'leave-one-fixed-opening-anchor-out model sensitivity at fixed observed target score; not a CI, not an uncertainty bound', fits, rows }, null, 2) + '\n');
console.log(JSON.stringify(rows, null, 2));
