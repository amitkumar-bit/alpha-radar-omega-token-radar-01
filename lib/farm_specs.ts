// Offline Farm Spec & Playbook Builder for all 184 pre-token protocols (Node 22)
const T1 = new Set('Arbitrum,Base,Optimism,Polygon,Solana,Sui,BSC,Binance,Avalanche,Flare,Ink,Monad,Plasma,CORE,Sei,Mantle,Scroll,Linea,Blast,Sonic,Abstract,Berachain,Unichain,Hyperliquid L1,Stellar,Algorand,Noble,Tron,Plume Mainnet,Ripple,Bittensor,BSquared,Mezo,Aptos,Near,TON'.split(','));
const T2 = new Set('Starknet,zkSync Era,Cardano,Bitcoin,Babylon Genesis,Pharos,Arc'.split(','));

const fx = (n: number, d = 2) => +n.toFixed(d);

export function routeChain(chains: string[] | undefined, pref?: string) {
  const list = Array.isArray(chains) && chains.length ? chains : ['Ethereum'];
  const tierOf = (c: string) => (T1.has(c) ? 1 : T2.has(c) || c !== 'Ethereum' ? 2 : 3);
  const chain = pref || [...list].sort((a, b) => tierOf(a) - tierOf(b))[0]!;
  const tier = chain === 'Ethereum' ? 3 : tierOf(chain);
  return { chain, tier, txGas: tier === 1 ? 0.15 : tier === 2 ? 0.65 : 6.0, defBridge: tier === 1 ? 1.5 : tier === 2 ? 3.0 : 12.0 };
}

export function classifyNonWatchlist(p: any, r: ReturnType<typeof routeChain>) {
  const c = p.category || 'DeFi', eth = r.tier === 3, ch = r.chain;
  const mk = (steps: [string, string, string, number, string][]) =>
    steps.map(([label, action, asset, time_min, verify]) => ({ label, action, asset, time_min, verify }));
  if (c === 'Prediction Market') {
    return {
      mechanism: 'CLOB binary YES/NO shares in USDC.e (orderbook only).',
      assets: 'USDC.e/USDC', min_viable_usd: 150, lockup_days: 30, tx_count: 5,
      bridge_exit_usd: r.defBridge, slippage_bps: 30, yield_bearing_collateral: false,
      non_farm_flag: 'GEO-BLOCK / NO AMM LP', kyc_or_geo: 'Geo-blocked jurisdictions',
      exit_mechanics: 'Sell CLOB shares or redeem $1.', key_risks: 'Oracle/geo risk.', unknowns: 'Token odds.',
      steps: mk([
        ['CHECK', `Verify jurisdiction & UMA rules on ${ch}`, 'Read-only', 15, 'Clear'],
        ['FUND', `Bridge USDC.e & gas onto ${ch}`, 'USDC.e', 15, 'Settled'],
        ['TRADE', 'Place maker YES/NO CLOB orders (orderbook only)', 'USDC.e', 45, 'Live'],
        ['EXIT', 'Sell shares or redeem $1 outcomes', 'USDC.e', 15, 'Settled'],
      ]),
    };
  }
  if (c === 'Uncollateralized Lending') {
    return {
      mechanism: 'Single-sided USDC credit pool (NO borrower LTV minting).',
      assets: 'USDC', min_viable_usd: eth ? 1000 : 250, lockup_days: 45, tx_count: 4,
      bridge_exit_usd: r.defBridge, slippage_bps: 5, yield_bearing_collateral: false,
      non_farm_flag: 'CREDIT DEFAULT RISK', kyc_or_geo: 'Credit screening',
      exit_mechanics: 'Withdraw idle USDC or queue.', key_risks: 'Default/lockup.', unknowns: 'Drop odds.',
      steps: mk([
        ['AUDIT', `Check borrower defaults & liquidity on ${ch}`, 'Read-only', 20, 'Verified'],
        ['SUPPLY', `Deposit USDC into ${p.name}`, 'USDC', 15, 'Receipt'],
        ['EXIT', 'Withdraw USDC or clear queue', 'USDC', 15, 'Settled'],
      ]),
    };
  }
  const isC = /Curators|Allocator|Liquidity Manager|Yield/i.test(c), isB = /Basis/i.test(c);
  const isR = /RWA|CeDeFi/i.test(c), isD = /Deriv|Options/i.test(c), isX = /Dexs/i.test(c);
  return {
    mechanism: isC ? `Curated vault via ${p.name}.` : isB ? 'Delta-neutral spot+perp vault.' : isR ? 'Tokenized RWA vault.' : isD ? 'Perp/orderbook liquidity vault.' : isX ? `DEX LP/swaps on ${p.name}.` : `${c} on ${p.name} (${ch}).`,
    assets: isX ? 'USDC/pair' : 'USDC/ETH',
    min_viable_usd: eth ? 1000 : isR || isD ? 250 : 100,
    lockup_days: isB || isR ? 45 : 30,
    tx_count: isD ? 6 : 4,
    bridge_exit_usd: r.defBridge,
    slippage_bps: isD || isX ? 20 : 10,
    yield_bearing_collateral: isB || isR || /Yield/i.test(c),
    non_farm_flag: isR ? 'CHECK RWA KYC' : /Payments|Indexes/i.test(c) ? 'VERIFY TOKEN PLANS' : null,
    kyc_or_geo: isR ? 'Primary mint may need KYC' : 'Check UI terms',
    exit_mechanics: isR ? 'T+1..T+7 settlement or DEX swap.' : `Redeem to base on ${ch}.`,
    key_risks: isD ? 'Trader PnL/funding.' : isR ? 'KYC/custody.' : 'Contract/queue risk.',
    unknowns: 'Points & unconfirmed drop.',
    steps: mk([
      ['VERIFY', `Check ${p.name} contract & ${ch} depth`, 'Read-only', 15, 'Open'],
      ['DEPLOY', `Allocate into ${p.name} on ${ch}`, isX ? 'USDC/pair' : 'USDC', 20, 'Receipt'],
      ['EXIT', `Unwind back to USDC on ${ch}`, 'USDC', 15, 'Settled'],
    ]),
  };
}

export function buildAllSpecs(snapshot: any, watchlistSpecs: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const p of snapshot.protocols || []) {
    const wl = watchlistSpecs[p.slug];
    const rt = routeChain(p.chains, wl?.preferred_chain);
    const sp = wl || classifyNonWatchlist(p, rt);
    const br = +(sp.bridge_exit_usd ?? rt.defBridge), gas = fx(sp.tx_count * rt.txGas), tot = fx(gas + br);
    const minV = Math.ceil(Math.max(sp.min_viable_usd || 100, Math.ceil(tot / Math.max(0.005, 0.05 - sp.slippage_bps * 2e-4))) / 25) * 25;
    const t30 = p.tvl_usd * 0.7, tLab = t30 >= 1e9 ? `$${(t30 / 1e9).toFixed(2)}B` : `$${(t30 / 1e6).toFixed(1)}M`;
    const wks = Math.max(4, Math.round((sp.lockup_days || 30) / 7));
    const XR = /EXIT|UNBOND|REDEEM|CLOSE|UNSTAKE/i, OR = /FUND|BRIDGE|DEPOSIT|DEPLOY|STAKE|TRADE|SUPPLY|UNDERWRITE|SWAP|WRAP|ALLOCATE|MINT|SUBSCRIBE|ACQUIRE|OPEN/i;
    const core = sp.steps.filter((s: any) => !XR.test(s.label) && !/MONITOR/i.test(s.label));
    const ex = sp.steps.find((s: any) => XR.test(s.label)) || { label: 'EXIT', action: `Unwind to base on ${rt.chain}`, asset: sp.assets, time_min: 15, verify: 'Settled' };
    const full = [...core.map((s: any) => ({ ...s, time_min: Math.max(10, s.time_min) })), { label: 'CADENCE', action: `${wks} weekly APY & rules checks (${wks}x10m)`, asset: 'Check', time_min: wks * 10, verify: 'No lock change' }, { label: 'WATCH', action: `Exit if TVL <${tLab} (-30%) or queue freezes`, asset: 'Trigger', time_min: 15, verify: `TVL>=${tLab}` }, { ...ex, time_min: Math.max(15, ex.time_min) }, { label: 'RECORD', action: 'Export tx hashes, gas & USD log', asset: 'Log', time_min: 15, verify: 'Saved' }];
    let rem = gas;
    const steps = full.map((st, i) => { const g = (XR.test(st.label) || OR.test(st.label)) ? fx(rem / Math.max(1, full.length - i)) : 0; rem = fx(rem - g); return { label: st.label, action: st.action, asset: st.asset, chain: rt.chain, cost_usd: fx(g + (i === full.length - 2 ? br : 0)), time_min: st.time_min, verify: st.verify }; });
    const fI = Math.max(0, steps.findIndex((s) => s.label === ex.label));
    steps[fI]!.cost_usd = fx(steps[fI]!.cost_usd + fx(tot - steps.reduce((s, st) => s + st.cost_usd, 0)));
    const hrs = fx(Math.max(1.5, steps.reduce((s, st) => s + st.time_min, 0) / 60));
    out[p.slug] = {
      ...sp,
      preferred_chain: rt.chain,
      precomputed_farm: {
        routed_chain: rt.chain, gas_tier: rt.tier, min_viable_usd: minV, gas_4w_usd: gas, bridge_exit_usd: br,
        slippage_bps: sp.slippage_bps, lockup_days: sp.lockup_days, hours: hrs, yield_bearing: !!sp.yield_bearing_collateral,
        assets: sp.assets, mechanism: sp.mechanism, tvl_trigger_usd: Math.round(t30), tvl_trigger_label: tLab,
        non_farm_flag: sp.non_farm_flag || null, kyc_or_geo: sp.kyc_or_geo, exit_mechanics: `${sp.exit_mechanics} Trigger: <${tLab} (-30%).`,
        key_risks: sp.key_risks, unknowns: sp.unknowns, steps,
        farmSteps: steps.map((st) => `[${st.label}] ${st.action} (${st.asset} on ${st.chain}; $${st.cost_usd.toFixed(2)}, ${st.time_min}m) - ${st.verify}`.slice(0, 590)),
      },
    };
  }
  return out;
}
