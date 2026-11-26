import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_PATH = `file:///${ROOT.replace(/\\/g, '/')}/v4_candidate/evidence/win_out_1/dashboard/index.html`;
const SHOTS_DIR = path.join(ROOT, 'v4_candidate/screenshots');
const EV_DIR = path.join(ROOT, 'v4_candidate/evidence');
const PORT = 9284;

fs.mkdirSync(SHOTS_DIR, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(EV_DIR, 'chrome_tmp')}`,
  'about:blank',
], { stdio: 'ignore' });

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Chrome DevTools timeout');
}

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
  async shot(outPath) { const { data } = await this.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(outPath, Buffer.from(data, 'base64')); }
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

  // 1. Light Default + Token Launch Radar + KPI >= 28px + Table 14px + Footer <= 900
  const radarCheck = await cdp.eval(`(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const h1 = parseFloat(getComputedStyle(document.querySelector('h1.h1')).fontSize);
    const kv = parseFloat(getComputedStyle(document.querySelector('.kv')).fontSize);
    const td = parseFloat(getComputedStyle(document.querySelector('.tbl td')).fontSize);
    const rowH = document.querySelector('tbody tr.rc td')?.getBoundingClientRect().height || 0;
    const footBottom = document.querySelector('.tf')?.getBoundingClientRect().bottom || 9999;
    const txt = document.body.innerText;
    const hasProof = txt.includes('Token Launch Radar') && txt.includes('40/40') && txt.includes('Parity 184/184') && txt.includes('61.9%') && txt.includes('Cond. Est. MCap') && !txt.includes('+EV') && !/\\bVIABLE\\b/.test(txt);
    return { bg, isLight: bg === 'rgb(248, 250, 252)', h1, kv, td, rowH, footBottom: Math.round(footBottom), hasProof, scrollH: document.documentElement.scrollHeight };
  })()`);
  ok('01_V4_Light_Radar_29pxKPI_14pxTable_1440x900',
    radarCheck.isLight && radarCheck.hasProof && radarCheck.kv >= 28 && radarCheck.td >= 14 && radarCheck.footBottom <= 901,
    JSON.stringify(radarCheck));
  await cdp.shot(path.join(SHOTS_DIR, '1-board.png'));

  // 2. Research View (#89 Firelight @ $5,000, 7% drop) + Hypothetical Organic Base Yield toggle
  await cdp.eval(`window.TITAN_SET({ view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07, orgApr: 0 })`);
  await new Promise((r) => setTimeout(r, 250));
  const fire0 = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    const maxB = Math.max(...[...document.querySelectorAll('#app > *')].map(el => el.getBoundingClientRect().bottom));
    return {
      ok: txt.includes('Firelight') && txt.includes('UNDERWRITING SLASH RISK') && txt.includes('1. Base Value (Huber + EB)') && /conditional est\. mcap/i.test(txt) && txt.includes('$172.14') && txt.includes('$139.10') && txt.includes('-$33.04') && txt.includes('61.9%'),
      maxB: Math.round(maxB),
    };
  })()`);
  await cdp.shot(path.join(SHOTS_DIR, '2-detail.png'));

  await cdp.eval(`(() => { const s = document.getElementById('orgSel'); s.value='0.04'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const fireOrg4 = await cdp.eval(`(() => { const t = document.getElementById('app').innerText; return t.includes('$37.68') && t.includes('-$16.60'); })()`);
  ok('02_V4_Firelight_Research_And_Organic_Yield', fire0.ok && fire0.maxB <= 905 && fireOrg4, `maxB=${fire0.maxB}, org4=${fireOrg4}`);

  // 3. Farming Decisions Workspace @ $1,000, 7%, 0% base yield
  await cdp.eval(`window.TITAN_SET({ view: 'farming', farmFilter: 'central', budget: 1000, dropShare: 0.07, orgApr: 0, sortBy: 'netHr', sortDir: -1 })`);
  await new Promise((r) => setTimeout(r, 250));
  const farm0 = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    const rows = document.querySelectorAll('tbody tr.rc').length;
    const footBottom = document.querySelector('.tf')?.getBoundingClientRect().bottom || 9999;
    return { rows, footBottom: Math.round(footBottom), ok: txt.includes('0/184') && txt.includes('Excludes organic base yield') && txt.includes('+8 gated') };
  })()`);
  await cdp.shot(path.join(SHOTS_DIR, '3-filtered.png'));
  ok('03_V4_Farming_Decisions_Light', farm0.ok && farm0.rows >= 8 && farm0.footBottom <= 905, JSON.stringify(farm0));

  // 4. Restrained Dark Alternative Theme verification & screenshots
  await cdp.eval(`window.TITAN_SET({ theme: 'dark', view: 'radar', page: 1 })`);
  await new Promise((r) => setTimeout(r, 200));
  const darkRadar = await cdp.eval(`({ attr: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor })`);
  await cdp.shot(path.join(EV_DIR, 'dark_1-board.png'));
  await cdp.eval(`window.TITAN_SET({ theme: 'dark', view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07, orgApr: 0 })`);
  await new Promise((r) => setTimeout(r, 200));
  await cdp.shot(path.join(EV_DIR, 'dark_2-detail.png'));
  await cdp.eval(`window.TITAN_SET({ theme: 'light' })`);
  ok('04_V4_Restrained_Dark_Theme_Toggle', darkRadar.attr === 'dark' && darkRadar.bg === 'rgb(11, 13, 16)', JSON.stringify(darkRadar));

  // 5. Markets (Live + Excl), Model, Compare, Modal, Search, Filters Popover, Reset
  await cdp.eval(`window.TITAN_SET({ view: 'live' })`);
  const liveOk = await cdp.eval(`document.getElementById('app').innerText.includes('416') && document.getElementById('app').innerText.includes('128') && document.getElementById('app').innerText.includes('288')`);
  await cdp.eval(`window.TITAN_SET({ view: 'excluded' })`);
  const exclOk = await cdp.eval(`document.getElementById('app').innerText.includes('Tokenized Siblings (6)')`);
  await cdp.eval(`window.TITAN_SET({ view: 'model' })`);
  const modOk = await cdp.eval(`(() => { const t = document.getElementById('app').innerText; return t.includes('A. Official Starter') && t.includes('61.9%') && t.includes('0.22') && t.includes('Student-t3') && !!document.querySelector('svg.chart circle.pt-dot'); })()`);
  await cdp.eval(`window.TITAN_SET({ view: 'compare' })`);
  await cdp.eval(`document.querySelector('[data-loadcmp="1"]')?.click()`);
  const cmpOk = await cdp.eval(`document.getElementById('app').innerText.includes('Side-by-Side Comparison')`);
  await cdp.eval(`document.querySelector('[data-clearcmp="1"]')?.click()`);
  await cdp.eval(`document.getElementById('btn-meth').click()`);
  const methOpen = await cdp.eval(`!document.getElementById('modal').hidden`);
  await cdp.eval(`document.getElementById('mdl-close').click()`);
  const methClosed = await cdp.eval(`document.getElementById('modal').hidden`);
  await cdp.eval(`window.TITAN_SET({ view: 'radar', page: 10 })`);
  const page10Ok = await cdp.eval(`window.TITAN_STATE.page === 10 && document.body.innerText.includes('Showing 55–60') && !!document.querySelector('[data-page="11"]')`);
  await cdp.eval(`(() => { const g = document.getElementById('gsearch'); g.value='Solana'; g.dispatchEvent(new Event('input')); })()`);
  const chainOk = await cdp.eval(`document.querySelectorAll('#gdrop .gi').length >= 5`);
  await cdp.eval(`window.TITAN_SET({ view: 'farming', dropShare: 0 })`);
  await cdp.eval(`document.getElementById('btn-flt')?.click()`);
  await cdp.eval(`document.querySelector('[data-reset="1"]')?.click()`);
  const reset0Ok = await cdp.eval(`window.TITAN_STATE.dropShare === 0.07 && document.querySelectorAll('tbody tr.rc').length >= 8`);
  ok('05_V4_Workspaces_Modal_Search_Pagination_Reset', liveOk && exclOk && modOk && cmpOk && methOpen && methClosed && page10Ok && chainOk && reset0Ok, `live=${liveOk}, excl=${exclOk}, model=${modOk}, cmp=${cmpOk}, modal=${methOpen && methClosed}, p10=${page10Ok}, chain=${chainOk}, reset0=${reset0Ok}`);

  // 6. Responsive 5 Viewports
  await cdp.eval(`window.TITAN_SET({ view: 'radar', page: 1 })`);
  const viewports = [];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await new Promise((r) => setTimeout(r, 120));
    const ov = await cdp.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
    viewports.push({ width: w, height: h, noHorizOverflow: ov });
  }
  ok('06_V4_Responsive_5_Viewports', viewports.every((v) => v.noHorizOverflow), JSON.stringify(viewports));
  ok('07_V4_Zero_Console_Errors', cdp.errors.length === 0, `errors=${cdp.errors.length}`);

  cdp.close();
  fs.writeFileSync(path.join(EV_DIR, 'browser_verification.json'), JSON.stringify({ checks, errors: cdp.errors }, null, 2));
  console.table(checks);
  if (checks.some((c) => !c.pass)) process.exit(1);
} finally {
  chrome.kill();
}
