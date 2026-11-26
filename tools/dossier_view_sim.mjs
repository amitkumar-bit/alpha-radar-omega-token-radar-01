import fs from 'node:fs';
import path from 'node:path';

// Simulates dossier-view/v1 12,288-token text visibility budget at 1440x900 (28,356 jsonBytes for text)
// matching token-radar-01-kit-v48/research/tools/verify_phase01_synthesis.mjs
const dossier = JSON.parse(fs.readFileSync('v4_candidate/evidence/win_out_1/dossier.json', 'utf8'));
const dashDir = 'v4_candidate/dashboard';
const files = fs.readdirSync(dashDir).sort(); // lexicographical byCodeUnit: analysis.js, app.js, index.html, styles.css
const BUDGET_JSON_BYTES = (12288 - 2836) * 3; // 28,356
const headerSample = '[dossier-view/v1 · text whole · 3 screenshots shown below in 2 images (1 cover + 1 sheet)]\n';
const wholeBytes = Buffer.byteLength(JSON.stringify(headerSample + dossier.text), 'utf8') - 2;

const perFile = files.map((f) => {
  const src = fs.readFileSync(path.join(dashDir, f), 'utf8');
  return { file: f, bytes: Buffer.byteLength(src, 'utf8'), lines: src.split('\n').length };
});

// Check how much fits chronologically inside BUDGET_JSON_BYTES when files sorted byCodeUnit
let rem = BUDGET_JSON_BYTES - Buffer.byteLength(headerSample, 'utf8') - 256;
const visibility = [];
for (const pf of perFile) {
  const src = fs.readFileSync(path.join(dashDir, pf.file), 'utf8');
  const fns = [...src.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
  const jBytes = Buffer.byteLength(JSON.stringify(src), 'utf8') - 2;
  if (rem >= jBytes) {
    rem -= jBytes;
    visibility.push({ file: pf.file, status: 'WHOLE_VISIBLE', bytes: pf.bytes, visible_functions: fns });
  } else if (rem > 0) {
    const ratio = rem / jBytes;
    const visLines = Math.floor(pf.lines * ratio);
    const lines = src.split('\n').slice(0, visLines).join('\n');
    const visFns = fns.filter((fn) => lines.includes(`function ${fn}(`));
    visibility.push({ file: pf.file, status: `PARTIAL (~${Math.round(ratio * 100)}%, ${visLines}/${pf.lines} lines)`, bytes: pf.bytes, visible_functions: visFns, omitted_functions: fns.filter((x) => !visFns.includes(x)) });
    rem = 0;
  } else {
    visibility.push({ file: pf.file, status: 'DECLS_OR_OMITTED_IN_WHOLE_PASS', bytes: pf.bytes, visible_functions: [] });
  }
}

const out = {
  buildDossier_text_bytes: Buffer.byteLength(dossier.text, 'utf8'),
  buildDossier_cap_bytes: 65536,
  buildDossier_headroom_bytes: 65536 - Buffer.byteLength(dossier.text, 'utf8'),
  buildDossier_cut: dossier.text.includes('[Cut at'),
  dossier_view_1440x900_budget_json_bytes: BUDGET_JSON_BYTES,
  dossier_text_json_bytes: wholeBytes,
  form_guess: wholeBytes <= BUDGET_JSON_BYTES ? 'whole' : 'bodies/decls (lexicographical fill)',
  lexicographical_visibility: visibility,
};
fs.writeFileSync('v4_candidate/evidence/dossier_visibility_audit.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
