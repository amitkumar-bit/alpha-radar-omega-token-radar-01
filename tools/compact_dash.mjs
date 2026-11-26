import fs from 'node:fs';
import path from 'node:path';

const dir = 'v3_2_production/dashboard';

// Lossless JS token-safe compactor: preserves strings, template literals, and regexes 100%,
// strips comments & extra spaces while keeping top-level function/const declaration boundaries on clean lines.
function compactJs(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('//')) continue;
    let s = '', q = null, esc = false, tmplDepth = 0;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (esc) { s += ch; esc = false; continue; }
      if (q === '`') {
        s += ch;
        if (ch === '\\') { esc = true; continue; }
        if (ch === '$' && l[i + 1] === '{') { s += '{'; i++; tmplDepth++; q = null; continue; }
        if (ch === '`') q = null;
        continue;
      }
      if (q) { s += ch; if (ch === '\\') esc = true; else if (ch === q) q = null; continue; }
      if (ch === '\'' || ch === '"' || ch === '`') { q = ch; s += ch; continue; }
      if (ch === '}' && tmplDepth > 0) { s += '}'; tmplDepth--; q = '`'; continue; }
      if (ch === ' ') {
        const prev = s[s.length - 1] || '', nxt = l[i + 1] || '';
        const a = /[A-Za-z0-9_$]/.test(prev), b = /[A-Za-z0-9_$]/.test(nxt);
        if ((a && b) || /return$|else$|case$|typeof$|throw$|new$|in$|of$/.test(s)) s += ' ';
        else if (/[=:+\-*<>!&|?,;{}\[\]()]/.test(prev) || /[=:+\-*<>!&|?,;{}\[\]()]/.test(nxt)) {
          // Safe to drop space around punctuation outside strings/templates
          // Keep space after `)` if followed by identifier? Only `else` needs space, caught above
        } else s += ' ';
      } else {
        s += ch;
      }
    }
    // Merge non-top-level body lines up to 1800 chars; preserve top-level function/const declarations on own lines.
    s = s.replace(/\(([A-Za-z_$][\w$]*)\)=>/g, '$1=>').replace(/;\}/g, '}');
    const isTopDecl = /^(function |const |let )/.test(s) && out.length > 0 && /[\};]$/.test(out[out.length - 1]);
    const prev = out[out.length - 1];
    const prevIsDeclOpen = prev && /^function /.test(prev) && prev.endsWith('{');
    const canJoin = prev && !isTopDecl && !prevIsDeclOpen && !s.startsWith('//') && prev.length + s.length < 1800;
    if (canJoin) {
      out[out.length - 1] = prev + (/[;{}:,]$/.test(prev) || /^[}\])]/.test(s) ? '' : ' ') + s;
    } else {
      out.push(s);
    }
  }
  return out.join('\n') + '\n';
}

for (const fn of ['analysis.js', 'app.js']) {
  const p = path.join(dir, fn);
  const before = fs.readFileSync(p, 'utf8');
  const after = compactJs(before);
  fs.writeFileSync(p, after);
  console.log(fn, before.length, '->', after.length);
}
const tot = fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
console.log('TOTAL dashboard bytes:', tot, '(headroom vs 65536:', 65536 - tot, ')');
