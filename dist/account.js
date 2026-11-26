'use strict';
// Klantaccount, afrekenen en bestelstatus. Gebruikt de globale helpers uit app.js ($, cart, byId, money, meta, esc, saveCart, announce).
(() => {
  const cfg = window.VR_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
  const base = location.origin + location.pathname;
  let session = null, profile = null, settings = null;

  const shop = () => $('shop');
  const setShop = html => { shop().innerHTML = html; };
  const msg = (el, text, ok) => { el.textContent = text; el.className = 'formmsg' + (ok ? ' ok' : ' err'); };
  const fieldVal = (form, name) => String(new FormData(form).get(name) ?? '').trim();
  const STATUS = {
    nieuw: 'Nieuw', wacht_op_betaling: 'Wacht op betaling', betaald: 'Betaald', op_factuur: 'Bevestigd (op factuur)',
    mislukt: 'Betaling mislukt', geannuleerd: 'Betaling geannuleerd', verlopen: 'Betaling verlopen',
  };

  async function loadProfile() {
    if (!session) { profile = null; return; }
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    profile = data;
  }
  async function loadSettings() {
    if (settings) return settings;
    const { data } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    return settings = data;
  }
  function updateHeader() {
    const link = document.querySelector('.account-link span');
    if (link) link.textContent = session ? (profile?.first_name || 'Account') : 'Inloggen';
  }

  // ---------- Inloggen / registreren ----------
  function authView(next = '#/account', tab = 'login', note = '') {
    meta('Inloggen', 'Log in of maak een account aan bij VR Drinks.');
    setShop(`<h1>${tab === 'register' ? 'Account aanmaken' : tab === 'forgot' ? 'Wachtwoord vergeten' : 'Inloggen'}</h1>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="login" aria-selected="${tab === 'login'}">Inloggen</button>
        <button role="tab" data-tab="register" aria-selected="${tab === 'register'}">Account aanmaken</button>
      </div>
      <div id="authpane"></div>`);
    shop().querySelectorAll('[data-tab]').forEach(b => b.onclick = () => authView(next, b.dataset.tab, note));
    const pane = $('authpane');
    if (tab === 'login') {
      pane.innerHTML = `<form class="form" id="loginForm" novalidate>
        <label class="field">E-mailadres<input name="email" type="email" autocomplete="email" required></label>
        <label class="field">Wachtwoord<input name="password" type="password" autocomplete="current-password" required minlength="8"></label>
        <button class="primary">Inloggen</button>
        <button type="button" class="under" id="forgot">Wachtwoord vergeten?</button>
        <p class="formmsg" role="status"></p></form>`;
      $('forgot').onclick = () => authView(next, 'forgot', note);
      $('loginForm').onsubmit = async e => {
        e.preventDefault(); const f = e.target, out = f.querySelector('.formmsg');
        msg(out, 'Even geduld…', true);
        const { error } = await sb.auth.signInWithPassword({ email: fieldVal(f, 'email'), password: fieldVal(f, 'password') });
        if (error) return msg(out, /confirm/i.test(error.message) ? 'Bevestig eerst je e-mailadres via de link in je mailbox.' : 'E-mailadres of wachtwoord klopt niet.');
        location.hash = next;
      };
    } else if (tab === 'register') {
      pane.innerHTML = `<form class="form" id="regForm" novalidate>
        <div class="row2"><label class="field">Voornaam<input name="first_name" autocomplete="given-name" required></label>
        <label class="field">Naam<input name="last_name" autocomplete="family-name" required></label></div>
        <label class="field">E-mailadres<input name="email" type="email" autocomplete="email" required></label>
        <label class="field">Gsm-nummer<input name="phone" type="tel" autocomplete="tel" required></label>
        <label class="field">Wachtwoord <small>(minstens 8 tekens)</small><input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
        <details class="biz"><summary>Bestel je voor een bedrijf?</summary>
          <div class="row2"><label class="field">Bedrijfsnaam<input name="company" autocomplete="organization"></label>
          <label class="field">Btw-nummer<input name="vat" placeholder="BE0123.456.789"></label></div></details>
        <label class="check"><input type="checkbox" name="terms" required> Ik ga akkoord met de algemene voorwaarden en het privacybeleid van VR Drinks.</label>
        <button class="primary">Account aanmaken</button>
        <p class="formmsg" role="status"></p></form>`;
      $('regForm').onsubmit = async e => {
        e.preventDefault(); const f = e.target, out = f.querySelector('.formmsg');
        if (!f.checkValidity()) { f.reportValidity(); return; }
        msg(out, 'Even geduld…', true);
        const { error } = await sb.auth.signUp({
          email: fieldVal(f, 'email'), password: fieldVal(f, 'password'),
          options: { emailRedirectTo: base + '?login=1', data: {
            first_name: fieldVal(f, 'first_name'), last_name: fieldVal(f, 'last_name'), phone: fieldVal(f, 'phone'),
            company: fieldVal(f, 'company'), vat: fieldVal(f, 'vat') } },
        });
        if (error) return msg(out, /registered|exists/i.test(error.message) ? 'Er bestaat al een account met dit e-mailadres. Log in of kies "Wachtwoord vergeten".' : 'Account aanmaken lukte niet: ' + error.message);
        setShop(`<h1>Bijna klaar</h1><p class="lead">We stuurden een mail naar <strong>${esc(fieldVal(f, 'email'))}</strong>. Klik op de link in die mail om je account te bevestigen.</p><p class="note">Geen mail ontvangen? Kijk ook in je spam.</p>`);
      };
    } else {
      pane.innerHTML = `<form class="form" id="forgotForm" novalidate>
        <label class="field">E-mailadres<input name="email" type="email" autocomplete="email" required></label>
        <button class="primary">Stuur me een link</button>
        <p class="formmsg" role="status"></p></form>`;
      $('forgotForm').onsubmit = async e => {
        e.preventDefault(); const f = e.target, out = f.querySelector('.formmsg');
        await sb.auth.resetPasswordForEmail(fieldVal(f, 'email'), { redirectTo: base + '?reset=1' });
        msg(out, 'Als er een account bestaat met dit e-mailadres, krijg je zo een mail met een link.', true);
      };
    }
  }

  function newPasswordView() {
    meta('Nieuw wachtwoord', 'Kies een nieuw wachtwoord.');
    setShop(`<h1>Nieuw wachtwoord</h1><form class="form" id="pwForm" novalidate>
      <label class="field">Nieuw wachtwoord <small>(minstens 8 tekens)</small><input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
      <button class="primary">Opslaan</button><p class="formmsg" role="status"></p></form>`);
    $('pwForm').onsubmit = async e => {
      e.preventDefault(); const f = e.target, out = f.querySelector('.formmsg');
      if (!f.checkValidity()) { f.reportValidity(); return; }
      const { error } = await sb.auth.updateUser({ password: fieldVal(f, 'password') });
      if (error) return msg(out, 'Opslaan lukte niet: ' + error.message);
      msg(out, 'Je wachtwoord is gewijzigd.', true);
      setTimeout(() => location.hash = '#/account', 900);
    };
  }

  // ---------- Mijn account ----------
  async function accountView(parts) {
    if (parts[1] === 'nieuw-wachtwoord') return newPasswordView();
    if (!session) return authView('#/account', parts[1] === 'aanmaken' ? 'register' : 'login');
    await loadProfile();
    meta('Mijn account', 'Je gegevens en bestellingen bij VR Drinks.');
    const p = profile ?? {};
    setShop(`<h1>Mijn account</h1><p class="note">Ingelogd als ${esc(session.user.email)} · <button class="under" id="logout">Afmelden</button></p>
      <div class="account-grid">
        <section><h2 class="h2s">Mijn gegevens</h2><form class="form" id="profForm" novalidate>
          <div class="row2"><label class="field">Voornaam<input name="first_name" value="${esc(p.first_name)}" required></label>
          <label class="field">Naam<input name="last_name" value="${esc(p.last_name)}" required></label></div>
          <label class="field">Gsm-nummer<input name="phone" type="tel" value="${esc(p.phone)}" required></label>
          <div class="row2"><label class="field">Bedrijfsnaam <small>(optioneel)</small><input name="company" value="${esc(p.company)}"></label>
          <label class="field">Btw-nummer <small>(optioneel)</small><input name="vat" value="${esc(p.vat)}"></label></div>
          <label class="field">Straat en nummer<input name="street" autocomplete="street-address" value="${esc(p.street)}"></label>
          <div class="row2"><label class="field">Postcode<input name="zip" inputmode="numeric" autocomplete="postal-code" value="${esc(p.zip)}"></label>
          <label class="field">Gemeente<input name="city" autocomplete="address-level2" value="${esc(p.city)}"></label></div>
          <button class="primary">Opslaan</button><p class="formmsg" role="status"></p>
          ${p.invoice_allowed ? '<p class="note">Je account is goedgekeurd om op factuur te betalen.</p>' : ''}
        </form></section>
        <section><h2 class="h2s">Mijn bestellingen</h2><div id="myOrders"><p class="note">Laden…</p></div></section>
      </div>`);
    $('logout').onclick = async () => { await sb.auth.signOut(); location.hash = '#/'; };
    $('profForm').onsubmit = async e => {
      e.preventDefault(); const f = e.target, out = f.querySelector('.formmsg');
      if (!f.checkValidity()) { f.reportValidity(); return; }
      const upd = Object.fromEntries(['first_name', 'last_name', 'phone', 'company', 'vat', 'street', 'zip', 'city'].map(k => [k, fieldVal(f, k) || null]));
      upd.updated_at = new Date().toISOString();
      const { error } = await sb.from('profiles').update(upd).eq('id', session.user.id);
      if (error) return msg(out, 'Opslaan lukte niet.');
      await loadProfile(); updateHeader(); msg(out, 'Opgeslagen.', true);
    };
    const { data: orders } = await sb.from('orders').select('id,number,status,total,created_at,fulfilment').order('created_at', { ascending: false }).limit(50);
    $('myOrders').innerHTML = orders?.length
      ? '<ul class="orders">' + orders.map(o => `<li><a href="#/bestelling/${o.id}"><strong>${esc(o.number)}</strong><span>${new Date(o.created_at).toLocaleDateString('nl-BE')} · ${o.fulfilment === 'afhalen' ? 'Afhalen' : 'Levering'}</span><span>${esc(STATUS[o.status] ?? o.status)}</span><b>${money(o.total)}</b></a></li>`).join('') + '</ul>'
      : '<p class="note">Je hebt nog geen bestellingen.</p>';
  }

  // ---------- Afrekenen ----------
  const depositOf = r => { const p = byId(r.id); return p?.deposit?.price > 0 ? p.deposit.price * r.qty : 0; };
  const minDate = days => { const d = new Date(); d.setDate(d.getDate() + days); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

  async function checkoutView() {
    meta('Afrekenen', 'Rond je bestelling bij VR Drinks af.');
    if (!cart.length) { setShop('<h1>Afrekenen</h1><p class="empty">Je winkelwagen is leeg.</p><a class="primary" href="#/assortiment">Naar het assortiment</a>'); return; }
    if (!session) return authView('#/afrekenen', 'login', 'Log in of maak een account aan om af te rekenen. Je winkelwagen blijft bewaard.');
    await loadProfile();
    const s = await loadSettings();
    if (!s) { setShop('<h1>Afrekenen</h1><p class="formmsg err">Afrekenen is tijdelijk niet beschikbaar. Probeer het later opnieuw.</p>'); return; }
    if (!session.user.email_confirmed_at) { setShop('<h1>Afrekenen</h1><p class="lead">Bevestig eerst je e-mailadres via de link in je mailbox.</p>'); return; }
    const p = profile ?? {};
    const sub = cart.reduce((t, r) => t + priceOf(r) * r.qty, 0);
    const dep = cart.reduce((t, r) => t + depositOf(r), 0);
    const stores = s.pickup_stores ?? [];
    const minAge = it => Number(it?.minAge ?? 0);
    const needAge = Math.max(0, ...cart.map(r => minAge(byId(r.id))));
    setShop(`<h1>Afrekenen</h1>
      <form class="form checkout" id="coForm" novalidate>
        <fieldset><legend>Hoe wil je je bestelling ontvangen?</legend>
          <label class="choice"><input type="radio" name="fulfilment" value="afhalen" checked> <span><strong>Afhalen</strong><small>Gratis, in onze winkel</small></span></label>
          <label class="choice"><input type="radio" name="fulfilment" value="leveren"> <span><strong>Laten leveren</strong><small>${s.delivery_fee ? `${money(s.delivery_fee)}, gratis vanaf ${money(s.free_delivery_from)}` : 'Gratis'}</small></span></label>
        </fieldset>
        <div id="pickupBox"><label class="field">Winkel<select name="store">${stores.map(st => `<option value="${esc(st.id)}">${esc(st.name)} · ${esc(st.address)}</option>`).join('')}</select></label></div>
        <div id="deliveryBox" hidden>
          <label class="field">Naam op de deur<input name="d_name" value="${esc([p.first_name, p.last_name].filter(Boolean).join(' '))}"></label>
          <label class="field">Straat en nummer<input name="d_street" value="${esc(p.street)}"></label>
          <div class="row2"><label class="field">Postcode<input name="d_zip" inputmode="numeric" value="${esc(p.zip)}"></label>
          <label class="field">Gemeente<input name="d_city" value="${esc(p.city)}"></label></div>
          <p class="note">We leveren in postcodes ${esc((s.delivery_zips ?? []).join(', '))}.</p>
        </div>
        <label class="field">Gewenste datum<input type="date" name="date" min="${minDate(s.lead_days)}" value="${minDate(s.lead_days)}"></label>
        <label class="field">Opmerking <small>(optioneel)</small><textarea name="note" rows="2" maxlength="500"></textarea></label>
        <fieldset><legend>Betalen</legend>
          <label class="choice"><input type="radio" name="payment" value="mollie" checked> <span><strong>Online betalen</strong><small>Bancontact, Payconiq, kredietkaart</small></span></label>
          ${p.invoice_allowed ? '<label class="choice"><input type="radio" name="payment" value="factuur"> <span><strong>Op factuur</strong><small>Voor goedgekeurde zakelijke klanten</small></span></label>' : ''}
        </fieldset>
        <div class="totals" id="totals"></div>
        ${needAge ? `<label class="check"><input type="checkbox" name="age" required> Mijn bestelling bevat alcohol. Ik bevestig dat ik ${needAge} jaar of ouder ben. Bij afhalen of levering kan naar een identiteitsbewijs gevraagd worden.</label>` : ''}
        <label class="check"><input type="checkbox" name="terms" required> Ik ga akkoord met de algemene voorwaarden.</label>
        <button class="primary" id="payBtn">Bestellen en betalen</button>
        <p class="formmsg" role="status"></p>
        ${s.example_values ? '<p class="note">Let op: leveringskosten en -gebied zijn nog voorbeeldwaarden.</p>' : ''}
      </form>`);
    const f = $('coForm');
    function refresh() {
      const deliver = f.fulfilment.value === 'leveren';
      $('pickupBox').hidden = deliver; $('deliveryBox').hidden = !deliver;
      const fee = deliver && sub < s.free_delivery_from ? s.delivery_fee : 0;
      $('totals').innerHTML = `<dl>
        <dt>Producten</dt><dd>${money(sub)}</dd>
        ${dep ? `<dt>Leeggoed</dt><dd>${money(dep)}</dd>` : ''}
        ${deliver ? `<dt>Levering</dt><dd>${fee ? money(fee) : 'Gratis'}</dd>` : ''}
        <dt class="grand">Totaal</dt><dd class="grand">${money(sub + dep + fee)}</dd></dl>
        ${sub < s.min_order ? `<p class="formmsg err">Het minimum bestelbedrag is ${money(s.min_order)}.</p>` : ''}`;
      $('payBtn').textContent = f.payment.value === 'factuur' ? 'Bestelling plaatsen' : 'Bestellen en betalen';
    }
    f.oninput = refresh; refresh();
    f.date.onchange = () => { if (new Date(f.date.value).getDay() === 0) { msg(f.querySelector('.formmsg'), 'Op zondag zijn we gesloten. Kies een andere dag.'); f.date.value = ''; } };
    f.onsubmit = async e => {
      e.preventDefault(); const out = f.querySelector('.formmsg');
      if (needAge && !f.age.checked) return msg(out, `Je bestelling bevat alcohol: bevestig dat je ${needAge} jaar of ouder bent.`);
      if (!f.terms.checked) return msg(out, 'Vink aan dat je akkoord gaat met de algemene voorwaarden.');
      const btn = $('payBtn'); btn.disabled = true; msg(out, 'Je bestelling wordt aangemaakt…', true);
      const { data: { session: fresh } } = await sb.auth.getSession();
      try {
        const res = await fetch(cfg.supabaseUrl + '/functions/v1/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey, Authorization: 'Bearer ' + fresh.access_token },
          body: JSON.stringify({
            items: cart.map(r => ({ id: r.id, qty: r.qty })),
            fulfilment: f.fulfilment.value, store: f.store?.value,
            delivery: { name: fieldVal(f, 'd_name'), street: fieldVal(f, 'd_street'), zip: fieldVal(f, 'd_zip'), city: fieldVal(f, 'd_city') },
            wanted_date: f.date.value || null, note: fieldVal(f, 'note'), payment: f.payment.value, terms: true, age_ok: needAge && f.age.checked ? needAge : 0,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Er ging iets mis.');
        if (body.checkoutUrl) { location.href = body.checkoutUrl; return; }
        location.hash = '#/bestelling/' + body.orderId;
      } catch (err) { msg(out, err.message); btn.disabled = false; }
    };
  }

  // ---------- Bestelstatus ----------
  async function orderView(id, tries = 0) {
    meta('Bestelling', 'Status van je bestelling bij VR Drinks.');
    if (!session) return authView('#/bestelling/' + id, 'login', 'Log in om je bestelling te bekijken.');
    const { data: o } = await sb.from('orders').select('*').eq('id', id).maybeSingle();
    if (!o) { setShop('<h1>Bestelling niet gevonden</h1><a class="under" href="#/account">Naar mijn account</a>'); return; }
    if (['betaald', 'op_factuur'].includes(o.status) && cart.length && sessionStorage.getItem('vrd-cleared') !== o.id) {
      cart.length = 0; saveCart(); sessionStorage.setItem('vrd-cleared', o.id);
    }
    const ok = ['betaald', 'op_factuur'].includes(o.status);
    const how = o.fulfilment === 'afhalen'
      ? `Afhalen in ${esc((settings?.pickup_stores ?? []).find(s => s.id === o.store)?.name ?? o.store)}`
      : `Levering: ${esc(o.delivery?.street)}, ${esc(o.delivery?.zip)} ${esc(o.delivery?.city)}`;
    const waiting = o.status === 'wacht_op_betaling', giveUp = waiting && tries >= 6;
    setShop(`<h1>${ok ? 'Bedankt voor je bestelling!' : giveUp ? 'Je betaling is nog niet afgerond' : waiting ? 'Betaling wordt gecontroleerd…' : 'Bestelling ' + esc(o.number)}</h1>
      <p class="lead">Bestelling <strong>${esc(o.number)}</strong> · ${esc(STATUS[o.status] ?? o.status)}</p>
      <p>${how}${o.wanted_date ? ' · ' + new Date(o.wanted_date).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}</p>
      <table class="lines"><tbody>${(o.lines ?? []).map(l => `<tr><td>${l.qty} ×</td><td>${esc(l.description)}</td><td>${money(l.total)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td>Totaal</td><td>${money(o.total)}</td></tr></tfoot></table>
      ${giveUp ? `<p class="note">Je bestelling is bewaard, maar nog niet betaald. Je winkelwagen staat nog klaar.</p><p class="actions">${o.checkout_url ? `<a class="primary" href="${esc(o.checkout_url)}">Verder betalen</a>` : ''}<a class="under" href="#/winkelwagen">Naar de winkelwagen</a></p>` : ''}
      ${['mislukt', 'geannuleerd', 'verlopen'].includes(o.status) ? '<p><a class="primary" href="#/afrekenen">Opnieuw proberen</a></p>' : ''}
      <p><a class="under" href="#/account">Al mijn bestellingen</a></p>`);
    if (waiting && tries < 6) setTimeout(() => { if (location.hash === '#/bestelling/' + id) orderView(id, tries + 1); }, 2000);
  }

  // ---------- Koppeling met de router van app.js ----------
  window.vrAccount = parts => accountView(parts);
  window.vrCheckout = () => checkoutView();
  window.vrOrder = id => orderView(id);

  const q = new URLSearchParams(location.search);
  sb.auth.onAuthStateChange(async (event, s) => {
    session = s;
    if (event === 'PASSWORD_RECOVERY') { location.hash = '#/account/nieuw-wachtwoord'; }
    await loadProfile(); updateHeader();
  });
  (async () => {
    const { data } = await sb.auth.getSession();
    session = data.session; await loadProfile(); updateHeader(); loadSettings();
    let target = null;
    if (q.get('bestelling')) target = '#/bestelling/' + q.get('bestelling');
    else if (q.get('reset')) target = '#/account/nieuw-wachtwoord';
    else if (q.get('login')) target = session ? '#/account' : '#/account';
    // Na terugkeer van Mollie of een mail-link: adres opkuisen en meteen de juiste pagina tonen.
    if (q.toString()) history.replaceState(null, '', location.pathname + (target ?? location.hash));
    if (target || /^#\/(account|afrekenen|bestelling)/.test(location.hash)) route();
  })();
})();
