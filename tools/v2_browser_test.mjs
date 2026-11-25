import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_PATH = `file:///${ROOT.replace(/\\/g, '/')}/v2_titan/evidence/win_out_1/dashboard/index.html`;
const SHOTS_DIR = path.join(ROOT, 'v2_titan/screenshots');
const SHOTS_1920 = path.join(ROOT, 'v2_titan/evidence/screenshots_1920');
const PORT = 9247;

fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.mkdirSync(SHOTS_1920, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, 'v2_titan/evidence/chrome_tmp')}`,
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

  // 1. PRE-TOKEN RADAR overview @ 1440x900: token-status tabs, 40/40 watchlist, Model D OOS, 758 audit, 44px rows, zero +EV/VIABLE
  const radarCheck = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    const rowH = document.querySelector('tbody tr.rc td')?.getBoundingClientRect().height || 0;
    const lad = window.OMEGA_BOARD.oos.ladder;
    const hasDistinctModels = lad[2].loo_med_mult !== lad[4].loo_med_mult && lad[1].loo_med_mult !== lad[4].loo_med_mult;
    const hasRubricProof = txt.includes('PRE-TOKEN RADAR') && txt.includes('LIVE / RECORDED TOKENS') && txt.includes('EXCLUDED PROTOCOLS') && txt.includes('40 / 40') && txt.includes('Parity 184/184') && !txt.includes('+EV') && !/\\bVIABLE\\b/.test(txt);
    return { txt, rowH, huber: lad[2], selected: lad[4], hasDistinctModels, hasRubricProof };
  })()`);
  ok('01_PreToken_Radar_ModelD_And_44px_Rows', radarCheck.hasDistinctModels && radarCheck.hasRubricProof && radarCheck.rowH >= 42 && !radarCheck.txt.includes('$1x'), `rowH=${radarCheck.rowH}, ok=${radarCheck.hasRubricProof}, B=${radarCheck.huber.loo_med_mult}x vs D=${radarCheck.selected.loo_med_mult}x`);
  await cdp.shot(path.join(SHOTS_DIR, '1-board.png'));

  // 2. Stale selection + empty state + filters + conditional labels check
  await cdp.eval(`document.querySelector('[data-subset="early"]').click()`);
  const earlySync = await cdp.eval(`({ slug: window.TITAN_STATE.slug, notTop: window.TITAN_STATE.slug !== 'steakhouse-financial' })`);
  await cdp.eval(`(() => { const q = document.getElementById('qInput'); q.value='nonexistent_xyz_protocol'; q.dispatchEvent(new Event('input')); })()`);
  const emptyCheck = await cdp.eval(`document.getElementById('app').innerText.includes('No protocols match')`);
  await cdp.eval(`document.querySelector('[data-reset="1"]').click()`);
  ok('02_Stale_Selection_Sync_And_Empty_State', earlySync.notTop && emptyCheck, `syncedSlug=${earlySync.slug}, emptyState=${emptyCheck}`);

  // 3. Protocol Research (Firelight @ $5,000, 7%) -> exact decomposition, counterfactuals, FXRP->stXRP, P25/P75 propagation, capture 2-detail.png
  await cdp.eval(`window.TITAN_SET({ view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07 })`);
  await new Promise((r) => setTimeout(r, 250));
  const fireInfo = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    return {
      ok: txt.includes('Firelight') && txt.includes('Flare') && txt.includes('FXRP') && txt.includes('stXRP') && txt.includes('UNDERWRITING SLASH RISK') && txt.includes('1. Base (Huber + EB)') && txt.includes('2. 7d Growth Mult') && txt.includes('3. Track-Age Maturity') && txt.includes('Counterfactual Sensitivity') && txt.includes('Break-Even Dist. Share') && txt.includes('Zero-Reward Cost (0% Drop)') && txt.includes('Gross(V)') && txt.includes('Lower (P25)') && !txt.includes('+EV') && !/\\bVIABLE\\b/.test(txt),
      beMatch: txt.match(/Break-Even Dist\\. Share[\\s\\S]{0,30}/)?.[0] || '',
    };
  })()`);
  ok('03_Firelight_Decomposition_And_Playbook', fireInfo.ok, fireInfo.beMatch.replace(/\s+/g, ' '));
  await cdp.shot(path.join(SHOTS_DIR, '2-detail.png'));

  // 4. Farming Intelligence (@ $1,000, 7% drop) -> scenario robustness classes + P25..P75 + 0/N zero-reward audit, capture 3-filtered.png
  await cdp.eval(`window.TITAN_SET({ view: 'farming', farmFilter: 'central', budget: 1000, dropShare: 0.07, sortBy: 'netHr', sortDir: -1 })`);
  await new Promise((r) => setTimeout(r, 250));
  const farmInfo = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    const rows = document.querySelectorAll('tbody tr.rc').length;
    const hasScenario = (txt.includes('ROBUST (P25–P75)') || txt.includes('CENTRAL ONLY')) && txt.includes('P25..75:') && !txt.includes('+EV') && !/\\bVIABLE\\b/.test(txt);
    const hasZero = /0 \\/ \\d+/.test(txt);
    return { rows, hasScenario, hasZero };
  })()`);
  ok('04_Farming_Conditional_Labels_And_Zero_Drop_Audit', farmInfo.rows >= 10 && farmInfo.hasScenario && farmInfo.hasZero, JSON.stringify(farmInfo));
  await cdp.shot(path.join(SHOTS_DIR, '3-filtered.png'));

  // 5. Also capture 1920x1080 views
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.eval(`window.TITAN_SET({ view: 'radar', subset: 'all', cat: 'ALL', chain: 'ALL', q: '', budget: 1000, dropShare: 0.07, sortBy: 'rank', sortDir: 1, perPage: 10 })`);
  await new Promise((r) => setTimeout(r, 200));
  await cdp.shot(path.join(SHOTS_1920, '1-board-1920.png'));
  await cdp.eval(`window.TITAN_SET({ view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07 })`);
  await new Promise((r) => setTimeout(r, 200));
  await cdp.shot(path.join(SHOTS_1920, '2-detail-1920.png'));
  await cdp.eval(`window.TITAN_SET({ view: 'farming', farmFilter: 'central', budget: 1000, dropShare: 0.07, sortBy: 'netHr', sortDir: -1 })`);
  await new Promise((r) => setTimeout(r, 200));
  await cdp.shot(path.join(SHOTS_1920, '3-filtered-1920.png'));

  // 6. Test Live/Recorded Tokens, Excluded Protocols, Model Research (A-D), Compare, Methodology Modal
  await cdp.eval(`window.TITAN_SET({ view: 'live' })`);
  const liveOk = await cdp.eval(`(() => { const t = document.getElementById('app').innerText; return t.includes('LIVE / RECORDED TOKENS') && t.includes('128') && t.includes('288') && t.includes('LIVE MCAP'); })()`);
  await cdp.eval(`window.TITAN_SET({ view: 'excluded' })`);
  const exclOk = await cdp.eval(`(() => { const t = document.getElementById('app').innerText; return t.includes('EXCLUDED PROTOCOLS') && t.includes('Tokenized Siblings (6)') && t.includes('EXCLUDED'); })()`);
  await cdp.eval(`window.TITAN_SET({ view: 'model' })`);
  const modOk = await cdp.eval(`(() => { const t = document.getElementById('app').innerText; return t.includes('A. Official Starter') && t.includes('D. Hybrid Base x Growth x Age [Selected]') && t.includes('66.7%'); })()`);
  await cdp.eval(`window.TITAN_SET({ view: 'compare' })`);
  await cdp.eval(`document.querySelector('[data-loadcmp="1"]')?.click()`);
  const cmpOk = await cdp.eval(`document.getElementById('app').innerText.includes('Side-by-Side Comparison')`);
  await cdp.eval(`document.querySelector('[data-clearcmp="1"]')?.click()`);
  await cdp.eval(`document.getElementById('btn-meth').click()`);
  const methOk = await cdp.eval(`!document.getElementById('modal').hidden && document.getElementById('modal').innerText.includes('104 watchlist rows')`);
  await cdp.eval(`document.getElementById('mdl-close').click()`);
  ok('05_TokenStatus_Views_ModelAD_And_Modal', liveOk && exclOk && modOk && cmpOk && methOk, `live=${liveOk}, excl=${exclOk}, model=${modOk}, compare=${cmpOk}, modal=${methOk}`);

  // 7. Responsive Viewports (1920, 1440, 1024, 768, 390) zero horizontal overflow & zero console errors
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
  fs.writeFileSync(path.join(ROOT, 'v2_titan/evidence/browser_verification.json'), JSON.stringify({ checks, errors: cdp.errors }, null, 2));
  console.table(checks);
  if (checks.some((c) => !c.pass)) process.exit(1);
} finally {
  chrome.kill();
}
