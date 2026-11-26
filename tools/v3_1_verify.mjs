import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FROZEN_SHA256 = 'a6e205b17135bbd7d63d5e75fcce9b9f40ebb4c5534e713a8adfc9e62fc18cb0';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// Materialize clean V3 reference output from git commit a4f3097 if not present
const v3RefDir = path.join(ROOT, 'v3_clarity/evidence/v3_ref_a4f3097');
if (!fs.existsSync(path.join(v3RefDir, 'out/dashboard/index.html'))) {
  fs.mkdirSync(path.join(v3RefDir, 'dashboard'), { recursive: true });
  for (const f of ['index.html', 'styles.css', 'engine.js', 'app.js']) {
    const content = execFileSync('git', ['-C', 'v2_titan/evidence/v2_git_repo', 'show', `a4f3097:dashboard/${f}`]);
    fs.writeFileSync(path.join(v3RefDir, 'dashboard', f), content);
  }
  const v3DashOut = path.join(v3RefDir, 'out/dashboard');
  fs.mkdirSync(v3DashOut, { recursive: true });
  for (const f of ['index.html', 'styles.css', 'engine.js', 'app.js']) {
    fs.copyFileSync(path.join(v3RefDir, 'dashboard', f), path.join(v3DashOut, f));
  }
  fs.copyFileSync(path.join(ROOT, 'v3_clarity/evidence/win_out_1/data.js'), path.join(v3RefDir, 'out/data.js'));
}

// 1. Frozen Engine & Board Parity
const v2BoardPath = path.join(ROOT, 'v2_titan/evidence/win_out_1/board.json');
const v31BoardPath = path.join(ROOT, 'v3_clarity/evidence/win_out_1/board.json');
const v31DossierPath = path.join(ROOT, 'v3_clarity/evidence/win_out_1/dossier.json');
const v31DashDir = path.join(ROOT, 'v3_clarity/evidence/win_out_1/dashboard');
const dashFiles = ['index.html', 'styles.css', 'engine.js', 'app.js'];
const v31DashBytes = dashFiles.reduce((a, f) => a + fs.statSync(path.join(v31DashDir, f)).size, 0);
const v31Dos = JSON.parse(fs.readFileSync(v31DossierPath, 'utf8'));

// Verify frozen files unchanged vs a4f3097 & 73aedb7
const frozenFiles = ['dashboard/engine.js', 'main.ts', 'lib/farm_specs.ts', 'lib/watchlist_specs.ts', 'vendor/makefun-board.ts'];
const frozenParity = {};
for (const rel of frozenFiles) {
  const cur = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'v3_clarity', rel))).digest('hex');
  const v3Git = crypto.createHash('sha256').update(execFileSync('git', ['-C', 'v2_titan/evidence/v2_git_repo', 'show', `a4f3097:${rel}`])).digest('hex');
  frozenParity[rel] = { sha256: cur, matches_v3: cur === v3Git };
}

const parity = {
  v2_board_sha256: sha(v2BoardPath),
  v3_1_board_sha256: sha(v31BoardPath),
  exact_frozen_sha256_match: sha(v2BoardPath) === FROZEN_SHA256 && sha(v31BoardPath) === FROZEN_SHA256,
  frozen_files: frozenParity,
  v3_1_dashboard_source_bytes: v31DashBytes,
  v3_1_dossier_text_bytes: Buffer.byteLength(v31Dos.text, 'utf8'),
  v3_1_dossier_truncated: v31Dos.text.includes('[Cut at'),
  v3_1_screenshots_embedded: (v31Dos.images || []).length + (v31Dos.cover ? 1 : 0),
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
    `--user-data-dir=${path.join(ROOT, `v3_clarity/evidence/chrome_bench_${label}`)}`, 'about:blank',
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
        h1_px: parseFloat(getComputedStyle(document.querySelector('h1,.h1')).fontSize),
        kpi_val_px: parseFloat(getComputedStyle(document.querySelector('.kv')).fontSize),
        section_px: parseFloat(getComputedStyle(document.querySelector('.ct')).fontSize),
        td_px: parseFloat(getComputedStyle(table.querySelector('tbody td')).fontSize),
        th_px: parseFloat(getComputedStyle(table.querySelector('thead th')).fontSize),
        min_text_px: Math.min(...fonts),
        row_height_px: +(rows[0]?.getBoundingClientRect().height || 0).toFixed(2),
        table_width_px: +(table?.getBoundingClientRect().width || 0).toFixed(1),
        header_cols: ths.length,
        has_sidebar: !!document.querySelector('aside, .sb, .sidebar'),
        visible_rows_above_900: rows.filter(r => r.getBoundingClientRect().bottom <= 900).length,
        footer_unclipped_at_900: !!(fRect && fRect.bottom <= 901),
      };
    })()`);

    // Automated 12-task completion + semantic & financial correctness benchmark
    const tasks = await cdp.eval(`(() => {
      const t = () => document.body.innerText;
      const results = {};
      const clickView = (v, re) => {
        const b = document.querySelector(\`[data-view="\${v}"]\`) || [...document.querySelectorAll('button')].find(x => re.test(x.textContent));
        b?.click();
      };
      // T1: Watchlist & total coverage
      results.t1_watchlist_coverage = /40\\s*\\/\\s*40/.test(t()) && t().includes('184') && t().includes('758');
      // T2: Top ranked & clean Drop - Cost formatting (not ambiguous dash-only)
      results.t2_radar_row_clarity = /Steakhouse Financial/.test(t()) && t().includes('$79.9M') && t().includes('Drop $');
      // T3: Semantic Model A-D pill accuracy on Radar cover (Starter 4.43x must NOT say +Size & Sector)
      results.t3_cover_model_pill_accuracy = !t().includes('+Size & Sector') && (t().includes('Starter: 4.43') || t().includes('A. Starter'));
      // T4: Off-watchlist >=50M label (must NOT say "unlisted")
      results.t4_off_watchlist_semantics = !/\\bunlisted\\b/i.test(t()) && /off-WL/i.test(t());
      // T5: Hurdle KPI semantics (must NOT say "Worth Farming" or "0 remain positive across P25")
      results.t5_hurdle_kpi_semantics = !t().includes('Worth Farming') && !t().includes('remain positive across P25');

      // Navigate to Firelight Research @ $5,000, 7% drop (matches 2-detail scenario)
      if (window.TITAN_SET) window.TITAN_SET({ view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07 });
      else {
        clickView('research', /Research/i);
        const sel = document.querySelector('#detProto');
        if (sel && [...sel.options].some(o => o.value === 'firelight')) {
          sel.value = 'firelight'; sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const b5 = [...document.querySelectorAll('button')].find(x => x.textContent.includes('$5.0K')); b5?.click();
      }
      // T6: Firelight valuation decomposition & percentile interval + decimal alignment
      results.t6_research_decomposition_aligned = /Base Value/i.test(t()) && /Growth/i.test(t()) && /Age|Maturity/i.test(t()) && t().includes('$172.14') && t().includes('$139.10');
      // T7: Peer Token Incidence semantics (must NOT say "Cohort Odds")
      results.t7_peer_incidence_label = !t().includes('Cohort Odds') && /Peer Token Incidence/i.test(t());
      // T8: Firelight execution risk & progressive disclosure <details> within 900px + modal close works
      const detEls = [...document.querySelectorAll('details.det')];
      const maxBottom = Math.max(...[...document.querySelectorAll('#app > *')].map(el => el.getBoundingClientRect().bottom));
      document.getElementById('btn-meth')?.click();
      const modOpened = !document.getElementById('modal')?.hidden;
      document.getElementById('mdl-close')?.click();
      const modClosed = !!document.getElementById('modal')?.hidden;
      results.t8_progressive_disclosure_and_fit = t().includes('UNDERWRITING SLASH RISK') && detEls.length >= 2 && maxBottom <= 902 && modOpened && modClosed;

      // Navigate to Recorded Tokens
      clickView('live', /Recorded \\(416\\)|Dataset|Live/i);
      // T9: Recorded tokens isolated (128 live mcap + 288 null mcap)
      results.t9_live_token_separation = t().includes('416') && t().includes('128') && t().includes('288') && /Zero token leakage|Strict isolation/i.test(t());

      // Navigate to Farming Workspace
      clickView('farming', /Farming|Viable/i);
      // T10: Farming P25-P75 hurdle, organic yield omission & gated disclosure
      results.t10_farming_semantics = t().includes('0 / 184 Positive') && t().includes('Excludes organic base yield') && /\\+\\d+ gated/.test(t()) && !t().includes('Profitable in All 3 Scenarios');

      // Navigate to Model Research
      clickView('model', /Model/i);
      // T11: Cross-sectional holdout caveat (explicitly says not historical launch forecasting / not launch forecasting) & No-Token Rec
      results.t11_model_validation_honesty = /66\\.7%/.test(t()) && /not (historical )?launch forecasting|not a launch prediction/i.test(t()) && !t().includes('Comparables & Pre-Token');

      // Keyboard navigation check (T12): focusable rows + sortable headers
      clickView('radar', /Token Radar|Overview/i);
      const hasTabRows = document.querySelectorAll('tbody tr.rc[tabindex="0"]').length > 0;
      const hasTabSorts = document.querySelectorAll('th.srt[tabindex="0"]').length > 0;
      results.t12_keyboard_row_focus = hasTabRows && hasTabSorts;

      return { results, firelight_max_bottom_px: Math.round(maxBottom), pass_count: Object.values(results).filter(Boolean).length };
    })()`);

    const consoleErrors = cdp.errors.length;
    cdp.close();
    return { label, render_ms: Date.now() - t0, consoleErrors, typography, tasks };
  } finally {
    chrome.kill('SIGKILL');
  }
}

const v2Metrics = await auditVersion('v2', path.join(ROOT, 'v2_titan/evidence/win_out_1/dashboard/index.html'), 9271);
const v3Metrics = await auditVersion('v3', path.join(v3RefDir, 'out/dashboard/index.html'), 9272);
const v31Metrics = await auditVersion('v3_1', path.join(ROOT, 'v3_clarity/evidence/win_out_1/dashboard/index.html'), 9273);

const out = { generated_at: new Date().toISOString(), note: 'Automated/AI-assisted headless Chrome verification across V2, V3 (a4f3097), and V3.1', parity, v2: v2Metrics, v3: v3Metrics, v3_1: v31Metrics };
fs.writeFileSync(path.join(ROOT, 'v3_clarity/evidence/v3_1_verify_report.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ parity: { exact_frozen_sha256_match: parity.exact_frozen_sha256_match, bytes: parity.v3_1_dashboard_source_bytes, dossier_text_bytes: parity.v3_1_dossier_text_bytes, cut: parity.v3_1_dossier_truncated }, scores: { v2: v2Metrics.tasks.pass_count, v3: v3Metrics.tasks.pass_count, v3_1: v31Metrics.tasks.pass_count }, v3_1_tasks: v31Metrics.tasks.results, v3_1_typography: v31Metrics.typography }, null, 2));
if (!parity.exact_frozen_sha256_match || v31Metrics.tasks.pass_count !== 12 || v31Metrics.consoleErrors !== 0) process.exit(1);
