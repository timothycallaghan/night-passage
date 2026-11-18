import * as THREE from 'three';
import { G, rng, shaderMat, LIGHTS } from './util.js';
import { PARAMS } from './params.js';
import { LIFE, LIFE_GLSL } from './surface-life.js';
import { LEFT_X, RIGHT_X } from './city.js';

const P = PARAMS;

// ---------------------------------------------------------------- sky dome
export function buildSky(scene) {
  const mat = shaderMat({
    side: THREE.BackSide, depthWrite: false,
    vertex: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }`,
    fragment: `varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = npFogCol(d, max(d.y, 0.0) * 900.0);
        vec2 q = d.xz / max(d.y + 0.08, 0.05) * 0.6;
        float cl = npFbm(q * 1.6 + vec2(uTime * 0.01, uTime * 0.004));
        float cl2 = npFbm(q * 4.0 - vec2(uTime * 0.02, 0.0));
        float clouds = smoothstep(0.35, 0.85, cl * 0.75 + cl2 * 0.35);
        vec3 under = npGlowColor * 1.4 + npGlow2 * 0.6 * pow(max(-d.z, 0.0), 6.0);
        c = mix(c, c * 0.6 + under * 0.9, clouds * smoothstep(0.0, 0.25, d.y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

// ---------------------------------------------------------------- halos: camera-facing glow quads (fake scattering)
export function buildHalos(scene, halos, gainMul = 1) {
  const n = halos.length;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aLife=new Float32Array(n);
  const aPos = new Float32Array(n * 3), aSize = new Float32Array(n * 2), aCol = new Float32Array(n * 4);
  halos.forEach((h, i) => {
    aLife[i]=h.lifeSlot||0;
    aPos.set([h.pos.x, h.pos.y, h.pos.z], i * 3); aSize.set([h.size.x / 2, h.size.y / 2], i * 2);
    aCol.set([h.color.r, h.color.g, h.color.b, h.inten * gainMul], i * 4);
  });
  geo.setAttribute('aLife',new THREE.InstancedBufferAttribute(aLife,1));
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 2));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 4));
  geo.instanceCount = n;
  const mat = shaderMat({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms:LIFE,
    vertex: `attribute float aLife; varying float vLife; attribute vec3 aPos; attribute vec2 aSize; attribute vec4 aCol; varying vec2 vQ; varying vec4 vCol; varying vec3 vNpW;
      void main(){ vLife=aLife; vQ = position.xy; vCol = aCol; vNpW = aPos;
        vec4 mv = viewMatrix * vec4(aPos, 1.0); mv.xy += position.xy * aSize; gl_Position = projectionMatrix * mv; }`,
    fragment: `${LIFE_GLSL} varying float vLife; varying vec2 vQ; varying vec4 vCol; varying vec3 vNpW;
      void main(){ float r = length(vQ); float a = exp(-r*r*4.0) * (1.0 - smoothstep(0.85, 1.0, r));
        float fe = npFogAmtD(vNpW, npFogDensity*0.5);
        gl_FragColor = vec4(vCol.rgb * vCol.a * a * (1.0 - 0.7*fe) * npNeonLevel(vLife,uTime*uAmbientLife), 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 5;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------- rain streaks (GPU animated)
export function buildRain(scene, count) {
  const r = rng(P.seed + 31);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) a.set([r(), r(), r(), r()], i * 4);
  geo.setAttribute('aR', new THREE.InstancedBufferAttribute(a, 4));
  geo.instanceCount = count;
  const mat = shaderMat({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSpeed: { value: P.rain.speed }, uWind: { value: P.rain.wind }, uOpacity: { value: P.rain.opacity }, uPx: { value: 0.001 }, uRes: { value: new THREE.Vector2(1440, 900) },
      uBoxMin: { value: new THREE.Vector3(LEFT_X - 1, 0, -90) }, uBoxSize: { value: new THREE.Vector3(RIGHT_X - LEFT_X + 2, 34, 100) } },
    vertex: `attribute vec4 aR; uniform float uSpeed, uWind, uPx; uniform vec3 uBoxMin, uBoxSize;
      varying vec2 vQ; varying vec3 vNpW; varying float vA;
      void main(){
        float sp = uSpeed * (0.85 + 0.3*aR.w);
        vec3 p = uBoxMin + aR.xyz * uBoxSize;
        p.y = uBoxMin.y + mod(aR.y * uBoxSize.y - uTime * sp, uBoxSize.y);
        p.x = uBoxMin.x + mod(aR.x * uBoxSize.x + uTime * uWind * (0.8+0.4*aR.z) - (aR.y * uBoxSize.y - p.y + uBoxMin.y) * 0.0, uBoxSize.x);
        vec3 vel = normalize(vec3(uWind, -sp, 0.0));
        float dist = length(p - cameraPosition);
        float len = 0.55 + 0.35*aR.z;
        float wid = 0.012;
        float minW = dist * uPx * 1.25;
        vA = wid / max(wid, minW);
        wid = max(wid, minW);
        vec3 side = normalize(cross(vel, normalize(cameraPosition - p)));
        vec3 wpos = p + side * position.x * wid + vel * (position.y - 0.5) * len;
        vNpW = wpos; vQ = position.xy;
        gl_Position = projectionMatrix * viewMatrix * vec4(wpos, 1.0);
        vA *= smoothstep(0.6, 2.5, dist) * (1.0 - smoothstep(50.0, 95.0, dist));
      }`,
    fragment: `${LIGHTS} uniform float uOpacity; uniform vec2 uRes; varying vec2 vQ; varying vec3 vNpW; varying float vA;
      void main(){
        float a = (1.0 - abs(vQ.x)*2.0) * smoothstep(0.0, 0.35, vQ.y) * smoothstep(1.0, 0.6, vQ.y);
        vec3 lit = npPointLights(vNpW, normalize(npCamPos - vNpW), 1.0) * 2.0;
        vec3 amb = npFogCol(normalize(vNpW - npCamPos), vNpW.y) * 3.5 + vec3(0.03, 0.04, 0.05);
        vec3 c = (amb + lit) * a * vA * uOpacity * 0.55;
        c *= 1.0 - npFogAmt(vNpW);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 6;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------- steam puffs
export function buildSteam(scene, emitters, perEmitter = 26, animate = true) {
  const r = rng(P.seed + 41);
  const n = emitters.length * perEmitter;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aE = new Float32Array(n * 4), aC = new Float32Array(n * 4), aR = new Float32Array(n * 4);
  let k = 0;
  for (const e of emitters) for (let i = 0; i < perEmitter; i++, k++) {
    aE.set([e.pos.x, e.pos.y, e.pos.z, e.height], k * 4);
    aC.set([e.color.r, e.color.g, e.color.b, e.spread], k * 4);
    aR.set([r(), r(), r(), e.rate], k * 4);
  }
  geo.setAttribute('aE', new THREE.InstancedBufferAttribute(aE, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
  geo.setAttribute('aR', new THREE.InstancedBufferAttribute(aR, 4));
  geo.instanceCount = n;
  const mat = shaderMat({
    transparent: true, depthWrite: false,
    uniforms: { uAnim: { value: animate ? 1 : 0 } },
    vertex: `attribute vec4 aE; attribute vec4 aC; attribute vec4 aR; uniform float uAnim;
      varying vec2 vQ; varying vec4 vC; varying float vLife; varying float vSeed; varying vec3 vNpW; varying float vH;
      void main(){
        float t = uTime * uAnim;
        float life = fract(t * 0.16 * aR.w + aR.x);
        vec3 p = aE.xyz;
        p.y += life * aE.w;
        p.x += (aR.y - 0.5) * aC.w * (0.3 + life) + sin(t*0.7 + aR.z*6.0) * 0.25 * life - life * 0.8;
        p.z += (aR.z - 0.5) * aC.w * (0.3 + life);
        float size = mix(0.35, 2.1, life) * aC.w;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float rot = aR.x * 6.28 + t * 0.2;
        vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * position.xy;
        mv.xy += q * size;
        vQ = position.xy; vC = aC; vLife = life; vSeed = aR.y; vNpW = p; vH = life * aE.w;
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: `varying vec2 vQ; varying vec4 vC; varying float vLife; varying float vSeed; varying vec3 vNpW; varying float vH;
      void main(){
        float r = length(vQ);
        float n = npFbm(vQ * 1.3 + vSeed * 13.0 + vLife * 1.5);
        float a = smoothstep(1.0, 0.2, r) * smoothstep(0.25, 0.75, n + 0.25 - r*0.3);
        a *= smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife)) * 0.21;
        // steam is lit by the stall lamps near its source and cools into the street haze as it rises
        vec3 c = vC.rgb * 0.55 * exp(-vH * 0.85) + npFogCol(normalize(vNpW - npCamPos), vNpW.y) * 1.5;
        c = mix(c, npFogCol(normalize(vNpW - npCamPos), vNpW.y), npFogAmt(vNpW));
        gl_FragColor = vec4(c, a);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 7;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------- haze cards (layered depth fog + distant rain curtains)
export function buildHaze(scene, animate = true) {
  const mat = shaderMat({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uAnim: { value: animate ? 1 : 0 } },
    vertex: `attribute float aSeed; varying vec2 vUv; varying float vSeed; varying vec3 vNpW;
      void main(){ vUv = uv; vSeed = aSeed; vec4 w = modelMatrix * vec4(position, 1.0); vNpW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragment: `uniform float uAnim; varying vec2 vUv; varying float vSeed; varying vec3 vNpW;
      void main(){
        float t = uTime * uAnim;
        vec2 q = vNpW.xy * vec2(0.05, 0.07) + vec2(t * 0.02 + vSeed, 0.0);
        float n = npFbm(q) * 0.7 + npFbm(q * 2.7 - t * 0.03) * 0.5;
        float curtain = npNoise(vec2(vNpW.x * 0.9 + vSeed * 9.0, vNpW.y * 0.05 + t * 1.6));
        curtain = 0.6 + 0.4 * curtain;
        float a = smoothstep(0.25, 0.95, n) * curtain;
        a *= smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        a *= smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        float d = length(vNpW - npCamPos);
        a *= smoothstep(20.0, 45.0, d) * 0.22;
        vec3 c = npFogCol(normalize(vNpW - npCamPos), vNpW.y) * 1.15;
        gl_FragColor = vec4(c, a);
      }`,
  });
  const zs = [-46, -70, -100, -140, -190, -260, -350, -460];
  zs.forEach((z, i) => {
    const w = RIGHT_X - LEFT_X + 10 + i * 3, h = 30 + i * 12;
    const g = new THREE.PlaneGeometry(w, h);
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(4).fill(i * 3.17), 1));
    const m = new THREE.Mesh(g, mat);
    m.position.set((LEFT_X + RIGHT_X) / 2, h / 2 - 1, z);
    m.renderOrder = 4; scene.add(m);
  });
}

// ---------------------------------------------------------------- distant air traffic lanes + aviation blinkers
export function buildTraffic(scene, animate = true) {
  const r = rng(P.seed + 51);
  const n = 260;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aL = new Float32Array(n * 4), aR = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const lane = r.int(0, 7);
    const y = [38, 52, 70, 95, 120, 150, 190, 230][lane];
    const x = r.range(-4, 6);
    const dir = lane % 2 ? 1 : -1;
    aL.set([x, y + r.range(-2, 2), dir, r.range(18, 40)], i * 4);
    aR.set([r(), r(), r(), r()], i * 4);
  }
  geo.setAttribute('aL', new THREE.InstancedBufferAttribute(aL, 4));
  geo.setAttribute('aR', new THREE.InstancedBufferAttribute(aR, 4));
  geo.instanceCount = n;
  const mat = shaderMat({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAnim: { value: animate ? 1 : 0 }, uPx: { value: 0.001 } },
    vertex: `attribute vec4 aL; attribute vec4 aR; uniform float uAnim, uPx; varying vec2 vQ; varying vec3 vC; varying vec3 vNpW; varying float vA;
      void main(){
        float span = 1100.0;
        float z = -160.0 - mod(aR.x * span + uTime * uAnim * aL.w * aL.z, span);
        vec3 p = vec3(aL.x, aL.y, z);
        bool head = aL.z > 0.0;
        vC = head ? vec3(1.0, 0.95, 0.85) * 5.0 : vec3(1.0, 0.15, 0.1) * 4.0;
        if (aR.y < 0.15) vC = vec3(0.3, 0.9, 1.0) * 4.0;
        float dist = length(p - cameraPosition);
        float s = 0.45; float minS = dist * uPx * 1.4; vA = (s*s) / (max(s, minS) * max(s, minS)); s = max(s, minS);
        vec4 mv = viewMatrix * vec4(p, 1.0); mv.xy += position.xy * s * vec2(1.6, 1.0);
        vQ = position.xy; vNpW = p; gl_Position = projectionMatrix * mv;
        vA *= 1.0 - smoothstep(900.0, 1150.0, dist);
      }`,
    fragment: `varying vec2 vQ; varying vec3 vC; varying vec3 vNpW; varying float vA;
      void main(){ float r = length(vQ); float a = exp(-r*r*3.5);
        float fe = npFogAmtD(vNpW, npFogDensity*0.55);
        gl_FragColor = vec4(vC * a * vA * (1.0 - fe), 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 6;
  scene.add(m);
  return m;
}

export function buildBlinkers(scene, buildings, animate = true) {
  const tops = buildings.filter((b) => b.h > 120 && -b.cz > 100).map((b) => new THREE.Vector3(b.cx, (b.base || 0) + b.h + 1, b.cz));
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(tops.length * 4);
  tops.forEach((p, i) => a.set([p.x, p.y, p.z, Math.random()], i * 4));
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 4));
  geo.instanceCount = tops.length;
  const mat = shaderMat({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAnim: { value: animate ? 1 : 0 } },
    vertex: `attribute vec4 aP; uniform float uAnim; varying vec2 vQ; varying float vB; varying vec3 vNpW;
      void main(){ vQ = position.xy; vNpW = aP.xyz;
        float ph = fract(uTime * uAnim * 0.5 + aP.w); vB = uAnim > 0.5 ? smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.18, 0.4, ph)) : 0.6;
        float s = max(1.2, length(aP.xyz - cameraPosition) * 0.003);
        vec4 mv = viewMatrix * vec4(aP.xyz, 1.0); mv.xy += position.xy * s; gl_Position = projectionMatrix * mv; }`,
    fragment: `varying vec2 vQ; varying float vB; varying vec3 vNpW;
      void main(){ float r = length(vQ); float a = exp(-r*r*5.0); float fe = npFogAmtD(vNpW, npFogDensity*0.5);
        gl_FragColor = vec4(vec3(1.0, 0.1, 0.06) * 6.0 * a * vB * (1.0-fe), 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; scene.add(m);
}
