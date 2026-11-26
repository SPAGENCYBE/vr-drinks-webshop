// The crown is a moving polar sheet. Each rim crest launches a cluster of droplets.
window.makeImpact = async function(T, studio, canPrototype, loader) {
 const scene = new T.Scene();
 scene.environment = studio.environment;
 for (const light of studio.children.filter(o => o.isLight)) scene.add(light.clone());
 const camera = new T.PerspectiveCamera(30, 1, .1, 50);
 const can = canPrototype.clone();
 const print = await loader.loadAsync('art/vr-print.webp');
 print.colorSpace = T.SRGBColorSpace;
 can.children[0].material = new T.MeshStandardMaterial({map:print, roughness:.27, metalness:.48});
 const condensation = new T.InstancedMesh(
  new T.SphereGeometry(1, 9, 7),
  new T.MeshPhysicalMaterial({color:0xa49191, roughness:.15, metalness:.22, clearcoat:1, envMapIntensity:1.7}),
  62
 );
 can.add(condensation);
 scene.add(can);
 const liquid = new T.MeshPhysicalMaterial({
  color:0xc30a22, roughness:.13, metalness:.12, clearcoat:1, clearcoatRoughness:.065,
  side:T.DoubleSide, envMapIntensity:1.38
 });
 const floor = -1.18, tau = Math.PI*2, segments = 112, rings = 12;
 const crown = new T.BufferGeometry(), vertices = new Float32Array((segments+1)*(rings+1)*3), indices=[];
 for(let j=0;j<rings;j++) for(let i=0;i<segments;i++){
  const a=j*(segments+1)+i,b=a+segments+1;
  indices.push(a,b,a+1,b,b+1,a+1);
 }
 crown.setAttribute('position',new T.BufferAttribute(vertices,3).setUsage(T.DynamicDrawUsage));
 crown.setIndex(indices);
 const sheet=new T.Mesh(crown,liquid);sheet.frustumCulled=false;scene.add(sheet);
 const pool=new T.Mesh(new T.SphereGeometry(1,72,20),liquid);
 pool.position.y=floor-.025;scene.add(pool);
 const dropCount=86, drops=new T.InstancedMesh(new T.SphereGeometry(1,10,8),liquid,dropCount);
 drops.frustumCulled=false;scene.add(drops);
 let seed=721;
 function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296}
 const bead=new T.Object3D();
 for(let i=0;i<condensation.count;i++){
  const angle=(random()-.5)*Math.PI*1.65;
  const height=(random()-.5)*1.44;
  if(Math.abs(height)<.24&&Math.abs(angle)<.86){i--;continue}
  const size=.006+.014*random()**2;
  bead.position.set(.523*Math.sin(angle),height,.523*Math.cos(angle));
  bead.rotation.y=angle;
  bead.scale.set(size,size*1.36,size*.52);
  bead.updateMatrix();
  condensation.setMatrixAt(i,bead.matrix);
 }
 const spray=Array.from({length:dropCount},()=>({
  angle:random()*tau, speed:1.3+random()*2.2, up:2.4+random()*3.5,
  delay:random()*.20, size:.012+.054*random()**2
 }));
 const dummy=new T.Object3D(),limit=x=>Math.max(0,Math.min(1,x));
 function crest(a){return .2+.48*(.5+.5*Math.sin(7*a+1.1))**3+.65*(.5+.5*Math.cos(11*a-.7))**5}
 let lastSheetAge=-1;
 function update(t,w,h){
  camera.aspect=w/h;
  camera.position.set(0,.36,Math.max(6.4,8.25/camera.aspect));
  camera.lookAt(0,.05,0);
  camera.updateProjectionMatrix();
  const landing=.58, fall=limit(t/landing), age=Math.max(0,t-landing);
  const turn=1-(1-fall)**2;
  const idle=Math.max(0,t-1.85);
  const bounce=.16*Math.sin(age*12)*Math.exp(-5*age);
  can.visible=true;
  can.scale.set(1.13,1.27,1.13);
  can.position.set(.04,floor+1.37+.51*(1-fall*fall)+bounce+.045*Math.sin(idle*1.7),.22);
  can.rotation.set(.046+.029*Math.sin(idle*1.1),-.68*(1-turn)+.048*Math.sin(idle*1.45),-.16+.075*turn+.018*Math.sin(idle*1.25));
  const settledAge=Math.min(age,1.22);
  const grow=1-Math.exp(-settledAge*6.2);
  const pulse=limit(settledAge/1.22);
  const surge=Math.sin(Math.PI*pulse)**2;
  const radius=.52+1.28*grow+.23*surge;
  pool.scale.set(.53+1.51*grow,.037,.54+1.03*grow);
  sheet.visible=age>0;drops.visible=age>0&&age<1.30;
  if(sheet.visible&&settledAge!==lastSheetAge){
   lastSheetAge=settledAge;
   const lift=1.43*surge+.71*grow;
   for(let j=0;j<=rings;j++){
    const v=j/rings;
    for(let i=0;i<=segments;i++){
     const a=i/segments*tau,peak=crest(a);
     const ripple=.11*Math.sin(5*a+.3)+.065*Math.sin(13*a);
     const r=.40+v*(radius-.4)+v*v*(ripple+.19*peak)*grow;
     const front=1-.86*Math.max(0,Math.sin(a));
     const y=floor+.02+v*v*v*(.19+1.36*peak)*front*lift+.052*Math.sin(v*8-settledAge*3+a*2)*Math.sin(Math.PI*v)*surge;
     const k=(j*(segments+1)+i)*3;
     vertices[k]=r*Math.cos(a);vertices[k+1]=y;vertices[k+2]=r*Math.sin(a)*.73;
    }
   }
   crown.attributes.position.needsUpdate=true;crown.computeVertexNormals();
  }
  if(drops.visible){
   spray.forEach((d,i)=>{
    const p=(age-d.delay)*.74, y=d.up*p-4.2*p*p;
    const r=.60+d.speed*p, front=1-.35*Math.max(0,Math.sin(d.angle));
    dummy.position.set(r*Math.cos(d.angle),floor+y*front,.76*r*Math.sin(d.angle));
    const size=p>0&&y>0?d.size*Math.min(1,p*16,y*7,(1.30-age)*9):0;
    dummy.scale.set(size,size*(1.2+.6*Math.abs(d.up-8.4*p)/5),size);
    dummy.rotation.z=-.34*Math.cos(d.angle);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);
   });
   drops.instanceMatrix.needsUpdate=true;
  }
 }
 return {scene,camera,update};
};
