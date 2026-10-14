// Statistics behind the reliability lab. Pure functions with no dependencies so every number on screen can be
// recomputed; tests/reliability-stats.test.mjs checks them against lifelines/scipy results for the same inputs.
// Times are calendar days unless a caller says otherwise.

export const Z95 = 1.959963984540054; // standard normal 97.5 % quantile

// ── Special functions ────────────────────────────────────────────────────────────────────────────────────────
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1; let a = LANCZOS[0]; const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized lower incomplete gamma P(a, x): series below a + 1, continued fraction above (Numerical Recipes).
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const front = Math.exp(-x + a * Math.log(x) - lnGamma(a));
  if (x < a + 1) {
    let ap = a; let sum = 1 / a; let del = sum;
    for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
    return Math.min(1, sum * front);
  }
  const tiny = 1e-300;
  let b = x + 1 - a; let c = 1 / tiny; let d = 1 / b; let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.max(0, 1 - front * h);
}
export const chi2Cdf = (x: number, k: number) => gammaP(k / 2, x / 2);
export const chi2Sf = (x: number, k: number) => (x <= 0 ? 1 : 1 - chi2Cdf(x, k));
export function chi2Inv(p: number, k: number): number {
  if (p <= 0) return 0;
  let low = 0; let high = Math.max(10, k * 10);
  while (chi2Cdf(high, k) < p) high *= 2;
  for (let i = 0; i < 200; i++) { const mid = (low + high) / 2; if (chi2Cdf(mid, k) < p) low = mid; else high = mid; }
  return (low + high) / 2;
}
const erf = (x: number) => Math.sign(x) * gammaP(0.5, x * x);
export const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
export const normSf2 = (z: number) => chi2Sf(z * z, 1); // two-sided p for a standard normal statistic

// ── Random numbers (seeded, so permutation tests and simulations are reproducible) ──────────────────────────
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function normalSample(random: () => number) {
  const u = Math.max(random(), 1e-12); const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// Marsaglia–Tsang; shape < 1 uses the boost x·U^(1/shape).
export function gammaSample(shape: number, random: () => number): number {
  if (shape < 1) return gammaSample(shape + 1, random) * Math.pow(Math.max(random(), 1e-12), 1 / shape);
  const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number; let v: number;
    do { x = normalSample(random); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = random();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// ── Proportions ──────────────────────────────────────────────────────────────────────────────────────────────
export interface Proportion { k: number; n: number; p: number; low: number; high: number }
export function wilson(k: number, n: number, z = Z95): Proportion | null {
  if (!n) return null;
  const p = k / n; const z2 = z * z; const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denominator;
  return { k, n, p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}
// Newcombe's hybrid score interval for p1 − p2 (method 10), built from the two Wilson intervals.
export function riskDifference(a: Proportion, b: Proportion) {
  const d = a.p - b.p;
  return { d, low: d - Math.sqrt((a.p - a.low) ** 2 + (b.high - b.p) ** 2), high: d + Math.sqrt((a.high - a.p) ** 2 + (b.p - b.low) ** 2) };
}
// Fisher's exact test, two-sided (sum of tables no more probable than the observed one), for [[a, b], [c, d]].
export function fisherExact(a: number, b: number, c: number, d: number) {
  const r1 = a + b; const r2 = c + d; const c1 = a + c; const n = r1 + r2;
  const lnChoose = (m: number, k: number) => lnGamma(m + 1) - lnGamma(k + 1) - lnGamma(m - k + 1);
  const prob = (x: number) => Math.exp(lnChoose(r1, x) + lnChoose(r2, c1 - x) - lnChoose(n, c1));
  const observed = prob(a); let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const q = prob(x); if (q <= observed * (1 + 1e-7)) p += q; }
  return Math.min(1, p);
}

// ── Rates (events per unit of exposure) ─────────────────────────────────────────────────────────────────────
export interface Rate { events: number; exposure: number; rate: number; low: number; high: number }
// Exact (Garwood) Poisson interval.
export function poissonRate(events: number, exposure: number): Rate | null {
  if (!(exposure > 0)) return null;
  const low = events === 0 ? 0 : chi2Inv(0.025, 2 * events) / 2;
  const high = chi2Inv(0.975, 2 * events + 2) / 2;
  return { events, exposure, rate: events / exposure, low: low / exposure, high: high / exposure };
}
export interface Ratio { ratio: number; low: number; high: number; p: number; corrected: boolean }
// Wald interval on the log scale; a zero count gets the 0.5 correction and is flagged.
export function rateRatio(a: number, ta: number, b: number, tb: number): Ratio | null {
  if (!(ta > 0) || !(tb > 0) || a + b === 0) return null;
  const corrected = a === 0 || b === 0;
  const x = corrected ? a + 0.5 : a; const y = corrected ? b + 0.5 : b;
  const ratio = (x / ta) / (y / tb); const se = Math.sqrt(1 / x + 1 / y);
  return { ratio, low: ratio * Math.exp(-Z95 * se), high: ratio * Math.exp(Z95 * se), p: normSf2(Math.log(ratio) / se), corrected };
}
export interface Stratum { a: number; ta: number; b: number; tb: number }
// Mantel–Haenszel rate ratio across strata with the Greenland–Robins variance (person-time data).
export function mantelHaenszelRate(strata: Stratum[]): Ratio | null {
  let num = 0; let den = 0; let variance = 0;
  for (const s of strata) {
    const t = s.ta + s.tb; if (!(s.ta > 0) || !(s.tb > 0)) continue;
    num += (s.a * s.tb) / t; den += (s.b * s.ta) / t; variance += ((s.a + s.b) * s.ta * s.tb) / (t * t);
  }
  if (!(num > 0) || !(den > 0)) return null;
  const ratio = num / den; const se = Math.sqrt(variance / (num * den));
  return { ratio, low: ratio * Math.exp(-Z95 * se), high: ratio * Math.exp(Z95 * se), p: normSf2(Math.log(ratio) / se), corrected: false };
}
export interface ExposureUnit { events: number; exposure: number; stratum?: string }
// Units are resampled whole (cluster bootstrap): repeated failures of one analyzer cannot fake precision.
export function bootstrapRateRatio(groupA: ExposureUnit[], groupB: ExposureUnit[], replicates = 2000, seed = 20261013) {
  if (!groupA.length || !groupB.length) return null;
  const random = seededRandom(seed); const values: number[] = [];
  const draw = (units: ExposureUnit[]) => { let e = 0; let t = 0; for (let i = 0; i < units.length; i++) { const u = units[Math.floor(random() * units.length)]; e += u.events; t += u.exposure; } return [e, t]; };
  for (let r = 0; r < replicates; r++) {
    const [ea, ta] = draw(groupA); const [eb, tb] = draw(groupB);
    if (ta > 0 && tb > 0 && eb > 0 && ea > 0) values.push((ea / ta) / (eb / tb));
  }
  if (values.length < replicates * 0.9) return null; // too many degenerate resamples to be honest about
  values.sort((x, y) => x - y);
  return { low: values[Math.floor(values.length * 0.025)], high: values[Math.min(values.length - 1, Math.floor(values.length * 0.975))], replicates: values.length };
}
// Within-stratum permutation of the group label (unit level); one-sided toward "A worse" when greater = true.
export function permutationRateRatio(units: Array<ExposureUnit & { group: boolean }>, permutations = 4000, seed = 20261013, greater = true) {
  const strata = [...new Set(units.map(u => u.stratum || ''))];
  const index = strata.map(s => units.map((u, i) => (u.stratum || '') === s ? i : -1).filter(i => i >= 0));
  const statistic = (labels: boolean[]) => mantelHaenszelRate(index.map(ids => {
    const s = { a: 0, ta: 0, b: 0, tb: 0 };
    for (const i of ids) { if (labels[i]) { s.a += units[i].events; s.ta += units[i].exposure; } else { s.b += units[i].events; s.tb += units[i].exposure; } }
    return s;
  }))?.ratio ?? null;
  const observed = statistic(units.map(u => u.group));
  if (observed === null) return null;
  const random = seededRandom(seed); let extreme = 0; let valid = 0;
  for (let r = 0; r < permutations; r++) {
    const labels = units.map(u => u.group);
    for (const ids of index) for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [labels[ids[i]], labels[ids[j]]] = [labels[ids[j]], labels[ids[i]]]; }
    const value = statistic(labels); if (value === null) continue;
    valid++; if (greater ? value >= observed - 1e-12 : value <= observed + 1e-12) extreme++;
  }
  return valid ? { observed, p: (extreme + 1) / (valid + 1), permutations: valid } : null;
}

// ── Survival ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface SurvivalItem { t: number; event: boolean; group?: number; stratum?: string; x?: number[] }
export interface KmStep { t: number; s: number; low: number; high: number; atRisk: number; events: number }
export interface KmCurve { n: number; events: number; maxT: number; steps: KmStep[]; censored: number[] }
// Kaplan–Meier with Greenwood variance and log(−log) 95 % limits (lifelines' default). Events at t precede
// censorings at t. The curve ends at the last observed time: it is never extrapolated.
export function kaplanMeier(items: SurvivalItem[]): KmCurve {
  const sorted = [...items].sort((a, b) => a.t - b.t || Number(b.event) - Number(a.event));
  const steps: KmStep[] = [{ t: 0, s: 1, low: 1, high: 1, atRisk: sorted.length, events: 0 }];
  let s = 1; let greenwood = 0; let i = 0;
  while (i < sorted.length) {
    const t = sorted[i].t; const atRisk = sorted.length - i; let d = 0; let j = i;
    while (j < sorted.length && sorted[j].t === t) { if (sorted[j].event) d++; j++; }
    if (d > 0) {
      s *= 1 - d / atRisk;
      greenwood += atRisk > d ? d / (atRisk * (atRisk - d)) : 0;
      let low = s; let high = s;
      if (s > 0 && s < 1) {
        const se = Math.sqrt(greenwood) / Math.abs(Math.log(s));
        low = Math.pow(s, Math.exp(Z95 * se)); high = Math.pow(s, Math.exp(-Z95 * se));
      }
      if (t === 0) steps[0] = { t: 0, s, low, high, atRisk, events: d };
      else steps.push({ t, s, low, high, atRisk, events: d });
    }
    i = j;
  }
  return { n: sorted.length, events: sorted.filter(item => item.event).length, maxT: sorted.length ? sorted[sorted.length - 1].t : 0, steps,
    censored: sorted.filter(item => !item.event).map(item => item.t) };
}
// S(t) only inside the observed range; beyond the last follow-up there is no defensible estimate.
export function survivalAt(curve: KmCurve, t: number): KmStep | null {
  if (!curve.n || t > curve.maxT) return null;
  let found = curve.steps[0];
  for (const step of curve.steps) { if (step.t <= t) found = step; else break; }
  return found;
}
export const atRiskAt = (items: SurvivalItem[], t: number) => items.filter(item => item.t >= t).length;
export function medianSurvival(curve: KmCurve) {
  const step = curve.steps.find(s => s.s <= 0.5);
  return step ? step.t : null;
}

// Log-rank (two groups: group 1 vs 0), optionally stratified (sums O−E and V over strata).
export function logRank(items: SurvivalItem[]) {
  const strata = [...new Set(items.map(item => item.stratum || ''))];
  let observed1 = 0; let expected1 = 0; let variance = 0; let observed0 = 0; let expected0 = 0;
  for (const stratum of strata) {
    const rows = items.filter(item => (item.stratum || '') === stratum);
    const times = [...new Set(rows.filter(r => r.event).map(r => r.t))].sort((a, b) => a - b);
    for (const t of times) {
      const atRisk = rows.filter(r => r.t >= t); const n = atRisk.length; const n1 = atRisk.filter(r => r.group === 1).length;
      const deaths = rows.filter(r => r.t === t && r.event); const d = deaths.length; const d1 = deaths.filter(r => r.group === 1).length;
      observed1 += d1; expected1 += (d * n1) / n; observed0 += d - d1; expected0 += (d * (n - n1)) / n;
      if (n > 1) variance += (d * (n1 / n) * (1 - n1 / n) * (n - d)) / (n - 1);
    }
  }
  if (!(variance > 0)) return null;
  const chi2 = (observed1 - expected1) ** 2 / variance;
  return { observed1, expected1, observed0, expected0, chi2, p: chi2Sf(chi2, 1), strata: strata.length };
}

// Cox proportional hazards, Efron ties, optional strata (separate baseline per stratum), Newton–Raphson.
export interface CoxFit { beta: number[]; se: number[]; hr: number[]; low: number[]; high: number[]; p: number[]; logLik: number; iterations: number; converged: boolean; events: number }
const solve = (matrix: number[][], vector: number[]) => {
  const n = vector.length; const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col; for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r++) if (r !== col) { const f = a[r][col] / a[col][col]; for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c]; }
  }
  return a.map((row, i) => row[n] / a[i][i]);
};
const invert = (matrix: number[][]) => matrix.map((_, i) => solve(matrix, matrix.map((__, j) => (i === j ? 1 : 0))));
export function coxPH(items: SurvivalItem[], maxIterations = 50): CoxFit | null {
  const p = items[0]?.x?.length || 0; const events = items.filter(i => i.event).length;
  if (!p || events === 0) return null;
  const strata = [...new Set(items.map(item => item.stratum || ''))].map(s => items.filter(item => (item.stratum || '') === s).sort((a, b) => b.t - a.t));
  const evaluate = (beta: number[]) => {
    let logLik = 0; const gradient = new Array(p).fill(0); const info = Array.from({ length: p }, () => new Array(p).fill(0));
    for (const rows of strata) {
      // Descending time: the risk set grows as we walk; ties share the same risk set.
      let s0 = 0; const s1 = new Array(p).fill(0); const s2 = Array.from({ length: p }, () => new Array(p).fill(0));
      let i = 0;
      while (i < rows.length) {
        const t = rows[i].t; let j = i; const deaths: SurvivalItem[] = [];
        while (j < rows.length && rows[j].t === t) {
          const x = rows[j].x!; const w = Math.exp(x.reduce((sum, v, k) => sum + v * beta[k], 0));
          s0 += w; for (let a = 0; a < p; a++) { s1[a] += w * x[a]; for (let b = 0; b < p; b++) s2[a][b] += w * x[a] * x[b]; }
          if (rows[j].event) deaths.push(rows[j]); j++;
        }
        const d = deaths.length;
        if (d) {
          // Efron: the tied deaths leave the risk set gradually (same handling as R survival and lifelines).
          let d0 = 0; const d1 = new Array(p).fill(0); const d2 = Array.from({ length: p }, () => new Array(p).fill(0));
          for (const death of deaths) {
            const x = death.x!; const w = Math.exp(x.reduce((sum, v, k) => sum + v * beta[k], 0));
            logLik += x.reduce((sum, v, k) => sum + v * beta[k], 0);
            d0 += w; for (let a = 0; a < p; a++) { gradient[a] += x[a]; d1[a] += w * x[a]; for (let b = 0; b < p; b++) d2[a][b] += w * x[a] * x[b]; }
          }
          for (let l = 0; l < d; l++) {
            const f = l / d; const e0 = s0 - f * d0; const e1 = s1.map((v, a) => v - f * d1[a]);
            logLik -= Math.log(e0);
            for (let a = 0; a < p; a++) { gradient[a] -= e1[a] / e0; for (let b = 0; b < p; b++) info[a][b] += (s2[a][b] - f * d2[a][b]) / e0 - (e1[a] * e1[b]) / (e0 * e0); }
          }
        }
        i = j;
      }
    }
    return { logLik, gradient, info };
  };
  let beta = new Array(p).fill(0); let current = evaluate(beta); let iterations = 0; let converged = false;
  for (; iterations < maxIterations; iterations++) {
    const step = solve(current.info, current.gradient); if (!step) return null;
    let factor = 1; let next = beta.map((b, k) => b + step[k]); let candidate = evaluate(next);
    while (candidate.logLik < current.logLik - 1e-10 && factor > 1e-4) { factor /= 2; next = beta.map((b, k) => b + factor * step[k]); candidate = evaluate(next); }
    const change = Math.max(...step.map(s => Math.abs(s * factor)));
    beta = next; current = candidate;
    if (change < 1e-8) { converged = true; break; }
  }
  if (beta.some(b => !Number.isFinite(b) || Math.abs(b) > 15)) return null; // monotone likelihood (separation): no finite estimate
  const covariance = invert(current.info); if (covariance.some(row => !row)) return null;
  const se = covariance.map((row, k) => Math.sqrt(row![k]));
  return { beta, se, hr: beta.map(Math.exp), low: beta.map((b, k) => Math.exp(b - Z95 * se[k])), high: beta.map((b, k) => Math.exp(b + Z95 * se[k])),
    p: beta.map((b, k) => normSf2(b / se[k])), logLik: current.logLik, iterations: iterations + 1, converged, events };
}

// Weibull for the time to FIRST failure (right-censored). η is profiled out; β is found on the score equation and
// its 95 % interval is the likelihood-ratio interval. Time 0 (failure on delivery day) is taken as half a day.
export interface WeibullFit { beta: number; eta: number; betaLow: number | null; betaHigh: number | null; pExponential: number; logLik: number; events: number; n: number; maxGap: number; insideBand: number }
export function weibull(items: SurvivalItem[]): WeibullFit | null {
  const rows = items.map(item => ({ t: Math.max(item.t, 0.5), event: item.event }));
  const r = rows.filter(row => row.event).length; if (r < 2) return null;
  const sumLogEvents = rows.filter(row => row.event).reduce((sum, row) => sum + Math.log(row.t), 0);
  const profile = (beta: number) => {
    const sum = rows.reduce((acc, row) => acc + Math.pow(row.t, beta), 0);
    return r * Math.log(beta) - r * Math.log(sum / r) + (beta - 1) * sumLogEvents - r;
  };
  const score = (beta: number) => {
    let sum = 0; let sumLog = 0;
    for (const row of rows) { const v = Math.pow(row.t, beta); sum += v; sumLog += v * Math.log(row.t); }
    return r / beta + sumLogEvents - (r * sumLog) / sum;
  };
  let low = 0.01; let high = 50;
  if (score(low) < 0 || score(high) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = Math.sqrt(low * high); if (score(mid) > 0) low = mid; else high = mid; }
  const beta = Math.sqrt(low * high); const best = profile(beta);
  const eta = Math.pow(rows.reduce((acc, row) => acc + Math.pow(row.t, beta), 0) / r, 1 / beta);
  const bound = (from: number, to: number) => {
    if (2 * (best - profile(to)) < 3.841459) return null;
    let a = from; let b = to;
    for (let i = 0; i < 200; i++) { const mid = Math.sqrt(a * b); if (2 * (best - profile(mid)) < 3.841459) a = mid; else b = mid; }
    return Math.sqrt(a * b);
  };
  // Goodness of fit: distance between the fitted curve and Kaplan–Meier at each event time, and share of
  // event times where the fit stays inside the KM 95 % band.
  const km = kaplanMeier(items); let maxGap = 0; let inside = 0; let checked = 0;
  for (const step of km.steps.slice(1)) {
    const fitted = Math.exp(-Math.pow(Math.max(step.t, 0.5) / eta, beta));
    maxGap = Math.max(maxGap, Math.abs(fitted - step.s)); checked++;
    if (fitted >= step.low - 1e-9 && fitted <= step.high + 1e-9) inside++;
  }
  return { beta, eta, betaLow: bound(beta, 0.01), betaHigh: bound(beta, 50), pExponential: chi2Sf(2 * (best - profile(1)), 1), logLik: best + 0,
    events: r, n: rows.length, maxGap, insideBand: checked ? inside / checked : 1 };
}

// Mean cumulative function for recurrent failures (Nelson): at each failure time the jump is failures / units
// still observed. Truncated where fewer than minAtRisk units remain, so the tail never rests on one or two units.
export interface RecurrentUnit { events: number[]; exposure: number }
export function meanCumulative(units: RecurrentUnit[], minAtRisk = 5) {
  const times = [...new Set(units.flatMap(u => u.events))].sort((a, b) => a - b);
  const points: Array<[number, number]> = [[0, 0]]; let mcf = 0;
  const limit = [...units].map(u => u.exposure).sort((a, b) => b - a)[minAtRisk - 1] ?? 0;
  for (const t of times) {
    if (t > limit) break;
    const atRisk = units.filter(u => u.exposure >= t).length; if (atRisk < minAtRisk) break;
    const d = units.reduce((sum, u) => sum + u.events.filter(e => e === t).length, 0);
    mcf += d / atRisk; points.push([t, mcf]);
  }
  return { points, limit };
}
export function bootstrapMeanCumulative(units: RecurrentUnit[], at: number[], replicates = 400, seed = 7, minAtRisk = 5) {
  if (units.length < minAtRisk) return null;
  const random = seededRandom(seed); const values = at.map(() => [] as number[]);
  for (let r = 0; r < replicates; r++) {
    const sample = units.map(() => units[Math.floor(random() * units.length)]);
    const curve = meanCumulative(sample, minAtRisk).points;
    at.forEach((t, k) => { let v = 0; for (const [x, y] of curve) { if (x <= t) v = y; else break; } values[k].push(v); });
  }
  return at.map((t, k) => { const sorted = values[k].sort((a, b) => a - b); return { t, low: sorted[Math.floor(sorted.length * 0.025)], high: sorted[Math.floor(sorted.length * 0.975)] }; });
}

export function quantile(values: number[], q: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const position = (sorted.length - 1) * q;
  const base = Math.floor(position); const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}
export function spearman(x: number[], y: number[]) {
  const n = x.length; if (n < 3) return null;
  const rank = (v: number[]) => { const order = v.map((value, i) => [value, i]).sort((a, b) => a[0] - b[0]); const ranks = new Array(n); let i = 0;
    while (i < n) { let j = i; while (j + 1 < n && order[j + 1][0] === order[i][0]) j++; for (let k = i; k <= j; k++) ranks[order[k][1]] = (i + j) / 2 + 1; i = j + 1; } return ranks; };
  const rx = rank(x); const ry = rank(y); const mx = rx.reduce((a, b) => a + b, 0) / n; const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0; for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  if (!sxx || !syy) return null;
  const rho = sxy / Math.sqrt(sxx * syy); const t = rho * Math.sqrt((n - 2) / Math.max(1e-12, 1 - rho * rho));
  // Two-sided p from the t approximation (df = n − 2), via the regularized incomplete beta through F = t².
  return { rho, p: tTwoSided(t, n - 2), n };
}
function betacf(a: number, b: number, x: number) {
  const tiny = 1e-300; let c = 1; let d = 1 - ((a + b) * x) / (a + 1); if (Math.abs(d) < tiny) d = tiny; d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m; let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
function betaInc(a: number, b: number, x: number) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betacf(a, b, x)) / a : 1 - (front * betacf(b, a, 1 - x)) / b;
}
export const tTwoSided = (t: number, df: number) => betaInc(df / 2, 0.5, df / (df + t * t));
