// Haalt de voorraad op uit Onlinefact en schrijft dist/stock.json.
// Koppeling: catalogusveld `sku` = Onlinefact `reference` (of reference2 / barcode).
//
// Nodig (GitHub Secrets of omgevingsvariabelen):
//   ONLINEFACT_API_KEY, ONLINEFACT_API_SECRET
// Lokaal testen zonder Onlinefact: ONLINEFACT_MOCK=pad/naar/producten.json
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const catalogFile = path.join(root, 'dist', 'catalog.js');
const outFile = path.join(root, 'dist', 'stock.json');
const mapFile = path.join(root, 'tools', 'onlinefact-map.json');
const API = 'https://api.onlinefact.be';

function loadCatalog() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(catalogFile, 'utf8'), ctx);
  return ctx.window.catalog;
}

async function fetchProducts() {
  if (process.env.ONLINEFACT_MOCK) return JSON.parse(fs.readFileSync(process.env.ONLINEFACT_MOCK, 'utf8'));
  const key = process.env.ONLINEFACT_API_KEY, secret = process.env.ONLINEFACT_API_SECRET;
  if (!key || !secret) throw new Error('ONLINEFACT_API_KEY en ONLINEFACT_API_SECRET ontbreken.');
  const auth = 'Basic ' + Buffer.from(key + ':' + secret).toString('base64');
  const all = [];
  for (let page = 1; page < 100; page++) {
    let res;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(`${API}/products/?limit=1000&page=${page}`, { headers: { Authorization: auth, Accept: 'application/json' } });
      if (res.status !== 429) break;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (!res.ok) throw new Error(`Onlinefact antwoordde ${res.status} op pagina ${page}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    const items = Array.isArray(body) ? body : (body.data ?? body.products ?? body.items ?? []);
    all.push(...items);
    if (items.length < 1000) break;
  }
  return all;
}

const norm = v => String(v ?? '').trim().toUpperCase();
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

const catalog = loadCatalog();
const products = await fetchProducts();
if (process.env.ONLINEFACT_DUMP === '1') {
  console.log('---DUMP---');
  for (const p of products) console.log(['DUMP', p.product_id, p.reference, p.reference2 ?? '', p.barcode ?? '', p.description, p.categorie_id ?? '', p.price_incl, p.stock, p.managestock, p.webshop, p.endoflife].join('\t'));
  const strip = o => Object.fromEntries(Object.entries(o).filter(([k]) => !/purchase|cost|supplier/i.test(k)));
  console.log('KEYS\t' + JSON.stringify(Object.keys(products[0] || {})));
  for (const p of products.slice(0, 2)) console.log('SAMPLE\t' + JSON.stringify(strip(p)));
  const withImg = products.filter(p => Object.entries(p).some(([k, v]) => /image|img|photo|picture/i.test(k) && v));
  console.log('IMAGES\t' + withImg.length);
  for (const ep of ['categories', 'brands']) {
    try {
      const auth = 'Basic ' + Buffer.from(process.env.ONLINEFACT_API_KEY + ':' + process.env.ONLINEFACT_API_SECRET).toString('base64');
      const r = await fetch(`${API}/${ep}/?limit=1000`, { headers: { Authorization: auth, Accept: 'application/json' } });
      console.log(ep.toUpperCase() + '\t' + r.status + '\t' + (await r.text()).slice(0, 6000));
    } catch (e) { console.log(ep + ' fout ' + e.message); }
  }
  console.log('---END---');
}

const index = new Map();
for (const p of products) {
  const keys = [p.reference, p.reference2, p.barcode, ...(Array.isArray(p.barcodes) ? p.barcodes.map(b => b?.barcode ?? b) : [])];
  for (const k of keys) if (norm(k) && !index.has(norm(k))) index.set(norm(k), p);
}

// Koppeltabel catalogus-id -> Onlinefact-referentie (tools/onlinefact-map.json).
const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
const items = {}, missing = [], priceDiff = [];
for (const c of catalog) {
  const hit = index.get(norm(map[c.id])) ?? index.get(norm(c.sku));
  if (!hit) { missing.push(`${c.sku || '(geen sku)'} · ${c.title} · ${c.label}`); continue; }
  const manage = hit.managestock === undefined ? true : [true, 1, '1', 'true', 'yes', 'Y'].includes(hit.managestock);
  const stock = num(hit.stock);
  const ofPrice = num(hit.price_incl);
  if (ofPrice !== null && Math.round(ofPrice * 100) !== c.packs[0].price) priceDiff.push(`${c.title} · ${c.label}: webshop ${(c.packs[0].price / 100).toFixed(2)} / Onlinefact ${ofPrice.toFixed(2)}`);
  items[c.id] = {
    stock: stock === null ? null : Math.max(0, Math.floor(stock)),
    managestock: manage && stock !== null,
    endoflife: [true, 1, '1', 'true'].includes(hit.endoflife),
  };
}

// Beveiliging: houdt Onlinefact geen voorraad bij (alles 0), dan niets als uitverkocht tonen.
const managed = Object.values(items).filter(i => i.managestock);
const tracked = managed.some(i => i.stock > 0);
if (!tracked) for (const i of Object.values(items)) i.managestock = false;
fs.writeFileSync(outFile, JSON.stringify({ updated: new Date().toISOString(), tracked, items }));

const matched = Object.keys(items).length;
const report = [
  `### Voorraad uit Onlinefact`,
  `- Producten in Onlinefact: ${products.length}`,
  `- Gekoppeld: ${matched} van ${catalog.length}`,
  tracked ? `- Uitverkocht: ${Object.values(items).filter(i => i.managestock && i.stock <= 0).length}` : `- **Let op:** alle gekoppelde artikelen staan op voorraad 0 in Onlinefact. De voorraad wordt nog niet bijgehouden, dus de webshop toont niets als uitverkocht.`,
  priceDiff.length ? `\n**Prijsverschillen (${priceDiff.length}):**\n` + priceDiff.map(m => `- ${m}`).join('\n') : '',
  missing.length ? `\n**Niet gevonden in Onlinefact (${missing.length}):**\n` + missing.map(m => `- ${m}`).join('\n') : '',
].join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
