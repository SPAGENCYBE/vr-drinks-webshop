/* Three.js r160: one camera and one transparent renderer for all home scenes. */
window.createStudio=async function(canvas){
 const T=window.THREE,scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1,.1,90);camera.position.z=10;
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 const studio=new T.Scene();studio.background=new T.Color('#938782');
 function panel(x,y,z,w,h,intensity){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(1,.98,.95).multiplyScalar(intensity),side:T.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);studio.add(m)}
 panel(-4,2,4,1.1,12,6);panel(5,.5,3,.55,13,6);panel(0,8,3,9,3,4);panel(-3,0,-5,4,7,2);panel(0,0,6,3.5,8,1.3);
 const gen=new T.PMREMGenerator(renderer);scene.environment=gen.fromScene(studio,.035).texture;gen.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
 scene.add(new T.HemisphereLight(0xfff6ef,0x77635e,1.45));const key=new T.DirectionalLight(0xfffaf6,2.2);key.position.set(-3,5,5);scene.add(key);
 const aluminum=new T.MeshStandardMaterial({color:0xc9caca,metalness:.94,roughness:.24,side:T.DoubleSide});
 const tabMetal=new T.MeshStandardMaterial({color:0xdddddc,metalness:.87,roughness:.19});
 const recess=new T.MeshStandardMaterial({color:0x696968,metalness:.8,roughness:.32});
 function lathe(profile){return new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),72,Math.PI)}
 const profile=[[.38,-.99],[.44,-.98],[.47,-.95],[.483,-.91],[.51,-.83],[.523,-.76],[.523,.74],[.521,.79],[.51,.84],[.476,.89],[.454,.923],[.45,.956],[.453,.971]];
 const barrel=lathe(profile);const uv=barrel.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,(barrel.attributes.position.getY(i)+1)/2);
 const base=lathe([[.01,-.94],[.24,-.95],[.37,-.99],[.397,-1],[.423,-.99],[.45,-.971]]),lid=lathe([[0,.955],[.32,.955],[.37,.948],[.40,.947],[.421,.966],[.448,.968]]);
 const ring=new T.TorusGeometry(.453,.014,12,80),bottomRing=new T.TorusGeometry(.413,.014,10,80),lip=new T.TorusGeometry(.389,.005,8,72);
 const tabShape=new T.Shape();tabShape.absellipse(0,0,.082,.164,0,Math.PI*2,false,0);const hole=new T.Path();hole.absellipse(0,.047,.047,.061,0,Math.PI*2,true,0);tabShape.holes.push(hole);
 const tab=new T.ExtrudeGeometry(tabShape,{depth:.009,bevelEnabled:true,bevelSize:.004,bevelThickness:.003,bevelSegments:2,steps:1});
 const opening=new T.CircleGeometry(1,40),rivet=new T.SphereGeometry(.026,14,10);
 function mesh(parent,g,m,x=0,y=0,z=0,flat=false){let o=new T.Mesh(g,m);o.position.set(x,y,z);if(flat)o.rotation.x=-Math.PI/2;parent.add(o);return o}
 const loader=new T.TextureLoader();const mats=await Promise.all(products.map(async p=>{let map=await loader.loadAsync(p.wrap);map.colorSpace=T.SRGBColorSpace;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return new T.MeshStandardMaterial({map,roughness:.33,metalness:.45})}));
 const count=products.length*3,groups=[],bodies=[],sweeps=[];
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const ctx=shadowCanvas.getContext('2d'),grad=ctx.createRadialGradient(64,64,0,64,64,62);grad.addColorStop(0,'rgba(60,26,24,.56)');grad.addColorStop(.36,'rgba(65,28,25,.29)');grad.addColorStop(1,'rgba(68,30,25,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
 const shadowMat=new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});const shadowGeo=new T.PlaneGeometry(1,1),shadows=[];
 for(let i=0;i<count;i++){const g=new T.Group();scene.add(g);groups.push(g);const mat=mats[i%total].clone(),sweep={value:-2},band={value:0};sweeps.push([sweep,band]);mat.onBeforeCompile=shader=>{
   shader.uniforms.uSweep=sweep;
   shader.uniforms.uBand=band;
   shader.fragmentShader='uniform float uSweep;\nuniform float uBand;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float bandY = (vMapUv.y - uBand) * 10.0;
      float bandX = (fract(vMapUv.x + 0.5) - uSweep + 0.10 * (vMapUv.y - uBand)) * 13.0;
      float lightBand = exp(-bandY * bandY - bandX * bandX);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), lightBand * 0.38);
   `);
 };
 const body=mesh(g,barrel,mat);body.userData.index=i;bodies.push(body);mesh(g,base,aluminum);mesh(g,lid,aluminum);mesh(g,ring,tabMetal,0,.974,0,true);mesh(g,bottomRing,aluminum,0,-.988,0,true);mesh(g,lip,recess,0,.954,0,true);
 let score=mesh(g,opening,recess,0,.957,-.15,true);score.scale.set(.105,.14,1);mesh(g,tab,tabMetal,0,.966,.012,true);mesh(g,rivet,tabMetal,0,.977,.064);
 shadows.push(mesh(scene,shadowGeo,shadowMat))}
 let width=0,height=0,ratio=Math.min(devicePixelRatio,1.5),avg=.016,lastAdjust=0,lastDrop=-10,lastRow=-1,rowStart=0;
 const ray=new T.Raycaster(),pointer=new T.Vector2();renderer.compile(scene,camera);
 // Check the printed body independently of its metal lid before hiding the packshots.
 const probeScene=new T.Scene(), probeCamera=new T.PerspectiveCamera(30,1,.1,10);
 probeCamera.position.z=4;
 probeScene.environment=scene.environment;
 const probeBody=new T.Mesh(barrel,bodies[0].material);
 probeScene.add(probeBody);
 const target=new T.WebGLRenderTarget(16,16), pixel=new Uint8Array(4);
 try{
   renderer.setRenderTarget(target);
   renderer.render(probeScene,probeCamera);
   renderer.readRenderTargetPixels(target,8,8,1,1,pixel);
 }finally{
   renderer.setRenderTarget(null);target.dispose();
 }
 if(pixel[3]===0){renderer.dispose();throw new Error('Blikmateriaal kon niet worden weergegeven.')}
 const impact=await window.makeImpact(T,scene,groups[0],loader);
 return {drawImpact(t,w,h){
   if(w!==width||h!==height){width=w;height=h;renderer.setPixelRatio(ratio);renderer.setSize(w,h,false)}
   impact.update(t,w,h);renderer.render(impact.scene,impact.camera);
 },pick(e){const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);ray.setFromCamera(pointer,camera);return ray.intersectObjects(bodies.filter(b=>b.parent.visible),false)[0]?.object.userData.index??null},
 draw(v,dt){avg+=.04*(dt-avg);if(v.t-lastAdjust>1.2){if(avg>.0195&&ratio>.7){ratio=Math.max(.7,ratio-.15);lastDrop=v.t;width=0}else if(avg<.0173&&v.t-lastDrop>8&&ratio<Math.min(devicePixelRatio,1.5)){ratio=Math.min(Math.min(devicePixelRatio,1.5),ratio+.05);width=0}lastAdjust=v.t}
 if(v.w!==width||v.h!==height||camera.aspect!==v.w/v.h){width=v.w;height=v.h;renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()}
 if(lastRow!==v.currentStep){lastRow=v.currentStep;rowStart=v.t}
 for(const o of v.list){const g=groups[o.i],shadow=shadows[o.i];g.visible=o.visible;shadow.visible=o.visible&&(v.a<.8||v.c>.95);if(!o.visible)continue;g.position.set(o.x,o.y,o.z);const radiusFactor=(products[o.i%total].aspect||.523)/.523;g.scale.set(o.scale*.5*radiusFactor,o.scale*.5,o.scale*.5*radiusFactor);g.rotation.set(.08,o.ry,o.rz,'ZXY');bodies[o.i].material.color.setScalar(o.light);sweeps[o.i][0].value=o.i===v.active&&v.a>.95&&v.b<.05?Math.min(1.3,(v.t-rowStart)*1.05)-.13:-2;sweeps[o.i][1].value=.72-v.currentStep*.20;shadow.position.set(o.x+.06*o.scale,o.y-o.scale*.55,o.z-.02);shadow.scale.set(o.scale*.96,o.scale*.14,1)}
 renderer.render(scene,camera)}}
}
