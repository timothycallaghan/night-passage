import * as THREE from 'three';
import { shaderMat, patchFog } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A local animated photograph, not broadcast/video footage. All movement and
// dissolves use the same scene time as the street; there is no media clock.
export const HOARDING = { position: [-7.17, 6.0, -25], size: [5.2, 3.25], intro: 10, advert: 15, dissolve: .8 };
export function screenState(t, low=false, available=true) {
  if(low || !available) return { current: 'Second Sprite', next: 'Second Sprite', mix: 0, animated: false };
  t=Math.max(0,t);
  const names=['Second Sprite','My work'];
  if(t<10) return { current:'fictional presenter',next:names[0],mix:THREE.MathUtils.smoothstep(t,9.2,10),animated:true };
  const n=Math.floor((t-10)/15), q=(t-10)%15;
  return {current:names[n%2],next:names[(n+1)%2],mix:THREE.MathUtils.smoothstep(q,14.2,15),animated:true};
}
function advert(label, second) {
  const cv=document.createElement('canvas'); cv.width=960;cv.height=600;
  const c=cv.getContext('2d'),g=c.createLinearGradient(0,0,960,600);
  g.addColorStop(0,second?'#26333c':'#142e3b');g.addColorStop(1,'#080e18');c.fillStyle=g;c.fillRect(0,0,960,600);
  // Original abstract project artwork, restrained rather than a bright white card.
  c.strokeStyle=second?'#80999e':'#62a8ba';c.lineWidth=2;
  for(let i=0;i<7;i++){c.beginPath();c.ellipse(790,260,55+i*23,100+i*25,-.6,0,Math.PI*2);c.stroke();}
  c.fillStyle='#b6cbd3';c.font='400 28px "Space Grotesk"';c.fillText('Tim Callaghan',64,94);
  c.fillStyle='#e0edf0';c.font='500 118px "Barlow Condensed"';c.fillText(label,60,330,720);
  c.fillStyle='#7da3af';c.fillRect(64,403,360,2);
  c.fillStyle='#a0bac4';c.font='400 24px "Space Grotesk"';c.fillText(second?'Work / projects':'Second Sprite',64,480);
  const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=4;return tx;
}
export async function buildHoarding(scene,low=false,mobile=false) {
  const ads=[advert('Second Sprite',false),advert('My work',true)];
  let portrait=ads[0], available=false, loadError=null;
  if(!low){try{portrait=await new THREE.TextureLoader().loadAsync('assets/hoarding/fictional-presenter.webp');portrait.colorSpace=THREE.SRGBColorSpace;portrait.anisotropy=4;available=true;}catch(e){loadError='presenter unavailable; still advert fallback';}}
  const group=new THREE.Group();group.name='elevated-project-hoarding';group.position.set(...HOARDING.position);group.rotation.y=Math.PI/2;
  // Portrait has links over the near wall: remount beyond them, above head height.
  if(mobile){group.position.set(HOARDING.position[0],4.3,-45);group.scale.setScalar(.9);}
  const frameMat=patchFog(new THREE.MeshStandardMaterial({color:0x202831,metalness:.6,roughness:.48}),{key:'hoarding-frame'});
  const add=(geo,mat,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);group.add(m);return m;};
  add(new THREE.BoxGeometry(5.38,3.43,.16),frameMat);
  // Measured left fixture front: x=-7.400000095. Housing rear is x=-7.25
  // (portrait -7.242): at least 0.15m clear. Four brackets bridge to the actual
  // x=-8 wall; portrait scale is compensated so pads still meet that wall.
  const wallZ=(-8-group.position.x)/group.scale.x, supports=[];
  // Stagger upper pads around existing portrait fixtures: the +x-local pad
  // ends at world y=5.407, below that cornice underside5.51455.
  for(const x of [-2.15,2.15])for(const y of [-1.28,x<0?1.28:1.12]){
    supports.push(new THREE.BoxGeometry(.22,.22,.08).translate(x,y,wallZ+.04));
    const start=wallZ+.08,end=-.08;
    supports.push(new THREE.BoxGeometry(.10,.10,end-start).translate(x,y,(start+end)/2));
  }
  const brackets=add(mergeGeometries(supports),frameMat);brackets.name='hoarding-wall-brackets';
  supports.forEach(g=>g.dispose());
  const mat=shaderMat({uniforms:{uPortrait:{value:portrait},uAd0:{value:ads[0]},uAd1:{value:ads[1]},uStill:{value:low||!available?1:0}},
    vertex:`varying vec2 vUv;varying vec3 vNpW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.0);vNpW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragment:`uniform sampler2D uPortrait,uAd0,uAd1;uniform float uStill;varying vec2 vUv;varying vec3 vNpW;
      vec3 presenter(vec2 uv,float t){
        // Original 3:2 photograph is gently cropped to the screen's 1.6 ratio.
        vec2 p=vec2(uv.x,(uv.y-.5)*.9375+.5);
        float head=exp(-pow((p.x-.495)/.105,4.0)-pow((p.y-.69)/.18,4.0));
        p.x+=head*(sin(t*.83)*.008+sin(t*1.7)*.0015);
        p.y+=head*sin(t*.69)*.004;
        // Local mouth articulation: deform existing photographed lips, never draw a cartoon mouth.
        float mouth=exp(-pow((p.x-.496)/.027,4.0)-pow((p.y-.647)/.025,4.0));
        float speech=.5+.5*sin(t*13.1+sin(t*3.7)*1.9);
        p.y+=(p.y-.647)*mouth*(.85-speech*.9);
        // Smooth eyelid compression, staggered non-periodic blink intervals.
        float blink=exp(-pow((t-2.7)/.09,2.0))+exp(-pow((t-6.4)/.11,2.0))+exp(-pow((t-8.9)/.1,2.0));
        float eyes=exp(-pow((p.y-.724)/.012,4.0))*(exp(-pow((p.x-.47)/.015,4.0))+exp(-pow((p.x-.512)/.015,4.0)));
        p.y+=(p.y-.724)*eyes*blink*3.0;
        return texture2D(uPortrait,p).rgb;
      }
      void main(){float t=max(uTime,0.0);vec3 c;
        if(uStill>.5)c=texture2D(uAd0,vUv).rgb;
        else if(t<10.0)c=mix(presenter(vUv,t),texture2D(uAd0,vUv).rgb,smoothstep(9.2,10.0,t));
        else{float q=mod(t-10.0,30.0);vec3 a=texture2D(uAd0,vUv).rgb,b=texture2D(uAd1,vUv).rgb;
          c=q<15.0?mix(a,b,smoothstep(14.2,15.0,q)):mix(b,a,smoothstep(29.2,30.0,q));}
        // Calibrated screen luminance, subtle static scan structure, existing fog/reflection.
        c*=1.05*(.985+.015*sin(vUv.y*600.0*3.14159));
        gl_FragColor=vec4(npApplyFog(c,vNpW),1.0);
      }`});
  add(new THREE.PlaneGeometry(...HOARDING.size),mat,0,0,.091);
  // Local static spill catches mounting/facade; wet reflection captures actual panel content.
  const spill=new THREE.PointLight(0x598ba4,2.2,5,2);spill.position.set(0,-.5,.5);group.add(spill);scene.add(group);
  return {group,material:mat,info:(t)=>({...HOARDING,actualPosition:group.position.toArray(),scale:group.scale.toArray(),...screenState(t,low,available),available,low,loadError,technique:'GPU-warped original generated photograph; no video/audio'})};
}
