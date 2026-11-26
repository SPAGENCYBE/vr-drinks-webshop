const root=window.VR_HERO_EL;
const film=root.querySelector('.impact-film');
const poster=root.querySelector('.impact-cover img');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const dark=new URL('./splash-fall-dark.mp4',import.meta.url).href;
let visible=false,checked=false,failed=false;

function sync(){
  if(!visible||document.hidden||motion.matches){film.pause();return}
  if(!failed&&!film.ended)film.play().catch(e=>{
    if(e.name==='NotAllowedError')poster.src='hero/splash-end.webp';
  });
}
function fallback(){
  if(film.currentSrc===dark||film.src===dark){
    failed=true;poster.src='hero/splash-end.webp';
    root.classList.remove('impact-playing');return;
  }
  root.classList.remove('impact-playing');
  film.src=dark;film.load();sync();
}
function checkAlpha(){
  if(checked||!film.currentSrc.endsWith('.webm'))return;
  checked=true;
  const probe=document.createElement('canvas');probe.width=probe.height=1;
  const ctx=probe.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(film,0,0,1,1,0,0,1,1);
  if(ctx.getImageData(0,0,1,1).data[3]>240)fallback();
}
film.addEventListener('loadeddata',checkAlpha);
film.addEventListener('playing',()=>{root.classList.add('impact-playing')});
film.addEventListener('error',fallback);
film.querySelector('source:last-child').addEventListener('error',fallback);
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync()}).observe(root);
document.addEventListener('visibilitychange',sync);
motion.addEventListener('change',sync);
