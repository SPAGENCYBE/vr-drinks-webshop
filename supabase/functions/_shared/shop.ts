// Gedeelde logica voor de VR Drinks-serverfuncties.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const env = (k: string, fallback = '') => Deno.env.get(k) ?? fallback;
export const SITE_URL = env('SITE_URL', 'https://spagencybe.github.io/vr-drinks-webshop/');

const ALLOWED_ORIGINS = env('ALLOWED_ORIGINS', 'https://spagencybe.github.io,http://127.0.0.1:8770,http://localhost:8000')
  .split(',').map(s => s.trim()).filter(Boolean);

export function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

export function admin(): SupabaseClient {
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(env('SUPABASE_SECRET_KEYS', '{}')).default;
  return createClient(env('SUPABASE_URL'), key, { auth: { persistSession: false } });
}

// ---------- Catalogus (gepubliceerd uit Onlinefact) ----------
export type Item = {
  id: string; title: string; label: string; kind: string; sku: string; tax: number; available: boolean;
  packs: { units: number; price: number }[];
  deposit?: { ref: string; label: string; price: number; tax: number };
};
let cache: { at: number; items: Map<string, Item> } | null = null;
export async function catalog(): Promise<Map<string, Item>> {
  if (cache && Date.now() - cache.at < 120_000) return cache.items;
  const res = await fetch(new URL('catalog.js?t=' + Date.now(), SITE_URL));
  if (!res.ok) throw new Error('Catalogus niet bereikbaar (' + res.status + ')');
  const text = await res.text();
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  const list = JSON.parse(text.slice(start, end + 1)) as Item[];
  cache = { at: Date.now(), items: new Map(list.map(i => [i.id, i])) };
  return cache.items;
}

// ---------- Mollie ----------
export async function mollie(path: string, init: RequestInit = {}) {
  const key = env('MOLLIE_API_KEY');
  if (!key) throw new Error('Online betalen is nog niet geactiveerd (MOLLIE_API_KEY ontbreekt).');
  const res = await fetch('https://api.mollie.com/v2/' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Mollie: ' + (body?.detail ?? res.status));
  return body;
}

// ---------- Onlinefact ----------
const OF = 'https://api.onlinefact.be';
async function of(path: string, init: RequestInit = {}) {
  const auth = 'Basic ' + btoa(env('ONLINEFACT_API_KEY') + ':' + env('ONLINEFACT_API_SECRET'));
  const res = await fetch(OF + path, { ...init, headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Onlinefact ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const first = (r: any) => Array.isArray(r) ? r[0] : Array.isArray(r?.data) ? r.data[0] : r;

const STORE_NAMES: Record<string, string> = { baasrode: 'Baasrode', overmere: 'Overmere' };

/** Zet een betaalde of op-factuur-bestelling als klantbestelling (type 2) in Onlinefact. */
export async function pushToOnlinefact(db: SupabaseClient, orderId: string) {
  const { data: order } = await db.from('orders').select('*').eq('id', orderId).single();
  if (!order || order.onlinefact_document_id) return;
  if (env('ONLINEFACT_ORDERS_ENABLED') !== 'true') {
    await db.from('orders').update({ onlinefact_error: 'Doorsturen naar Onlinefact staat uit (testfase).' }).eq('id', orderId);
    return;
  }
  try {
    const { data: p } = await db.from('profiles').select('*').eq('id', order.user_id).single();
    let customerId = p?.onlinefact_customer_id as string | null;
    if (!customerId && p?.email) {
      const found = await of('/customers/?email=' + encodeURIComponent(p.email) + '&limit=10');
      const list = Array.isArray(found) ? found : found?.data ?? [];
      const hit = list.find((c: any) => String(c.email ?? '').toLowerCase() === p.email.toLowerCase());
      if (hit) customerId = String(hit.customer_id);
    }
    if (!customerId) {
      const name = p?.company || [p?.first_name, p?.last_name].filter(Boolean).join(' ');
      const d = order.delivery ?? {};
      const created = first(await of('/customers/', { method: 'POST', body: JSON.stringify({
        name, name2: p?.company ? [p?.first_name, p?.last_name].filter(Boolean).join(' ') : '',
        taxnr: p?.vat ?? '', address: p?.street ?? '', zip: p?.zip ?? '', city: p?.city ?? '',
        country_iso: p?.country ?? 'BE', language_id: 1, mobile: p?.phone ?? '', email: p?.email ?? '', type: 1,
        delivery_name: d.name ?? '', delivery_address: d.street ?? '', delivery_zip: d.zip ?? '', delivery_city: d.city ?? '', delivery_country: d.country ?? '',
      }) }));
      customerId = String(created.customer_id);
    }
    await db.from('profiles').update({ onlinefact_customer_id: customerId }).eq('id', order.user_id);

    const how = order.fulfilment === 'afhalen'
      ? `Afhalen in ${STORE_NAMES[order.store] ?? order.store}`
      : `Leveren: ${order.delivery?.street}, ${order.delivery?.zip} ${order.delivery?.city}`;
    const comments = [`Webshopbestelling ${order.number}`, how, order.wanted_date ? `Gewenste datum: ${order.wanted_date}` : '',
      order.payment_method === 'mollie' ? `Online betaald (Mollie ${order.mollie_payment_id})` : 'Betalen op factuur',
      order.note ? `Opmerking klant: ${order.note}` : ''].filter(Boolean).join('\n');
    const now = new Date();
    const lines = (order.lines as any[]).map(l => ({
      reference: l.ref, description: l.description, quantity: l.qty,
      // unit_price = eurocent incl. btw -> euro excl. btw, 4 decimalen (zoals Onlinefact)
      price_vatexcl: Math.round(l.unit_price / 100 / (1 + l.tax / 100) * 10000) / 10000,
      tax: l.tax, discount: 0,
    }));
    const doc = first(await of('/documents/', { method: 'POST', body: JSON.stringify({
      document_type: 2,
      document_date: now.toISOString().slice(0, 10),
      document_time: now.toISOString().slice(11, 16),
      reference: order.number,
      customer_id: Number(customerId),
      payment_method: order.payment_method === 'mollie' ? 8 : 1,
      comments,
      lines,
    }) }));
    await db.from('orders').update({ onlinefact_document_id: String(doc.document_id), onlinefact_number: doc.number ?? null, onlinefact_error: null }).eq('id', orderId);
  } catch (e) {
    await db.from('orders').update({ onlinefact_error: String((e as Error).message ?? e).slice(0, 500) }).eq('id', orderId);
  }
}
