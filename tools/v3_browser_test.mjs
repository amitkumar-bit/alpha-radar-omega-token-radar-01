import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_PATH = `file:///${ROOT.replace(/\\/g, '/')}/v3_clarity/evidence/win_out_1/dashboard/index.html`;
const SHOTS_DIR = path.join(ROOT, 'v3_clarity/screenshots');
const PORT = 9251;

fs.mkdirSync(SHOTS_DIR, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, 'v3_clarity/evidence/chrome_tmp')}`,
  'about:blank',
], { stdio: 'ignore' });

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((x) => x.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Chrome DevTools timeout');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error')) {
        this.errors.push(JSON.stringify(m.params));
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
  async shot(outPath) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  }
  close() { this.ws.close(); }
}

const checks = [];
const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

try {
  const cdp = new CDP(await getWs());
  await cdp.open();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: URL_PATH });
  await new Promise((r) => setTimeout(r, 700));

  // 1. Typography + Token Radar + Watchlist + Model D + Row height
  const radarCheck = await cdp.eval(`(() => {
    const cs = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
    const rowH = document.querySelector('tbody tr.rc td')?.getBoundingClientRect().height || 0;
    const txt = document.body.innerText;
    const h1 = cs('h1.h1'), kv = cs('.kv'), ct = cs('.ct'), td = cs('.tbl td'), sub = cs('.ks');
    const lad = window.OMEGA_BOARD.oos.ladder;
    const hasDistinctModels = lad[2].loo_med_mult !== lad[4].loo_med_mult && lad[1].loo_med_mult !== lad[4].loo_med_mult;
    const hasProof = txt.includes('No-Token-Recorded Radar') && txt.includes('Recorded (416)') && txt.includes('Excluded (158)') && txt.includes('40 / 40') && txt.includes('Board Parity 184/184') && !txt.includes('+EV') && !/\\bVIABLE\\b/.test(txt);
    return { h1, kv, ct, td, sub, rowH, hasDistinctModels, hasProof };
  })()`);
  ok('01_Typography_And_Radar_1440x900',
    radarCheck.hasProof && radarCheck.hasDistinctModels && radarCheck.h1 >= 26 && radarCheck.kv >= 26 && radarCheck.ct >= 15 && radarCheck.td >= 13 && radarCheck.sub >= 11.5 && radarCheck.rowH >= 42,
    JSON.stringify(radarCheck));
  await cdp.shot(path.join(SHOTS_DIR, '1-board.png'));

  // 2. Filter sync & empty state
  await cdp.eval(`document.querySelector('[data-subset="early"]').click()`);
  const earlySync = await cdp.eval(`({ slug: window.TITAN_STATE.slug, notTop: window.TITAN_STATE.slug !== 'steakhouse-financial' })`);
  await cdp.eval(`(() => { const q = document.getElementById('qInput'); q.value='nonexistent_xyz_protocol'; q.dispatchEvent(new Event('input')); })()`);
  const emptyCheck = await cdp.eval(`document.getElementById('app').innerText.includes('No protocols match')`);
  await cdp.eval(`document.querySelector('[data-reset="1"]').click()`);
  ok('02_Stale_Selection_Sync_And_Empty_State', earlySync.notTop && emptyCheck, `syncedSlug=${earlySync.slug}, emptyState=${emptyCheck}`);

  // 3. Protocol Research: Firelight @ $5,000, 7%
  await cdp.eval(`window.TITAN_SET({ view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07 })`);
  await new Promise((r) => setTimeout(r, 250));
  const fireInfo = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    return {
      ok: txt.includes('Firelight') && txt.includes('Flare') && txt.includes('FXRP') && txt.includes('stXRP') && txt.includes('UNDERWRITING SLASH RISK') && txt.includes('1. Base Value (Huber + EB)') && txt.includes('2. 7d Growth (Heuristic)') && txt.includes('3. Tracking Age (Heuristic)') && txt.includes('Counterfactual Sensitivity') && txt.includes('Break-Even Distribution Share') && txt.includes('Zero-Reward Cost (0% Airdrop)') && txt.includes('Lower (25th Band)') && !txt.includes('+EV') && !/\\bVIABLE\\b/.test(txt),
      be: txt.match(/Break-Even Distribution Share[\\s\\S]{0,25}/)?.[0] || '',
    };
  })()`);
  ok('03_Firelight_Research_And_Playbook', fireInfo.ok, fireInfo.be.replace(/\s+/g, ' '));
  await cdp.shot(path.join(SHOTS_DIR, '2-detail.png'));

  // 4. Farming Decision Workspace @ $1,000, 7%
  await cdp.eval(`window.TITAN_SET({ view: 'farming', farmFilter: 'central', budget: 1000, dropShare: 0.07, sortBy: 'netHr', sortDir: -1 })`);
  await new Promise((r) => setTimeout(r, 250));
  const farmInfo = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    const rows = document.querySelectorAll('tbody tr.rc').length;
    const hasScenario = txt.includes('Drop ') && txt.includes('0 / 184 Positive') && !txt.includes('+EV') && !/\\bVIABLE\\b/.test(txt);
    return { rows, hasScenario };
  })()`);
  ok('04_Farming_Decision_Workspace', farmInfo.rows >= 10 && farmInfo.hasScenario, JSON.stringify(farmInfo));
  await cdp.shot(path.join(SHOTS_DIR, '3-filtered.png'));

  // 5. Recorded Tokens, Excluded, Model & Validation, Compare, Methodology
  await cdp.eval(`window.TITAN_SET({ view: 'live' })`);
  const liveOk = await cdp.eval(`(() => { const t = document.getElementById('app').innerText; return t.includes('Recorded & Live Tokens') && t.includes('128') && t.includes('288') && t.includes('LIVE MCAP'); })()`);
  await cdp.eval(`window.TITAN_SET({ view: 'excluded' })`);
  const exclOk = await cdp.eval(`(() => { const t = document.getElementById('app').innerText; return t.includes('Excluded Protocols') && t.includes('Tokenized Siblings (6)') && t.includes('TOKENIZED SIBLING'); })()`);
  await cdp.eval(`window.TITAN_SET({ view: 'model' })`);
  const modOk = await cdp.eval(`(() => { const t = document.getElementById('app').innerText; return t.includes('A. Official Starter') && t.includes('D. Hybrid Base x Growth x Age [Selected]') && t.includes('66.7%') && !!document.querySelector('svg.chart circle.pt-dot'); })()`);
  await cdp.eval(`window.TITAN_SET({ view: 'compare' })`);
  await cdp.eval(`document.querySelector('[data-loadcmp="1"]')?.click()`);
  const cmpOk = await cdp.eval(`document.getElementById('app').innerText.includes('Side-by-Side Comparison')`);
  await cdp.eval(`document.querySelector('[data-clearcmp="1"]')?.click()`);
  await cdp.eval(`document.getElementById('btn-meth').click()`);
  const methOpen = await cdp.eval(`!document.getElementById('modal').hidden && document.getElementById('modal').innerText.includes('off-WL')`);
  await cdp.eval(`document.getElementById('mdl-close').click()`);
  const methClosed = await cdp.eval(`document.getElementById('modal').hidden`);
  const methOk = methOpen && methClosed;
  // Also test global chain search + sliding pagination page 10->11 + 0% drop recovery
  await cdp.eval(`window.TITAN_SET({ view: 'radar', page: 10, perPage: 8 })`);
  const page10Ok = await cdp.eval(`window.TITAN_STATE.page === 10 && document.body.innerText.includes('Showing 73–80') && !!document.querySelector('[data-page="11"]')`);
  await cdp.eval(`(() => { const g = document.getElementById('gsearch'); g.value='Solana'; g.dispatchEvent(new Event('input')); })()`);
  const chainSearchOk = await cdp.eval(`document.querySelectorAll('#gdrop .gi').length >= 5`);
  await cdp.eval(`window.TITAN_SET({ view: 'farming', dropShare: 0 })`);
  await cdp.eval(`document.querySelector('[data-reset="1"]')?.click()`);
  const zeroDropResetOk = await cdp.eval(`window.TITAN_STATE.dropShare === 0.07 && document.querySelectorAll('tbody tr.rc').length >= 10`);
  ok('05_All_Workspaces_Modal_Search_Pagination_Reset', liveOk && exclOk && modOk && cmpOk && methOk && page10Ok && chainSearchOk && zeroDropResetOk, `live=${liveOk}, excl=${exclOk}, model=${modOk}, compare=${cmpOk}, modal=${methOk}, p10=${page10Ok}, chain=${chainSearchOk}, reset0=${zeroDropResetOk}`);

  // 6. Responsive 5 Viewports
  await cdp.eval(`window.TITAN_SET({ view: 'radar' })`);
  const viewports = [];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await new Promise((r) => setTimeout(r, 120));
    const ov = await cdp.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
    viewports.push({ width: w, height: h, noHorizOverflow: ov });
  }
  ok('06_Responsive_5_Viewports', viewports.every((v) => v.noHorizOverflow), JSON.stringify(viewports));
  ok('07_Zero_Console_Errors', cdp.errors.length === 0, `errors=${cdp.errors.length}`);

  cdp.close();
  fs.writeFileSync(path.join(ROOT, 'v3_clarity/evidence/browser_verification.json'), JSON.stringify({ checks, errors: cdp.errors }, null, 2));
  console.table(checks);
  if (checks.some((c) => !c.pass)) process.exit(1);
} finally {
  chrome.kill();
}
