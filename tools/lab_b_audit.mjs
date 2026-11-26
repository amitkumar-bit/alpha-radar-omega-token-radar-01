import fs from 'node:fs';
import OMEGA from '../dashboard/analysis.js';
import { WATCHLIST_SPECS } from '../lib/watchlist_specs.ts';
import { buildAllSpecs } from '../lib/farm_specs.ts';

const snap = JSON.parse(fs.readFileSync('token-radar-01-kit-v48/input/snapshot.json', 'utf8'));
const allSpecs = buildAllSpecs(snap, WATCHLIST_SPECS);
const board = OMEGA.buildFullBoard(snap, allSpecs);
const fx = (n, d = 2) => +Number(n).toFixed(d);

// Verify OMEGA.calcEconomics directly (now includes native organic_apr sensitivity, default 0)
const calcEconomicsWithYield = (o) => {
  const base = OMEGA.calcEconomics(o);
  return {
    ...base,
    organicApr: +(o.organic_apr ?? 0),
    zeroRewardNetWithOrg: base.zeroRewardCost,
    hypNetWithOrg: base.hypNet,
    hypPerHrWithOrg: base.hypPerHr,
  };
};

let stepMismatch = 0, negativeCashCost = 0, zeroDropFail = 0, gatedCount = 0;
let positiveAtZeroDropNoOrg = 0, positiveAtZeroDrop4pctOrg = 0, positiveAtZeroDrop8pctOrg = 0;
let ungatedHurdle1k = 0, rawMathHurdle1k = 0;

for (const r of board.rows) {
  const f = r.farm;
  const stepSum = fx(f.steps.reduce((a, s) => a + s.cost_usd, 0));
  const stepTot = fx(f.gas_4w_usd + f.bridge_exit_usd);
  if (Math.abs(stepSum - stepTot) > 0.02) stepMismatch++;

  const e0 = calcEconomicsWithYield({ ...f, capital_usd: 1000, opp_apr: 0.04, drag_limit: 0.05, drop_share: 0.07, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10, organic_apr: 0 });
  const eZ0 = calcEconomicsWithYield({ ...f, capital_usd: 1000, opp_apr: 0.04, drag_limit: 0.05, drop_share: 0.0, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10, organic_apr: 0 });
  const eZ4 = calcEconomicsWithYield({ ...f, capital_usd: 1000, opp_apr: 0.04, drag_limit: 0.05, drop_share: 0.0, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10, organic_apr: 0.04 });
  const eZ8 = calcEconomicsWithYield({ ...f, capital_usd: 1000, opp_apr: 0.04, drag_limit: 0.05, drop_share: 0.0, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, hurdle_hr: 10, organic_apr: 0.08 });

  if (e0.cashCost <= 0) negativeCashCost++;
  if (eZ0.hypGross !== 0 || Math.abs(eZ0.hypNet + eZ0.totalCost) > 0.02) zeroDropFail++;
  if (e0.robustClass === 'EXECUTION-GATED') gatedCount++;
  if (eZ0.zeroRewardNetWithOrg > 0) positiveAtZeroDropNoOrg++;
  if (eZ4.zeroRewardNetWithOrg > 0) positiveAtZeroDrop4pctOrg++;
  if (eZ8.zeroRewardNetWithOrg > 0) positiveAtZeroDrop8pctOrg++;
  if (e0.hypPerHr >= 10) rawMathHurdle1k++;
  if (e0.robustClass === 'ALL-SCENARIO ROBUST' || e0.robustClass === 'CENTRAL-ONLY') ungatedHurdle1k++;
}

const fire = board.rows.find((r) => r.slug === 'firelight');
const f5k = [0, 0.04, 0.08].map((org) => {
  const e = calcEconomicsWithYield({ ...fire.farm, capital_usd: 5000, opp_apr: 0.04, drag_limit: 0.05, drop_share: 0.07, tvl_usd: fire.tvl_usd, implied_usd: fire.implied_value_usd, p25_usd: fire.p25_usd, p75_usd: fire.p75_usd, hurdle_hr: 10, organic_apr: org });
  return { org_apr: org, organicUsd: e.organicUsd, hypNet: e.hypNetWithOrg, hypPerHr: e.hypPerHrWithOrg, zeroDropNet: e.zeroRewardNetWithOrg };
});

const report = {
  total_rows: board.rows.length,
  step_reconciliation_mismatches: stepMismatch,
  nonpositive_cash_cost_rows: negativeCashCost,
  zero_drop_accounting_mismatches: zeroDropFail,
  at_1k_7pct_drop: {
    ungated_central_ge_10hr: ungatedHurdle1k,
    raw_math_ge_10hr: rawMathHurdle1k,
    gated_excluded_from_48: rawMathHurdle1k - ungatedHurdle1k,
    total_execution_gated: gatedCount,
    zero_drop_positive_at_0pct_org_apr: positiveAtZeroDropNoOrg,
    zero_drop_positive_at_4pct_hyp_org_apr: positiveAtZeroDrop4pctOrg,
    zero_drop_positive_at_8pct_hyp_org_apr: positiveAtZeroDrop8pctOrg,
  },
  firelight_5k_hyp_organic_sensitivity: f5k,
};

fs.writeFileSync('v3_2_production/evidence/lab_b_audit_results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
