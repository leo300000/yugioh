#!/usr/bin/env node
// Construit le site statique dans dist/ :
//  - télécharge les données de l'API YGOPRODeck (3 appels seulement)
//  - télécharge les images manquantes dans .cache/img (jamais de hotlink)
//  - écrit data/*.json et copie site/ + images dans dist/
//
// Variables d'environnement :
//   SKIP_IMAGES=1        ne télécharge aucune image (build rapide en local)
//   IMG_CONCURRENCY=6    téléchargements en parallèle
//   IMG_DELAY_MS=400     pause par worker entre deux images (reste sous 20 req/s)

import { mkdir, writeFile, readdir, cp, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.join(ROOT, 'dist');
const CACHE_IMG = path.join(ROOT, '.cache', 'img');

const API = 'https://db.ygoprodeck.com/api/v7';
const IMG_BASE = 'https://images.ygoprodeck.com/images/cards_small';
const CONCURRENCY = Number(process.env.IMG_CONCURRENCY || 6);
const DELAY_MS = Number(process.env.IMG_DELAY_MS || 400);
const SKIP_IMAGES = process.env.SKIP_IMAGES === '1';
const UA = 'ygo-classeur/1.0 (site de fan statique)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { tries = 4, as = 'json' } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return as === 'json' ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url} : ${err.message}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
}

const validDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !d.startsWith('0000') ? d : null);

// ---------- 1. Données ----------
console.log('→ Cartes (anglais)…');
const en = (await get(`${API}/cardinfo.php`))?.data;
if (!Array.isArray(en) || en.length < 1000) throw new Error('Réponse cardinfo.php inattendue');
await sleep(500);

console.log('→ Cartes (français)…');
let fr = [];
try {
  fr = (await get(`${API}/cardinfo.php?language=fr`))?.data ?? [];
} catch (err) {
  console.warn(`  Noms français indisponibles, on continue en anglais (${err.message})`);
}
await sleep(500);

console.log('→ Extensions…');
const setList = (await get(`${API}/cardsets.php`)) ?? [];

// ---------- 2. Cartes ----------
const frById = new Map(fr.map((c) => [c.id, c]));
const cards = {};
const texts = {};
for (const c of en) {
  const f = frById.get(c.id);
  const o = { n: c.name, t: c.type, f: c.frameType, i: c.card_images?.[0]?.id ?? c.id };
  if (f?.name && f.name !== c.name) o.nf = f.name;
  if (c.attribute) o.a = c.attribute;
  if (c.race) o.r = c.race;
  if (c.level != null) o.l = c.level;
  if (c.atk != null) o.atk = c.atk;
  if (c.def != null) o.def = c.def;
  if (c.linkval != null) o.lv = c.linkval;
  if (c.scale != null) o.sc = c.scale;
  if (c.archetype) o.ar = c.archetype;
  cards[c.id] = o;
  texts[c.id] = f?.desc && f.desc !== c.desc ? [c.desc, f.desc] : [c.desc];
}

// ---------- 3. Extensions ----------
const used = new Set();
const slug = (s) => String(s).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'set';
function uniqueId(base) {
  const b = slug(base);
  let id = b;
  for (let k = 2; used.has(id); k++) id = `${b}-${k}`;
  used.add(id);
  return id;
}

const byName = new Map();
for (const s of setList) {
  if (!s?.set_name || byName.has(s.set_name)) continue;
  byName.set(s.set_name, { id: uniqueId(s.set_code || s.set_name), c: s.set_code || '', n: s.set_name, d: validDate(s.tcg_date), k: [], seen: new Set() });
}
for (const c of en) {
  for (const p of c.card_sets ?? []) {
    let set = byName.get(p.set_name);
    if (!set) {
      const code = (p.set_code || '').split('-')[0];
      set = { id: uniqueId(code || p.set_name), c: code, n: p.set_name, d: null, k: [], seen: new Set() };
      byName.set(p.set_name, set);
    }
    const key = `${c.id}|${p.set_code}|${p.set_rarity}`;
    if (set.seen.has(key)) continue;
    set.seen.add(key);
    set.k.push([c.id, p.set_code || '', p.set_rarity || '']);
  }
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const sets = [...byName.values()]
  .filter((s) => s.k.length)
  .map(({ seen, ...s }) => {
    s.k.sort((a, b) => collator.compare(a[1], b[1]));
    return s;
  })
  .sort((a, b) => (b.d || '').localeCompare(a.d || '') || collator.compare(a.n, b.n));

console.log(`  ${en.length} cartes, ${sets.length} extensions, ${frById.size} noms français`);

// ---------- 4. Images (cache) ----------
await mkdir(CACHE_IMG, { recursive: true });
const have = new Set(await readdir(CACHE_IMG));
const imageIds = [...new Set(Object.values(cards).map((c) => c.i))];
const todo = SKIP_IMAGES ? [] : imageIds.filter((id) => !have.has(`${id}.jpg`));
console.log(`→ Images : ${imageIds.length - todo.length} déjà en cache, ${todo.length} à télécharger`);

let next = 0;
let done = 0;
let failed = 0;
async function worker() {
  while (next < todo.length) {
    const id = todo[next++];
    try {
      const buf = await get(`${IMG_BASE}/${id}.jpg`, { as: 'buffer', tries: 3 });
      if (buf) {
        const tmp = path.join(CACHE_IMG, `${id}.jpg.part`);
        await writeFile(tmp, buf);
        await rename(tmp, path.join(CACHE_IMG, `${id}.jpg`));
      } else failed++;
    } catch (err) {
      failed++;
      console.warn(`  ${err.message}`);
    }
    if (++done % 500 === 0) console.log(`  ${done}/${todo.length}`);
    await sleep(DELAY_MS);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
if (failed) console.warn(`  ${failed} image(s) introuvable(s), elles s'afficheront comme emplacement vide`);

// ---------- 5. dist/ ----------
console.log('→ Écriture de dist/');
await rm(DIST, { recursive: true, force: true });
await cp(SITE, DIST, { recursive: true });
await mkdir(path.join(DIST, 'data'), { recursive: true });
await cp(CACHE_IMG, path.join(DIST, 'img'), { recursive: true, filter: (src) => !src.endsWith('.part') });
await writeFile(path.join(DIST, 'data', 'cards.json'), JSON.stringify(cards));
await writeFile(path.join(DIST, 'data', 'sets.json'), JSON.stringify(sets));
await writeFile(path.join(DIST, 'data', 'texts.json'), JSON.stringify(texts));
await writeFile(path.join(DIST, 'data', 'meta.json'), JSON.stringify({ builtAt: new Date().toISOString(), cards: en.length, sets: sets.length }));
await writeFile(path.join(DIST, '.nojekyll'), '');
console.log('✓ Terminé');
