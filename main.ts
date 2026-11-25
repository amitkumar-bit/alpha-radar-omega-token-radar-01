// OMEGA V2 — TITAN Entrypoint (Node 22, zero dependencies beyond stdlib)
// Reads --input <snapshot.json|dir> (default /input/snapshot.json), writes board.json, data.js, dashboard/, screenshots/, dossier.json.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { WATCHLIST_SPECS } from './lib/watchlist_specs.ts';
import { buildAllSpecs } from './lib/farm_specs.ts';
import OMEGA from './dashboard/engine.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function boardIssue(rows: any[], snapshot: any): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board row count ${rows.length} outside [100, 4000]`;
  const slugs = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s: string) => !slugs.has(s));
  if (missing.length > 0) return `misses ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `rank mismatch at ${i}: got ${r.rank}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `non-monotonic rank at ${r.slug}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `invalid implied_value_usd on ${r.slug}`;
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) return `bad farm_steps count on ${r.slug}`;
    for (const s of r.farm_steps) {
      if (typeof s !== 'string' || s.length < 20 || s.length > 600) return `bad farm_step length on ${r.slug}: ${String(s).length}`;
    }
  }
  return null;
}

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const p = join(from, name);
    if (!statSync(p).isFile()) continue;
    copyFileSync(p, join(to, name));
    copied.push(name);
  }
  return copied;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`omega-v2: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const rawSnap = readFileSync(inputFile, 'utf8');
const snapshot = JSON.parse(rawSnap);
const snapSha256 = createHash('sha256').update(rawSnap).digest('hex');

const allSpecs = buildAllSpecs(snapshot, WATCHLIST_SPECS);
const boardModel = OMEGA.buildFullBoard(snapshot, allSpecs);
const issue = boardIssue(boardModel.rows, snapshot);
if (issue !== null) {
  process.stderr.write(`omega-v2: gate issue: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const boardJson = `${JSON.stringify({ rows: boardModel.rows })}\n`;
writeFileSync(join(out, 'board.json'), boardJson);
const boardSha256 = createHash('sha256').update(boardJson).digest('hex');

const dataBundle = {
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor_usd: snapshot.floor_usd,
  watchlist: snapshot.watchlist,
  protocols: snapshot.protocols,
  wl_specs: allSpecs,
  board_sha256: boardSha256,
  snapshot_sha256: snapSha256,
  precomputed_rows_digest: boardModel.rows.map((r: any) => ({
    rank: r.rank, slug: r.slug, implied_value_usd: r.implied_value_usd,
  })),
};
writeFileSync(join(out, 'data.js'), `window.RADAR_DATA=${JSON.stringify(dataBundle)};\n`);

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`omega-v2: invalid screenshot filename ${name}\n`);
    process.exit(1);
  }
}

if (shots.length >= 3) {
  const dossier = buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  });
  writeFileSync(join(out, 'dossier.json'), dossier);
} else if (!process.argv.includes('--allow-no-shots')) {
  process.stderr.write(`omega-v2: screenshots/ holds ${shots.length} images (need >= 3)\n`);
  process.exit(1);
}

process.stdout.write(
  `omega-v2: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist (${boardModel.audit_summary.wl}/40 ranked), ${boardModel.rows.length} rows, audit_sum=${boardModel.audit_summary.total}\n`,
);
