(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OMEGA=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){const DAY_MS=864e5;const{log:L0,exp:E0,max,min,abs,round,sqrt,floor,ceil}=Math;
const toSet=v=>new Set(v.split(','));
const fx=(n,d=2)=>+n.toFixed(d);
const ct=p=>p.category||'';
const Z=Number.isFinite;
const L=v=>L0(max(1,v));
const MD={name:'Hybrid Comparable x Growth x Maturity (Model D)',growth_weight:0.35,growth_floor:-50,growth_cap:100,growth_min:0.75,growth_max:1.4,maturity_floor:0.8,maturity_range:0.4,maturity_days:1095,unknown_age_days:365,k_sup:6,k_cat:24,};
const XC=toSet('CEX,Chain,Bridge,Canonical Bridge,Cross Chain Bridge,Liquid Staking,Liquid Restaking,Restaked BTC,Stablecoin Wrapper,Anchor BTC,Decentralized BTC');
const VR=/\s(V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const WR=/\b(wrapped|staked|staking)\b/i;
const XR=/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini|Crypto\.com)\b/i;
const TS={'flying-tulip-ftusd':1,'gmx-solana':1,'kava-mint':1,'manta-cedefi':1,'metalx-swap':1,'solv-strategies':1};
const WC={'mezo-earn':'Sibling mezo-bridge records symbol MEZO without CoinGecko mcap'};
const SF=new Map();'aave-v1,aave-v2,aave-v3,aave-v4,aave-horizon-rwa|uniswap-v1,uniswap-v2,uniswap-v3,uniswap-v4|curve-dex,curve-llamalend,curve-llamalend-v2|compound-v1,compound-v2,compound-v3|ethena-usde,ethena-usdtb|pendle-v2,pendle-loop|morpho-blue,morpho-midnight|euler-v1,euler-v2|sparklend,spark-savings,spark-liquidity-layer,sparkdex-v3.1,sparkdex-v4|jupiter-perpetual-exchange,jupiter-staked-sol,jupiter-lend,jupiter-lend-dex|kamino-lend,kamino-liquidity|sky-lending,sky-money,sky-rwa' .split('|').forEach((g,i)=>g.split(',').forEach(s=>SF.set(s,i)));
const scF=c=>/dex|deriv|perp|prediction|options|synth/i.test(c||'')?'TRADING':/lending|cdp|uncollater/i.test(c||'')?'CREDIT':/liquid staking|restaking|staking pool|collateral|anchor/i.test(c||'')?'STAKING':/bridge/i.test(c||'')?'BRIDGE':/rwa|cedefi/i.test(c||'')?'RWA':/yield|allocator|curator|basis|farm|liquidity manager/i.test(c||'')?'YIELD_CURATOR':'OTHER';
const mn=a=>(a.length?a.reduce((x,y)=>x+y,0)/ a.length:0);
const qn=(a,q)=>{if(!a.length)return 0;
const s=[...a].sort((x,y)=>x-y),p=(s.length-1)*q,l=floor(p),h=ceil(p);return l===h?s[l]:s[l]+(s[h]-s[l])*(p-l)};
const mdF=a=>qn(a,0.5);
const tk=p=>p.mcap_usd!==null||p.gecko_id!==null||p.symbol!==null;
const ic=p=>p.mcap_usd>0&&ct(p)!=='CEX'&&!XC.has(ct(p));
function ageOf(at,ms){
if(!at)return null;
const t=Date.parse(at.includes('T')?at:`${at}T00:00:00Z`);return Z(t)?max(0,floor((ms-t)/ DAY_MS)):null}
function huber(x,y){
let b0=0,b1=0.5,w=x.map(()=>1);for(let t=0;t<40;t++){let a=0,b=0,c=1e-4,e=0,f=0;for(let i=0;i<x.length;i++){a+=w[i];b+=w[i]*x[i];c+=w[i]*x[i]*x[i];e+=w[i]*y[i];f+=w[i]*x[i]*y[i]}
const d=a*c-b*b||1e-12,u=(c*e-b*f)/ d,v=(a*f-b*e)/ d;
const rs=y.map((z,j)=>z-(u+v*x[j])),md=mdF(rs.map(abs))/ 0.6745||1;if(abs(u-b0)+abs(v-b1)<1e-6)return [u,v];b0=u;b1=v;for(let i=0;i<x.length;i++){const z=abs(rs[i])/ md;w[i]=z<=1.345?1:1.345 / z}}return [b0,b1]}
function fitModel(cs,o,ms){
const kS=o?.kSup??MD.k_sup,kC=o?.kCat??MD.k_cat;const[b0,b1]=huber(cs.map(r=>L(r.tvl_family)),cs.map(r=>r.y_log));
const sR=new Map(),cR=new Map(),supEff={},catEff={},catCount={},supCount={};cs.forEach(r=>{const e=r.y_log-(b0+b1*L(r.tvl_family)),s=scF(r.category);(sR.get(s)||sR.set(s,[]).get(s)).push(e);(cR.get(r.category)||cR.set(r.category,[]).get(r.category)).push(e)});for(const[k,a]of sR){supCount[k]=a.length;supEff[k]=(a.length /(a.length+kS))*mdF(a)}for(const[k,a]of cR){catCount[k]=a.length;
const p=supEff[scF(k)]??0;catEff[k]=a.length>=2?p+(a.length /(a.length+kC))*(mdF(a)-p):p}
let s11=2,s12=0,s22=2,t1=0,t2=0;if(ms){for(const r of cs){const e=max(-2.5,min(2.5,r.y_log-(b0+b1*L(r.tvl_family)+(catEff[r.category]??supEff[scF(r.category)]??0))));
const x1=max(-0.5,min(1,(r.change_7d!=null&&Z(r.change_7d)?r.change_7d:0)/ 100));
const x2=(min(1095,ageOf(r.listed_at,ms)??365)-365)/ 1095;s11+=x1*x1;s12+=x1*x2;s22+=x2*x2;t1+=x1*e;t2+=x2*e}}
const dt=s11*s22-s12*s12||1e-9;return {b0,b1,flatMed:mdF(cs.map(r=>r.y_log)),supEff,catEff,catCount,supCount,jG:(s22*t1-s12*t2)/ dt,jM:(s11*t2-s12*t1)/ dt}}
function decomposeLog(fit,r,ms,fl){
const eb=fl?.useEb!==false&&fl?.useEb!==0,c=ct(r)||'Unknown',sc=scF(c),tvl=max(1,r.tvl_family||r.tvl_usd||1),gL=fit.b0+fit.b1*L0(tvl),sA=eb?fit.supEff[sc]??0:0,cA=(eb?(c in fit.catEff?fit.catEff[c]:sA):0)-sA,bL=gL+sA+cA;
const gm0=r.change_7d==null||!Z(r.change_7d),gR=gm0?0:r.change_7d,gC=fl?.starter?max(-60,min(120,gR)):max(MD.growth_floor,min(MD.growth_cap,gR)),aD=ageOf(r.listed_at,ms),aM=aD===null,aU=min(MD.maturity_days,aD??MD.unknown_age_days);
const out={tvl,sc,baseLog:bL,globalLog:gL,supAdj:sA,catAdj:cA,gClamp:gC,gMissing:gm0,gMult:1,ageDays:aD,ageMissing:aM,ageUsed:aU,mMult:1,totalLog:bL};if(fl?.starter){out.gMult=1+(gC / 100)*0.5;out.mMult=0.6+(aU / MD.maturity_days)*0.4;out.baseLog=out.globalLog=out.totalLog=L((r.tvl_usd||tvl)*0.25*out.gMult*out.mMult);out.supAdj=out.catAdj=0;return out}if(fl?.joint){out.totalLog=bL+(fit.jG||0)*(gC / 100)+(fit.jM||0)*((aU-365)/ 1095);return out}out.gMult=fl?.noGM?1:max(MD.growth_min,min(MD.growth_max,1+MD.growth_weight*(gC / 100)));out.mMult=fl?.noGM?1:MD.maturity_floor+(aU / MD.maturity_days)*MD.maturity_range;out.totalLog=bL+L0(out.gMult)+L0(out.mMult);return out}
function peerKy(p,ms){const d=ageOf(p.listed_at,ms)??365;return `${scF(ct(p))}|${d<180?'0-6m':d<540?'6-18m':'18m+'}`}
function peerStats(ps,ms){const pr=ps.filter(p=>ct(p)!=='CEX'&&!XC.has(ct(p))),bk=new Map(),tot=pr.filter(tk).length;pr.forEach(p=>{const k=peerKy(p,ms),b=bk.get(k)||{tok:0,tot:0};b.tot++;if(tk(p))b.tok++;bk.set(k,b)});return {pr,bk,tot,bs:tot/ max(1,pr.length)}}
function datedSplit(cs){const dt=cs.filter(r=>r.listed_at).sort((a,b)=>Date.parse(a.listed_at)-Date.parse(b.listed_at)),cut=floor(dt.length*0.7);return [dt.slice(0,cut),dt.slice(cut),cut]}
function computeOosLadder(cs,ms){
const n=cs.length,pe=v=>fx(E0(v)),dL=(f,r,fl)=>decomposeLog(f,r,ms,fl).totalLog;
const sp=[['flat','Flat median',f=>f.flatMed,0],['A','A. Official Starter',(f,r)=>dL(f,r,{starter:1}),0],['B','B. Huber + EB (no growth/age)',(f,r)=>dL(f,r,{noGM:1}),0],['C','C. Joint Ridge2 (marginal w)',(f,r)=>dL(f,r,{joint:1}),0],['D','D. Hybrid Base x Growth x Age [Selected]',(f,r)=>dL(f,r,{}),1]];const[tr,te,cut]=datedSplit(cs),tF=fitModel(tr,null,ms);
const ld=sp.map(([id,label,fn,k])=>{const loo=cs.map((c,i)=>abs(c.y_log-fn(fitModel(cs.filter((_,j)=>j!==i),null,ms),c)));const t=te.map(r=>abs(r.y_log-fn(tF,r)));return {id,label,selected:!!k,n_loo:n,n_cs_train:cut,n_cs_test:te.length,loo_med_mult:pe(mdF(loo)),loo_rmse:fx(sqrt(mn(loo.map(e=>e*e))),3),loo_p90_mult:pe(qn(loo,0.9)),cs_med_mult:pe(mdF(t)),cs_rmse:fx(sqrt(mn(t.map(e=>e*e))),3),loo,cs:t}});
const fn=ld[4],s5=[],s8=[];let h5=0,h8=0;for(let i=0;i<n;i++){const u=fn.loo.filter((_,j)=>j!==i),q5=qn(u,0.5),q8=qn(u,0.8);s5.push(q5);s8.push(q8);if(fn.loo[i]<=q5)h5++;if(fn.loo[i]<=q8)h8++}
const q50=mdF(s5),q80=mdF(s8),ht=(a,q)=>fx((a.filter(e=>e<=q).length / max(1,a.length))*100,1);return {ladder:ld.map(({loo,cs:_,...r})=>r),q50_log:fx(q50,4),q80_log:fx(q80,4),hit_p25_p75_pct:fx((h5 / n)*100,1),hit_p10_p90_pct:fx((h8 / n)*100,1),cs_hit_p25_p75_pct:ht(fn.cs,q50),cs_hit_p10_p90_pct:ht(fn.cs,q80)}}
function computePeerIncidence(ps,ms){
const{pr,bk,bs}=peerStats(ps,ms),br=f=>fx(mn(pr.map(p=>(f(p)-(tk(p)?1:0))**2)),3);return {n_peers:pr.length,base_rate_pct:fx(bs*100,1),brier_model:br(p=>{const b=bk.get(peerKy(p,ms));return (b.tok+2*bs)/(b.tot+2)}),brier_base:br(()=>bs),forProtocol(p){const k=peerKy(p,ms),b=bk.get(k)||{tok:0,tot:0};return {rate_pct:round(((b.tok+2*bs)/(b.tot+2))*100),peers_tok:b.tok,peers_tot:b.tot,bucket:k}}}}
function calcEconomics(o){
const c=+o.capital_usd,g=+o.gas_4w_usd,b=+o.bridge_exit_usd,s=+(o.slippage_bps||0);
const d=+o.lockup_days,h=+o.hours,a=o.yield_bearing?0:+(o.opp_apr??0.04);
const m=+(o.drag_limit??0.05),w=+(o.drop_share??0.07),t=max(1,+(o.tvl_usd||1));
const v=+(o.implied_usd||0),vL=+(o.p25_usd??v),vH=+(o.p75_usd??v),hr=+(o.hurdle_hr??10);if(![c,g,b,s,d,h,a,hr].every(Z)||c<=0||g<0||b<0||d<0||h<=0||hr<0)return {valid:false};
const ps=min(0.02,c / t),sl=fx(c*s*2e-4),op=fx(c*a*(d / 365)),fe=fx(g+b+sl),tc=fx(fe+op);
const dp=fx((fe / c)*100),td=fx((tc / c)*100),bh=fx(tc / h);
const orgApr=+(o.organic_apr??0),orgUsd=fx(c*orgApr*(d / 365));
const gr=x=>fx(max(0,x)*w*ps);
const hg=gr(v),hn=fx(hg-tc+orgUsd),hh=fx(hn / h);
const lg=gr(vL),ln=fx(lg-tc+orgUsd),lh=fx(ln / h);
const ug=gr(vH),un=fx(ug-tc+orgUsd),uh=fx(un / h);
const dn=v*ps,be=dn>0?fx(max(0,tc-orgUsd)/ dn*100,2):null,hd=dn>0?fx(max(0,tc-orgUsd+hr*h)/ dn*100,2):null;
let cl='SKIP (LOSS)',rc='NEGATIVE';if(o.non_farm_flag&&/NO NATIVE TOKEN|LIVE ECOSYSTEM|LIVE STABLECOIN|NOT A FARM/i.test(o.non_farm_flag)){cl='NO FARM';rc='EXECUTION-GATED'}else if(o.non_farm_flag){cl='RESEARCH';rc='EXECUTION-GATED'}else if(dp>m*100||c<(o.min_viable_usd||0))rc='EXECUTION-GATED';else {if(hn>0)cl=hh>=hr?'VIABLE':'MARGINAL';rc=lh>=hr&&hh>=hr&&uh>=hr?'ALL-SCENARIO ROBUST':hh>=hr?'CENTRAL-ONLY':uh>=hr||hn>0?'OPTIMISTIC-ONLY':'NEGATIVE'}return {valid:true,cap:c,poolShare:ps,fees:fe,cashCost:fe,slip:sl,opp:op,organicUsd:orgUsd,totalCost:tc,zeroRewardCost:fx(-tc+orgUsd),dragPct:dp,totalDragPct:td,breakEvenReward:tc,breakEvenPerHr:bh,beDropPct:be,hurdleDropPct:hd,hurdleHr:hr,lowGross:lg,lowNet:ln,lowPerHr:lh,hypGross:hg,hypNet:hn,hypPerHr:hh,highGross:ug,highNet:un,highPerHr:uh,classification:cl,robustClass:rc}}
function exclReason(p){
const c=ct(p)||'Unknown';return XC.has(c)?(c==='CEX'?'CEX':`Excl (${c})`):VR.test(p.name||'')?'Versioned (V2/V3)':WR.test(p.name||'')?'Wrapped/staked':XR.test(p.name||'')?'Exchange prefix':p.slug in TS?'Tokenized sibling':'Excluded'}
function buildFullBoard(snap,specs){
const ms=Date.parse(`${snap.as_of}T00:00:00Z`),wl=new Set(snap.watchlist||[]),famT=new Map();for(const p of snap.protocols){const f=SF.get(p.slug);if(f!==undefined)famT.set(f,(famT.get(f)||0)+(p.tvl_usd||0))}
const fam=p=>(SF.has(p.slug)?famT.get(SF.get(p.slug)):p.tvl_usd);
const comps=snap.protocols.filter(ic).map(p=>({slug:p.slug,name:p.name,category:ct(p)||'Unknown',sc:scF(ct(p)),tvl_raw:p.tvl_usd,tvl_family:SF.has(p.slug)?fam(p):max(1,p.tvl_usd),mcap_usd:p.mcap_usd,y_log:L0(p.mcap_usd),listed_at:p.listed_at,change_7d:p.change_7d}));
const fit=fitModel(comps,null,ms),oos=computeOosLadder(comps,ms),pi=computePeerIncidence(snap.protocols,ms);
const au={wl:0,clean_pre:0,comp_u2:0,tok_cex_other:0,excluded_cat:0,excluded_sib:0,live_mcap:0,recorded_no_mcap:0};
const cand=[],liveRows=[],exclRows=[],bnd=l=>max(1,round(E0(l)));for(const p of snap.protocols){const{slug,name,chains,mcap_usd:mc,tvl_usd:tv,change_7d:c7,listed_at:la}=p,c=ct(p)||'Unknown',ad=ageOf(la,ms),nm=name||'';if(wl.has(slug)){au.wl++;cand.push(p)}else if(tk(p)){if(ic(p))au.comp_u2++;else au.tok_cex_other++;
const hasM=mc!==null&&mc>0;if(hasM)au.live_mcap++;else au.recorded_no_mcap++;liveRows.push({slug,name,category:c,chains,symbol:p.symbol,gecko_id:p.gecko_id,tvl_usd:tv,mcap_usd:mc,change_7d:c7,age_days:ad,token_status:hasM?'live_mcap':'recorded_no_mcap',is_comp:ic(p)})}else if(XC.has(c)||VR.test(nm)||WR.test(nm)||XR.test(nm)||slug in TS){const sb=slug in TS;if(sb)au.excluded_sib++;else au.excluded_cat++;exclRows.push({slug,name,category:c,chains,tvl_usd:tv,change_7d:c7,age_days:ad,reason:exclReason(p),is_sibling:sb})}else{au.clean_pre++;cand.push(p)}}liveRows.sort((a,b)=>(b.mcap_usd??-1)-(a.mcap_usd??-1)||b.tvl_usd-a.tvl_usd);exclRows.sort((a,b)=>b.tvl_usd-a.tvl_usd);
const rows=cand.map(p=>{const tf=fam(p),d=decomposeLog(fit,{...p,tvl_family:tf},ms),tl=d.totalLog,c=ct(p)||'Unknown',ch=p.chains?.[0]||'Ethereum';const{farmSteps,...fm}=specs?.[p.slug]?.precomputed_farm||{routed_chain:ch,gas_4w_usd:0.6,bridge_exit_usd:1.5,slippage_bps:10,lockup_days:30,hours:1.5,steps:[{cost_usd:2.1,time_min:90}],farmSteps:[c]};return {rank:0,slug:p.slug,name:p.name,category:c,sc:d.sc,chains:p.chains,tvl_usd:p.tvl_usd,tvl_family:tf,change_7d:p.change_7d,listed_at:p.listed_at,age_days:d.ageDays,age_missing:d.ageMissing,age_used_days:d.ageUsed,growth_pct:fx(d.gClamp,2),growth_missing:d.gMissing,growth_multiplier:fx(d.gMult,4),maturity_multiplier:fx(d.mMult,4),base_value_usd:bnd(d.baseLog),is_watchlist:wl.has(p.slug),n_cat_comps:fit.catCount[ct(p)]||0,n_sup_comps:fit.supCount[d.sc]||0,implied_value_usd:bnd(tl),p25_usd:bnd(tl-oos.q50_log),p75_usd:bnd(tl+oos.q50_log),p10_usd:bnd(tl-oos.q80_log),p90_usd:bnd(tl+oos.q80_log),log_decomp:{global:+E0(d.globalLog).toFixed(0),sup_mult:fx(E0(d.supAdj),3),cat_mult:fx(E0(d.catAdj),3),base_usd:bnd(d.baseLog),growth_mult:fx(d.gMult,4),maturity_mult:fx(d.mMult,4)},peer_incidence:pi.forProtocol(p),wl_conflict:WC[p.slug]||null,farm:fm,farm_steps:farmSteps}}).sort((a,b)=>b.implied_value_usd-a.implied_value_usd||(a.slug<b.slug?-1:1));rows.forEach((r,i)=>{r.rank=i+1});au.total=au.wl+au.clean_pre+au.live_mcap+au.recorded_no_mcap+au.excluded_cat+au.excluded_sib;au.watchlist_total=wl.size;au.ranked_total=rows.length;au.live_total=liveRows.length;au.excluded_total=exclRows.length;
return {schema:'makefun-board/v1',as_of:snap.as_of,source:snap.source,floor_usd:snap.floor_usd,model:MD,fit:{b0:fx(fit.b0,5),b1:fx(fit.b1,5),jG:fx(fit.jG,4),jM:fx(fit.jM,4),supEff:fit.supEff,catEff:fit.catEff,catCount:fit.catCount,supCount:fit.supCount},oos,peer_incidence:{n_peers:pi.n_peers,base_rate_pct:pi.base_rate_pct,brier_model:pi.brier_model,brier_base:pi.brier_base},audit_summary:au,comps,rows,live_rows:liveRows,excluded_rows:exclRows}}
function computeStrictAudit(comps,ps,ms){
const[tr,te]=datedSplit(comps),fT=fitModel(tr,null,ms);
const trAbs=tr.map((c,i)=>abs(c.y_log-decomposeLog(fitModel(tr.filter((_,j)=>j!==i),null,ms),c,ms,{}).totalLog));
const q50T=qn(trAbs,0.5),q80T=qn(trAbs,0.8),teErr=te.map(r=>abs(r.y_log-decomposeLog(fT,r,ms,{}).totalLog)),cov=q=>fx((teErr.filter(e=>e<=q).length / max(1,teErr.length))*100,1);const{pr,bk,tot}=peerStats(ps,ms),bLoo=fx(mn(pr.map(p=>{const br=(tot-(tk(p)?1:0))/ max(1,pr.length-1),b=bk.get(peerKy(p,ms)),pred=(b.tok-(tk(p)?1:0)+2*br)/(b.tot-1+2);return (pred-(tk(p)?1:0))**2})),3);
const bBaseLoo=fx(mn(pr.map(p=>((tot-(tk(p)?1:0))/ max(1,pr.length-1)-(tk(p)?1:0))**2)),3);return {strict_q50_log:fx(q50T,4),strict_q80_log:fx(q80T,4),strict_cs_50_pct:cov(q50T),strict_cs_80_pct:cov(q80T),brier_loo:bLoo,brier_base_loo:bBaseLoo}}return {MODEL:MD,EXCLUDED_CATS:XC,VER_RE:VR,WRAP_RE:WR,EXCH_RE:XR,TOK_SIBLINGS:TS,WL_CONFLICTS:WC,S2F:SF,superCat:scF,mean:mn,median:mdF,quantile:qn,ageOf,fitModel,decomposeLog,computeOosLadder,computePeerIncidence,calcEconomics,buildFullBoard,computeStrictAudit}});
