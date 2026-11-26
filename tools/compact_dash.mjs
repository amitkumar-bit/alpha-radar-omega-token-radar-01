import fs from 'node:fs';
import path from 'node:path';

const dir = 'v4_2_candidate/dashboard';

// --- CSS compactor ---
function compactCss(src) {
  // Remove comments
  let o = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove unnecessary whitespace around selectors/properties
  o = o.replace(/\s*\n\s*/g, '');
  // Remove spaces around : ; { } , > + ~
  o = o.replace(/\s*([{};:,>+~])\s*/g, '$1');
  // Remove trailing semicolons before }
  o = o.replace(/;}/g, '}');
  // Remove leading/trailing whitespace
  o = o.trim();
  return o + '\n';
}

// --- JS compactor: preserves strings/templates exactly ---
function compactJs(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('//')) continue;
    // Strip inline // comments outside strings
    let s = '', q = null, esc = false, td = 0;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (esc) { s += ch; esc = false; continue; }
      if (q === '`') {
        s += ch;
        if (ch === '\\') { esc = true; continue; }
        if (ch === '$' && l[i + 1] === '{') { s += '{'; i++; td++; q = null; continue; }
        if (ch === '`') q = null;
        continue;
      }
      if (q) { s += ch; if (ch === '\\') esc = true; else if (ch === q) q = null; continue; }
      if (ch === '\'' || ch === '"' || ch === '`') { q = ch; s += ch; continue; }
      if (ch === '}' && td > 0) { s += '}'; td--; q = '`'; continue; }
      if (ch === '/' && l[i + 1] === '/') break; // strip trailing // comment
      if (ch === ' ') {
        const prev = s[s.length - 1] || '', nxt = l[i + 1] || '';
        const a = /[A-Za-z0-9_$]/.test(prev), b = /[A-Za-z0-9_$]/.test(nxt);
        if ((a && b) || /return$|else$|case$|typeof$|throw$|new$|in$|of$/.test(s)) s += ' ';
        else if (/[=:+\-*<>!&|?,;{}\[\]()]/.test(prev) || /[=:+\-*<>!&|?,;{}\[\]()]/.test(nxt)) {
          // safe to drop
        } else s += ' ';
      } else {
        s += ch;
      }
    }
    s = s.replace(/\(([A-Za-z_$][\w$]*)\)=>/g, '$1=>').replace(/;}/g, '}');
    const isTopDecl = /^(function |const |let )/.test(s) && out.length > 0 && /[};]$/.test(out[out.length - 1]);
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

// Compact CSS
const cssPath = path.join(dir, 'styles.css');
const cssBefore = fs.readFileSync(cssPath, 'utf8');
const cssAfter = compactCss(cssBefore);
fs.writeFileSync(cssPath, cssAfter);
console.log('styles.css', cssBefore.length, '->', cssAfter.length);

// Compact JS files
for (const fn of ['analysis.js', 'app.js']) {
  const p = path.join(dir, fn);
  const before = fs.readFileSync(p, 'utf8');
  const after = compactJs(before);
  fs.writeFileSync(p, after);
  console.log(fn, before.length, '->', after.length);
}

const tot = fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
console.log('TOTAL dashboard bytes:', tot, '(headroom vs 65536:', 65536 - tot, ')');
