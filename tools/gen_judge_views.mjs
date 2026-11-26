import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9285;
const ROOT = process.cwd().replace(/\\/g, '/');
const d = JSON.parse(fs.readFileSync('v4_2_candidate/evidence/win_out_1/dossier.json', 'utf8'));
const covIdx = Number.isInteger(d.cover) ? d.cover : 0;
const rest = d.images.filter((_, i) => i !== covIdx);

const html = `<!doctype html><html><body><script>
window.renderSheet = async (imgs, w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  const pw = Math.floor(w / imgs.length);
  for (let i = 0; i < imgs.length; i++) {
    const im = new Image();
    await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = 'data:' + imgs[i].media_type + ';base64,' + imgs[i].base64; });
    ctx.drawImage(im, i * pw, 0, pw, h);
  }
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
};
</script></body></html>`;
fs.writeFileSync('v4_2_candidate/evidence/jv_sheet.html', html);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${ROOT}/v4_2_candidate/evidence/jv_tmp`, 'about:blank',
], { stdio: 'ignore' });

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (j[0]?.webSocketDebuggerUrl) return j[0].webSocketDebuggerUrl; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('timeout');
}

try {
  const ws = new WebSocket(await getWs());
  let id = 0; const pk = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pk.has(m.id)) { pk.get(m.id)(m.result); pk.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  const send = (m, p = {}) => new Promise((r) => { pk.set(++id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `file:///${ROOT}/v4_2_candidate/evidence/jv_sheet.html` });
  await new Promise((r) => setTimeout(r, 300));
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
  const covB64 = await ev(`window.renderSheet(${JSON.stringify([d.images[covIdx]])}, 1440, 900)`);
  const shB64 = await ev(`window.renderSheet(${JSON.stringify(rest)}, 1024, 319)`);
  fs.writeFileSync('v4_2_candidate/evidence/v4_2_judge_view_cover.jpg', Buffer.from(covB64, 'base64'));
  fs.writeFileSync('v4_2_candidate/evidence/v4_2_judge_view_sheet.jpg', Buffer.from(shB64, 'base64'));
  console.log('cover:', fs.statSync('v4_2_candidate/evidence/v4_2_judge_view_cover.jpg').size, 'sheet:', fs.statSync('v4_2_candidate/evidence/v4_2_judge_view_sheet.jpg').size);
  ws.close();
} finally {
  chrome.kill();
  fs.rmSync('v4_2_candidate/evidence/jv_sheet.html', { force: true });
}
