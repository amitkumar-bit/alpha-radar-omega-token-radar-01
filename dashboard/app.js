(() => {
const O = window.OMEGA, R = window.RADAR_DATA, M = O.buildFullBoard(R, R.wl_specs), rows = M.rows, D = document, el = (id) => D.getElementById(id);
const { log, exp, max, min, pow, round, abs } = Math;
const E = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => `&#${c.charCodeAt(0)};`);
const fx = (n, d = 2) => Number(n).toFixed(d);
const pct = (n) => (n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${fx(n, 1)}%`);
const usd = (n, d) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${fx(a / 1e9, d ?? 2)}B`;
  if (a >= 1e6) return `${s}$${fx(a / 1e6, d ?? (a >= 1e7 ? 1 : 2))}M`;
  if (a >= 1e3) return `${s}$${fx(a / 1e3, d ?? 1)}K`;
  return `${s}$${fx(a, a < 100 ? 2 : 0)}`;
};
const mj = (a, f) => a.map(f).join('');
const btn = (l, a = '', c = 'btn') => `<button type=button class='${c}' ${a}>${l}</button>`;
const bt = (on, a, l) => btn(l, a, `sbn${on ? ' on' : ''}`);
const pt = (x, y, rad, f, tip, ex = '') => `<circle class=pt-dot cx=${x} cy=${y} r=${rad} fill=${f} data-tip='${E(tip)}'${ex} />`;
const tg = (c, t) => `<span class='tag ${c}'>${t}</span>`;
const op = (cur, v, t) => `<option value='${E(v)}'${cur === v ? ' selected' : ''}>${t}</option>`;
const ph = (t, s, r = '') => `<div class=ph><div><h1 class=h1>${t}</h1>${s ? `<div class=psub>${s}</div>` : ''}</div>${r}</div>`;
const stBox = (l, v, c = '') => `<div><div class=ml>${l}</div><div class='mv num ${c}'>${v}</div></div>`;
const dv = (c, b) => `<div class='${c}'>${b}</div>`, sp = (c, b) => `<span class='${c}'>${b}</span>`;
const crd = (t, s, b, a = '') => `<div class=cd><div class=ch><div><div class=ct>${t}</div><div class=cs>${s}</div></div>${a}</div>${b}</div>`;
const kpiCard = ([k, v, s, c]) => `<div class=k><div class=kl>${k}</div><div class='kv ${c}'>${v}</div><div class='ks ${c === 'warn' ? 'warn' : ''}'>${s}</div></div>`;
const rec = (k, v, c = '') => `<div class=rr><span>${k}</span><b class='num ${c}'>${v}</b></div>`;
const tbl = (hd, bdy, cls = 'cp') => `<table class='tbl ${cls}'><thead><tr>${mj(hd, ([l, c]) => `<th${c ? ` class='${c}'` : ''}>${l}</th>`)}</tr></thead><tbody>${bdy}</tbody></table>`;
const rowTr = (cells, cls = '') => `<tr${cls ? ` class='${cls}'` : ''}>${mj(cells, ([v, c]) => `<td${c ? ` class='${c}'` : ''}>${v}</td>`)}</tr>`;
const au = M.audit_summary, N = rows.length, wlN = rows.filter((r) => r.is_watchlist).length, dg = R.precomputed_rows_digest || [], finOos = M.oos.ladder[2];

const datasetRows = R.protocols.map((p) => {
  const c = p.category || 'Unknown';
  let part = 'clean_pre', partLabel = 'Clean Pre-Token', reason = 'Eligible pre-token';
  if (R.watchlist.includes(p.slug)) { part = 'wl'; partLabel = 'Watchlist'; reason = 'Mandatory watchlist'; }
  else if (p.mcap_usd > 0 && c !== 'CEX' && !O.EXCLUDED_CATS.has(c)) { part = 'comp_u2'; partLabel = 'Comp'; reason = 'Spot MCap comp'; }
  else if (p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null) { part = 'tok_cex_other'; partLabel = 'Tok / CEX'; reason = c === 'CEX' || O.EXCLUDED_CATS.has(c) ? `Excl (${c})` : 'Recorded token'; }
  else if (O.EXCLUDED_CATS.has(c) || O.VER_RE.test(p.name || '') || O.WRAP_RE.test(p.name || '') || O.EXCH_RE.test(p.name || '')) { part = 'excluded_cat'; partLabel = 'Excl Cat'; reason = O.EXCLUDED_CATS.has(c) ? c : 'Variant/wrap/exch'; }
  else if (p.slug in O.TOK_SIBLINGS) { part = 'excluded_sib'; partLabel = 'Sibling'; reason = 'Tokenized sibling'; }
  const rk = rows.find((r) => r.slug === p.slug);
  return { ...p, category: c, part, partLabel, reason, rank: rk ? rk.rank : null };
});

const S = {
  view: 'radar', slug: rows[0].slug, subset: 'all', cat: 'ALL', chain: 'ALL', q: '', dsPart: 'all', dsQ: '',
  sortBy: 'rank', sortDir: 1, budget: 1000, dropShare: 0.07, lockDays: 0, oppApr: 0.04, dragLimit: 0.05,
  farmFilter: 'viable', scale: 'log', resTab: 'ablation', page: 1, perPage: 12,
  cols: { chg7: true, age: true, peer: true, range: true }, compare: [],
};

function calcRow(r, capO, dropO) {
  const res = O.calcEconomics({ ...r.farm, capital_usd: capO ?? S.budget, lockup_days: S.lockDays > 0 ? S.lockDays : r.farm.lockup_days, opp_apr: S.oppApr, drag_limit: S.dragLimit, drop_share: dropO ?? S.dropShare, tvl_usd: r.tvl_usd, implied_usd: r.implied_value_usd });
  if (!res.valid) return { ...res, beDropPct: null };
  const ps = min(0.02, res.cap / max(1, r.tvl_usd));
  return { ...res, beDropPct: r.implied_value_usd > 0 && ps > 0 ? (res.breakEvenReward / (r.implied_value_usd * ps)) * 100 : null };
}

function condLabel(code, d) {
  const dp = fx((d ?? S.dropShare) * 100, (d ?? S.dropShare) === 0.14 ? 0 : 1);
  return code === 'VIABLE' ? [`COND. +EV @ ${dp}%`, 'tp'] : code === 'MARGINAL' ? [`THIN @ ${dp}%`, 'tw'] : code === 'NO FARM' ? ['NO TOKEN FARM', 'tn'] : code === 'RESEARCH' ? ['RESEARCH / GATED', 'tw'] : ['SKIP (NET LOSS)', 'tm'];
}

function getFiltered(mode) {
  const q = S.q.trim().toLowerCase();
  const kf = { rank: (r) => r.rank, tvl: (r) => r.tvl_usd, chg7: (r) => r.change_7d ?? -999, age: (r) => r.age_days ?? -1, peer: (r) => r.peer_incidence.rate_pct, val: (r) => r.implied_value_usd, netHr: (r) => calcRow(r).hypPerHr ?? -9999 }[S.sortBy] || ((r) => r.rank);
  return rows.filter((r) => {
    if (mode === 'farming') {
      const g = calcRow(r);
      if (S.farmFilter === 'viable' && g.classification !== 'VIABLE') return false;
      if (S.farmFilter === 'marginal' && g.classification !== 'VIABLE' && g.classification !== 'MARGINAL') return false;
      if (S.farmFilter === 'nongated' && r.farm.non_farm_flag) return false;
    } else {
      if (S.subset === 'wl' && !r.is_watchlist) return false;
      if (S.subset === 'early' && r.tvl_usd >= R.floor_usd) return false;
      if (S.subset === 'clean' && (r.farm.non_farm_flag || r.wl_conflict)) return false;
      if (S.subset === 'viable' && calcRow(r).classification !== 'VIABLE') return false;
    }
    if (S.cat !== 'ALL' && r.category !== S.cat) return false;
    if (S.chain !== 'ALL' && r.farm.routed_chain !== S.chain && !r.chains.includes(S.chain)) return false;
    return !q || `${r.name} ${r.slug} ${r.category} ${r.sc} ${r.farm.routed_chain} ${r.chains.join(' ')}`.toLowerCase().includes(q);
  }).sort((a, b) => (kf(a) - kf(b)) * S.sortDir || a.rank - b.rank);
}

function syncSelection(list) { if (list.length > 0 && !list.some((r) => r.slug === S.slug)) S.slug = list[0].slug; }

function whiskerHTML(r) {
  const a = log(1e5), b = log(3e10), p = (v) => max(0, min(100, ((log(max(1e5, v)) - a) / (b - a)) * 100));
  const [p1, p2, pt, p7, p9] = [r.p10_usd, r.p25_usd, r.implied_value_usd, r.p75_usd, r.p90_usd].map(p);
  return `<div class="wh"><div class="wt"><span class="num fw6">${usd(r.implied_value_usd, 1)}</span><span class="t2 xs">${usd(r.p25_usd, 0)}–${usd(r.p75_usd, 0)}</span></div><div class="wb"><div class="w8" style="left:${fx(p1, 1)}%;width:${fx(max(1, p9 - p1), 1)}%"></div><div class="w5" style="left:${fx(p2, 1)}%;width:${fx(max(2, p7 - p2), 1)}%"></div><div class="p0" style="left:${fx(pt, 1)}%"></div></div></div>`;
}

function scatterSVG(hl,H=148){
const W=560,L=48,R_=14,T_=10,B_=22,isLog=S.scale==='log',x0=isLog?log(1e6):0,x1=isLog?log(2e10):5e9,y0=isLog?log(1e5):0,y1=isLog?log(1e10):1e9;
const xv=v=>isLog?log(max(1e6,v)):min(x1,max(0,v)),yv=v=>isLog?log(max(1e5,v)):min(y1,max(0,v)),sx=v=>fx(L+((max(x0,min(x1,v))-x0)/(x1-x0))*(W-L-R_),1),sy=v=>fx(H-B_-((max(y0,min(y1,v))-y0)/(y1-y0))*(H-T_-B_),1);
let g='',t='';
(isLog?[1e6,1e7,1e8,1e9,1e10]:[0,1e9,2e9,3e9,4e9,5e9]).forEach(v=>{const x=sx(xv(v));g+=`M${x},${T_}V${H-B_}`;t+=`<text x=${x} y=${H-7} text-anchor=middle>${v?usd(v,0):'$0'}</text>`;});
(isLog?[1e5,1e6,1e7,1e8,1e9,1e10]:[0,2e8,4e8,6e8,8e8,1e9]).forEach(v=>{const y=sy(yv(v));g+=`M${L},${y}H${W-R_}`;t+=`<text x=${L-5} y=${+y+3} text-anchor=end>${v?usd(v,0):'$0'}</text>`;});
let cv='';
if(isLog)cv=`<line x1=${sx(x0)} y1=${sy(M.fit.b0+M.fit.b1*x0)} x2=${sx(x1)} y2=${sy(M.fit.b0+M.fit.b1*x1)} stroke=#E5A93C stroke-width=1.5 stroke-dasharray='5 4' />`;
else{const ps=[];for(let i=0;i<=20;i++){const tx=max(1e6,(x1/20)*i),py=exp(M.fit.b0+M.fit.b1*log(tx));if(py<=y1)ps.push(`${sx(tx)},${sy(py)}`);}if(ps.length>1)cv=`<polyline points='${ps.join(' ')}' fill=none stroke=#E5A93C stroke-width=1.5 stroke-dasharray='5 4' />`;}
const cd=mj(M.comps,c=>{const m=hl&&c.category===hl.category;return pt(sx(xv(c.tvl_family)),sy(yv(c.mcap_usd)),m?3.8:2.3,m?'#759AF5':'#959BA6',`${c.name} (Comp)|${c.category}|TVL ${usd(c.tvl_family)} · MCap ${usd(c.mcap_usd)} (${fx(c.mcap_usd/max(1,c.tvl_family),2)}x)`,` opacity=${m?0.9:0.42}`);});
const bd=hl?'':mj(rows,r=>pt(sx(xv(r.tvl_family)),sy(yv(r.implied_value_usd)),2.3,'#759AF5',`#${r.rank} ${r.name}|${r.category} · ${r.farm.routed_chain}|TVL ${usd(r.tvl_usd)} · Proxy ${usd(r.implied_value_usd)}`,` opacity=0.52 data-slug='${E(r.slug)}'`));
const mk=hl?`<line x1=${sx(xv(hl.tvl_family))} y1=${sy(yv(hl.p75_usd))} x2=${sx(xv(hl.tvl_family))} y2=${sy(yv(hl.p25_usd))} stroke=#41B392 stroke-width=2.5 />`+pt(sx(xv(hl.tvl_family)),sy(yv(hl.implied_value_usd)),5,'#41B392',`#${hl.rank} ${hl.name}|Proxy ${usd(hl.implied_value_usd)}|P25–P75: ${usd(hl.p25_usd)}–${usd(hl.p75_usd)}`,' stroke=#0C0D10 stroke-width=1.5'):'';
return `<svg class=chart viewBox='0 0 ${W} ${H}'><path class=gl d='${g}' />${t}${bd}${cd}${cv}${mk}</svg>`;
}

function rangeSVG(r) {
  const W = 500, H = 52, L = 24, R_ = 24, a = log(max(1e5, r.p10_usd * 0.55)), b = log(max(r.p90_usd * 1.6, r.p10_usd * 4)), px = (v) => fx(L + ((log(max(1e5, v)) - a) / (b - a)) * (W - L - R_), 1);
  const [x10, x25, x50, x75, x90] = [r.p10_usd, r.p25_usd, r.implied_value_usd, r.p75_usd, r.p90_usd].map(px);
  const ln = (u, v, c, w) => `<line x1="${u}" y1="24" x2="${v}" y2="24" stroke="${c}" stroke-width="${w}" stroke-linecap="round" />`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${ln(L, W - R_, '#2B2E35', 4)}${ln(x10, x90, '#759AF561', 7)}${ln(x25, x75, '#759AF5', 10)}${pt(x10, 24, 3.5, '#959BA6', `P10|${usd(r.p10_usd)}|q80 ±${M.oos.q80_log}`)}${pt(x25, 24, 4, '#759AF5', `P25|${usd(r.p25_usd)}|q50 ±${M.oos.q50_log}`)}${pt(x50, 24, 5, '#41B392', `Proxy|${usd(r.implied_value_usd)}|If launched`, ' stroke="#0C0D10" stroke-width="1.5"')}${pt(x75, 24, 4, '#759AF5', `P75|${usd(r.p75_usd)}|q50 ±${M.oos.q50_log}`)}${pt(x90, 24, 3.5, '#959BA6', `P90|${usd(r.p90_usd)}|q80 ±${M.oos.q80_log}`)}<text x="${x10}" y="11" text-anchor="middle">P10 ${usd(r.p10_usd, 0)}</text><text x="${x25}" y="45" text-anchor="middle">P25 ${usd(r.p25_usd, 1)}</text><text x="${x50}" y="11" text-anchor="middle" style="fill:#41B392;font-weight:700">${usd(r.implied_value_usd)}</text><text x="${x75}" y="45" text-anchor="middle">P75 ${usd(r.p75_usd, 1)}</text><text x="${x90}" y="11" text-anchor="middle">P90 ${usd(r.p90_usd, 0)}</text></svg>`;
}

function controlsBar(mode) {
  const cats = ['ALL', ...new Set(rows.map((r) => r.category))].sort(), chns = ['ALL', ...new Set(rows.map((r) => r.farm.routed_chain))].sort();
  const subs = mode === 'farming' ? [['viable', 'Cond. +EV'], ['marginal', '+EV & Thin'], ['nongated', 'Unflagged'], ['all', `All (${N})`]] : [['all', `All (${N})`], ['wl', `WL (${wlN})`], ['early', '<$50M'], ['clean', 'Clean'], ['viable', 'Cond. +EV']];
  const subB = mj(subs, ([k, l]) => bt(mode === 'farming' ? S.farmFilter === k : S.subset === k, `data-${mode === 'farming' ? 'farmfilter' : 'subset'}="${k}"`, l));
  const sl = (id, b) => `<select id="${id}" class="sel">${b}</select>`;
  return `<div class="cb"><div class="cg"><div class="seg">${subB}</div><input id="qInput" class="inp iq" type="search" placeholder="Filter protocol, chain…" value="${E(S.q)}">${sl('catSel', mj(cats, (c) => op(S.cat, c, c === 'ALL' ? 'All Categories' : E(c))))}${sl('chainSel', mj(chns, (c) => op(S.chain, c, c === 'ALL' ? 'All Chains' : E(c))))}</div><div class="cg"><div class="seg">${mj([500, 1000, 5000, 25000], (b) => bt(S.budget === b, `data-budget="${b}"`, usd(b, 0)))}</div>${sl('dropSel', mj([0, 0.035, 0.07, 0.14], (v) => `<option value="${v}"${abs(S.dropShare - v) < 1e-4 ? ' selected' : ''}>${v ? `${fx(v * 100, v === 0.14 ? 0 : 1)}% Drop` : '0% (No Token)'}</option>`))}<div class="rel">${btn('Columns', 'id="btn-cols"', 'btn bsm')}<div id="col-pop" class="pop cpop" hidden>${mj([['chg7', '7D %'], ['age', 'Age'], ['peer', 'Peer Rate'], ['range', 'Range Bar']], ([k, l]) => `<label><input type="checkbox" data-col="${k}"${S.cols[k] ? ' checked' : ''}> ${l}</label>`)}</div></div></div></div>`;
}

function protocolTable(list) {
  if (!list.length) return `<div class="tc"><div class="em"><div class="fw6" style="font-size:15px;color:var(--t1)">No protocols match active filters</div><div>${S.dropShare === 0 ? '0% Drop yields 0 positive plays.' : 'Adjust filters or search.'}</div>${btn('Reset Filters', 'data-reset="1"', 'btn ba')}</div></div>`;
  const tp = max(1, Math.ceil(list.length / S.perPage)); if (S.page > tp) S.page = tp;
  const st = (S.page - 1) * S.perPage, sl = list.slice(st, st + S.perPage);
  const sh = (k, l, c = '') => `<th class="srt ${S.sortBy === k ? 'on' : ''} ${c}" data-sort="${k}">${l}${S.sortBy === k ? (S.sortDir === 1 ? ' ↑' : ' ↓') : ''}</th>`;
  const hdr = [sh('rank', '#', 'r'), '<th>Protocol · Route · Flags</th>', '<th>Category</th>', '<th>Chain</th>', sh('tvl', 'TVL', 'r'), S.cols.chg7 ? sh('chg7', '7D', 'r') : '', S.cols.age ? sh('age', 'Age', 'r') : '', S.cols.peer ? sh('peer', 'Peer', 'r') : '', S.cols.range ? sh('val', 'If Launches (P25–P75)', 'r') : sh('val', 'If Launches', 'r'), sh('netHr', `Cond. @ ${usd(S.budget, 0)}`, 'r'), '<th class="r">Pin</th>'].join('');
  const bdy = mj(sl, (r) => {
    const g = calcRow(r), [bTxt, bCls] = condLabel(g.classification), pin = S.compare.includes(r.slug), pi = r.peer_incidence, f = r.farm;
    const fl = (r.is_watchlist ? tg('tw', 'WL') + ' ' : '') + (f.non_farm_flag ? tg('tn', E(f.non_farm_flag)) + ' ' : '') + (r.wl_conflict ? tg('tw', 'SIB') : '');
    return rowTr([
      [r.rank, 'r num t2'],
      [`<div class="fw6">${E(r.name)} ${fl}</div><div class="t2 xs">Min ${usd(f.min_viable_usd, 0)} · ${f.hours}h (${f.steps.length} steps)</div>`],
      [tg('tm', E(r.category))], [E(f.routed_chain), 't2'], [usd(r.tvl_usd, 1), 'r num'],
      ...(S.cols.chg7 ? [[pct(r.change_7d), `r num ${(r.change_7d ?? 0) >= 0 ? 'pos' : 'neg'}`]] : []),
      ...(S.cols.age ? [[r.age_days != null ? `${r.age_days}d` : '—', 'r num t2']] : []),
      ...(S.cols.peer ? [[`<div><b>${pi.rate_pct}%</b> <span class="t2 xs">(${pi.peers_tok}/${pi.peers_tot})</span></div><div class="pb"><i style="width:${pi.rate_pct}%"></i></div>`, 'r num']] : []),
      [S.cols.range ? whiskerHTML(r) : `<span class="num fw6">${usd(r.implied_value_usd, 1)}</span>`, 'r'],
      [`<div>${tg(bCls, bTxt)} <b class="num ${g.hypNet > 0 ? 'pos' : 'neg'}">${usd(g.hypNet)}</b> <span class="num t2">(${usd(g.hypPerHr)}/h)</span></div><div class="t2 num xs">Drop ${usd(g.hypGross)} − Cost ${usd(g.totalCost)}${g.beDropPct != null ? ` · BE ${fx(g.beDropPct, 1)}%` : ''}</div>`, 'r nw'],
      [btn(pin ? '✓' : '+', `data-cmp="${E(r.slug)}"`, `btn bsm${pin ? ' ba' : ''}`), 'r'],
    ], `rc ${r.slug === S.slug ? 'rs' : ''}' data-slug='${E(r.slug)}`);
  });
  const pb = []; for (let i = 1; i <= min(tp, 6); i++) pb.push(bt(i === S.page, `data-page="${i}"`, i));
  if (tp > 6) pb.push(`<span class="t2" style="padding:0 4px">…</span>` + bt(S.page === tp, `data-page="${tp}"`, tp));
  return `<div class="tc"><div class="ts"><table class="tbl"><thead><tr>${hdr}</tr></thead><tbody>${bdy}</tbody></table></div><div class="tf"><span>Showing ${st + 1}–${min(st + S.perPage, list.length)} of ${list.length}</span><div class="cg"><div class="seg">${pb.join('')}</div><select id="perSel" class="sel">${mj([10, 12, 25, 50], (n) => op(S.perPage, n, `${n} rows`))}</select></div></div></div>`;
}

function renderRadar() {
  const list = getFiltered('radar'); syncSelection(list);
  const valSum = rows.reduce((s, r) => s + r.implied_value_usd, 0), p25Sum = rows.reduce((s, r) => s + r.p25_usd, 0), p75Sum = rows.reduce((s, r) => s + r.p75_usd, 0);
  const vN = rows.filter((r) => calcRow(r).classification === 'VIABLE').length, pi = M.peer_incidence, oo = M.oos, sel = rows.find((r) => r.slug === S.slug) || rows[0];
  const kpis = [['Ranked Pre-Token', N, `${wlN}/40 Watchlist · ${au.total} Audited`, ''], ['Conditional Proxy Σ', usd(valSum), `P25–P75 Σ: ${usd(p25Sum, 0)}–${usd(p75Sum)}`, ''], ['Held-Out OOS Miss', `${fx(finOos.loo_med_mult, 2)}x`, `LOO n=${finOos.n_loo} · CS n=${finOos.n_cs_test}: ${fx(finOos.cs_med_mult, 2)}x`, ''], ['Calibration (50/80%)', `${oo.hit_p25_p75_pct}% / ${oo.hit_p10_p90_pct}%`, `CS n=${finOos.n_cs_test}: ${oo.cs_hit_p25_p75_pct}%/${oo.cs_hit_p10_p90_pct}% (<80%)`, 'warn'], [`Cond. +EV @ ${usd(S.budget, 0)}`, vN, `${fx(S.dropShare * 100, 1)}% drop · 0/${N} pos @ 0%`, vN ? 'pos' : 'neg']];
  const uS = [['WL', au.wl, '#E5A93C'], ['Clean', au.clean_pre, '#759AF5'], ['Comps', au.comp_u2, '#41B392'], ['Tok/CEX', au.tok_cex_other, '#6B7280'], ['Excl', au.excluded_cat, '#4B5563'], ['Sib', au.excluded_sib, '#E27580']];
  const chk = [[dg.length === N && rows.every((r, i) => dg[i].slug === r.slug && dg[i].rank === r.rank && dg[i].implied_value_usd === r.implied_value_usd), `Parity ${N}/${N}`], [wlN === 40, `WL ${wlN}/40`], [au.total === R.protocols.length, `Sum ${au.total}/758`], [rows.every((r, i) => r.rank === i + 1 && (!i || r.implied_value_usd <= rows[i - 1].implied_value_usd)), 'Ranks'], [rows.every((r) => abs(r.farm.steps.reduce((s, y) => s + y.cost_usd, 0) - (r.farm.gas_4w_usd + r.farm.bridge_exit_usd)) < 0.05), 'Steps'], [Object.keys(O.TOK_SIBLINGS).every((s) => !rows.some((r) => r.slug === s)), 'Sib 0/6']];
  const right = S.resTab === 'ablation'
    ? tbl([['Ablation Stage'], ['LOO', 'r'], ['RMSE', 'r'], ['P90', 'r'], ['CS', 'r']], mj(oo.ladder, (st, i) => rowTr([[E(st.label), i === 2 ? 'fw6 ac' : ''], [`${fx(st.loo_med_mult, 2)}x`, 'r num'], [fx(st.loo_rmse, 3), 'r num'], [`${fx(st.loo_p90_mult, 2)}x`, 'r num'], [`${fx(st.cs_med_mult, 2)}x`, 'r num']], `${i === 2 ? 'ron' : ''} ${st.kept ? '' : 't2'}`))) + `<div class="t2 xs">Peer Incidence: <b class="num">${pi.base_rate_pct}%</b> (${pi.n_peers} peers · Brier ${pi.brier_model} vs ${pi.brier_base}) · Descriptive only</div>`
    : `<div class="ub">${mj(uS, ([, c, k]) => `<div style="width:${fx((c / au.total) * 100, 1)}%;background:${k}"></div>`)}</div><div class="ul">${mj(uS, ([l, c, k]) => `<span><i class="ud" style="background:${k}"></i>${l}: <b class="num">${c}</b></span>`)}</div><div class="cg">${mj(chk, ([ok, t]) => `<span class="${ok ? 'p-ok' : 'p-er'}">${t} ${ok ? '✓' : '✗'}</span>`)}</div>`;

  return ph('Token Radar', `Pre-token protocols ranked by conditional launch proxy · Snapshot ${R.as_of}`, btn(`Inspect #${sel.rank} ${E(sel.name)} →`, 'data-view="research"', 'btn bsm')) +
    `<section class="kg">${mj(kpis, kpiCard)}</section><section class="gr">${crd('TVL vs. Spot Market-Cap Fit', `Huber b₁=${fx(M.fit.b1, 3)} · ${M.comps.length} comps · ${N} board · hover points`, scatterSVG(null, 148), `<div class="seg">${bt(S.scale === 'log', 'data-scale="log"', 'Log')}${bt(S.scale === 'linear', 'data-scale="linear"', 'Linear')}</div>`)}${crd('Research &amp; Audit Summary', 'Held-out OOS ablation &amp; 758 accounting', right, `<div class="seg">${bt(S.resTab === 'ablation', 'data-restab="ablation"', 'OOS Ablation')}${bt(S.resTab === 'universe', 'data-restab="universe"', '758 Audit ✓')}</div>`)}</section>${controlsBar('radar')}${protocolTable(list)}`;
}

function renderResearch() {
  const r = rows.find((y) => y.slug === S.slug) || rows[0], g = calcRow(r), g0 = calcRow(r, S.budget, 0), [bTxt, bCls] = condLabel(g.classification), f = r.farm, d = r.log_decomp, pi = r.peer_incidence, tL = log(max(1, r.tvl_family));
  const ex = M.comps.filter((c) => c.category === r.category), sn = (a) => [...a].sort((u, v) => abs(log(u.tvl_family) - tL) - abs(log(v.tvl_family) - tL)), peers = (ex.length ? sn(ex) : sn(M.comps.filter((c) => c.sc === r.sc))).slice(0, 3);
  const sens = (m) => usd(round(r.implied_value_usd * pow(m, M.fit.b1))), caps = [500, 1000, 5000, 25000], drops = [0, 0.035, 0.07, 0.14], pin = S.compare.includes(r.slug);
  const fl = (r.is_watchlist ? tg('tw', 'WATCHLIST') : tg('tm', 'PRE-TOKEN')) + ' ' + tg(bCls, bTxt) + (f.non_farm_flag ? ' ' + tg('tn', E(f.non_farm_flag)) : '') + (r.wl_conflict ? ' ' + tg('tw', 'SIB') : '');

const s1 = (k, v, c = '') => `<div><div class="ml">${k}</div><div class="mv num ${c}">${v}</div></div>`;
  const cMath = rangeSVG(r) + tbl([['Component'], ['Output', 'r'], ['Basis']], rowTr([['Family TVL'], [usd(r.tvl_family), 'r num'], [r.tvl_family !== r.tvl_usd ? `Family (${usd(r.tvl_usd)})` : 'Single protocol', 't2']]) + rowTr([['1. Huber Curve'], [usd(d.global), 'r num'], [`exp(${fx(M.fit.b0, 3)}+${fx(M.fit.b1, 3)}·ln) · −50%:${sens(0.5)}/+100%:${sens(2)}`, 't2']]) + rowTr([[`2. Sector (${E(r.sc)})`], [`${d.sup_mult}×`, 'r num'], [`EB kSup=6 (${r.n_sup_comps})`, 't2']]) + rowTr([[`3. Cat (${E(r.category)})`], [`${d.cat_mult}×`, 'r num'], [r.n_cat_comps >= 2 ? `EB kCat=24 (${r.n_cat_comps})` : `Prior (${r.n_cat_comps}; 7d/Age off)`, 't2']]) + rowTr([['Conditional Proxy', 'fw6'], [usd(r.implied_value_usd), 'r num fw7 pos'], [`P25–75:${usd(r.p25_usd)}–${usd(r.p75_usd)} · P10–90:${usd(r.p10_usd)}–${usd(r.p90_usd)}`, 't2']], 'ron'));
  const cPeer = scatterSVG(r, 112) + tbl([['Match'], ['Peer'], ['TVL', 'r'], ['MCap', 'r'], ['Mult', 'r']], mj(peers, (c) => rowTr([[tg(c.category === r.category ? 'ta' : 'tm', c.category === r.category ? 'EXACT' : E(c.sc))], [E(c.name), 'fw6'], [usd(c.tvl_family), 'r num'], [usd(c.mcap_usd), 'r num'], [`${fx(c.mcap_usd / max(1, c.tvl_family), 2)}×`, 'r num']])));
  const cEcon = dv('g2" style="gap:8px', dv('eb', rec(`Gas (4w,T${f.gas_tier})`, usd(f.gas_4w_usd)) + rec('Bridge/Exit', usd(f.bridge_exit_usd)) + rec(`Slip (${f.slippage_bps}bps)`, usd(g.slip)) + rec(`Opp (${f.yield_bearing ? '0% YB' : `${fx(S.oppApr * 100, 0)}%`}·${S.lockDays || f.lockup_days}d)`, usd(g.opp)) + dv('rt', sp('', `Total Cost (${g.totalDragPct}%)`) + sp('num', usd(g.totalCost)))) + dv('eb', rec('Capital-at-Risk', usd(S.budget)) + rec('0% Token Reward Outcome', usd(g0.hypNet), 'neg') + rec('Break-Even Drop Share', g.beDropPct != null ? `${fx(g.beDropPct, 2)}%` : '—', 'ac') + rec(`Break-Even (${f.hours}h)`, `${usd(g.breakEvenPerHr)}/hr`) + dv('rt', sp('', `Net (${fx(S.dropShare * 100, 1)}%)`) + sp(`num ${g.hypNet > 0 ? 'pos' : 'neg'}`, `${usd(g.hypNet)} (${usd(g.hypPerHr)}/h)`)))) + tbl([['Drop \\ Cap'], ...caps.map((c) => [usd(c, 0), 'r'])], mj(drops, (ds) => rowTr([[ds ? `${fx(ds * 100, ds === 0.14 ? 0 : 1)}%` : '0% (No Token)', 'fw6'], ...caps.map((c) => { const cl = calcRow(r, c, ds), act = c === S.budget && abs(ds - S.dropShare) < 1e-4; return [usd(cl.hypNet), `r num ${cl.classification === 'VIABLE' ? 'pos' : cl.hypNet > 0 ? 'warn' : 'neg'}${act ? ' act fw7' : ''}`]; })])), 'cp mx');
  const cPlay = tbl([['Step'], ['Action'], ['Fee', 'r'], ['Time', 'r'], ['Gate']], mj(f.steps, (st) => rowTr([[tg('ta', E(st.label))], [`${E(st.action.slice(0, 62))}${st.action.length > 62 ? '…' : ''} <span class=t2>(${E(st.asset)})</span>`], [usd(st.cost_usd), 'r num'], [`${st.time_min}m`, 'r num'], [E(st.verify.slice(0, 32)), 't2']])) + `<tr class=ron><td colspan=2 class=fw6>Reconciled (Gas+Bridge)</td><td class='r num fw6'>${usd(f.gas_4w_usd + f.bridge_exit_usd)}</td><td class='r num fw6'>${f.hours}h</td><td class='pos fw6'>Exact ✓</td></tr>`) + dv('eb', `<div><b>Mechanics:</b> ${E(f.mechanism)} (${E(f.assets)})</div><div><b>Exit &amp; Risks:</b> ${E(f.exit_mechanics)} · ${E(f.key_risks)} · ${E(f.unknowns)}</div>`);
  return ph(`${btn('← Radar', 'data-view=radar', 'btn bsm bg')} #${r.rank} ${E(r.name)} ${fl}`, '', `<div class=cg><select id=detProto class=sel>${mj(rows, (x) => op(r.slug, x.slug, `#${x.rank} ${E(x.name)}`))}</select><span class=t2>Cap $</span><input id=inCap class='inp ic' type=number min=1 value=${S.budget}><select id=dropSel class=sel>${mj(drops, (v) => `<option value=${v}${abs(S.dropShare - v) < 1e-4 ? ' selected' : ''}>${v ? `${fx(v * 100, v === 0.14 ? 0 : 1)}% Drop` : '0% (No Token)'}</option>`)}</select>${btn(pin ? '✓ Pinned' : '+ Compare', `data-cmp='${E(r.slug)}'`, `btn${pin ? ' ba' : ''}`)}</div>`) + `<div class=db><div class=ds>${s1('TVL', usd(r.tvl_usd))}${s1('7D', pct(r.change_7d), (r.change_7d ?? 0) >= 0 ? 'pos' : 'neg')}${s1('Age', r.age_days != null ? `${r.age_days}d` : '—')}${s1('Route', `${E(r.category)} · ${E(f.routed_chain)} (T${f.gas_tier})`)}${s1('Peer Rate', `${pi.rate_pct}% (${pi.peers_tok}/${pi.peers_tot})`)}</div><div><div class=ml>Conditional Proxy</div><div class='kv pos'>${usd(r.implied_value_usd)}</div></div></div><section class=gdt>${crd('Conditional Valuation &amp; Math', 'Nested OOF quantiles · CS 80% cov 71.4% (disclosed)', cMath)}${crd(`Comparable Peers (${peers.length})`, `Green: ${E(r.name)} P25–75 · Amber: Huber`, cPeer)}</section><section class=g2>${crd('Itemized Cost &amp; 2D Scenario Grid', 'Fees + opp vs capital-at-risk &amp; 0% reward', cEcon, tg(bCls, bTxt))}${crd(`Playbook (${f.steps.length} Steps · ${E(f.routed_chain)}) &amp; Risks`, `Floor ${usd(f.min_viable_usd, 0)} · Exit &lt;${E(f.tvl_trigger_label)} (−30%)`, cPlay)}</section>`;
}

function renderFarming() {
  const list = getFiltered('farming'); syncSelection(list);
  const vN = rows.filter((r) => calcRow(r).classification === 'VIABLE').length, sel = list.find((r) => r.slug === S.slug) || list[0] || null, gS = sel ? calcRow(sel) : null, medC = list.length ? O.median(list.map((r) => calcRow(r).totalCost)) : 0;
  const fKpis = [[`Cond. +EV @ ${usd(S.budget, 0)} (${fx(S.dropShare * 100, 1)}%)`, vN, `Active rows: ${list.length}`, vN ? 'pos' : 'neg'], ['0% Token Reward Audit', `0 / ${vN}`, 'Positive if zero token launches', 'neg'], ['Median Total Cost', usd(medC), `Gas + Bridge + Slip + ${fx(S.oppApr * 100, 0)}% Opp`, ''], ['Top Conditional Hourly', gS ? `${usd(gS.hypPerHr)}/hr` : '—', sel ? `#${sel.rank} ${E(sel.name)} (${E(sel.farm.routed_chain)})` : 'No match', gS && gS.hypPerHr > 0 ? 'pos' : '']];
  return ph('Farming Intelligence', `Conditional economics by Net $/hr · Net > $0, Drag ≤ ${fx(S.dragLimit * 100, 0)}%, ≥ $10/hr`, `<div class="cg"><span class="t2">Opp APR</span><select id="aprSel" class="sel">${mj([0, 0.04, 0.08], (v) => `<option value="${v}"${abs(S.oppApr - v) < 1e-4 ? ' selected' : ''}>${fx(v * 100, 0)}% T-Bill</option>`)}</select><span class="t2">Lock (d)</span><input id="inLock" class="inp ic" type="number" min="0" placeholder="Auto" value="${S.lockDays || ''}"></div>`) + `<section class="kg" style="grid-template-columns:repeat(4,1fr)">${mj(fKpis, kpiCard)}</section>${controlsBar('farming')}${protocolTable(list)}`;
}

function renderModel() {
  const oo = M.oos, pi = M.peer_incidence, sec = Object.keys(M.fit.supEff).sort().map((k) => [k, M.fit.supCount[k], fx(M.fit.supEff[k], 3), `${fx(exp(M.fit.supEff[k]), 3)}×`]), cats = Object.entries(M.fit.catCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const cAbl = tbl([['Stage'], ['LOO', 'r'], ['RMSE', 'r'], ['P90', 'r'], ['CS', 'r'], ['Status']], mj(oo.ladder, (st, i) => rowTr([[E(st.label), 'fw6'], [`${fx(st.loo_med_mult, 2)}x`, 'r num'], [fx(st.loo_rmse, 3), 'r num'], [`${fx(st.loo_p90_mult, 2)}x`, 'r num'], [`${fx(st.cs_med_mult, 2)}x`, 'r num'], [tg(st.kept ? 'tp' : 'tn', st.kept ? 'KEPT' : 'PRUNED')]], i === 2 ? 'ron' : ''))) + dv('eb', `<b>Calibration:</b> LOO q50=±${oo.q50_log} (${fx(exp(oo.q50_log), 2)}×), q80=±${oo.q80_log} (${fx(exp(oo.q80_log), 2)}×) hit <b>${oo.hit_p25_p75_pct}%/${oo.hit_p10_p90_pct}%</b>. CS (n=${oo.ladder[2].n_cs_test}) hits <b class=warn>${oo.cs_hit_p10_p90_pct}% (&lt;80%)</b>.`);
  const cSec = tbl([['Sector'], ['Comps', 'r'], ['Log Adj', 'r'], ['Mult', 'r']], mj(sec, ([k, c, e, m]) => rowTr([[E(k), 'fw6'], [c, 'r num'], [e, 'r num'], [m, 'r num']]))) + dv('eb', `<b>Cat Shrinkage (kCat=24):</b> ${cats.map(([c, n]) => `${E(c)} (n=${n}: ${fx(exp(M.fit.catEff[c] ?? 0), 2)}×)`).join(' · ')}`);
  return ph('Model Research &amp; Validation', `Huber IRLS (c=1.345) + EB (kSup=6, kCat=24) on ${M.comps.length} comps`) + `<section class=g2>${crd('Out-of-Sample Ablation Ladder', 'Features must improve LOO or CS error', cAbl)}${crd('Peer Token Incidence (Descriptive)', `Base ${pi.base_rate_pct}% (${pi.n_peers} peers) · Brier ${pi.brier_model} vs ${pi.brier_base}`, cSec)}</section>`;
}

function renderDataset() {
  const q = S.dsQ.trim().toLowerCase(), list = datasetRows.filter((p) => (S.dsPart === 'all' || p.part === S.dsPart) && (!q || `${p.name} ${p.slug} ${p.category} ${p.chains.join(' ')}`.toLowerCase().includes(q))), show = list.slice(0, 60);
  const parts = [['all', `All (${au.total})`], ['wl', `WL (${au.wl})`], ['clean_pre', `Clean (${au.clean_pre})`], ['comp_u2', `Comps (${au.comp_u2})`], ['tok_cex_other', `Tok/CEX (${au.tok_cex_other})`], ['excluded_cat', `Excl (${au.excluded_cat})`], ['excluded_sib', `Sib (${au.excluded_sib})`]], cm = { wl: 'tw', clean_pre: 'ta', comp_u2: 'tp', excluded_sib: 'tn' };
  return ph('Dataset Explorer (758 Snapshot Protocols)', 'Disjoint audit partition for all DefiLlama snapshot records') + `<div class=cb><div class=seg>${mj(parts, ([k, l]) => bt(S.dsPart === k, `data-dspart=${k}`, l))}</div><input id=dsSearch class='inp iq' type=search placeholder='Search 758 protocols…' value='${E(S.dsQ)}'></div><div class=tc><div class=ts>${tbl([['Partition'], ['Protocol'], ['Category'], ['Chains'], ['TVL', 'r'], ['MCap', 'r'], ['Audit']], mj(show, (p) => `<tr class='${p.rank ? 'rc' : ''}' ${p.rank ? `data-slug='${E(p.slug)}'` : ''}><td>${tg(cm[p.part] || 'tm', E(p.partLabel))}</td><td class=fw6>${E(p.name)} ${p.rank ? `<span class='t2 num'>#${p.rank}</span>` : ''}</td><td>${E(p.category)}</td><td class=t2>${E(p.chains.slice(0, 2).join(', '))}</td><td class='r num'>${usd(p.tvl_usd)}</td><td class='r num'>${p.mcap_usd ? usd(p.mcap_usd) : '—'}</td><td class=t2>${E(p.reason)}</td></tr>`))}</div><div class=tf><span>Showing ${show.length} of ${list.length} (${au.total} total)</span></div></div>`;
}

function renderCompare() {
  const picked = S.compare.map((s) => rows.find((r) => r.slug === s)).filter(Boolean);
  if (!picked.length) return `<div class="cd"><div class="em"><div class="fw6" style="font-size:15px;color:var(--t1)">No protocols pinned for comparison</div><div>Click "+" on any row or load a preset to compare up to 4 protocols side-by-side.</div><div class="cg">${btn('Load Top &amp; Firelight Preset', 'data-loadcmp="1"', 'btn ba')}${btn('Browse Token Radar', 'data-view="radar"')}</div></div></div>`;
  const specs = [['Rank · Category', (r) => `#${r.rank} · ${E(r.category)}`], ['TVL (7D)', (r) => `${usd(r.tvl_usd)} (${pct(r.change_7d)})`], ['Conditional Proxy', (r) => `<b class="pos">${usd(r.implied_value_usd)}</b>`], ['P25–P75', (r) => `${usd(r.p25_usd)}–${usd(r.p75_usd)}`], ['Peer Rate', (r) => `${r.peer_incidence.rate_pct}% (${r.peer_incidence.peers_tok}/${r.peer_incidence.peers_tot})`], ['Route · Floor', (r) => `${E(r.farm.routed_chain)} · ${usd(r.farm.min_viable_usd, 0)}`], ['Fees / Total Cost', (r) => `${usd(calcRow(r).fees)} / ${usd(calcRow(r).totalCost)}`], ['0% Reward Net', (r) => `<span class="neg">${usd(calcRow(r, S.budget, 0).hypNet)}</span>`], ['Break-Even Drop', (r) => `${fx(calcRow(r).beDropPct ?? 0, 2)}%`], [`Cond. Net (${usd(S.budget, 0)})`, (r) => { const g = calcRow(r); return `<b class="${g.hypNet > 0 ? 'pos' : 'neg'}">${usd(g.hypNet)} (${usd(g.hypPerHr)}/h)</b>`; }], ['Exit Trigger', (r) => `&lt;${E(r.farm.tvl_trigger_label)} (−30%)`]];
  return ph(`Side-by-Side Comparison (${picked.length}/4)`, `Evaluating conditional valuations, costs &amp; break-even thresholds at ${usd(S.budget, 0)}`, `<div class="cg">${btn('Export JSON', 'data-exp="compare-json"')}${btn('Clear', 'data-clearcmp="1"', 'btn bg')}</div>`) + `<div class="tc"><div class="ts">${tbl([['Metric'], ...picked.map((r) => [`${E(r.name)} ${btn('×', `data-cmp="${E(r.slug)}"`, 'btn bsm bg')}`, 'r'])], mj(specs, ([l, fn]) => rowTr([[l, 't2 fw6'], ...picked.map((r) => [fn(r), 'r num'])])), '')}</div></div>`;
}

function exportData(kind) {
  let text = '', name = 'omega-export.json', type = 'application/json';
  if (kind === 'board-json') { text = JSON.stringify({ as_of: R.as_of, rows }, null, 2); name = 'omega-board.json'; }
  else if (kind === 'compare-json') { text = JSON.stringify(S.compare.map((s) => rows.find((r) => r.slug === s)).filter(Boolean), null, 2); name = 'omega-compare.json'; }
  else { type = 'text/csv'; const src = kind === 'filtered-csv' ? getFiltered(S.view === 'farming' ? 'farming' : 'radar') : rows; name = kind === 'filtered-csv' ? 'omega-filtered.csv' : 'omega-board.csv'; text = 'rank,slug,name,category,chain,tvl_usd,chg_7d,age_days,peer_pct,implied_usd,total_cost,hyp_net,hyp_hr,status\n' + src.map((r) => { const g = calcRow(r); return [r.rank, r.slug, `"${r.name}"`, `"${r.category}"`, r.farm.routed_chain, r.tvl_usd, r.change_7d ?? '', r.age_days ?? '', r.peer_incidence.rate_pct, r.implied_value_usd, g.totalCost, g.hypNet, g.hypPerHr, g.classification].join(','); }).join('\n'); }
  const a = D.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); el('exp-pop').hidden = true;
}

function renderSidebar() {
  const navs = [['radar', 'Token Radar', N], ['research', 'Protocol Research', `#${rows.find((r) => r.slug === S.slug)?.rank ?? 1}`], ['farming', 'Farming Intelligence', rows.filter((r) => calcRow(r).classification === 'VIABLE').length], ['model', 'Model Research', 'OOS'], ['dataset', 'Dataset Explorer', au.total], ['compare', 'Compare & Export', S.compare.length]];
  el('nav').innerHTML = mj(navs, ([k, l, c]) => btn(`<span>${l}</span><span class="nc num">${c}</span>`, `data-view="${k}"`, `nb${S.view === k ? ' on' : ''}`));
  const cc = new Map(); rows.forEach((r) => cc.set(r.farm.routed_chain, (cc.get(r.farm.routed_chain) || 0) + 1));
  el('sb-chains').innerHTML = `<div class="sl">Routed Chains</div>` + mj([...cc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6), ([ch, c]) => btn(`<span>${E(ch)}</span><span class="num">${c}</span>`, `data-chainpick="${E(ch)}"`, `cr${S.chain === ch ? ' on' : ''}`));
  el('sb-foot').innerHTML = `<div class="st"><span>Snapshot</span><b class="num">${R.as_of}</b></div><div class="st"><span>Universe</span><b class="num pos">${au.total}/758 ✓</b></div><div class="st"><span>Watchlist</span><b class="num pos">${wlN}/40 ✓</b></div><div class="st"><span>Parity</span><b class="num pos">${dg.length}/${N} ✓</b></div>`;
}

function renderTray() {
  const t = el('tray');
  if (!S.compare.length || S.view === 'compare') { t.hidden = true; return; }
  t.hidden = false;
  t.innerHTML = `<span class="fw6">Comparing ${S.compare.length}/4:</span>` + mj(S.compare, (sl) => { const r = rows.find((x) => x.slug === sl); return r ? `<span class="tag ta">${E(r.name)} <button type="button" data-cmp="${E(sl)}" style="background:none;border:0;cursor:pointer;margin-left:3px">×</button></span>` : ''; }) + `<button type="button" class="btn bsm ba" data-view="compare">Open →</button>`;
}

function render(fId) {
  const nm = { radar: 'Token Radar', research: 'Protocol Research', farming: 'Farming Intelligence', model: 'Model Research', dataset: 'Dataset Explorer', compare: 'Compare & Export' };
  el('crumb').textContent = `OMEGA / ${nm[S.view]}`; el('hdr-meta').textContent = `Snapshot ${R.as_of} · Offline Deterministic`;
  renderSidebar();
  el('app').innerHTML = S.view === 'radar' ? renderRadar() : S.view === 'research' ? renderResearch() : S.view === 'farming' ? renderFarming() : S.view === 'model' ? renderModel() : S.view === 'dataset' ? renderDataset() : renderCompare();
  renderTray();
  const q = el('qInput'), ds = el('dsSearch');
  if (q) { q.oninput = (e) => { S.q = e.target.value; S.page = 1; render('qInput'); }; if (fId === 'qInput') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  if (ds) { ds.oninput = (e) => { S.dsQ = e.target.value; render('dsSearch'); }; if (fId === 'dsSearch') { ds.focus(); ds.setSelectionRange(ds.value.length, ds.value.length); } }
}

el('gsearch').oninput = (e) => {
  const q = e.target.value.trim().toLowerCase(), dr = el('gdrop'); if (!q) { dr.hidden = true; return; }
  const hits = datasetRows.filter((p) => `${p.name} ${p.slug} ${p.category} ${p.chains.join(' ')}`.toLowerCase().includes(q)).slice(0, 10);
  dr.hidden = false;
  dr.innerHTML = hits.length ? mj(hits, (p) => `<button type="button" class="gi" data-gsel="${E(p.slug)}" data-grank="${p.rank ? 1 : 0}"><div><div class="fw6">${E(p.name)}</div><div class="t2 xs">${E(p.category)} · ${E(p.chains[0] || '')} · ${usd(p.tvl_usd)}</div></div>${tg(p.rank ? 'ta' : 'tm', p.rank ? `#${p.rank}` : E(p.partLabel))}</button>`) : '<div class="t2" style="padding:10px">No match in 758 records.</div>';
};

D.onmousemove = (e) => {
  const dot = e.target?.closest?.('[data-tip]'), tip = el('tip'); if (!dot) { tip.hidden = true; return; }
  const [t, l1, l2] = dot.dataset.tip.split('|'); tip.hidden = false;
  tip.innerHTML = `<div class="fw6">${E(t)}</div><div class="t2">${E(l1)}</div>${l2 ? `<div class="ac num" style="margin-top:2px">${E(l2)}</div>` : ''}`;
  tip.style.left = `${min(window.innerWidth - 296, e.clientX + 12)}px`; tip.style.top = `${min(window.innerHeight - 96, e.clientY + 12)}px`;
};

D.onchange = (e) => {
  const t = e.target; if (t.dataset?.col) { S.cols[t.dataset.col] = t.checked; render(); return; }
  const m = { detProto: () => { S.slug = t.value; }, catSel: () => { S.cat = t.value; S.page = 1; }, chainSel: () => { S.chain = t.value; S.page = 1; }, dropSel: () => { S.dropShare = +t.value; }, aprSel: () => { S.oppApr = +t.value; }, inCap: () => { S.budget = max(1, +t.value || 1000); }, inLock: () => { S.lockDays = max(0, +t.value || 0); }, perSel: () => { S.perPage = +t.value; S.page = 1; } }[t?.id];
  if (m) { m(); render(); }
};

D.onclick = (e) => {
  const trg = e.target?.closest?.('[data-cmp],[data-gsel],[data-view],[data-subset],[data-farmfilter],[data-budget],[data-sort],[data-page],[data-scale],[data-restab],[data-dspart],[data-chainpick],[data-reset],[data-clearcmp],[data-loadcmp],[data-exp],#btn-cols,#btn-exp,#btn-meth,.mbg,.rc');
  if (!e.target?.closest?.('#btn-exp,#exp-pop')) el('exp-pop').hidden = true;
  if (!e.target?.closest?.('#btn-cols,#col-pop')) { const cp = el('col-pop'); if (cp) cp.hidden = true; }
  if (!e.target?.closest?.('.sw')) el('gdrop').hidden = true;
  if (!trg) return;
  if (trg.id === 'btn-exp') { el('exp-pop').hidden = !el('exp-pop').hidden; return; }
  if (trg.id === 'btn-cols') { const cp = el('col-pop'); if (cp) cp.hidden = !cp.hidden; return; }
  if (trg.id === 'btn-meth') {
    const m = el('modal'); m.hidden = false;
    m.innerHTML = `<div class="mdl" onclick="event.stopPropagation()"><div class="ch"><h2 style="font-size:19px;font-weight:600">Snapshot &amp; Methodology</h2>${btn('Close', 'id="mdl-close"', 'btn bsm')}</div><p class="t2"><b>1. Sealed Snapshot:</b> 758 protocols dated <b>${R.as_of}</b>. 100% offline deterministic.</p><p class="t2"><b>2. Conditional Proxy:</b> E[MCap|TVL,Sector,Cat] via Huber (c=1.345) + EB shrinkage (kSup=6, kCat=24) on ${M.comps.length} comps. Peer incidence (${M.peer_incidence.base_rate_pct}%) is separate.</p><p class="t2"><b>3. Scenario Economics:</b> Net $/hr depends on drop share, itemized fees, and opp cost. At <b>0% (No Token)</b>, 0/${N} plays are positive.</p></div>`;
    return;
  }
  if (trg.classList?.contains('mbg') || e.target?.id === 'mdl-close') { el('modal').hidden = true; return; }
  const ds = trg.dataset || {};
  if (ds.exp) return exportData(ds.exp);
  if (ds.cmp) { e.stopPropagation(); const i = S.compare.indexOf(ds.cmp); if (i >= 0) S.compare.splice(i, 1); else if (S.compare.length < 4) S.compare.push(ds.cmp); }
  else if (ds.gsel) { el('gdrop').hidden = true; el('gsearch').value = ''; if (ds.grank === '1') { S.slug = ds.gsel; S.view = 'research'; } else { S.dsQ = ds.gsel; S.dsPart = 'all'; S.view = 'dataset'; } }
  else if (ds.view) { S.view = ds.view; if (ds.view === 'farming') Object.assign(S, { sortBy: 'netHr', sortDir: -1, page: 1 }); else if (ds.view === 'radar') Object.assign(S, { sortBy: 'rank', sortDir: 1, page: 1 }); }
  else if (ds.subset) { S.subset = ds.subset; S.page = 1; }
  else if (ds.farmfilter) { S.farmFilter = ds.farmfilter; S.page = 1; }
  else if (ds.budget) S.budget = +ds.budget;
  else if (ds.scale) S.scale = ds.scale;
  else if (ds.restab) S.resTab = ds.restab;
  else if (ds.dspart) S.dsPart = ds.dspart;
  else if (ds.page) S.page = +ds.page;
  else if (ds.clearcmp) S.compare = [];
  else if (ds.loadcmp) S.compare = [rows[0].slug, rows[1].slug, 'firelight'];
  else if (ds.chainpick) { S.chain = S.chain === ds.chainpick ? 'ALL' : ds.chainpick; S.page = 1; }
  else if (ds.reset) Object.assign(S, { subset: 'all', farmFilter: 'all', cat: 'ALL', chain: 'ALL', q: '', page: 1 });
  else if (ds.sort) { S.sortDir = S.sortBy === ds.sort ? -S.sortDir : (ds.sort === 'rank' ? 1 : -1); S.sortBy = ds.sort; S.page = 1; }
  else if (ds.slug) { S.slug = ds.slug; S.view = 'research'; }
  render();
};

D.onkeydown = (e) => {
  if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) && !e.target?.matches?.('input,select')) { e.preventDefault(); el('gsearch').focus(); }
  else if (e.key === 'Escape') { el('gdrop').hidden = true; el('exp-pop').hidden = true; el('modal').hidden = true; el('tip').hidden = true; const cp = el('col-pop'); if (cp) cp.hidden = true; }
  else if (!e.target?.matches?.('input,select') && (e.key === '[' || e.key === ']')) { const o = ['radar', 'research', 'farming', 'model', 'dataset', 'compare']; S.view = o[(o.indexOf(S.view) + (e.key === ']' ? 1 : o.length - 1)) % o.length]; render(); }
};

window.TITAN_SET = (p) => {
  const vm = { board: 'radar', detail: 'research', filtered: 'farming' }, nx = { ...p };
  if (nx.view && vm[nx.view]) nx.view = vm[nx.view];
  if (nx.view === 'farming' && !nx.sortBy) { nx.sortBy = 'netHr'; nx.sortDir = -1; }
  if (nx.view === 'radar' && !nx.sortBy) { nx.sortBy = 'rank'; nx.sortDir = 1; }
  Object.assign(S, nx); render();
};
window.TITAN_STATE = S; window.OMEGA_BOARD = M; render();
})();
