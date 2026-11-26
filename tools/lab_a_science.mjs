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

// Helper to evaluate residual array
function evalErrs(errs) {
  const absE = errs.map(abs);
  return {
    n: errs.length,
    med_mult: fx(exp(med(absE)), 2),
    p90_mult: fx(exp(qn(absE, 0.9)), 2),
    rmse: fx(sqrt(mean(errs.map((e) => e * e))), 3),
    mae_log: fx(mean(absE), 3),
    bias_signed: fx(mean(errs), 3),
    med_signed: fx(med(errs), 3),
    q10_signed: fx(qn(errs, 0.1), 3),
    q90_signed: fx(qn(errs, 0.9), 3),
  };
}

// 1. Champion Model D vs Challengers (LOO n=89 & Cross-sectional split Train=46 / Test=21)
const dated = comps.filter((r) => r.listed_at).sort((a, b) => Date.parse(a.listed_at) - Date.parse(b.listed_at));
const cut = floor(dated.length * 0.7);
const tr = dated.slice(0, cut);
const te = dated.slice(cut);
const fitTr = OMEGA.fitModel(tr, null, ms);

function runVariant(label, predFn) {
  const looErrs = comps.map((c, i) => {
    const fold = comps.filter((_, j) => j !== i);
    const f = OMEGA.fitModel(fold, null, ms);
    return c.y_log - predFn(f, c, fold);
  });
  const trErrs = tr.map((c, i) => {
    const fold = tr.filter((_, j) => j !== i);
    const f = OMEGA.fitModel(fold, null, ms);
    return c.y_log - predFn(f, c, fold);
  });
  const csErrs = te.map((c) => c.y_log - predFn(fitTr, c, tr));
  return { label, loo: evalErrs(looErrs), tr_loo: evalErrs(trErrs), cs: evalErrs(csErrs), looErrs, trErrs, csErrs };
}

const variants = [
  runVariant('A. Official Starter (TVL*0.25*g*m)', (f, r) => OMEGA.decomposeLog(f, r, ms, { starter: 1 }).totalLog),
  runVariant('B. Huber + EB Base Only (noG, noM)', (f, r) => OMEGA.decomposeLog(f, r, ms, { noGM: 1 }).totalLog),
  runVariant('D-Gonly. Huber + EB + Heuristic Growth (noM)', (f, r) => {
    const d = OMEGA.decomposeLog(f, r, ms, {});
    return d.baseLog + log(d.gMult);
  }),
  runVariant('C. 2-Stage Residual Ridge (jG, jM)', (f, r) => OMEGA.decomposeLog(f, r, ms, { joint: 1 }).totalLog),
  runVariant('D. Champion Model D (g w=0.35, +age 0.8..1.2)', (f, r) => OMEGA.decomposeLog(f, r, ms, {}).totalLog),
  runVariant('D-NegAge. Huber + EB + Growth + Fitted jM age', (f, r) => {
    const d = OMEGA.decomposeLog(f, r, ms, {});
    return d.baseLog + log(d.gMult) + (f.jM || 0) * ((d.ageUsed - 365) / 1095);
  }),
];

// 2. Calibration Leakage Investigation (Full-sample q50/q80 vs Strict Train-only vs Strict Nested LOO vs Asymmetric Conformal)
const champ = variants.find((v) => v.label.startsWith('D. Champion'));
const fullQ50 = board.oos.q50_log;
const fullQ80 = board.oos.q80_log;
const trQ50 = qn(champ.trErrs.map(abs), 0.5);
const trQ80 = qn(champ.trErrs.map(abs), 0.8);
const trQ10_s = qn(champ.trErrs, 0.1);
const trQ90_s = qn(champ.trErrs, 0.9);
const trQ25_s = qn(champ.trErrs, 0.25);
const trQ75_s = qn(champ.trErrs, 0.75);

// Strict nested LOO: for each outer LOO sample i, fit inner LOO residuals on comps \ {i} (approximated cleanly by excluding i from LOO errs or exact inner LOO)
let nestedCov50 = 0, nestedCov80 = 0;
for (let i = 0; i < comps.length; i++) {
  const rest = comps.filter((_, j) => j !== i);
  const innerAbs = rest.map((c, j) => {
    const f = OMEGA.fitModel(rest.filter((_, k) => k !== j), null, ms);
    return abs(c.y_log - OMEGA.decomposeLog(f, c, ms, {}).totalLog);
  });
  const iq50 = qn(innerAbs, 0.5), iq80 = qn(innerAbs, 0.8);
  const ei = abs(champ.looErrs[i]);
  if (ei <= iq50) nestedCov50++;
  if (ei <= iq80) nestedCov80++;
}

const cov = (errs, q) => fx(errs.filter((e) => abs(e) <= q).length / errs.length * 100, 1);
const covAsym = (errs, lo, hi) => fx(errs.filter((e) => e >= lo && e <= hi).length / errs.length * 100, 1);

const calibrationAudit = {
  full_sample_q50_log: fullQ50,
  full_sample_q80_log: fullQ80,
  strict_train46_q50_log: fx(trQ50, 4),
  strict_train46_q80_log: fx(trQ80, 4),
  loo_reported_p50_pct: board.oos.hit_p25_p75_pct,
  loo_reported_p80_pct: board.oos.hit_p10_p90_pct,
  loo_strict_nested_p50_pct: fx(nestedCov50 / comps.length * 100, 1),
  loo_strict_nested_p80_pct: fx(nestedCov80 / comps.length * 100, 1),
  cs_test21_using_leaked_full89_q80_pct: cov(champ.csErrs, fullQ80),
  cs_test21_using_strict_train46_q50_pct: cov(champ.csErrs, trQ50),
  cs_test21_using_strict_train46_q80_pct: cov(champ.csErrs, trQ80),
  cs_test21_using_strict_train46_asym_25_75_pct: covAsym(champ.csErrs, trQ25_s, trQ75_s),
  cs_test21_using_strict_train46_asym_10_90_pct: covAsym(champ.csErrs, trQ10_s, trQ90_s),
  undated_comps_excluded_from_cs: comps.length - dated.length,
};

// 3. Identity-Group Leakage Audit across 89 comparables
// Check prefix / brand roots among comps
const rootOf = (slug) => slug.split('-')[0];
const byRoot = new Map();
for (const c of comps) {
  const r = rootOf(c.slug);
  if (!byRoot.has(r)) byRoot.set(r, []);
  byRoot.get(r).push(c.slug);
}
const multiSlugRoots = [...byRoot.entries()].filter(([, arr]) => arr.length > 1);
const groupLooErrs = comps.map((c) => {
  const r = rootOf(c.slug);
  const fold = comps.filter((x) => rootOf(x.slug) !== r);
  const f = OMEGA.fitModel(fold, null, ms);
  return c.y_log - OMEGA.decomposeLog(f, c, ms, {}).totalLog;
});

// 4. Peer Incidence Honest LOO Brier vs Apparent Brier + Deduplicated (excl VR/WR/XR/TS)
const pr501 = snap.protocols.filter((p) => (p.category || '') !== 'CEX' && !OMEGA.EXCLUDED_CATS.has(p.category || ''));
const isTok = (p) => p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
const keyOf = (p) => {
  const d = OMEGA.ageOf(p.listed_at, ms) ?? 365;
  return `${OMEGA.superCat(p.category || '')}|${d < 180 ? '0-6m' : d < 540 ? '6-18m' : '18m+'}`;
};
const prClean = pr501.filter((p) => !OMEGA.VER_RE.test(p.name || '') && !OMEGA.WRAP_RE.test(p.name || '') && !OMEGA.EXCH_RE.test(p.name || '') && !(p.slug in OMEGA.TOK_SIBLINGS));

function evalPeerBrier(arr) {
  const baseRate = mean(arr.map((p) => (isTok(p) ? 1 : 0)));
  const brierBaseApparent = mean(arr.map((p) => (baseRate - (isTok(p) ? 1 : 0)) ** 2));
  const brierBaseLoo = mean(arr.map((p, i) => {
    const br = mean(arr.filter((_, j) => j !== i).map((x) => (isTok(x) ? 1 : 0)));
    return (br - (isTok(p) ? 1 : 0)) ** 2;
  }));
  const brierBucketApparent = mean(arr.map((p) => {
    const k = keyOf(p), peers = arr.filter((x) => keyOf(x) === k);
    const pred = (peers.filter(isTok).length + 2 * baseRate) / (peers.length + 2);
    return (pred - (isTok(p) ? 1 : 0)) ** 2;
  }));
  const brierBucketLoo = mean(arr.map((p, i) => {
    const others = arr.filter((_, j) => j !== i);
    const br = mean(others.map((x) => (isTok(x) ? 1 : 0)));
    const k = keyOf(p), peers = others.filter((x) => keyOf(x) === k);
    const pred = (peers.filter(isTok).length + 2 * br) / (peers.length + 2);
    return (pred - (isTok(p) ? 1 : 0)) ** 2;
  }));
  return {
    n: arr.length,
    tok_rate_pct: fx(baseRate * 100, 1),
    brier_base_apparent: fx(brierBaseApparent, 4),
    brier_base_loo: fx(brierBaseLoo, 4),
    brier_bucket_apparent: fx(brierBucketApparent, 4),
    brier_bucket_loo: fx(brierBucketLoo, 4),
  };
}

const out = {
  champion_fit: { b0: board.fit.b0, b1: board.fit.b1, jG_ridge: board.fit.jG, jM_ridge: board.fit.jM },
  variants: variants.map(({ looErrs, trErrs, csErrs, ...r }) => r),
  calibration_audit: calibrationAudit,
  identity_group_leakage: {
    multi_slug_roots_in_comps: multiSlugRoots,
    standard_loo: champ.loo,
    root_grouped_loo: evalErrs(groupLooErrs),
  },
  peer_incidence_brier: {
    cohort_501_non_xc: evalPeerBrier(pr501),
    cohort_clean_dedup_no_vr_wr_xr_ts: evalPeerBrier(prClean),
  },
};

fs.writeFileSync('v3_2_production/evidence/lab_a_science_results.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
