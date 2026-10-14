// Reliability lab statistics checked against lifelines 0.30 / scipy 1.17 for the same inputs: `npm run test:reliability:stats`.
import assert from 'node:assert/strict';
import {
  atRiskAt, bootstrapRateRatio, chi2Inv, coxPH, fisherExact, gammaSample, kaplanMeier, logRank, mantelHaenszelRate, meanCumulative, medianSurvival,
  permutationRateRatio, poissonRate, rateRatio, riskDifference, seededRandom, spearman, survivalAt, weibull, wilson,
} from '../src/components/reliabilityStats.ts';

const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const A_t = [0, 5, 12, 12, 30, 45, 60, 60, 90, 120, 200, 365, 365, 365, 20, 8];
const A_e = [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1];
const B_t = [3, 40, 70, 90, 150, 180, 250, 300, 365, 365, 365, 365, 365, 100, 365, 365, 15, 365];
const B_e = [1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
const A = A_t.map((t, i) => ({ t, event: A_e[i] === 1, group: 1, stratum: i % 2 ? 'y' : 'x', x: [1] }));
const B = B_t.map((t, i) => ({ t, event: B_e[i] === 1, group: 0, stratum: i % 2 ? 'y' : 'x', x: [0] }));

// Kaplan–Meier + log(−log) limits (lifelines KaplanMeierFitter).
const lifelinesKm = [[0, 0.9375, 0.6323454417389031, 0.9909531417446664], [5, 0.875, 0.5859814368090156, 0.9671888460291236], [12, 0.75, 0.4634300426581342, 0.897979909715789],
  [20, 0.681818181818182, 0.39525531008119547, 0.8538279139547367], [60, 0.47727272727272724, 0.2205108475420583, 0.6963593210887286],
  [90, 0.3977272727272727, 0.1583802326269907, 0.6304636329991494], [200, 0.29829545454545453, 0.0864030534380293, 0.550143597215582]];
const km = kaplanMeier(A);
for (const [t, s, low, high] of lifelinesKm) {
  const step = survivalAt(km, t);
  close(step.s, s, 1e-12, `S(${t})`); close(step.low, low, 1e-9, `low(${t})`); close(step.high, high, 1e-9, `high(${t})`);
}
assert.equal(survivalAt(km, 366), null, 'no extrapolation beyond the last follow-up');
assert.equal(km.events, 10); assert.equal(atRiskAt(A, 90), 6); assert.equal(medianSurvival(km), 60);
assert.equal(kaplanMeier([{ t: 10, event: false }]).steps.length, 1, 'censoring alone never lowers the curve');

// Log-rank (lifelines logrank_test) and stratified version (sum over strata).
const plain = [...A, ...B].map(({ stratum, ...rest }) => rest);
const lr = logRank(plain);
close(lr.chi2, 3.1648713075938995, 1e-9, 'log-rank chi2'); close(lr.p, 0.07523836544933706, 1e-9, 'log-rank p');
assert.equal(logRank([...A, ...B]).strata, 2);
assert.ok(logRank([...A, ...B]).chi2 !== lr.chi2, 'strata change the test');

// Cox PH with Efron ties (lifelines CoxPHFitter), plain and stratified.
const cox = coxPH(plain);
close(cox.beta[0], 0.8350669806972906, 1e-6, 'cox beta'); close(cox.se[0], 0.4816236356275729, 1e-6, 'cox se'); close(cox.p[0], 0.08294328633896403, 1e-6, 'cox p');
assert.ok(cox.converged);
const coxStratified = coxPH([...A, ...B]);
close(coxStratified.beta[0], 0.8018392095894858, 1e-8, 'stratified cox beta (lifelines precision 1e-12)'); close(coxStratified.se[0], 0.483902995403463, 1e-8, 'stratified cox se');
assert.equal(coxPH([{ t: 1, event: true, x: [1] }, { t: 2, event: true, x: [1] }, { t: 3, event: false, x: [0] }]), null, 'separation → no finite estimate');

// Weibull MLE (lifelines WeibullFitter on t with 0 → 0.5): shape ρ, scale λ, log-likelihood.
const fit = weibull(A);
close(fit.beta, 0.5310501007685253, 1e-6, 'weibull beta'); close(fit.eta, 182.52559440585065, 1e-3, 'weibull eta'); close(fit.logLik, -57.85017686866152, 1e-6, 'weibull loglik');
assert.ok(fit.betaLow < fit.beta && fit.beta < fit.betaHigh && fit.betaHigh < 1, 'LR interval below 1 → decreasing hazard');
assert.ok(fit.pExponential < 0.05);
assert.equal(weibull([{ t: 3, event: true }, { t: 9, event: false }]), null, 'a single event cannot carry a Weibull fit');

// Proportions and exact tests (scipy.stats).
close(fisherExact(7, 48, 10, 110), 0.41262260274525875, 1e-9, 'fisher');
const w = wilson(7, 55); close(w.p, 7 / 55, 1e-12, 'wilson p'); assert.ok(w.low > 0.05 && w.high < 0.25);
assert.equal(wilson(0, 0), null);
const diff = riskDifference(wilson(10, 50), wilson(20, 109));
assert.ok(diff.low < diff.d && diff.d < diff.high);

// Rates: exact Garwood limits use chi-square quantiles (scipy.stats.chi2.ppf).
close(chi2Inv(0.025, 6), 1.2373442457912025, 1e-9, 'chi2 ppf low'); close(chi2Inv(0.975, 8), 17.534546139484647, 1e-9, 'chi2 ppf high');
const rate = poissonRate(3, 2);
close(rate.low, 1.2373442457912025 / 2 / 2, 1e-9, 'garwood low'); close(rate.high, 17.534546139484647 / 2 / 2, 1e-9, 'garwood high');
assert.equal(poissonRate(0, 2).low, 0); assert.equal(poissonRate(1, 0), null);
const rr = rateRatio(31, 24.1, 11, 23.4);
close(rr.ratio, (31 / 24.1) / (11 / 23.4), 1e-12, 'rate ratio'); assert.ok(rr.low > 1 && !rr.corrected);
assert.ok(rateRatio(0, 3, 4, 3).corrected, 'zero count is corrected and flagged');
// Mantel–Haenszel with one stratum equals the crude ratio.
close(mantelHaenszelRate([{ a: 31, ta: 24.1, b: 11, tb: 23.4 }]).ratio, rr.ratio, 1e-12, 'MH single stratum');
close(mantelHaenszelRate([{ a: 31, ta: 24.1, b: 11, tb: 23.4 }]).low, rr.low, 1e-9, 'MH single stratum CI = Wald');

// Resampling is seeded: same seed, same answer; permutation p is a proper p (> 0).
const units = (n, events, exposure, group) => Array.from({ length: n }, (_, i) => ({ events: i < events ? 2 : 0, exposure, group, stratum: i % 2 ? 'a' : 'b' }));
const pool = [...units(20, 12, 1, true), ...units(20, 5, 1, false)];
assert.equal(bootstrapRateRatio(units(20, 8, 1, true), units(20, 1, 1, false)), null, 'mostly event-free resamples → no interval');
const boot1 = bootstrapRateRatio(pool.filter(u => u.group), pool.filter(u => !u.group));
const boot2 = bootstrapRateRatio(pool.filter(u => u.group), pool.filter(u => !u.group));
assert.deepEqual(boot1, boot2); assert.ok(boot1.low > 1);
const perm = permutationRateRatio(pool, 2000);
assert.ok(perm.p > 0 && perm.p < 0.05, `permutation p ${perm.p}`);
const random = seededRandom(1); const draws = Array.from({ length: 20000 }, () => gammaSample(3, random));
close(draws.reduce((a, b) => a + b, 0) / draws.length, 3, 0.06, 'gamma mean');

// MCF: two units, failures at 10 (both) and 20 (only unit 1 still observed) → jumps 2/2 then 1/1; truncated at the minimum risk set.
const mcf = meanCumulative([{ events: [10, 20], exposure: 30 }, { events: [10], exposure: 15 }], 1);
assert.deepEqual(mcf.points, [[0, 0], [10, 1], [20, 2]]);
assert.deepEqual(meanCumulative([{ events: [10, 20], exposure: 30 }, { events: [10], exposure: 15 }], 2).points, [[0, 0], [10, 1]]);

// Spearman (scipy.stats.spearmanr).
const sp = spearman([1, 2, 3, 4, 5, 6, 7, 8], [2, 1, 4, 3, 7, 5, 8, 6]);
close(sp.rho, 0.8333333333333335, 1e-12, 'spearman rho'); close(sp.p, 0.010175540123456757, 1e-6, 'spearman p');

console.log('reliability-stats: OK');
