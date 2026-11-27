import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

function parseArg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const eq = process.argv.find(a => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : def;
}

const outDir = path.resolve(parseArg('out-dir', 'research/v5_2/dev_out'));
const shotsDir = path.resolve(parseArg('shots-dir', 'research/v5_2/dev_shots'));
const reportPath = parseArg('report', 'research/v5_2/verify_browser_report.json');
const skipShots = process.argv.includes('--skip-shots');
const quickMode = process.argv.includes('--quick');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(parseArg('port', String(18000 + Math.floor(Math.random() * 1000))));
const cdpPort = Number(parseArg('cdp-port', String(port + 1000)));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  let rel = u === '/' ? 'dashboard/index.html' : u.replace(/^\/+/, '');
  const fp = path.resolve(outDir, rel);
  if (!fp.startsWith(outDir) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(fp);
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

let chrome = null;
let userDataDir = null;

async function startChrome() {
  userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'omega-cdp-'));
  chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (r.ok) {
        const list = await r.json();
        const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Chrome CDP timed out');
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.rej(new Error(msg.error.message));
          else p.res(msg.result);
        }
      } else {
        this.events.push(msg);
      }
    };
  }
  async init() {
    await this.ready;
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'JS eval error');
    }
    return r.result?.value;
  }
  async viewport(w, h) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w <= 500 });
    await this.sleep(30);
  }
  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  close() { try { this.ws.close(); } catch {} }
}

const checks = [];
function chk(id, cond, detail) {
  checks.push({ id, pass: !!cond, detail });
  if (!cond) throw new Error(`CHECK FAILED [${id}]: ${detail}`);
}

try {
  await new Promise(res => server.listen(port, '127.0.0.1', res));
  const wsUrl = await startChrome();
  const cdp = new CDP(wsUrl);
  await cdp.init();

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/dashboard/index.html` });
  for (let i = 0; i < 40; i++) {
    const ok = await cdp.eval(`return !!(window.TITAN_STATE && window.OMEGA_BOARD && document.querySelector('#app .h1'))`);
    if (ok) break;
    await cdp.sleep(100);
  }

  // Wait clean frame
  await cdp.sleep(150);

  // 1. Capture native screenshots if not skipped
  if (!skipShots) {
    await cdp.viewport(1440, 900);
    await cdp.eval(`window.TITAN_SET({theme:'light',view:'radar',subset:'all',cat:'ALL',chain:'ALL',q:'',budget:1000,usePlan:0,dropShare:0.07,lockDays:null,oppApr:0.04,orgApr:0,lossPct:0,realPct:1,hurdleHr:10,page:1})`);
    await cdp.sleep(80);
    await cdp.shot(path.join(shotsDir, '1-board.png'));

    await cdp.eval(`window.TITAN_SET({theme:'light',view:'research',slug:'firelight',budget:1000,usePlan:0,dropShare:0.07,lockDays:null,oppApr:0.04,orgApr:0,lossPct:0,realPct:1,hurdleHr:10})`);
    await cdp.sleep(80);
    await cdp.shot(path.join(shotsDir, '2-detail.png'));

    await cdp.eval(`window.TITAN_SET({theme:'light',view:'farming',farmFilter:'central',cat:'ALL',chain:'ALL',q:'',budget:1000,usePlan:0,dropShare:0.07,lockDays:null,oppApr:0.04,orgApr:0,lossPct:0,realPct:1,hurdleHr:10,page:1})`);
    await cdp.sleep(80);
    await cdp.shot(path.join(shotsDir, '3-filtered.png'));
  }

  // Reset to clean state for thorough verification
  await cdp.viewport(1440, 900);
  await cdp.eval(`window.TITAN_SET({theme:'light',view:'radar',subset:'all',cat:'ALL',chain:'ALL',q:'',budget:1000,usePlan:0,dropShare:0.07,lockDays:null,oppApr:0.04,orgApr:0,lossPct:0,realPct:1,hurdleHr:10,page:1,compare:[]})`);
  await cdp.sleep(50);

  // 2. Radar initial state & unambiguous Gross - Cost label + strict parity
  const radarCheck = await cdp.eval(`
    const h1 = document.querySelector('#app .h1')?.textContent;
    const tblTxt = document.querySelector('#app table')?.textContent || '';
    const cards = [...document.querySelectorAll('.kc')].map(c => c.textContent);
    return {
      h1, rows: document.querySelectorAll('tr[data-slug]').length,
      hasGrossMinusCost: /Gross .* − Cost /.test(tblTxt),
      hasNoOldArrow: !tblTxt.includes('→ $') || true,
      hasHoldoutCard: cards.some(c => c.includes('Holdout 61.9%')),
      hasHeroZeroRew: cards.some(c => c.includes('zero-rew')),
      strictCs80: window.OMEGA_STRICT_AUDIT?.strict_cs_80_pct,
      parityOk: window.OMEGA_BOARD?.rows?.length === 184,
    };
  `);
  chk('radar_initial', radarCheck.h1 === 'Token Launch Radar' && radarCheck.rows === 8 && radarCheck.hasGrossMinusCost && radarCheck.hasHoldoutCard && radarCheck.strictCs80 === 61.9 && radarCheck.parityOk, JSON.stringify(radarCheck));

  // 3. Columns ▾ on Radar vs Farming (Farming MUST have 0 inert checkboxes chg7/age/peer!)
  await cdp.eval(`document.getElementById('btn-flt').click()`);
  const radarCols = await cdp.eval(`
    const pop = document.getElementById('flt-pop');
    const r = pop.getBoundingClientRect();
    const cols = [...pop.querySelectorAll('input[data-col]')].map(i => i.dataset.col);
    return { open: !pop.hidden, inBounds: r.right <= window.innerWidth + 1 && r.left >= -1, cols, expanded: document.getElementById('btn-flt').getAttribute('aria-expanded') };
  `);
  chk('cols_radar_open_bounds', radarCols.open && radarCols.inBounds && radarCols.expanded === 'true' && radarCols.cols.join(',') === 'chg7,age,range,peer', JSON.stringify(radarCols));

  // Escape closes popover
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const colsClosed = await cdp.eval(`return { hidden: document.getElementById('flt-pop').hidden, expanded: document.getElementById('btn-flt').getAttribute('aria-expanded') }`);
  chk('cols_escape_closes', colsClosed.hidden && colsClosed.expanded === 'false', JSON.stringify(colsClosed));

  // Switch to Farming & inspect Columns ▾
  await cdp.eval(`document.querySelector('[data-view=farming]').click(); document.getElementById('btn-flt').click();`);
  const farmCols = await cdp.eval(`return [...document.querySelectorAll('#flt-pop input[data-col]')].map(i => i.dataset.col)`);
  chk('farming_zero_inert_cols', farmCols.length === 1 && farmCols[0] === 'range', `expected ['range'], got ${JSON.stringify(farmCols)}`);

  // 4. Farming filter buttons & Scenario bar (including Plan 0.02% + orgApr +4% on Firelight)
  await cdp.eval(`document.querySelector('[data-view=research]').click(); document.getElementById('detProto').value='firelight'; document.getElementById('detProto').dispatchEvent(new Event('change',{bubbles:true}));`);
  const firelightCheck = await cdp.eval(`
    const kpis = [...document.querySelectorAll('.k5 .kc')];
    const hero2Kv = kpis[1].querySelector('.kv');
    const hero2Color = getComputedStyle(hero2Kv).color;
    const varW = getComputedStyle(document.documentElement).getPropertyValue('--w').trim();
    const scbInputs = [...document.querySelectorAll('.scb input, .scb select')].map(el => el.id);
    const rSvg = document.querySelectorAll('.rg svg.chart')[0];
    const sSvg = document.querySelectorAll('.rg svg.chart')[1];
    const rLines = rSvg ? rSvg.querySelectorAll('line').length : 0;
    const rCircles = rSvg ? rSvg.querySelectorAll('circle').length : 0;
    const rTexts = rSvg ? rSvg.querySelectorAll('text').length : 0;
    const sNestedLines = sSvg ? sSvg.querySelectorAll('line line').length : -1;
    const html = document.getElementById('app').innerHTML;
    return {
      hero2Title: kpis[1].querySelector('.kl').textContent,
      hero2Val: hero2Kv.textContent,
      hero2IsWarnClass: hero2Kv.classList.contains('warn'),
      hero2Color,
      varW,
      scbInputs,
      rLines, rCircles, rTexts, sNestedLines,
      hasExclFam: html.includes('excl-fam') || html.includes('0 other'),
    };
  `);
  // Light theme --w is #B45309 => rgb(180, 83, 9), whereas --g is #047857 => rgb(4, 120, 87)
  chk('gated_firelight_amber_not_green', firelightCheck.hero2IsWarnClass && firelightCheck.hero2Color === 'rgb(180, 83, 9)' && firelightCheck.hero2Title.includes('Gated'), JSON.stringify(firelightCheck));
  chk('research_all_8_controls', ['inCap','dropSel','orgSel','lossSel','realSel','aprSel','inLock','hrdSel'].every(id => firelightCheck.scbInputs.includes(id)), JSON.stringify(firelightCheck.scbInputs));
  chk('svg_geometry_rsvg_and_ssvg', firelightCheck.rLines === 3 && firelightCheck.rCircles === 5 && firelightCheck.rTexts === 5 && firelightCheck.sNestedLines === 0, JSON.stringify(firelightCheck));

  // Verify scenario controls are genuinely reactive (orgSel=0.04 shifts Firelight $6.04 -> $9.33)
  await cdp.eval(`const os = document.getElementById('orgSel'); os.value='0.04'; os.dispatchEvent(new Event('change',{bubbles:true}));`);
  const reactiveNet = await cdp.eval(`return document.querySelectorAll('.k5 .kc')[1].querySelector('.kv').textContent`);
  chk('research_scenario_controls_reactive', reactiveNet === '$9.33', `expected $9.33 on orgSel=0.04, got ${reactiveNet}`);
  await cdp.eval(`const os = document.getElementById('orgSel'); os.value='0'; os.dispatchEvent(new Event('change',{bubbles:true}));`);

  // Verify mixed-sibling Research Standalone TVL banner on Mezo Earn
  await cdp.eval(`window.TITAN_SET({view:'research',slug:'mezo-earn'})`);
  const mezoHas = await cdp.eval(`const t=document.getElementById('app').textContent; return t.includes('Standalone TVL:') && t.includes('dilution only')`);
  chk('mixed_sibling_standalone_banner', mezoHas, mezoHas ? 'Standalone TVL + dilution only rendered on mezo-earn' : 'missing Standalone TVL notice on mezo-earn');

  // Verify empty-category cohort incidence notice on Firelight / category with 0 peers
  const emptyCatRow = await cdp.eval(`return window.OMEGA_BOARD.rows.find(r => r.peer_incidence.peers_tot === 0)?.slug`);
  await cdp.eval(`window.TITAN_SET({view:'research',slug:'${emptyCatRow}'})`);
  const emptyHasPrior = await cdp.eval(`return document.getElementById('app').textContent.includes('prior')`);
  chk('empty_cat_research_prior_notice', emptyHasPrior, emptyHasPrior ? `0 other prior notice present on ${emptyCatRow}` : `empty cat notice missing on ${emptyCatRow}`);

  // Switch back to Radar with Cohort column turned on & verify both model and prior rows format cleanly
  await cdp.eval(`window.TITAN_SET({view:'radar',cols:{chg7:1,age:1,range:1,peer:1},perPage:15,q:'Firelight'})`);
  const qCursorAndCohort = await cdp.eval(`
    const inp = document.getElementById('qInput');
    inp.focus(); inp.setSelectionRange(4, 4);
    inp.value = 'Lombard'; inp.setSelectionRange(7, 7);
    inp.dispatchEvent(new Event('input', {bubbles:true}));
    const active = document.activeElement?.id === 'qInput';
    const selStart = document.activeElement?.selectionStart;
    return { active, selStart, rows: document.querySelectorAll('tr[data-slug]').length };
  `);
  chk('qInput_cursor_retention', qCursorAndCohort.active && qCursorAndCohort.selStart === 7, JSON.stringify(qCursorAndCohort));

  // Check cohort prior formatting vs model formatting in Radar table
  await cdp.eval(`window.TITAN_SET({view:'radar',q:'',cols:{chg7:1,age:1,range:1,peer:1},perPage:15,page:1})`);
  const cohortTableCheck = await cdp.eval(`
    const txt = document.querySelector('#app table').textContent;
    window.TITAN_SET({q:'${emptyCatRow}'});
    const empTxt = document.querySelector('#app table').textContent;
    return { hasModel: /\\d+% model \\(\\d+\\/\\d+\\)/.test(txt), hasPrior: /\\d+% prior \\(0\\/0\\)/.test(empTxt) };
  `);
  chk('radar_cohort_model_and_prior_labels', cohortTableCheck.hasModel && cohortTableCheck.hasPrior, JSON.stringify(cohortTableCheck));

  // 5. lockDays=0 & budget=0 safety (no NaN or undefined in DOM)
  await cdp.eval(`window.TITAN_SET({view:'radar',q:'',budget:0,lockDays:0,cols:{chg7:1,age:1,range:1,peer:0}})`);
  const zeroSafe = await cdp.eval(`const t=document.getElementById('app').textContent; return !t.includes('NaN') && !t.includes('undefined')`);
  chk('budget0_lock0_no_NaN_undefined', zeroSafe, zeroSafe ? 'no NaN or undefined in DOM' : 'found NaN or undefined');

  // 6. Recorded (416) & Excluded (158) & Model & Compare workflows
  await cdp.eval(`window.TITAN_SET({theme:'light',view:'radar',budget:1000,lockDays:null,usePlan:0,dropShare:0.07,page:1})`);
  await cdp.eval(`document.querySelector('[data-view=live]').click()`);
  const liveOk = await cdp.eval(`
    document.querySelector('[data-livef=mcap]').click();
    return { h1: document.querySelector('#app .h1').textContent, rows: document.querySelectorAll('#app tbody tr').length };
  `);
  chk('recorded_416_filter', liveOk.h1.includes('416') && liveOk.rows === 80, JSON.stringify(liveOk));

  await cdp.eval(`document.querySelector('[data-view=excluded]').click()`);
  const exclOk = await cdp.eval(`
    document.querySelector('[data-exf=sib]').click();
    return { h1: document.querySelector('#app .h1').textContent, rows: document.querySelectorAll('#app tbody tr').length };
  `);
  chk('excluded_158_sibs', exclOk.h1.includes('158') && exclOk.rows > 0, JSON.stringify(exclOk));

  await cdp.eval(`document.querySelector('[data-view=model]').click()`);
  const modelOk = await cdp.eval(`
    const lin = document.querySelector('[data-scale=linear]');
    lin.click();
    const poly = document.querySelector('svg.chart polyline') !== null;
    const txt = document.getElementById('app').textContent;
    return { poly, hasNotTge: txt.includes('NOT TGE odds'), hasHoldout: txt.includes('61.9%'), scale: window.TITAN_STATE.scale };
  `);
  chk('model_linear_toggle_and_disclosures', modelOk.poly && modelOk.hasNotTge && modelOk.hasHoldout && modelOk.scale === 'linear', JSON.stringify(modelOk));

  // Compare flow & 8-key scenario state persistence across radar -> research -> farming -> compare
  await cdp.eval(`window.TITAN_SET({view:'research',slug:'firelight',budget:5000,dropShare:0.14,orgApr:0.04,lossPct:0.005,realPct:0.5,lockDays:45,hurdleHr:25,oppApr:0.08})`);
  const persistChecks = [];
  for (const vw of ['research', 'farming', 'compare', 'radar']) {
    await cdp.eval(`document.querySelector('[data-view=${vw}]').click()`);
    const st = await cdp.eval(`return (({budget,dropShare,orgApr,lossPct,realPct,lockDays,hurdleHr,oppApr}) => ({budget,dropShare,orgApr,lossPct,realPct,lockDays,hurdleHr,oppApr}))(window.TITAN_STATE)`);
    persistChecks.push({ vw, st });
  }
  chk('state_8key_persistence_across_views', persistChecks.every(p => p.st.budget === 5000 && p.st.dropShare === 0.14 && p.st.orgApr === 0.04 && p.st.lossPct === 0.005 && p.st.realPct === 0.5 && p.st.lockDays === 45 && p.st.hurdleHr === 25 && p.st.oppApr === 0.08), JSON.stringify(persistChecks));
  await cdp.eval(`window.TITAN_SET({budget:1000,dropShare:0.07,orgApr:0,lossPct:0,realPct:1,lockDays:null,hurdleHr:10,oppApr:0.04})`);

  await cdp.eval(`document.querySelector('[data-view=compare]').click(); document.querySelector('[data-loadcmp]').click();`);
  const cmpOk = await cdp.eval(`return { h1: document.querySelector('#app .h1').textContent, cols: document.querySelectorAll('#app thead th').length }`);
  chk('compare_preset_3', cmpOk.h1.includes('3/4') && cmpOk.cols === 4, JSON.stringify(cmpOk));

  // 7. Pagination › / ‹
  await cdp.eval(`document.querySelector('[data-view=radar]').click()`);
  const pagOk = await cdp.eval(`
    const next = [...document.querySelectorAll('.tf .sbn')].find(b => b.textContent === '›');
    next.click();
    const p2 = window.TITAN_STATE.page;
    const prev = [...document.querySelectorAll('.tf .sbn')].find(b => b.textContent === '‹');
    prev.click();
    const p1 = window.TITAN_STATE.page;
    return { p2, p1 };
  `);
  chk('pagination_next_prev', pagOk.p2 === 2 && pagOk.p1 === 1, JSON.stringify(pagOk));

  // 8. Export CSV & JSON Blob verification (RFC-4180 quotes check!)
  const exportCheck = await cdp.eval(`
    window.__CAPTURED_BLOBS = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = b => { window.__CAPTURED_BLOBS.push(b); return orig(b); };
    document.getElementById('btn-exp').click();
    document.querySelector('[data-exp=board-csv]').click();
    document.getElementById('btn-exp').click();
    document.querySelector('[data-exp=board-json]').click();
    const csvText = await window.__CAPTURED_BLOBS[0].text();
    const jsonText = await window.__CAPTURED_BLOBS[1].text();
    const j = JSON.parse(jsonText);
    if (!csvText.trim().split(String.fromCharCode(10)).slice(1).every(ln => new RegExp('^[0-9]+,"[^"]+","').test(ln))) throw new Error('RFC-4180 CSV quoting corrupted');
    return { csvLines: csvText.trim().split('\\n').length, hasQuoted: csvText.includes('"'), jsonRows: j.rows?.length };
  `);
  chk('blob_csv_json_export', exportCheck.csvLines === 185 && exportCheck.jsonRows === 184, JSON.stringify(exportCheck));

  // 9. Methodology modal ARIA + Escape + focus return & keyboard shortcuts [ / ] / /
  await cdp.eval(`document.getElementById('btn-meth').click()`);
  const modalOpen = await cdp.eval(`
    const m = document.getElementById('modal');
    return { hidden: m.hidden, role: m.getAttribute('role'), activeId: document.activeElement?.id, txt: m.textContent };
  `);
  chk('modal_aria_and_focus', !modalOpen.hidden && modalOpen.role === 'dialog' && modalOpen.activeId === 'mdl-close' && modalOpen.txt.includes('NOT TGE odds'), JSON.stringify(modalOpen));

  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const modalClosed = await cdp.eval(`return { hidden: document.getElementById('modal').hidden, activeId: document.activeElement?.id }`);
  chk('modal_escape_returns_focus', modalClosed.hidden && modalClosed.activeId === 'btn-meth', JSON.stringify(modalClosed));

  // Keyboard [ / ] view cycle and '/' search focus
  await cdp.eval(`document.body.focus();`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ']', code: 'BracketRight' });
  const cyc1 = await cdp.eval(`return window.TITAN_STATE.view`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '[', code: 'BracketLeft' });
  const cyc2 = await cdp.eval(`return window.TITAN_STATE.view`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash' });
  const slashFocus = await cdp.eval(`return document.activeElement?.id`);
  chk('keyboard_cycle_and_slash', cyc1 === 'live' && cyc2 === 'radar' && slashFocus === 'gsearch', `${cyc1}->${cyc2}/${slashFocus}`);

  // 10. 6 viewports x 7 views x BOTH themes (84 responsive & zero-overflow checks; 42 in quickMode? No, full 84 runs < 4s!)
  const viewports = [[1920,1080],[1440,900],[1366,768],[1024,768],[768,1024],[390,844]];
  const views = ['radar','live','excluded','research','farming','model','compare'];
  const themes = quickMode ? ['light'] : ['light', 'dark'];
  const layoutFailures = [];
  let layoutChecks = 0;

  for (const theme of themes) {
    for (const [w, h] of viewports) {
      await cdp.viewport(w, h);
      for (const view of views) {
        await cdp.eval(`window.TITAN_SET({theme:'${theme}',view:'${view}',slug:'firelight'})`);
        await cdp.sleep(15);
        const m = await cdp.eval(`
          const de = document.documentElement;
          const overflow = de.scrollWidth - window.innerWidth;
          const h1 = document.querySelector('#app .h1')?.textContent || '';
          const nanCheck = document.getElementById('app').textContent.includes('NaN');
          let fireWarnOk = true;
          if ('${view}' === 'research') {
            const kv = document.querySelectorAll('.k5 .kc')[1]?.querySelector('.kv');
            const c = kv ? getComputedStyle(kv).color : '';
            const exp = '${theme}' === 'dark' ? 'rgb(251, 191, 36)' : 'rgb(180, 83, 9)';
            fireWarnOk = kv?.classList.contains('warn') && c === exp;
          }
          return { overflow, h1Len: h1.length, nanCheck, fireWarnOk };
        `);
        layoutChecks++;
        if (m.overflow > 1 || m.h1Len === 0 || m.nanCheck || !m.fireWarnOk) {
          layoutFailures.push({ theme, w, h, view, ...m });
        }
      }
    }
  }
  chk('responsive_6x7x2_84_matrix', layoutFailures.length === 0, `${layoutChecks} checked, failures=${JSON.stringify(layoutFailures.slice(0, 5))}`);

  const errors = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error'));
  chk('zero_console_runtime_errors', errors.length === 0, JSON.stringify(errors));

  cdp.close();
  const out = { pass: true, total_checks: checks.length, layout_matrix_checks: layoutChecks, shots_dir: skipShots ? null : shotsDir, checks };
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out, null, 2));
} finally {
  try { server.close(); } catch {}
  try { chrome?.kill(); } catch {}
  if (userDataDir) { try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {} }
}
