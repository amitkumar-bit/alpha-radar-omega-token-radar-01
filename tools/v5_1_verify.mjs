import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = path.join(ROOT, 'research/tribunal/v51_out');
const URL_PATH = `file:///${OUT_DIR.replace(/\\/g, '/')}/dashboard/index.html`;
const SHOTS_DIR = path.join(ROOT, 'v2_titan/evidence/v2_git_repo/screenshots');
const EV_DIR = path.join(ROOT, 'research/tribunal/v51_ev');
const PORT = 9289;

fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.mkdirSync(EV_DIR, { recursive: true });
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

  // 1. Radar
  const radarCheck = await cdp.eval(`(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const h1 = parseFloat(getComputedStyle(document.querySelector('h1.h1')).fontSize);
    const kv = parseFloat(getComputedStyle(document.querySelector('.kv')).fontSize);
    const footBottom = document.querySelector('.tf')?.getBoundingClientRect().bottom || 9999;
    const rows = document.querySelectorAll('tbody tr.rc').length;
    const txt = document.body.innerText;
    return { bg, isLight: bg === 'rgb(248, 250, 252)', h1, kv, rows, footBottom: Math.round(footBottom), hasProof: txt.includes('Token Launch Radar') && txt.includes('40 of 40 covered') && txt.includes('0/184') && txt.includes('Lower 50% qualified') && txt.includes('2.78×') };
  })()`);
  ok('01_Radar_1440x900', radarCheck.isLight && radarCheck.hasProof && radarCheck.rows >= 7 && radarCheck.footBottom <= 905, JSON.stringify(radarCheck));
  await cdp.shot(path.join(SHOTS_DIR, '1-board.png'));

  // 2. Research (#89 Firelight @ $5,000, 7% drop)
  await cdp.eval(`window.TITAN_SET({ view: 'research', slug: 'firelight', budget: 5000, usePlan: 0, dropShare: 0.07, orgApr: 0, lossPct: 0, realPct: 1 })`);
  await new Promise((r) => setTimeout(r, 250));
  const fire0 = await cdp.eval(`(() => {
    const app = document.getElementById('app');
    const txt = app.innerText;
    const maxB = Math.max(...[...app.querySelectorAll(':scope > *')].map(el => el.getBoundingClientRect().bottom));
    const svgs = app.querySelectorAll('svg.chart');
    return {
      ok: txt.includes('Firelight') && txt.includes('UNDERWRITING SLASH RISK') && txt.includes('Sector fallback') && txt.includes('Exact ✓'),
      maxB: Math.round(maxB), svgCount: svgs.length,
    };
  })()`);
  await cdp.shot(path.join(SHOTS_DIR, '2-detail.png'));

  // Interactive check on Research: 0.5% loss + 4% org + 50% realization
  await cdp.eval(`(() => { const s = document.getElementById('lossSel'); s.value='0.005'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const lossOk = await cdp.eval(`document.getElementById('app').innerText.includes('$25.00') && document.getElementById('app').innerText.includes('$11.59')`);
  await cdp.eval(`(() => { const s = document.getElementById('lossSel'); s.value='0'; s.dispatchEvent(new Event('change',{bubbles:true})); const o = document.getElementById('orgSel'); o.value='0.04'; o.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const orgOk = await cdp.eval(`document.getElementById('app').innerText.includes('$53.03') && document.getElementById('app').innerText.includes('-$16.60')`);
  await cdp.eval(`(() => { const o = document.getElementById('orgSel'); o.value='0'; o.dispatchEvent(new Event('change',{bubbles:true})); const r = document.getElementById('realSel'); r.value='0.5'; r.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const realOk = await cdp.eval(`document.getElementById('app').innerText.includes('50% (BE')`);
  // Verify Cap $ and Est. Lock inputs are wide enough not to clip
  const capClipOk = await cdp.eval(`(() => { const el = document.getElementById('inCap'); return el && el.getBoundingClientRect().width >= 66; })()`);
  ok('02_Research_Detail_And_Stress', fire0.ok && fire0.svgCount === 2 && fire0.maxB <= 905 && lossOk && orgOk && realOk && capClipOk, JSON.stringify({ ...fire0, lossOk, orgOk, realOk, capClipOk }));

  // 3. Farming @ $1,000 fixed (49 Scenario-qualified, 3 Lower-50%)
  await cdp.eval(`window.TITAN_SET({ view: 'farming', farmFilter: 'central', budget: 1000, usePlan: 0, dropShare: 0.07, orgApr: 0, lossPct: 0, realPct: 1, sortBy: 'netHr', sortDir: -1 })`);
  await new Promise((r) => setTimeout(r, 250));
  const farm0 = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    const rows = document.querySelectorAll('tbody tr.rc').length;
    const footBottom = document.querySelector('.tf')?.getBoundingClientRect().bottom || 9999;
    return { rows, footBottom: Math.round(footBottom), ok: txt.includes('Scenario-qualified') && txt.includes('Zero-Reward') && txt.includes('Central $/hr') };
  })()`);
  await cdp.shot(path.join(SHOTS_DIR, '3-filtered.png'));
  ok('03_Farming_View', farm0.ok && farm0.rows >= 7 && farm0.footBottom <= 905, JSON.stringify(farm0));

  // 4. All views + Dark Theme + Responsive Matrix + Zero Console Errors
  await cdp.eval(`window.TITAN_SET({ theme: 'dark', view: 'radar', page: 1 })`);
  await new Promise((r) => setTimeout(r, 120));
  const darkOk = await cdp.eval(`document.documentElement.dataset.theme === 'dark'`);
  await cdp.eval(`window.TITAN_SET({ theme: 'light' })`);

  const matrix = [];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1024, 768], [390, 844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    for (const v of ['radar', 'live', 'excluded', 'research', 'farming', 'model', 'compare']) {
      await cdp.eval(`window.TITAN_SET({ view: '${v}' })`);
      await new Promise((r) => setTimeout(r, 40));
      const ov = await cdp.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
      matrix.push({ w, h, v, ok: ov });
    }
  }
  const fails = matrix.filter((x) => !x.ok);
  ok('04_Responsive_Matrix_28_Checks', fails.length === 0 && darkOk, `${matrix.length - fails.length}/${matrix.length} passed, dark=${darkOk}`);
  ok('05_Zero_Console_Errors', cdp.errors.length === 0, `errors=${cdp.errors.length} ${cdp.errors[0] || ''}`);

  cdp.close();
  fs.writeFileSync(path.join(EV_DIR, 'browser_verification.json'), JSON.stringify({ checks, errors: cdp.errors }, null, 2));
  console.table(checks);
  if (checks.some((c) => !c.pass)) process.exit(1);
} finally {
  chrome.kill();
}
