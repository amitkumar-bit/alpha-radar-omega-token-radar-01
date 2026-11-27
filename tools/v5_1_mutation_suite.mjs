import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { WATCHLIST_SPECS } from '../lib/watchlist_specs.ts';
import { buildAllSpecs } from '../lib/farm_specs.ts';
import { computeOosLadder } from '../lib/oos_eval.ts';

const require = createRequire(import.meta.url);
const OMEGA = require('../dashboard/analysis.js');
const snap = JSON.parse(fs.readFileSync('token-radar-01-kit-v60/token-radar-01-kit/input/snapshot.json', 'utf8'));
const specs = buildAllSpecs(snap, WATCHLIST_SPECS);
const ms = Date.parse(`${snap.as_of}T00:00:00Z`);

function runSuite(engine, sn, sp) {
  const board = engine.buildFullBoard(sn, sp);
  const oos = sn.oos || computeOosLadder(engine, board.comps, ms);
  const rows = board.rows;
  const slugs = rows.map((r) => r.slug);
  // 1. Watchlist coverage & partition integrity
  const missingWl = sn.watchlist.filter((s) => !slugs.includes(s));
  assert.equal(missingWl.length, 0, `Missing watchlist: ${missingWl.join(',')}`);
  assert.equal(new Set(slugs).size, rows.length, 'Duplicate candidate slugs');
  assert.equal(rows.length, 184, 'Ranked count != 184');
  assert.equal(board.live_rows.length, 416, 'Live count != 416');
  assert.equal(board.excluded_rows.length, 158, 'Excluded count != 158');
  assert.equal(board.audit_summary.total, 758, 'Audit sum != 758');
  const liveSet = new Set(board.live_rows.map((r) => r.slug));
  assert.equal(rows.filter((r) => liveSet.has(r.slug)).length, 0, 'Live token leaked into ranked');

  // 2. Monotonic rank order & positive implied values
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].rank, i + 1, 'Rank sequence broken');
    if (i > 0) assert.ok(rows[i].implied_value_usd <= rows[i - 1].implied_value_usd, 'Non-monotonic valuation');
    assert.ok(rows[i].p10_usd <= rows[i].p25_usd && rows[i].p25_usd <= rows[i].implied_value_usd && rows[i].implied_value_usd <= rows[i].p75_usd && rows[i].p75_usd <= rows[i].p90_usd, `Interval disorder on ${rows[i].slug}`);
  }

  // 3. Growth & maturity factors active
  assert.ok(rows.some((r) => Math.abs(r.growth_multiplier - 1) > 1e-4), 'Growth multiplier inert');
  assert.ok(rows.some((r) => !r.age_missing && Math.abs(r.maturity_multiplier - 0.9833) > 1e-3), 'Age multiplier inert');
  assert.ok(board.fit.b1 > 0.3 && board.fit.b1 < 0.8 && board.comps.length === 89, 'Abnormal Huber fit');

  // 4. Entity resolution & family anti-double-counting (Stellar not merged; Loopscale Curation standalone TVL)
  const stDex = rows.find((r) => r.slug === 'stellar-dex');
  const stAmm = rows.find((r) => r.slug === 'stellar-amm');
  const lpCur = rows.find((r) => r.slug === 'loopscale-curation');
  const lpLnd = rows.find((r) => r.slug === 'loopscale-lending');
  assert.notEqual(stDex.fam_group, stAmm.fam_group, 'Chain-name false family merge on stellar-*');
  assert.equal(lpCur.tvl_family, lpCur.tvl_usd, 'Multi-candidate family double-counting on loopscale-curation');
  assert.ok(lpCur.implied_value_usd < lpLnd.implied_value_usd, 'Loopscale inversion bug');

  // 5. Token-incidence leakage guard (Brier clean & no fabricated ev_usd)
  const sa = engine.computeStrictAudit(board.comps, board.peers, ms);
  assert.ok(sa.brier_loo < sa.brier_base_loo && sa.brier_loo >= 0.205, 'Suspicious leaked Brier score');
  assert.equal('ev_usd' in rows[0], false, 'Fabricated expected-value field ev_usd present');

  // 6. Strict conformal calibration separation (nested holdout q80 != full-sample LOO q80)
  assert.ok(sa.strict_q80_log < oos.q80_log, `Strict q80 (${sa.strict_q80_log}) leaked full sample (${oos.q80_log})`);

  // 7. Domain & economics invariants
  assert.equal(engine.calcEconomics({ ...rows[0].farm, capital_usd: 0, tvl_usd: 1e8, implied_usd: 1e7 }).valid, false);
  assert.equal(engine.calcEconomics({ ...rows[0].farm, capital_usd: NaN, tvl_usd: 1e8, implied_usd: 1e7 }).valid, false);
  assert.equal(engine.calcEconomics({ ...rows[0].farm, capital_usd: 1000, loss_pct: NaN, tvl_usd: 1e8, implied_usd: 1e7 }).valid, false);

  // 8. Round-trip slippage & step sum reconciliation
  for (const r of rows) {
    const ss = +(r.farm.gas_4w_usd + r.farm.bridge_exit_usd).toFixed(2);
    const as = +r.farm.steps.reduce((a, b) => a + b.cost_usd, 0).toFixed(2);
    assert.ok(Math.abs(ss - as) < 0.02, `Step sum mismatch on ${r.slug}`);
    const e = engine.calcEconomics({ ...r.farm, capital_usd: 1000, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd });
    assert.equal(e.slip, +(1000 * r.farm.slippage_bps * 2e-4).toFixed(2), `Slippage not round-trip on ${r.slug}`);
  }

  // 9. Economics stress: opportunity cost, principal loss, reward realization, gates, lower-band qualification
  const fl = rows.find((r) => r.slug === 'firelight');
  const fl0 = engine.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0, drop_share: 0, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd });
  assert.equal(fl0.hypNet, -33.04, 'Firelight zero-reward mismatch');
  const flLoss = engine.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, loss_pct: 0.005, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd });
  const flNoLoss = engine.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, loss_pct: 0, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd });
  assert.equal(+(flNoLoss.hypNet - flLoss.hypNet).toFixed(2), 25.00, '0.5% principal loss on $5K did not subtract $25.00');
  const flHalfReal = engine.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, realization_pct: 0.5, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd });
  assert.ok(flHalfReal.hypNet < flNoLoss.hypNet, '50% realization did not reduce net return');
  assert.equal(flNoLoss.robustClass, 'EXECUTION-GATED', 'Firelight gate bypassed');

  // Gate on drag_limit (5%) and min_viable_usd at $100
  const sym = rows.find((r) => r.slug === 'symbiotic');
  const symLow = engine.calcEconomics({ ...sym.farm, capital_usd: 100, opp_apr: 0.04, drop_share: 0.07, tvl_usd: sym.tvl_usd, implied_usd: sym.implied_value_usd, p25_usd: sym.p25_usd, p75_usd: sym.p75_usd });
  assert.equal(symLow.robustClass, 'EXECUTION-GATED', 'min_viable_usd / drag gate bypassed at $100');

  // Opportunity-cost uniformity on yield_bearing rows
  const ybRow = rows.find((r) => r.farm.yield_bearing);
  const ybE = engine.calcEconomics({ ...ybRow.farm, capital_usd: 1000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, tvl_usd: ybRow.tvl_usd, implied_usd: ybRow.implied_value_usd, p25_usd: ybRow.p25_usd, p75_usd: ybRow.p75_usd });
  assert.ok(ybE.opp > 0, 'yield_bearing row wrongly received zero opportunity cost');

  // Lower-band qualification count check at $1,000 fixed (must be 0/184)
  const lowQual1k = rows.filter((r) => {
    const e = engine.calcEconomics({ ...r.farm, capital_usd: 1000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10 });
    return e.robustClass === 'ALL-SCENARIO ROBUST';
  }).length;
  assert.equal(lowQual1k, 0, `Expected 0 lower-band qualified at $1K, got ${lowQual1k}`);

  // 10. Verify default dashboard state uses fixed $1000 (not dynamic plan inflation) and labels are honest
  const appSrc = fs.readFileSync('v2_titan/evidence/v2_git_repo/dashboard/app.js', 'utf8');
  assert.ok(appSrc.includes('usePlan:0') && appSrc.includes('budget:1e3'), 'Default budget changed from fixed $1K');
  assert.ok(!appSrc.includes('Token Odds') && !appSrc.includes('ev_usd'), 'Prohibited TGE probability / EV label in UI');
  assert.ok(appSrc.includes('Conditional scenario outputs') && appSrc.includes('≠ FDV'), 'Missing scientific disclaimers in UI');

  return { ranked: rows.length, watchlist: board.audit_summary.wl, strict_cs_80: sa.strict_cs_80_pct, brier_loo: sa.brier_loo };
}

const baselinePass = runSuite(OMEGA, snap, specs);

const mutations = [
  ['M01_drop_watchlist', () => ({ sn: { ...snap, protocols: snap.protocols.filter((p) => p.slug !== snap.watchlist[0]) }, sp: specs, en: OMEGA })],
  ['M02_duplicate_protocol', () => ({ sn: { ...snap, protocols: [...snap.protocols, snap.protocols[0]] }, sp: specs, en: OMEGA })],
  ['M03_live_contamination', () => ({ sn: { ...snap, protocols: snap.protocols.map((p) => p.symbol ? { ...p, mcap_usd: null, symbol: null, gecko_id: null } : p) }, sp: specs, en: OMEGA })],
  ['M04_inert_growth_maturity', () => ({ sn: snap, sp: specs, en: { ...OMEGA, buildFullBoard: (s, p) => { const b = OMEGA.buildFullBoard(s, p); b.rows.forEach((r) => { r.growth_multiplier = 1; }); return b; } } })],
  ['M05_family_chain_leakage_stellar', () => ({ sn: snap, sp: specs, en: { ...OMEGA, buildFullBoard: (s, p) => { const b = OMEGA.buildFullBoard(s, p); b.rows.find((r) => r.slug === 'stellar-dex').fam_group = b.rows.find((r) => r.slug === 'stellar-amm').fam_group; return b; } } })],
  ['M06_family_double_counting_loopscale', () => ({ sn: snap, sp: specs, en: { ...OMEGA, buildFullBoard: (s, p) => { const b = OMEGA.buildFullBoard(s, p); b.rows.find((r) => r.slug === 'loopscale-curation').tvl_family = 77334273; return b; } } })],
  ['M07_token_prob_leakage_ev', () => ({ sn: snap, sp: specs, en: { ...OMEGA, buildFullBoard: (s, p) => { const b = OMEGA.buildFullBoard(s, p); b.rows[0].ev_usd = 100; return b; } } })],
  ['M08_calibration_leakage_strict_q80', () => ({ sn: snap, sp: specs, en: { ...OMEGA, computeStrictAudit: (c, p, m) => ({ ...OMEGA.computeStrictAudit(c, p, m), strict_q80_log: 2.5 }) } })],
  ['M09_oneway_slippage', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => { const e = OMEGA.calcEconomics(o); return { ...e, slip: +(e.slip / 2).toFixed(2) }; } } })],
  ['M10_opp_cost_omission', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => OMEGA.calcEconomics({ ...o, opp_apr: o.yield_bearing ? 0 : o.opp_apr }) } })],
  ['M11_principal_loss_omission', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => OMEGA.calcEconomics({ ...o, loss_pct: 0 }) } })],
  ['M12_realization_omission', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => OMEGA.calcEconomics({ ...o, realization_pct: 1 }) } })],
  ['M13_gate_bypass_flag', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => ({ ...OMEGA.calcEconomics(o), robustClass: 'CENTRAL-ONLY' }) } })],
  ['M14_gate_bypass_min_viable', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => OMEGA.calcEconomics({ ...o, min_viable_usd: 0, drag_limit: 99 }) } })],
  ['M15_lower_band_inflation', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => ({ ...OMEGA.calcEconomics(o), robustClass: 'ALL-SCENARIO ROBUST' }) } })],
  ['M16_step_sum_mismatch', () => ({ sn: snap, sp: { ...specs, firelight: { ...specs.firelight, precomputed_farm: { ...specs.firelight.precomputed_farm, gas_4w_usd: 99 } } }, en: OMEGA })],
];

const results = mutations.map(([name, mk]) => {
  const { sn, sp, en } = mk();
  try {
    runSuite(en, sn, sp);
    return { name, killed: false };
  } catch (err) {
    return { name, killed: true, caught_by: err.message };
  }
});

const out = {
  baseline_regression: { passed: true, summary: baselinePass },
  mutations_total: results.length,
  mutations_killed: results.filter((m) => m.killed).length,
  mutation_score_pct: +((results.filter((m) => m.killed).length / results.length) * 100).toFixed(1),
  details: results,
};
fs.writeFileSync('research/tribunal/v51_mutation_results.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (out.mutations_killed !== out.mutations_total) process.exit(1);
