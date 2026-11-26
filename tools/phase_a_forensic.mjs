import { createRequire } from 'node:module';
import fs from 'node:fs';
import { WATCHLIST_SPECS } from '../lib/watchlist_specs.ts';
import { buildAllSpecs } from '../lib/farm_specs.ts';

const require = createRequire(import.meta.url);
const OMEGA = require('../baseline_v4_1/dashboard/analysis.js');
const snap = JSON.parse(fs.readFileSync('token-radar-01-kit-v48/input/snapshot.json', 'utf8'));
const specs = buildAllSpecs(snap, WATCHLIST_SPECS);
const board = OMEGA.buildFullBoard(snap, specs);
const ms = Date.parse(`${snap.as_of}T00:00:00Z`);
const strict = OMEGA.computeStrictAudit(board.comps, snap.protocols, ms);

// C1: Raw partition reconstruction from snapshot
const rawSlugs = new Set(snap.protocols.map((p) => p.slug));
const candSlugs = new Set(board.rows.map((r) => r.slug));
const liveSlugs = new Set(board.live_rows.map((r) => r.slug));
const exclSlugs = new Set(board.excluded_rows.map((r) => r.slug));
const disjoint =
  [...candSlugs].every((s) => !liveSlugs.has(s) && !exclSlugs.has(s)) &&
  [...liveSlugs].every((s) => !exclSlugs.has(s));
const wlMissing = snap.watchlist.filter((s) => !candSlugs.has(s));

// C4: Comparable fallback coverage across 184 ranked candidates
const compCats = new Set(board.comps.map((c) => c.category));
const compSecs = new Set(board.comps.map((c) => c.sc));
const exactMatches = board.rows.filter((r) => compCats.has(r.category)).length;
const secFallback = board.rows.filter((r) => !compCats.has(r.category) && compSecs.has(r.sc)).length;
const globalFallback = board.rows.filter((r) => !compCats.has(r.category) && !compSecs.has(r.sc)).length;

// C5: Rank stability across Model B, D_negAge, +growth perturbation, and top-leverage comp jackknife
function rankVec(vals) {
  return [...vals]
    .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1))
    .map((x, i) => ({ ...x, r: i + 1 }));
}
function spearman(r1, r2) {
  const m2 = new Map(r2.map((x) => [x.slug, x.r]));
  const n = r1.length;
  let d2 = 0, maxDisp = 0;
  const disps = [];
  for (const x of r1) {
    const d = Math.abs(x.r - m2.get(x.slug));
    d2 += d * d;
    if (d > maxDisp) maxDisp = d;
    disps.push(d);
  }
  disps.sort((a, b) => a - b);
  const top10a = new Set(r1.slice(0, 10).map((x) => x.slug));
  const top20a = new Set(r1.slice(0, 20).map((x) => x.slug));
  const top10b = r2.slice(0, 10).filter((x) => top10a.has(x.slug)).length;
  const top20b = r2.slice(0, 20).filter((x) => top20a.has(x.slug)).length;
  return {
    spearman: +(1 - (6 * d2) / (n * (n * n - 1))).toFixed(4),
    top10_overlap: top10b,
    top20_overlap: top20b,
    med_disp: disps[Math.floor(disps.length / 2)],
    max_disp: maxDisp,
  };
}
const baseRanks = board.rows.map((r) => ({ slug: r.slug, r: r.rank, v: r.implied_value_usd }));
const fitD = board.fit;
const altB = rankVec(board.rows.map((r) => ({ slug: r.slug, v: Math.exp(OMEGA.decomposeLog(fitD, r, ms, { noGM: 1 }).totalLog) })));
const altNegAge = rankVec(board.rows.map((r) => {
  const d = OMEGA.decomposeLog(fitD, r, ms, { noGM: 1 });
  const aU = Math.min(1095, r.age_days ?? 365);
  return { slug: r.slug, v: Math.exp(d.totalLog) * r.growth_multiplier * Math.exp(-0.0819 * ((aU - 365) / 1095)) };
}));
const altGrowthPerturb = rankVec(board.rows.map((r) => {
  const c7 = r.change_7d == null ? 0 : r.change_7d * 0.8;
  return { slug: r.slug, v: Math.exp(OMEGA.decomposeLog(fitD, { ...r, change_7d: c7 }, ms, {}).totalLog) };
}));

// Max influence of removing any single comparable observation from Model D fit
let worstComp = null;
for (let i = 0; i < board.comps.length; i++) {
  const sub = board.comps.filter((_, j) => j !== i);
  const fSub = OMEGA.fitModel(sub, null, ms);
  const rSub = rankVec(board.rows.map((r) => ({ slug: r.slug, v: Math.exp(OMEGA.decomposeLog(fSub, r, ms, {}).totalLog) })));
  const st = spearman(baseRanks, rSub);
  if (!worstComp || st.max_disp > worstComp.max_disp) worstComp = { dropped: board.comps[i].slug, ...st };
}

// D2 / D3 / D6: Yield-bearing & economics audit
const econCurrent = board.rows.map((r) => ({
  row: r,
  econ: OMEGA.calcEconomics({ ...r.farm, capital_usd: 1000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10 }),
}));
// Corrected: do NOT exempt yield_bearing from opp_apr when snapshot has 0% verified APY
const econUniformOpp = board.rows.map((r) => ({
  row: r,
  econ: OMEGA.calcEconomics({ ...r.farm, yield_bearing: false, capital_usd: 1000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10 }),
}));

const summarizeEcon = (arr) => {
  const qual = arr.filter((x) => x.econ.robustClass === 'CENTRAL-ONLY' || x.econ.robustClass === 'ALL-SCENARIO ROBUST');
  const rob = arr.filter((x) => x.econ.robustClass === 'ALL-SCENARIO ROBUST');
  const gated = arr.filter((x) => x.econ.robustClass === 'EXECUTION-GATED' && x.econ.hypPerHr >= 10);
  const zPos = arr.filter((x) => x.econ.zeroRewardCost > 0);
  const ybInQual = qual.filter((x) => x.row.farm.yield_bearing).length;
  return {
    raw_hurdle_pass: qual.length + gated.length,
    gated_passing_hurdle: gated.length,
    scenario_qualified: qual.length,
    yield_bearing_in_qualified: ybInQual,
    lower_band_robust: rob.length,
    zero_reward_positive: zPos.length,
    med_cash_cost: OMEGA.median(arr.map((x) => x.econ.cashCost)),
    med_total_cost: OMEGA.median(arr.map((x) => x.econ.totalCost)),
  };
};

// Firelight $5k reference check
const fl = board.rows.find((r) => r.slug === 'firelight');
const flE = OMEGA.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd, hurdle_hr: 10 });

const report = {
  partition: {
    total_protocols: snap.protocols.length,
    unique_slugs: rawSlugs.size,
    ranked: board.rows.length,
    watchlist_covered: board.audit_summary.wl,
    watchlist_missing: wlMissing,
    off_wl_clean: board.audit_summary.clean_pre,
    recorded_live: board.live_rows.length,
    excluded: board.excluded_rows.length,
    sum_check: board.rows.length + board.live_rows.length + board.excluded_rows.length,
    disjoint,
    yb_total_in_184: board.rows.filter((r) => r.farm.yield_bearing).length,
  },
  c3_validation: { ladder: board.oos.ladder, oos: { q50: board.oos.q50_log, q80: board.oos.q80_log, nested_loo_80: board.oos.hit_p10_p90_pct, unnested_cs_80: board.oos.cs_hit_p10_p90_pct }, strict },
  c4_comparables: { comps_total: board.comps.length, exact_cat_matches: exactMatches, sector_fallback: secFallback, global_fallback: globalFallback, firelight_n_cat: fl.n_cat_comps, firelight_n_sup: fl.n_sup_comps },
  c5_rank_stability: {
    vs_Model_B_noGM: spearman(baseRanks, altB),
    vs_D_negAge: spearman(baseRanks, altNegAge),
    vs_Growth_08x: spearman(baseRanks, altGrowthPerturb),
    worst_single_comp_jackknife: worstComp,
  },
  d2_d6_economics: {
    v4_1_yield_bearing_opp0: summarizeEcon(econCurrent),
    v4_2_uniform_opp: summarizeEcon(econUniformOpp),
    yield_bearing_affected_rows: econCurrent.filter((x, i) => x.econ.robustClass !== econUniformOpp[i].econ.robustClass).map((x) => x.row.slug),
  },
  firelight_5k_check: {
    yield_bearing: fl.farm.yield_bearing,
    implied_usd: fl.implied_value_usd,
    base_usd: fl.base_value_usd,
    g_mult: fl.growth_multiplier,
    m_mult: fl.maturity_multiplier,
    gross: flE.hypGross,
    cashCost: flE.cashCost,
    opp: flE.opp,
    totalCost: flE.totalCost,
    centralNet: flE.hypNet,
    zeroReward: flE.zeroRewardCost,
    beDropPct: flE.beDropPct,
    beLossPctToEraseNet: +(flE.hypNet / 5000 * 100).toFixed(3),
    netAfter0_5PctLoss: +(flE.hypNet - 5000 * 0.005).toFixed(2),
  },
};

fs.writeFileSync('v4_2_candidate/evidence/phase_a_forensic.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
