(function(rt,fn){const r=fn();if(typeof module==='object'&&module.exports)module.exports=r;rt.OMEGA=r})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const {exp,log,sqrt,abs,max,min,round,ceil,floor}=Math,Z=Number.isFinite,cl=(a,b,v)=>max(a,min(b,v)),L=v=>log(max(1,v)),fx=(v,d=2)=>Z(v)?+v.toFixed(d):0,lc=s=>String(s||'').toLowerCase(),S=(s,d=',')=>new Set(s.split(d));
const MD={name:'G4-Conf Huber+EB(16,64)+Chain x Bounded GxM',k_sup:16,k_cat:64,gw:.15,g0:.9,g1:1.15,mf:.95,mr:.1,md:1095,ua:365};
const XC=S('CEX,Chain,Bridge,Canonical Bridge,Cross Chain Bridge,Liquid Staking,Liquid Restaking,Restaked BTC,Stablecoin Wrapper,Anchor BTC,Decentralized BTC');
const VR=/\s(V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/,WR=/\b(wrapped|staked|staking)\b/i,XR=/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini|Crypto\.com)\b/i;
const GEN=S('the yield liquid stake staking chain bridge swap dex finance protocol money cash coin token dao labs core base open omni meta super ultra smart multi cross zero one bit crypto defi auto blue red black white gold silver project flying prime stable global digital capital market markets network networks vault vaults',' ');
const SC=[[/dex|deriv|perp|prediction|options|synth/i,'TRADING'],[/lending|cdp|uncollater/i,'CREDIT'],[/liquid staking|restaking|staking pool|collateral|anchor/i,'STAKING'],[/bridge/i,'BRIDGE'],[/rwa|cedefi/i,'RWA'],[/yield|allocator|curator|basis|farm|liquidity manager/i,'YIELD_CURATOR']];
const scF=c=>(SC.find(([r])=>r.test(c||''))||[0,'OTHER'])[1],sm=(a,f)=>a.reduce((s,x,i)=>s+(f?f(x,i):x),0),mn=(a,f)=>a.length?sm(a,f)/a.length:0,srt=a=>[...a].sort((x,y)=>x-y);
const qn=(a,q)=>a.length?((s,p,l,h)=>l===h?s[l]:s[l]+(s[h]-s[l])*(p-l))(srt(a),(a.length-1)*q,floor((a.length-1)*q),ceil((a.length-1)*q)):0;
const mdF=a=>qn(a,.5),tk=p=>p.mcap_usd!=null||p.gecko_id!=null||p.symbol!=null,ic=p=>p.mcap_usd>0&&!XC.has(p.category||''),lg=p=>log(cl(.02,.98,p)/(1-cl(.02,.98,p))),q0=s=>lc(s).replace(/\./g,'');
const ageOf=(at,ms)=>{const t=at?Date.parse(at.includes('T')?at:at+'T00:00:00Z'):NaN;return Z(t)?max(0,floor((ms-t)/864e5)):null};
function fams(ps){
const cw=new Set();for(const p of ps)for(const c of(p.chains||[]))for(const w of lc(c).replace(/[^a-z0-9]+/g,' ').split(' '))w.length>=3&&cw.add(w);
const stm=sl=>{const s=q0(sl).split('-').filter(Boolean);return s.length>1&&(GEN.has(s[0])||s[0].length<3)?s[0]+'-'+s[1]:s[0]||sl};
const ctx=(a,b)=>a.category===b.category||(a.chains||[]).some(c=>(b.chains||[]).includes(c)||lc(c).includes(stm(b.slug)))||(b.chains||[]).some(c=>lc(c).includes(stm(a.slug)));
const P={},t={},g={},y={},r={},o={},ap=(m,k,v)=>(m[k]??=[]).push(v),fd=x=>P[x]===x?x:(P[x]=fd(P[x])),un=(a,b)=>{a=fd(a);b=fd(b);a!==b&&(P[b]=a)},u1=(a,f)=>new Set(a.map(f).filter(Boolean)).size<2;
for(const p of ps){P[p.slug]=p.slug;ap(t,stm(p.slug),p);p.gecko_id&&ap(g,p.gecko_id,p);p.symbol&&ap(y,p.symbol.toUpperCase(),p)}
for(const k in t){const a=t[k],cO=cw.has(k)&&!a.some(tk);a.length>1&&!cO&&u1(a,x=>x.symbol?.toUpperCase())&&u1(a,x=>x.gecko_id)&&a.every((x,i)=>!i||ctx(a[0],x))&&a.slice(1).forEach(x=>un(a[0].slug,x.slug))}
for(const k in g)g[k].slice(1).forEach(x=>un(g[k][0].slug,x.slug));
for(const k in y)for(let i=0,a=y[k];i<a.length;i++)for(let j=i+1;j<a.length;j++){const u=a[i],v=a[j],ug=u.gecko_id,vg=v.gecko_id;!(ug&&vg&&ug!==vg)&&(q0(ug)===stm(v.slug)||q0(vg)===stm(u.slug))&&un(u.slug,v.slug)}
for(const p of ps)ap(r,fd(p.slug),p);
for(const k in r){const ms=r[k],rc=ms.filter(tk),v={root:k,tvl:sm(ms,x=>x.tvl_usd||0),hasRec:rc.length>0,rec:rc,ms};for(const m of ms)o[m.slug]=v}
return o;
}
function fitH(x,y,p1=1e-4){let b0=0,b1=p1>1?0:.5,w=x.map(()=>1),it=40;while(it--){let s0=1e-6,s1=0,s2=p1+1e-6,t0=0,t1=0;x.forEach((v,i)=>{const q=w[i];s0+=q;s1+=q*v;s2+=q*v*v;t0+=q*y[i];t1+=q*v*y[i]});const d=s0*s2-s1*s1||1e-12,n0=(t0*s2-t1*s1)/d,n1=(s0*t1-s1*t0)/d;if(abs(n0-b0)+abs(n1-b1)<1e-6){b0=n0;b1=n1;break}b0=n0;b1=n1;const rs=y.map((v,i)=>abs(v-b0-b1*x[i])),md=mdF(rs)/.6745||1;w=rs.map(r=>r/md<=1.345?1:1.345/(r/md))}return[b0,b1]}
function fitModel(cs,o={}){
const kS=o.kSup??MD.k_sup,kC=o.kCat??MD.k_cat,noC=!!o.noChain,x=cs.map(c=>L(c.tvl_family)),y=cs.map(c=>L(c.mcap_usd)),[b0,b1]=fitH(x,y,1e-4),sR={},cR={},supEff={},catEff={},supCount={},catCount={};
cs.forEach((c,i)=>{const e=y[i]-b0-b1*x[i],s=scF(c.category);(sR[s]??=[]).push(e);(cR[c.category]??=[]).push(e)});
for(const k in sR){supCount[k]=sR[k].length;supEff[k]=sR[k].length/(sR[k].length+kS)*mdF(sR[k])}
for(const k in cR){catCount[k]=cR[k].length;const p=supEff[scF(k)]??0,a=cR[k];catEff[k]=a.length>=2?p+a.length/(a.length+kC)*(mdF(a)-p):p}
const cb=!noC&&cs.length>=12?fitH(cs.map(c=>log(max(1,c.n_chains||1))),cs.map((c,i)=>cl(-2.5,2.5,y[i]-b0-b1*x[i]-(catEff[c.category]??supEff[scF(c.category)]??0))),4):[0,0],mx=mn(x);
return{b0,b1,c0:cb[0],cC:cb[1],noChain:noC,flatMed:mdF(y),supEff,catEff,supCount,catCount,mx,n:cs.length,sxx:max(1e-6,sm(x,v=>(v-mx)**2)),q50:.72,q80:1.48};
}
const levOf=(f,t)=>cl(.005,.25,1/max(2,f.n)+(L(t)-f.mx)**2/f.sxx);
function decomposeLog(f,p,ms,fl={}){
const c=p.category||'Unknown',sc=scF(c),tv=max(1,p.tvl_family||p.tvl_usd||1),eb=fl.useEb!==false,gL=f.b0+f.b1*L(tv),sA=eb?f.supEff[sc]??0:0,cA=(eb?(c in f.catEff?f.catEff[c]:sA):0)-sA,chL=fl.noChain||f.noChain?0:f.c0+f.cC*log(max(1,p.n_chains||1)),bL=gL+sA+cA+chL;
const g0=p.change_7d==null||!Z(p.change_7d),gR=g0?0:p.change_7d,gC=fl.starter?cl(-60,120,gR):cl(-50,100,gR),aD=p.age_days!==undefined?p.age_days:ageOf(p.listed_at,ms),aM=aD==null,aU=min(MD.md,aD??MD.ua);
let gM=1,mM=1,tot=bL;
if(fl.starter){gM=1+.5*gC/100;mM=.6+.4*(aU/MD.md);tot=L((p.tvl_usd||tv)*.25*gM*mM);return{tvl:tv,sc,baseLog:tot,globalLog:tot,supAdj:0,catAdj:0,chAdj:0,gClamp:gC,gMissing:g0,gMult:gM,ageDays:aD,ageMissing:aM,ageUsed:aU,mMult:mM,totalLog:tot}}
if(!fl.noGM){gM=cl(MD.g0,MD.g1,1+MD.gw*gC/100);mM=MD.mf+MD.mr*(aU/MD.md);tot=bL+log(gM)+log(mM)}
return{tvl:tv,sc,baseLog:bL,globalLog:gL,supAdj:sA,catAdj:cA,chAdj:chL,gClamp:gC,gMissing:g0,gMult:gM,ageDays:aD,ageMissing:aM,ageUsed:aU,mMult:mM,totalLog:tot};
}
const confQ=(a,q)=>a.length?srt(a)[min(a.length-1,max(0,ceil((a.length+1)*q)-1))]:0;
function fitConf(tr,ms,sp={}){
const full=fitModel(tr,sp),res=[],gm={};for(const r of tr)(gm[r.fam_group]??=[]).push(r);
for(const g in gm){const trM=tr.filter(x=>x.fam_group!==g);if(trM.length<10)continue;const fM=fitModel(trM,sp);for(const r of gm[g]){const yp=decomposeLog(fM,r,ms,sp).totalLog;res.push({g,r,yp,s:abs(L(r.mcap_usd)-yp)/sqrt(max(.25,1-(sp.stud?levOf(fM,r.tvl_family):0)))})}}
full.q50=confQ(res.map(x=>x.s),.5);full.q80=confQ(res.map(x=>x.s),.8);return{full,res};
}
function fitLogitClean(tr){
const bs=mn(tr,p=>p.has_tok),bL=lg(bs),sM={},cM={};for(const p of tr){(sM[p.sc]??=[0,0])[0]+=p.has_tok;sM[p.sc][1]++;(cM[p.category]??=[0,0])[0]+=p.has_tok;cM[p.category][1]++}
const xv=p=>{const s=sM[p.sc]||[0,0],c=cM[p.category]||[0,0];return[1,log((p.age_days??365)+1)-log(366),lg((c[0]+16*((s[0]+8*bs)/(s[1]+8)))/(c[1]+16))-bL,(L(p.tvl_usd)-log(2e7))/2,cl(-.5,1,(p.change_7d||0)/100)]};
const X=tr.map(xv),n=X.length,B=[lg(bs),0,0,0,0],eta=X.map(()=>B[0]);
for(let it=0;it<60;it++){let df=0;for(let j=0;j<5;j++){let q=j?2:0,g=-q*B[j],h=q+1e-6;for(let i=0;i<n;i++){const pr=1/(1+exp(-cl(-20,20,eta[i])));g+=X[i][j]*(tr[i].has_tok-pr);h+=pr*(1-pr)*X[i][j]*X[i][j]}const t=cl(-2,2,g/h);B[j]+=t;df+=abs(t);for(let i=0;i<n;i++)eta[i]+=X[i][j]*t}if(df<1e-6)break}
return{bs,predict:p=>1/(1+exp(-cl(-20,20,sm(xv(p),(v,j)=>v*B[j]))))};
}
function computePeerIncidence(peers){
const gs=srt([...new Set(peers.map(p=>p.fam_group))]),fd={};gs.forEach((g,i)=>fd[g]=i%10);
const full=fitLogitClean(peers),cv=[];for(let f=0;f<10;f++){const m=fitLogitClean(peers.filter(p=>fd[p.fam_group]!==f));for(const p of peers.filter(p=>fd[p.fam_group]===f))cv.push({p:m.predict(p),b:m.bs,y:p.has_tok})}
return{n_peers:peers.length,base_rate_pct:fx(full.bs*100,1),brier_model:fx(mn(cv,x=>(x.p-x.y)**2),3),brier_base:fx(mn(cv,x=>(x.b-x.y)**2),3),acc_cv:fx(mn(cv,x=>((x.p>=.5?1:0)===x.y?1:0))*100,1),forProtocol:p=>({rate_pct:round(full.predict(p)*100),peers_tok:peers.filter(q=>q.category===p.category&&q.has_tok).length,peers_tot:peers.filter(q=>q.category===p.category).length,bucket:p.sc})};
}
function calcEconomics(o){
const c=+o.capital_usd,g=+o.gas_4w_usd,b=+o.bridge_exit_usd,s=+(o.slippage_bps||0),d=+o.lockup_days,h=+o.hours,a=+(o.opp_apr??.04),m=+(o.drag_limit??.05),w=+(o.drop_share??.07),lp=cl(0,1,+(o.loss_pct??0)),rp=cl(0,1,+(o.realization_pct??1)),oA=+(o.organic_apr??0),t=max(1,+(o.tvl_pool||o.tvl_family||o.tvl_usd||1)),v=+(o.implied_usd||0),vL=+(o.p25_usd??v),vH=+(o.p75_usd??v),hr=+(o.hurdle_hr??10),xs=[c,g,b,s,d,h,a,hr,lp,rp,m,w,oA,t,v,vL,vH];
if(!xs.every(Z)||xs.some(x=>x<0)||c<=0||h<=0)return{valid:false,robustClass:'INSUFFICIENT',classLabel:'Insufficient evidence',gated:true};
const ps=min(.02,c/t),sl=fx(c*s*2e-4),op=fx(c*a*(d/365)),fe=fx(g+b+sl),tc=fx(fe+op),ls=fx(c*lp),dp=fx(fe/c*100),oU=fx(c*oA*(d/365)),gr=x=>fx(max(0,x)*w*ps),hg=gr(v),lg=gr(vL),ug=gr(vH),hnb=fx(fx(hg*rp)-tc+oU),hn=fx(hnb-ls),hh=fx(hn/h),ln=fx(fx(lg*rp)-tc+oU-ls),lh=fx(ln/h),un=fx(fx(ug*rp)-tc+oU-ls),uh=fx(un/h),dn=v*ps*rp,be=dn>0?fx(max(0,tc+ls-oU)/dn*100,2):null,bl=hnb>0?fx(hnb/c*100,3):0,br=hg>0?fx(max(0,(tc+ls-oU)/hg)*100,1):null;
const f0=o.non_farm_flag,rc=f0||(dp>m*100||c<(o.min_viable_usd||0))?'EXECUTION-GATED':lh>=hr&&hh>=hr&&uh>=hr?'ALL-SCENARIO ROBUST':hh>=hr?'CENTRAL-ONLY':uh>=hr||hn>0?'OPTIMISTIC-ONLY':'NEGATIVE';
const cl0=rc==='EXECUTION-GATED'?(f0&&/VERIFY|CHECK/i.test(f0)?'Research required':'Execution-gated'):rc==='ALL-SCENARIO ROBUST'?'Lower-band qualified':rc==='CENTRAL-ONLY'?'Scenario-qualified':rc==='OPTIMISTIC-ONLY'?'Optimistic-only':'Negative scenario';
return{valid:true,cap:c,poolShare:ps,fees:fe,cashCost:fe,slip:sl,opp:op,lossUsd:ls,lossPct:lp,realPct:rp,organicUsd:oU,totalCost:tc,zeroRewardCost:fx(oU-tc-ls),dragPct:dp,beDropPct:be,beLossPct:bl,beRealPct:br,lowNet:ln,lowPerHr:lh,hypGross:hg,hypNetBeforeLoss:hnb,hypNet:hn,hypPerHr:hh,highNet:un,highPerHr:uh,classLabel:cl0,robustClass:rc,gated:rc==='EXECUTION-GATED'};
}
const planSizeOf=(t,m)=>max(m||100,min(25e3,round(2e-4*max(0,t||0)/100)*100));
function buildFullBoard(snap,specs){
const ms=Date.parse(`${snap.as_of}T00:00:00Z`),wl=new Set(snap.watchlist||[]),raw=snap.protocols||[],fM=fams(raw),au={wl:0,clean_pre:0,comp_u2:0,tok_cex_other:0,excluded_cat:0,excluded_sib:0,live_mcap:0,recorded_no_mcap:0},cand=[],comps=[],peers=[],liveRows=[],exclRows=[];
for(const p of raw){
const c=p.category||'Unknown',nm=p.name||'',ch=p.chains||[],fm=fM[p.slug],w=wl.has(p.slug),ad=ageOf(p.listed_at,ms),t=tk(p),x=XC.has(c),b=VR.test(nm)||WR.test(nm)||XR.test(nm),ok=!x&&!b,sb=!t&&fm.hasRec,candC=fm.ms.filter(q=>wl.has(q.slug)||(!tk(q)&&!XC.has(q.category||'')&&!VR.test(q.name||'')&&!WR.test(q.name||'')&&!XR.test(q.name||'')&&!fm.hasRec)).length;
const tvFam=(ic(p)||candC<=1)?max(1,fm.tvl):max(1,p.tvl_usd||0),r={...p,name:nm,category:c,sc:scF(c),chains:ch,n_chains:max(1,ch.length),tvl_usd:p.tvl_usd||0,tvl_family:tvFam,age_days:ad,has_tok:+t,is_watchlist:w,fam_group:fm.root,wl_conflict:w&&fm.hasRec?`Sibling ${fm.rec[0].slug} records ${fm.rec[0].symbol||fm.rec[0].gecko_id}`:null};
ic(p)&&comps.push(r);ok&&(t||!sb)&&peers.push(r);
if(w){au.wl++;cand.push(r)}else if(t){ic(p)?au.comp_u2++:au.tok_cex_other++;p.mcap_usd>0?au.live_mcap++:au.recorded_no_mcap++;liveRows.push({slug:p.slug,name:nm,category:c,chains:ch,symbol:p.symbol,gecko_id:p.gecko_id,tvl_usd:p.tvl_usd,mcap_usd:p.mcap_usd,change_7d:p.change_7d,age_days:ad,is_comp:ic(p)})}else if(!ok||sb){sb?au.excluded_sib++:au.excluded_cat++;exclRows.push({slug:p.slug,name:nm,category:c,chains:ch,tvl_usd:p.tvl_usd,change_7d:p.change_7d,age_days:ad,reason:x?(c==='CEX'?'CEX':`Excl (${c})`):VR.test(nm)?'Versioned (V2/V3)':WR.test(nm)?'Wrapped/staked':XR.test(nm)?'Exchange prefix':`Sibling (${fm.rec[0].slug})`,is_sibling:sb})}else{au.clean_pre++;cand.push(r)}
}
liveRows.sort((a,b)=>(b.mcap_usd??-1)-(a.mcap_usd??-1)||b.tvl_usd-a.tvl_usd);exclRows.sort((a,b)=>b.tvl_usd-a.tvl_usd);
const{full:fit}=fitConf(comps,ms,{kSup:16,kCat:64,noChain:0,noGM:0,stud:1}),pi=computePeerIncidence(peers),defF={routed_chain:'Ethereum',gas_4w_usd:.6,bridge_exit_usd:1.5,slippage_bps:10,lockup_days:30,hours:1.5,steps:[{cost_usd:2.1,time_min:90}]};
const rows=cand.map(r=>{
const d=decomposeLog(fit,r,ms),m=sqrt(1+levOf(fit,r.tvl_family)),{farmSteps,...fm}=specs?.[r.slug]?.precomputed_farm||{...defF,routed_chain:r.chains[0]||'Ethereum',farmSteps:[r.category,r.name,'Check pool depth & terms']},bnd=z=>max(1,round(exp(d.totalLog+z))),imp=bnd(0),p25=bnd(-fit.q50*m),p75=max(p25,bnd(fit.q50*m)),pl=planSizeOf(r.tvl_usd,fm.min_viable_usd||100);
return{...r,rank:0,age_missing:d.ageMissing,age_used_days:d.ageUsed,growth_pct:fx(d.gClamp,2),growth_missing:d.gMissing,growth_multiplier:fx(d.gMult,4),maturity_multiplier:fx(d.mMult,4),base_value_usd:max(1,round(exp(d.baseLog))),n_cat_comps:fit.catCount[r.category]||0,implied_value_usd:imp,p25_usd:p25,p75_usd:p75,p10_usd:bnd(-fit.q80*m),p90_usd:max(p75,bnd(fit.q80*m)),plan_size_usd:pl,log_decomp:{global:+exp(d.globalLog).toFixed(0),sup_mult:fx(exp(d.supAdj),3),cat_mult:fx(exp(d.catAdj),3),chain_mult:fx(exp(d.chAdj),3)},peer_incidence:pi.forProtocol(r),farm:{...fm,tvl_pool:max(r.tvl_usd,r.tvl_family),plan_size_usd:pl},farm_steps:farmSteps};
}).sort((a,b)=>b.implied_value_usd-a.implied_value_usd||(a.slug<b.slug?-1:1));
rows.forEach((r,i)=>r.rank=i+1);au.total=au.wl+au.clean_pre+au.live_mcap+au.recorded_no_mcap+au.excluded_cat+au.excluded_sib;au.watchlist_total=wl.size;au.ranked_total=rows.length;au.live_total=liveRows.length;au.excluded_total=exclRows.length;au.comps_total=comps.length;au.peers_total=peers.length;
return{schema:'makefun-board/v1',as_of:snap.as_of,source:snap.source,floor_usd:snap.floor_usd,model:MD,fit,oos:snap.oos||null,peer_incidence:pi,audit_summary:au,comps,peers,rows,live_rows:liveRows,excluded_rows:exclRows};
}
function computeStrictAudit(comps,peers,ms){
const dt=comps.filter(r=>r.listed_at).sort((a,b)=>Date.parse(a.listed_at)-Date.parse(b.listed_at)),cut=floor(dt.length*.7),tr=dt.slice(0,cut),trG=new Set(tr.map(x=>x.fam_group)),te=dt.slice(cut).filter(x=>!trG.has(x.fam_group)),fT=fitConf(tr,ms,{kSup:16,kCat:64,noChain:0,noGM:0,stud:1}).full,cov=q=>{let h=0;for(const r of te){const m=sqrt(1+levOf(fT,r.tvl_family));if(abs(L(r.mcap_usd)-decomposeLog(fT,r,ms).totalLog)<=q*m)h++}return fx(h/max(1,te.length)*100,1)};
const pi=computePeerIncidence(peers);return{strict_q50_log:fx(fT.q50,4),strict_q80_log:fx(fT.q80,4),strict_cs_50_pct:cov(fT.q50),strict_cs_80_pct:cov(fT.q80),brier_loo:pi.brier_model,brier_base_loo:pi.brier_base,acc_cv:pi.acc_cv};
}
return{MODEL:MD,EXCLUDED_CATS:XC,VER_RE:VR,WRAP_RE:WR,EXCH_RE:XR,superCat:scF,mean:mn,median:mdF,quantile:qn,ageOf,fitModel,decomposeLog,fitConf,levOf,computePeerIncidence,calcEconomics,planSizeOf,buildFullBoard,computeStrictAudit};
});