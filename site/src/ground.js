import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { G, NOISE, FOG, LIGHTS } from './util.js';
import { PARAMS } from './params.js';

// Wet paving: planar reflection rendered from a mirrored camera, then streaked
// vertically, distorted by tile bevels, puddle masks and rain ripples.
export function buildGround(scene, renderer, preset, w, h) {
  const shader = {
    name: 'NightPassageGround',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      uReflect: { value: PARAMS.ground.reflect }, uPuddles: { value: PARAMS.ground.puddles },
      uStreak: { value: PARAMS.ground.streak }, uRipple: { value: PARAMS.ground.ripple },
      ...G,
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vNpW;
      void main(){ vUv = textureMatrix * vec4(position, 1.0);
        vec4 w = modelMatrix * vec4(position, 1.0); vNpW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; varying vec4 vUv; varying vec3 vNpW;
      uniform float uReflect, uPuddles, uStreak, uRipple;
      ${NOISE}
      ${FOG}
      ${LIGHTS}
      vec2 ripples(vec2 p, float t){
        vec2 n = vec2(0.0);
        for (int L = 0; L < 2; L++){
          vec2 q = p * (L == 0 ? 2.6 : 3.7) + float(L)*17.0;
          vec2 c = floor(q);
          for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
            vec2 cc = c + vec2(i,j);
            vec2 h2 = npHash2(cc);
            vec2 d = q - cc - h2;
            float ph = fract(t*(0.9+0.4*h2.x) + h2.y);
            float r = length(d);
            float rad = ph * 0.9;
            float ring = sin((r - rad) * 38.0) * smoothstep(0.12, 0.0, abs(r - rad)) * (1.0 - ph) * (1.0-ph);
            n += (d / max(r, 1e-3)) * ring;
          }
        }
        return n * 0.5;
      }
      void main(){
        vec3 wp = vNpW;
        vec2 p = wp.xz;
        // ---- paving: running-bond stone slabs 0.9 x 0.6 m
        vec2 tq = p / vec2(0.9, 0.6);
        tq.x += 0.5 * mod(floor(tq.y), 2.0);
        vec2 tid = floor(tq); vec2 tf = fract(tq);
        vec2 fw = fwidth(tq);
        vec2 e = min(tf, 1.0 - tf);
        float groove = 1.0 - smoothstep(0.0, 0.04 + fw.x*1.2, min(e.x*0.9/0.6, e.y));
        groove *= 1.0 - smoothstep(0.3, 0.8, max(fw.x, fw.y));
        // Wear is world anchored and band limited; no screen-space grain crawl.
        float detail = 1.0 - smoothstep(0.025, 0.12, max(fw.x, fw.y));
        float gritAA=1.0-smoothstep(0.25,0.9,max(fwidth(p*34.0).x,fwidth(p*34.0).y));
        float grit = mix(.5,npNoise(p*34.0 + npHash2(tid)*19.0),gritAA);
        float aggregate = (grit-0.5) * detail;
        float worn = npNoise(p*1.9 + 12.0);
        float edgeChip = smoothstep(0.48, 0.76, npNoise(p*18.0)) * (1.0-smoothstep(0.015,0.09,min(e.x,e.y))) * detail;
        groove = clamp(groove + edgeChip*0.42,0.0,1.0);
        float slab = 0.72 + 0.56*npHash(tid);
        float grain = npFbm(p*3.0);
        vec3 albedo = vec3(0.030, 0.032, 0.036) * slab * (0.7 + 0.6*grain);
        albedo *= (1.0 - 0.58*groove) * (0.88 + 0.28*worn + aggregate*0.28);
        // central drain channel & kerb line
        float drain = smoothstep(0.25, 0.2, abs(wp.x - 0.5));
        albedo = mix(albedo, vec3(0.012), drain*0.8);
        // ---- wetness, puddles
        float pn = npFbm(p*0.11 + 3.0) + 0.35*npFbm(p*0.7);
        float pud = smoothstep(0.70 - uPuddles*0.22, 0.95 - uPuddles*0.18, pn);
        pud = max(pud, drain*0.9);
        float wet = 0.75 + 0.25*npFbm(p*0.4);
        // ---- normal
        vec2 bevel = vec2(0.0);
        bevel.x = (smoothstep(0.06, 0.0, tf.x) - smoothstep(0.94, 1.0, tf.x));
        bevel.y = (smoothstep(0.08, 0.0, tf.y) - smoothstep(0.92, 1.0, tf.y));
        bevel *= (1.0 - pud) * 0.35 * (1.0 - smoothstep(0.2, 0.6, max(fw.x,fw.y)));
        vec2 micro = (vec2(npNoise(p*9.0), npNoise(p*9.0+7.3)) - 0.5) * 0.25 * (1.0 - pud);
        vec2 rip = ripples(p, uTime) * uRipple * (0.25 + 0.75*pud) * (1.0 - smoothstep(0.02, 0.08, max(fw.x, fw.y)*0.6));
        // each slab sits at its own slight angle, so reflections break slab by slab
        vec2 tilt = (npHash2(tid + 3.7) - 0.5) * (1.0 - pud) * (1.0 - smoothstep(0.12, 0.45, max(fw.x, fw.y)));
        vec2 grainNormal = (vec2(npNoise(p*24.0),npNoise(p*24.0+5.7))-0.5)*detail*0.12*(1.0-pud);
        vec2 nxy = bevel*0.65 + micro + grainNormal + tilt * 0.13 + rip * 0.35;
        vec3 N = normalize(vec3(nxy.x, 1.0, nxy.y));
        // ---- reflection
        vec3 V = normalize(npCamPos - wp);
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        float rough = mix(0.70, 0.12, pud) * (1.0 - 0.25*wet) + 0.08*npNoise(p*1.7);
        rough = clamp(rough + (npHash(tid + 9.1) - 0.5) * 0.20 * (1.0 - pud) + (0.10*worn + aggregate*0.13)*(1.0-pud), 0.07, 0.9);
        vec2 ruv = vUv.xy / vUv.w + nxy * vec2(0.035, 0.06) * (0.4 + rough) + tilt * vec2(0.012, 0.05);
        vec3 refl = vec3(0.0); float ws = 0.0;
        float len = (0.02 + 0.22 * rough) * uStreak;
        float lod = 0.6 + rough * 4.5;
        for (int i = 0; i < 12; i++){
          float t = float(i) / 11.0;
          float o = (t - 0.25) * len;
          float wgt = exp(-t*t*4.0);
          refl += texture2D(tDiffuse, ruv + vec2(o*0.04, o), lod).rgb * wgt;
          ws += wgt;
        }
        refl /= ws;
        float dry = smoothstep(0.55, 0.75, npFbm(p*0.9 + 11.0)) * (1.0 - pud);
        float reflAmt = uReflect * mix(0.38, 0.95, pud) * wet * mix(F, 1.0, 0.25) * (1.0 - 0.75*dry);
        // wet stone: every slab holds a different film of water, rounded edges catch the light, joints stay dark
        float nearW = 1.0 - smoothstep(0.2, 0.6, max(fw.x, fw.y));
        float ed = min(e.x*1.5, e.y);
        float rim = (smoothstep(0.0, 0.05, ed) - smoothstep(0.05, 0.17, ed)) * (1.0 - pud) * nearW;
        reflAmt *= mix(1.0, 0.5 + 1.0*npHash(tid + 5.3), (1.0 - pud) * nearW) * (1.0 + 0.8*rim) * (1.0 - 0.55*groove);
        // ---- direct light pools from the lights registry (diffuse + glints)
        vec3 lightAcc = vec3(0.0); vec3 spec = vec3(0.0);
        for (int i=0;i<12;i++){
          vec3 L = npLightPos[i] - wp; float d2 = dot(L,L); vec3 l = L*inversesqrt(d2);
          vec3 Hh = normalize(l + V);
          float ndl = max(dot(N, l), 0.0);
          lightAcc += npLightCol[i] * ndl / (d2 + 1.0);
          float sp = pow(max(dot(N, Hh), 0.0), mix(40.0, 600.0, pud));
          spec += npLightCol[i] * sp / (d2 + 1.0) * mix(0.6, 3.0, pud);
        }
        vec3 col = albedo * (lightAcc + vec3(0.02, 0.026, 0.036)) * (1.0 - reflAmt*0.6);
        col += refl * reflAmt * (1.0 + aggregate*0.80*(1.0-.7*pud));
        col += spec * 0.5;
        col = npApplyFog(col, wp);
        gl_FragColor = vec4(col, 1.0);
      }`,
  };
  const scale = preset.reflectionScale;
  const geo = new THREE.PlaneGeometry(120, 1500);
  const ground = new Reflector(geo, {
    shader, textureWidth: Math.round(w * scale), textureHeight: Math.round(h * scale), clipBias: 0.003, multisample: 4,
  });
  // Re-link the shared uniforms (UniformsUtils.clone copied them).
  Object.assign(ground.material.uniforms, G);
  const rt = ground.getRenderTarget();
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -700);
  let baked = 0, framesUntilUpdate = 0;
  const reflect = ground.onBeforeRender;
  ground.reflectionInterval = 1;
  ground.refreshReflection = () => { framesUntilUpdate = 0; };
  ground.onBeforeRender = function (...args) {
    if (!preset.liveReflection && baked >= 2) return;
    if (framesUntilUpdate > 0) { framesUntilUpdate--; return; }
    reflect.apply(this, args);
    if (!preset.liveReflection) baked++;
    framesUntilUpdate = ground.reflectionInterval - 1;
  };
  ground.setSize = (W, H) => {
    const width = Math.round(W * scale), height = Math.round(H * scale);
    if (rt.width === width && rt.height === height) return;
    rt.setSize(width, height);
    baked = framesUntilUpdate = 0;
  };
  scene.add(ground);
  return ground;
}
