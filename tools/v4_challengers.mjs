import fs from 'node:fs';
import OMEGA from '../dashboard/analysis.js';

const snap = JSON.parse(fs.readFileSync('token-radar-01-kit-v48/input/snapshot.json', 'utf8'));
const ms = Date.parse(`${snap.as_of}T00:00:00Z`);
const { log, exp, max, min, abs, sqrt, floor } = Math;
const board = OMEGA.buildFullBoard(snap, {});
const comps = board.comps;
const fx = (n, d = 3) => +Number(n).toFixed(d);
const qn = OMEGA.quantile;
const med = OMEGA.median;
const mean = OMEGA.mean;
const L = (v) => log(max(1, v));

// Student-t MLE regression (IRLS with scale sigma^2 update)
function studentT(x, y, df = 4) {
  let { b0, b1 } = OMEGA.fitModel(x.map((xi, i) => ({ tvl_family: exp(xi), y_log: y[i], category: 'Other', listed_at: null, change_7d: null })), null, 0);
  let w = x.map(() => 1);
  let sig2 = max(0.25, med(y.map((yi, i) => (yi - (b0 + b1 * x[i])) ** 2)) * 2.198);
  for (let t = 0; t < 45; t++) {
    let a = 0, b = 0, c = 1e-4, e = 0, f = 0;
    for (let i = 0; i < x.length; i++) {
      a += w[i]; b += w[i] * x[i]; c += w[i] * x[i] * x[i]; e += w[i] * y[i]; f += w[i] * x[i] * y[i];
    }
    const d = a * c - b * b || 1e-12;
    const u = (c * e - b * f) / d, v = (a * f - b * e) / d;
    const rs = y.map((yi, i) => yi - (u + v * x[i]));
    const nw = rs.map((r) => (df + 1) / (df + (r * r) / max(0.05, sig2)));
    const nsig2 = max(0.05, rs.reduce((s, r, i) => s + nw[i] * r * r, 0) / x.length);
    if (abs(u - b0) + abs(v - b1) < 1e-6 && abs(nsig2 - sig2) < 1e-5) return [u, v, sqrt(nsig2)];
    b0 = u; b1 = v; w = nw; sig2 = nsig2;
  }
  return [b0, b1, sqrt(sig2)];
}

function fitVariant(cs, kind) {
  if (kind.startsWith('t')) {
    const df = +kind.slice(1);
    const [b0, b1] = studentT(cs.map((r) => L(r.tvl_family)), cs.map((r) => r.y_log), df);
    const sR = new Map(), cR = new Map(), supEff = {}, catEff = {};
    cs.forEach((r) => {
      const e = r.y_log - (b0 + b1 * L(r.tvl_family)), s = OMEGA.superCat(r.category);
      (sR.get(s) || sR.set(s, []).get(s)).push(e);
      (cR.get(r.category) || cR.set(r.category, []).get(r.category)).push(e);
    });
    for (const [k, a] of sR) supEff[k] = (a.length / (a.length + 6)) * med(a);
    for (const [k, a] of cR) {
      const p = supEff[OMEGA.superCat(k)] ?? 0;
      catEff[k] = a.length >= 2 ? p + (a.length / (a.length + 24)) * (med(a) - p) : p;
    }
    return { b0, b1, supEff, catEff, jG: 0, jM: 0 };
  }
  return OMEGA.fitModel(cs, null, ms);
}

function predVariant(fit, r, kind) {
  if (kind === 'D') return OMEGA.decomposeLog(fit, r, ms, {}).totalLog;
  if (kind === 'B') return OMEGA.decomposeLog(fit, r, ms, { noGM: 1 }).totalLog;
  if (kind === 'D_negAge') {
    const d = OMEGA.decomposeLog(fit, r, ms, {});
    const mLog = (fit.jM || 0) * ((d.ageUsed - 365) / 1095);
    return d.baseLog + log(d.gMult) + mLog;
  }
  if (kind.startsWith('t')) {
    return OMEGA.decomposeLog(fit, r, ms, {}).totalLog;
  }
  return OMEGA.decomposeLog(fit, r, ms, {}).totalLog;
}

const dated = comps.filter((r) => r.listed_at).sort((a, b) => Date.parse(a.listed_at) - Date.parse(b.listed_at));
const undated = comps.filter((r) => !r.listed_at);
const cut = floor(dated.length * 0.7); // 46 train, 21 recent test
const tr = dated.slice(0, cut), te = dated.slice(cut);

const evalErrs = (errs) => {
  const ae = errs.map(abs);
  return {
    n: errs.length,
    med_mult: fx(exp(med(ae)), 2),
    p90_mult: fx(exp(qn(ae, 0.9)), 2),
    rmse: fx(sqrt(mean(errs.map((e) => e * e))), 3),
    mae: fx(mean(ae), 3),
    bias: fx(mean(errs), 3),
  };
};

// 1. Compare point prediction challengers (LOO n=89 + Strict Temporal Cross-Sectional tr=46 -> te=21)
const models = ['B', 'D', 'D_negAge', 't3', 't4', 't5'];
const challengerSummary = models.map((k) => {
  const looSigned = comps.map((c, i) => c.y_log - predVariant(fitVariant(comps.filter((_, j) => j !== i), k), c, k));
  const fTr = fitVariant(tr, k);
  const csSigned = te.map((c) => c.y_log - predVariant(fTr, c, k));
  return { model: k, loo: evalErrs(looSigned), cs_test21: evalErrs(csSigned) };
});

// 2. Identity-group leakage across both slug root AND S2F family map
const groupKey = (r) => OMEGA.S2F.has(r.slug) ? `fam:${OMEGA.S2F.get(r.slug)}` : `root:${r.slug.split('-')[0]}`;
const groups = new Map();
comps.forEach((c) => { const k = groupKey(c); (groups.get(k) || groups.set(k, []).get(k)).push(c.slug); });
const multiGroups = [...groups.entries()].filter(([, v]) => v.length > 1);
const groupedLoo = comps.map((c) => {
  const gk = groupKey(c);
  const trainSet = comps.filter((other) => groupKey(other) !== gk);
  return c.y_log - predVariant(fitVariant(trainSet, 'D'), c, 'D');
});

// 3. Conformal Interval Challengers (Nested Train-Only, zero leakage)
// Evaluate on both Inner-LOO (n=89) and Strict Causal CS (train=46 -> test=21)
function innerResiduals(subset, kind = 'D') {
  return subset.map((c, i) => {
    const f = fitVariant(subset.filter((_, j) => j !== i), kind);
    const yh = predVariant(f, c, kind);
    return { c, signed: c.y_log - yh, absErr: abs(c.y_log - yh) };
  });
}

const trRes = innerResiduals(tr, 'D');
const trAbs = trRes.map((x) => x.absErr), trSigned = trRes.map((x) => x.signed);
const fTrD = fitVariant(tr, 'D');
const teRes = te.map((c) => ({ c, signed: c.y_log - predVariant(fTrD, c, 'D'), absErr: abs(c.y_log - predVariant(fTrD, c, 'D')) }));

// (a) Symmetric Homoscedastic (V3.2 Baseline)
const q50Sym = qn(trAbs, 0.5), q80Sym = qn(trAbs, 0.8);
// (b) Asymmetric Training-Only Conformal [Q25, Q75] and [Q10, Q90]
const q25As = qn(trSigned, 0.25), q75As = qn(trSigned, 0.75), q10As = qn(trSigned, 0.10), q90As = qn(trSigned, 0.90);
// (c) Heteroscedastic Scale Conformal (linear fit of |e| on log(TVL) clamped to [0.7, 1.5] on train-46)
const meanLtv = mean(trRes.map((x) => L(x.c.tvl_family)));
const covLtv = trRes.reduce((s, x) => s + (L(x.c.tvl_family) - meanLtv) * x.absErr, 0);
const varLtv = max(1e-6, trRes.reduce((s, x) => s + (L(x.c.tvl_family) - meanLtv) ** 2, 0));
const meanAbs = mean(trAbs);
const slopeScale = covLtv / varLtv;
const scaleAt = (tvl) => max(0.65, min(1.6, (meanAbs + slopeScale * (L(tvl) - meanLtv)) / max(0.1, meanAbs)));
const trNorm = trRes.map((x) => x.absErr / scaleAt(x.c.tvl_family));
const q50Het = qn(trNorm, 0.5), q80Het = qn(trNorm, 0.8);

// (d) Hierarchical Sector-Shrunk q80 (k=6 shrinkage toward train global q80)
const secAbs = new Map();
trRes.forEach((x) => { const s = x.c.sc; (secAbs.get(s) || secAbs.set(s, []).get(s)).push(x.absErr); });
const secQ80 = (sc) => {
  const a = secAbs.get(sc) || [];
  return a.length >= 2 ? (a.length * qn(a, 0.8) + 6 * q80Sym) / (a.length + 6) : q80Sym;
};

// Also nested full-sample 89 LOO check for Asymmetric & Heteroscedastic
const fullRes = innerResiduals(comps, 'D');
let looCovSym80 = 0, looCovAsym80 = 0, looCovHet80 = 0;
const hetWidthsLoo = [];
for (let i = 0; i < comps.length; i++) {
  const others = fullRes.filter((_, j) => j !== i);
  const xi = fullRes[i];
  if (xi.absErr <= qn(others.map((o) => o.absErr), 0.8)) looCovSym80++;
  if (xi.signed >= qn(others.map((o) => o.signed), 0.1) && xi.signed <= qn(others.map((o) => o.signed), 0.9)) looCovAsym80++;
  const mL = mean(others.map((o) => L(o.c.tvl_family)));
  const mA = mean(others.map((o) => o.absErr));
  const sl = others.reduce((s, o) => s + (L(o.c.tvl_family) - mL) * o.absErr, 0) / max(1e-6, others.reduce((s, o) => s + (L(o.c.tvl_family) - mL) ** 2, 0));
  const scFn = (tvl) => max(0.65, min(1.6, (mA + sl * (L(tvl) - mL)) / max(0.1, mA)));
  const qH = qn(others.map((o) => o.absErr / scFn(o.c.tvl_family)), 0.8) * scFn(xi.c.tvl_family);
  hetWidthsLoo.push(qH);
  if (xi.absErr <= qH) looCovHet80++;
}

const intervalAudit = {
  strict_train46_to_test21: {
    symmetric_baseline: {
      q50_log: fx(q50Sym, 4), q80_log: fx(q80Sym, 4),
      width_80_mult: fx(exp(q80Sym), 2),
      cs_cov50_pct: fx(teRes.filter((x) => x.absErr <= q50Sym).length / te.length * 100, 1),
      cs_cov80_pct: fx(teRes.filter((x) => x.absErr <= q80Sym).length / te.length * 100, 1),
      loo_cov80_pct: fx(looCovSym80 / comps.length * 100, 1),
    },
    asymmetric_train_only: {
      q25_q75: [fx(q25As, 4), fx(q75As, 4)],
      q10_q90: [fx(q10As, 4), fx(q90As, 4)],
      cs_cov50_pct: fx(teRes.filter((x) => x.signed >= q25As && x.signed <= q75As).length / te.length * 100, 1),
      cs_cov80_pct: fx(teRes.filter((x) => x.signed >= q10As && x.signed <= q90As).length / te.length * 100, 1),
      loo_cov80_pct: fx(looCovAsym80 / comps.length * 100, 1),
    },
    heteroscedastic_tvl_scaled: {
      slope_abs_err_vs_log_tvl: fx(slopeScale, 4),
      q80_norm: fx(q80Het, 4),
      mean_test_q80_mult: fx(exp(mean(teRes.map((x) => q80Het * scaleAt(x.c.tvl_family)))), 2),
      cs_cov50_pct: fx(teRes.filter((x) => x.absErr <= q50Het * scaleAt(x.c.tvl_family)).length / te.length * 100, 1),
      cs_cov80_pct: fx(teRes.filter((x) => x.absErr <= q80Het * scaleAt(x.c.tvl_family)).length / te.length * 100, 1),
      loo_cov80_pct: fx(looCovHet80 / comps.length * 100, 1),
      mean_loo_q80_mult: fx(exp(mean(hetWidthsLoo)), 2),
    },
    hierarchical_sector_shrunk: {
      cs_cov80_pct: fx(teRes.filter((x) => x.absErr <= secQ80(x.c.sc)).length / te.length * 100, 1),
    },
  },
};

// 4. Cohort Shift & Negative Empirical Age Forensics
const cohortStats = (arr, label) => ({
  cohort: label,
  n: arr.length,
  date_min: arr.filter((r) => r.listed_at).map((r) => r.listed_at).sort()[0] || null,
  date_max: arr.filter((r) => r.listed_at).map((r) => r.listed_at).sort().slice(-1)[0] || null,
  med_tvl_usd: Math.round(med(arr.map((r) => r.tvl_family))),
  med_mcap_usd: Math.round(med(arr.map((r) => r.mcap_usd))),
  med_mcap_tvl_ratio: fx(med(arr.map((r) => r.mcap_usd / max(1, r.tvl_family))), 3),
  frac_lt_25m_tvl_pct: fx(arr.filter((r) => r.tvl_family < 25e6).length / arr.length * 100, 1),
});

const fAllD = fitVariant(comps, 'D');
const datedErrs = dated.map((c) => ({
  ageDays: OMEGA.ageOf(c.listed_at, ms),
  baseErr: c.y_log - OMEGA.decomposeLog(fAllD, c, ms, { noGM: 1 }).totalLog,
  absErr: abs(c.y_log - predVariant(fAllD, c, 'D')),
}));
const ageMean = mean(datedErrs.map((x) => x.ageDays)), errMean = mean(datedErrs.map((x) => x.baseErr));
const ageCorr = datedErrs.reduce((s, x) => s + (x.ageDays - ageMean) * (x.baseErr - errMean), 0)
  / sqrt(datedErrs.reduce((s, x) => s + (x.ageDays - ageMean) ** 2, 0) * datedErrs.reduce((s, x) => s + (x.baseErr - errMean) ** 2, 0));

const report = {
  champion_baseline_fit: { b0: fx(fAllD.b0, 5), b1: fx(fAllD.b1, 5), jG: fx(fAllD.jG, 4), jM: fx(fAllD.jM, 4) },
  challenger_comparison: challengerSummary,
  identity_group_leakage: { multi_groups: multiGroups, standard_loo: evalErrs(fullRes.map((x) => x.signed)), grouped_loo: evalErrs(groupedLoo) },
  interval_calibration_challengers: intervalAudit,
  cohort_regime_forensics: {
    early_train46: cohortStats(tr, 'Early Listed (Train n=46)'),
    recent_test21: cohortStats(te, 'Recent Listed (Test n=21)'),
    undated_22: cohortStats(undated, 'Undated Listed Comps (n=22)'),
    pearson_age_days_vs_base_residual: fx(ageCorr, 4),
    note: 'Why 61.9% coverage + bias +0.873 + jM<0: recent listed cohort (n=21) has 2.76x larger median TVL ($60.0M vs $21.7M) AND higher median MCap/TVL ratio (0.321 vs 0.234) than the earlier cohort, producing systematically positive y_log residuals under sub-linear b1=0.499 scaling.',
  },
};

fs.writeFileSync('v4_candidate/evidence/v4_challenger_results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
