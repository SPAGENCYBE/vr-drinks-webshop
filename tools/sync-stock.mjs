// Bouwt de webshopcatalogus en de voorraad volledig uit Onlinefact.
//
// - Elk artikel met "Webshop" aan (en niet end-of-life, prijs > 0) komt in de webshop.
// - Prijs, verpakking, categorie, merk, EU/BE en voorraad komen uit Onlinefact.
// - Foto, smaaktekst en weergavenaam komen uit tools/enrichment.json (per Onlinefact-referentie).
//   Nieuw artikel zonder verrijking: foto uit Onlinefact (images) als die er is, anders de foto
//   van hetzelfde product in een andere verpakking, anders "Foto volgt".
// - Schrijft dist/catalog.js en dist/stock.json.
//
// Nodig: ONLINEFACT_API_KEY, ONLINEFACT_API_SECRET (GitHub Secrets).
// Lokaal testen: ONLINEFACT_MOCK_DIR=map met products.json, categories.json, brands.json.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const API = 'https://api.onlinefact.be';
const files = {
  catalog: path.join(root, 'dist', 'catalog.js'),
  stock: path.join(root, 'dist', 'stock.json'),
  enrichment: path.join(root, 'tools', 'enrichment.json'),
};

// ---------- Onlinefact ophalen ----------
const auth = () => 'Basic ' + Buffer.from(process.env.ONLINEFACT_API_KEY + ':' + process.env.ONLINEFACT_API_SECRET).toString('base64');
async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: auth(), Accept: 'application/json' } });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`Onlinefact antwoordde ${res.status} op ${url}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    return Array.isArray(body) ? body : (body.data ?? body.items ?? []);
  }
  throw new Error('Onlinefact: te veel verzoeken');
}
async function getAll(ep) {
  const all = [];
  for (let page = 1; page < 100; page++) {
    const items = await get(`${API}/${ep}/?limit=1000&page=${page}`);
    all.push(...items);
    if (items.length < 1000) break;
  }
  return all;
}
async function load() {
  const dir = process.env.ONLINEFACT_MOCK_DIR;
  if (dir) return ['products', 'categories', 'brands'].map(n => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8')));
  if (!process.env.ONLINEFACT_API_KEY || !process.env.ONLINEFACT_API_SECRET) throw new Error('ONLINEFACT_API_KEY en ONLINEFACT_API_SECRET ontbreken.');
  return Promise.all([getAll('products'), getAll('categories'), getAll('brands')]);
}

// ---------- Omschrijving ontleden ----------
const ascii = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const yes = v => [true, 1, '1', 'true', 'yes', 'Y'].includes(v);

function parse(desc) {
  const d = desc.replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
  const origin = /\(EU\)/.test(d) ? 'EU' : /\(BE\)/.test(d) ? 'BE' : null;
  const container = /\((lege )?bak\)|L\(bak\)/i.test(d) ? 'bak' : /\(fles\)/i.test(d) ? 'fles' : /\(VAT\)/i.test(d) ? 'vat' : null;
  let n = 1, vol = null, grams = null;
  const m = d.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(cl|l|ml|g)\b/i);
  const one = m ? null : d.match(/(\d+(?:[.,]\d+)?)\s*(cl|l|ml|g)\b/i);
  if (m) n = +m[1];
  const v = m ? m[2] : one?.[1], u = (m ? m[3] : one?.[2])?.toLowerCase();
  if (u) {
    const x = num(v);
    if (u === 'g') grams = x; else vol = u === 'l' ? x * 100 : u === 'ml' ? x / 10 : x;
  }
  const caps = d.match(/(\d+)\s*capsules/i);
  if (caps) n = +caps[1];
  const rent = /^huur\b/i.test(d) ? (d.match(/\((dag|weekend|week)\)/i)?.[1].toLowerCase() ?? 'stuk') : null;
  const name = d.replace(/\((EU|BE|bak|lege bak|fles|VAT|dag|weekend|week)\)/gi, '').replace(/^huur\s+/i, '').replace(/\d+\s*capsules/i, '')
    .replace(/\d+\s*x\s*\d+(?:[.,]\d+)?\s*(cl|l|ml|g)\b|\d+(?:[.,]\d+)?\s*(cl|l|ml|g)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  return { origin, container, n, vol, grams, name, rent, caps: !!caps };
}
const nameKey = desc => ascii(parse(desc).name).toLowerCase().replace(/,/g, '.').replace(/-/g, ' ').replace(/\s*%/g, '%').replace(/\s+/g, '').trim();
const fmtVol = cl => cl >= 100 ? `${(cl / 100).toLocaleString('nl-BE')} L` : `${cl.toLocaleString('nl-BE')} cl`;
const slug = s => ascii(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function packLabel(p, kind) {
  if (p.rent) return { label: p.rent === 'stuk' ? 'Huur per stuk' : `Huur per ${p.rent}`, packType: 'Huur' };
  if (p.caps) return { label: `${p.n} capsules`, packType: 'Doos' };
  const size = p.vol ? fmtVol(p.vol) : p.grams ? `${p.grams.toLocaleString('nl-BE')} g` : null;
  if (!size) return { label: p.n > 1 ? `${p.n} stuks` : 'Per stuk', packType: 'Overig' };
  const bulk = p.n > 1 ? `${p.n} × ${size}` : size;
  if (p.container === 'bak') return { label: `Bak · ${bulk}`, packType: 'Bak' };
  if (p.container === 'fles') return { label: `Fles · ${bulk}`, packType: 'Fles' };
  if (p.container === 'vat') return { label: `Vat · ${bulk}`, packType: 'Vat' };
  if (p.vol && p.vol >= 50 && p.n > 1 && kind === 'Frisdrank') return { label: `PET-flessen · ${bulk}`, packType: 'PET' };
  if (p.n >= 24 && p.vol && p.vol <= 33) return { label: `Tray van ${bulk}`, packType: 'Tray' };
  return { label: bulk, packType: p.n > 1 ? 'Pack' : 'Fles' };
}

// Onlinefact-categorie -> webshopsoort (sluit aan op de afdelingen in app.js).
const KIND = {
  'BIER': 'Bieren', 'CADEAUVERPAKKINGEN': 'Cadeauverpakking', 'CHIPS & SNOEP': 'Chips', 'ENERGIEDRANK': 'Energiedrank',
  'FRISDRANK': 'Frisdrank', 'FRUITSAP': 'Fruitsap', 'KOFFIE': 'Koffie', 'LEEGGOED': 'Waarborg', 'STERKE DRANK': 'Alcohol',
  'VERHUUR': 'Verhuur Materiaal', 'WAARBORG': 'Waarborg', 'WATER': 'Waters', 'WIJN': 'Wijnen', 'ZUIVEL': 'Melkdrank',
};
const titleCase = s => s.replace(/\b([A-ZÀ-Ý]{4,})\b/g, w => w[0] + w.slice(1).toLowerCase());

function imageFromOnlinefact(p) {
  for (const img of Array.isArray(p.images) ? p.images : []) {
    const url = typeof img === 'string' ? img : img?.url ?? img?.src ?? img?.image ?? img?.path;
    if (url && /^https?:\/\//.test(url)) return url;
  }
  return null;
}

// ---------- Opbouwen ----------
const [products, categories, brands] = await load();
const enrichment = JSON.parse(fs.readFileSync(files.enrichment, 'utf8'));
const catName = Object.fromEntries(categories.map(c => [String(c.category_id), String(c.name).trim()]));
const brandName = Object.fromEntries(brands.map(b => [String(b.brand_id), String(b.name).trim()]));

// Foto van hetzelfde product in een andere verpakking.
const photoByName = new Map();
for (const p of products) {
  const e = enrichment[p.reference];
  if (e?.image && !photoByName.has(nameKey(p.description))) photoByName.set(nameKey(p.description), e);
}

// Leeggoed: per merk + verpakking het leeggoedartikel uit Onlinefact (volle bak/fles/vat).
const firstWord = n => ascii(n).toLowerCase().replace(/^leeggoed\s+/, '').split(/[\s']+/)[0];
const depositIndex = new Map(), depositLoose = new Map();
for (const p of products) {
  const d = String(p.description ?? '');
  if (!/^leeggoed/i.test(d) || /lege bak/i.test(d)) continue;
  const price = Math.round((num(p.price_incl) ?? 0) * 100);
  if (price <= 0) continue;
  const q = parse(d);
  const dep = { ref: p.reference, label: d.replace(/\s+/g, ' ').trim(), price, tax: num(p.tax) ?? 21 };
  depositIndex.set(`${firstWord(q.name)}|${q.n}|${q.vol}|${q.container}`, dep);
  const loose = `${firstWord(q.name)}|${q.n}|${q.container}`;
  depositLoose.set(loose, depositLoose.has(loose) ? null : dep);   // alleen als eenduidig
}
function depositFor(parsed) {
  if (!['bak', 'fles', 'vat'].includes(parsed.container)) return null;
  const w = firstWord(parsed.name);
  return depositIndex.get(`${w}|${parsed.n}|${parsed.vol}|${parsed.container}`) ?? depositLoose.get(`${w}|${parsed.n}|${parsed.container}`) ?? null;
}

const catalog = [], stockItems = {}, report = { nieuw: [], zonderFoto: [], zonderLeeggoed: [] };
const ids = new Set();
for (const p of products) {
  if (!yes(p.webshop) || yes(p.endoflife)) continue;
  const price = Math.round((num(p.price_incl) ?? 0) * 100);
  if (price <= 0) continue;
  const parsed = parse(String(p.description ?? ''));
  const e = enrichment[p.reference];
  const ofCat = catName[String(p.categorie_id)] ?? 'Overig';
  const kind = e?.kind ?? KIND[ofCat.toUpperCase()] ?? titleCase(ofCat);
  const { label, packType } = packLabel(parsed, kind);
  const brand = e?.brand ?? brandName[String(p.brand_id)] ?? parsed.name.split(' ')[0];
  const item = {
    id: e?.id ?? `${slug(parsed.name || p.description)}-${p.reference}`,
    title: e?.title ?? titleCase(parsed.name || p.description),
    categories: e?.categories ?? [kind],
    brand, kind, packType, label,
    packs: [{ units: parsed.n, price }],
    available: true,
    sku: p.reference,
  };
  item.tax = num(p.tax) ?? 21;
  const dep = depositFor(parsed);
  if (dep) item.deposit = dep;
  else if (['bak', 'fles', 'vat'].includes(parsed.container)) report.zonderLeeggoed.push(`${item.title} · ${label}`);
  if (ids.has(item.id)) item.id += '-' + p.reference;
  ids.add(item.id);
  if (parsed.origin) item.origin = parsed.origin;
  if (kind === 'Bieren' && /\b0[.,]0\s*%|0[.,]3\s*%|alcoholvrij|alcohol-free/i.test(p.description + ' ' + (e?.title ?? ''))) item.alcoholFree = true;
  for (const k of ['image', 'imageSource', 'sourceId', 'taste', 'glow', 'wrap', 'color', 'variant', 'volume', 'aspect']) if (e?.[k] !== undefined) item[k] = e[k];
  if (!e) {
    report.nieuw.push(`${item.title} · ${label}`);
    const own = imageFromOnlinefact(p);
    const same = photoByName.get(nameKey(p.description));
    if (own) { item.image = own; item.imageSource = own; }
    else if (same) { item.image = same.image; if (same.imageSource) item.imageSource = same.imageSource; if (same.sourceId) item.sourceId = same.sourceId; }
    else report.zonderFoto.push(`${item.title} · ${label}`);
  }
  catalog.push(item);
  const stock = num(p.stock);
  stockItems[item.id] = { stock: stock === null ? null : Math.max(0, Math.floor(stock)), managestock: yes(p.managestock) && stock !== null };
}

// Beveiliging: houdt Onlinefact geen voorraad bij (alles 0), dan niets als uitverkocht tonen.
const tracked = Object.values(stockItems).some(i => i.managestock && i.stock > 0);
if (!tracked) for (const i of Object.values(stockItems)) i.managestock = false;

if (catalog.length < 20) throw new Error(`Slechts ${catalog.length} webshopartikelen gevonden; catalogus niet overschreven.`);
const header = `// Automatisch opgebouwd uit Onlinefact op ${new Date().toISOString()}. Niet met de hand aanpassen: zie tools/sync-stock.mjs en tools/enrichment.json.\n`;
fs.writeFileSync(files.catalog, header + 'window.catalog = ' + JSON.stringify(catalog, null, 1) + ';\n');
fs.writeFileSync(files.stock, JSON.stringify({ updated: new Date().toISOString(), tracked, items: stockItems }));

const lines = [
  '### Webshop uit Onlinefact',
  `- Artikelen in Onlinefact: ${products.length}, waarvan in de webshop: ${catalog.length}`,
  `- Met foto: ${catalog.filter(c => c.image).length}, zonder foto: ${catalog.filter(c => !c.image).length}`,
  tracked ? `- Uitverkocht: ${Object.values(stockItems).filter(i => i.managestock && i.stock <= 0).length}` : '- **Voorraad:** staat overal op 0 in Onlinefact; de webshop toont niets als uitverkocht.',
  report.nieuw.length ? `\n**Nieuw (nog niet verrijkt, ${report.nieuw.length}):**\n` + report.nieuw.map(x => `- ${x}`).join('\n') : '',
  `- Met leeggoed: ${catalog.filter(c => c.deposit).length}`,
  report.zonderLeeggoed.length ? `\n**Bak/fles/vat zonder leeggoed in Onlinefact (${report.zonderLeeggoed.length}):**\n` + report.zonderLeeggoed.map(x => `- ${x}`).join('\n') : '',
  report.zonderFoto.length ? `\n**Zonder foto (${report.zonderFoto.length}):**\n` + report.zonderFoto.map(x => `- ${x}`).join('\n') : '',
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');

if (process.env.ONLINEFACT_DUMP === '1') {
  const strip = o => Object.fromEntries(Object.entries(o).filter(([k]) => !/purchase|cost|supplier|ledger/i.test(k)));
  for (const p of products) console.log('PJSON\t' + JSON.stringify(strip(p)));
  console.log('CATEGORIESJSON\t' + JSON.stringify(categories));
  console.log('BRANDSJSON\t' + JSON.stringify(brands));
}
