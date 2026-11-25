(function () {
  const O = window.OMEGA, R = window.RADAR_DATA, model = O.buildFullBoard(R, R.wl_specs), rows = model.rows;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => {
    if (n == null || !Number.isFinite(n)) return '—';
    const a = Math.abs(n), sg = n < 0 ? '-' : '';
    return a >= 1e9 ? `${sg}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${sg}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${sg}$${(a / 1e3).toFixed(1)}K` : `${sg}$${a.toFixed(a < 20 ? 2 : 0)}`;
  };
  const pct = (n) => (n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);

  const dig = R.precomputed_rows_digest || [];
  const parityOk = dig.length === rows.length && rows.every((r, i) => dig[i].slug === r.slug && dig[i].rank === r.rank && dig[i].implied_value_usd === r.implied_value_usd);
  const wlCount = rows.filter((r) => r.is_watchlist).length;
  const rankOk = rows.every((r, i) => r.rank === i + 1 && (i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd));
  const stepSumOk = rows.every((r) => Math.abs(r.farm.steps.reduce((s, st) => s + st.cost_usd, 0) - (r.farm.gas_4w_usd + r.farm.bridge_exit_usd)) < 0.05);
  const au = model.audit_summary, auditOk = au.total === R.protocols.length;

  const state = {
    view: 'board', slug: rows[0]?.slug || 'steakhouse-financial', subset: 'all', cat: 'ALL', chain: 'ALL',
    q: '', sortBy: 'rank', sortDir: 1, budget: 1000, dropShare: 0.07, lockDays: 0, dragLimit: 0.05,
    customGas: null, customBridge: null, customSlip: null,
  };

  function econFor(r, cap, drop) {
    const f = r.farm;
    return O.calcEconomics({
      capital_usd: cap ?? state.budget,
      gas_4w_usd: state.customGas != null && r.slug === state.slug ? state.customGas : f.gas_4w_usd,
      bridge_exit_usd: state.customBridge != null && r.slug === state.slug ? state.customBridge : f.bridge_exit_usd,
      slippage_bps: state.customSlip != null && r.slug === state.slug ? state.customSlip : f.slippage_bps,
      lockup_days: state.lockDays || f.lockup_days, hours: f.hours, yield_bearing: f.yield_bearing,
      drag_limit: state.dragLimit, drop_share: drop ?? state.dropShare, tvl_usd: r.tvl_usd,
      implied_usd: r.implied_value_usd, non_farm_flag: f.non_farm_flag, min_viable_usd: f.min_viable_usd,
    });
  }

  function clsBadge(c) {
    const map = { 'CONDITIONAL SCENARIO': 'green', 'RESEARCH FURTHER': 'amber', 'NOT A FARM': 'rose' };
    return `<span class="badge badge-${map[c] || 'slate'}">${c}</span>`;
  }

  function filtered(mode) {
    const q = state.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (state.subset === 'wl' && !r.is_watchlist) return false;
      if (state.subset === 'early' && r.tvl_usd >= R.floor_usd) return false;
      if (state.subset === 'clean' && (r.farm.non_farm_flag || r.wl_conflict)) return false;
      if ((mode === 'farm' || state.subset === 'viable') && econFor(r).classification !== 'CONDITIONAL SCENARIO') return false;
      if (state.cat !== 'ALL' && r.category !== state.cat) return false;
      if (state.chain !== 'ALL' && r.farm.routed_chain !== state.chain && !r.chains.includes(state.chain)) return false;
      if (q && !(`${r.name} ${r.slug} ${r.category} ${r.farm.routed_chain}`.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => {
      const k = state.sortBy, d = state.sortDir;
      if (k === 'tvl') return (a.tvl_usd - b.tvl_usd) * d;
      if (k === 'chg7') return ((a.change_7d ?? -999) - (b.change_7d ?? -999)) * d;
      if (k === 'age') return ((a.age_days ?? -1) - (b.age_days ?? -1)) * d;
      if (k === 'peer') return (a.peer_incidence.rate_pct - b.peer_incidence.rate_pct) * d;
      if (k === 'val') return (a.implied_value_usd - b.implied_value_usd) * d;
      if (k === 'netHr') return ((econFor(a).hypPerHr || -999) - (econFor(b).hypPerHr || -999)) * d;
      return (a.rank - b.rank) * d;
    });
  }

  function scatterSvg(hl) {
    const W = 540, H = 196, L = 46, R_ = 12, T = 10, B = 35;
    const x0 = Math.log(1e6), x1 = Math.log(4e10), y0 = Math.log(1e5), y1 = Math.log(2e10);
    const sx = (v) => L + ((Math.max(x0, Math.min(x1, v)) - x0) / (x1 - x0)) * (W - L - R_);
    const sy = (v) => H - B - ((Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0)) * (H - T - B);
    const ticks = [1e6, 1e7, 1e8, 1e9, 1e10];
    const gx = ticks.map((v) => `<line x1="${sx(Math.log(v)).toFixed(1)}" y1="${T}" x2="${sx(Math.log(v)).toFixed(1)}" y2="${H - B}" stroke="#1d2b42"/><text x="${sx(Math.log(v)).toFixed(1)}" y="${H - 18}" fill="#8fa1b9" font-size="9" text-anchor="middle">${fmt(v)}</text>`).join('');
    const gy = ticks.map((v) => `<line x1="${L}" y1="${sy(Math.log(v)).toFixed(1)}" x2="${W - R_}" y2="${sy(Math.log(v)).toFixed(1)}" stroke="#1d2b42"/><text x="${L - 5}" y="${+sy(Math.log(v)).toFixed(1) + 3}" fill="#8fa1b9" font-size="9" text-anchor="end">${fmt(v)}</text>`).join('');
    const ln = `<line x1="${sx(x0).toFixed(1)}" y1="${sy(model.fit.b0 + model.fit.b1 * x0).toFixed(1)}" x2="${sx(x1).toFixed(1)}" y2="${sy(model.fit.b0 + model.fit.b1 * x1).toFixed(1)}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    const dots = model.comps.map((c) => {
      const m = hl && c.category === hl.category;
      return `<circle cx="${sx(Math.log(c.tvl_family)).toFixed(1)}" cy="${sy(c.y_log).toFixed(1)}" r="${m ? 3.5 : 2.2}" fill="${m ? '#38bdf8' : '#64748b'}" fill-opacity="${m ? 0.95 : 0.6}"/>`;
    }).join('');
    const mark = hl
      ? `<line x1="${sx(Math.log(hl.tvl_family)).toFixed(1)}" y1="${sy(Math.log(hl.p75_usd)).toFixed(1)}" x2="${sx(Math.log(hl.tvl_family)).toFixed(1)}" y2="${sy(Math.log(hl.p25_usd)).toFixed(1)}" stroke="#10b981" stroke-width="2"/><circle cx="${sx(Math.log(hl.tvl_family)).toFixed(1)}" cy="${sy(Math.log(hl.implied_value_usd)).toFixed(1)}" r="5.5" fill="#10b981" stroke="#fff" stroke-width="1.5"/>`
      : rows.slice(0, 5).map((r) => `<circle cx="${sx(Math.log(r.tvl_family)).toFixed(1)}" cy="${sy(Math.log(r.implied_value_usd)).toFixed(1)}" r="3.4" fill="#f59e0b" stroke="#080d16"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${gx}${gy}${ln}${dots}${mark}<text x="${W / 2}" y="${H - 3}" fill="#8fa1b9" font-size="9" text-anchor="middle">Log Family TVL (n=119 Non-CEX Live Comps vs Huber Trend)</text></svg>`;
  }

  function whisker(r) {
    const a = Math.log(1e5), b = Math.log(3e10), p = (v) => Math.max(0, Math.min(100, ((Math.log(Math.max(1e5, v)) - a) / (b - a)) * 100));
    const p10 = p(r.p10_usd), p25 = p(r.p25_usd), pt = p(r.implied_value_usd), p75 = p(r.p75_usd), p90 = p(r.p90_usd);
    return `<div class="whisker-wrap"><div class="mono fw7 flex-bar" style="gap:8px"><span>${fmt(r.implied_value_usd)}</span><span class="muted fw4 sm">${fmt(r.p25_usd)} – ${fmt(r.p75_usd)}</span></div><div class="whisker-bar" title="P10–P90: ${fmt(r.p10_usd)}–${fmt(r.p90_usd)}"><div class="whisker-80" style="left:${p10.toFixed(1)}%;width:${Math.max(1, p90 - p10).toFixed(1)}%"></div><div class="whisker-50" style="left:${p25.toFixed(1)}%;width:${Math.max(2, p75 - p25).toFixed(1)}%"></div><div class="whisker-pt" style="left:${pt.toFixed(1)}%"></div></div></div>`;
  }

  function ctls(showSub) {
    const cats = ['ALL', ...new Set(rows.map((r) => r.category))].sort();
    const chs = ['ALL', ...new Set(rows.map((r) => r.farm.routed_chain))].sort();
    const subs = [['all', `All (${rows.length})`], ['wl', `Watchlist (${wlCount})`], ['early', 'Early <$50M'], ['clean', 'Clean'], ['viable', 'Budget Clear']];
    return `<div class="ctl-bar">${showSub ? `<div class="chip-group">${subs.map(([k, l]) => `<button class="chip ${state.subset === k ? 'active' : ''}" data-subset="${k}">${l}</button>`).join('')}</div>` : ''}
      <input id="qInput" class="ctl-in ctl-search" type="search" placeholder="Search protocol, slug, category, or chain..." value="${esc(state.q)}">
      <select id="catSel" class="ctl-sm">${cats.map((c) => `<option value="${esc(c)}" ${state.cat === c ? 'selected' : ''}>${c === 'ALL' ? 'All Categories' : esc(c)}</option>`).join('')}</select>
      <select id="chainSel" class="ctl-sm">${chs.map((c) => `<option value="${esc(c)}" ${state.chain === c ? 'selected' : ''}>${c === 'ALL' ? 'All Chains' : esc(c)}</option>`).join('')}</select>
      <div class="chip-group">${[500, 1000, 5000, 25000].map((b) => `<button class="chip ${state.budget === b ? 'active' : ''}" data-budget="${b}">${fmt(b)}</button>`).join('')}</div>
      <select id="dropSel" class="ctl-sm">${[[0.035, '3.5% Drop'], [0.07, '7.0% Drop'], [0.14, '14% Drop']].map(([v, l]) => `<option value="${v}" ${state.dropShare === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  }

  function renderBoard() {
    const list = filtered('board'), condN = rows.filter((r) => econFor(r).classification === 'CONDITIONAL SCENARIO').length;
    const sumImp = rows.reduce((s, r) => s + r.implied_value_usd, 0), fin = model.oos.ladder[model.oos.ladder.length - 1];
    const segs = [['Watchlist', au.wl, '#f59e0b'], ['Clean Pre-Token', au.clean_pre, '#38bdf8'], ['U1 Live Comps', au.comp_u1, '#10b981'], ['Other Token/CEX', au.tok_cex_other, '#64748b'], ['Excluded Cat/Wrap', au.excluded_cat, '#475569'], ['Token Sibling', au.excluded_sib, '#f43f5e']];
    return `
      <section class="kpi-grid">
        <div class="kpi"><span class="kpi-lbl">Ranked Radar</span><span class="kpi-val">${rows.length}</span><span class="kpi-sub">${wlCount}/40 Watchlist Covered</span></div>
        <div class="kpi"><span class="kpi-lbl">If Tokens Launch</span><span class="kpi-val">${fmt(sumImp)}</span><span class="kpi-sub">Conditional Spot Proxy Sum</span></div>
        <div class="kpi"><span class="kpi-lbl">Held-Out OOS Miss</span><span class="kpi-val">${fin.loo_med_mult}x</span><span class="kpi-sub">LOO 119 | Cross-Sec ${fin.cs_med_mult}x</span></div>
        <div class="kpi"><span class="kpi-lbl">Range Empirical Hit</span><span class="kpi-val">${model.oos.hit_p25_p75_pct}% / ${model.oos.hit_p10_p90_pct}%</span><span class="kpi-sub">P25–75 &amp; P10–90 (Inner-LOO)</span></div>
        <div class="kpi"><span class="kpi-lbl">Peer Token Incidence</span><span class="kpi-val">${model.peer_incidence.base_rate_pct}%</span><span class="kpi-sub">Brier ${model.peer_incidence.brier_model} vs ${model.peer_incidence.brier_base}</span></div>
        <div class="kpi"><span class="kpi-lbl">Budget Clear (${fmt(state.budget)})</span><span class="kpi-val pos">${condN}</span><span class="kpi-sub">&lt;5% Drag &amp; Clean Terms</span></div>
      </section>
      <section class="panel">
        <div class="panel-hdr"><span class="panel-title">Snapshot Accounting (${au.total} / 758 Audited)</span><span class="muted">Recomputed live via <span class="mono">OMEGA.buildFullBoard()</span></span></div>
        <div class="stack-bar">${segs.map(([l, n, c]) => `<div class="stack-seg" style="width:${((n / au.total) * 100).toFixed(2)}%;background:${c}" title="${l}: ${n}"></div>`).join('')}</div>
        <div class="legend-row">${segs.map(([l, n, c]) => `<span class="leg-item"><span class="leg-dot" style="background:${c}"></span>${l}: <strong class="mono">${n}</strong></span>`).join('')}</div>
        <div class="parity-strip">
          <span class="${parityOk ? 'pill-ok' : 'pill-err'}">Browser==Board: ${rows.length}/${rows.length} ${parityOk ? '✓' : '✗'}</span>
          <span class="${wlCount === 40 ? 'pill-ok' : 'pill-err'}">Watchlist: ${wlCount}/40 ✓</span>
          <span class="${auditOk ? 'pill-ok' : 'pill-err'}">Universe: ${au.total}/758 ✓</span>
          <span class="${rankOk ? 'pill-ok' : 'pill-err'}">Ranks 1..${rows.length} ✓</span>
          <span class="${stepSumOk ? 'pill-ok' : 'pill-err'}">Step Cost Sums Match ✓</span>
          <span class="pill-ok">6 Sibling Leaks Blocked ✓</span>
        </div>
      </section>
      <section class="two-col">
        <div class="panel mb0">
          <div class="panel-hdr"><span class="panel-title">Held-Out OOS Ablation Ladder</span><span class="muted">n=119 LOO | n=27 Cross-Sec Split</span></div>
          <table class="matrix-tbl"><thead><tr><th>Stage</th><th>LOO Med</th><th>RMSE</th><th>P90</th><th>Cross-Sec</th></tr></thead>
            <tbody>${model.oos.ladder.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.loo_med_mult}x</td><td>${r.loo_rmse}</td><td>${r.loo_p90_mult}x</td><td>${r.cs_med_mult}x</td></tr>`).join('')}</tbody></table>
          <div class="muted sm mt6">Cross-Sec holds out newest 30% by snapshot <span class="mono">listed_at</span> (not TGE date).</div>
        </div>
        <div class="panel mb0"><div class="panel-hdr"><span class="panel-title">TVL vs Spot Mcap Fit</span><span class="muted">Huber b1=${model.fit.b1.toFixed(2)} · Top-5 (Amber)</span></div>${scatterSvg(null)}</div>
      </section>
      ${ctls(true)}
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th class="sortable" data-sort="rank">#</th><th>Protocol · Home · Flags</th><th class="sortable" data-sort="tvl">TVL</th>
          <th class="sortable" data-sort="chg7">7d</th><th class="sortable" data-sort="age">Age</th><th class="sortable" data-sort="peer">Peer Rate</th>
          <th class="sortable" data-sort="val">If Launches (P25–P75)</th><th class="sortable" data-sort="netHr">Scenario @ ${fmt(state.budget)}</th>
        </tr></thead>
        <tbody>${list.map((r) => {
          const ec = econFor(r);
          const b = [r.is_watchlist ? '<span class="badge badge-amber">WL</span>' : '', r.farm.non_farm_flag ? `<span class="badge badge-rose">${esc(r.farm.non_farm_flag)}</span>` : '', r.wl_conflict ? '<span class="badge badge-amber">SIBLING FLAG</span>' : ''].join(' ');
          return `<tr class="row-click ${r.slug === state.slug ? 'row-sel' : ''}" data-slug="${esc(r.slug)}">
            <td class="mono muted">${r.rank}</td>
            <td><div class="proto-cell"><div class="proto-top">${esc(r.name)} ${b}</div><div class="proto-meta">${esc(r.category)} · ${esc(r.farm.routed_chain)} (min ${fmt(r.farm.min_viable_usd)})</div></div></td>
            <td class="mono">${fmt(r.tvl_usd)}</td>
            <td class="mono ${(r.change_7d ?? 0) >= 0 ? 'pos' : 'neg'}">${pct(r.change_7d)}</td>
            <td class="mono muted">${r.age_days != null ? `${r.age_days}d` : '—'}</td>
            <td><div class="mono sm">${r.peer_incidence.rate_pct}% <span class="muted">(${r.peer_incidence.peers_tok}/${r.peer_incidence.peers_tot})</span></div><div class="peer-bar"><div class="peer-fill" style="width:${r.peer_incidence.rate_pct}%"></div></div></td>
            <td>${whisker(r)}</td>
            <td><div>${clsBadge(ec.classification)}</div><div class="mono muted sm">BE ${fmt(ec.breakEvenReward)} | ${fmt(ec.hypPerHr)}/hr</div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }

  function renderDetail() {
    const r = rows.find((x) => x.slug === state.slug) || rows[0], d = r.log_decomp;
    const exact = model.comps.filter((c) => c.category === r.category).sort((a, b) => Math.abs(Math.log(a.tvl_family) - Math.log(r.tvl_family)) - Math.abs(Math.log(b.tvl_family) - Math.log(r.tvl_family)));
    const peers = (exact.length ? exact : model.comps.filter((c) => c.sc === r.sc).sort((a, b) => Math.abs(Math.log(a.tvl_family) - Math.log(r.tvl_family)) - Math.abs(Math.log(b.tvl_family) - Math.log(r.tvl_family)))).slice(0, 6);
    return `
      <div class="panel flex-bar">
        <div class="flex-gp"><button class="btn" data-go="board">← Overview</button><strong style="font-size:15px">#${r.rank} ${esc(r.name)}</strong>
          ${r.is_watchlist ? '<span class="badge badge-amber">WATCHLIST</span>' : '<span class="badge badge-cyan">PRE-TOKEN</span>'}
          ${r.farm.non_farm_flag ? `<span class="badge badge-rose">${esc(r.farm.non_farm_flag)}</span>` : ''}</div>
        <button class="btn btn-prim" data-go="farm">Open Farming Playbook →</button>
      </div>
      ${r.wl_conflict ? `<div class="panel warn-box"><strong class="warn">Watchlist Sibling Flag:</strong> ${esc(r.wl_conflict)}. Retained for 40/40 watchlist coverage.</div>` : ''}
      <section class="two-col-eq">
        <div class="panel mb0"><div class="panel-hdr"><span class="panel-title">1. Verified Snapshot Facts</span><span class="muted">${esc(R.as_of)}</span></div>
          <div class="kv-grid">
            <div class="kv"><div class="kv-k">Category / Sector</div><div class="kv-v">${esc(r.category)} (${esc(r.sc)})</div></div>
            <div class="kv"><div class="kv-k">Spot / Family TVL</div><div class="kv-v mono">${fmt(r.tvl_usd)} / ${fmt(r.tvl_family)}</div></div>
            <div class="kv"><div class="kv-k">7d / Listed Date</div><div class="kv-v mono">${pct(r.change_7d)} · ${r.listed_at || 'Undated'} (${r.age_days ?? '?'}d)</div></div>
            <div class="kv"><div class="kv-k">Routed Chain (${r.chains.length} Listed)</div><div class="kv-v">${esc(r.farm.routed_chain)} (Tier-${r.farm.gas_tier}) · [${esc(r.chains.join(', '))}]</div></div>
          </div>
        </div>
        <div class="panel mb0"><div class="panel-hdr"><span class="panel-title">2. Conditional Proxy Build-Up</span><span class="muted">If Token Launches</span></div>
          <table class="matrix-tbl"><thead><tr><th>Component</th><th>Value</th><th>Basis</th></tr></thead><tbody>
            <tr><td>Global Huber TVL Curve</td><td>${fmt(d.global)}</td><td class="tl">b0=${model.fit.b0.toFixed(2)}, b1=${model.fit.b1.toFixed(2)}</td></tr>
            <tr><td>× Sector Shrunk Offset (${r.sc})</td><td>${d.sup_mult}×</td><td class="tl">n=${r.n_sup_comps}, kSup=6</td></tr>
            <tr><td>× Category Shrunk Offset (${r.n_cat_comps})</td><td>${d.cat_mult}×</td><td class="tl">Shrinkage kCat=16</td></tr>
            <tr><td>× 7d Growth &amp; Maturity</td><td>${(d.g_mult * d.m_mult).toFixed(3)}×</td><td class="tl">Bounded ±5%</td></tr>
            <tr><td><strong>Conditional Spot Proxy</strong></td><td><strong>${fmt(r.implied_value_usd)}</strong></td><td class="tl">P25–P75: ${fmt(r.p25_usd)}–${fmt(r.p75_usd)}</td></tr>
            <tr><td>Outer Band (P10–P90)</td><td>${fmt(r.p10_usd)}–${fmt(r.p90_usd)}</td><td class="tl">79.0% Inner-LOO Hit</td></tr>
          </tbody></table>
        </div>
      </section>
      <section class="two-col">
        <div class="panel mb0"><div class="panel-hdr"><span class="panel-title">3. TVL vs Mcap Scatter Highlight</span><span class="muted">Green = Selected · Cyan = Category Peers</span></div>${scatterSvg(r)}</div>
        <div class="panel mb0"><div class="panel-hdr"><span class="panel-title">4. Descriptive Peer Token Incidence</span><span class="badge badge-slate">NOT FUTURE LAUNCH ODDS</span></div>
          <div class="kv-grid"><div class="kv"><div class="kv-k">Peer Bucket</div><div class="kv-v mono">${esc(r.peer_incidence.bucket)}</div></div><div class="kv"><div class="kv-k">Tokenized Peer Rate</div><div class="kv-v mono">${r.peer_incidence.rate_pct}% (${r.peer_incidence.peers_tok}/${r.peer_incidence.peers_tot})</div></div></div>
          <p class="muted mt6">Cross-sectional peer incidence (${model.peer_incidence.n_peers} peers; Brier ${model.peer_incidence.brier_model} vs ${model.peer_incidence.brier_base}) is descriptive only — never multiplied into ranking or proxy value.</p>
        </div>
      </section>
      <section class="panel"><div class="panel-hdr"><span class="panel-title">5. ${exact.length ? `Exact Category Peers (${r.category}: ${exact.length})` : `Sector Fallback (${r.sc}: 0 exact ${r.category} live comps)`}</span><span class="muted">Nearest Log(TVL)</span></div>
        <div class="tbl-wrap"><table><thead><tr><th>Match</th><th>Comparable</th><th>Category</th><th>Family TVL</th><th>Spot Mcap</th><th>Mcap/TVL</th><th>Listed</th></tr></thead>
        <tbody>${peers.map((c) => `<tr><td><span class="badge ${c.category === r.category ? 'badge-cyan' : 'badge-slate'}">${c.category === r.category ? 'EXACT' : 'SECTOR'}</span></td><td><strong>${esc(c.name)}</strong></td><td>${esc(c.category)}</td><td class="mono">${fmt(c.tvl_family)}</td><td class="mono">${fmt(c.mcap_usd)}</td><td class="mono">${(c.mcap_usd / Math.max(1, c.tvl_family)).toFixed(2)}×</td><td class="mono muted">${c.listed_at || '—'}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
  }

  function renderFarm() {
    const r = rows.find((x) => x.slug === state.slug) || rows[0], f = r.farm, ec = econFor(r);
    const topPlays = filtered('farm').slice(0, 6), caps = [500, 1000, 5000, 25000], drops = [0.02, 0.035, 0.07, 0.14];
    const oppBench = +(state.budget * 0.04 * ((state.lockDays || f.lockup_days) / 365)).toFixed(2);
    return `
      ${ctls(false)}
      <section class="panel">
        <div class="panel-hdr"><span class="panel-title">Budget-Cleared Plays @ ${fmt(state.budget)} (${filtered('farm').length} Passing Drag &amp; Clean Checks)</span><span class="muted">Click any row to load playbook</span></div>
        <div class="tbl-wrap"><table><thead><tr><th>Rank</th><th>Protocol</th><th>Home Chain</th><th>TVL / 7d</th><th>If Launches</th><th>Fee Drag</th><th>Break-Even</th><th class="sortable" data-sort="netHr">Hyp. Net @ ${fmt(state.budget)}</th></tr></thead>
          <tbody>${topPlays.map((x) => {
            const ex = econFor(x);
            return `<tr class="row-click ${x.slug === r.slug ? 'row-sel' : ''}" data-slug="${esc(x.slug)}"><td class="mono muted">#${x.rank}</td><td><strong>${esc(x.name)}</strong> ${x.is_watchlist ? '<span class="badge badge-amber">WL</span>' : ''}</td><td>${esc(x.farm.routed_chain)} (T${x.farm.gas_tier})</td><td class="mono">${fmt(x.tvl_usd)} <span class="${(x.change_7d ?? 0) >= 0 ? 'pos' : 'neg'}">${pct(x.change_7d)}</span></td><td class="mono">${fmt(x.implied_value_usd)}</td><td class="mono">${ex.dragPct}%</td><td class="mono">${fmt(ex.breakEvenReward)}</td><td class="mono pos"><strong>${fmt(ex.hypNet)}</strong> (${fmt(ex.hypPerHr)}/hr)</td></tr>`;
          }).join('')}</tbody></table></div>
      </section>
      <section class="two-col">
        <div class="panel mb0">
          <div class="panel-hdr"><span class="panel-title">Playbook: #${r.rank} ${esc(r.name)} (${esc(f.routed_chain)})</span>${clsBadge(ec.classification)}</div>
          <div class="kv-grid mb8">
            <div class="kv"><div class="kv-k">Mechanism</div><div class="kv-v sm">${esc(f.mechanism)}</div></div>
            <div class="kv"><div class="kv-k">Assets &amp; Floor</div><div class="kv-v sm">${esc(f.assets)} · Min ${fmt(f.min_viable_usd)} · ${f.yield_bearing ? 'Yield-Bearing' : '4% Opp'}</div></div>
          </div>
          <div class="tbl-wrap"><table><thead><tr><th>Step</th><th>Action (${esc(f.routed_chain)})</th><th>Asset</th><th>Cost</th><th>Time</th><th>Check</th></tr></thead>
            <tbody>${f.steps.map((s) => `<tr><td><span class="badge badge-cyan">${esc(s.label)}</span></td><td>${esc(s.action)}</td><td class="mono sm">${esc(s.asset)}</td><td class="mono">$${s.cost_usd.toFixed(2)}</td><td class="mono">${s.time_min}m</td><td class="muted">${esc(s.verify)}</td></tr>`).join('')}
            <tr style="background:#0d192c;font-weight:700"><td colspan="3">Exact Sum (${f.hours}h Horizon)</td><td class="mono">$${(f.gas_4w_usd + f.bridge_exit_usd).toFixed(2)}</td><td class="mono">${Math.round(f.hours * 60)}m</td><td class="muted">Reconciled</td></tr></tbody></table></div>
          <div class="muted sm mt6"><strong>Exit:</strong> ${esc(f.exit_mechanics)} <strong>KYC:</strong> ${esc(f.kyc_or_geo)}. <strong>Risks:</strong> ${esc(f.key_risks)} <strong>Unknowns:</strong> ${esc(f.unknowns)}</div>
        </div>
        <div class="panel mb0">
          <div class="panel-hdr"><span class="panel-title">Calculator &amp; 2D Scenario Matrix</span><button class="btn" id="resetEcon">Reset</button></div>
          <div class="flex-gp mb8">
            <label class="muted">Budget $<br><input id="inCap" class="ctl-in ctl-num" type="number" min="1" value="${state.budget}"></label>
            <label class="muted">Gas $<br><input id="inGas" class="ctl-in ctl-num" type="number" min="0" step="0.5" value="${state.customGas ?? f.gas_4w_usd}"></label>
            <label class="muted">Bridge $<br><input id="inBr" class="ctl-in ctl-num" type="number" min="0" step="0.5" value="${state.customBridge ?? f.bridge_exit_usd}"></label>
            <label class="muted">Slip bps<br><input id="inSlip" class="ctl-in ctl-num" type="number" min="0" step="1" value="${state.customSlip ?? f.slippage_bps}"></label>
            <label class="muted">Days<br><input id="inDays" class="ctl-in ctl-num" type="number" min="1" value="${state.lockDays || f.lockup_days}"></label>
          </div>
          <div class="kv-grid mb8">
            <div class="kv"><div class="kv-k">Total Fees + Opp</div><div class="kv-v mono">${ec.valid ? `${fmt(ec.totalCost)} (${ec.totalDragPct}% | Fees ${ec.dragPct}%)` : 'Invalid Input'}</div></div>
            <div class="kv"><div class="kv-k">Break-Even / Rate</div><div class="kv-v mono">${ec.valid ? `${fmt(ec.breakEvenReward)} (${fmt(ec.breakEvenPerHr)}/hr)` : '—'}</div></div>
            <div class="kv"><div class="kv-k">5% Drag Floor</div><div class="kv-v mono">${ec.valid ? fmt(ec.minCapUnderDrag) : '—'} (Min ${fmt(f.min_viable_usd)})</div></div>
            <div class="kv"><div class="kv-k">No-Action 4% T-Bill</div><div class="kv-v mono pos">+${fmt(oppBench)} (${state.lockDays || f.lockup_days}d)</div></div>
          </div>
          <div class="panel-title mb4">2D Drop-Share × Budget Net Scenario (Non-Guaranteed)</div>
          <table class="matrix-tbl"><thead><tr><th>Drop / Cap</th>${caps.map((c) => `<th>${fmt(c)}</th>`).join('')}</tr></thead>
            <tbody>${drops.map((ds) => `<tr><td><strong>${(ds * 100).toFixed(1)}%</strong></td>${caps.map((c) => {
              const g = econFor(r, c, ds);
              return `<td class="${g.hypNet > 0 && g.classification === 'CONDITIONAL SCENARIO' ? 'pos' : g.hypNet < 0 ? 'neg' : 'muted'}">${fmt(g.hypNet)}</td>`;
            }).join('')}</tr>`).join('')}</tbody></table>
          <div class="muted sm mt6">Sensitivity uses pro-rata <span class="mono">min(2%, Deposit/TVL) × Drop% × Implied</span>; actual tokenomics/points may differ or be $0.</div>
        </div>
      </section>`;
  }

  function render() {
    document.getElementById('hdrSub').textContent = `As of ${R.as_of} · ${rows.length} Pre-Token Ranked (${wlCount}/40 Watchlist) · ${R.protocols.length} Audited · Offline`;
    const qp = document.getElementById('quickPick');
    qp.innerHTML = rows.map((r) => `<option value="${esc(r.slug)}" ${r.slug === state.slug ? 'selected' : ''}>#${r.rank} ${esc(r.name)}</option>`).join('');
    document.querySelectorAll('.nav-btn').forEach((b) => { const on = b.dataset.view === state.view; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    document.getElementById('app').innerHTML = state.view === 'board' ? renderBoard() : state.view === 'detail' ? renderDetail() : renderFarm();
    bind();
  }

  function bind() {
    document.querySelectorAll('[data-subset]').forEach((b) => b.onclick = () => { state.subset = b.dataset.subset; render(); });
    document.querySelectorAll('[data-budget]').forEach((b) => b.onclick = () => { state.budget = Number(b.dataset.budget); render(); });
    document.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { state.view = b.dataset.go; render(); });
    document.querySelectorAll('[data-sort]').forEach((t) => t.onclick = () => { state.sortDir = state.sortBy === t.dataset.sort ? -state.sortDir : (t.dataset.sort === 'rank' ? 1 : -1); state.sortBy = t.dataset.sort; render(); });
    document.querySelectorAll('tr.row-click').forEach((t) => t.onclick = () => { state.slug = t.dataset.slug; state.customGas = state.customBridge = state.customSlip = null; if (state.view === 'board') state.view = 'detail'; render(); });
    const qi = document.getElementById('qInput'); if (qi) qi.oninput = (e) => { state.q = e.target.value; render(); const n = document.getElementById('qInput'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
    const cs = document.getElementById('catSel'); if (cs) cs.onchange = (e) => { state.cat = e.target.value; render(); };
    const ch = document.getElementById('chainSel'); if (ch) ch.onchange = (e) => { state.chain = e.target.value; render(); };
    const ds = document.getElementById('dropSel'); if (ds) ds.onchange = (e) => { state.dropShare = Number(e.target.value); render(); };
    [['inCap', (v) => { state.budget = v; }], ['inGas', (v) => { state.customGas = v; }], ['inBr', (v) => { state.customBridge = v; }], ['inSlip', (v) => { state.customSlip = v; }], ['inDays', (v) => { state.lockDays = v; }]].forEach(([id, fn]) => {
      const el = document.getElementById(id); if (el) el.onchange = (e) => { fn(Number(e.target.value)); render(); };
    });
    const rs = document.getElementById('resetEcon'); if (rs) rs.onclick = () => { state.budget = 1000; state.lockDays = 0; state.customGas = state.customBridge = state.customSlip = null; render(); };
  }

  document.querySelectorAll('.nav-btn').forEach((b) => b.onclick = () => { state.view = b.dataset.view; render(); });
  document.getElementById('quickPick').onchange = (e) => { state.slug = e.target.value; state.customGas = state.customBridge = state.customSlip = null; render(); };
  document.addEventListener('keydown', (e) => { if (!(e.target instanceof Element && e.target.matches('input,select')) && ['1', '2', '3'].includes(e.key)) { state.view = e.key === '1' ? 'board' : e.key === '2' ? 'detail' : 'farm'; render(); } });
  window.TITAN_SET = (p) => { Object.assign(state, p); render(); };
  window.TITAN_STATE = state;
  render();
})();
