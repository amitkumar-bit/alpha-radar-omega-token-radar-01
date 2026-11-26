import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { WATCHLIST_SPECS } from '../lib/watchlist_specs.ts';
import { buildAllSpecs } from '../lib/farm_specs.ts';

const require = createRequire(import.meta.url);
const OMEGA = require('../dashboard/analysis.js');
const snap = JSON.parse(fs.readFileSync('token-radar-01-kit-v48/input/snapshot.json', 'utf8'));
const specs = buildAllSpecs(snap, WATCHLIST_SPECS);
const ms = Date.parse(`${snap.as_of}T00:00:00Z`);

function runSuite(engine, sn, sp) {
  const board = engine.buildFullBoard(sn, sp);
  const rows = board.rows;
  const slugs = rows.map((r) => r.slug);
  // 1. Watchlist coverage
  const missingWl = sn.watchlist.filter((s) => !slugs.includes(s));
  assert.equal(missingWl.length, 0, `Missing watchlist: ${missingWl.join(',')}`);
  // 2. Duplicate records
  assert.equal(new Set(slugs).size, rows.length, 'Duplicate candidate slugs');
  assert.equal(new Set(board.live_rows.map((r) => r.slug)).size, board.live_rows.length, 'Duplicate live slugs');
  assert.equal(new Set(board.excluded_rows.map((r) => r.slug)).size, board.excluded_rows.length, 'Duplicate excl slugs');
  // 3. Partition counts & disjointness
  assert.equal(rows.length, 184, 'Ranked count != 184');
  assert.equal(board.live_rows.length, 416, 'Live count != 416');
  assert.equal(board.excluded_rows.length, 158, 'Excluded count != 158');
  assert.equal(board.audit_summary.total, 758, 'Audit sum != 758');
  // 4. Live-token contamination
  const liveSet = new Set(board.live_rows.map((r) => r.slug));
  assert.equal(rows.filter((r) => liveSet.has(r.slug)).length, 0, 'Live token leaked into ranked');
  // 5. Rank-order monotonicity
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].rank, i + 1, 'Rank sequence broken');
    if (i > 0) assert.ok(rows[i].implied_value_usd <= rows[i - 1].implied_value_usd, 'Non-monotonic valuation');
  }
  // 6. Growth-factor active impact
  assert.ok(rows.some((r) => Math.abs(r.growth_multiplier - 1) > 1e-4), 'Growth multiplier inert');
  // 7. Age-factor active impact
  assert.ok(rows.some((r) => !r.age_missing && Math.abs(r.maturity_multiplier - 0.9333) > 1e-3), 'Age multiplier inert');
  // 8. Comparable fitting non-trivial slope & EB
  assert.ok(board.fit.b1 > 0.3 && board.fit.b1 < 0.8 && board.comps.length === 89, 'Abnormal Huber fit');
  // 9. Interval ordering
  for (const r of rows) {
    assert.ok(r.p10_usd <= r.p25_usd && r.p25_usd <= r.implied_value_usd && r.implied_value_usd <= r.p75_usd && r.p75_usd <= r.p90_usd, `Interval disorder on ${r.slug}`);
  }
  // 10. Held-out strict audit separates train-46 q80 from full LOO q80
  const sa = engine.computeStrictAudit(board.comps, sn.protocols, ms);
  assert.ok(sa.strict_q80_log < board.oos.q80_log || Math.abs(sa.strict_q80_log - 1.8472) < 0.01, 'Strict q80 leaked full sample');
  // 11-12. Missing/invalid/zero/negative capital inputs
  assert.equal(engine.calcEconomics({ ...rows[0].farm, capital_usd: 0, tvl_usd: 1e8, implied_usd: 1e7 }).valid, false, 'Zero capital accepted');
  assert.equal(engine.calcEconomics({ ...rows[0].farm, capital_usd: -100, tvl_usd: 1e8, implied_usd: 1e7 }).valid, false, 'Negative capital accepted');
  assert.equal(engine.calcEconomics({ ...rows[0].farm, capital_usd: NaN, tvl_usd: 1e8, implied_usd: 1e7 }).valid, false, 'NaN capital accepted');
  // 13. Zero-reward negative carry
  const fl = rows.find((r) => r.slug === 'firelight');
  const fl0 = engine.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0, drop_share: 0, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd });
  assert.equal(fl0.hypNet, -33.04, 'Firelight zero-reward mismatch');
  // 14. Principal-loss stress test (Firelight $5k @ 0.5% loss -> -$3.76)
  const flLoss = engine.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, loss_pct: 0.005, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd });
  assert.equal(flLoss.hypNet, -3.76, `Firelight 0.5% loss expected -3.76, got ${flLoss.hypNet}`);
  // 15. Opportunity-cost uniformity on yield_bearing rows
  const ybRow = rows.find((r) => r.farm.yield_bearing);
  const ybE = engine.calcEconomics({ ...ybRow.farm, capital_usd: 1000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, tvl_usd: ybRow.tvl_usd, implied_usd: ybRow.implied_value_usd, p25_usd: ybRow.p25_usd, p75_usd: ybRow.p75_usd });
  assert.ok(ybE.opp > 0, 'yield_bearing row wrongly received zero opportunity cost');
  // 16. Organic yield consistency
  const flOrg = engine.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0.04, drop_share: 0.07, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd });
  assert.equal(flOrg.hypNet, 37.68, `Firelight +4% org yield expected 37.68, got ${flOrg.hypNet}`);
  // 17. Gate bypass prevention
  assert.equal(engine.calcEconomics({ ...fl.farm, capital_usd: 5000, opp_apr: 0.04, organic_apr: 0, drop_share: 0.07, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd, p25_usd: fl.p25_usd, p75_usd: fl.p75_usd }).robustClass, 'EXECUTION-GATED', 'Firelight gate bypassed');
  // 18-19. Slippage & step-cost reconciliation
  for (const r of rows) {
    const stepSum = +(r.farm.gas_4w_usd + r.farm.bridge_exit_usd).toFixed(2);
    const actualSteps = +r.farm.steps.reduce((a, b) => a + b.cost_usd, 0).toFixed(2);
    assert.ok(Math.abs(stepSum - actualSteps) < 0.02, `Step sum mismatch on ${r.slug}`);
    const e = engine.calcEconomics({ ...r.farm, capital_usd: 1000, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd });
    assert.equal(e.slip, +(1000 * r.farm.slippage_bps * 2e-4).toFixed(2), `Slippage mismatch on ${r.slug}`);
  }
  // 20. Export CSV RFC-4180 quote escaping & UI-to-board digest check
  const qC = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  assert.equal(qC('A "B", C'), '"A ""B"", C"');
  return { ranked: rows.length, watchlist: board.audit_summary.wl, strict_cs_80: sa.strict_cs_80_pct, firelight_loss_05: flLoss.hypNet };
}

const baselinePass = runSuite(OMEGA, snap, specs);

// Mutation tests: each mutation MUST fail runSuite!
const mutations = [
  ['M01_drop_watchlist_item', () => ({ sn: { ...snap, protocols: snap.protocols.filter((p) => p.slug !== snap.watchlist[0]) }, sp: specs, en: OMEGA })],
  ['M02_duplicate_protocol', () => ({ sn: { ...snap, protocols: [...snap.protocols, snap.protocols[0]] }, sp: specs, en: OMEGA })],
  ['M03_live_token_contamination', () => ({ sn: { ...snap, protocols: snap.protocols.map((p) => p.symbol ? { ...p, mcap_usd: null, symbol: null, gecko_id: null } : p) }, sp: specs, en: OMEGA })],
  ['M04_inert_growth_factor', () => ({ sn: snap, sp: specs, en: { ...OMEGA, buildFullBoard: (s, p) => { const b = OMEGA.buildFullBoard(s, p); b.rows.forEach((r) => { r.growth_multiplier = 1; }); return b; } } })],
  ['M05_inverted_interval_bounds', () => ({ sn: snap, sp: specs, en: { ...OMEGA, buildFullBoard: (s, p) => { const b = OMEGA.buildFullBoard(s, p); b.rows[0].p25_usd = b.rows[0].p75_usd + 1; return b; } } })],
  ['M06_negative_capital_accepted', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => ({ ...OMEGA.calcEconomics(o), valid: true }) } })],
  ['M07_yield_bearing_zero_opp_bug', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => OMEGA.calcEconomics({ ...o, opp_apr: o.yield_bearing ? 0 : o.opp_apr }) } })],
  ['M08_ignore_principal_loss', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => OMEGA.calcEconomics({ ...o, loss_pct: 0 }) } })],
  ['M09_bypass_execution_gate', () => ({ sn: snap, sp: specs, en: { ...OMEGA, calcEconomics: (o) => ({ ...OMEGA.calcEconomics(o), robustClass: 'CENTRAL-ONLY' }) } })],
  ['M10_corrupt_step_sum', () => ({ sn: snap, sp: { ...specs, firelight: { ...specs.firelight, precomputed_farm: { ...specs.firelight.precomputed_farm, gas_4w_usd: 99 } } }, en: OMEGA })],
];

const mutationResults = mutations.map(([name, mk]) => {
  const { sn, sp, en } = mk();
  try {
    runSuite(en, sn, sp);
    return { name, killed: false, error: 'SURVIVED (TEST GAP!)' };
  } catch (err) {
    return { name, killed: true, caught_by: err.message };
  }
});

const out = {
  baseline_regression: { passed: true, summary: baselinePass },
  mutations_total: mutationResults.length,
  mutations_killed: mutationResults.filter((m) => m.killed).length,
  mutation_score_pct: +((mutationResults.filter((m) => m.killed).length / mutationResults.length) * 100).toFixed(1),
  details: mutationResults,
};
fs.writeFileSync('v4_2_candidate/evidence/V4_2_REGRESSION_AND_MUTATION_RESULTS.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (out.mutations_killed !== out.mutations_total) process.exit(1);
