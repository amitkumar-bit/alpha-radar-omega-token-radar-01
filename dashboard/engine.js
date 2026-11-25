// Single-Source Pure-JS Engine: Valuation, Dual OOS Validation, Peer Incidence, 758 Audit, Chain Router & Farm Economics
// Runs identically in Node 22 (main.ts) and Browser (dashboard/app.js) — 100% inspectable inside dossier.json.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OMEGA = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DAY = 86400000;
  const EXCLUDED_CATS = new Set([
    'CEX', 'Chain', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge',
    'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Stablecoin Wrapper',
    'Anchor BTC', 'Decentralized BTC',
  ]);
  const VER_RE = /\s(V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
  const WRAP_RE = /\b(wrapped|staked|staking)\b/i;
  const EXCH_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini|Crypto\.com)\b/i;
  const TOK_SIBLINGS = {
    'flying-tulip-ftusd': 'flying-tulip-lend ($FT)', 'gmx-solana': 'gmx-evm ($GMX)',
    'kava-mint': 'kava-lend ($HARD)', 'manta-cedefi': 'manta-pacific ($MANTA)',
    'metalx-swap': 'metalx-lending ($LOAN)', 'solv-strategies': 'solv-basis-trading ($SOLV)',
  };
  const WL_CONFLICTS = {
    'mezo-earn': 'Ecosystem sibling mezo-bridge records symbol MEZO without separate CoinGecko mcap',
  };
  const SPLIT_FAM = {
    aave: ['aave-v1', 'aave-v2', 'aave-v3', 'aave-v4', 'aave-horizon-rwa'],
    uniswap: ['uniswap-v1', 'uniswap-v2', 'uniswap-v3', 'uniswap-v4'],
    curve: ['curve-dex', 'curve-llamalend', 'curve-llamalend-v2'],
    compound: ['compound-v1', 'compound-v2', 'compound-v3'],
    lido: ['lido'], eigencloud: ['eigencloud'],
    ethena: ['ethena-usde', 'ethena-usdtb'], pendle: ['pendle-v2', 'pendle-loop'],
    morpho: ['morpho-blue', 'morpho-midnight'], euler: ['euler-v1', 'euler-v2'],
    spark: ['sparklend', 'spark-savings', 'spark-liquidity-layer', 'sparkdex-v3.1', 'sparkdex-v4'],
    jupiter: ['jupiter-perpetual-exchange', 'jupiter-staked-sol', 'jupiter-lend', 'jupiter-lend-dex'],
    kamino: ['kamino-lend', 'kamino-liquidity'], sky: ['sky-lending', 'sky-money', 'sky-rwa'],
  };
  const S2F = new Map();
  Object.entries(SPLIT_FAM).forEach(([f, a]) => a.forEach((s) => S2F.set(s, f)));

  const T1 = new Set('Arbitrum,Base,Optimism,Polygon,Solana,Sui,BSC,Binance,Avalanche,Flare,Ink,Monad,Plasma,CORE,Sei,Mantle,Scroll,Linea,Blast,Sonic,Abstract,Berachain,Unichain,Hyperliquid L1,Stellar,Algorand,Noble,Tron,Plume Mainnet,Ripple,Bittensor,BSquared,Mezo,Aptos,Near,TON'.split(','));
  const T2 = new Set('Starknet,zkSync Era,Cardano,Bitcoin,Babylon Genesis,Pharos,Arc'.split(','));

  function superCat(cat) {
    const s = String(cat || '');
    if (/dex|deriv|perp|prediction|options|synth/i.test(s)) return 'TRADING';
    if (/lending|cdp|uncollater/i.test(s)) return 'CREDIT';
    if (/liquid staking|restaking|staking pool|collateral|anchor/i.test(s)) return 'STAKING';
    if (/bridge/i.test(s)) return 'BRIDGE';
    if (/rwa|cedefi/i.test(s)) return 'RWA';
    if (/yield|allocator|curator|basis|farm|liquidity manager/i.test(s)) return 'YIELD_CURATOR';
    return 'OTHER';
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = (a) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
    return s.length & 1 ? s[m] : 0.5 * (s[m - 1] + s[m]);
  };
  const quantile = (a, q) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (p - lo);
  };

  function fitHuber1D(x, y) {
    let b0 = 0, b1 = 0.5, w = new Array(x.length).fill(1);
    for (let it = 0; it < 40; it++) {
      let s00 = 0, s01 = 0, s11 = 1e-4, sy0 = 0, sy1 = 0;
      for (let i = 0; i < x.length; i++) {
        s00 += w[i]; s01 += w[i] * x[i]; s11 += w[i] * x[i] * x[i];
        sy0 += w[i] * y[i]; sy1 += w[i] * x[i] * y[i];
      }
      const det = s00 * s11 - s01 * s01 || 1e-12;
      const nb0 = (s11 * sy0 - s01 * sy1) / det, nb1 = (s00 * sy1 - s01 * sy0) / det;
      const res = y.map((yi, i) => yi - (nb0 + nb1 * x[i]));
      const mad = median(res.map(Math.abs)) / 0.6745 || 1;
      const diff = Math.abs(nb0 - b0) + Math.abs(nb1 - b1);
      b0 = nb0; b1 = nb1;
      for (let i = 0; i < x.length; i++) { const u = Math.abs(res[i]) / mad; w[i] = u <= 1.345 ? 1 : 1.345 / u; }
      if (diff < 1e-6) break;
    }
    return [b0, b1];
  }

  function fitModel(comps, opts) {
    const kSup = opts?.kSup ?? 6, kCat = opts?.kCat ?? 24;
    const x = comps.map((r) => Math.log(Math.max(1, r.tvl_family))), y = comps.map((r) => r.y_log);
    const [b0, b1] = fitHuber1D(x, y);
    const supR = new Map(), catR = new Map();
    comps.forEach((r, i) => {
      const e = y[i] - (b0 + b1 * x[i]), sc = superCat(r.category);
      if (!supR.has(sc)) supR.set(sc, []); supR.get(sc).push(e);
      if (!catR.has(r.category)) catR.set(r.category, []); catR.get(r.category).push(e);
    });
    const supEff = {}, catEff = {}, catCount = {}, supCount = {};
    for (const [sc, a] of supR) { supCount[sc] = a.length; supEff[sc] = (a.length / (a.length + kSup)) * median(a); }
    for (const [c, a] of catR) {
      catCount[c] = a.length;
      const par = supEff[superCat(c)] ?? 0;
      // Single-protocol extreme outliers (n<2) inherit sector prior rather than overfitting n=1 variance
      catEff[c] = a.length >= 2 ? par + (a.length / (a.length + kCat)) * (median(a) - par) : par;
    }
    return { b0, b1, flatMed: median(y), supEff, catEff, catCount, supCount };
  }

  function decomposeLog(fit, row, asOfMs, flags) {
    const useEb = flags?.useEb !== false, wG = flags?.wG ?? 0, wM = flags?.wM ?? 0;
    const cat = row.category || 'Unknown', sc = superCat(cat);
    const tvl = Math.max(1, row.tvl_family || row.tvl_usd || 1);
    const globalLog = fit.b0 + fit.b1 * Math.log(tvl);
    const supAdj = useEb ? (fit.supEff[sc] ?? 0) : 0;
    const catAdj = (useEb ? (cat in fit.catEff ? fit.catEff[cat] : supAdj) : 0) - supAdj;
    const g = row.change_7d != null && Number.isFinite(row.change_7d) ? Math.max(-1, Math.min(1, row.change_7d / 100)) : 0;
    const pAge = row.listed_at ? Date.parse(row.listed_at) : NaN;
    const ageDays = Number.isFinite(pAge) ? Math.max(0, Math.round((asOfMs - pAge) / DAY)) : null;
    const m = Math.max(-1, Math.min(1, ((ageDays ?? 365) - 365) / 365));
    const gAdj = wG * g, mAdj = wM * m;
    return { tvl, ageDays, sc, globalLog, supAdj, catAdj, gAdj, mAdj, totalLog: globalLog + supAdj + catAdj + gAdj + mAdj };
  }

  function computeOosLadder(comps, asOfMs) {
    // 7d growth & age are explicitly tested on OOS; if they don't beat EB alone, they stay Dropped in the final rule (wG=0, wM=0)
    const specs = [
      ['flat', 'Flat median', (fit) => fit.flatMed, true],
      ['size', '+ TVL size curve (Huber)', (fit, r) => decomposeLog(fit, r, asOfMs, { useEb: false, wG: 0, wM: 0 }).totalLog, true],
      ['eb', '+ Shrunk sector/category [Final]', (fit, r) => decomposeLog(fit, r, asOfMs, { useEb: true, wG: 0, wM: 0 }).totalLog, true],
      ['g_age', '+ 7d Growth & Age [Tested, Dropped]', (fit, r) => decomposeLog(fit, r, asOfMs, { useEb: true, wG: 0.03, wM: 0.02 }).totalLog, false],
    ];
    const dated = comps.filter((r) => r.listed_at).sort((a, b) => Date.parse(a.listed_at) - Date.parse(b.listed_at));
    const split = Math.floor(dated.length * 0.7), tr = dated.slice(0, split), te = dated.slice(split);
    const ladder = specs.map(([id, label, fn, kept]) => {
      const looErrs = comps.map((c, i) => Math.abs(c.y_log - fn(fitModel(comps.filter((_, j) => j !== i)), c)));
      const tFit = fitModel(tr), csErrs = te.map((r) => Math.abs(r.y_log - fn(tFit, r)));
      return {
        id, label, kept, n_loo: comps.length, n_cs_test: te.length,
        loo_med_mult: +Math.exp(median(looErrs)).toFixed(2),
        loo_rmse: +Math.sqrt(mean(looErrs.map((e) => e * e))).toFixed(3),
        loo_p90_mult: +Math.exp(quantile(looErrs, 0.9)).toFixed(2),
        cs_med_mult: +Math.exp(median(csErrs)).toFixed(2), looErrs, csErrs,
      };
    });
    const fin = ladder.find((x) => x.id === 'eb');
    let h50 = 0, h80 = 0; const s50 = [], s80 = [];
    for (let i = 0; i < comps.length; i++) {
      const inn = fin.looErrs.filter((_, j) => j !== i), q50 = quantile(inn, 0.5), q80 = quantile(inn, 0.8);
      s50.push(q50); s80.push(q80);
      if (fin.looErrs[i] <= q50) h50++; if (fin.looErrs[i] <= q80) h80++;
    }
    const q50Med = median(s50), q80Med = median(s80);
    const csHit50 = fin.csErrs.filter((e) => e <= q50Med).length / Math.max(1, fin.csErrs.length);
    const csHit80 = fin.csErrs.filter((e) => e <= q80Med).length / Math.max(1, fin.csErrs.length);
    return {
      ladder: ladder.map(({ looErrs, csErrs, ...r }) => r),
      q50_log: +q50Med.toFixed(4), q80_log: +q80Med.toFixed(4),
      hit_p25_p75_pct: +((h50 / comps.length) * 100).toFixed(1),
      hit_p10_p90_pct: +((h80 / comps.length) * 100).toFixed(1),
      cs_hit_p25_p75_pct: +(csHit50 * 100).toFixed(1),
      cs_hit_p10_p90_pct: +(csHit80 * 100).toFixed(1),
    };
  }

  function computePeerIncidence(protocols, asOfMs) {
    // Include symbol !== null consistently with the 758-row tokenized definition (299/501 = 59.7%)
    const peers = protocols.filter((p) => p.category !== 'CEX' && !EXCLUDED_CATS.has(p.category || ''));
    const isTok = (p) => p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
    const base = peers.filter(isTok).length / Math.max(1, peers.length), bk = new Map();
    const ageB = (p) => { const d = p.listed_at ? (asOfMs - Date.parse(p.listed_at)) / DAY : 365; return d < 180 ? '0-6m' : d < 540 ? '6-18m' : '18m+'; };
    peers.forEach((p) => {
      const k = `${superCat(p.category)}|${ageB(p)}`, b = bk.get(k) || { tok: 0, tot: 0 };
      b.tot++; if (isTok(p)) b.tok++; bk.set(k, b);
    });
    const brierMod = mean(peers.map((p) => {
      const b = bk.get(`${superCat(p.category)}|${ageB(p)}`);
      return (((b.tok + 2 * base) / (b.tot + 2)) - (isTok(p) ? 1 : 0)) ** 2;
    }));
    const brierBase = mean(peers.map((p) => (base - (isTok(p) ? 1 : 0)) ** 2));
    return {
      n_peers: peers.length, base_rate_pct: +(base * 100).toFixed(1), brier_model: +brierMod.toFixed(3), brier_base: +brierBase.toFixed(3),
      forProtocol(p) {
        const k = `${superCat(p.category)}|${ageB(p)}`, b = bk.get(k) || { tok: 0, tot: 0 };
        return { rate_pct: +(((b.tok + 2 * base) / (b.tot + 2)) * 100).toFixed(0), peers_tok: b.tok, peers_tot: b.tot, bucket: k };
      },
    };
  }

  function routeChain(chains, pref) {
    const list = Array.isArray(chains) && chains.length ? chains : ['Ethereum'];
    const tierOf = (c) => (T1.has(c) ? 1 : T2.has(c) || c !== 'Ethereum' ? 2 : 3);
    const chosen = pref || [...list].sort((a, b) => tierOf(a) - tierOf(b))[0];
    const tier = chosen === 'Ethereum' ? 3 : tierOf(chosen);
    return { chain: chosen, tier, txGas: tier === 1 ? 0.15 : tier === 2 ? 0.65 : 6.0, defBridge: tier === 1 ? 1.5 : tier === 2 ? 3.0 : 12.0 };
  }

  function classifyNonWatchlist(p, route) {
    const cat = p.category || 'DeFi', eth = route.tier === 3, br = route.defBridge, ch = route.chain;
    if (cat === 'Prediction Market') return {
      mechanism: 'CLOB binary YES/NO outcome shares settled in USDC.e (orderbook only).', assets: 'USDC.e / USDC',
      min_viable_usd: 150, lockup_days: 30, tx_count: 5, bridge_exit_usd: br, slippage_bps: 30, yield_bearing_collateral: false,
      non_farm_flag: 'GEO-BLOCK / NO AMM LP', kyc_or_geo: 'US & restricted jurisdictions geo-blocked',
      exit_mechanics: 'Sell outcome shares on CLOB bid or redeem winning $1.00 post-resolution.',
      key_risks: 'Oracle dispute risk, binary spread, geo-block enforcement.', unknowns: 'Points formula & token release.',
      steps: [
        ['CHECK', `Verify non-restricted jurisdiction and UMA rules on ${ch}`, 'Read-only check', 15, 'Jurisdiction & market rules clear'],
        ['FUND', `Bridge USDC.e and gas token onto ${ch}`, 'USDC.e', 15, 'USDC.e settled'],
        ['TRADE', 'Place maker limit YES/NO outcome orders on CLOB (orderbook only)', 'USDC.e', 45, 'Maker orders active'],
        ['EXIT', 'Sell shares into bid or redeem settled $1.00 outcomes', 'USDC.e', 15, 'Principal returned'],
      ].map(([label, action, asset, time_min, verify]) => ({ label, action, asset, time_min, verify })),
    };
    if (cat === 'Uncollateralized Lending') return {
      mechanism: 'Single-sided USDC supply to credit-scored borrower pool (NO borrower LTV minting).', assets: 'USDC',
      min_viable_usd: eth ? 1000 : 250, lockup_days: 45, tx_count: 4, bridge_exit_usd: br, slippage_bps: 5, yield_bearing_collateral: false,
      non_farm_flag: 'CREDIT DEFAULT RISK', kyc_or_geo: 'Protocol-side borrower credit screening',
      exit_mechanics: 'Withdraw idle unborrowed USDC or queue behind borrower repayments.',
      key_risks: 'Uncollateralized borrower default loss & utilization lockup.', unknowns: 'Default recovery & reward formula.',
      steps: [
        ['AUDIT', `Inspect borrower default stats & idle exit liquidity on ${ch}`, 'Read-only check', 20, 'Exit buffer verified'],
        ['SUPPLY', `Deposit USDC single-sided into ${p.name} lender pool`, 'USDC', 15, 'Lender receipt verified'],
        ['EXIT', 'Withdraw idle USDC or clear repayment queue', 'USDC', 15, 'Principal returned'],
      ].map(([label, action, asset, time_min, verify]) => ({ label, action, asset, time_min, verify })),
    };
    const isC = /Risk Curators|Capital Allocator|Liquidity Manager|Yield/i.test(cat);
    const isB = /Basis Trading/i.test(cat), isR = /RWA|CeDeFi/i.test(cat), isD = /Derivatives|Options/i.test(cat), isX = /Dexs/i.test(cat);
    const mech = isC ? `Single-sided vault deposit curated via ${p.name}.`
      : isB ? 'Delta-neutral spot + short perp funding-capture vault (yield-bearing).'
      : isR ? 'Tokenized RWA / CeDeFi fixed-income yield vault.'
      : isD ? 'Orderbook/perp liquidity vault or measured maker collateral.'
      : isX ? `DEX liquidity / swap participation on ${p.name}.`
      : `On-chain ${cat} participation on ${p.name} (${ch}).`;
    return {
      mechanism: mech, assets: isX ? 'USDC / pair' : 'USDC / ETH',
      min_viable_usd: eth ? 1000 : isR || isD ? 250 : 100, lockup_days: isB || isR ? 45 : 30,
      tx_count: isD ? 6 : 4, bridge_exit_usd: br, slippage_bps: isD || isX ? 20 : 10,
      yield_bearing_collateral: isB || isR || /Yield/i.test(cat),
      non_farm_flag: isR ? 'CHECK RWA KYC' : /Payments|Indexes/i.test(cat) ? 'VERIFY TOKEN PLANS' : null,
      kyc_or_geo: isR ? 'Primary minting often requires KYC/whitelist' : 'Check pool terms in UI',
      exit_mechanics: isR ? 'T+1..T+7 custodian settlement or DEX swap.' : `Redeem position back to base asset on ${ch}.`,
      key_risks: isD ? 'Vault trader-PnL drawdown & funding.' : isR ? 'KYC gate & custodian risk.' : 'Smart-contract & liquidity queue risk.',
      unknowns: 'Points formula, snapshot timing & token distribution.',
      steps: [
        ['VERIFY', `Confirm ${p.name} contract, utilization, and ${ch} pool depth`, 'Read-only check', 15, 'Official UI & pool open'],
        ['DEPLOY', `Allocate into ${p.name} on ${ch}`, isX ? 'USDC / pair' : 'USDC', 20, 'Receipt token received'],
        ['EXIT', `Unwind position back to USDC on ${ch}`, 'USDC', 15, 'Principal settled cleanly'],
      ].map(([label, action, asset, time_min, verify]) => ({ label, action, asset, time_min, verify })),
    };
  }

  function buildFarmPlan(p, spec, route) {
    const br = Number(spec.bridge_exit_usd ?? route.defBridge), gas4w = +(spec.tx_count * route.txGas).toFixed(2);
    const tot = +(gas4w + br).toFixed(2);
    const minViable = Math.ceil(Math.max(spec.min_viable_usd || 100, Math.ceil(tot / Math.max(0.005, 0.05 - (spec.slippage_bps * 2) / 10000))) / 25) * 25;
    const tvl30 = p.tvl_usd * 0.7;
    const tvlTrigger = tvl30 >= 1e9 ? `$${(tvl30 / 1e9).toFixed(2)}B` : `$${(tvl30 / 1e6).toFixed(1)}M`;
    const wks = Math.max(4, Math.round((spec.lockup_days || 30) / 7));

    // Standardize onto realistic 6-7 step multi-week operating cadence (Setup/Verify -> Bridge/Deploy -> Weekly Cadence -> Numeric TVL Guard -> Exit -> Record)
    const core = (spec.steps || []).filter((s) => !/EXIT|UNBOND|REDEEM|CLOSE|UNSTAKE|MONITOR/i.test(s.label));
    const exitStep = (spec.steps || []).find((s) => /EXIT|UNBOND|REDEEM|CLOSE|UNSTAKE/i.test(s.label)) || { label: 'EXIT', action: `Unwind back to base asset on ${route.chain}`, asset: spec.assets, time_min: 15, verify: 'Funds in self-custody' };
    const fullSpecSteps = [
      ...core.map((s) => ({ ...s, time_min: Math.max(10, s.time_min) })),
      { label: 'CADENCE', action: `${wks} weekly dashboard, APY & points/rules reviews (${wks}x10m)`, asset: 'Position check', time_min: wks * 10, verify: 'No unannounced lock/rule change' },
      { label: 'WATCH', action: `Exit/reassess if protocol TVL drops >=30% below ${tvlTrigger} or withdraw queue freezes`, asset: 'Risk trigger', time_min: 15, verify: `Live TVL stays >= ${tvlTrigger}` },
      { ...exitStep, time_min: Math.max(15, exitStep.time_min) },
      { label: 'RECORD', action: 'Export transaction hashes, gas cost & settlement USD value for audit log', asset: 'CSV / Tx log', time_min: 15, verify: 'Complete cost-basis saved' },
    ];

    const n = fullSpecSteps.length;
    let rem = gas4w;
    const steps = fullSpecSteps.map((st, idx) => {
      const isOp = /FUND|BRIDGE|DEPOSIT|DEPLOY|STAKE|TRADE|SUPPLY|UNDERWRITE|SWAP|WRAP|ALLOCATE|MINT|SUBSCRIBE|ACQUIRE|OPEN|EXIT|UNBOND|REDEEM|CLOSE|UNSTAKE/i.test(st.label);
      const isLastOp = st === fullSpecSteps[n - 2];
      const g = isOp ? +(rem / Math.max(1, n - idx)).toFixed(2) : 0;
      rem = +(rem - g).toFixed(2);
      return { label: st.label, action: st.action, asset: st.asset, chain: route.chain, cost_usd: +(g + (isLastOp ? br : 0)).toFixed(2), time_min: st.time_min, verify: st.verify };
    });
    const opIdx = steps.findIndex((s) => s.label === exitStep.label);
    const fixIdx = opIdx >= 0 ? opIdx : n - 1;
    const diff = +(tot - steps.reduce((s, st) => s + st.cost_usd, 0)).toFixed(2);
    steps[fixIdx].cost_usd = +(steps[fixIdx].cost_usd + diff).toFixed(2);

    const hours = +Math.max(1.5, steps.reduce((s, st) => s + st.time_min, 0) / 60).toFixed(2);
    const farmSteps = steps.map((st) => `[${st.label}] ${st.action} (${st.asset} on ${st.chain}; $${st.cost_usd.toFixed(2)}, ${st.time_min}m) - ${st.verify}`.slice(0, 590));
    return {
      routed_chain: route.chain, gas_tier: route.tier, min_viable_usd: minViable, gas_4w_usd: gas4w, bridge_exit_usd: br,
      slippage_bps: spec.slippage_bps, lockup_days: spec.lockup_days, hours, yield_bearing: !!spec.yield_bearing_collateral,
      assets: spec.assets, mechanism: spec.mechanism, tvl_trigger_usd: Math.round(tvl30), tvl_trigger_label: tvlTrigger,
      chain_rationale: spec.chain_rationale || `Lowest-fee listed chain (${route.chain})`,
      non_farm_flag: spec.non_farm_flag || null, kyc_or_geo: spec.kyc_or_geo,
      exit_mechanics: `${spec.exit_mechanics} Review trigger: TVL < ${tvlTrigger} (-30%).`,
      key_risks: spec.key_risks, unknowns: spec.unknowns, steps, farmSteps,
    };
  }

  function calcEconomics(opts) {
    const cap = Number(opts.capital_usd), gas = Number(opts.gas_4w_usd), br = Number(opts.bridge_exit_usd);
    const slipBps = Number(opts.slippage_bps || 0), days = Number(opts.lockup_days), hours = Number(opts.hours);
    const oppApr = opts.yield_bearing ? 0 : Number(opts.opp_apr ?? 0.04), dragMax = Number(opts.drag_limit ?? 0.05);
    const dropShare = Number(opts.drop_share ?? 0.07), tvl = Math.max(1, Number(opts.tvl_usd || 1)), imp = Number(opts.implied_usd || 0);
    if (![cap, gas, br, slipBps, days, hours, oppApr].every(Number.isFinite) || cap <= 0 || gas < 0 || br < 0 || days < 0 || hours <= 0) return { valid: false };
    const slip = +(cap * (slipBps / 10000) * 2).toFixed(2), opp = +(cap * oppApr * (days / 365)).toFixed(2);
    const fees = +(gas + br + slip).toFixed(2), totalCost = +(fees + opp).toFixed(2);
    const dragPct = +((fees / cap) * 100).toFixed(2), totalDragPct = +((totalCost / cap) * 100).toFixed(2);
    const breakEvenPerHr = +(totalCost / hours).toFixed(2);
    const minCapUnderDrag = Math.ceil((gas + br) / Math.max(0.001, dragMax - (slipBps * 2) / 10000));
    const hypGross = +((imp * dropShare) * Math.min(0.02, cap / tvl)).toFixed(2), hypNet = +(hypGross - totalCost).toFixed(2);
    const hypPerHr = +(hypNet / hours).toFixed(2);
    let classification = 'SKIP (LOSS)';
    if (opts.non_farm_flag && /NO NATIVE TOKEN|LIVE ECOSYSTEM|LIVE STABLECOIN|NOT A FARM/i.test(opts.non_farm_flag)) classification = 'NO FARM';
    else if (opts.non_farm_flag) classification = 'RESEARCH';
    else if (dragPct <= dragMax * 100 && cap >= (opts.min_viable_usd || 0) && hypNet > 0) {
      classification = hypPerHr >= 10 ? 'VIABLE' : 'MARGINAL';
    }
    return { valid: true, cap, fees, slip, opp, totalCost, dragPct, totalDragPct, breakEvenReward: totalCost, breakEvenPerHr, minCapUnderDrag, hypGross, hypNet, hypPerHr, classification };
  }

  function buildFullBoard(snapshot, specsMap) {
    const asOfMs = Date.parse(`${snapshot.as_of}T00:00:00Z`), wlSet = new Set(snapshot.watchlist || []), famTvl = new Map();
    for (const p of snapshot.protocols) { const f = S2F.get(p.slug); if (f) famTvl.set(f, (famTvl.get(f) || 0) + (p.tvl_usd || 0)); }
    // Stand-alone non-excluded comps (excludes CEX, Bridge, LST, LRT so peer multiples stay coherent)
    const comps = snapshot.protocols.filter((p) => p.mcap_usd > 0 && p.category !== 'CEX' && !EXCLUDED_CATS.has(p.category || '')).map((p) => {
      const f = S2F.get(p.slug);
      return { slug: p.slug, name: p.name, category: p.category || 'Unknown', sc: superCat(p.category), tvl_raw: p.tvl_usd, tvl_family: f ? famTvl.get(f) : Math.max(1, p.tvl_usd), mcap_usd: p.mcap_usd, y_log: Math.log(p.mcap_usd), listed_at: p.listed_at, change_7d: p.change_7d };
    });
    const fit = fitModel(comps), oos = computeOosLadder(comps, asOfMs), pi = computePeerIncidence(snapshot.protocols, asOfMs);
    const audit = { wl: 0, clean_pre: 0, comp_u2: 0, tok_cex_other: 0, excluded_cat: 0, excluded_sib: 0 }, cand = [];
    for (const p of snapshot.protocols) {
      if (wlSet.has(p.slug)) { audit.wl++; cand.push(p); continue; }
      if (p.mcap_usd > 0 && p.category !== 'CEX' && !EXCLUDED_CATS.has(p.category || '')) { audit.comp_u2++; continue; }
      if (p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null) { audit.tok_cex_other++; continue; }
      if (EXCLUDED_CATS.has(p.category || '') || VER_RE.test(p.name || '') || WRAP_RE.test(p.name || '') || EXCH_RE.test(p.name || '')) { audit.excluded_cat++; continue; }
      if (p.slug in TOK_SIBLINGS) { audit.excluded_sib++; continue; }
      audit.clean_pre++; cand.push(p);
    }
    const rows = cand.map((p) => {
      const tvlFam = S2F.has(p.slug) ? famTvl.get(S2F.get(p.slug)) : p.tvl_usd;
      const dec = decomposeLog(fit, { ...p, tvl_family: tvlFam }, asOfMs), implied = Math.max(1, Math.round(Math.exp(dec.totalLog)));
      const wlSpec = specsMap && specsMap[p.slug], route = routeChain(p.chains, wlSpec?.preferred_chain);
      const { farmSteps, ...farm } = buildFarmPlan(p, wlSpec || classifyNonWatchlist(p, route), route);
      return {
        rank: 0, slug: p.slug, name: p.name, category: p.category || 'Unknown', sc: dec.sc, chains: p.chains,
        tvl_usd: p.tvl_usd, tvl_family: tvlFam, change_7d: p.change_7d, listed_at: p.listed_at, age_days: dec.ageDays,
        is_watchlist: wlSet.has(p.slug), n_cat_comps: fit.catCount[p.category || ''] || 0, n_sup_comps: fit.supCount[dec.sc] || 0,
        implied_value_usd: implied,
        p25_usd: Math.max(1, Math.round(Math.exp(dec.totalLog - oos.q50_log))), p75_usd: Math.max(1, Math.round(Math.exp(dec.totalLog + oos.q50_log))),
        p10_usd: Math.max(1, Math.round(Math.exp(dec.totalLog - oos.q80_log))), p90_usd: Math.max(1, Math.round(Math.exp(dec.totalLog + oos.q80_log))),
        log_decomp: { global: +Math.exp(dec.globalLog).toFixed(0), sup_mult: +Math.exp(dec.supAdj).toFixed(3), cat_mult: +Math.exp(dec.catAdj).toFixed(3) },
        peer_incidence: pi.forProtocol(p), wl_conflict: WL_CONFLICTS[p.slug] || null, farm, farm_steps: farmSteps,
      };
    }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
    rows.forEach((r, i) => { r.rank = i + 1; });
    audit.total = Object.values(audit).reduce((s, v) => s + v, 0);
    return {
      schema: 'makefun-board/v1', as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
      fit: { b0: +fit.b0.toFixed(5), b1: +fit.b1.toFixed(5), supEff: fit.supEff, catEff: fit.catEff, catCount: fit.catCount, supCount: fit.supCount },
      oos, peer_incidence: { n_peers: pi.n_peers, base_rate_pct: pi.base_rate_pct, brier_model: pi.brier_model, brier_base: pi.brier_base },
      audit_summary: audit, comps, rows,
    };
  }

  return {
    EXCLUDED_CATS, VER_RE, WRAP_RE, EXCH_RE, TOK_SIBLINGS, WL_CONFLICTS, SPLIT_FAM, S2F, superCat,
    mean, median, quantile, fitModel, decomposeLog, computeOosLadder, computePeerIncidence,
    routeChain, classifyNonWatchlist, buildFarmPlan, calcEconomics, buildFullBoard,
  };
});
