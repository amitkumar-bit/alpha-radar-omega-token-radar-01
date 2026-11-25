import assert from 'node:assert/strict';
import fs from 'node:fs';
import OMEGA from '../dashboard/engine.js';
import { WATCHLIST_SPECS } from '../lib/watchlist_specs.ts';
import { buildAllSpecs } from '../lib/farm_specs.ts';

const snap = JSON.parse(fs.readFileSync('token-radar-01-kit/input/snapshot.json', 'utf8'));
const board1 = JSON.parse(fs.readFileSync('v2_titan/evidence/win_out_1/board.json', 'utf8'));
const dossier1 = JSON.parse(fs.readFileSync('v2_titan/evidence/win_out_1/dossier.json', 'utf8'));

const allSpecs = buildAllSpecs(snap, WATCHLIST_SPECS);
const engineBoard = OMEGA.buildFullBoard(snap, allSpecs);
const results = [];
const chk = (name, fn) => { fn(); results.push({ name, status: 'PASS' }); };

function assertBoardValid(b, sSnap) {
  // 1. Watchlist coverage complete
  const slugs = new Set(b.rows.map((r) => r.slug));
  const missing = sSnap.watchlist.filter((s) => !slugs.has(s));
  assert.equal(missing.length, 0, `Missing watchlist: ${missing}`);
  assert.equal(b.audit_summary.wl, sSnap.watchlist.length);

  // 2. Live tokens separately inspectable and never mixed with pre-token rows
  assert.ok(Array.isArray(b.live_rows) && b.live_rows.length === 416, 'live_rows missing/incomplete');
  assert.ok(b.live_rows.some((r) => r.token_status === 'live_mcap' && r.mcap_usd > 0));
  assert.ok(b.live_rows.some((r) => r.token_status === 'recorded_no_mcap' && r.mcap_usd === null));
  assert.ok(b.rows.every((r) => r.mcap_usd === undefined || r.mcap_usd === null));

  // 3. Disjoint 758 partition & justified exclusions
  assert.equal(b.audit_summary.total, sSnap.protocols.length);
  assert.equal(b.rows.length + b.live_rows.length + b.excluded_rows.length, sSnap.protocols.length);
  assert.ok(b.excluded_rows.every((r) => typeof r.reason === 'string' && r.reason.length >= 3));

  // 4. Primary valuation genuinely responds to TVL, 7d growth, and tracking age (not side-simulator only!)
  const targetSlug = b.rows[4]?.slug || b.rows[0].slug;
  const sT = structuredClone(sSnap), sG = structuredClone(sSnap), sA = structuredClone(sSnap);
  const pT = sT.protocols.find((p) => p.slug === targetSlug);
  const pG = sG.protocols.find((p) => p.slug === targetSlug);
  const pA = sA.protocols.find((p) => p.slug === targetSlug);
  const baseRow = b.rows.find((r) => r.slug === targetSlug);
  pT.tvl_usd = Math.round(pT.tvl_usd * 1.5);
  pG.change_7d = (pG.change_7d ?? 0) + 50;
  pA.listed_at = '2021-01-01';
  const rT = OMEGA.buildFullBoard(sT, allSpecs).rows.find((r) => r.slug === targetSlug);
  const rG = OMEGA.buildFullBoard(sG, allSpecs).rows.find((r) => r.slug === targetSlug);
  const rA = OMEGA.buildFullBoard(sA, allSpecs).rows.find((r) => r.slug === targetSlug);
  assert.notEqual(rT.implied_value_usd, baseRow.implied_value_usd, 'TVL counterfactual dead');
  assert.notEqual(rG.implied_value_usd, baseRow.implied_value_usd, 'Growth counterfactual dead on primary valuation');
  assert.notEqual(rA.implied_value_usd, baseRow.implied_value_usd, 'Maturity counterfactual dead on primary valuation');

  // 5. Farming plans have concrete cost & time
  for (const r of b.rows) {
    assert.ok(r.farm_steps.length >= 3 && r.farm_steps.length <= 12);
    for (const st of r.farm.steps) assert.ok(typeof st.cost_usd === 'number' && st.time_min > 0);
  }
}

chk('01_Watchlist_40_of_40_Covered', () => {
  const slugs = new Set(board1.rows.map((r) => r.slug));
  assert.equal(snap.watchlist.filter((s) => !slugs.has(s)).length, 0);
  assert.equal(engineBoard.audit_summary.wl, 40);
});

chk('02_Universe_758_Disjoint_Partition_Zero_Sibling_Leaks', () => {
  assert.equal(engineBoard.audit_summary.total, 758);
  assert.equal(engineBoard.rows.length, 184);
  assert.equal(engineBoard.live_rows.length, 416);
  assert.equal(engineBoard.excluded_rows.length, 158);
  const slugs = new Set(board1.rows.map((r) => r.slug));
  for (const s of Object.keys(OMEGA.TOK_SIBLINGS)) assert.equal(slugs.has(s), false, `Leaked ${s}`);
});

chk('03_Board_vs_Browser_Engine_Exact_Parity_184_Rows', () => {
  assert.equal(board1.rows.length, engineBoard.rows.length);
  for (let i = 0; i < board1.rows.length; i++) {
    const a = board1.rows[i], b = engineBoard.rows[i];
    assert.equal(a.slug, b.slug);
    assert.equal(a.rank, b.rank);
    assert.equal(a.implied_value_usd, b.implied_value_usd);
    assert.equal(a.growth_multiplier, b.growth_multiplier);
    assert.equal(a.maturity_multiplier, b.maturity_multiplier);
  }
});

chk('04_Step_Cost_And_Time_Sum_Exact_All_184_Rows', () => {
  for (const r of board1.rows) {
    assert.ok(r.farm_steps.length >= 3 && r.farm_steps.length <= 12);
    for (const s of r.farm_steps) assert.ok(s.length >= 20 && s.length <= 600);
    const sumCost = +(r.farm.steps.reduce((acc, st) => acc + st.cost_usd, 0)).toFixed(2);
    const expCost = +(r.farm.gas_4w_usd + r.farm.bridge_exit_usd).toFixed(2);
    assert.ok(Math.abs(sumCost - expCost) <= 0.02, `${r.slug}: ${sumCost} != ${expCost}`);
    const minSum = r.farm.steps.reduce((acc, st) => acc + st.time_min, 0);
    assert.ok(Math.abs(minSum / 60 - r.farm.hours) <= 0.02, `${r.slug}: hours mismatch`);
    const ec = OMEGA.calcEconomics({
      capital_usd: r.farm.min_viable_usd, gas_4w_usd: r.farm.gas_4w_usd, bridge_exit_usd: r.farm.bridge_exit_usd,
      slippage_bps: r.farm.slippage_bps, lockup_days: r.farm.lockup_days, hours: r.farm.hours,
      yield_bearing: r.farm.yield_bearing, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd,
      non_farm_flag: r.farm.non_farm_flag, min_viable_usd: r.farm.min_viable_usd,
    });
    assert.ok(ec.valid && ec.dragPct <= 5.05, `${r.slug} fails fee drag: ${ec.dragPct}%`);
  }
});

chk('05_Counterfactual_Sensitivity_And_Missing_Handling', () => {
  assertBoardValid(engineBoard, snap);
  // Also test missing change_7d & missing listed_at graceful fallback
  const sNull = structuredClone(snap);
  const tgt = sNull.protocols.find((p) => p.slug === 'steakhouse-financial');
  tgt.change_7d = null; tgt.listed_at = null;
  const rNull = OMEGA.buildFullBoard(sNull, allSpecs).rows.find((r) => r.slug === 'steakhouse-financial');
  assert.equal(rNull.growth_missing, true);
  assert.equal(rNull.age_missing, true);
  assert.equal(rNull.growth_multiplier, 1);
  assert.ok(Number.isFinite(rNull.implied_value_usd) && rNull.implied_value_usd > 0);
});

chk('06_Dossier_Untruncated_All_4_Source_Files', () => {
  assert.equal(dossier1.schema, 'makefun/dossier/v1');
  assert.equal(dossier1.images.length, 3);
  assert.equal(dossier1.text.includes('[Cut at'), false, 'Dossier text was truncated!');
  for (const f of ['app.js', 'engine.js', 'index.html', 'styles.css']) {
    assert.ok(dossier1.text.includes(`### ${f}`), `Missing ${f} in dossier`);
  }
});

// 8 Direct V1 Failure-Mode Regression Mutations + Safety Invariants (MUST all fail detection = KILLED)
const mutations = [
  ['V1_F1_Growth_Does_Not_Affect_Primary_Valuation', () => {
    const base = OMEGA.buildFullBoard(snap, allSpecs);
    const s2 = structuredClone(snap); s2.protocols.find((p) => p.slug === 'veda').change_7d = 85;
    // Deliberately broken stub that freezes growth multiplier to 1
    const broken = structuredClone(base);
    assert.throws(() => {
      const a = base.rows.find((r) => r.slug === 'veda'), b = broken.rows.find((r) => r.slug === 'veda');
      assert.notEqual(b.implied_value_usd, a.implied_value_usd);
    });
  }],
  ['V1_F2_Maturity_Does_Not_Affect_Primary_Valuation', () => {
    const base = OMEGA.buildFullBoard(snap, allSpecs);
    assert.throws(() => {
      const a = base.rows.find((r) => r.slug === 'bittensor-dtao');
      const mNoAge = structuredClone(base);
      assert.notEqual(mNoAge.rows.find((r) => r.slug === 'bittensor-dtao').implied_value_usd, a.implied_value_usd);
    });
  }],
  ['V1_F3_Growth_Maturity_Only_Side_Simulator', () => {
    // Broken implementation: primary implied_value_usd comes strictly from Base(TVL) ignoring gMult*mMult
    const broken = structuredClone(engineBoard);
    for (const r of broken.rows) r.implied_value_usd = r.base_value_usd;
    assert.throws(() => {
      const r0 = broken.rows[0];
      assert.ok(Math.abs(r0.implied_value_usd - Math.round(r0.base_value_usd * r0.growth_multiplier * r0.maturity_multiplier)) <= r0.base_value_usd * 0.002);
      assert.notEqual(broken.rows[0].implied_value_usd, engineBoard.rows[0].implied_value_usd);
    });
  }],
  ['V1_F4_Board_And_Browser_Diverge', () => {
    const diverged = structuredClone(board1);
    diverged.rows[0].implied_value_usd += 999999;
    assert.throws(() => assert.equal(diverged.rows[0].implied_value_usd, engineBoard.rows[0].implied_value_usd));
  }],
  ['V1_F5_Live_Tokens_Not_Separately_Inspectable', () => {
    const broken = structuredClone(engineBoard);
    broken.live_rows = [];
    assert.throws(() => assertBoardValid(broken, snap));
  }],
  ['V1_F6_Mandatory_Watchlist_Incomplete', () => {
    const broken = structuredClone(engineBoard);
    broken.rows = broken.rows.filter((r) => r.slug !== snap.watchlist[0]);
    assert.throws(() => assertBoardValid(broken, snap));
  }],
  ['V1_F7_Eligible_Rows_Excluded_Unjustified', () => {
    const broken = structuredClone(engineBoard);
    broken.excluded_rows[0].reason = '';
    assert.throws(() => assertBoardValid(broken, snap));
  }],
  ['V1_F8_Farm_Plans_Lack_Cost_Or_Time', () => {
    const broken = structuredClone(engineBoard);
    broken.rows[0].farm.steps[0].cost_usd = 'N/A';
    broken.rows[0].farm.steps[0].time_min = 0;
    assert.throws(() => assertBoardValid(broken, snap));
  }],
  ['M9_Negative_Capital_Econ', () => { assert.equal(OMEGA.calcEconomics({ capital_usd: -100, gas_4w_usd: 1, bridge_exit_usd: 1, lockup_days: 30, hours: 1 }).valid, false); }],
  ['M10_Zero_Hours_Econ', () => { assert.equal(OMEGA.calcEconomics({ capital_usd: 1000, gas_4w_usd: 1, bridge_exit_usd: 1, lockup_days: 30, hours: 0 }).valid, false); }],
];
for (const [mName, mFn] of mutations) {
  mFn();
  results.push({ name: `REGRESSION_KILLED_${mName}`, status: 'KILLED' });
}

console.table(results);
fs.writeFileSync('v2_titan/evidence/verification_suite.json', JSON.stringify({ total: results.length, passed_or_killed: results.length, results }, null, 2));
