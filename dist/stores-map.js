'use strict';
// Interactieve kaart "Ontdek onze winkels": Leaflet + OpenStreetMap, pas geladen als de sectie in beeld komt.
(() => {
  const STORES = {
    baasrode: {
      name: 'Baasrode', lat: 51.0335158, lng: 4.1706663,
      address: 'Theodoor Vermijlenstraat 20 A/B, 9200 Baasrode',
      // [dag (0 = zondag), open, dicht] in minuten
      hours: { 1: [540, 1050], 2: [540, 1050], 3: [540, 1050], 4: [540, 1050], 5: [540, 1050], 6: [540, 990] },
    },
  };
  const PHONE = '+32465070556', PHONE_LABEL = '0465 07 05 56';
  const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + '.' + String(m % 60).padStart(2, '0');

  // Huidige tijd in België, ongeacht de tijdzone van de bezoeker.
  function nowBrussels() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map(x => [x.type, x.value]));
    return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), min: +p.hour * 60 + +p.minute };
  }
  function status(store) {
    const { day, min } = nowBrussels(), today = store.hours[day];
    if (today && min >= today[0] && min < today[1]) return { open: true, text: `Nu open · tot ${hhmm(today[1])}` };
    if (today && min < today[0]) return { open: false, text: `Gesloten · opent vandaag om ${hhmm(today[0])}` };
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7, h = store.hours[d];
      if (h) return { open: false, text: `Gesloten · opent ${i === 1 ? 'morgen' : DAYS[d]} om ${hhmm(h[0])}` };
    }
    return { open: false, text: 'Gesloten' };
  }
  const section = document.getElementById('winkels');
  if (!section) return;
  const cards = [...section.querySelectorAll('[data-store]')];
  function paintStatus() {
    for (const card of cards) {
      const s = status(STORES[card.dataset.store]), el = card.querySelector('.openNow');
      el.textContent = s.text; el.classList.toggle('is-open', s.open);
    }
  }
  paintStatus(); setInterval(paintStatus, 60_000);

  // ---------- Kaart ----------
  let map = null, markers = {};
  const loadCss = href => new Promise(r => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = r; l.onerror = r; document.head.append(l); });
  const loadJs = src => new Promise((r, j) => { const s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = j; document.head.append(s); });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function popup(id) {
    const s = STORES[id], st = status(s);
    return `<div class="mapPop"><strong>VR Drinks ${esc(s.name)}</strong><span class="openNow${st.open ? ' is-open' : ''}">${esc(st.text)}</span>
      <span>${esc(s.address)}</span>
      <span class="popActions"><a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" rel="noopener">Route plannen</a><a href="tel:${PHONE}">Bel ${PHONE_LABEL}</a></span></div>`;
  }
  function select(id, fly = true) {
    for (const c of cards) c.classList.toggle('active', c.dataset.store === id);
    if (!map) return;
    const s = STORES[id];
    if (fly) map.flyTo([s.lat, s.lng], 15, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.8 });
    markers[id].setPopupContent(popup(id)).openPopup();
  }

  async function init() {
    const box = document.getElementById('storeMap');
    try {
      await loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
      await loadJs('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
    } catch { box.innerHTML = '<p class="mapLoading">De kaart kon niet geladen worden.</p>'; return; }
    box.innerHTML = '';
    const L = window.L;
    map = L.map(box, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'mapTiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    const icon = L.divIcon({ className: 'vrPin', html: '<span>VR</span>', iconSize: [44, 52], iconAnchor: [22, 50], popupAnchor: [0, -46] });
    for (const [id, s] of Object.entries(STORES)) {
      markers[id] = L.marker([s.lat, s.lng], { icon, title: 'VR Drinks ' + s.name, alt: 'VR Drinks ' + s.name, riseOnHover: true })
        .addTo(map).bindPopup(popup(id)).on('click', () => select(id, false));
    }
    map.setView([STORES.baasrode.lat, STORES.baasrode.lng], 14);
    markers.baasrode.openPopup();
    // Scrollen in de pagina niet kapen: zoomen met het muiswiel pas na een klik op de kaart.
    map.on('click focus', () => map.scrollWheelZoom.enable());
    map.on('mouseout blur', () => map.scrollWheelZoom.disable());
  }

  for (const c of cards) c.querySelector('.showOnMap').addEventListener('click', () => {
    select(c.dataset.store);
    if (matchMedia('(max-width: 860px)').matches) document.getElementById('storeMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { io.disconnect(); init(); }
  }, { rootMargin: '300px' });
  io.observe(section);
})();
