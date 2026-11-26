import fs from 'node:fs';

// Verifies actual emitted UTF-8 text inside dossier.json against:
// 1) buildDossier 65,536 B cap
// 2) dossier-view/v1 12,288-token cap at 1440x900 (28,356 jsonBytes after 2,836 image tokens)
const dossier = JSON.parse(fs.readFileSync('v4_2_candidate/evidence/win_out_1/dossier.json', 'utf8'));
const jsonBytes = (s) => Buffer.byteLength(JSON.stringify(s), 'utf8') - 2;
const BUDGET_JSON_BYTES = (12288 - 2836) * 3; // 28,356 jsonBytes at 1440x900
const viewHeader = '[dossier-view/v1 · text prefix · 3 screenshots shown below in 2 images (1 cover + 1 sheet)]\n';

// Binary-search exact prefix of actual dossier.text that fits within 28,356 jsonBytes
const raw = dossier.text;
let lo = 0, hi = raw.length;
while (lo < hi) {
  const mid = Math.ceil((lo + hi) / 2);
  if (jsonBytes(viewHeader + raw.slice(0, mid)) <= BUDGET_JSON_BYTES) lo = mid;
  else hi = mid - 1;
}
const emittedText = raw.slice(0, lo);

// Extract balanced top-level or named functions from actual emittedText
function checkFunctionBody(name) {
  const rx = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = rx.exec(emittedText);
  if (!m) return { name, status: 'OMITTED', emitted_chars: 0 };
  let idx = emittedText.indexOf('{', m.index);
  if (idx < 0) return { name, status: 'SIGNATURE_ONLY', emitted_chars: emittedText.length - m.index };
  let depth = 0, q = null, esc = false;
  for (let i = idx; i < emittedText.length; i++) {
    const ch = emittedText[i];
    if (esc) { esc = false; continue; }
    if (q) { if (ch === '\\') esc = true; else if (ch === q) q = null; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { name, status: 'COMPLETE_BODY', emitted_chars: i - m.index + 1 };
    }
  }
  return { name, status: 'PARTIAL_BODY', emitted_chars: emittedText.length - m.index };
}

const targets = [
  'fitModel',
  'decomposeLog',
  'buildFullBoard',
  'computeOosLadder',
  'calcEconomics',
  'computeStrictAudit',
  'verifyBoardUiParity',
  'auditFarmingPlaybook',
  'rRad',
  'rRes',
  'rFrm',
];

const sections = [...raw.matchAll(/^### ([^\r\n]+)/gm)].map((m, idx, arr) => {
  const start = m.index;
  const end = idx + 1 < arr.length ? arr[idx + 1].index : raw.length;
  const sec = raw.slice(start, end);
  const shown = Math.max(0, Math.min(end, lo) - start);
  return {
    file: `dashboard/${m[1]}`,
    raw_bytes: Buffer.byteLength(sec, 'utf8'),
    emitted_bytes: Buffer.byteLength(raw.slice(start, start + shown), 'utf8'),
    status: shown >= sec.length ? 'WHOLE_VISIBLE' : shown > 0 ? 'PARTIAL_PREFIX' : 'OMITTED_BEYOND_28356_JSON_BYTES',
  };
});

const out = {
  buildDossier_text_bytes: Buffer.byteLength(raw, 'utf8'),
  buildDossier_cap_bytes: 65536,
  buildDossier_headroom_bytes: 65536 - Buffer.byteLength(raw, 'utf8'),
  buildDossier_cut: raw.includes('[Cut at'),
  dossier_view_1440x900_budget_json_bytes: BUDGET_JSON_BYTES,
  whole_text_json_bytes: jsonBytes(viewHeader + raw),
  emitted_prefix_utf8_bytes: Buffer.byteLength(emittedText, 'utf8'),
  emitted_prefix_json_bytes: jsonBytes(viewHeader + emittedText),
  per_file_actual_visibility: sections,
  target_function_visibility: targets.map(checkFunctionBody),
  emitted_tail_preview: emittedText.slice(-180),
};
fs.writeFileSync('v4_2_candidate/evidence/dossier_visibility_audit.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
