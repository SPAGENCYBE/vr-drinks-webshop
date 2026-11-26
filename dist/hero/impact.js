import * as T from './three.module.min.js';

const TAU = Math.PI * 2;
const clamp = T.MathUtils.clamp;
const smooth = (a,b,x) => T.MathUtils.smoothstep(x,a,b);
let seed = 23;
function random(){ seed = (Math.imul(1664525,seed)+1013904223)>>>0; return seed/4294967296; }

function studio(renderer) {
  const scene = new T.Scene();
  scene.background = new T.Color(0x17161a);
  function panel(x,y,z,w,h,color,power) {
    const material = new T.MeshBasicMaterial({color, side:T.DoubleSide});
    material.color.multiplyScalar(power);
    const card = new T.Mesh(new T.PlaneGeometry(w,h),material);
    card.position.set(x,y,z); card.lookAt(0,1,0); scene.add(card);
  }
  panel(-4,3,2,1.4,8,0xfff6ee,4.5);
  panel(4,3,1,.64,7,0xdbeeff,5);
  panel(-1,7,-1,7,3,0xfff8f0,3.5);
  panel(1,2,-5,6,3,0xff3036,2.4);
  panel(1,1,6,4,4,0xffffff,.45);
  const pm = new T.PMREMGenerator(renderer);
  const env=pm.fromScene(scene,.025);pm.dispose();
  scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
  return env;
}
function lathe(profile,mat) {
  return new T.Mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),112),mat);
}
function ring(parent,r,tube,y,mat,x=0,z=0,sx=1,sz=1) {
  const o=new T.Mesh(new T.TorusGeometry(r,tube,10,100),mat);
  o.rotation.x=-Math.PI/2;o.scale.set(sx,sz,1);o.position.set(x,y,z);parent.add(o);return o;
}
async function beverage(renderer) {
  let label=null;
  if(renderer){
    label=await new T.TextureLoader().loadAsync(new URL('label.jpg',import.meta.url).href);
    label.colorSpace=T.SRGBColorSpace;label.wrapS=T.RepeatWrapping;label.offset.x=.5;
    label.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  }
  const ink=new T.MeshPhysicalMaterial({map:label,roughness:.34,metalness:.33,clearcoat:.58,clearcoatRoughness:.21});
  const metal=new T.MeshStandardMaterial({color:0xcac9c6,metalness:.96,roughness:.22});
  const groove=new T.MeshStandardMaterial({color:0x767571,metalness:.88,roughness:.29});
  const can=new T.Group();
  const body=lathe([[.509,.053],[.55,.076],[.586,.112],[.599,.155],[.602,.215],[.602,1.89],[.6,1.96],[.59,2.01],[.57,2.055],[.535,2.10],[.522,2.13],[.52,2.165]],ink);
  const pos=body.geometry.attributes.position,uv=body.geometry.attributes.uv;
  for(let i=0;i<pos.count;i++)uv.setY(i,(pos.getY(i)-.05)/2.115);
  can.add(body,lathe([[0,.083],[.38,.06],[.46,.014],[.505,.014],[.527,.035],[.54,.072],[.548,.081]],metal));
  ring(can,.496,.013,.018,metal);
  can.add(lathe([[.517,2.146],[.533,2.151],[.545,2.169],[.543,2.186],[.532,2.195],[.516,2.193],[.504,2.18],[.498,2.158],[.474,2.139],[.45,2.138],[.44,2.146],[0,2.146]],metal));
  ring(can,.446,.006,2.147,groove);
  ring(can,.125,.006,2.15,groove,0,.19,1.32,1.05);
  const tab=new T.Shape();tab.absellipse(0,0,.103,.19,0,TAU,false,0);
  for(const [cy,ry] of [[.067,.063],[-.072,.041]]){
    const hole=new T.Path();hole.absellipse(0,cy,.064,ry,0,TAU,true,0);tab.holes.push(hole);
  }
  const pull=new T.Mesh(new T.ExtrudeGeometry(tab,{depth:.007,bevelThickness:.004,bevelSize:.004,bevelSegments:2,steps:1}),metal);
  pull.rotation.x=-Math.PI/2;pull.rotation.z=.15;pull.position.set(.007,2.156,-.023);can.add(pull);
  const dome=new T.SphereGeometry(1,9,7);
  const beads=new T.InstancedMesh(dome,new T.MeshPhysicalMaterial({color:0x908786,metalness:.38,roughness:.08,clearcoat:1,transparent:true,opacity:.68}),450);
  const dummy=new T.Object3D();
  for(let i=0;i<beads.count;i++){
    const a=random()*TAU,y=.22+random()*1.66,r=.0018+.0095*random()**3;
    dummy.position.set(.602*Math.sin(a),y,.602*Math.cos(a));dummy.rotation.y=a;
    dummy.scale.set(r,r*(1+random()*.65),r*.58);dummy.updateMatrix();beads.setMatrixAt(i,dummy.matrix);
  }
  can.add(beads);return can;
}

// Thin liquid sheets reflect the strip lights at grazing angles. The transmitted
// colour samples the red studio floor and the can silhouette behind each sheet.
const wet=new T.ShaderMaterial({side:T.DoubleSide, uniforms:{},vertexShader:`
varying vec3 wp;varying vec3 wn;
void main(){
#include <beginnormal_vertex>
#include <defaultnormal_vertex>
#include <begin_vertex>
vec4 p=vec4(transformed,1.);
#ifdef USE_INSTANCING
p=instanceMatrix*p;
#endif
wp=(modelMatrix*p).xyz;wn=inverseTransformDirection(transformedNormal,viewMatrix);
gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
}`.replace('varying vec3 wp;', '#include <common>\nvarying vec3 wp;'),
fragmentShader:`varying vec3 wp;varying vec3 wn;
void main(){vec3 n=normalize(wn),v=normalize(cameraPosition-wp);if(dot(n,v)<0.) n=-n;
vec3 r=reflect(-v,n),q=refract(-v,n,.75);
float edge=pow(1.-max(dot(n,v),0.),3.);
float strip=exp(-pow((r.x+.67)*8.,2.))*smoothstep(-.6,.1,r.z)
           +.85*exp(-pow((r.x-.78)*12.,2.))*smoothstep(-.6,.0,r.z);
float sky=smoothstep(.53,.97,r.y);
vec3 env=vec3(.10,.085,.10)+vec3(1.,.94,.87)*(strip*2.4+sky*1.45);
env+=vec3(.75,.028,.018)*smoothstep(.2,.9,-r.z);
float floorLight=.5+.5*sin(q.x*8.+q.y*3.+wp.x*2.);
vec3 transmitted=mix(vec3(.085,.012,.014),vec3(.52,.068,.045),floorLight);
vec3 c=mix(transmitted,env,.10+.87*edge)+vec3(1.,.91,.82)*strip*.18;
gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
function liquid(scene) {
  const N=192,M=16,positions=new Float32Array((N+1)*(M+1)*3),indices=[];
  const holes=Array.from({length:35},()=>[random(),.66+.27*random(),.003+.01*random(),.025+.065*random()]);
  for(let i=0;i<N;i++)for(let j=0;j<M;j++){
    const u=(i+.5)/N,v=(j+.5)/M;
    if(holes.some(([x,y,w,h])=>((u-x)/w)**2+((v-y)/h)**2<1))continue;
    const a=i*(M+1)+j,b=a+M+1;indices.push(a,b,b+1,a,b+1,a+1);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));g.setIndex(indices);
  const crown=new T.Mesh(g,wet);crown.name='impact-sheet';crown.frustumCulled=false;scene.add(crown);
  const profile=a=>{
    const side=1-Math.cos(a)**2;
    const wave=.5+.5*Math.sin(7*a+.7*Math.sin(3*a));
    return (.09+.51*side+.29*(1-Math.cos(a))+.26*wave+.37*Math.max(0,Math.sin(11*a+.8))**7)*(.84+.21*Math.sin(2*a-.8)+.14*Math.sin(5*a));
  };
  function surface(a,v,t) {
    const lag=.036*(1+Math.sin(3*a)),age=Math.max(0,t-lag);
    const lift=Math.max(0,3.7*age-3.15*age*age);
    const stretch=1-Math.exp(-3*age);
    const h=profile(a),curl=v**3*stretch; a+=curl*(.11*Math.sin(4*a)+.07*Math.sin(8*a));const r=.48+stretch*(.52+v*(.67+.23*Math.sin(3*a+.5)+.11*Math.sin(8*a))+.22*Math.sin(v*Math.PI)+v*v*(.28*Math.sin(5*a+.9)+.12*Math.cos(11*a)));
    const wrinkle=.033*stretch*Math.sin(17*a+v*8)*Math.sin(v*Math.PI);
    return [(r+wrinkle)*Math.sin(a),.012+lift*h*(v**1.43)+wrinkle*.55,(r+wrinkle)*Math.cos(a)*.88];
  }
  const balls=new T.InstancedMesh(new T.SphereGeometry(1,10,8),wet,185);balls.name='impact-droplets';balls.frustumCulled=false;scene.add(balls);
  const specs=Array.from({length:balls.count},()=>{const a=random()*TAU;return {a,birth:.075+.34*random(),speed:.36+.99*random(),vy:.75+2.6*random(),r:.005+.037*random()**2}});
  const o=new T.Object3D();
  return time=>{
    const t=time-.32; crown.visible=t>0&&t<1.25;balls.visible=t>0&&t<2.35;
    if(crown.visible){
      for(let i=0;i<=N;i++)for(let j=0;j<=M;j++)positions.set(surface(TAU*i/N,j/M,t),(i*(M+1)+j)*3);
      g.attributes.position.needsUpdate=true;g.computeVertexNormals();
      crown.scale.y=1-smooth(.91,1.25,t);
    }
    if(balls.visible)specs.forEach(({a,birth,speed,vy,r},i)=>{
      const age=t-birth,[x,y,z]=surface(a,1,birth),height=y+vy*age-3.1*age**2;
      const s=age>0&&height>0?r:0;
      o.position.set(x+Math.sin(a)*speed*age,height,z+Math.cos(a)*speed*age);
      o.rotation.z=-Math.sin(a)*.32;o.scale.set(s,s*(1+.4*Math.abs(vy-6.2*age)),s);
      o.updateMatrix();balls.setMatrixAt(i,o.matrix);
    });
    balls.instanceMatrix.needsUpdate=true;
  };
}
export async function makeStudio(canvas){
  const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x0b0b0c,0);renderer.toneMapping=T.ACESFilmicToneMapping;
  return buildScene(renderer);
}
export async function buildScene(renderer=null){
  const scene=new T.Scene();if(renderer)scene.environment=studio(renderer).texture;
  const camera=new T.OrthographicCamera(-2.55,2.55,1.58,-1.58,.1,50);
  camera.position.set(0,2.65,9);camera.lookAt(0,1.18,0);
  const can=await beverage(renderer);scene.add(can);
  const key=new T.DirectionalLight(0xfff5ef,1.8);key.position.set(-2,4,5);scene.add(key);
  scene.add(new T.HemisphereLight(0xfff5f1,0x613136,.74));
  const updateLiquid=liquid(scene);
  const floor=new T.Mesh(new T.PlaneGeometry(12,12),new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{t:{value:0}},vertexShader:'varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 p;uniform float t;void main(){float r=length(p*vec2(1.,1.12));float s=max(t-.32,0.);float pool=exp(-r*r*.8);float wave=sin(19.*(r-1.9*s))*exp(-8.*pow(r-.54-1.4*s,2.))*exp(-1.9*s)*smoothstep(.0,.15,s);gl_FragColor=vec4(vec3(.23,.055,.047)+wave*vec3(.14,.08,.07),pool*.87);}`}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.012;scene.add(floor);
  return {scene,can,resize(w,h){renderer.setSize(w,h,false);camera.left=-1.58*w/h;camera.right=-camera.left;camera.updateProjectionMatrix()},
    render(t){const approach=clamp(t/.32,0,1),after=Math.max(0,t-.32);
      can.position.y=.35*(1-approach**2)+.041*Math.exp(-6*after)*Math.abs(Math.sin(13*after));
      can.rotation.z=.13*(1-smooth(0,.6,t))-.052*Math.exp(-3*after)*Math.sin(9*after);
      can.rotation.y=-.32*(1-smooth(0,.82,t))+.027*Math.sin(after*.75)*smooth(.65,1.9,t);
      updateLiquid(t);floor.material.uniforms.t.value=t;renderer?.render(scene,camera);
    }};
}
