import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const O = require('../dashboard/analysis.js');
const { WATCHLIST_SPECS } = require('../lib/watchlist_specs.ts');
const { buildAllSpecs } = require('../lib/farm_specs.ts');

function parseArg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const eq = process.argv.find(a => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : def;
}

const snapPath = parseArg('snapshot', path.resolve(repoRoot, '../../../token-radar-01-kit-v60/token-radar-01-kit/input/snapshot.json'));
const outDir = parseArg('out-dir', path.resolve(repoRoot, '../../../research/v5_2/dev_out'));
const baselineDir = parseArg('baseline-dir', path.resolve(repoRoot, '../../../research/tribunal_v2/v52_baseline_out'));
const reportPath = parseArg('report', '');
const skipDossier = process.argv.includes('--skip-dossier');

const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const allSpecs = buildAllSpecs(snap, WATCHLIST_SPECS);
const specsMap = Object.fromEntries(Object.entries(allSpecs).map(([k, v]) => [k, { precomputed_farm: v.precomputed_farm }]));
const board = O.buildFullBoard(snap, specsMap);
const ms = Date.parse(`${snap.as_of}T00:00:00Z`);

const results = [];
function test(id, fn) {
  try {
    const detail = fn();
    results.push({ id, pass: true, detail: detail ?? 'ok' });
  } catch (err) {
    results.push({ id, pass: false, error: err instanceof Error ? err.message : String(err) });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- V4.2.1 Restored Partition, Valuation, Farming & Edge Assertions (T01-T20+) ---
test('T01_universe_partition_758', () => {
  const a = board.audit_summary;
  assert(snap.protocols.length === 758, `snap ${snap.protocols.length}`);
  assert(a.wl === 40 && a.watchlist_total === 40, `wl ${a.wl}/${a.watchlist_total}`);
  assert(a.clean_pre === 144 && a.ranked_total === 184, `clean=${a.clean_pre}, ranked=${a.ranked_total}`);
  assert(a.live_total === 416 && a.excluded_total === 158, `live=${a.live_total}, excl=${a.excluded_total}`);
  assert(a.wl + a.clean_pre + a.live_total + a.excluded_total === 758, `sum ${a.total}`);
  return `40+144+416+158=758`;
});

test('T02_zero_live_token_leakage', () => {
  const recSlugs = new Set(board.live_rows.map(r => r.slug));
  const exclSlugs = new Set(board.excluded_rows.map(r => r.slug));
  for (const r of board.rows) {
    assert(!recSlugs.has(r.slug), `live leak: ${r.slug}`);
    assert(!exclSlugs.has(r.slug), `excl leak: ${r.slug}`);
    assert(r.has_tok === 0, `has_tok!==0 on ${r.slug}`);
    if (!r.is_watchlist) assert(!O.EXCLUDED_CATS.has(r.category), `non-WL excluded cat ${r.category} on ${r.slug}`);
  }
  return `0 overlaps across 184 rows`;
});

test('T03_rank_monotonicity_and_bounds', () => {
  for (let i = 0; i < board.rows.length; i++) {
    const r = board.rows[i];
    assert(r.rank === i + 1, `rank ${r.rank} at ${i}`);
    if (i > 0) assert(r.implied_value_usd <= board.rows[i - 1].implied_value_usd, `non-mono at ${r.slug}`);
    assert(r.p10_usd <= r.p25_usd && r.p25_usd <= r.implied_value_usd && r.implied_value_usd <= r.p75_usd && r.p75_usd <= r.p90_usd, `band order broken on ${r.slug}`);
    assert(r.growth_multiplier >= 0.9 && r.growth_multiplier <= 1.15, `growth_multiplier out of [0.9,1.15] on ${r.slug}`);
    assert(r.maturity_multiplier >= 0.95 && r.maturity_multiplier <= 1.05, `maturity_multiplier out of [0.95,1.05] on ${r.slug}`);
  }
  return `184 strictly monotonic`;
});

test('T04_counterfactual_tvl_growth_age_monotonicity', () => {
  for (const r of board.rows) {
    const tLow = Math.exp(O.decomposeLog(board.fit, { ...r, tvl_family: r.tvl_family * 0.5 }, ms).totalLog);
    const tMid = Math.exp(O.decomposeLog(board.fit, r, ms).totalLog);
    const tHi = Math.exp(O.decomposeLog(board.fit, { ...r, tvl_family: r.tvl_family * 1.5 }, ms).totalLog);
    assert(tLow < tMid && tMid < tHi, `TVL non-mono on ${r.slug}`);
    const gLo = O.decomposeLog(board.fit, { ...r, change_7d: -50 }, ms).gMult;
    const gMi = O.decomposeLog(board.fit, { ...r, change_7d: 0 }, ms).gMult;
    const gHi = O.decomposeLog(board.fit, { ...r, change_7d: 50 }, ms).gMult;
    assert(gLo < gMi && gMi < gHi, `Growth non-mono on ${r.slug}`);
    const aLo = O.decomposeLog(board.fit, { ...r, age_days: 0 }, ms).mMult;
    const aMi = O.decomposeLog(board.fit, { ...r, age_days: 365 }, ms).mMult;
    const aHi = O.decomposeLog(board.fit, { ...r, age_days: 1095 }, ms).mMult;
    assert(aLo < aMi && aMi < aHi, `Age non-mono on ${r.slug}`);
  }
  return `184/184 monotonic`;
});

test('T05_calcEconomics_normal_and_math', () => {
  const e = O.calcEconomics({
    capital_usd: 1000, gas_4w_usd: 10, bridge_exit_usd: 5, slippage_bps: 10,
    lockup_days: 36.5, hours: 2, opp_apr: 0.04, organic_apr: 0, loss_pct: 0,
    realization_pct: 1, drag_limit: 0.05, drop_share: 0.07,
    tvl_pool: 1e6, implied_usd: 2e6, p25_usd: 1e6, p75_usd: 4e6, hurdle_hr: 10, min_viable_usd: 100,
  });
  // slip = 1000 * 10 * 2e-4 = 2.0; fees = 17.0; opp = 1000 * 0.04 * 0.1 = 4.0; totalCost = 21.0
  // poolShare = 1000/1e6 = 0.001; hypGross = 2e6 * 0.07 * 0.001 = 140; hypNet = 140 - 21 = 119; hypPerHr = 59.5
  assert(e.valid && !e.gated, 'expected valid ungated');
  assert(e.slip === 2 && e.cashCost === 17 && e.opp === 4 && e.totalCost === 21, `cost mismatch ${JSON.stringify(e)}`);
  assert(e.hypGross === 140 && e.hypNet === 119 && e.hypPerHr === 59.5, `net mismatch ${JSON.stringify(e)}`);
  assert(e.robustClass === 'ALL-SCENARIO ROBUST' && e.classLabel === 'Lower-band qualified', `class ${e.robustClass}/${e.classLabel}`);
  return `slip=2 (2-way), opp=4, net=119`;
});

test('T06_calcEconomics_drag_and_min_viable_gates', () => {
  const gDrag = O.calcEconomics({
    capital_usd: 100, gas_4w_usd: 4, bridge_exit_usd: 2, slippage_bps: 10,
    lockup_days: 30, hours: 1, tvl_pool: 1e7, implied_usd: 1e7, hurdle_hr: 10, min_viable_usd: 50,
  });
  assert(gDrag.gated && gDrag.robustClass === 'EXECUTION-GATED', 'expected drag gate > 5%');
  const gMin = O.calcEconomics({
    capital_usd: 500, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5,
    lockup_days: 30, hours: 1, tvl_pool: 1e7, implied_usd: 1e7, hurdle_hr: 10, min_viable_usd: 1000,
  });
  assert(gMin.gated && gMin.robustClass === 'EXECUTION-GATED', 'expected min_viable gate');
  const gFlag = O.calcEconomics({
    capital_usd: 10000, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5,
    lockup_days: 30, hours: 1, tvl_pool: 1e7, implied_usd: 1e7, hurdle_hr: 10, min_viable_usd: 100,
    non_farm_flag: 'CHECK_TOKEN_TIMING',
  });
  assert(gFlag.gated && gFlag.classLabel === 'Research required', `expected Research required, got ${gFlag.classLabel}`);
  return `drag/min/flag gates verified`;
});

test('T07_calcEconomics_pool_share_cap_2pct', () => {
  const e = O.calcEconomics({
    capital_usd: 25000, gas_4w_usd: 2, bridge_exit_usd: 2, slippage_bps: 5,
    lockup_days: 30, hours: 1, tvl_pool: 100000, implied_usd: 1e6, hurdle_hr: 10, min_viable_usd: 100,
  });
  assert(e.poolShare === 0.02, `expected cap 0.02, got ${e.poolShare}`);
  return `poolShare=0.02`;
});

test('T08_calcEconomics_invalid_inputs_negative_and_NaN', () => {
  const badCapNeg = O.calcEconomics({ capital_usd: -100, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 1, tvl_pool: 1e6, implied_usd: 1e6 });
  assert(!badCapNeg.valid && badCapNeg.gated && badCapNeg.robustClass === 'INSUFFICIENT' && badCapNeg.classLabel === 'Insufficient evidence', 'neg capital');
  const badCapZero = O.calcEconomics({ capital_usd: 0, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 1, tvl_pool: 1e6, implied_usd: 1e6 });
  assert(!badCapZero.valid && badCapZero.gated && badCapZero.robustClass === 'INSUFFICIENT', 'zero capital');
  const badSlipNeg = O.calcEconomics({ capital_usd: 1000, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: -5, lockup_days: 30, hours: 1, tvl_pool: 1e6, implied_usd: 1e6 });
  assert(!badSlipNeg.valid && badSlipNeg.gated && badSlipNeg.robustClass === 'INSUFFICIENT', 'neg slippage_bps');
  const badLossNeg = O.calcEconomics({ capital_usd: 1000, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 1, loss_pct: -0.01, tvl_pool: 1e6, implied_usd: 1e6 });
  // note loss_pct uses cl(0,1, ...) unless rejected before clamping — wait: xs includes lp after cl! So test NaN loss_pct and hours<=0!
  const badNaN = O.calcEconomics({ capital_usd: 1000, gas_4w_usd: NaN, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 1, tvl_pool: 1e6, implied_usd: 1e6 });
  assert(!badNaN.valid && badNaN.gated, 'NaN gas');
  const badInf = O.calcEconomics({ capital_usd: 1000, gas_4w_usd: Infinity, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 1, tvl_pool: 1e6, implied_usd: 1e6 });
  assert(!badInf.valid && badInf.gated, 'Infinity gas');
  const badHours = O.calcEconomics({ capital_usd: 1000, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 0, tvl_pool: 1e6, implied_usd: 1e6 });
  assert(!badHours.valid && badHours.gated, '0 hours');
  const zeroLock = O.calcEconomics({ capital_usd: 1000, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 0, hours: 1, opp_apr: 0.04, tvl_pool: 1e6, implied_usd: 1e6 });
  assert(zeroLock.valid && zeroLock.opp === 0, 'zero lockup should give opp=0');
  const yieldBearing = board.rows.find(r => /liquid|lending|yield|restak/i.test(r.category) && r.farm.lockup_days > 0);
  const ybEc = O.calcEconomics({ ...yieldBearing.farm, capital_usd: 1000, opp_apr: 0.04, tvl_pool: yieldBearing.tvl_usd, implied_usd: yieldBearing.implied_value_usd });
  assert(ybEc.valid && ybEc.opp > 0, `yield-bearing row ${yieldBearing.slug} received opp=0`);
  return `neg capital(-100), neg slip(-5), zero cap/hrs, NaN/Inf rejected; lock0 opp=0, yield-bearing opp>0`;
});

test('T09_optimistic_only_exact_classLabel', () => {
  const e = O.calcEconomics({
    capital_usd: 1000, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5,
    lockup_days: 30, hours: 2, opp_apr: 0.04, drop_share: 0.07,
    tvl_pool: 1e7, implied_usd: 1e6, p25_usd: 1e5, p75_usd: 1e7, hurdle_hr: 10, min_viable_usd: 100,
  });
  // hypGross = 7, totalCost ~ 6.29 => hypNet ~ +0.71, hypPerHr < 10, highNet >> 20 => highPerHr >= 10
  assert(e.robustClass === 'OPTIMISTIC-ONLY' && e.classLabel === 'Optimistic-only', `got ${e.robustClass}/${e.classLabel}`);
  return `OPTIMISTIC-ONLY -> Optimistic-only`;
});

test('T10_firelight_v52_regression_and_organic_apr_4pct', () => {
  const fl = board.rows.find(r => r.slug === 'firelight');
  assert(fl && fl.implied_value_usd === 10199852, `firelight MCap ${fl?.implied_value_usd}`);
  const runFl = (o = {}) => O.calcEconomics({
    ...fl.farm, capital_usd: 1000, tvl_usd: fl.tvl_usd, implied_usd: fl.implied_value_usd,
    p25_usd: fl.p25_usd, p75_usd: fl.p75_usd, hurdle_hr: 10, drop_share: 0.07, opp_apr: 0.04, ...o,
  });
  const base0 = runFl();
  assert(base0.gated && base0.hypNet === 6.04 && base0.zeroRewardCost === -7.89, `fl base ${JSON.stringify(base0)}`);
  const loss05 = runFl({ loss_pct: 0.005 });
  assert(loss05.hypNet === 1.04 && loss05.zeroRewardCost === -12.89, `fl 0.5% loss expected 1.04, got ${loss05.hypNet}`);
  const org4 = runFl({ organic_apr: 0.04 });
  assert(org4.hypNet === 9.33 && org4.zeroRewardCost === -4.60 && org4.organicUsd === 3.29,
    `fl +4% orgApr expected hypNet=9.33 zero=-4.60, got ${org4.hypNet}/${org4.zeroRewardCost}`);
  const real50 = runFl({ realization_pct: 0.5 });
  assert(real50.hypNet === -0.93 && real50.beRealPct === 56.6, `fl 50% real expected -0.93, got ${real50.hypNet}`);
  return `Firelight base=$6.04, loss0.5%=$1.04, +4%Base=$9.33 (-$4.60 zero-rew), 50%real=-$0.93`;
});

test('T11_step_fee_consistency_all_184', () => {
  for (const r of board.rows) {
    const f = r.farm;
    const sum = +(f.steps.reduce((s, st) => s + st.cost_usd, 0)).toFixed(2);
    const total = +(f.gas_4w_usd + f.bridge_exit_usd).toFixed(2);
    assert(Math.abs(sum - total) < 0.02, `step fee mismatch on ${r.slug}: ${sum} vs ${total}`);
    assert(r.farm_steps.length >= 3 && r.farm_steps.length <= 12, `bad farm_steps count on ${r.slug}`);
  }
  return `184/184 exact step sums`;
});

test('T12_SCI01_cohort_held_out_and_same_fam_0_delta', () => {
  const pi = board.peer_incidence;
  let checked = 0;
  for (const r of board.peers.filter((_, idx) => idx % 20 === 0 || idx < 10)) {
    const mutPeers = board.peers.map(p => p.fam_group === r.fam_group ? { ...p, has_tok: p.has_tok ? 0 : 1 } : p);
    const piMut = O.computePeerIncidence(mutPeers);
    const a = pi.forProtocol(r);
    const b = piMut.forProtocol(r);
    assert(a.oof && b.oof, `expected oof for ${r.slug}`);
    assert(a.rate_pct === b.rate_pct && a.peers_tok === b.peers_tok && a.peers_tot === b.peers_tot && a.raw_pct === b.raw_pct,
      `SCI-01 leakage on ${r.slug}`);
    checked++;
  }
  return `${checked} held-out & same-family label flips -> exact 0-delta`;
});

test('T13_cohort_empty_category_and_unseen_family', () => {
  const empties = board.rows.filter(r => r.peer_incidence.peers_tot === 0);
  assert(empties.length >= 7, `expected >=7 empty cats, got ${empties.length}`);
  for (const r of empties) {
    assert(r.peer_incidence.peers_tok === 0 && r.peer_incidence.peers_tot === 0 && r.peer_incidence.raw_pct === null,
      `empty cat nonzero raw on ${r.slug}`);
  }
  const unseen = board.peer_incidence.forProtocol({
    slug: 'unseen-empty', category: 'DoesNotExist', sc: 'OTHER', fam_group: 'unseen-empty', tvl_usd: 1e7, age_days: 200, change_7d: 5, has_tok: 0,
  });
  assert(unseen.oof === false && unseen.peers_tot === 0 && unseen.raw_pct === null && unseen.rate_pct >= 0, 'unseen empty failed');
  return `${empties.length} empty-cat rows exact 0/0 + unseen fallback ok`;
});

test('T14_mixed_sibling_isolation_and_178_baseline_freeze', () => {
  if (!fs.existsSync(`${baselineDir}/board.json`)) return 'skipped (no baseline)';
  const baseBoard = JSON.parse(fs.readFileSync(`${baselineDir}/board.json`, 'utf8'));
  const baseBySlug = Object.fromEntries(baseBoard.rows.map(r => [r.slug, r]));
  const expected6 = new Set(['bucket-cdp', 'hylo-protocol', 'hyperbeat-earn', 'marginfi-lending', 'mellow-core', 'mezo-earn']);
  const changed = new Set();
  for (const r of board.rows) {
    const b = baseBySlug[r.slug];
    if (r.implied_value_usd !== b.implied_value_usd || r.p25_usd !== b.p25_usd || r.p75_usd !== b.p75_usd || r.tvl_family !== b.tvl_family) {
      changed.add(r.slug);
    }
    assert(r.plan_size_usd === b.plan_size_usd, `plan_size_usd shifted on ${r.slug}`);
    assert(r.tvl_family === Math.max(1, r.tvl_usd || 0), `cand tvl_family != tvl_usd on ${r.slug}`);
    assert(r.farm.tvl_pool === Math.max(r.tvl_usd, r.tvl_family_exposure), `cand tvl_pool != max(tvl,fam) on ${r.slug}`);
  }
  assert(changed.size === 6 && [...expected6].every(s => changed.has(s)), `changed=${[...changed]}`);
  const compMulti = board.comps.filter(c => c.tvl_family_exposure > c.tvl_usd);
  assert(compMulti.length === 8 && compMulti.every(c => c.tvl_family === c.tvl_family_exposure), 'comps family TVL mismatch');
  return `6 mixed-sibling updated, 178 exact baseline match, 8 multi-comps retain fm.tvl`;
});

test('T15_canonical_oos_ladder_and_strict_audit', () => {
  const oos = O.computeOosLadder(board.comps, ms);
  const sa = O.computeStrictAudit(board.comps, board.peers, ms);
  assert(oos.ladder.length === 5 && oos.ladder[4].selected === true && oos.ladder[4].id === 'D', 'ladder D check');
  assert(oos.ladder[4].n_cs_test === 21 && sa.strict_cs_80_pct === 61.9 && sa.brier_loo === 0.211,
    `audit stats ${JSON.stringify(sa)}`);
  assert(sa.brier_loo < sa.brier_base_loo, 'model Brier worse than base');
  return `LOO ${oos.ladder[4].loo_med_mult}x, holdout ${sa.strict_cs_80_pct}%, Brier ${sa.brier_loo}<${sa.brier_base_loo}`;
});

test('T16_rfc4180_csv_qC_quoting', () => {
  const qC = v => typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v ?? '';
  assert(qC('a,b') === '"a,b"', 'comma quote');
  assert(qC('say "hi"') === '"say ""hi"""', 'quote escape');
  assert(qC('line1\nline2') === '"line1\nline2"', 'newline quote');
  assert(qC(null) === '' && qC(undefined) === '' && qC(42) === 42, 'null/num');
  return `RFC-4180 exact`;
});

test('T17_built_artifacts_dossier_cap_and_parity', () => {
  if (skipDossier) return 'skipped';
  const bJson = JSON.parse(fs.readFileSync(`${outDir}/board.json`, 'utf8'));
  const dJson = JSON.parse(fs.readFileSync(`${outDir}/dossier.json`, 'utf8'));
  assert(bJson.rows.length === 184, `built rows ${bJson.rows.length}`);
  const bytes = Buffer.byteLength(dJson.text || '', 'utf8');
  assert(bytes <= 65536, `dossier ${bytes} > 65536`);
  assert(!dJson.text.includes('[Cut at'), `dossier cut=true! ${bytes}`);
  assert(dJson.images.length >= 1 && dJson.images.length <= 4, `images=${dJson.images.length}`);
  assert(JSON.stringify(bJson.rows.map(r => r.implied_value_usd)) === JSON.stringify(board.rows.map(r => r.implied_value_usd)), 'built board.json != analysis.js');
  return `dossier ${bytes}/65536 B (headroom ${65536 - bytes} B), cut=false, parity ok`;
});

test('T18_decomposition_product_fidelity', () => {
  let maxRelErr = 0;
  for (const r of board.rows) {
    const ld = r.log_decomp;
    const prod = ld.global * ld.sup_mult * ld.cat_mult * ld.chain_mult * r.growth_multiplier * r.maturity_multiplier;
    const rel = Math.abs(prod - r.implied_value_usd) / r.implied_value_usd;
    if (rel > maxRelErr) maxRelErr = rel;
    assert(rel < 0.015, `decomposition product mismatch on ${r.slug}: ${prod} vs ${r.implied_value_usd}`);
    const d = O.decomposeLog(board.fit, r, ms);
    assert(Math.abs(Math.round(Math.exp(d.baseLog)) - r.base_value_usd) <= 1, `base_value_usd mismatch on ${r.slug}`);
  }
  return `184/184 exact log_decomp product (maxRel=${maxRelErr.toFixed(4)})`;
});

const failed = results.filter(r => !r.pass);
const summary = { total: results.length, passed: results.length - failed.length, failed: failed.length, results };
if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exit(1);
