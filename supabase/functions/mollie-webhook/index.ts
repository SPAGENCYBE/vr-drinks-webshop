// Mollie roept deze functie aan bij elke statuswijziging van een betaling (POST, form: id=tr_...).
// We vertrouwen de inhoud niet: de status wordt altijd opnieuw bij Mollie opgevraagd.
import { admin, mollie, pushToOnlinefact } from '../_shared/shop.ts';

const MAP: Record<string, string> = { paid: 'betaald', failed: 'mislukt', canceled: 'geannuleerd', expired: 'verlopen' };

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const form = await req.formData();
    const id = String(form.get('id') ?? '');
    if (!/^tr_[A-Za-z0-9]+$/.test(id)) return new Response('ongeldig', { status: 400 });
    const payment = await mollie('payments/' + id);
    const db = admin();
    const { data: order } = await db.from('orders').select('id,status,mollie_payment_id,total').eq('mollie_payment_id', id).single();
    if (!order) return new Response('ok');
    const status = MAP[payment.status];
    if (status === 'betaald' && order.status !== 'betaald') {
      if (Math.round(Number(payment.amount.value) * 100) !== order.total) {
        await db.from('orders').update({ onlinefact_error: 'Bedrag van Mollie wijkt af van de bestelling.' }).eq('id', order.id);
        return new Response('ok');
      }
      await db.from('orders').update({ status: 'betaald', paid_at: new Date().toISOString() }).eq('id', order.id);
      await pushToOnlinefact(db, order.id);
    } else if (status && order.status === 'wacht_op_betaling') {
      await db.from('orders').update({ status }).eq('id', order.id);
    }
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return new Response('fout', { status: 500 });   // Mollie probeert later opnieuw
  }
});
