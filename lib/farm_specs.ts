// Offline Farm Spec & Playbook Builder for all 184 pre-token protocols (Node 22)
const T1 = new Set('Arbitrum,Base,Optimism,Polygon,Solana,Sui,BSC,Binance,Avalanche,Flare,Ink,Monad,Plasma,CORE,Sei,Mantle,Scroll,Linea,Blast,Sonic,Abstract,Berachain,Unichain,Hyperliquid L1,Stellar,Algorand,Noble,Tron,Plume Mainnet,Ripple,Bittensor,BSquared,Mezo,Aptos,Near,TON,Reya Network,Robinhood Chain,Ronin,Sophon,RISE,Fluent,Stacks,RSK,Tempo,Klaytn'.split(','));
const T2 = new Set('Starknet,zkSync Era,Cardano,Bitcoin,Bitcoin (Lightning),Babylon Genesis,Pharos,Arc,Provenance,Canton,Qubic,Strato'.split(','));

// Honest off-watchlist protocol diligence overrides (preserving CADENCE, RECORD, and full hours/slippage discipline)
const OFFLIST_SPECS: Record<string, any> = {
  'sentora-curator': { preferred_chain: 'Ink', mechanism: 'Institutional risk-curated Morpho/Euler/DeFi vaults across Ink/Ethereum/Solana.', assets: 'USDC / WETH', min_viable_usd: 250, lockup_days: 30, tx_count: 5, bridge_exit_usd: 1.5, slippage_bps: 5, yield_bearing_collateral: true, non_farm_flag: null, kyc_or_geo: 'Check institutional vault access', exit_mechanics: 'Redeem curator share to USDC on Ink or Ethereum.', key_risks: 'Extreme TVL ($2.76B) dilution; borrower utilization risk.', unknowns: 'Points & curator fee share.', steps: [{ label: 'CHECK', action: 'Inspect Sentora Curator vault cap & borrow utilization on Ink', asset: 'Read-only', time_min: 15, verify: 'Queue open' }, { label: 'DEPOSIT', action: 'Deposit USDC into Sentora curated ERC-4626 vault', asset: 'USDC', time_min: 15, verify: 'Share minted' }, { label: 'EXIT', action: 'Redeem vault share to USDC', asset: 'USDC', time_min: 15, verify: 'USDC settled' }] },
  'polymarket-international': { preferred_chain: 'Polygon', mechanism: 'CLOB binary YES/NO event orderbook in USDC.e (UMA optimistic oracle resolution).', assets: 'USDC.e / USDC', min_viable_usd: 150, lockup_days: 30, tx_count: 5, bridge_exit_usd: 1.5, slippage_bps: 30, yield_bearing_collateral: false, non_farm_flag: 'GEO-BLOCK / NO AMM LP', kyc_or_geo: 'Geo-blocked in restricted jurisdictions', exit_mechanics: 'Sell CLOB limit shares or redeem resolved $1 outcome.', key_risks: 'Geo-block & oracle dispute risk.', unknowns: 'Eligibility cutoff.', steps: [{ label: 'CHECK', action: 'Verify jurisdiction compliance & UMA market rules on Polygon', asset: 'Read-only', time_min: 15, verify: 'Clear' }, { label: 'TRADE', action: 'Provide maker liquidity on binary YES/NO CLOB markets', asset: 'USDC.e', time_min: 45, verify: 'Orders filled' }, { label: 'EXIT', action: 'Sell shares or redeem $1 resolved payout', asset: 'USDC.e', time_min: 15, verify: 'Settled' }] },
  'extended-perps': { preferred_chain: 'Starknet', mechanism: 'Starknet hybrid CLOB perpetual futures DEX & HLP liquidity vault.', assets: 'USDC', min_viable_usd: 250, lockup_days: 30, tx_count: 6, bridge_exit_usd: 2.0, slippage_bps: 15, yield_bearing_collateral: true, non_farm_flag: null, kyc_or_geo: 'Check US/sanctioned geo-gates', exit_mechanics: 'Close perp/LP vault position on Starknet and bridge USDC via StarkGate/Orbiter.', key_risks: 'Vault trader PnL variance & Starknet withdrawal delay.', unknowns: 'Extended points season weighting.', steps: [{ label: 'BRIDGE', action: 'Bridge USDC onto Starknet CLOB margin account', asset: 'USDC', time_min: 15, verify: 'Margin funded' }, { label: 'PROVIDE', action: 'Allocate USDC to Extended HLP vault or maker CLOB orders', asset: 'USDC', time_min: 30, verify: 'Active margin/LP' }, { label: 'EXIT', action: 'Withdraw USDC from Starknet vault & bridge back', asset: 'USDC', time_min: 15, verify: 'USDC settled' }] },
  'bitfi-basis': { preferred_chain: 'Binance', mechanism: 'CeDeFi BTC delta-neutral basis yield (bfBTC minted via Ceffu/MirrorX custody hedging).', assets: 'BTC / BTCB / bfBTC', min_viable_usd: 250, lockup_days: 45, tx_count: 4, bridge_exit_usd: 2.0, slippage_bps: 10, yield_bearing_collateral: true, non_farm_flag: 'CEDEFI CUSTODY RISK', kyc_or_geo: 'Check institutional/regional terms', exit_mechanics: 'Request bfBTC unstake (epoch settlement) or swap BTCB pair on BNB Chain.', key_risks: 'Off-exchange Ceffu/MirrorX custody & negative BTC perp funding.', unknowns: 'BitFi tokenomics & epoch withdrawal queues.', steps: [{ label: 'AUDIT', action: 'Inspect BitFi bfBTC Ceffu custody attestation & unstake queue', asset: 'Read-only', time_min: 15, verify: 'Zero freeze' }, { label: 'MINT', action: 'Stake BTCB/BTC to mint bfBTC basis vault share', asset: 'BTCB -> bfBTC', time_min: 15, verify: 'bfBTC held' }, { label: 'REDEEM', action: 'Unstake bfBTC post-epoch back to BTCB/BTC', asset: 'bfBTC -> BTCB', time_min: 15, verify: 'BTC settled' }] },
  'theo-network-thusd': { preferred_chain: 'Ethereum', mechanism: 'Institutional RWA tokenized US Treasury dollar (thUSD / thBILL) on Ethereum L1.', assets: 'USDC / thUSD', min_viable_usd: 1000, lockup_days: 45, tx_count: 4, bridge_exit_usd: 10.0, slippage_bps: 5, yield_bearing_collateral: true, non_farm_flag: 'CHECK RWA KYC', kyc_or_geo: 'KYC/accredited mint gate; check Ethereum DEX swaps', exit_mechanics: 'T+1..T+3 primary RWA redemption or secondary Curve/DEX swap.', key_risks: 'KYC gating & Ethereum L1 gas below $1,000.', unknowns: 'Theo TGE schedule.', steps: [{ label: 'KYC', action: 'Confirm primary thUSD mint KYC status or secondary L1 pool depth', asset: 'USDC', time_min: 15, verify: 'Spread <0.3%' }, { label: 'MINT', action: 'Deposit >=$1,000 USDC into Theo thUSD RWA vault (<12 gwei)', asset: 'USDC -> thUSD', time_min: 15, verify: 'thUSD minted' }, { label: 'REDEEM', action: 'Submit T+1..T+3 redemption back to USDC', asset: 'thUSD -> USDC', time_min: 15, verify: 'USDC settled' }] },
  'mellow-core': { preferred_chain: 'Ethereum', mechanism: 'Modular LRT / Symbiotic restaking curator vaults concentrated on Ethereum L1.', assets: 'wstETH / ETH / rETH', min_viable_usd: 1000, lockup_days: 45, tx_count: 4, bridge_exit_usd: 10.0, slippage_bps: 5, yield_bearing_collateral: true, non_farm_flag: null, kyc_or_geo: 'None', exit_mechanics: 'Async restaking epoch withdrawal (7–21d) or DEX LRT swap.', key_risks: 'Operator slashing, unbonding delay, Ethereum L1 gas.', unknowns: 'Stacked Mellow + Symbiotic point split.', steps: [{ label: 'CHECK', action: 'Inspect Mellow vault slashing rules & Symbiotic cooldown on Ethereum', asset: 'Read-only', time_min: 15, verify: 'Vault open' }, { label: 'STAKE', action: 'Deposit >=$1,000 wstETH/ETH into active Mellow curator vault', asset: 'wstETH', time_min: 15, verify: 'LRT share minted' }, { label: 'EXIT', action: 'Initiate epoch withdraw & claim ETH/wstETH', asset: 'wstETH', time_min: 15, verify: 'Funds claimed' }] },
  'nado-spot': { preferred_chain: 'Ink', mechanism: 'Unified spot & perp CLOB orderbook DEX on Ink L2 (Kraken OP-Stack).', assets: 'USDC / ETH', min_viable_usd: 150, lockup_days: 30, tx_count: 5, bridge_exit_usd: 1.0, slippage_bps: 10, yield_bearing_collateral: false, non_farm_flag: null, kyc_or_geo: 'Check regional terms', exit_mechanics: 'Cancel open CLOB orders and withdraw USDC from Ink L2.', key_risks: 'Inventory spread risk on CLOB orderbooks.', unknowns: 'Fee rebate / points weighting.', steps: [{ label: 'BRIDGE', action: 'Bridge USDC & ETH gas to Ink L2 for Nado CLOB margin', asset: 'USDC', time_min: 15, verify: 'Margin credited' }, { label: 'TRADE', action: 'Place maker limit orders on Nado spot/perp books', asset: 'USDC', time_min: 30, verify: 'Maker fills logged' }, { label: 'EXIT', action: 'Withdraw idle USDC margin off Nado', asset: 'USDC', time_min: 15, verify: 'USDC settled' }] },
  'avant-avusd': { preferred_chain: 'Avalanche', mechanism: 'Delta-neutral synthetic dollar (avUSD / savUSD) with junior risk-tranche backing on Avalanche.', assets: 'USDC / avUSD', min_viable_usd: 150, lockup_days: 30, tx_count: 4, bridge_exit_usd: 1.5, slippage_bps: 10, yield_bearing_collateral: true, non_farm_flag: null, kyc_or_geo: 'None', exit_mechanics: 'Unstake savUSD cooldown on Avalanche or swap avUSD -> USDC.', key_risks: 'Basis funding compression & de-peg variance.', unknowns: 'Avant points-to-token conversion.', steps: [{ label: 'CHECK', action: 'Inspect savUSD peg stability & staking APR on Avalanche', asset: 'Read-only', time_min: 15, verify: 'Peg within 0.3%' }, { label: 'STAKE', action: 'Mint/stake USDC -> avUSD -> savUSD on Avalanche', asset: 'USDC -> savUSD', time_min: 15, verify: 'savUSD held' }, { label: 'EXIT', action: 'Unstake savUSD post-cooldown and swap to USDC', asset: 'savUSD -> USDC', time_min: 15, verify: 'USDC settled' }] },
  'figure-markets-prime': { preferred_chain: 'Provenance', mechanism: 'Provenance blockchain RWA & YLDS-backed credit lending marketplace.', assets: 'YLDS / USDC / HASH', min_viable_usd: 250, lockup_days: 45, tx_count: 4, bridge_exit_usd: 2.0, slippage_bps: 10, yield_bearing_collateral: true, non_farm_flag: 'CHECK RWA KYC', kyc_or_geo: 'KYC / Provenance onboarding likely', exit_mechanics: 'Repay credit/withdraw Provenance lending collateral.', key_risks: 'KYC onboarding friction & Provenance liquidity.', unknowns: 'Token incentives vs YLDS yield.', steps: [{ label: 'KYC', action: 'Verify Provenance wallet onboarding & lending market eligibility', asset: 'USDC / YLDS', time_min: 20, verify: 'Account approved' }, { label: 'SUPPLY', action: 'Deposit YLDS/USDC into Figure Markets Prime pool', asset: 'YLDS / USDC', time_min: 15, verify: 'Supply active' }, { label: 'EXIT', action: 'Withdraw principal + interest to wallet', asset: 'USDC', time_min: 15, verify: 'Settled' }] },
  'figure-markets-exchange': { preferred_chain: 'Provenance', mechanism: 'Tokenized RWA / OTC credit orderbook marketplace on Provenance.', assets: 'YLDS / USDC', min_viable_usd: 250, lockup_days: 30, tx_count: 4, bridge_exit_usd: 2.0, slippage_bps: 15, yield_bearing_collateral: true, non_farm_flag: 'CHECK RWA KYC', kyc_or_geo: 'KYC required for Provenance OTC trades', exit_mechanics: 'Settle OTC fill or withdraw USDC/YLDS.', key_risks: 'KYC gate & Provenance secondary spread.', unknowns: 'Separate exchange token plans.', steps: [{ label: 'KYC', action: 'Complete Provenance identity onboarding for Figure Exchange', asset: 'USDC', time_min: 20, verify: 'KYC cleared' }, { label: 'TRADE', action: 'Place limit OTC orders on YLDS/RWA pairs', asset: 'USDC / YLDS', time_min: 20, verify: 'Fill confirmed' }, { label: 'EXIT', action: 'Withdraw settled USDC off Provenance', asset: 'USDC', time_min: 15, verify: 'Settled' }] },
  'ipor-fusion': { preferred_chain: 'Arbitrum', mechanism: 'IPOR Fusion automated DeFi liquidity/lending aggregator vaults (parent IPOR records token).', assets: 'USDC / ETH', min_viable_usd: 150, lockup_days: 30, tx_count: 4, bridge_exit_usd: 1.5, slippage_bps: 10, yield_bearing_collateral: true, non_farm_flag: 'PARENT TOKEN RISK (IPOR)', kyc_or_geo: 'None', exit_mechanics: 'Redeem Fusion PlasmaVault share on Arbitrum/Base.', key_risks: 'Parent IPOR ecosystem already trades elsewhere; vault market allocation risk.', unknowns: 'Whether Fusion distributes IPOR vs a separate sub-token.', steps: [{ label: 'VERIFY', action: 'Confirm IPOR Fusion reward split (IPOR emissions vs vault fees)', asset: 'Read-only', time_min: 15, verify: 'Incentives clear' }, { label: 'DEPOSIT', action: 'Deposit USDC into Fusion PlasmaVault on Arbitrum', asset: 'USDC', time_min: 15, verify: 'Shares minted' }, { label: 'EXIT', action: 'Withdraw USDC cleanly from PlasmaVault', asset: 'USDC', time_min: 15, verify: 'USDC settled' }] },
  'loopscale-lending': { preferred_chain: 'Solana', mechanism: 'Solana orderbook-style fixed-rate modular lending market.', assets: 'USDC / SOL / JLP', min_viable_usd: 150, lockup_days: 30, tx_count: 4, bridge_exit_usd: 1.0, slippage_bps: 10, yield_bearing_collateral: true, non_farm_flag: null, kyc_or_geo: 'None', exit_mechanics: 'Wait fixed-term loan maturity or withdraw idle Solana vault liquidity.', key_risks: 'Fixed-term maturity lock until borrower repays.', unknowns: 'Loopscale points/token conversion.', steps: [{ label: 'CHECK', action: 'Check Loopscale Solana orderbook fixed-rate loan maturity & LTV', asset: 'Read-only', time_min: 15, verify: 'Match <=30d term' }, { label: 'LEND', action: 'Fill fixed-rate USDC lending order on Solana', asset: 'USDC', time_min: 15, verify: 'Receipt settled' }, { label: 'EXIT', action: 'Claim principal + fixed interest at loan maturity', asset: 'USDC', time_min: 15, verify: 'USDC settled' }] },
};

const fx = (n: number, d = 2) => +n.toFixed(d);

export function routeChain(chains: string[] | undefined, pref?: string) {
  const list = Array.isArray(chains) && chains.length ? chains : ['Ethereum'];
  const tierOf = (c: string) => (T1.has(c) ? 1 : T2.has(c) || c !== 'Ethereum' ? 2 : 3);
  const chain = pref || [...list].sort((a, b) => tierOf(a) - tierOf(b))[0]!;
  const tier = chain === 'Ethereum' ? 3 : tierOf(chain);
  const ethAlt = chain !== 'Ethereum' && list.includes('Ethereum');
  return { chain, tier, ethAlt, txGas: tier === 1 ? 0.15 : tier === 2 ? 0.65 : 6.0, defBridge: tier === 1 ? 1.5 : tier === 2 ? 3.0 : 12.0 };
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
      exit_mechanics: 'Sell CLOB shares or redeem $1.', key_risks: 'Oracle/geo risk.', unknowns: 'Unconfirmed token plans.',
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
      exit_mechanics: 'Withdraw idle USDC or queue.', key_risks: 'Default/lockup.', unknowns: 'Unconfirmed distribution terms.',
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
    const wl = watchlistSpecs[p.slug] || OFFLIST_SPECS[p.slug];
    const rt = routeChain(p.chains, wl?.preferred_chain);
    const sp = wl || classifyNonWatchlist(p, rt);
    const br = +(sp.bridge_exit_usd ?? rt.defBridge), gas = fx(sp.tx_count * rt.txGas), tot = fx(gas + br);
    const minV = Math.ceil(Math.max(sp.min_viable_usd || 100, Math.ceil(tot / Math.max(0.005, 0.05 - sp.slippage_bps * 2e-4))) / 25) * 25;
    const t30 = p.tvl_usd * 0.7, tLab = t30 >= 1e9 ? `$${(t30 / 1e9).toFixed(2)}B` : `$${(t30 / 1e6).toFixed(1)}M`;
    const wks = Math.max(4, Math.round((sp.lockup_days || 30) / 7));
    const XR = /EXIT|UNBOND|REDEEM|CLOSE|UNSTAKE/i, OR = /FUND|BRIDGE|DEPOSIT|DEPLOY|STAKE|TRADE|SUPPLY|UNDERWRITE|SWAP|WRAP|ALLOCATE|MINT|SUBSCRIBE|ACQUIRE|OPEN|PROVIDE|LEND/i;
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
        routed_chain: rt.chain, gas_tier: rt.tier, eth_l1_alt: rt.ethAlt, min_viable_usd: minV, gas_4w_usd: gas, bridge_exit_usd: br,
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
