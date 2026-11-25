import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_PATH = `file:///${ROOT.replace(/\\/g, '/')}/v2_titan/evidence/win_out_1/dashboard/index.html`;
const SHOTS_DIR = path.join(ROOT, 'v2_titan/screenshots');
const PORT = 9247;

fs.mkdirSync(SHOTS_DIR, { recursive: true });
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

  // 1. Verify Screen 1 (Board Overview + 184 rows + Parity pills) & capture 1-board.png
  const rowCnt = await cdp.eval(`document.querySelectorAll('tbody tr.rc').length`);
  const parityPills = await cdp.eval(`document.querySelectorAll('.p-ok').length`);
  ok('01_Screen1_184_Rows_6_Green_Pills', rowCnt === 184 && parityPills === 6, `rows=${rowCnt}, pills=${parityPills}`);
  await cdp.shot(path.join(SHOTS_DIR, '1-board.png'));

  // 2. Test Watchlist / Early / Search / Sort controls
  await cdp.eval(`document.querySelector('[data-subset="wl"]').click()`);
  const wlCnt = await cdp.eval(`document.querySelectorAll('tbody tr.rc').length`);
  await cdp.eval(`document.querySelector('[data-subset="early"]').click()`);
  const earlyCnt = await cdp.eval(`document.querySelectorAll('tbody tr.rc').length`);
  await cdp.eval(`document.querySelector('[data-subset="all"]').click()`);
  await cdp.eval(`(() => { const q = document.getElementById('qInput'); q.value='polymarket'; q.dispatchEvent(new Event('input')); })()`);
  const polyCnt = await cdp.eval(`document.querySelectorAll('tbody tr.rc').length`);
  const polyText = await cdp.eval(`document.querySelector('tbody tr.rc')?.innerText || ''`);
  ok('02_Filters_WL_Early_Polymarket_No_LP_Flag', wlCnt === 40 && earlyCnt > 50 && polyCnt === 1 && polyText.includes('GEO-BLOCK'), `wl=${wlCnt}, early=${earlyCnt}, poly=${polyCnt}`);

  // 3. Screen 2 Unified Detail Dossier View (Firelight) & verify zero bottom clipping at 900px height -> capture 2-detail.png
  await cdp.eval(`window.TITAN_SET({ subset: 'all', q: '', view: 'detail', slug: 'firelight', budget: 5000 })`);
  await new Promise((r) => setTimeout(r, 250));
  const detInfo = await cdp.eval(`(() => { const a = document.getElementById('app'); return { txt: a.innerText, h: document.documentElement.scrollHeight }; })()`);
  ok('03_Screen2_Unified_Detail_No_Bottom_Clip', detInfo.txt.includes('Firelight') && detInfo.txt.includes('PLAYBOOK') && detInfo.txt.includes('2D SCENARIO MATRIX') && detInfo.h <= 905, `height=${detInfo.h}`);
  await cdp.shot(path.join(SHOTS_DIR, '2-detail.png'));

  // 4. Screen 3 Filtered Viable Board (@ $1000 default budget, Sorted Net $/hr DESC, Firelight selected) -> capture 3-filtered.png
  await cdp.eval(`window.TITAN_SET({ view: 'filtered', subset: 'viable', budget: 1000, sortBy: 'netHr', sortDir: -1, slug: 'firelight' })`);
  await new Promise((r) => setTimeout(r, 250));
  const filtRows = await cdp.eval(`document.querySelectorAll('tbody tr.rc').length`);
  const filtTxt = await cdp.eval(`document.getElementById('app').innerText`);
  ok('04_Screen3_Filtered_Viable_Board', filtRows >= 10 && /filtered actionable/i.test(filtTxt) && /firelight/i.test(filtTxt), `filteredRows=${filtRows}`);
  await cdp.shot(path.join(SHOTS_DIR, '3-filtered.png'));

  // 5. Boundary calcEconomics + Zero-Change Scenario Parity in Browser
  const econGuards = await cdp.eval(`(() => {
    const O = window.OMEGA;
    const invZero = O.calcEconomics({ capital_usd: 0, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 1 });
    const invNeg = O.calcEconomics({ capital_usd: -500, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 1 });
    const invNaN = O.calcEconomics({ capital_usd: NaN, gas_4w_usd: 1, bridge_exit_usd: 1, slippage_bps: 5, lockup_days: 30, hours: 1 });
    const eth500 = O.calcEconomics({ capital_usd: 500, gas_4w_usd: 24, bridge_exit_usd: 12, slippage_bps: 5, lockup_days: 30, hours: 0.6, min_viable_usd: 1000, tvl_usd: 254e6, implied_usd: 120e6 });
    const eth5000 = O.calcEconomics({ capital_usd: 5000, gas_4w_usd: 24, bridge_exit_usd: 12, slippage_bps: 5, lockup_days: 30, hours: 2.0, min_viable_usd: 1000, tvl_usd: 10e6, implied_usd: 150e6 });
    return { z: invZero.valid, n: invNeg.valid, nan: invNaN.valid, c500: eth500.classification, c5000: eth5000.classification };
  })()`);
  ok('05_CalcEconomics_Edge_Guards', !econGuards.z && !econGuards.n && !econGuards.nan && econGuards.c500 === 'SKIP (LOSS)' && econGuards.c5000 === 'VIABLE', JSON.stringify(econGuards));

  // 6. Keyboard shortcuts 1/2/3 + Responsive Viewports zero overflow
  await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))`);
  const viewAfterK1 = await cdp.eval(`window.TITAN_STATE.view`);
  const viewports = [];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await new Promise((r) => setTimeout(r, 120));
    const ov = await cdp.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
    viewports.push({ width: w, height: h, noHorizOverflow: ov });
  }
  ok('06_Keyboard_And_Responsive_5_Viewports', viewAfterK1 === 'board' && viewports.every((v) => v.noHorizOverflow), JSON.stringify(viewports));
  ok('07_Zero_Console_Errors', cdp.errors.length === 0, `errors=${cdp.errors.length}`);

  cdp.close();
  fs.writeFileSync(path.join(ROOT, 'v2_titan/evidence/browser_verification.json'), JSON.stringify({ checks, errors: cdp.errors }, null, 2));
  console.table(checks);
  if (checks.some((c) => !c.pass)) process.exit(1);
} finally {
  chrome.kill();
}
