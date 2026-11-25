import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FROZEN_SHA256 = 'a6e205b17135bbd7d63d5e75fcce9b9f40ebb4c5534e713a8adfc9e62fc18cb0';

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// 1. Frozen board parity check
const v2BoardPath = path.join(ROOT, 'v2_titan/evidence/win_out_1/board.json');
const v3BoardPath = path.join(ROOT, 'v3_clarity/evidence/win_out_1/board.json');
const v2DossierPath = path.join(ROOT, 'v2_titan/evidence/win_out_1/dossier.json');
const v3DossierPath = path.join(ROOT, 'v3_clarity/evidence/win_out_1/dossier.json');

const v2BoardHash = sha(v2BoardPath);
const v3BoardHash = sha(v3BoardPath);
const v3Board = JSON.parse(fs.readFileSync(v3BoardPath, 'utf8'));
const v2Board = JSON.parse(fs.readFileSync(v2BoardPath, 'utf8'));
const v3DashDir = path.join(ROOT, 'v3_clarity/evidence/win_out_1/dashboard');
const v3DashBytes = ['index.html', 'styles.css', 'engine.js', 'app.js'].reduce(
  (a, f) => a + fs.statSync(path.join(v3DashDir, f)).size, 0
);
const v3Dos = JSON.parse(fs.readFileSync(v3DossierPath, 'utf8'));
const v2Dos = JSON.parse(fs.readFileSync(v2DossierPath, 'utf8'));

const parity = {
  v2_board_sha256: v2BoardHash,
  v3_board_sha256: v3BoardHash,
  exact_frozen_sha256_match: v2BoardHash === FROZEN_SHA256 && v3BoardHash === FROZEN_SHA256,
  ranked_rows: v3Board.rows?.length ?? v3Board.board?.length,
  rows_equal: JSON.stringify(v2Board) === JSON.stringify(v3Board),
  v3_dashboard_source_bytes: v3DashBytes,
  v3_source_headroom_vs_64k: 65536 - v3DashBytes,
  v3_screenshots_embedded: (v3Dos.images || []).length + (v3Dos.cover ? 1 : 0),
};

// 2. Live CDP usability & readability benchmark comparing V2 vs V3
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    };
  }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  }
  close() { this.ws.close(); }
}

async function waitWs(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((x) => x.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Chrome DevTools timeout');
}

async function auditVersion(label, htmlPath, port) {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(ROOT, `v3_clarity/evidence/chrome_bench_${label}`)}`,
    'about:blank',
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
      const minFont = Math.min(...fonts);
      const table = document.querySelector('.tc table') || document.querySelector('table');
      const rows = [...(table?.querySelectorAll('tbody tr') || [])];
      const ths = [...(table?.querySelectorAll('thead th') || [])];
      const stackedHeaderOrCellRatio = rows.length ? rows[0].querySelectorAll('td .xs, td .sub').length : 0;
      return {
        h1_px: parseFloat(getComputedStyle(document.querySelector('h1,.h1')).fontSize),
        kpi_val_px: parseFloat(getComputedStyle(document.querySelector('.kv')).fontSize),
        section_px: parseFloat(getComputedStyle(document.querySelector('.ct')).fontSize),
        td_px: parseFloat(getComputedStyle(table.querySelector('tbody td')).fontSize),
        th_px: parseFloat(getComputedStyle(table.querySelector('thead th')).fontSize),
        min_text_px: minFont,
        row_height_px: +(rows[0]?.getBoundingClientRect().height || 0).toFixed(2),
        table_width_px: +(table?.getBoundingClientRect().width || 0).toFixed(1),
        header_cols: ths.length,
        stacked_sublines_in_row: stackedHeaderOrCellRatio,
        has_sidebar: !!document.querySelector('aside, .sb, .sidebar'),
        visible_rows_above_900: rows.filter(r => r.getBoundingClientRect().bottom <= 900).length,
      };
    })()`);

    // Task completion matrix across 9 usability criteria using each version's own views
    const tasks = await cdp.eval(`(() => {
      const t = () => document.body.innerText;
      const results = {};
      const clickView = (v, re) => {
        const b = document.querySelector(\`[data-view="\${v}"]\`) || [...document.querySelectorAll('button')].find(x => re.test(x.textContent));
        b?.click();
      };
      const s0 = performance.now();
      results.t1_watchlist_coverage = { found: /40\\s*\\/\\s*40/.test(t()) && t().includes('184'), ms: +(performance.now() - s0).toFixed(2) };
      const s1 = performance.now();
      results.t2_top_ranked_protocol = { found: /Steakhouse Financial|Sentora Curator/.test(t()) && t().includes('$79.9M'), ms: +(performance.now() - s1).toFixed(2) };

      clickView('research', /Research/i);
      const sel = document.querySelector('#detProto');
      if (sel && [...sel.options].some(o => o.value === 'firelight')) {
        sel.value = 'firelight'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const s2 = performance.now();
      results.t3_valuation_formula_components = { found: /Growth/i.test(t()) && /Maturity/i.test(t()) && t().includes('Base'), ms: +(performance.now() - s2).toFixed(2) };
      results.t4_uncertainty_range = { found: /(25th|P25).*?(75th|P75)/is.test(t()), ms: +(performance.now() - s2).toFixed(2) };
      results.t5_farming_cost = { found: /(Cash Cost \\(Fees|Operational Cash Cost|Op Cash)/.test(t()) && /(Opportunity Cost|Opp \\()/.test(t()), ms: +(performance.now() - s2).toFixed(2) };
      results.t6_zero_reward_loss = { found: t().includes('Zero-Reward Cost') || t().includes('0% Airdrop'), ms: +(performance.now() - s2).toFixed(2) };
      results.t7_execution_restrictions = { found: t().includes('EXECUTION-GATED') && /Exit/i.test(t()), ms: +(performance.now() - s2).toFixed(2) };

      const s3 = performance.now();
      clickView('live', /Recorded \\(416\\)|Dataset|Live/i);
      results.t8_recorded_tokens_isolated = { found: t().includes('416') && /Zero token leakage|Strict isolation|separated/i.test(t()), ms: +(performance.now() - s3).toFixed(2) };

      const s4 = performance.now();
      clickView('farming', /Farming|Viable/i);
      results.t9_farming_workspace = { found: /TurboFlow Perps|Steakhouse Financial/.test(t()) && t().includes('$10/h'), ms: +(performance.now() - s4).toFixed(2) };
      return results;
    })()`);

    cdp.close();
    return { label, render_ms: Date.now() - t0, typography, tasks };
  } finally {
    chrome.kill('SIGKILL');
  }
}

const v2Metrics = await auditVersion('v2', path.join(ROOT, 'v2_titan/evidence/win_out_1/dashboard/index.html'), 9261);
const v3Metrics = await auditVersion('v3', path.join(ROOT, 'v3_clarity/evidence/win_out_1/dashboard/index.html'), 9262);

const out = { parity, v2: v2Metrics, v3: v3Metrics };
fs.mkdirSync(path.join(ROOT, 'v3_clarity/evidence'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'v3_clarity/evidence/v3_verify_report.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (!parity.exact_frozen_sha256_match || !parity.rows_equal) process.exit(1);
