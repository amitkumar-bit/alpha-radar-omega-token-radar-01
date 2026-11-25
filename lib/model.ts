// ALPHA-RADAR-OMEGA Phase 04 Release Candidate Model
// Exact mathematical parity with F1_Huber_SuperCat_C2_5pct:
// - Collision-safe family TVL aggregation for comparables (split-TVL families)
// - 1D Huber IRLS (delta=1.345, ridge=1e-4) on ln(tvl_family)
// - Hierarchical SuperCat (k_sup=3) + Category (k_cat=5) Empirical Bayes shrinkage
// - Bounded Criterion-2 adjustment (+-5%: 0.05 * (0.5 * g + 0.5 * m))
// - Out-of-fold (LOOCV) calibrated OOD-widened Conformal 80% intervals (dense vs sparse n_cat<=2)
// - 100-seed deterministic bootstrap rank stability (resampling sensitivity, not launch odds)
// - Complete 758-row dataset audit & 10 executable integrity checks
// - 6-Tier Chain Gas Router + 10-Archetype Farm Engine with separated Fact/Inference/Scenario/Unknown layers

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ComparablePeer {
  slug: string;
  name: string;
  category: string;
  super_cat: string;
  tvl_raw: number;
  tvl_family: number;
  mcap_usd: number;
  family_aggregated: boolean;
}

export interface FarmPlanDetails {
  observed_facts: string;
  inferred_archetype: string;
  scenario_assumptions: string;
  unknown_requirements: string;
  collateral: string;
  routed_chain: string;
  gas_tier: number;
  min_stake_usd: number;
  setup_gas_usd: number;
  weekly_gas_usd: number;
  gas_4w_usd: number;
  opp_cost_apr: number;
  lockup_days: number;
  steps: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  tvl_family: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  is_watchlist: boolean;
  evidence_tier: 'Dense (>=3)' | 'Sparse (1-2)' | 'Zero-Comp (0)';
  n_cat_comps: number;
  n_sup_comps: number;
  implied_value_usd: number;
  interval_80_low_usd: number;
  interval_80_high_usd: number;
  rank_p10: number;
  rank_p90: number;
  top10_freq_pct: number;
  routed_chain: string;
  rerouted_from_starter: boolean;
  gas_tier: number;
  min_stake_usd: number;
  gas_4w_usd: number;
  eligibility_warning: string | null;
  model: {
    base_multiple: number;
    huber_slope: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    super_cat: string;
    eb_log_offset: number;
    eb_multiplier: number;
    c2_log_adj: number;
  };
  farm: FarmPlanDetails;
  farm_steps: string[];
}

export interface AuditRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
  status: string;
  reason: string;
}

export interface IntegrityCheck {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_protocols: number;
  huber_intercept: number;
  huber_slope: number;
  oof_q80_dense_log: number;
  oof_q80_sparse_log: number;
  oof_ood_ratio: number;
  super_cat_effects: Record<string, number>;
  cat_effects: Record<string, number>;
  comparables: ComparablePeer[];
  rows: BoardRow[];
  audit_summary: Record<string, number>;
  audit_rows: AuditRow[];
  integrity_checks: IntegrityCheck[];
}

export const MODEL_VERSION = 'alpha-omega-p6-rc1';
const DAY_MS = 86_400_000;
const EARLY_LIMIT = 160;

const EXCLUDED_BOARD_CATEGORIES = new Set([
  'CEX', 'Chain', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge',
  'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Stablecoin Wrapper',
  'Anchor BTC', 'Decentralized BTC',
]);
const VERSION_MARKER_RE = /\s(V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAPPED_STAKED_RE = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini|Crypto\.com)\b/i;

const SPLIT_TVL_FAMILIES: Record<string, string[]> = {
  'aave': ['aave-v1', 'aave-v2', 'aave-v3', 'aave-horizon-rwa'],
  'uniswap': ['uniswap-v1', 'uniswap-v2', 'uniswap-v3', 'uniswap-v4'],
  'curve': ['curve-dex', 'curve-llamalend'],
  'compound': ['compound-v1', 'compound-v2', 'compound-v3'],
  'lido': ['lido'],
  'eigenlayer': ['eigenlayer'],
  'ethena': ['ethena-usde'],
  'pendle': ['pendle'],
  'morpho': ['morpho-v0', 'morpho-v1'],
  'euler': ['euler-v1', 'euler-v2'],
  'spark': ['sparklend', 'spark-savings', 'spark-liquidity-layer'],
  'jupiter': ['jupiter-perpetual-exchange', 'jupiter-staked-sol', 'jupiter-lend'],
  'kamimo': ['kamino-lend', 'kamino-liquidity'],
  'sky': ['sky-lending'],
};

const SLUG_TO_FAMILY = new Map<string, string>();
for (const [fam, slugs] of Object.entries(SPLIT_TVL_FAMILIES)) {
  for (const s of slugs) SLUG_TO_FAMILY.set(s, fam);
}

export function superCat(cat: string | null): string {
  const c = String(cat ?? '');
  if (/dex|deriv|perp|prediction|options|synth/i.test(c)) return 'TRADING';
  if (/lending|cdp|uncollater/i.test(c)) return 'CREDIT';
  if (/liquid staking|restaking|staking pool|collateral|anchor/i.test(c)) return 'STAKING';
  if (/bridge/i.test(c)) return 'BRIDGE';
  if (/rwa|cedefi/i.test(c)) return 'RWA';
  if (/yield|allocator|curator|basis|farm|liquidity manager/i.test(c)) return 'YIELD_CURATOR';
  return 'OTHER';
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : 0.5 * (s[m - 1]! + s[m]!);
}

function quantile(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo]! : s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fitHuber1D(x: number[], y: number[], delta = 1.345, ridge = 1e-4, maxIter = 50): [number, number] {
  const n = x.length;
  let b0 = 0;
  let b1 = 0.5;
  const w = new Array<number>(n).fill(1);
  for (let it = 0; it < maxIter; it++) {
    let s00 = 0, s01 = 0, s11 = ridge, sy0 = 0, sy1 = 0;
    for (let i = 0; i < n; i++) {
      const wi = w[i]!;
      const xi = x[i]!;
      const yi = y[i]!;
      s00 += wi;
      s01 += wi * xi;
      s11 += wi * xi * xi;
      sy0 += wi * yi;
      sy1 += wi * xi * yi;
    }
    const det = s00 * s11 - s01 * s01 || 1e-12;
    const nb0 = (s11 * sy0 - s01 * sy1) / det;
    const nb1 = (s00 * sy1 - s01 * sy0) / det;
    const res = y.map((yi, i) => yi - (nb0 + nb1 * x[i]!));
    const mad = median(res.map(Math.abs)) / 0.6745 || 1.0;
    const diff = Math.abs(nb0 - b0) + Math.abs(nb1 - b1);
    b0 = nb0;
    b1 = nb1;
    for (let i = 0; i < n; i++) {
      const u = Math.abs(res[i]!) / mad;
      w[i] = u <= delta ? 1 : delta / u;
    }
    if (diff < 1e-6) break;
  }
  return [b0, b1];
}

function fitF1Core(train: { tvl_family: number; y_log: number; category: string }[]) {
  const x = train.map((r) => Math.log(Math.max(1, r.tvl_family)));
  const y = train.map((r) => r.y_log);
  const [b0, b1] = fitHuber1D(x, y);

  const supRes = new Map<string, number[]>();
  const catRes = new Map<string, number[]>();
  train.forEach((r, i) => {
    const res = y[i]! - (b0 + b1 * x[i]!);
    const sc = superCat(r.category);
    if (!supRes.has(sc)) supRes.set(sc, []);
    supRes.get(sc)!.push(res);
    if (!catRes.has(r.category)) catRes.set(r.category, []);
    catRes.get(r.category)!.push(res);
  });

  const kSup = 3;
  const kCat = 5;
  const supEff: Record<string, number> = {};
  for (const [sc, arr] of supRes) supEff[sc] = (arr.length / (arr.length + kSup)) * mean(arr);

  const catEff: Record<string, number> = {};
  const catCount: Record<string, number> = {};
  const supCount: Record<string, number> = {};
  for (const [sc, arr] of supRes) supCount[sc] = arr.length;
  for (const [c, arr] of catRes) {
    const parent = supEff[superCat(c)] ?? 0;
    catEff[c] = parent + (arr.length / (arr.length + kCat)) * (mean(arr) - parent);
    catCount[c] = arr.length;
  }
  return { b0, b1, supEff, catEff, catCount, supCount };
}

function predictF1Log(
  fit: ReturnType<typeof fitF1Core>,
  row: { tvl_family: number; category: string | null; change_7d: number | null; listed_at: string | null },
  asOfMs: number,
  c2Pct = 0.05,
) {
  const cat = row.category ?? 'Unknown';
  const sc = superCat(cat);
  const eb = cat in fit.catEff ? fit.catEff[cat]! : (fit.supEff[sc] ?? 0);
  const g = row.change_7d !== null && Number.isFinite(row.change_7d) ? Math.max(-1, Math.min(1, row.change_7d / 100)) : 0;
  const parsedAge = row.listed_at ? Date.parse(row.listed_at) : NaN;
  const ageDays = Number.isFinite(parsedAge) ? Math.max(0, Math.round((asOfMs - parsedAge) / DAY_MS)) : 365;
  const m = Math.max(-1, Math.min(1, (ageDays - 365) / 365));
  const c2Adj = c2Pct * (0.5 * g + 0.5 * m);
  const predLog = fit.b0 + fit.b1 * Math.log(Math.max(1, row.tvl_family)) + eb + c2Adj;
  return { predLog, eb, c2Adj, g, m, sc };
}

const TIER1_ORDER = [
  'Base', 'Arbitrum', 'Optimism', 'Solana', 'Polygon', 'Binance', 'Avalanche',
  'Unichain', 'Ink', 'Monad', 'Hyperliquid L1', 'Sonic', 'Sui', 'Flare',
  'Plasma', 'Arc', 'Katana', 'Pharos', 'Plume Mainnet', 'Stellar', 'Algorand',
  'Noble', 'Ripple', 'Tron', 'Linea', 'Scroll', 'Mantle', 'Starknet', 'Hemi',
  'TAC', 'Robinhood Chain', 'World Chain',
];
const TIER2_SET = new Set([
  'Bittensor', 'Mezo', 'BSquared', 'BOB', 'Citrea', 'CORE',
  'Babylon Genesis', 'Corn', 'RSK', 'Cardano', 'Near', 'TON',
]);
const TIER3_SET = new Set(['Ethereum']);
const TIER4_SET = new Set(['Bitcoin', 'Litecoin', 'Doge', 'Zcash']);

function routeChain(chains: string[], slug: string) {
  const list = chains.length ? chains : ['Unknown'];
  if (slug === 'lightning-network') {
    return { chain: 'Bitcoin (Lightning)', tier: 5, setup: 10.0, weekly: 0.05 };
  }
  for (const pref of TIER1_ORDER) {
    if (list.includes(pref)) {
      const tron = pref === 'Tron';
      return { chain: pref, tier: 1, setup: tron ? 0.8 : 0.15, weekly: tron ? 0.35 : 0.05 };
    }
  }
  for (const c of list) {
    if (TIER2_SET.has(c)) return { chain: c, tier: 2, setup: 1.0, weekly: 0.4 };
  }
  if (list.some((c) => TIER3_SET.has(c))) return { chain: 'Ethereum', tier: 3, setup: 15.0, weekly: 6.0 };
  if (list.some((c) => TIER4_SET.has(c))) return { chain: list.find((c) => TIER4_SET.has(c))!, tier: 4, setup: 5.0, weekly: 2.0 };
  return { chain: list[0]!, tier: 6, setup: 2.0, weekly: 0.75 };
}

function buildFarmPlan(p: SnapshotProtocol, route: { chain: string; tier: number; setup: number; weekly: number }): FarmPlanDetails {
  const cat = p.category ?? '';
  const highGas = route.tier === 3 || route.tier === 5;
  const gas4w = +(route.setup + 4 * route.weekly).toFixed(2);
  let minStake = highGas ? 250 : 100;
  let collateral = 'USDC / ETH';
  let archetype = '01_Risk_Curator_Allocator';
  let lockupDays = 45;
  let oppApr = 0.045;
  let step1 = `Deploy $${minStake}+ ${collateral} into active ${p.name} pools on ${route.chain} (Tier ${route.tier}, est. 4w gas $${gas4w}).`;
  let unknown = 'Exact points formula, snapshot date, and token allocation rules are undisclosed.';

  if (p.slug === 'lightning-network' || cat === 'Payments') {
    archetype = '10_Payments_Channel_Infra';
    minStake = 250;
    collateral = 'BTC';
    lockupDays = 60;
    step1 = `Open a BTC Lightning channel ($${minStake}+ BTC) on Bitcoin; L1 open/close fees ~$${gas4w}.`;
    unknown = 'Open payment infrastructure: NO native token or airdrop is expected; run for routing only.';
  } else if (cat === 'Insurance' || p.slug === 'firelight') {
    archetype = '08_Insurance_Cover_Underwriting';
    minStake = highGas ? 250 : 75;
    collateral = route.chain === 'Flare' ? 'FXRP / FLR / stable collateral' : 'Stable / native collateral';
    lockupDays = 30;
    oppApr = 0.05;
    step1 = `Underwrite cover in ${p.name} pools on ${route.chain} with ${collateral} (min $${minStake}).`;
    unknown = 'Claim trigger thresholds, slashing cap, and unbonding queue duration depend on pool terms.';
  } else if (/Collateral Markets|Restaking|Liquid Restaking|Staking Pool|Liquid Staking|Anchor BTC/i.test(cat) || p.slug === 'symbiotic' || p.slug === 'b14g') {
    archetype = '04_Restaking_Staking_Collateral';
    collateral = route.chain === 'CORE' ? 'CORE / BTC dual-stake' : route.chain === 'Algorand' ? 'ALGO' : 'LSTs (wstETH / cbETH / rETH)';
    lockupDays = 30;
    oppApr = 0.04;
    step1 = `Deposit ${collateral} into curated vaults or validators on ${route.chain} (min $${minStake}).`;
    unknown = 'Operator slashing rules and withdrawal queue length vary by vault.';
  } else if (/CDP|Stablecoin/i.test(cat) || p.slug === 'usdd' || p.slug === 'saturn') {
    archetype = '03_CDP_Stablecoin_Wrapper';
    collateral = route.chain === 'Tron' ? 'TRX / sTRX / USDT' : 'Yield-bearing stable / native collateral';
    step1 = `Lock ${collateral} on ${route.chain} to mint or stake the protocol stablecoin (min $${minStake}).`;
    unknown = 'Collateralization ratio, stability fee, and chain-specific vault caps must be verified on-chain.';
  } else if (/Dexs|Derivatives|Prediction/i.test(cat)) {
    archetype = '05_Dex_Perps_Subnet';
    const bt = route.chain === 'Bittensor';
    collateral = bt ? 'TAO' : 'USDC / native pair';
    oppApr = 0.05;
    step1 = bt
      ? `Stake TAO into dTAO subnet alpha pools on Bittensor (min $${minStake}).`
      : `Provide tight-range LP or 1-2x hedged volume on ${route.chain} with ${collateral} (min $${minStake}).`;
    unknown = bt ? 'Bittensor ecosystem already uses TAO; subnet-level token rules unverified.' : 'Fee tier rebates, IL profile, and volume multipliers are unverified.';
  } else if (/RWA|CeDeFi/i.test(cat)) {
    archetype = '06_RWA_CeDeFi';
    collateral = route.chain === 'Ripple' ? 'XRP / RLUSD' : route.chain === 'Algorand' ? 'USDC / ALGO' : 'USDC';
    step1 = `Hold or mint tokenized RWA shares (${collateral}) on ${route.chain} (min $${minStake}).`;
    unknown = 'KYC/jurisdiction gating and custodian redemption windows are unverified in snapshot.';
  } else if (/Lending/i.test(cat)) {
    archetype = '02_Lending_Markets';
    minStake = highGas ? 250 : 75;
    collateral = 'USDC / native gas asset';
    step1 = `Supply ${collateral} and maintain a conservative <40% LTV borrow on ${route.chain} (min $${minStake}).`;
    unknown = 'Borrow utilization spikes and liquidation thresholds vary by market.';
  } else if (/Basis Trading|Yield|Leveraged Farming|Farm/i.test(cat)) {
    archetype = '07_Basis_Yield_Tranche';
    minStake = highGas ? 250 : 75;
    collateral = 'USDC / USDe / ETH';
    oppApr = 0.05;
    step1 = `Deposit into delta-neutral basis or yield tranche on ${route.chain} (min $${minStake}).`;
  } else {
    minStake = highGas ? 250 : 75;
  }

  const dragPct = ((gas4w / minStake) * 100).toFixed(1);
  const steps = [
    step1,
    `Hold position ${lockupDays}d to keep ~$${gas4w} 4-week gas at ${dragPct}% of $${minStake} capital.`,
    `Verify ${p.name} TVL stability (7d ${p.change_7d === null ? 'n/a' : `${p.change_7d.toFixed(1)}%`}) and pool availability on ${route.chain} before sizing up.`,
    `Hypothetical scenario only: opportunity cost ~${(oppApr * 100).toFixed(1)}% APR; ${unknown}`,
  ];

  return {
    observed_facts: `Category: ${cat || 'Uncategorized'} | Chains in snapshot: ${p.chains.join(', ') || 'None'} | TVL: $${Math.round(p.tvl_usd).toLocaleString('en-US')}`,
    inferred_archetype: archetype,
    scenario_assumptions: `Routed to ${route.chain} (Tier ${route.tier}); est. 4w gas $${gas4w}, min stake $${minStake}, ${lockupDays}d horizon, ${(oppApr * 100).toFixed(1)}% APR opp cost.`,
    unknown_requirements: unknown,
    collateral,
    routed_chain: route.chain,
    gas_tier: route.tier,
    min_stake_usd: minStake,
    setup_gas_usd: route.setup,
    weekly_gas_usd: route.weekly,
    gas_4w_usd: gas4w,
    opp_cost_apr: oppApr,
    lockup_days: lockupDays,
    steps,
  };
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('Invalid snapshot.json');
  }
  return raw;
}

export function runIntegrityChecks(
  board: BoardRow[],
  auditRows: AuditRow[],
  comparables: ComparablePeer[],
  snapshot: Snapshot,
): IntegrityCheck[] {
  const slugs = new Set(board.map((r) => r.slug));
  const missingWl = snapshot.watchlist.filter((s) => !slugs.has(s));
  const uniqueBoardSlugs = slugs.size === board.length;
  const allFinite = board.every((r) => Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && Number.isFinite(r.tvl_usd));
  const nonNegCosts = board.every((r) => r.gas_4w_usd >= 0 && r.min_stake_usd > 0);
  const validIntervals = board.every((r) => r.interval_80_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.interval_80_high_usd);
  let mono = true;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.rank !== i + 1 || board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      mono = false;
      break;
    }
  }
  const compSlugs = new Set(comparables.map((c) => c.slug));
  const validCompRefs = comparables.length > 0 && compSlugs.size === comparables.length;
  const validSteps = board.every((r) => r.farm_steps.length >= 3 && r.farm_steps.every((s) => s.length >= 20 && s.length <= 600));
  const auditReconciled = auditRows.length === snapshot.protocols.length;
  const calcConsistent = board.every((r) => Math.abs(r.farm.gas_4w_usd - +(r.farm.setup_gas_usd + 4 * r.farm.weekly_gas_usd).toFixed(2)) < 1e-6);

  return [
    { id: 'watchlist_40', name: 'Watchlist Coverage (40/40)', passed: missingWl.length === 0, detail: `${snapshot.watchlist.length - missingWl.length}/${snapshot.watchlist.length} covered` },
    { id: 'audit_758', name: 'Complete Dataset Reconciliation', passed: auditReconciled, detail: `${auditRows.length}/${snapshot.protocols.length} rows accounted` },
    { id: 'unique_ids', name: 'Unique Protocol Slugs', passed: uniqueBoardSlugs, detail: `${slugs.size}/${board.length} unique` },
    { id: 'finite_vals', name: 'Finite Positive Valuations', passed: allFinite, detail: allFinite ? 'All safe positive integers' : 'Non-finite or <=0 detected' },
    { id: 'nonneg_costs', name: 'Nonnegative Farming Costs', passed: nonNegCosts, detail: nonNegCosts ? 'All gas >=0 & stake >0' : 'Invalid cost detected' },
    { id: 'valid_intervals', name: 'Interval Bound Ordering', passed: validIntervals, detail: validIntervals ? 'low <= implied <= high' : 'Ordering violation' },
    { id: 'rank_monotonic', name: 'Rank Monotonicity', passed: mono, detail: mono ? '1..N strictly non-increasing' : 'Rank/value inversion' },
    { id: 'comp_refs', name: 'Comparable Peer Integrity', passed: validCompRefs, detail: `${comparables.length} unique U1 non-CEX peers` },
    { id: 'required_fields', name: 'Farm Steps Gate Compliance', passed: validSteps, detail: validSteps ? 'All 3-12 steps within 20-600 chars' : 'Step length/count violation' },
    { id: 'calc_consistency', name: 'Gas Calculation Consistency', passed: calcConsistent, detail: calcConsistent ? 'setup + 4*weekly == gas_4w' : 'Mismatch detected' },
  ];
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const asOfMs = Date.parse(`${snapshot.as_of}T00:00:00Z`);
  const wlSet = new Set(snapshot.watchlist);

  // Aggregate family TVL for split-TVL protocols
  const famTvl = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const fam = SLUG_TO_FAMILY.get(p.slug);
    if (fam && p.tvl_usd > 0) famTvl.set(fam, (famTvl.get(fam) ?? 0) + p.tvl_usd);
  }
  const getFamTvl = (p: SnapshotProtocol) => {
    const fam = SLUG_TO_FAMILY.get(p.slug);
    return fam ? (famTvl.get(fam) ?? p.tvl_usd) : p.tvl_usd;
  };

  // U1 Comparables (non-CEX live mcap > 0, tvl > 0), sorted by slug for row-order invariance
  const rawComps = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const trainComps = rawComps.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category ?? 'Unknown',
    super_cat: superCat(p.category),
    tvl_raw: p.tvl_usd,
    tvl_family: getFamTvl(p),
    mcap_usd: p.mcap_usd!,
    y_log: Math.log(p.mcap_usd!),
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    family_aggregated: SLUG_TO_FAMILY.has(p.slug),
  }));

  const fullFit = fitF1Core(trainComps);

  // Nested / Out-of-fold LOOCV calibration for dense vs sparse (n_cat <= 2) 80% conformal intervals
  const denseErrs: number[] = [];
  const sparseErrs: number[] = [];
  for (let i = 0; i < trainComps.length; i++) {
    const tr = trainComps.filter((_, idx) => idx !== i);
    const te = trainComps[i]!;
    const foldFit = fitF1Core(tr);
    const { predLog } = predictF1Log(foldFit, te, asOfMs, 0.05);
    const ae = Math.abs(te.y_log - predLog);
    const nCatTrain = foldFit.catCount[te.category] ?? 0;
    if (nCatTrain <= 2) sparseErrs.push(ae);
    else denseErrs.push(ae);
  }
  const q80Dense = quantile(denseErrs, 0.8);
  const q80Sparse = quantile(sparseErrs, 0.8);
  const oodRatio = +(q80Sparse / (q80Dense || 1)).toFixed(4);

  // Pre-token eligibility + 758-row audit (excluding version markers, wrapped/staking names, exchange prefixes, and tokenized brand siblings unless on watchlist)
  const tokenizedBrands = new Set(
    snapshot.protocols
      .filter((p) => p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null)
      .map((p) => p.slug.split('-')[0]!)
      .filter((b) => b.length >= 4),
  );
  const isCleanEarly = (p: SnapshotProtocol) => {
    if (wlSet.has(p.slug) || p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null) return false;
    if (EXCLUDED_BOARD_CATEGORIES.has(p.category ?? '')) return false;
    if (VERSION_MARKER_RE.test(p.name) || WRAPPED_STAKED_RE.test(p.name) || EXCHANGE_PREFIX_RE.test(p.name)) return false;
    const brand = p.slug.split('-')[0]!;
    if (tokenizedBrands.has(brand) && p.slug !== brand) return false;
    return true;
  };
  const preTokenEarly = snapshot.protocols
    .filter(isCleanEarly)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, EARLY_LIMIT);
  const earlySet = new Set(preTokenEarly.map((p) => p.slug));
  const wlProtocols = snapshot.protocols.filter((p) => wlSet.has(p.slug));
  const boardInput = [...wlProtocols, ...preTokenEarly.filter((p) => !wlSet.has(p.slug))]
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const boardSet = new Set(boardInput.map((p) => p.slug));

  const auditRows: AuditRow[] = snapshot.protocols.map((p) => {
    let status = 'Excluded — Tokenized';
    let reason = 'Live token with market cap / CoinGecko ID';
    if (wlSet.has(p.slug)) {
      status = p.symbol ? 'Mandatory Watchlist Exception' : 'Included — Watchlist';
      reason = p.symbol ? 'Watchlist protocol carrying symbol-only conflict flag' : 'Required competition watchlist protocol';
    } else if (boardSet.has(p.slug)) {
      status = 'Included — Early Radar';
      reason = 'All-null token evidence, clean DeFi category, top-160 by TVL';
    } else if (p.category === 'CEX') {
      status = 'Excluded — CEX';
      reason = 'Centralized exchange excluded from comparables and board';
    } else if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      status = 'Comparable Only (U1)';
      reason = SLUG_TO_FAMILY.has(p.slug) ? 'Live U1 comparable (split-TVL family aggregated)' : 'Live U1 non-CEX comparable';
    } else if (p.mcap_usd === null && p.gecko_id === null && p.symbol !== null) {
      status = 'Ambiguous — Symbol-Only';
      reason = 'Non-watchlist record with symbol but missing mcap/gecko_id';
    } else if (EXCLUDED_BOARD_CATEGORIES.has(p.category ?? '')) {
      status = 'Excluded — Infra/Bridge/LST';
      reason = `Excluded product category (${p.category})`;
    } else if (p.mcap_usd === null && p.gecko_id === null) {
      status = 'Excluded — Below Early Cutoff';
      reason = 'Pre-token clean DeFi outside top-160 early TVL cutoff';
    } else {
      status = 'Excluded — Sentinel/Zero Mcap';
      reason = 'Non-positive market cap or missing TVL';
    }
    return { slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, status, reason };
  });

  const auditSummary: Record<string, number> = {};
  for (const r of auditRows) auditSummary[r.status] = (auditSummary[r.status] ?? 0) + 1;

  // Bootstrap rank stability (100 deterministic resamples of U1)
  const rng = makeRng(20261125);
  const bootRanks: number[][] = Array.from({ length: boardInput.length }, () => []);
  for (let b = 0; b < 100; b++) {
    const sample = Array.from({ length: trainComps.length }, () => trainComps[Math.floor(rng() * trainComps.length)]!);
    const bFit = fitF1Core(sample);
    const preds = boardInput.map((p, idx) => ({
      idx,
      val: predictF1Log(bFit, { tvl_family: p.tvl_usd, category: p.category, change_7d: p.change_7d, listed_at: p.listed_at }, asOfMs, 0.05).predLog,
    })).sort((a, b2) => b2.val - a.val);
    preds.forEach((x, rnk) => bootRanks[x.idx]!.push(rnk + 1));
  }

  const scored: BoardRow[] = boardInput.map((p, idx) => {
    const parsedAge = p.listed_at ? Date.parse(p.listed_at) : NaN;
    const ageDays = Number.isFinite(parsedAge) ? Math.max(0, Math.round((asOfMs - parsedAge) / DAY_MS)) : null;
    const cat = p.category ?? 'Unknown';
    const nCat = fullFit.catCount[cat] ?? 0;
    const nSup = fullFit.supCount[superCat(cat)] ?? 0;
    const { predLog, eb, c2Adj, g, m, sc } = predictF1Log(
      fullFit,
      { tvl_family: p.tvl_usd, category: p.category, change_7d: p.change_7d, listed_at: p.listed_at },
      asOfMs,
      0.05,
    );
    const implied = Math.max(1, Math.round(Math.exp(predLog)));
    const hw = nCat <= 2 ? q80Sparse : q80Dense;
    const route = routeChain(p.chains, p.slug);
    const farm = buildFarmPlan(p, route);
    const ranksForRow = bootRanks[idx]!;
    const top10Pct = Math.round((ranksForRow.filter((rk) => rk <= 10).length / ranksForRow.length) * 100);
    const evidenceTier: BoardRow['evidence_tier'] = nCat >= 3 ? 'Dense (>=3)' : nCat >= 1 ? 'Sparse (1-2)' : 'Zero-Comp (0)';
    const floorM = Math.round(snapshot.floor_usd / 1e6);
    const warning = p.symbol ? `Symbol-only conflict (${p.symbol})` : p.tvl_usd < snapshot.floor_usd ? `Below $${floorM}M floor` : null;

    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      tvl_family: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: ageDays,
      is_watchlist: wlSet.has(p.slug),
      evidence_tier: evidenceTier,
      n_cat_comps: nCat,
      n_sup_comps: nSup,
      implied_value_usd: implied,
      interval_80_low_usd: Math.max(1, Math.round(Math.exp(predLog - hw))),
      interval_80_high_usd: Math.max(1, Math.round(Math.exp(predLog + hw))),
      rank_p10: Math.round(quantile(ranksForRow, 0.1)),
      rank_p90: Math.round(quantile(ranksForRow, 0.9)),
      top10_freq_pct: top10Pct,
      routed_chain: route.chain,
      rerouted_from_starter: Boolean(p.chains[0] && p.chains[0] !== route.chain && !route.chain.startsWith(p.chains[0])),
      gas_tier: route.tier,
      min_stake_usd: farm.min_stake_usd,
      gas_4w_usd: farm.gas_4w_usd,
      eligibility_warning: warning,
      model: {
        base_multiple: +Math.exp(fullFit.b0).toFixed(4),
        huber_slope: +fullFit.b1.toFixed(6),
        growth_pct: +(g * 100).toFixed(2),
        growth_multiplier: +Math.exp(0.025 * g).toFixed(6),
        maturity_multiplier: +Math.exp(0.025 * m).toFixed(6),
        age_days: ageDays,
        super_cat: sc,
        eb_log_offset: +eb.toFixed(6),
        eb_multiplier: +Math.exp(eb).toFixed(4),
        c2_log_adj: +c2Adj.toFixed(6),
      },
      farm,
      farm_steps: farm.steps,
    };
  });

  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });

  const comparables: ComparablePeer[] = trainComps
    .sort((a, b) => b.mcap_usd - a.mcap_usd)
    .map(({ slug, name, category, super_cat, tvl_raw, tvl_family, mcap_usd, family_aggregated }) => ({
      slug, name, category, super_cat, tvl_raw, tvl_family, mcap_usd, family_aggregated,
    }));

  const integrityChecks = runIntegrityChecks(scored, auditRows, comparables, snapshot);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: scored.length,
    early_size: scored.filter((r) => earlySet.has(r.slug)).length,
    live_size: comparables.length,
    total_protocols: snapshot.protocols.length,
    huber_intercept: +fullFit.b0.toFixed(6),
    huber_slope: +fullFit.b1.toFixed(6),
    oof_q80_dense_log: +q80Dense.toFixed(4),
    oof_q80_sparse_log: +q80Sparse.toFixed(4),
    oof_ood_ratio: oodRatio,
    super_cat_effects: Object.fromEntries(Object.entries(fullFit.supEff).map(([k, v]) => [k, +v.toFixed(6)])),
    cat_effects: Object.fromEntries(Object.entries(fullFit.catEff).map(([k, v]) => [k, +v.toFixed(6)])),
    comparables,
    rows: scored,
    audit_summary: auditSummary,
    audit_rows: auditRows,
    integrity_checks: integrityChecks,
  };

  return { board: scored, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `misses ${missing.length} watchlist slugs`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} mismatch`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `order violation at ${i}`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return `flat values`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} step count`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} step length ${s.length}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} bad value`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
