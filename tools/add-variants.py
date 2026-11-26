"""Voegt EU/BE-versies en andere verpakkingen uit Onlinefact toe aan dist/catalog.js.

Gebruik:  python3 tools/add-variants.py <onlinefact-producten.tsv>
TSV-kolommen (zoals de DUMP-uitvoer van tools/sync-stock.mjs):
  product_id, reference, reference2, barcode, description, categorie_id,
  price_incl, stock, managestock, webshop, endoflife

- Elk catalogusproduct krijgt `origin` ("EU"/"BE") als de Onlinefact-omschrijving dat vermeldt.
- Een Onlinefact-artikel dat nog niet in de webshop staat, wordt toegevoegd als er een
  bestaand product is met dezelfde naam en dezelfde inhoud per blik/fles (foto, smaak en
  categorie worden overgenomen). De rest komt in een rapport.
"""
import json, re, subprocess, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT = ROOT / 'dist' / 'catalog.js'
MAP = ROOT / 'tools' / 'onlinefact-map.json'

catalog = json.loads(subprocess.check_output(['node', '-e',
    f"global.window={{}};eval(require('fs').readFileSync({json.dumps(str(CAT))},'utf8'));"
    "console.log(JSON.stringify(window.catalog))"]))
header = CAT.read_text().split('window.catalog')[0]
mapping = json.loads(MAP.read_text())

of = {}
for line in open(sys.argv[1], encoding='utf8'):
    f = line.rstrip('\n').split('\t')
    if len(f) < 11: continue
    of[f[1]] = dict(ref=f[1], desc=re.sub(r'\s+', ' ', f[4]).strip(), price=round(float(f[6] or 0) * 100),
                    webshop=f[9] == '1', endoflife=f[10] == '1')

def ascii_(s): return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()

def parse(desc):
    d = desc.replace('×', 'x')
    origin = 'EU' if '(EU)' in d else 'BE' if '(BE)' in d else None
    container = 'bak' if re.search(r'\(\s*(lege )?bak\)|\(bak\)|L\(bak\)', d, re.I) else 'fles' if '(fles)' in d.lower() else None
    m = re.search(r'(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(cl|l|ml|g)\b', d, re.I) or None
    n = 1; vol = None; unit = None
    if m:
        n = int(m[1]); v = float(m[2].replace(',', '.')); unit = m[3].lower()
    else:
        m = re.search(r'(\d+(?:[.,]\d+)?)\s*(cl|l|ml|g)\b', d, re.I)
        if m: v = float(m[1].replace(',', '.')); unit = m[2].lower()
    if unit:
        vol = v * 100 if unit == 'l' else v / 10 if unit == 'ml' else v
        if unit == 'g': vol = ('g', v)
    name = re.sub(r'\((EU|BE|bak|lege bak|fles|VAT)\)', '', d, flags=re.I)
    name = re.sub(r'\d+\s*x\s*\d+(?:[.,]\d+)?\s*(cl|l|ml|g)\b|\d+(?:[.,]\d+)?\s*(cl|l|ml|g)\b', '', name, flags=re.I)
    return dict(origin=origin, container=container, n=n, vol=vol, name=name.strip())

STOP = {'original', 'taste', 'bak', 'fles', 'pet', 'flessen', 'tray', 'van', 'met', 'glazen', 'eu', 'be'}
def toks(s):
    s = ascii_(s).lower().replace('coca-cola', 'coca cola').replace('zero sugar', 'zero').replace('suger', 'zero').replace('sugar', 'zero')
    return {t for t in re.findall(r'[a-z0-9]+', s) if t not in STOP and not re.fullmatch(r'\d+([.,]\d+)?%?', t)}

def cat_vol(c):
    p = parse(c['label'] + ' ' + c['title'])
    return p['vol']

# 1. Herkomst op bestaande producten zetten.
for c in catalog:
    o = of.get(mapping.get(c['id'], ''))
    c.pop('origin', None)
    if o:
        org = parse(o['desc'])['origin']
        if org: c['origin'] = org

taken = set(mapping.values()) | {c.get('sku') for c in catalog}
SKIP = ('leeggoed', 'waarborg', 'huur', 'wijntas')

def fmt_vol(vol):
    if isinstance(vol, tuple): return f"{vol[1]:g} g"
    if vol >= 100: return f"{vol / 100:g} L".replace('.', ',')
    return f"{vol:g} cl".replace('.', ',')

def key(desc):
    n = parse(desc)['name']
    n = ascii_(n).lower().replace(',', '.').replace('-', ' ')
    n = re.sub(r'\s*%', '%', n)
    return re.sub(r'\s+', ' ', n).strip()

# Sjablonen: elk gekoppeld product, per (Onlinefact-naam, inhoud per stuk).
templates = {}
for c in catalog:
    o = of.get(mapping.get(c['id'], ''))
    if not o or not c.get('image') or c.get('kind') == 'Waarborg': continue
    templates.setdefault((key(o['desc']), parse(o['desc'])['vol']), c)

added, unmatched = [], []
for o in of.values():
    if o['ref'] in taken or not o['webshop'] or o['endoflife'] or o['price'] <= 0: continue
    if o['desc'].lower().startswith(SKIP): continue
    p = parse(o['desc'])
    t = templates.get((key(o['desc']), p['vol']))
    if not t:
        unmatched.append(o['desc']); continue
    vol = fmt_vol(p['vol'])
    bulk = f"{p['n']} × {vol}" if p['n'] > 1 else vol
    if p['container'] == 'bak':
        label, pack_type = f"Bak · {bulk}", 'Bak'
    elif p['container'] == 'fles':
        label, pack_type = f"Fles · {bulk}", 'Fles'
    elif t['label'].startswith('PET') and not isinstance(p['vol'], tuple) and p['vol'] >= 50:
        label, pack_type = f"PET-flessen · {bulk}", t.get('packType')
    elif t['label'].startswith('Tray') and p['n'] >= 24:
        label, pack_type = f"Tray van {bulk}", t.get('packType')
    else:
        label = bulk
        pack_type = 'Tray' if p['n'] >= 24 and t.get('packType') == 'Tray' else ('Pack' if p['n'] > 1 else t.get('packType'))
    item = {k: v for k, v in t.items() if k not in ('wrap', 'color', 'variant', 'aspect', 'origin')}
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_(t['title']).lower()).strip('-')
    item.update(id=f"{slug}-{o['ref']}", label=label, packType=pack_type, sku=o['ref'], available=True,
                packs=[{'units': p['n'], 'price': o['price']}], source=None)
    if p['origin']: item['origin'] = p['origin']
    item.pop('source')
    added.append(item)
    mapping[item['id']] = o['ref']

catalog.extend(added)
CAT.write_text(header + 'window.catalog = ' + json.dumps(catalog, ensure_ascii=False, indent=1) + ';\n')
MAP.write_text(json.dumps(dict(sorted(mapping.items())), ensure_ascii=False, indent=1) + '\n')
print(f"Toegevoegd: {len(added)}")
for a in added: print(f"  + {a['title']} · {a['label']}{' · ' + a['origin'] if a.get('origin') else ''} · €{a['packs'][0]['price'] / 100:.2f}")
print(f"Herkomst gezet op bestaande producten: {sum(1 for c in catalog[:len(catalog) - len(added)] if c.get('origin'))}")
print(f"Niet toegevoegd (geen bestaand product/foto om op te baseren): {len(unmatched)}")
for u in unmatched: print('  -', u)
