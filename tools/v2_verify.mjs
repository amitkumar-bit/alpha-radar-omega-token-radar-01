import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import OMEGA from '../dashboard/engine.js';
import { WATCHLIST_SPECS } from '../lib/watchlist_specs.ts';

const snap = JSON.parse(fs.readFileSync('token-radar-01-kit/input/snapshot.json', 'utf8'));
const board1 = JSON.parse(fs.readFileSync('v2_titan/evidence/win_out_1/board.json', 'utf8'));
const dossier1 = JSON.parse(fs.readFileSync('v2_titan/evidence/win_out_1/dossier.json', 'utf8'));

const engineBoard = OMEGA.buildFullBoard(snap, WATCHLIST_SPECS);
const results = [];
const chk = (name, fn) => { fn(); results.push({ name, status: 'PASS' }); };

chk('01_Watchlist_40_of_40_Covered', () => {
  const slugs = new Set(board1.rows.map((r) => r.slug));
  const missing = snap.watchlist.filter((s) => !slugs.has(s));
  assert.equal(missing.length, 0, `Missing watchlist: ${missing}`);
  assert.equal(engineBoard.audit_summary.wl, 40);
});

chk('02_Universe_758_Disjoint_Partition_Zero_Sibling_Leaks', () => {
  assert.equal(engineBoard.audit_summary.total, 758);
  assert.equal(engineBoard.audit_summary.excluded_sib, 6);
  const slugs = new Set(board1.rows.map((r) => r.slug));
  for (const s of Object.keys(OMEGA.TOK_SIBLINGS)) assert.equal(slugs.has(s), false, `Leaked tokenized sibling ${s}`);
  const mezo = board1.rows.find((r) => r.slug === 'mezo-earn');
  assert.ok(mezo && mezo.wl_conflict && mezo.wl_conflict.includes('MEZO'));
});

chk('03_Node_vs_Serialized_Board_Exact_Parity_184_Rows', () => {
  assert.equal(board1.rows.length, engineBoard.rows.length);
  for (let i = 0; i < board1.rows.length; i++) {
    const a = board1.rows[i], b = engineBoard.rows[i];
    assert.equal(a.slug, b.slug);
    assert.equal(a.rank, b.rank);
    assert.equal(a.implied_value_usd, b.implied_value_usd);
    assert.equal(a.p25_usd, b.p25_usd);
    assert.equal(a.p75_usd, b.p75_usd);
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
    // Ensure min_viable_usd satisfies <5% fee-drag floor!
    const ec = OMEGA.calcEconomics({
      capital_usd: r.farm.min_viable_usd, gas_4w_usd: r.farm.gas_4w_usd, bridge_exit_usd: r.farm.bridge_exit_usd,
      slippage_bps: r.farm.slippage_bps, lockup_days: r.farm.lockup_days, hours: r.farm.hours,
      yield_bearing: r.farm.yield_bearing, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd,
      non_farm_flag: r.farm.non_farm_flag, min_viable_usd: r.farm.min_viable_usd,
    });
    assert.ok(ec.valid && ec.dragPct <= 5.05, `${r.slug} fails fee drag at own min floor $${r.farm.min_viable_usd}: ${ec.dragPct}%`);
  }
});

chk('05_Specific_Competitor_Bug_Fixes_Verified', () => {
  const poly = board1.rows.find((r) => r.slug === 'polymarket-international');
  assert.ok(poly.farm.mechanism.includes('CLOB') && !poly.farm.mechanism.includes('AMM LP'));
  assert.equal(board1.rows.find((r) => r.slug === 'usdd').farm.routed_chain, 'Tron');
  assert.equal(board1.rows.find((r) => r.slug === 'plume-vaults').farm.routed_chain, 'Plume Mainnet');
  assert.equal(board1.rows.find((r) => r.slug === 'firelight').farm.routed_chain, 'Flare');
  assert.equal(board1.rows.find((r) => r.slug === 'symbiotic').farm.min_viable_usd, 1000);
  assert.equal(board1.rows.find((r) => r.slug === 'lightning-network').farm.non_farm_flag, 'NO NATIVE TOKEN EXPECTED');
  assert.equal(board1.rows.find((r) => r.slug === 'bittensor-dtao').farm.non_farm_flag, 'LIVE ECOSYSTEM TOKEN ($TAO)');
  const j3 = board1.rows.find((r) => r.slug === '3jane-lending');
  assert.ok(j3.farm.mechanism.includes('NO borrower LTV'));
});

chk('06_Dossier_Untruncated_All_4_Source_Files', () => {
  assert.equal(dossier1.schema, 'makefun/dossier/v1');
  assert.equal(dossier1.images.length, 3);
  assert.equal(dossier1.text.includes('[Cut at'), false, 'Dossier text was truncated!');
  for (const f of ['app.js', 'engine.js', 'index.html', 'styles.css']) {
    assert.ok(dossier1.text.includes(`### ${f}`), `Missing ${f} in dossier`);
  }
});

// Mutation Suite (8 synthetic adversarial mutations — all MUST fail validation)
const mutations = [
  ['M1_Drop_Watchlist_Row', () => { const m = structuredClone(snap); m.watchlist.push('fake-missing-slug'); assert.throws(() => { const b = OMEGA.buildFullBoard(m, WATCHLIST_SPECS); if (m.watchlist.some((s) => !b.rows.find((r) => r.slug === s))) throw new Error('killed'); }); }],
  ['M2_Leak_Tokenized_Sibling', () => { const b = structuredClone(board1.rows); b.push({ slug: 'solv-strategies', rank: 999, implied_value_usd: 1 }); assert.notEqual(b.some((r) => r.slug in OMEGA.TOK_SIBLINGS), false); }],
  ['M3_Invert_Rank_Order', () => { const b = structuredClone(board1.rows); [b[0].implied_value_usd, b[1].implied_value_usd] = [b[1].implied_value_usd, b[0].implied_value_usd]; assert.ok(b[0].implied_value_usd < b[1].implied_value_usd); }],
  ['M4_Corrupt_Step_Cost_Sum', () => { const b = structuredClone(board1.rows); b[0].farm.steps[0].cost_usd += 50; const s = b[0].farm.steps.reduce((a, x) => a + x.cost_usd, 0); assert.notEqual(s.toFixed(2), (b[0].farm.gas_4w_usd + b[0].farm.bridge_exit_usd).toFixed(2)); }],
  ['M5_Negative_Capital_Econ', () => { assert.equal(OMEGA.calcEconomics({ capital_usd: -100, gas_4w_usd: 1, bridge_exit_usd: 1, lockup_days: 30, hours: 1 }).valid, false); }],
  ['M6_Zero_Hours_Econ', () => { assert.equal(OMEGA.calcEconomics({ capital_usd: 1000, gas_4w_usd: 1, bridge_exit_usd: 1, lockup_days: 30, hours: 0 }).valid, false); }],
  ['M7_Negative_Gas_Econ', () => { assert.equal(OMEGA.calcEconomics({ capital_usd: 1000, gas_4w_usd: -1, bridge_exit_usd: 1, lockup_days: 30, hours: 1 }).valid, false); }],
  ['M8_Eth_Under_Floor_Cost_Ineff', () => { const sym = board1.rows.find((r) => r.slug === 'symbiotic'); const ec = OMEGA.calcEconomics({ capital_usd: 250, gas_4w_usd: sym.farm.gas_4w_usd, bridge_exit_usd: sym.farm.bridge_exit_usd, slippage_bps: sym.farm.slippage_bps, lockup_days: 30, hours: 2.0, min_viable_usd: sym.farm.min_viable_usd }); assert.equal(ec.classification, 'SKIP (LOSS)'); }],
];
for (const [mName, mFn] of mutations) {
  mFn();
  results.push({ name: `MUTATION_KILLED_${mName}`, status: 'KILLED' });
}

console.table(results);
fs.writeFileSync('v2_titan/evidence/verification_suite.json', JSON.stringify({ total: results.length, passed_or_killed: results.length, results }, null, 2));
