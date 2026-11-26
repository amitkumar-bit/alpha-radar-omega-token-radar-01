import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_PATH = `file:///${ROOT.replace(/\\/g, '/')}/v4_2_candidate/evidence/win_out_1/dashboard/index.html`;
const SHOTS_DIR = path.join(ROOT, 'v4_2_candidate/screenshots');
const EV_DIR = path.join(ROOT, 'v4_2_candidate/evidence');
const PORT = 9287;

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

  // 1. Light Default Radar: Nav (184/416/158), Watchlist 40/40, Robust 0/184 warning, Visible Search/Cat/Chain, Model D Formula
  const radarCheck = await cdp.eval(`(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const ff = getComputedStyle(document.body).fontFamily.toLowerCase();
    const h1 = parseFloat(getComputedStyle(document.querySelector('h1.h1')).fontSize);
    const kv = parseFloat(getComputedStyle(document.querySelector('.kv')).fontSize);
    const td = parseFloat(getComputedStyle(document.querySelector('.tbl td')).fontSize);
    const footBottom = document.querySelector('.tf')?.getBoundingClientRect().bottom || 9999;
    const rows = document.querySelectorAll('tbody tr.rc').length;
    const navTxt = document.getElementById('nav').innerText;
    const txt = document.body.innerText;
    const visControls = !!document.getElementById('qInput') && !!document.getElementById('catSel') && !!document.getElementById('chainSel');
    const hasProof = txt.includes('Token Launch Radar') && txt.includes('40 of 40 covered') && txt.includes('0/184') && txt.includes('Lower-band qualified') && txt.includes('46 scenario-qual.') && txt.includes('61.9%') && txt.includes('Huber+EB(TVL, Cat)') && navTxt.includes('Recorded (416)') && navTxt.includes('Excluded (158)') && !txt.includes('Executable');
    return { bg, isLight: bg === 'rgb(248, 250, 252)', sansOnly: !ff.includes('mono'), noAv: document.querySelectorAll('.av').length === 0, noFakeQ: !/\\bP(?:10|25|75|90)\\b/.test(txt), h1, kv, td, rows, footBottom: Math.round(footBottom), visControls, hasProof };
  })()`);
  ok('01_V4_2_Radar_Hierarchy_Formula_RobustWarning',
    radarCheck.isLight && radarCheck.sansOnly && radarCheck.noAv && radarCheck.noFakeQ && radarCheck.visControls && radarCheck.hasProof && radarCheck.kv >= 28 && radarCheck.td >= 14 && radarCheck.rows >= 6 && radarCheck.footBottom <= 905,
    JSON.stringify(radarCheck));
  await cdp.shot(path.join(SHOTS_DIR, '1-board.png'));

  // 2. Research View (#89 Firelight @ $5,000, 7% drop): Visible Valuation Math + Fallback Warning + Loss Stress + Realization BE
  await cdp.eval(`window.TITAN_SET({ view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07, orgApr: 0, lossPct: 0, realPct: 1 })`);
  await new Promise((r) => setTimeout(r, 250));
  const fire0 = await cdp.eval(`(() => {
    const app = document.getElementById('app');
    const txt = app.innerText;
    const maxB = Math.max(...[...app.querySelectorAll(':scope > *')].map(el => el.getBoundingClientRect().bottom));
    const scatterSvg = app.querySelectorAll('svg.chart')[1];
    const scatterH = scatterSvg ? Math.round(scatterSvg.getBoundingClientRect().height) : 0;
    return {
      ok: txt.includes('Firelight') && txt.includes('UNDERWRITING SLASH RISK') && txt.includes('$9.06M') && txt.includes('×0.950') && txt.includes('×0.924') && txt.includes('$7.95M') && txt.includes('Sector fallback') && txt.includes('$21.24') && txt.includes('-$33.04') && txt.includes('0.425%') && txt.includes('60.9%') && txt.includes('Exact ✓'),
      maxB: Math.round(maxB), scatterH, noFakeQ: !/\\bP(?:10|25|75|90)\\b/.test(txt),
    };
  })()`);
  await cdp.shot(path.join(SHOTS_DIR, '2-detail.png'));

  // Interactive checks on Research: Principal Loss 0.5% -> -$3.76, Org Yield 4% -> $37.68 / -$16.60, Realization 50%
  await cdp.eval(`(() => { const s = document.getElementById('lossSel'); s.value='0.005'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const fireLoss05 = await cdp.eval(`document.getElementById('app').innerText.includes('-$3.76') && document.getElementById('app').innerText.includes('$25.00')`);
  await cdp.eval(`(() => { const s = document.getElementById('lossSel'); s.value='0'; s.dispatchEvent(new Event('change',{bubbles:true})); const o = document.getElementById('orgSel'); o.value='0.04'; o.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const fireOrg4 = await cdp.eval(`document.getElementById('app').innerText.includes('$37.68') && document.getElementById('app').innerText.includes('-$16.60')`);
  await cdp.eval(`(() => { const o = document.getElementById('orgSel'); o.value='0'; o.dispatchEvent(new Event('change',{bubbles:true})); const r = document.getElementById('realSel'); r.value='0.5'; r.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const fireReal50 = await cdp.eval(`document.getElementById('app').innerText.includes('-$5.90')`);
  ok('02_V4_2_Research_Decomposition_Fallback_Stress_Realization', fire0.ok && fire0.maxB <= 905 && fire0.scatterH >= 130 && fire0.noFakeQ && fireLoss05 && fireOrg4 && fireReal50, JSON.stringify({ ...fire0, fireLoss05, fireOrg4, fireReal50 }));

  // 3. Purpose-Built Farming Workspace @ $1,000, 7%, Uniform Opp Cost (46 Scenario-Qualified, 0 Lower-band)
  await cdp.eval(`window.TITAN_SET({ view: 'farming', farmFilter: 'central', budget: 1000, dropShare: 0.07, orgApr: 0, lossPct: 0, realPct: 1, sortBy: 'netHr', sortDir: -1 })`);
  await new Promise((r) => setTimeout(r, 250));
  const farm0 = await cdp.eval(`(() => {
    const txt = document.getElementById('app').innerText;
    const thTxt = [...document.querySelectorAll('.tbl th')].map(x => x.innerText).join('|');
    const rows = document.querySelectorAll('tbody tr.rc').length;
    const footBottom = document.querySelector('.tf')?.getBoundingClientRect().bottom || 9999;
    return {
      rows, footBottom: Math.round(footBottom), thTxt,
      ok: txt.includes('46/184') && txt.includes('0/184') && txt.includes('Scenario-qualified') && txt.includes('Lower-band qualified') && txt.includes('Zero-Rew') && thTxt.includes('Zero-Rew') && thTxt.includes('Cond. $/hr') && !txt.includes('Executable') && !/\\bP(?:10|25|75|90)\\b/.test(txt),
    };
  })()`);
  await cdp.shot(path.join(SHOTS_DIR, '3-filtered.png'));

  await cdp.eval(`document.querySelector('[data-farmfilter="robust"]')?.click()`);
  const robustEmptyOk = await cdp.eval(`document.getElementById('app').innerText.includes('0/184 pass Lower-band')`);
  await cdp.eval(`document.querySelector('[data-farmfilter="central"]')?.click()`);
  ok('03_V4_2_Farming_Decision_Table_And_EmptyState', farm0.ok && farm0.rows >= 6 && farm0.footBottom <= 905 && robustEmptyOk, JSON.stringify({ rows: farm0.rows, footBottom: farm0.footBottom, ok: farm0.ok, robustEmptyOk }));

  // 4. Dark Theme
  await cdp.eval(`window.TITAN_SET({ theme: 'dark', view: 'radar', page: 1 })`);
  await new Promise((r) => setTimeout(r, 200));
  const darkRadar = await cdp.eval(`({ attr: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor })`);
  await cdp.shot(path.join(EV_DIR, 'dark_1-board.png'));
  await cdp.eval(`window.TITAN_SET({ theme: 'dark', view: 'research', slug: 'firelight', budget: 5000, dropShare: 0.07, orgApr: 0, lossPct: 0, realPct: 1 })`);
  await new Promise((r) => setTimeout(r, 200));
  await cdp.shot(path.join(EV_DIR, 'dark_2-detail.png'));
  await cdp.eval(`window.TITAN_SET({ theme: 'light' })`);
  ok('04_V4_2_Dark_Theme_Parity', darkRadar.attr === 'dark' && darkRadar.bg === 'rgb(11, 13, 16)', JSON.stringify(darkRadar));

  // 5. All Views + Keyboard + Modal + Filter Popover Persistence + Reset
  await cdp.eval(`document.querySelector('[data-view="live"]')?.click()`);
  const liveOk = await cdp.eval(`document.getElementById('app').innerText.includes('Recorded-Token Protocols (416)')`);
  await cdp.eval(`document.querySelector('[data-view="excluded"]')?.click()`);
  const exclOk = await cdp.eval(`document.getElementById('app').innerText.includes('Excluded & Sibling Protocols (158)')`);
  await cdp.eval(`document.querySelector('[data-view="model"]')?.click()`);
  const modOk = await cdp.eval(`document.getElementById('app').innerText.includes('A. Official Starter') && document.getElementById('app').innerText.includes('61.9%')`);
  await cdp.eval(`document.querySelector('[data-view="compare"]')?.click()`);
  await cdp.eval(`document.querySelector('[data-loadcmp="1"]')?.click()`);
  const cmpOk = await cdp.eval(`document.getElementById('app').innerText.includes('Comparison (3/4)')`);
  await cdp.eval(`document.querySelector('[data-clearcmp="1"]')?.click()`);
  await cdp.eval(`document.getElementById('btn-meth').click()`);
  const methOpen = await cdp.eval(`!document.getElementById('modal').hidden && document.getElementById('modal').getAttribute('aria-labelledby') === 'mdl-h'`);
  await cdp.eval(`document.getElementById('mdl-close').click()`);
  const methClosed = await cdp.eval(`document.getElementById('modal').hidden && document.activeElement?.id === 'btn-meth'`);
  await cdp.eval(`window.TITAN_SET({ view: 'radar' }); document.getElementById('btn-flt')?.focus(); document.getElementById('btn-flt')?.click()`);
  const colOpen = await cdp.eval(`!document.getElementById('flt-pop').hidden`);
  await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  const escOk = await cdp.eval(`document.getElementById('flt-pop').hidden && document.activeElement?.id === 'btn-flt'`);
  await cdp.eval(`(() => { const q = document.getElementById('qInput'); q.value='Fire'; q.dispatchEvent(new Event('input')); })()`);
  const inlineSearchFocus = await cdp.eval(`document.activeElement?.id === 'qInput' && document.body.innerText.includes('Firelight')`);
  await cdp.eval(`document.getElementById('btn-flt')?.click(); document.querySelector('[data-reset="1"]')?.click()`);
  ok('05_V4_2_AllViews_Modal_Keyboard_InlineFilter', liveOk && exclOk && modOk && cmpOk && methOpen && methClosed && colOpen && escOk && inlineSearchFocus, `live=${liveOk}, excl=${exclOk}, model=${modOk}, cmp=${cmpOk}, modal=${methOpen && methClosed}, colOpen=${colOpen}, escOk=${escOk}, inlineSearch=${inlineSearchFocus}`);

  // 6. Responsive Matrix: 6 Viewports x 7 Views = 42 checks!
  const matrix = [];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    for (const v of ['radar', 'live', 'excluded', 'research', 'farming', 'model', 'compare']) {
      await cdp.eval(`window.TITAN_SET({ view: '${v}' })`);
      await new Promise((r) => setTimeout(r, 60));
      const ov = await cdp.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
      matrix.push({ w, h, v, ok: ov });
    }
  }
  const fails = matrix.filter((x) => !x.ok);
  ok('06_V4_2_Responsive_6x7_Matrix_42_Checks', fails.length === 0, `${matrix.length - fails.length}/${matrix.length} passed${fails.length ? ' fails:' + JSON.stringify(fails) : ''}`);
  ok('07_V4_2_Zero_Console_Errors', cdp.errors.length === 0, `errors=${cdp.errors.length}`);

  cdp.close();
  fs.writeFileSync(path.join(EV_DIR, 'browser_verification.json'), JSON.stringify({ checks, errors: cdp.errors, responsive_matrix: matrix }, null, 2));
  console.table(checks);
  if (checks.some((c) => !c.pass)) process.exit(1);
} finally {
  chrome.kill();
}
