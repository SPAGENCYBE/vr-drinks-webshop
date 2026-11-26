// POST /functions/v1/checkout
// Body: { items:[{id, qty}], fulfilment:'afhalen'|'leveren', store?, delivery?:{name,street,zip,city},
//         wanted_date?:'YYYY-MM-DD', note?, payment:'mollie'|'factuur', terms:true }
// Prijzen, leeggoed en leveringskosten worden hier opnieuw berekend; de browser wordt niet vertrouwd.
import { admin, catalog, cors, json, mollie, pushToOnlinefact, SITE_URL, env } from '../_shared/shop.ts';

const euro = (c: number) => (c / 100).toFixed(2);
// Leeftijdsgrens per soort: bier/wijn/cava 16+, sterke drank en mixdranken 18+, alcoholvrij bier geen grens.
const minAge = (it: any) => Number(it?.minAge ?? 0);
const clean = (v: unknown, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Methode niet toegestaan' }, 405);
  const db = admin();
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await db.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json(req, { error: 'Log in om af te rekenen.' }, 401);
    if (!user.email_confirmed_at) return json(req, { error: 'Bevestig eerst je e-mailadres via de link in je mailbox.' }, 403);

    const body = await req.json();
    const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
    if (!profile?.first_name || !profile.last_name || !profile.phone) return json(req, { error: 'Vul je naam en telefoonnummer aan in je account.' }, 400);
    if (body.terms !== true) return json(req, { error: 'Aanvaard de algemene voorwaarden.' }, 400);

    const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
    const items = await catalog();

    // ---- Regels opbouwen ----
    const lines: any[] = [];
    let subtotal = 0, deposit = 0;
    const wanted = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
    if (!wanted.length) return json(req, { error: 'Je winkelwagen is leeg.' }, 400);
    for (const w of wanted) {
      const it = items.get(String(w.id));
      const qty = Number(w.qty);
      if (!it || !it.available) return json(req, { error: `Een artikel is niet meer beschikbaar (${clean(w.id, 60)}). Vernieuw de pagina.` }, 409);
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) return json(req, { error: 'Ongeldig aantal.' }, 400);
      const price = it.packs[0].price;
      lines.push({ id: it.id, ref: it.sku, description: `${it.title} · ${it.label}`, qty, unit_price: price, tax: it.tax, total: price * qty });
      subtotal += price * qty;
      if (it.deposit && it.deposit.price > 0) {
        lines.push({ id: it.id + ':leeggoed', ref: it.deposit.ref, description: it.deposit.label, qty, unit_price: it.deposit.price, tax: it.deposit.tax, total: it.deposit.price * qty, deposit: true });
        deposit += it.deposit.price * qty;
      }
    }
    const needAge = Math.max(0, ...wanted.map((w: any) => minAge(items.get(String(w.id)))));
    if (needAge && Number(body.age_ok) < needAge) return json(req, { error: `Je winkelwagen bevat alcohol. Bevestig dat je ${needAge} jaar of ouder bent.` }, 400);
    if (subtotal < settings.min_order) return json(req, { error: `Het minimum bestelbedrag is € ${euro(settings.min_order)} (exclusief leeggoed).` }, 400);

    // ---- Afhalen / leveren ----
    const fulfilment = body.fulfilment === 'leveren' ? 'leveren' : 'afhalen';
    let store: string | null = null, delivery: any = null, fee = 0;
    if (fulfilment === 'afhalen') {
      store = clean(body.store, 40);
      if (!(settings.pickup_stores as any[]).some(s => s.id === store)) return json(req, { error: 'Kies een winkel om af te halen.' }, 400);
    } else {
      delivery = { name: clean(body.delivery?.name), street: clean(body.delivery?.street), zip: clean(body.delivery?.zip, 10), city: clean(body.delivery?.city, 80), country: 'BE' };
      if (!delivery.street || !delivery.zip || !delivery.city) return json(req, { error: 'Vul het leveringsadres volledig in.' }, 400);
      if (!(settings.delivery_zips as string[]).includes(delivery.zip)) return json(req, { error: `We leveren (nog) niet in postcode ${delivery.zip}. Kies afhalen of neem contact op.` }, 400);
      fee = subtotal >= settings.free_delivery_from ? 0 : settings.delivery_fee;
      if (fee > 0) lines.push({ id: 'levering', ref: '', description: 'Leveringskosten', qty: 1, unit_price: fee, tax: Number(settings.delivery_vat), total: fee });
    }
    let wantedDate: string | null = null;
    if (body.wanted_date) {
      const d = new Date(String(body.wanted_date) + 'T12:00:00Z');
      const min = new Date(); min.setUTCDate(min.getUTCDate() + settings.lead_days); min.setUTCHours(0, 0, 0, 0);
      if (isNaN(+d) || d < min) return json(req, { error: 'Kies een latere datum.' }, 400);
      if (d.getUTCDay() === 0) return json(req, { error: 'Op zondag zijn we gesloten. Kies een andere dag.' }, 400);
      wantedDate = d.toISOString().slice(0, 10);
    }
    const total = subtotal + deposit + fee;

    // ---- Betaalmethode ----
    const payment = body.payment === 'factuur' ? 'factuur' : 'mollie';
    if (payment === 'mollie' && !env('MOLLIE_API_KEY')) return json(req, { error: 'Online betalen is binnenkort beschikbaar. Kies afhalen en betaal in de winkel, of contacteer VR Drinks.' }, 503);
    if (payment === 'factuur' && !profile.invoice_allowed) return json(req, { error: 'Betalen op factuur is enkel mogelijk voor goedgekeurde zakelijke klanten.' }, 403);

    const { data: order, error } = await db.from('orders').insert({
      user_id: user.id, status: payment === 'factuur' ? 'op_factuur' : 'wacht_op_betaling', payment_method: payment,
      fulfilment, store, delivery, wanted_date: wantedDate, note: clean(body.note, 500) || null,
      lines, subtotal, deposit, delivery_fee: fee, total, age_confirmed_for: needAge || null,
    }).select().single();
    if (error) throw error;

    if (payment === 'factuur') {
      await pushToOnlinefact(db, order.id);
      return json(req, { orderId: order.id, number: order.number });
    }

    const back = new URL(SITE_URL); back.searchParams.set('bestelling', order.id);
    const pay = await mollie('payments', { method: 'POST', body: JSON.stringify({
      amount: { currency: 'EUR', value: euro(total) },
      description: `VR Drinks bestelling ${order.number}`,
      redirectUrl: back.toString(),
      webhookUrl: env('SUPABASE_URL') + '/functions/v1/mollie-webhook',
      metadata: { order_id: order.id },
      locale: 'nl_BE',
    }) });
    await db.from('orders').update({ mollie_payment_id: pay.id }).eq('id', order.id);
    return json(req, { orderId: order.id, number: order.number, checkoutUrl: pay._links.checkout.href });
  } catch (e) {
    console.error(e);
    return json(req, { error: String((e as Error).message ?? e) }, 500);
  }
});
