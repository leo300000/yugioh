#!/usr/bin/env node
// Construit le site statique dans dist/ :
//  - télécharge les données de l'API YGOPRODeck (3 appels seulement)
//  - télécharge les images manquantes en pleine résolution, les convertit en WebP
//    et les garde dans .cache/img-hd (jamais de hotlink)
//  - écrit data/*.json et copie site/ + images dans dist/
//
// Variables d'environnement :
//   SKIP_IMAGES=1        ne télécharge aucune image (build rapide en local)
//   IMG_CONCURRENCY=6    téléchargements en parallèle
//   IMG_DELAY_MS=400     pause par worker entre deux images (reste sous 20 req/s)
//   IMG_WIDTH=480        largeur maximale des images en pixels
//   IMG_QUALITY=78       qualité WebP (0-100)
//   IMG_BUDGET_MB=900    poids maximal des images ; au-delà, la largeur est réduite automatiquement

import { mkdir, writeFile, readFile, readdir, cp, rm, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.join(ROOT, 'dist');
const CACHE_IMG = path.join(ROOT, '.cache', 'img-hd');

const API = 'https://db.ygoprodeck.com/api/v7';
// Pleine résolution (421 × 614 px) : de quoi afficher le zoom net, y compris sur écran Retina
const IMG_BASE = 'https://images.ygoprodeck.com/images/cards';
const CONCURRENCY = Number(process.env.IMG_CONCURRENCY || 6);
const DELAY_MS = Number(process.env.IMG_DELAY_MS || 400);
const WIDTH = Number(process.env.IMG_WIDTH || 480);
const QUALITY = Number(process.env.IMG_QUALITY || 78);
// Réglages de conversion : s'ils changent, les images du cache sont reconverties sans être retéléchargées
const IMG_PARAMS = JSON.stringify({ w: WIDTH, q: QUALITY });
const PARAMS_FILE = path.join(CACHE_IMG, '.params');
const BUDGET = Number(process.env.IMG_BUDGET_MB || 900) * 1e6;
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
const have = new Set((await readdir(CACHE_IMG)).filter((f) => f.endsWith('.webp')));
const imageIds = [...new Set(Object.values(cards).map((c) => c.i))];
const todo = SKIP_IMAGES ? [] : imageIds.filter((id) => !have.has(`${id}.webp`));
console.log(`→ Images : ${imageIds.length - todo.length} déjà en cache, ${todo.length} à télécharger`);

// WebP redimensionné : sans cette conversion, les ~14 000 images en pleine résolution dépasseraient
// la limite de 1 Go d'un site GitHub Pages.
// .params garde les réglages demandés (w, q) et la largeur réellement utilisée (eff), qui peut être
// réduite automatiquement pour tenir dans IMG_BUDGET.
const readParams = async () => { try { return JSON.parse(await readFile(PARAMS_FILE, 'utf8')); } catch { return {}; } };
const old = await readParams();
const sameRequest = old.w === WIDTH && old.q === QUALITY;
let eff = sameRequest && old.eff ? old.eff : WIDTH;
let sharp = null;
if (!SKIP_IMAGES && (todo.length || have.size)) {
  try {
    sharp = (await import('sharp')).default;
  } catch {
    throw new Error('Le module sharp est introuvable : lance « npm ci » avant le build (ou SKIP_IMAGES=1).');
  }
}

const toWebp = (buf, width) =>
  sharp(buf)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 5, smartSubsample: true })
    .toBuffer();

async function saveWebp(id, webp) {
  const tmp = path.join(CACHE_IMG, `${id}.webp.part`);
  await writeFile(tmp, webp);
  await rename(tmp, path.join(CACHE_IMG, `${id}.webp`));
}

async function cachedFiles() {
  return (await readdir(CACHE_IMG)).filter((f) => f.endsWith('.webp'));
}

async function cacheBytes() {
  let n = 0;
  for (const f of await cachedFiles()) n += (await stat(path.join(CACHE_IMG, f))).size;
  return n;
}

// Reconvertit les images déjà en cache, sans rien retélécharger
async function reconvertAll(width, why) {
  const files = await cachedFiles();
  console.log(`→ ${why} : reconversion de ${files.length} images en ${width} px de large, qualité ${QUALITY}`);
  let k = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (k < files.length) {
      const f = files[k++];
      try {
        await saveWebp(f.slice(0, -5), await toWebp(await readFile(path.join(CACHE_IMG, f)), width));
      } catch (err) {
        console.warn(`  ${f} : ${err.message}`);
      }
    }
  }));
}

if (sharp && have.size && !sameRequest) await reconvertAll(eff, `Réglages modifiés (${JSON.stringify({ w: old.w, q: old.q })} → ${IMG_PARAMS})`);

let next = 0;
let done = 0;
let failed = 0;
let sampled = false;
async function worker() {
  while (next < todo.length) {
    const id = todo[next++];
    try {
      const buf = await get(`${IMG_BASE}/${id}.jpg`, { as: 'buffer', tries: 3 });
      if (buf) {
        if (!sampled) {
          sampled = true;
          const m = await sharp(buf).metadata();
          console.log(`  Taille des originaux : ${m.width} × ${m.height} px (${(buf.length / 1024).toFixed(0)} Ko pour la première)`);
        }
        await saveWebp(id, await toWebp(buf, eff));
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

// Garde-fou : si les images dépassent le budget, on réduit la largeur en proportion et on reconvertit
if (sharp) {
  const total = await cacheBytes();
  console.log(`  Images en cache : ${(total / 1e6).toFixed(0)} Mo (budget ${(BUDGET / 1e6).toFixed(0)} Mo, largeur ${eff} px)`);
  if (total > BUDGET) {
    eff = Math.max(240, Math.floor(eff * Math.sqrt((BUDGET * 0.92) / total)));
    await reconvertAll(eff, 'Budget dépassé');
    console.log(`  Après réduction : ${((await cacheBytes()) / 1e6).toFixed(0)} Mo`);
  }
  await writeFile(PARAMS_FILE, JSON.stringify({ w: WIDTH, q: QUALITY, eff }));
}

// ---------- 5. dist/ ----------
console.log('→ Écriture de dist/');
await rm(DIST, { recursive: true, force: true });
await cp(SITE, DIST, { recursive: true });
await mkdir(path.join(DIST, 'data'), { recursive: true });
await cp(CACHE_IMG, path.join(DIST, 'img'), { recursive: true, filter: (src) => !src.endsWith('.part') && path.basename(src) !== '.params' });
await writeFile(path.join(DIST, 'data', 'cards.json'), JSON.stringify(cards));
await writeFile(path.join(DIST, 'data', 'sets.json'), JSON.stringify(sets));
await writeFile(path.join(DIST, 'data', 'texts.json'), JSON.stringify(texts));
await writeFile(path.join(DIST, 'data', 'meta.json'), JSON.stringify({ builtAt: new Date().toISOString(), cards: en.length, sets: sets.length }));
await writeFile(path.join(DIST, '.nojekyll'), '');
const imgFiles = await readdir(path.join(DIST, 'img'));
let imgBytes = 0;
for (const f of imgFiles) imgBytes += (await stat(path.join(DIST, 'img', f))).size;
console.log(`  ${imgFiles.length} images, ${(imgBytes / 1e6).toFixed(0)} Mo`);
if (imgBytes > 950e6) console.warn('  ⚠ Plus de 950 Mo d\'images : GitHub Pages limite un site à 1 Go, baisse IMG_WIDTH ou IMG_QUALITY');
console.log('✓ Terminé');
