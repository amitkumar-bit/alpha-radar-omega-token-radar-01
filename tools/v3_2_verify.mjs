import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FROZEN_SHA256 = 'a6e205b17135bbd7d63d5e75fcce9b9f40ebb4c5534e713a8adfc9e62fc18cb0';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const v2Board = path.join(ROOT, 'v2_titan/evidence/win_out_1/board.json');
const v31Board = path.join(ROOT, 'v3_clarity/evidence/win_out_1/board.json');
const v32Board = path.join(ROOT, 'v3_2_production/evidence/win_out_1/board.json');
const v32DosPath = path.join(ROOT, 'v3_2_production/evidence/win_out_1/dossier.json');
const v32Dos = JSON.parse(fs.readFileSync(v32DosPath, 'utf8'));
const v32DashDir = path.join(ROOT, 'v3_2_production/dashboard');
const dashFiles = fs.readdirSync(v32DashDir).sort();
const v32DashBytes = dashFiles.reduce((a, f) => a + fs.statSync(path.join(v32DashDir, f)).size, 0);

const parity = {
  v2_board_sha256: sha(v2Board),
  v3_1_board_sha256: sha(v31Board),
  v3_2_board_sha256: sha(v32Board),
  exact_frozen_sha256_match: sha(v2Board) === FROZEN_SHA256 && sha(v31Board) === FROZEN_SHA256 && sha(v32Board) === FROZEN_SHA256,
  v3_2_dashboard_source_bytes: v32DashBytes,
  v3_2_dossier_text_bytes: Buffer.byteLength(v32Dos.text, 'utf8'),
  v3_2_dossier_truncated: v32Dos.text.includes('[Cut at'),
  v3_2_screenshots_embedded: (v32Dos.images || []).length + (v32Dos.cover !== undefined ? 1 : 0),
};

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0; this.pending = new Map(); this.errors = [];
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error')) {
        this.errors.push(JSON.stringify(m.params));
      }
    };
  }
  async open() { await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); await this.send('Page.enable'); await this.send('Runtime.enable'); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
  close() { this.ws.close(); }
}

async function waitWs(port) {
  for (let i = 0; i < 40; i++) {
    try { const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === 'page'); if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Chrome DevTools timeout');
}

async function auditVersion(label, htmlPath, port) {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(ROOT, `v3_2_production/evidence/chrome_bench_${label}`)}`, 'about:blank',
  ], { stdio: 'ignore' });
  try {
    const cdp = new CDP(await waitWs(port));
    await cdp.open();
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const t0 = Date.now();
    await cdp.send('Page.navigate', { url: `file:///${htmlPath.replace(/\\/g, '/')}` });
    await new Promise((r) => setTimeout(r, 700));

    const typography = await cdp.eval(`(() => {
      const fonts = [...document.querySelectorAll('h1,.h1,.kv,.ct,.card-title,.tc th,.tc td,.ks,.sub,.xs,.ml')].map(el => parseFloat(getComputedStyle(el).fontSize)).filter(n => n > 0);
      const table = document.querySelector('.tc table') || document.querySelector('table');
      const rows = [...(table?.querySelectorAll('tbody tr') || [])];
      const ths = [...(table?.querySelectorAll('thead th') || [])];
      const footer = document.querySelector('.tf');
      const fRect = footer?.getBoundingClientRect();
      return {
        theme_bg: getComputedStyle(document.body).backgroundColor,
        h1_px: parseFloat(getComputedStyle(document.querySelector('h1,.h1')).fontSize),
        kpi_val_px: parseFloat(getComputedStyle(document.querySelector('.kv')).fontSize),
        section_px: parseFloat(getComputedStyle(document.querySelector('.ct, .card-title')).fontSize),
        td_px: parseFloat(getComputedStyle(table.querySelector('tbody td')).fontSize),
        th_px: parseFloat(getComputedStyle(table.querySelector('thead th')).fontSize),
        min_text_px: Math.min(...fonts),
        row_height_px: +(rows[0]?.getBoundingClientRect().height || 0).toFixed(2),
        header_cols: ths.length,
        has_sidebar: !!document.querySelector('aside, .sb, .sidebar'),
        visible_rows_above_900: rows.filter(r => r.getBoundingClientRect().bottom <= 900).length,
        footer_unclipped_at_900: !!(fRect && fRect.bottom <= 901),
      };
    })()`);

    const tasks = await cdp.eval(`(() => {
      const t = () => document.body.innerText;
      const results = {};
      const clickView = (v, re) => {
        const b = document.querySelector(\`[data-view="\${v}"]\`) || [...document.querySelectorAll('button')].find(x => re.test(x.textContent));
        b?.click();
      };
      results.t1_watchlist_coverage = /40\\s*\\/\\s*40/.test(t()) && t().includes('184') && t().includes('758');
      results.t2_radar_row_clarity = /Steakhouse Financial/.test(t()) && t().includes('$79.9M') && t().includes('Drop $');
      results.t3_cover_model_pill_accuracy = !t().includes('+Size & Sector') && (t().includes('Starter: 4.43') || t().includes('A. Starter'));
      results.t4_off_watchlist_semantics = !/\\bunlisted\\b/i.test(t()) && (/off-WL/i.test(t()) || /non-WL/i.test(t()));
      results.t5_hurdle_kpi_semantics = !t().includes('Worth Farming') && !t().includes('remain positive across P25') && !t().includes('+EV');

      if (window.TITAN_SET) window.TITAN_SET({ view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07, orgApr: 0 });
      else {
        clickView('research', /Research/i);
        const sel = document.querySelector('#detProto');
        if (sel && [...sel.options].some(o => o.value === 'firelight')) { sel.value = 'firelight'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        const b5 = [...document.querySelectorAll('button')].find(x => x.textContent.includes('$5.0K')); b5?.click();
      }
      results.t6_research_decomposition_aligned = /Base Value/i.test(t()) && /Growth/i.test(t()) && /Age|Maturity/i.test(t()) && t().includes('$172.14') && t().includes('$139.10');
      results.t7_peer_incidence_label = !t().includes('Cohort Odds') && /Peer Inc|Peer Token Incidence/i.test(t());
      const detEls = [...document.querySelectorAll('details.det')];
      const maxBottom = Math.max(...[...document.querySelectorAll('#app > *')].map(el => el.getBoundingClientRect().bottom));
      document.getElementById('btn-meth')?.click();
      const modOpened = !document.getElementById('modal')?.hidden;
      document.getElementById('mdl-close')?.click();
      const modClosed = !!document.getElementById('modal')?.hidden;
      results.t8_progressive_disclosure_and_fit = t().includes('UNDERWRITING SLASH RISK') && detEls.length >= 2 && maxBottom <= 905 && modOpened && modClosed;

      const orgEl = document.getElementById('orgSel');
      if (orgEl) {
        orgEl.value = '0.04'; orgEl.dispatchEvent(new Event('change', { bubbles: true }));
        results.t14_hypothetical_organic_yield_sensitivity = t().includes('$37.68') && t().includes('-$16.60');
        const orgEl2 = document.getElementById('orgSel');
        orgEl2.value = '0'; orgEl2.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        results.t14_hypothetical_organic_yield_sensitivity = false;
      }

      clickView('live', /Recorded \\(416\\)|Dataset|Live/i);
      results.t9_live_token_separation = t().includes('416') && t().includes('128') && t().includes('288') && /Zero leakage|Zero token leakage|Strict isolation/i.test(t());

      clickView('farming', /Farming|Viable/i);
      const b1k = [...document.querySelectorAll('button')].find(x => x.dataset?.budget === '1000'); b1k?.click();
      results.t10_farming_semantics = t().includes('0 / 184 Positive') && t().includes('Excludes organic base yield') && /\\+\\d+ gated/.test(t()) && !t().includes('Profitable in All 3 Scenarios');

      clickView('model', /Model/i);
      results.t11_model_validation_honesty = /66\\.7%/.test(t()) && /not launch odds|not (historical )?launch forecasting/i.test(t()) && !t().includes('Comparables & Pre-Token');
      results.t13_strict_leakage_and_brier_disclosure = t().includes('61.9%') && t().includes('0.22') && /2\\.020/.test(t()) && /2\\.404/.test(t());

      clickView('radar', /Radar/i);
      results.t12_keyboard_row_focus = document.querySelectorAll('tbody tr.rc[tabindex="0"]').length > 0 && document.querySelectorAll('th.srt[tabindex="0"]').length > 0;

      return { results, firelight_max_bottom_px: Math.round(maxBottom), pass_count: Object.values(results).filter(Boolean).length };
    })()`);

    const consoleErrors = cdp.errors.length;
    cdp.close();
    return { label, render_ms: Date.now() - t0, consoleErrors, typography, tasks };
  } finally {
    chrome.kill('SIGKILL');
  }
}

const v2 = await auditVersion('v2', path.join(ROOT, 'v2_titan/evidence/win_out_1/dashboard/index.html'), 9291);
const v31 = await auditVersion('v3_1', path.join(ROOT, 'v3_clarity/evidence/win_out_1/dashboard/index.html'), 9292);
const v32 = await auditVersion('v3_2', path.join(ROOT, 'v3_2_production/evidence/win_out_1/dashboard/index.html'), 9293);

const out = { generated_at: new Date().toISOString(), note: 'Automated/AI-assisted headless Chrome benchmark across V2 (73aedb7), V3.1 (cfa5297), and V3.2', parity, v2, v3_1: v31, v3_2: v32 };
fs.writeFileSync(path.join(ROOT, 'v3_2_production/evidence/v3_2_verify_report.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ parity, scores: { v2: v2.tasks.pass_count, v3_1: v31.tasks.pass_count, v3_2: v32.tasks.pass_count }, v3_2_tasks: v32.tasks.results, typography_cmp: { v2: v2.typography, v3_1: v31.typography, v3_2: v32.typography } }, null, 2));
if (!parity.exact_frozen_sha256_match || parity.v3_2_dossier_truncated || v32.tasks.pass_count !== 14 || v32.consoleErrors !== 0) process.exit(1);
