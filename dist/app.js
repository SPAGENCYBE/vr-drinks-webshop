'use strict';
const $=id=>document.getElementById(id), catalog=window.catalog, products=catalog.filter(p=>p.wrap), total=products.length;
const money=c=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(c/100);
const mod=(v,n)=>((v%n)+n)%n, nameOf=p=>p.title;
const packName=(p,n)=>p.label;
const productUrl=p=>'#/product/'+p.id;
const byId=id=>catalog.find(p=>p.id===id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const filters={q:'',brand:'',kind:'',pack:''};
let selected=0,target=0,car=0,carVel=0,home=false,frame=0,previous=0,scrollValue=-1,scrollVel=0,scene=null,view=null,step=-1;
let drag=null,wheelTimer,storedY=0,introStart=performance.now(),cart=[];
try{const saved=JSON.parse(localStorage.getItem('vrd-cart-v1'));if(Array.isArray(saved))cart=saved.filter(r=>r&&Number.isInteger(r.qty)&&r.qty>0&&r.qty<=999&&byId(r.id)?.available&&byId(r.id).packs.some(b=>b.units===r.units))}catch{}
const maxOf=p=>p.stock!=null&&p.stock>0?Math.min(999,p.stock):999;
const priceOf=r=>byId(r.id).packs.find(b=>b.units===r.units).price;
const subtotal=()=>cart.reduce((s,r)=>s+priceOf(r)*r.qty,0);
const depositTotal=()=>cart.reduce((s,r)=>{const p=byId(r.id);return s+(p&&p.deposit&&p.deposit.price>0?p.deposit.price*r.qty:0)},0);
function saveCart(){try{localStorage.setItem('vrd-cart-v1',JSON.stringify(cart))}catch{}updateCount()}
function updateCount(){const amount=cart.reduce((s,r)=>s+r.qty,0);$('count').textContent=amount;document.querySelector('.bag').setAttribute('aria-label','Winkelwagen, '+amount+(amount===1?' verkoopeenheid':' verkoopeenheden'))}
function meta(t,d){document.title=t+' | VR Drinks';document.querySelector('meta[name="description"]').content=d}
function announce(t){$('status').textContent=t}
const flagSvg={
 BE:'<svg viewBox="0 0 3 2" aria-hidden="true"><rect width="1" height="2" fill="#1a1a1a"/><rect x="1" width="1" height="2" fill="#FDDA24"/><rect x="2" width="1" height="2" fill="#EF3340"/></svg>',
 EU:'<svg viewBox="0 0 3 2" aria-hidden="true"><rect width="3" height="2" fill="#003399"/>'+Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,x=(1.5+.6*Math.sin(a)).toFixed(3),y=(1-.6*Math.cos(a)).toFixed(3);return '<circle cx="'+x+'" cy="'+y+'" r=".085" fill="#FFCC00"/>'}).join('')+'</svg>'};
const originName={BE:'Belgische versie',EU:'Europese versie'};
const flag=p=>p.origin&&flagSvg[p.origin]?'<span class="origin" title="'+originName[p.origin]+'">'+flagSvg[p.origin]+'<span class="sr">'+originName[p.origin]+'</span></span>':'';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function photo(p, miniature=false){
 const frame='photo '+(p.wrap||p.imageSource?'single-unit':'item-'+p.sourceId)+(miniature?' miniature':'');
 const content=p.image
   ? '<img src="'+p.image+'" alt="'+(miniature?'':nameOf(p))+'" loading="lazy">'
   : '<span class="no-photo">'+(miniature?'<b>'+esc(p.brand).slice(0,2)+'</b>':'<b>'+esc(p.brand)+'</b><small>Foto volgt</small>')+'</span>';
 return '<div class="'+frame+'">'+content+flag(p)+'</div>';
}
const cartLink='<a class="primary" href="#/assortiment">Naar het assortiment</a>';
const demo='<p class="note">Prijzen incl. btw. Leeggoed wordt apart aangerekend.</p>';
function options(items){return [...new Set(items.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'nl')).map(v=>[v,v])}
const departments=[
 ['Frisdrank',['Frisdrank']], ['Water',['Waters']], ['Sap & fruitdrank',['Fruitsap']],
 ['Energiedrank',['Energiedrank']], ['Sportdrank',['Sportdrank']], ['Melkdrank',['Melkdrank']],
 ['Alcohol',['Bieren','Wijnen','Cava','Alcohol']], ['Alcoholvrij bier',[]], ['Chips',['Chips']],
 ['Verhuur',['Verhuur Materiaal']], ['Pellets',['Pellets']], ['Leeggoed',['Waarborg']]
];
const alcoholSections=['Bier','Wijn & bubbels','Aperitieven, sterke drank & mixdranken'];
const alcoholFree=new Set([2643,2980,2361,2289,3302]);
const aperitifsAndMixes=new Set([2322,3853]);
const alphabet=new Intl.Collator('nl-BE',{numeric:true,sensitivity:'base'});
function department(p){
 if(alcoholFree.has(p.sourceId))return 'Alcoholvrij bier';
 return departments.find(([,kinds])=>kinds.includes(p.kind))?.[0]||p.kind;
}
function alcoholSection(p){
 if(aperitifsAndMixes.has(p.sourceId)||p.kind==='Alcohol')return alcoholSections[2];
 return p.kind==='Bieren'?alcoholSections[0]:alcoholSections[1];
}
function sortName(p){return p.title.replace(/^(?:bak|pet)\s+/i,'').replace(/coca-cola/ig,'Coca Cola')}
function stockLine(p){
 if(!p.available)return '<span class="stockDot out">Uitverkocht</span>';
 if(p.stock!=null&&p.stock<=5)return '<span class="stockDot low">Nog '+p.stock+' beschikbaar</span>';
 return '<span class="stockDot">Op voorraad</span>';
}
function productTile(p){
 const pack=p.packs[0],url=productUrl(p);
 const buy=p.available?'<form class="quickAdd" data-add="'+p.id+'"><label class="sr" for="qa-'+p.id+'">Aantal</label><input id="qa-'+p.id+'" type="number" inputmode="numeric" min="1" max="'+maxOf(p)+'" value="1" required><button type="submit">In winkelwagen</button></form>':'<a class="quickMore" href="'+url+'">Bekijk product</a>';
 return '<article class="tile"><a class="tilePhoto" href="'+url+'" tabindex="-1" aria-hidden="true">'+photo(p,false)+'</a><div class="tileBody"><span class="tileBrand">'+esc(p.brand)+'</span><a class="tile-name" href="'+url+'">'+esc(nameOf(p))+'</a><span class="tilePack">'+esc(packName(p,pack.units))+'</span><strong class="tilePrice">'+money(pack.price)+'</strong>'+stockLine(p)+buy+'</div></article>';
}
function bindQuickAdd(root){
 root.querySelectorAll('[data-add]').forEach(form=>form.onsubmit=e=>{
  e.preventDefault();const p=byId(form.dataset.add),input=form.querySelector('input'),btn=form.querySelector('button');
  if(!input.checkValidity()){input.reportValidity();return}
  const units=p.packs[0].units,qty=+input.value,max=maxOf(p),existing=cart.find(r=>r.id===p.id&&r.units===units);
  if((existing?existing.qty:0)+qty>max){announce(max<999?'Er zijn nog maar '+max+' beschikbaar.':'Maximaal 999 per verkoopeenheid.');btn.textContent='Max. '+max;setTimeout(()=>btn.textContent='In winkelwagen',1800);return}
  if(existing)existing.qty+=qty;else cart.push({id:p.id,units,qty});saveCart();
  announce(qty+' × '+nameOf(p)+' toegevoegd aan de winkelwagen');btn.textContent='Toegevoegd ✓';btn.classList.add('done');input.value=1;
  setTimeout(()=>{btn.textContent='In winkelwagen';btn.classList.remove('done')},1800);
 });
}
function productGrid(items){return '<div class="grid">'+items.map(productTile).join('')+'</div>'}
function searchText(value){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/(\d)[,.](?=\d)/g,'$1').replace(/(\d)\s*x\s*(?=\d)/g,'$1').replace(/[\s%×–-]+/g,'')}
const brandKey=b=>String(b||'').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');
const keyOf=p=>{const d=department(p);return d==='Alcohol'?alcoholSection(p):d};
const shopGroups=[
 {slug:'frisdrank',name:'Frisdrank',keys:['Frisdrank'],intro:'Cola, limonade, ice tea, tonic en meer: de bekende merken in blik, petfles en glas. Per stuk, per tray of per bak, zoals het jou past.'},
 {slug:'water',name:'Water',keys:['Water'],intro:'Plat en bruisend water van onder meer Spa, Chaudfontaine en Ordal. Handig in grote verpakkingen voor thuis, op kantoor of op een feest.'},
 {slug:'energie-sport',name:'Energie & sport',keys:['Energiedrank','Sportdrank'],intro:'Energiedranken en sportdranken voor wie een extra boost zoekt. Met een ruime keuze aan smaken, ook zonder suiker.'},
 {slug:'sap-melk',name:'Sap & melk',keys:['Sap & fruitdrank','Melkdrank'],intro:'Fruitsap, fruitdrank en chocomelk: voor bij het ontbijt, op school of gewoon tussendoor.'},
 {slug:'bier',name:'Bier',keys:['Bier'],intro:'Pils, abdijbier, trappist en speciaalbier. Van de Belgische klassiekers tot een fris pintje voor op het terras.'},
 {slug:'alcoholvrij',name:'Alcoholvrij',keys:['Alcoholvrij bier'],intro:'Alle smaak van een goed bier, zonder alcohol. Ideaal als je nog moet rijden of gewoon iets lichters wilt.'},
 {slug:'wijn-bubbels',name:'Wijn & bubbels',keys:['Wijn & bubbels'],intro:'Rode, witte en rosé wijn, en bubbels voor een feestelijk moment.'},
 {slug:'sterke-drank',name:'Sterke drank',keys:['Aperitieven, sterke drank & mixdranken'],intro:'Aperitieven, jenever, sterke drank en mixdranken voor een gezellig aperitief of een feest.'},
 {slug:'overige',name:'Overige',keys:[],intro:'Chips, koffie, cadeauverpakkingen en andere handige extra’s.'},
 {slug:'verhuur',name:'Verhuur',keys:['Verhuur'],accent:true,intro:'Huur een bakfrigo, koelaanhanger, tafels en ander feestmateriaal. Vraag gerust naar de mogelijkheden.'}
];
const knownKeys=new Set(shopGroups.flatMap(g=>g.keys));
const groupOf=p=>{const k=keyOf(p);return shopGroups.find(g=>g.keys.includes(k))||shopGroups.find(g=>g.slug==='overige')};
const groupBySlug=slug=>slug==='alcohol'?{slug:'alcohol',name:'Alcohol',keys:alcoholSections,intro:'Bier, wijn, bubbels en sterke drank. Alcohol verkopen we enkel aan wie oud genoeg is.'}:shopGroups.find(g=>g.slug===slug);
const inGroup=(p,g)=>g.slug==='overige'?!knownKeys.has(keyOf(p)):g.keys.includes(keyOf(p));
function brandsOf(items){const m=new Map();items.forEach(p=>{const k=brandKey(p.brand);if(!k)return;const e=m.get(k)||{key:k,names:{},n:0};e.n++;e.names[p.brand]=(e.names[p.brand]||0)+1;m.set(k,e)});return [...m.values()].map(e=>({key:e.key,n:e.n,name:Object.entries(e.names).sort((a,b)=>b[1]-a[1])[0][0]}))}
function buildCatbar(){
 const bar=$('catbar');if(!bar)return;
 bar.innerHTML='<ul>'+shopGroups.map(g=>{
  const items=catalog.filter(p=>inGroup(p,g));if(!items.length)return '';
  const brands=brandsOf(items).sort((a,b)=>b.n-a.n||alphabet.compare(a.name,b.name)).slice(0,10).sort((a,b)=>alphabet.compare(a.name,b.name));
  const menu=brands.length>1?'<div class="catMenu"><div><strong>Merken</strong>'+brands.map(b=>'<a href="#/assortiment/'+g.slug+'/'+b.key+'">'+esc(b.name)+'</a>').join('')+'</div>'+'<a class="catAll" href="#/assortiment/'+g.slug+'">Alles in '+esc(g.name.toLowerCase())+' ('+items.length+')</a></div>':'';
  return '<li class="'+(g.accent?'accent':'')+(menu?' hasMenu':'')+'"><a class="catLink" data-slug="'+g.slug+'" href="#/assortiment/'+g.slug+'">'+esc(g.name)+(menu?'<svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5"/></svg>':'')+'</a>'+menu+'</li>';
 }).join('')+'</ul>';
 bar.addEventListener('click',e=>{if(e.target.closest('.catMenu a'))document.activeElement?.blur()});
}
function markCatbar(slug){document.querySelectorAll('#catbar .catLink').forEach(a=>a.toggleAttribute('aria-current',a.dataset.slug===slug))}
let activeCategory;
function assortment(slug,brand){
 const group=slug?groupBySlug(slug):null;
 const brandName=brand?(brandsOf(catalog.filter(p=>brandKey(p.brand)===brand))[0]||{}).name:'';
 const title=group?(brandName?brandName+' · '+group.name:group.name):(brandName||'Assortiment');
 meta(title,group?group.intro:'Doorzoek het assortiment van VR Drinks op merk, categorie en verpakking.');
 markCatbar(group?group.slug:'');
 const scope=group?catalog.filter(p=>inGroup(p,group)):catalog;
 const select=(id,label,values)=>'<label>'+label+'<select id="'+id+'"><option value="">Alle</option>'+values.map(([v,l])=>'<option value="'+v+'">'+esc(l)+'</option>').join('')+'</select></label>';
 const names=[...new Set([...departments.map(([name])=>name),...catalog.map(department)])].filter(name=>scope.some(p=>department(p)===name));
 const brandOptions=brandsOf(scope).sort((a,b)=>alphabet.compare(a.name,b.name)).map(b=>[b.key,b.name]);
 const crumbs='<nav class="crumbs" aria-label="Kruimelpad"><a href="#/">Home</a><span>/</span>'+(group?'<a href="#/assortiment">Assortiment</a><span>/</span>'+(brandName?'<a href="#/assortiment/'+group.slug+'">'+esc(group.name)+'</a><span>/</span><span aria-current="page">'+esc(brandName)+'</span>':'<span aria-current="page">'+esc(group.name)+'</span>'):'<span aria-current="page">Assortiment</span>')+'</nav>';
 const intro=group?group.intro:'Frisdrank, water, bier, wijn, sterke drank en meer. Kies hierboven een categorie of zoek meteen je favoriete drankje.';
 $('shop').innerHTML=crumbs+'<div class="shopHead"><h1>'+esc(title)+'</h1><div><p>'+esc(intro)+'</p>'+demo+'</div></div><div class="filters"><label>Zoeken<input type="search" id="q" placeholder="Zoek een product"></label>'+select('brand','Merk',brandOptions)+select('pack','Verpakking',options(scope.map(p=>p.packType)))+'</div><p class="note result-count" id="resultCount" role="status"></p><div id="results"></div>';
 filters.kind='';
 if(brand)filters.brand=brand;else if(!brandOptions.some(([k])=>k===filters.brand))filters.brand='';
 if(filters.pack&&!scope.some(p=>p.packType===filters.pack))filters.pack='';
 function list(){
  const query=searchText(filters.q);
  const found=scope.filter(p=>{
   const name=department(p),sub=name==='Alcohol'?alcoholSection(p):'';
   return (!filters.brand||brandKey(p.brand)===filters.brand)&&(!filters.pack||p.packType===filters.pack)&&searchText([nameOf(p),p.label,p.brand,p.sku,name,sub,p.origin||'',p.origin?originName[p.origin]:''].join(' ')).includes(query);
  }).sort((a,b)=>alphabet.compare(sortName(a),sortName(b))||alphabet.compare(a.label,b.label)||alphabet.compare(a.origin||'',b.origin||''));
  $('resultCount').textContent=found.length+(found.length===1?' artikel':' artikelen');
  $('results').innerHTML=names.map(name=>{
   const items=found.filter(p=>department(p)===name);
   if(!items.length)return '';
   const content=name==='Alcohol'?alcoholSections.map(label=>{
    const subset=items.filter(p=>alcoholSection(p)===label);
    return subset.length?(group&&group.keys.length===1?'':'<h3 class="subheading">'+label+'</h3>')+productGrid(subset):'';
   }).join(''):productGrid(items);
   const heading=group&&names.length===1?'':'<h2 class="department-name">'+name+'</h2>';
   return '<section class="department">'+heading+content+'</section>';
  }).join('')||'<p>Geen producten gevonden.</p>';
  bindQuickAdd($('results'));
 }
 ['q','brand','pack'].forEach(k=>{const el=$(k);el.value=filters[k];el.oninput=()=>{filters[k]=el.value;list()}});list()
}
function detail(p){
 meta(nameOf(p)+' · '+p.label,nameOf(p)+' · '+p.label+'. Bekijk de prijs bij VR Drinks.');
 $('shop').innerHTML='<a class="crumb" href="#/assortiment">Alle dranken</a><div class="detail">'+photo(p)+'<div><div class="eyebrow">'+department(p)+'</div><h1>'+nameOf(p)+'</h1>'+(p.taste?'<p>'+p.taste+'</p>':'')+(p.deposit&&p.deposit.price>0?'<p class="note">+ '+money(p.deposit.price)+' leeggoed ('+esc(p.deposit.label.replace(/^Leeggoed\s*/i,''))+')</p>':'')+demo+'<form class="order"><label class="field">Verpakking<select id="units">'+p.packs.map(b=>'<option value="'+b.units+'">'+packName(p,b.units)+' — '+money(b.price)+'</option>').join('')+'</select></label><label class="field">Aantal verkoopeenheden<input id="qty" type="number" min="1" max="999" step="1" required value="1"></label><output class="price" id="line"></output><button class="primary">In winkelwagen</button></form></div></div>';
 if(!p.available){document.querySelector('.order').outerHTML='<p><strong>Uitverkocht</strong> · '+p.label+' · '+money(p.packs[0].price)+'</p><a class="under" href="#/assortiment">Terug naar het assortiment</a>';return}
 const max=maxOf(p);$('qty').max=max;if(p.stock!=null)document.querySelector('.order').insertAdjacentHTML('afterbegin','<p class="stock'+(p.stock<=5?' low':'')+'">'+(p.stock<=5?'Nog '+p.stock+' beschikbaar':'Op voorraad')+'</p>');
 const b=()=>p.packs.find(b=>b.units===+$('units').value);
 function refresh(){$('line').textContent=$('qty').validity.valid?'Totaal '+money(b().price*+$('qty').value):'Vul een aantal van 1 tot '+max+' in.'}
 const form=document.querySelector('.order');form.oninput=refresh;refresh();form.onsubmit=e=>{e.preventDefault();const units=b().units,qty=+$('qty').value,existing=cart.find(r=>r.id===p.id&&r.units===units);if((existing?existing.qty:0)+qty>max){$('line').textContent=max<999?'Er zijn nog maar '+max+' beschikbaar.':'Maximaal 999 per verkoopeenheid.';return}if(existing)existing.qty+=qty;else cart.push({id:p.id,units,qty});saveCart();announce('Toegevoegd aan de winkelwagen');location.hash='/winkelwagen'}
}
function basket(checkout=false){
 meta(checkout?'Afrekenen (demo)':'Winkelwagen',checkout?'Controleer je selectie in de VR Drinks-democheckout.':'Bekijk de verpakkingen en aantallen in je VR Drinks-winkelwagen.');
 $('shop').innerHTML='<h1>'+(checkout?'Afrekenen (demo)':'Winkelwagen')+'</h1>'+demo;
 if(!cart.length){$('shop').innerHTML+='<p class="empty">Je winkelwagen is leeg.</p>'+cartLink;return}
 const rows=cart.map((r,i)=>{const p=byId(r.id);return '<div class="row">'+photo(p,true)+'<div class="desc"><a href="'+productUrl(p)+'"><strong>'+nameOf(p)+'</strong></a><p>'+packName(p,r.units)+' · '+money(priceOf(r))+'</p></div>'+(checkout?'<span>'+r.qty+' ×</span>':'<label>Aantal <input data-qty="'+i+'" aria-label="Aantal '+nameOf(p)+' '+packName(p,r.units)+'" type="number" min="1" max="'+maxOf(p)+'" value="'+r.qty+'"></label>')+'<b>'+money(r.qty*priceOf(r))+'</b>'+(checkout?'':'<button data-remove="'+i+'">Verwijder</button>')+'</div>'}).join('');
 $('shop').innerHTML+=rows+'<div class="summary"><strong class="price">Producten '+money(subtotal())+'</strong>'+(depositTotal()?'<span>Leeggoed '+money(depositTotal())+'</span>':'')+(checkout?'<p>Dit is het einde van de testbestelling. Betaling en verzending zijn uitgeschakeld.</p><a class="pill" href="#/winkelwagen">Terug naar de winkelwagen</a>':'<a class="primary" href="#/afrekenen">Afrekenen</a><a class="under" href="#/assortiment">Verder winkelen</a>')+'</div>';
 $('shop').querySelectorAll('[data-qty]').forEach(el=>el.onchange=()=>{const i=+el.dataset.qty;if(!el.checkValidity()){el.reportValidity();el.value=cart[i].qty;return}cart[i].qty=+el.value;saveCart();basket();$('shop').querySelector('[data-qty="'+i+'"]').focus()});
 $('shop').querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{cart.splice(+el.dataset.remove,1);saveCart();basket();$('shop').querySelector('button,a')?.focus()});
}
function route(){const parts=location.hash.slice(1).split('/').filter(Boolean),was=home;
 if(parts[0]==='ontdek'){location.replace('#/winkels');return}
 home=false;
 const front=!parts.length||parts[0]==='winkels';$('landing').hidden=!front;if($('catbar'))$('catbar').hidden=front||home;if(parts[0]!=='assortiment')markCatbar('');
 if(was&&!home)storedY=scrollY;document.body.classList.toggle('home',home);$('home').hidden=!home;$('shop').hidden=home;
 if(front){cancelAnimationFrame(frame);frame=0;$('shop').hidden=true;meta('Drank voor elk moment.','Ontdek VR Drinks en bekijk de adres en de openingsuren van de winkel in Baasrode.');if(parts[0]==='winkels')requestAnimationFrame(()=>$('winkels').scrollIntoView());else window.scrollTo(0,0);if(!window.VR_HERO_EL){window.VR_HERO_EL=document.querySelector('.vh');import('./hero/vr-hero.js?v=splash9').catch(()=>{})}return}
 if(home){meta('Drankenwinkel','Ontdek Coca-Cola, Fanta en Sprite in de interactieve drankenwinkel van VR Drinks.');window.scrollTo(0,storedY);start()}
 else{cancelAnimationFrame(frame);frame=0;window.scrollTo(0,0);
 if(parts[0]==='assortiment'){
  const slug=parts[1]&&groupBySlug(parts[1])?parts[1]:'',brand=slug&&parts[2]?parts[2]:'';
  const key=slug+'/'+brand;if(key!==activeCategory)Object.assign(filters,{q:'',brand:'',kind:'',pack:''});
  activeCategory=key;
  assortment(slug,brand);
 }else if(parts[0]==='product'&&byId(parts[1]))detail(byId(parts[1]));else if(parts[0]==='winkelwagen')basket();else if(parts[0]==='afrekenen'&&window.vrCheckout)window.vrCheckout();else if(parts[0]==='account'&&window.vrAccount)window.vrAccount(parts);else if(parts[0]==='bestelling'&&window.vrOrder&&parts[1])window.vrOrder(parts[1]);else $('shop').innerHTML='<h1>Pagina niet gevonden</h1>'+cartLink;
 $('shop').setAttribute('tabindex','-1');$('shop').focus({preventScroll:true})}
}
document.querySelector('.hours-jump').onclick=()=>{$('winkels').focus({preventScroll:true});$('winkels').scrollIntoView({behavior:reduced.matches?'instant':'smooth'})};
const steps=['Smaak','Productinformatie','Verpakking'];
$('steps').innerHTML=steps.map((n,i)=>'<button aria-label="'+n+'" title="'+n+'">'+['◒','ⓘ','▦'][i]+'</button>').join('');
Array.from($('steps').children).forEach((b,i)=>b.onclick=()=>scrollTo(0,carouselTop()+innerHeight*(.75+(i+.5)*.85)));
$('rail').innerHTML=products.map(p=>'<button aria-label="Kies '+nameOf(p)+'"><i class="sw" style="--sw:'+p.color+'"></i><span><strong>'+p.brand+'</strong><small>'+p.variant+'</small></span></button>').join('');
Array.from($('rail').children).forEach((b,i)=>b.onclick=()=>{let d=mod(i-mod(Math.round(target),total)+total/2,total)-total/2;target=Math.round(target)+d});
function heroText(i,dir){const p=products[i];$('title').innerHTML='<span>'+p.brand+'</span><small>'+p.variant+'</small>';$('type').textContent=p.kind+' / '+p.volume+' ml';$('taste').textContent=p.taste;$('productLink').href=productUrl(p);$('stage').style.setProperty('--glow',p.glow);if(dir&&!reduced.matches)$('title').animate([{transform:'translateY('+dir*22+'px)',opacity:0},{transform:'none',opacity:1}],{duration:430,easing:'cubic-bezier(.22,1,.36,1)'});Array.from($('rail').children).forEach((b,n)=>b.setAttribute('aria-pressed',i===n));step=-1}
function storyText(i){if(step===i)return;step=i;const p=products[mod(selected,total)];$('storyProduct').textContent=nameOf(p);$('storyTitle').textContent=steps[i];$('storyText').textContent=[p.taste,p.kind+' · '+p.volume+' ml per blik.',p.packs.map(b=>packName(p,b.units)).join(' of ')+'.'][i];Array.from($('steps').children).forEach((b,n)=>b.setAttribute('aria-pressed',n===i))}
$('prev').onclick=()=>target=Math.round(target)-1;$('next').onclick=()=>target=Math.round(target)+1;
window.addEventListener('keydown',e=>{if(home&&scrollValue>-.2&&scrollValue<.28&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();target=Math.round(target)+(e.key==='ArrowRight'?1:-1)}});
const gl=$('gl');gl.onpointerdown=e=>{if(!home||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,last:e.clientX,time:performance.now(),start:car,v:0,moved:false};gl.setPointerCapture(e.pointerId)};
gl.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>6)drag.moved=true;if(!drag.moved||scrollValue>.3)return;const now=performance.now(),stride=innerWidth*(innerWidth<760?.33:.18);drag.v=Math.max(-14,Math.min(14,.65*drag.v+.35*(drag.last-e.clientX)/stride*1000/Math.max(8,now-drag.time)));drag.last=e.clientX;drag.time=now;target=drag.start-dx/stride;car=target;carVel=0};
gl.onpointerup=e=>{if(!drag)return;const d=drag;drag=null;if(d.moved&&scrollValue<.3){target=Math.round(car+(performance.now()-d.time>90?0:d.v)*.22);return}if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>6)return;let hit=scene?.pick(e,view)??fallbackPick(e);if(hit==null)return;if(scrollValue>5.55)location.href=productUrl(products[hit%total]);else if(scrollValue<.25)target=Math.round(car+distance(hit,car))};
gl.onpointercancel=()=>{drag=null;target=Math.round(target)};
gl.addEventListener('wheel',e=>{if(scrollValue>.3||Math.abs(e.deltaX)<=Math.abs(e.deltaY))return;e.preventDefault();target+=e.deltaX/220;clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>target=Math.round(target),130)},{passive:false});
const clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,t)=>a+(b-a)*t;
function ease(x){x=clamp(x);return x*x*(3-2*x)}
const instances=total*3, distance=(i,pos)=>mod(i-pos+instances/2,instances)-instances/2;
const fallback=$('fallback');for(let i=0;i<instances;i++){const img=new Image();img.src=products[i%total].image;img.alt='';fallback.append(img)}
function fallbackPick(e){if(scene)return null;return [...fallback.children].map((img,i)=>({img,i})).filter(({img})=>{const r=img.getBoundingClientRect();return !img.hidden&&e.clientX>r.left&&e.clientX<r.right&&e.clientY>r.top&&e.clientY<r.bottom}).sort((a,b)=>+b.img.style.zIndex-+a.img.style.zIndex)[0]?.i}
function show(id,value){const el=$(id);el.hidden=value<.01;el.inert=value<.5;el.style.opacity=value}
function poses(y,t){
 const stage=$('stage'),w=stage.clientWidth,h=stage.clientHeight,W=w/h*5.359,H=5.359;
 const mobile=w<=760&&h>w*.85,k=mobile?0:1;
 const a=ease(y/.75),s=clamp((y-.75)/2.55),b=ease((y-3.3)/.65),m=ease((y-3.95)/1.05),c=ease((y-5)/.7),l=ease((y-5.7)/1.35);
 stage.classList.toggle('hero-stage',a<.05);const active=mod(selected,instances),currentStep=Math.min(2,Math.floor(s*3)),quiet=reduced.matches;
 const intro=quiet?1:ease((performance.now()-introStart)/1050);storyText(currentStep);
 show('hero',1-ease((y-.01)/.4));show('story',ease((y-.45)/.32)*(1-ease((y-3.3)/.4)));show('end',ease((y-5.43)/.34));
 stage.style.setProperty('--dark',c);$('brandWall').style.opacity=b*(1-c)*.84;$('brandWall').style.filter='blur('+((1-m)*13)+'px)';
 const list=[];
 for(let i=0;i<instances;i++){
 const d=distance(i,car),abs=Math.abs(d),slot=mod(i-active,instances),side=Math.min(1,abs),is=i===active;
 const introSide=(1-intro)*Math.sign(d);
 let scale=(mobile?.365:.54)*H*(1-.31*side-.05*Math.min(3,Math.max(0,abs-1)));
 let x=((mobile?0:.183)+d*(mobile?.365:.184))*W+introSide*.46*W;
 let yPos=(mobile?-.106:-.005)*H+(quiet?0:Math.sin(t*.85+i)*.018)+side*.02*H-(1-intro)*.30*H;
 let z=-Math.min(abs,5)*.74,rz=-.115+side*Math.sin(i*2+1)*.17,ry=-d*.21;
 if(is){let turn=ease(s/.17),storyScale=(mobile?.59:.92)*H;let storyY=(mobile?-.24:-.085)*H+turn*s*.13*H;
 x=mix(x,(mobile?0:-.215)*W,a);yPos=mix(yPos,storyY,a);scale=mix(scale,storyScale,a);rz=mix(rz,mix(.19,.035,turn),a);ry=mix(ry,quiet?0:Math.PI*turn,a);
 x=mix(x,0,b);yPos=mix(yPos,-.08*H,b);scale=mix(scale,(mobile?.43:.58)*H,b);rz=mix(rz,-.12,b);ry=mix(ry,quiet?0:Math.PI*2,b)+(quiet?0:m*Math.PI*2);
 }else{x+=Math.sign(d)*W*.95*a;scale*=1-.25*a}
 let u=slot-2*l,sz=(mobile?.39:.58)*H,zz=1.35-u*1.55;
 let lx=(-.29+u*(mobile?.32:.133)+Math.min(0,u)*.38)*W,ly=-.36*H+sz/2;
 let enter=is?c:ease((c-(slot%5)*.029)/(1-(slot%5)*.029));
 if(c>0&&!is&&b>.99){x=lx+(slot%2?1:-1)*1.25*W;yPos=ly+.05*H;ry=slot%2?1.2:-1.2}
 x=mix(x,lx,enter);yPos=mix(yPos,ly,enter);z=mix(z,zz,enter);rz=mix(rz,.01,enter);ry=mix(ry,-.38+Math.sin(.8*u+2.5*l)*.12+(is&&!quiet?4*Math.PI:0),enter);scale=mix(scale,sz,enter);
 const visible=is||(a<.99&&abs<1.99)||c>.001;list.push({i,x,y:yPos,z,scale,rz,ry,visible,light:mix(1-.24*side,1,Math.max(a,c))});
 }
 return {list,W,H,w,h,c,a,b,s,currentStep,active,t,quiet}
}
function drawFallback(v){for(const o of v.list){const img=fallback.children[o.i];img.hidden=!o.visible;if(!o.visible)continue;const persp=10/(10-o.z),height=o.scale/v.H*v.h*persp;
 Object.assign(img.style,{height:height+'px',width:height*.57+'px',left:(.5+o.x/v.W*persp)*100+'%',top:(.5-o.y/v.H*persp)*100+'%',zIndex:String(30+Math.round(o.z*2)),transform:'translate(-50%,-50%) rotate('+(-o.rz)+'rad)'})}}
const carouselStage=$('stage'),carouselTop=()=>0;
function tick(now){frame=0;if(!home||document.hidden)return;const dt=Math.min(.05,(now-previous)/1000||.016);previous=now;

 const progress=(scrollY-carouselTop())/innerHeight;
 const carouselVisible=progress>=0;
 carouselStage.inert=!carouselVisible;
 carouselStage.style.visibility=carouselVisible?'visible':'hidden';
 if(progress>.35&&scrollValue<=.35)target=Math.round(car);
 const n=Math.max(1,Math.ceil(dt*240)),h=dt/n,omega=reduced.matches?40:5.6;
 for(let i=0;i<n;i++){scrollVel+=(omega*omega*(progress-scrollValue)-2*omega*scrollVel)*h;scrollValue+=scrollVel*h;if(!drag){const rate=reduced.matches?42:9;carVel+=(rate*rate*(target-car)-2*rate*carVel)*h;car+=carVel*h}}
 const next=Math.round(car);if(next!==selected){const dir=Math.sign(next-selected);selected=next;heroText(mod(selected,total),dir)}
 view=poses(Math.max(0,scrollValue),now/1000);if(scene)scene.draw(view,dt);else drawFallback(view);frame=requestAnimationFrame(tick)
}
function start(){if(!frame&&!document.hidden){previous=performance.now();frame=requestAnimationFrame(tick)}}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}else if(home)start()});
buildCatbar();window.addEventListener('hashchange',route);heroText(0,0);updateCount();route();
async function loadStock(){try{const r=await fetch('stock.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)return;const data=await r.json();
 for(const p of catalog){const it=data.items&&data.items[p.id];if(!it||!it.managestock)continue;p.stock=it.stock;p.available=it.stock>0}
 cart=cart.filter(r=>byId(r.id)&&byId(r.id).available);cart.forEach(r=>{const m=maxOf(byId(r.id));if(r.qty>m)r.qty=m});saveCart();
 if(!home&&/^#\/(assortiment|product|winkelwagen)/.test(location.hash)){const y=scrollY;route();scrollTo(0,y)}}catch{}}
loadStock();
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s)})}
async function loadScene(){try{await loadScript('three.min.js');await Promise.all([loadScript('impact.js?v=3'),loadScript('scene.js?v=impact3')]);scene=await window.createStudio(gl);fallback.hidden=true;gl.addEventListener('webglcontextlost',e=>{e.preventDefault();scene=null;fallback.hidden=false;gl.style.opacity=0});}catch{scene=null;fallback.hidden=false}}
if(home)requestAnimationFrame(()=>setTimeout(loadScene,0));else window.addEventListener('hashchange',function init(){if(home){window.removeEventListener('hashchange',init);loadScene()}});
