(function () {
const R = window.RADAR;
if (!R) return;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => n == null || !Number.isFinite(n) ? 'n/a' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`;
const state = {
view: 'radar',
dtab: 'overview',
q: '',
cat: '',
chain: '',
ev: '',
wlOnly: false,
sortK: 'rank',
sortAsc: true,
selSlug: R.rows[0]?.slug || null,
cmp: [],
auditQ: '',
auditSt: '',
};
function runLiveChecks() {
const slugs = new Set(R.rows.map((r) => r.slug));
const unique = slugs.size === R.rows.length;
const wlCnt = R.rows.filter((r) => r.is_watchlist).length;
const auditSum = Object.values(R.audit_summary || {}).reduce((a, b) => a + b, 0);
const boundsOk = R.rows.every((r) => r.interval_80_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.interval_80_high_usd);
const monoOk = R.rows.every((r, i) => i === 0 || (r.rank === i + 1 && r.implied_value_usd <= R.rows[i - 1].implied_value_usd));
const nonNeg = R.rows.every((r) => r.gas_4w_usd >= 0 && r.min_stake_usd > 0 && r.implied_value_usd > 0);
const live = [
{ name: 'Watchlist Coverage', ok: wlCnt === R.watchlist_size, detail: `${wlCnt}/${R.watchlist_size}` },
{ name: '758-Row Audit Sum', ok: auditSum === R.total_protocols && R.audit_rows.length === R.total_protocols, detail: `${auditSum}/${R.total_protocols}` },
{ name: 'Unique Board Slugs', ok: unique, detail: `${slugs.size}/${R.rows.length}` },
{ name: '80% Interval Ordering', ok: boundsOk, detail: boundsOk ? 'low <= implied <= high' : 'Violation' },
{ name: 'Rank Monotonicity', ok: monoOk, detail: monoOk ? 'Strict 1..N' : 'Inversion' },
{ name: 'Positive Values & Costs', ok: nonNeg, detail: nonNeg ? 'All >0 / >=0' : 'Invalid' },
];
return [...live, ...(R.integrity_checks || []).slice(6).map((c) => ({ name: c.name, ok: c.passed, detail: c.detail }))];
}
const checks = runLiveChecks();
const passCnt = checks.filter((c) => c.ok).length;
document.getElementById('int-cnt').textContent = `${passCnt}/${checks.length}`;
document.getElementById('meta').textContent = `as_of ${R.as_of} | ${R.model_version} | ${R.board_size} ranked (${R.watchlist_size} watchlist, ${R.early_size} early) | ${R.total_protocols} total audited | Spot mcap proxy (no TGE odds)`;
document.getElementById('kpis').innerHTML = [
['Ranked Board', `${R.board_size} rows (${R.watchlist_size} WL)`],
['Model Fit (U1 Comps)', `Huber(${R.huber_intercept.toFixed(2)}, ${R.huber_slope.toFixed(3)}) + EB`],
['OOF 80% Conformal', `Dense ±${R.oof_q80_dense_log} | Sparse ±${R.oof_q80_sparse_log} ln`],
['Live Integrity', `${passCnt}/${checks.length} PASS (${R.live_size} U1 comps)`],
].map(([l, v]) => `<div class="kpi"><div class="lbl">${esc(l)}</div><div class="val">${esc(v)}</div></div>`).join('');
const cats = [...new Set(R.rows.map((r) => r.category || 'Uncategorized'))].sort();
const chains = [...new Set(R.rows.map((r) => r.routed_chain))].sort();
document.getElementById('f-cat').innerHTML += cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
document.getElementById('f-chain').innerHTML += chains.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
const statuses = [...new Set(R.audit_rows.map((r) => r.status))].sort();
document.getElementById('audit-st').innerHTML += statuses.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
function getFiltered() {
const q = state.q.trim().toLowerCase();
return R.rows.filter((r) => {
if (state.wlOnly && !r.is_watchlist) return false;
if (state.cat && (r.category || 'Uncategorized') !== state.cat) return false;
if (state.chain && r.routed_chain !== state.chain) return false;
if (state.ev && r.evidence_tier !== state.ev) return false;
if (q && !`${r.name} ${r.slug} ${r.category || ''} ${r.routed_chain} ${r.chains.join(' ')}`.toLowerCase().includes(q)) return false;
return true;
}).sort((a, b) => {
const av = a[state.sortK], bv = b[state.sortK];
const d = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''));
return state.sortAsc ? d : -d;
});
}
function renderDetail(row) {
const el = document.getElementById('detail-body');
if (!row) { el.innerHTML = '<p class="mut">No protocol selected.</p>'; return; }
if (state.dtab === 'overview') {
el.innerHTML = `<h2>#${row.rank} ${esc(row.name)}</h2>
<div>
<span class="pill">${esc(row.category || 'Uncategorized')}</span>
<span class="pill">${esc(row.evidence_tier)}</span>
<span class="pill">T${row.gas_tier}: ${esc(row.routed_chain)}</span>
${row.is_watchlist ? '<span class="pill ok">Watchlist</span>' : ''}
${row.eligibility_warning ? `<span class="pill warn">${esc(row.eligibility_warning)}</span>` : ''}
</div>
<div class="box">
<strong>Implied Value: ${fmt(row.implied_value_usd)}</strong> (80% OOF Band: ${fmt(row.interval_80_low_usd)} – ${fmt(row.interval_80_high_usd)})<br/>
Bootstrap Rank P10–P90: #${row.rank_p10}–#${row.rank_p90} (${row.top10_freq_pct}% in Top-10 across 100 resamples; sensitivity only, not launch odds).
</div>
<h3>Separated Farm Plan (Fact vs Inference vs Scenario)</h3>
<div class="box">
<div><strong>Observed:</strong> ${esc(row.farm.observed_facts)}</div>
<div><strong>Inferred Archetype:</strong> ${esc(row.farm.inferred_archetype)} (Collateral: ${esc(row.farm.collateral)})</div>
<div><strong>Scenario Assumptions:</strong> ${esc(row.farm.scenario_assumptions)}</div>
<div><strong>Unknowns:</strong> ${esc(row.farm.unknown_requirements)}</div>
</div>
<ol class="steps">${row.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<h3>Hypothetical Economics Calculator</h3>
<div class="box">
<div class="kv">
<label>Capital ($)<input id="ec-cap" aria-label="Committed capital USD" type="number" min="1" value="${row.farm.min_stake_usd}" /></label>
<label>Gas 4w ($)<input id="ec-gas" aria-label="4-week gas USD" type="number" min="0" step="0.1" value="${row.farm.gas_4w_usd}" /></label>
<label>Bridge + Exit ($)<input id="ec-br" aria-label="Bridge and exit cost USD" type="number" min="0" step="0.5" value="2" /></label>
<label>Lockup (days)<input id="ec-days" aria-label="Lockup days" type="number" min="1" value="${row.farm.lockup_days}" /></label>
</div>
<div id="ec-out" class="mut" style="margin-top:8px"></div>
<div class="mut" style="margin-top:4px"><strong>No-Action Alternative:</strong> Hold risk-free yield (~4.5% APR) with $0 gas drag and zero smart-contract/slashing risk if capital &lt; min viable floor.</div>
</div>`;
const calc = () => {
const cap = Math.max(0, Number(document.getElementById('ec-cap').value));
const gasRaw = Number(document.getElementById('ec-gas').value);
const brRaw = Number(document.getElementById('ec-br').value);
const daysRaw = Number(document.getElementById('ec-days').value);
if (![cap, gasRaw, brRaw, daysRaw].every(Number.isFinite) || cap <= 0 || gasRaw < 0 || brRaw < 0 || daysRaw < 0) {
document.getElementById('ec-out').textContent = 'Enter valid non-negative numbers and positive capital (> $0).';
return;
}
const gas = gasRaw, br = brRaw, days = daysRaw;
const opp = +(cap * row.farm.opp_cost_apr * (days / 365)).toFixed(2);
const tot = +(gas + br + opp).toFixed(2);
const drag = +((tot / cap) * 100).toFixed(2);
const min5 = Math.ceil((gas + br) / 0.05);
document.getElementById('ec-out').innerHTML = `Total Hypothetical Cost: <strong>$${tot}</strong> (Gas $${gas} + Bridge/Exit $${br} + Opp $${opp}) | Break-even Gross Reward: <strong>$${tot}</strong> | Cost % Capital: <strong>${drag}%</strong> | Min Capital (&lt;5% tx drag): <strong>$${min5}</strong>`;
};
['ec-cap', 'ec-gas', 'ec-br', 'ec-days'].forEach((id) => document.getElementById(id).addEventListener('input', calc));
calc();
} else if (state.dtab === 'peers') {
const m = row.model;
const peers = R.comparables.filter((c) => c.category === row.category || c.super_cat === m.super_cat).slice(0, 6);
el.innerHTML = `<h2>Model &amp; Comparable Evidence: ${esc(row.name)}</h2>
<div class="box">
<strong>Equation:</strong> ln(Implied) = ${R.huber_intercept.toFixed(4)} + ${m.huber_slope.toFixed(4)}·ln(TVL) + EB(${m.eb_log_offset.toFixed(4)}) + C2(${m.c2_log_adj.toFixed(4)})<br/>
SuperCat: <strong>${esc(m.super_cat)}</strong> (${row.n_sup_comps} peers) | Category Comps: <strong>${row.n_cat_comps}</strong> | EB Mult: ${m.eb_multiplier}x
</div>
<h3>Actual U1 Training Peers (${esc(row.category || m.super_cat)})</h3>
<table><thead><tr><th>Peer</th><th>Cat</th><th>TVL (Fam)</th><th>Mcap</th></tr></thead>
<tbody>${peers.map((p) => `<tr><td>${esc(p.name)}${p.family_aggregated ? ' *' : ''}</td><td>${esc(p.category)}</td><td>${fmt(p.tvl_family)}</td><td>${fmt(p.mcap_usd)}</td></tr>`).join('')}</tbody></table>
<p class="mut">* Family-aggregated TVL across split-TVL sibling entries.</p>`;
} else {
el.innerHTML = `<h2>Counterfactual Scenario Simulator: ${esc(row.name)}</h2>
<p class="mut">Uses exact F1 math. Outputs are <strong>hypothetical scenarios, NOT forecasts</strong>.</p>
<div class="box kv">
<label>TVL Shock (%)<input id="sim-tvl" type="number" value="0" min="-95" max="1000" /></label>
<label>7d Growth (%)<input id="sim-g" type="number" value="${row.change_7d ?? 0}" min="-100" max="500" /></label>
<label>Age (days)<input id="sim-age" type="number" value="${row.age_days ?? 365}" min="0" max="3650" /></label>
<label>EB Offset<select id="sim-eb"><option value="1">With SuperCat EB</option><option value="0">Global Huber Only</option></select></label>
</div>
<div id="sim-out" class="box"></div>`;
const runSim = () => {
const tvlShk = Number(document.getElementById('sim-tvl').value);
const gRaw = Number(document.getElementById('sim-g').value);
const age = Number(document.getElementById('sim-age').value);
const useEb = document.getElementById('sim-eb').value === '1';
if (![tvlShk, gRaw, age].every(Number.isFinite) || tvlShk <= -100) {
document.getElementById('sim-out').textContent = 'Invalid non-finite or <= -100% TVL shock.';
return;
}
const simTvl = Math.max(1, row.tvl_usd * (1 + tvlShk / 100));
const g = Math.max(-1, Math.min(1, gRaw / 100));
const m = Math.max(-1, Math.min(1, (Math.max(0, age) - 365) / 365));
const eb = useEb ? row.model.eb_log_offset : 0;
const pred = Math.max(1, Math.round(Math.exp(R.huber_intercept + row.model.huber_slope * Math.log(simTvl) + eb + 0.05 * (0.5 * g + 0.5 * m))));
const simRank = R.rows.filter((x) => x.slug !== row.slug && x.implied_value_usd > pred).length + 1;
document.getElementById('sim-out').innerHTML = `Scenario TVL: <strong>${fmt(simTvl)}</strong><br/>Scenario Implied: <strong>${fmt(pred)}</strong> (Baseline ${fmt(row.implied_value_usd)})<br/>Counterfactual Rank: <strong>#${simRank}</strong> (Baseline #${row.rank})`;
};
['sim-tvl', 'sim-g', 'sim-age', 'sim-eb'].forEach((id) => document.getElementById(id).addEventListener('input', runSim));
runSim();
}
}
function renderRadar() {
const list = getFiltered();
document.getElementById('row-cnt').textContent = `${list.length} of ${R.rows.length} rows`;
const tb = document.getElementById('tbody');
if (!list.length) {
tb.innerHTML = '<tr><td colspan="9" class="mut">No protocols match current filters. Click Reset to restore all rows.</td></tr>';
renderDetail(null);
return;
}
if (!list.some((r) => r.slug === state.selSlug)) state.selSlug = list[0].slug;
tb.innerHTML = list.map((r) => `<tr data-slug="${esc(r.slug)}" class="${r.slug === state.selSlug ? 'sel' : ''}">
<td>${r.rank}</td>
<td><strong>${esc(r.name)}</strong>${r.is_watchlist ? ' <span class="pill ok">WL</span>' : ''}${r.eligibility_warning ? ` <span class="pill warn">!</span>` : ''}</td>
<td>${esc(r.category || '-')}</td>
<td>${esc(r.routed_chain)} (T${r.gas_tier})</td>
<td>${fmt(r.tvl_usd)}</td>
<td><strong>${fmt(r.implied_value_usd)}</strong><div class="mut">${fmt(r.interval_80_low_usd)} – ${fmt(r.interval_80_high_usd)}</div></td>
<td>$${r.gas_4w_usd} / $${r.min_stake_usd}</td>
<td>#${r.rank_p10}–#${r.rank_p90}</td>
<td><button type="button" class="btn cmp-btn" data-cmp="${esc(r.slug)}">${state.cmp.includes(r.slug) ? 'Pinned' : '+'}</button></td>
</tr>`).join('');
tb.querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', (e) => {
if (e.target.closest('.cmp-btn')) return;
state.selSlug = tr.dataset.slug;
renderRadar();
}));
tb.querySelectorAll('.cmp-btn').forEach((b) => b.addEventListener('click', (e) => {
e.stopPropagation();
const s = b.dataset.cmp;
if (state.cmp.includes(s)) state.cmp = state.cmp.filter((x) => x !== s);
else if (state.cmp.length < 4) state.cmp.push(s);
document.getElementById('cmp-cnt').textContent = String(state.cmp.length);
renderRadar();
}));
renderDetail(list.find((r) => r.slug === state.selSlug));
}
function renderCompare() {
const items = state.cmp.map((s) => R.rows.find((r) => r.slug === s)).filter(Boolean);
const el = document.getElementById('cmp-body');
if (!items.length) { el.innerHTML = '<p class="mut">Pin up to 4 protocols from the Radar table using "+" to compare them here.</p>'; return; }
const metrics = [
['Rank', (r) => `#${r.rank} (Boot #${r.rank_p10}–#${r.rank_p90})`],
['Implied Value', (r) => fmt(r.implied_value_usd)],
['80% OOF Band', (r) => `${fmt(r.interval_80_low_usd)} – ${fmt(r.interval_80_high_usd)}`],
['Evidence Tier', (r) => `${r.evidence_tier} (${r.n_cat_comps} comps)`],
['TVL', (r) => fmt(r.tvl_usd)],
['Category', (r) => r.category || '-'],
['Routed Chain', (r) => `${r.routed_chain} (Tier ${r.gas_tier})`],
['Min Stake / 4w Gas', (r) => `$${r.min_stake_usd} / $${r.gas_4w_usd}`],
['Lockup / Risks', (r) => `${r.farm.lockup_days}d | ${r.farm.unknown_requirements}`],
];
el.innerHTML = `<table><thead><tr><th>Metric</th>${items.map((r) => `<th>${esc(r.name)}</th>`).join('')}</tr></thead>
<tbody>${metrics.map(([lbl, fn]) => `<tr><td><strong>${esc(lbl)}</strong></td>${items.map((r) => `<td>${esc(fn(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function renderAudit() {
document.getElementById('audit-sum').innerHTML = Object.entries(R.audit_summary || {}).map(([k, v]) => `<div class="kpi"><div class="lbl">${esc(k)}</div><div class="val">${v}</div></div>`).join('');
const q = state.auditQ.trim().toLowerCase();
const list = R.audit_rows.filter((r) => (!state.auditSt || r.status === state.auditSt) && (!q || `${r.slug} ${r.name} ${r.status}`.toLowerCase().includes(q)));
document.getElementById('audit-tb').innerHTML = list.map((r) => `<tr><td>${esc(r.slug)}</td><td>${esc(r.name)}</td><td>${esc(r.category || '-')}</td><td>${fmt(r.tvl_usd)}</td><td>${fmt(r.mcap_usd)}</td><td><span class="pill">${esc(r.status)}</span></td><td>${esc(r.reason)}</td></tr>`).join('');
}
function renderIntegrity() {
document.getElementById('int-body').innerHTML = `<table><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
<tbody>${checks.map((c) => `<tr><td>${esc(c.name)}</td><td><span class="pill ${c.ok ? 'ok' : 'bad'}">${c.ok ? 'PASS' : 'FAIL'}</span></td><td>${esc(c.detail)}</td></tr>`).join('')}</tbody></table>`;
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
state.view = t.dataset.view;
document.querySelectorAll('.tab').forEach((x) => { x.classList.toggle('active', x === t); x.setAttribute('aria-pressed', String(x === t)); });
document.querySelectorAll('.view').forEach((v) => { const on = v.id === `view-${state.view}`; v.classList.toggle('active', on); v.hidden = !on; });
if (state.view === 'compare') renderCompare();
if (state.view === 'audit') renderAudit();
if (state.view === 'integrity') renderIntegrity();
}));
document.querySelectorAll('.stab').forEach((t) => t.addEventListener('click', () => {
state.dtab = t.dataset.dtab;
document.querySelectorAll('.stab').forEach((x) => x.classList.toggle('active', x === t));
renderDetail(getFiltered().find((r) => r.slug === state.selSlug) || null);
}));
document.querySelectorAll('.srt').forEach((b) => b.addEventListener('click', () => {
const k = b.dataset.k;
state.sortAsc = state.sortK === k ? !state.sortAsc : k === 'rank' || k === 'name' || k === 'gas_4w_usd';
state.sortK = k;
document.querySelectorAll('.srt').forEach((x) => x.classList.toggle('on', x === b));
renderRadar();
}));
document.getElementById('q').addEventListener('input', (e) => { state.q = e.target.value; renderRadar(); });
document.getElementById('f-cat').addEventListener('change', (e) => { state.cat = e.target.value; renderRadar(); });
document.getElementById('f-chain').addEventListener('change', (e) => { state.chain = e.target.value; renderRadar(); });
document.getElementById('f-ev').addEventListener('change', (e) => { state.ev = e.target.value; renderRadar(); });
document.getElementById('btn-wl').addEventListener('click', (e) => {
state.wlOnly = !state.wlOnly;
e.target.classList.toggle('active', state.wlOnly);
e.target.setAttribute('aria-pressed', String(state.wlOnly));
renderRadar();
});
document.getElementById('btn-reset').addEventListener('click', () => {
state.q = ''; state.cat = ''; state.chain = ''; state.ev = ''; state.wlOnly = false; state.sortK = 'rank'; state.sortAsc = true;
['q', 'f-cat', 'f-chain', 'f-ev'].forEach((id) => { document.getElementById(id).value = ''; });
const wlBtn = document.getElementById('btn-wl');
wlBtn.classList.remove('active');
wlBtn.setAttribute('aria-pressed', 'false');
document.querySelectorAll('.srt').forEach((x) => x.classList.toggle('on', x.dataset.k === 'rank'));
renderRadar();
});
document.getElementById('btn-cmp-clear').addEventListener('click', () => { state.cmp = []; document.getElementById('cmp-cnt').textContent = '0'; renderCompare(); renderRadar(); });
document.getElementById('audit-q').addEventListener('input', (e) => { state.auditQ = e.target.value; renderAudit(); });
document.getElementById('audit-st').addEventListener('change', (e) => { state.auditSt = e.target.value; renderAudit(); });
renderRadar();
})();
