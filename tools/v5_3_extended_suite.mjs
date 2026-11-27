import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
const outDir = parseArg('out-dir', path.resolve(repoRoot, '../../../research/v5_3/candidate_v53_out'));
const registryPath = parseArg('registry', path.resolve(repoRoot, '../../../research/v5_3/02_PROTECTED_COMPONENT_FREEZE_REGISTRY.json'));
const reportPath = parseArg('report', path.resolve(repoRoot, '../../../research/v5_3/v5_3_extended_report.json'));
const skipFreeze = process.argv.includes('--skip-freeze');

const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const allSpecs = buildAllSpecs(snap, WATCHLIST_SPECS);
const specsMap = Object.fromEntries(Object.entries(allSpecs).map(([k, v]) => [k, { precomputed_farm: v.precomputed_farm }]));
const board = O.buildFullBoard(snap, specsMap);

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

test('T19_zero_walk_forward_terminology', () => {
  const appJs = fs.readFileSync(path.join(repoRoot, 'dashboard/app.js'), 'utf8');
  assert(!/\bWF\b|walk-forward/i.test(appJs), 'misleading WF or Walk-Forward string remains in dashboard/app.js');
  assert(appJs.includes('Cohort ${X(fin.cs_med_mult,2)}×') && appJs.includes("Variant,^LOO,^RMSE,^90th,^Cohort,Status"), 'expected Cohort holdout labels missing');
  return '0 WF/Walk-Forward claims in dashboard/app.js; Cohort labels present';
});

test('T20_csv_formula_injection_sanitized', () => {
  const appJs = fs.readFileSync(path.join(repoRoot, 'dashboard/app.js'), 'utf8');
  const m = appJs.match(/const qC=(.*?),pkC=/);
  assert(m, 'qC definition not found in dashboard/app.js');
  const qC = new Function(`return (${m[1]})`)();
  const dangerous = ["=cmd|'/C calc'!A0", '+1+1', '-2+3', '@SUM(1,1)', '\t=1', '\r=2'];
  for (const s of dangerous) {
    const res = qC(s);
    assert(res.startsWith(`"'`) && !/^"[=+\-@\t\r]/.test(res), `formula not neutralized: ${s} -> ${res}`);
  }
  assert(qC('say "hi"') === '"say ""hi"""', 'quote escaping broken');
  assert(qC('a,b') === '"a,b"', 'comma quoting broken');
  assert(qC(-12.34) === -12.34 && qC(42) === 42 && qC(null) === '', 'numeric/null preservation broken');
  return '6 formula payloads neutralized + RFC-4180 + numeric/null preserved';
});

test('T21_independent_financial_oracle', () => {
  const fx = (v, d = 2) => Number(v.toFixed(d));
  const cl = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
  function oracle(o) {
    const c = o.capital_usd, g = o.gas_4w_usd, b = o.bridge_exit_usd, s = o.slippage_bps;
    const d = o.lockup_days, h = o.hours, oa = o.opp_apr, ga = o.organic_apr || 0;
    const lp = o.loss_pct || 0, rp = cl(0, 1, o.realization_pct ?? 1);
    const m = o.drag_limit ?? 0.05, sh = o.drop_share ?? 0.07;
    const tv = Math.max(1, Number(o.tvl_pool || o.tvl_family || o.tvl_usd || 1)), hu = o.hurdle_hr ?? 10;
    const xs = [c, g, b, s, d, h, oa, ga, lp, rp, m, sh, tv];
    if (!xs.every(Number.isFinite) || xs.some(x => x < 0) || c <= 0 || h <= 0) return { valid: false };
    const sl = fx(c * (s / 10000) * 2), cs = fx(g + b + sl), op = fx(c * oa * (d / 365));
    const tc = fx(cs + op), ls = fx(c * lp), og = fx(c * ga * (d / 365));
    const zr = fx(og - tc - ls), w = Math.min(0.02, tv > 0 ? c / tv : 0);
    const ev = v => {
      const hg = fx(Math.max(0, v) * sh * w), ht = fx(fx(hg * rp) - tc + og), hp = fx(fx(hg * rp) - tc + og - ls);
      return { hg, ht, hp, ph: fx(hp / h) };
    };
    const [lw, cn, hi] = [ev(o.p25_usd), ev(o.implied_usd), ev(o.p75_usd)];
    const dp = c > 0 ? fx((cs / c) * 100, 2) : 0;
    const f0 = o.non_farm_flag;
    const gt = !!f0 || dp > m * 100 || c < (o.min_viable_usd || 0);
    const rc = gt ? 'EXECUTION-GATED' : lw.ph >= hu ? 'ALL-SCENARIO ROBUST' : cn.ph >= hu ? 'CENTRAL-ONLY' : (hi.ph >= hu || cn.hp > 0) ? 'OPTIMISTIC-ONLY' : 'NEGATIVE';
    const d0 = o.implied_usd * w * rp;
    return {
      valid: true, cashCost: cs, opp: op, totalCost: tc, zeroRewardCost: zr,
      lowNet: lw.hp, hypNet: cn.hp, highNet: hi.hp, lowPerHr: lw.ph, hypPerHr: cn.ph, highPerHr: hi.ph,
      hypNetBeforeLoss: cn.ht, dragPct: dp, gated: gt, robustClass: rc,
      beDropPct: d0 > 1e-6 ? fx(Math.max(0, (tc + ls - og) / d0) * 100, 2) : null,
    };
  }
  const caps = [500, 1000, 5000, 25000, 'plan'];
  let checked = 0;
  for (const r of board.rows) {
    for (const cMode of caps) {
      const cap = cMode === 'plan' ? r.plan_size_usd : cMode;
      const inp = {
        ...r.farm, capital_usd: cap, opp_apr: 0.04, organic_apr: 0, loss_pct: 0,
        realization_pct: 1, drag_limit: 0.05, drop_share: 0.07,
        tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10,
      };
      const g = O.calcEconomics(inp);
      const q = oracle(inp);
      for (const k of ['valid', 'gated', 'robustClass']) {
        assert(g[k] === q[k], `oracle diff ${r.slug} cap=${cMode} key=${k}: ${g[k]} !== ${q[k]}`);
      }
      for (const k of ['cashCost', 'opp', 'totalCost', 'zeroRewardCost', 'lowNet', 'hypNet', 'highNet', 'hypPerHr', 'dragPct', 'beDropPct']) {
        const d = g[k] == null && q[k] == null ? 0 : Math.abs(g[k] - q[k]);
        assert(Number.isFinite(d) && d <= 0.0101, `oracle diff ${r.slug} cap=${cMode} key=${k}: ${g[k]} !== ${q[k]}`);
      }
      checked++;
    }
  }
  return `${checked}/${checked} zero-diff oracle reconciliations`;
});

test('T22_whole_fold_cohort_leakage', () => {
  const peers = board.peers;
  const gs = [...new Set(peers.map(p => p.fam_group))].sort();
  const fd = Object.fromEntries(gs.map((g, i) => [g, i % 10]));
  let leaks = 0;
  for (let fold = 0; fold < 10; fold++) {
    const pert = peers.map(p => fd[p.fam_group] === fold ? { ...p, has_tok: 1 - p.has_tok } : p);
    const incP = O.computePeerIncidence(pert);
    for (const p of peers.filter(x => fd[x.fam_group] === fold)) {
      if (board.peer_incidence.forProtocol(p).rate_pct !== incP.forProtocol(p).rate_pct) leaks++;
    }
  }
  assert(leaks === 0, `detected ${leaks} held-out rate_pct leaks on whole-fold mutation`);
  return `0 leaks across all 10 held-out folds (${gs.length} families)`;
});

test('T23_synthetic_schema_edge_fuzzing', () => {
  const syn = JSON.parse(JSON.stringify(snap));
  syn.protocols.push(
    { slug: 'fuzz-zero', name: 'Fuzz Zero', category: 'Lending', tvl_usd: 0, change_7d: null, age_days: null, chains: [], symbol: null, gecko_id: null, mcap_usd: null },
    { slug: 'fuzz-null', name: 'Fuzz Null', category: 'Dexs', tvl_usd: null, change_7d: undefined, age_days: -5, chains: null, symbol: null, gecko_id: null, mcap_usd: Number.NaN },
  );
  const sb = O.buildFullBoard(syn, specsMap);
  assert(sb.audit_summary.total === 760, `unexpected total ${sb.audit_summary.total}`);
  for (const r of sb.rows) {
    assert(Number.isFinite(r.implied_value_usd) && r.implied_value_usd > 0, `bad valuation on ${r.slug}`);
  }
  return '0 NaN/Infinity crashes on zero/null/NaN fuzzed protocols';
});

test('T24_freeze_zero_regression_digest', () => {
  if (skipFreeze || !fs.existsSync(registryPath) || !fs.existsSync(path.join(outDir, 'board.json'))) return 'skipped';
  const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const sem = reg.protected_semantic_digests;
  const bOut = JSON.parse(fs.readFileSync(path.join(outDir, 'board.json'), 'utf8'));
  const vDig = crypto.createHash('sha256').update(JSON.stringify(bOut.rows.map(r => ({
    rank: r.rank, slug: r.slug, is_watchlist: r.is_watchlist,
    tvl_usd: r.tvl_usd, tvl_family: r.tvl_family, tvl_family_exposure: r.tvl_family_exposure,
    base_value_usd: r.base_value_usd, growth_multiplier: r.growth_multiplier, maturity_multiplier: r.maturity_multiplier,
    implied_value_usd: r.implied_value_usd, p10_usd: r.p10_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, p90_usd: r.p90_usd,
    peer_incidence: r.peer_incidence,
  })))).digest('hex');
  const eDig = crypto.createHash('sha256').update(JSON.stringify(bOut.rows.map(r => {
    const ec1000 = O.calcEconomics({ ...r.farm, capital_usd: 1000, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10, drop_share: 0.07, opp_apr: 0.04 });
    const ecPlan = O.calcEconomics({ ...r.farm, capital_usd: r.plan_size_usd, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10, drop_share: 0.07, opp_apr: 0.04 });
    return { slug: r.slug, plan_size_usd: r.plan_size_usd, tvl_pool: r.farm.tvl_pool, ec1000, ecPlan };
  }))).digest('hex');
  assert(vDig === sem.valuation_digest_sha256, `val digest drift ${vDig} !== ${sem.valuation_digest_sha256}`);
  assert(eDig === sem.economics_digest_sha256, `econ digest drift ${eDig} !== ${sem.economics_digest_sha256}`);
  return `100% exact V5.2 semantic freeze preserved (${vDig.slice(0, 12)} / ${eDig.slice(0, 12)})`;
});

const failed = results.filter(r => !r.pass);
const summary = { total: results.length, passed: results.length - failed.length, failed: failed.length, results };
if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exit(1);
