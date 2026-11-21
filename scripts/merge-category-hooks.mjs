#!/usr/bin/env node
// Merge the library-row fields into the live meta.json, on each
// `<Folder>/_folder` entry:
//   hook_ko / hook_en  — the headline, from data/category-hooks.json
//   qtx                — true for categories curated for QTX PEMF output,
//                        marked qtx: true in the same file
//
// meta.json is MERGED, never replaced. It was once clobbered from ~200 entries
// to 45 by an upload step that wrote what it had instead of what was there.
// So this script:
//   1. GETs the live file and writes a timestamped backup OUTSIDE the repo
//      (the repo is public),
//   2. touches only hook_ko / hook_en / qtx, and only on folders that exist,
//   3. refuses to upload if the entry count changes or any other field moves,
//   4. reads the file back after upload and checks the hooks landed.
//
//   node scripts/merge-category-hooks.mjs            # dry run: prints the diff
//   node scripts/merge-category-hooks.mjs --write    # backs up, uploads, verifies
//
// Needs SUPABASE_SERVICE_ROLE_KEY (read from .env if not in the environment).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://xdjgumqdwedgzwqturcx.supabase.co/storage/v1/object';
const PUBLIC_URL = `${BASE}/public/media/meta.json`;
const UPLOAD_URL = `${BASE}/media/meta.json`;
const BACKUP_DIR = path.join(os.homedir(), '5do-backups');
const WRITE = process.argv.includes('--write');

const ROW_FIELDS = ['hook_ko', 'hook_en', 'qtx'];

// QTX is curation, not inventory: a category is marked because it was put
// together for QTX PEMF output, whether or not each track also ships a _qtx
// file. An earlier version derived it from the storage listing, which marked
// White Noise and left out OPEF — the opposite of what the badge is for.
export function mergeHooks(meta, hooks) {
  const out = structuredClone(meta);
  const changes = [];
  const missing = [];
  for (const [folder, h] of Object.entries(hooks)) {
    if (folder.startsWith('_')) continue;
    const key = `${folder}/_folder`;
    if (!out[key]) { missing.push(folder); continue; }
    for (const [lang, field] of [['ko', 'hook_ko'], ['en', 'hook_en']]) {
      if (out[key][field] !== h[lang]) {
        changes.push({ key, field, from: out[key][field] ?? null, to: h[lang] });
        out[key][field] = h[lang];
      }
    }
    const qtx = h.qtx === true;
    if (out[key].qtx !== qtx) {
      changes.push({ key, field: 'qtx', from: out[key].qtx ?? null, to: qtx });
      out[key].qtx = qtx;
    }
  }
  return { out, changes, missing };
}

// Everything except the two hook fields must be byte-for-byte unchanged.
export function onlyHooksMoved(before, after) {
  const strip = (m) => JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => {
    if (!k.endsWith('/_folder') || !v || typeof v !== 'object') return [k, v];
    const rest = { ...v };
    for (const f of ROW_FIELDS) delete rest[f];
    return [k, rest];
  })));
  return Object.keys(before).length === Object.keys(after).length && strip(before) === strip(after);
}

function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const env = path.join(ROOT, '.env');
  if (!fs.existsSync(env)) return '';
  const line = fs.readFileSync(env, 'utf8').split('\n').find((l) => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

async function getLive() {
  const r = await fetch(`${PUBLIC_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`GET meta.json → ${r.status}`);
  return r.json();
}

async function main() {
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/category-hooks.json'), 'utf8'));
  const live = await getLive();
  console.log(`QTX-curated: ${Object.keys(hooks).filter((f) => hooks[f].qtx === true).join(', ') || '(none)'}`);
  const { out, changes, missing } = mergeHooks(live, hooks);

  console.log(`live entries: ${Object.keys(live).length}`);
  if (missing.length) console.log(`no _folder entry for (skipped): ${missing.join(', ')}`);
  for (const c of changes) console.log(`  ${c.key}.${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  console.log(`${changes.length} field(s) to change`);

  if (!onlyHooksMoved(live, out)) throw new Error('refusing: something other than the row fields would change');
  if (!WRITE || !changes.length) { console.log(WRITE ? 'nothing to do' : '(dry run — pass --write to upload)'); return; }

  const key = serviceKey();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `meta-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(live, null, 2));
  console.log(`backup: ${backup}`);

  const r = await fetch(UPLOAD_URL, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      'Cache-Control': 'max-age=60',
    },
    body: JSON.stringify(out),
  });
  if (!r.ok) throw new Error(`upload → ${r.status} ${await r.text()}`);

  const back = await getLive();
  const ok = Object.keys(back).length === Object.keys(out).length
    && changes.every((c) => back[c.key] && back[c.key][c.field] === c.to);
  console.log(ok ? `verified: ${Object.keys(back).length} entries, hooks present`
                 : 'WARNING: read-back does not match yet (CDN cache?) — re-run the dry run in a minute');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
