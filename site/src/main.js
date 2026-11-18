import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { G } from './util.js';
import { audio } from './audio-ui.js';
import { createEventAdmissions } from './audio-events.js';
import { createSceneAudioProbe } from './scene-audio.js';
import { createPointerMotion, headPose, headLimits, coverageFov, coverageView, HEAD_MOTION } from './pointer-motion.js';
import { PARAMS as P, PRESETS, applyHashOverrides } from './params.js';
import { loadFonts, makeSignAtlas, makeShopAtlas } from './textures.js';
import { buildCity, buildSigns, buildShops, buildDetails, buildHolos } from './city.js';
import { buildStalls } from './stall.js';
import { buildGround } from './ground.js';
import { buildSky, buildHalos, buildRain, buildSteam, buildHaze, buildTraffic, buildBlinkers } from './fx.js';
import { buildVehicles } from './actors.js';
import { buildPeople } from './figures.js';
import { loadHeroAssets, buildHeroes } from './hero-figures.js';

import { buildHoarding } from './hoarding.js';
import { AUTO_RENDER_LEVELS, createFrameBudget } from './quality.js';

applyHashOverrides(P);
const qs = new URLSearchParams(location.search);
const W0 = innerWidth, H0 = innerHeight;
const captureMode = qs.has('capture');
const choice = window.npQuality ?? 'auto';
const presetName = choice === 'low' ? 'low' : 'high';
const adaptive = choice === 'auto' && !captureMode;
const budget = createFrameBudget();
const preset = { ...PRESETS[presetName] };
let camCfg=(W0/H0<.9)?P.camera.mobile:P.camera.desktop;
const desktopHero=structuredClone(P.hero);
const setHeroFamily=()=>Object.assign(P.hero,innerWidth/innerHeight<.9?P.heroMobile:desktopHero);
setHeroFamily();
let view=coverageView(camCfg,W0/H0);
const NP = (window.NP = { ready: false, preset: presetName, errors: [], degraded: [] });
addEventListener('error', (e) => NP.errors.push(String(e.message)));

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: captureMode });
const baseDpr = () => Math.min(devicePixelRatio || 1, preset.pixelRatio);
let dpr = baseDpr();
renderer.info.autoReset = false;
renderer.setPixelRatio(dpr);
renderer.setSize(W0, H0, false);
renderer.toneMapping = { ACES: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping, Neutral: THREE.NeutralToneMapping }[P.light.toneMapping] ?? THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = P.light.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.debug.onShaderError = (gl, prog, vs, fs) => {
  const log = (s) => gl.getShaderInfoLog(s);
  NP.errors.push('shader: ' + (log(vs) || '') + (log(fs) || '') + gl.getProgramInfoLog(prog));
  console.error('SHADER', log(vs), log(fs));
};

// shared look uniforms from params
G.npFogColor.value.setRGB(...P.fog.color);
G.npGlowColor.value.setRGB(...P.fog.glow);
G.npGlow2.value.setRGB(...P.fog.glow2);
G.npFogDensity.value = P.fog.density;
G.npFogStart.value = P.fog.start;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0, 0, 0);

// ---- camera: level (upright verticals) with lens shift placing the vanishing point
const camera = new THREE.PerspectiveCamera(coverageFov(camCfg,W0/H0), W0 / H0, 0.1, 3000);
camera.position.set(...camCfg.pos);
camera.rotation.set(0, camCfg.yaw || 0, 0);
const baseUpdate = camera.updateProjectionMatrix.bind(camera);
camera.updateProjectionMatrix = function () {
  baseUpdate();
  const e = this.projectionMatrix.elements;
  e[8] = -(2 * view.vp[0] - 1);
  e[9] = 2 * view.vp[1] - 1;
  this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
};
camera.updateProjectionMatrix();
const pointer = createPointerMotion({ capture: captureMode });
const eyeOffset = new THREE.Vector3();
let baseYaw = camCfg.yaw || 0;
function applyHead(pose) {
  camera.rotation.set(pose.pitch, baseYaw + pose.yaw, 0, 'YXZ');
  eyeOffset.set(...pose.offset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, baseYaw);
  camera.position.set(...camCfg.pos).add(eyeOffset);
  G.npVpDir.value.set(0, 0, -1).applyEuler(camera.rotation).add(new THREE.Vector3(0, 0.02, 0)).normalize();
}
applyHead(headPose());

// Start the network work before generating the reflection environment on the GPU.
const heroLoad = loadHeroAssets().catch((e) => { NP.errors.push('hero figures: ' + (e?.message || e)); NP.degraded.push('authored figures unavailable'); return null; });
const fonts = loadFonts();

// ---- lights and environment
scene.add(new THREE.HemisphereLight(new THREE.Color(...P.light.hemiSky), new THREE.Color(...P.light.hemiGround), P.light.hemiIntensity));
{
  // Small synthetic "neon street" environment for metal/glass reflections (procedural, no HDRI asset).
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.006, 0.010, 0.016), side: THREE.BackSide })));
  const panel = (c, s, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(...s), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; env.add(m); };
  panel([0.05, 0.5, 0.9], [2, 10], -19, 4, -6, Math.PI / 2);
  panel([0.8, 0.12, 0.6], [1.5, 7], -19, 3, 6, Math.PI / 2);
  panel([0.9, 0.4, 0.1], [8, 2], 19, -4, 2, -Math.PI / 2);
  panel([0.05, 0.6, 1.0], [1.5, 9], 19, 6, -8, -Math.PI / 2);
  panel([0.12, 0.25, 0.4], [30, 12], 0, 6, -19.5, 0);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.06, 0.1) })); top.rotation.x = Math.PI / 2; top.position.y = 19.5; env.add(top);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture;
  scene.environmentIntensity = P.light.envIntensity;
}

// ---- build
await fonts;
const signAtlas = makeSignAtlas(P.seed + 1);
const shopAtlas = makeShopAtlas(P.seed + 2);
const halos = [], steamEmitters = [];
buildSky(scene);
const city = buildCity(scene, preset);
buildSigns(scene, city.fronts, signAtlas, halos);
buildShops(scene, city.fronts, shopAtlas, halos);
buildStalls(scene, halos, steamEmitters, presetName === 'low');
buildDetails(scene, city.fronts, halos);
const hoarding = await buildHoarding(scene, presetName === 'low', W0 / H0 < 0.9);
buildHolos(scene, halos);
const vehicles = buildVehicles(scene, preset.vehicles);
const heroAssets = await heroLoad;
const people = buildPeople(scene, preset.people, preset.walk, !!heroAssets);
const heroes = heroAssets ? buildHeroes(scene, people.heroes, heroAssets, preset.walk) : null;
buildHalos(scene, halos, preset.bloom ? 1.0 : 1.7);
buildSteam(scene, steamEmitters, preset.steam ? 26 : 8, preset.steam);
buildHaze(scene, preset.steam);
const traffic = buildTraffic(scene, true);
buildBlinkers(scene, city.buildings, true);
const rain = preset.rain ? buildRain(scene, P.rain.count) : null;
const ground = buildGround(scene, renderer, preset, W0 * dpr, H0 * dpr);

// ---- post: HDR render -> compact bloom -> tone map (OutputPass) -> display-space grade + grain
const rt = new THREE.WebGLRenderTarget(W0 * dpr, H0 * dpr, { type: THREE.HalfFloatType, samples: preset.bloom ? 4 : 2 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W0 * dpr, H0 * dpr);
composer.addPass(new RenderPass(scene, camera));
let bloom = null;
if (preset.bloom) {
  // Guard: one NaN/Inf pixel would be spread across the frame by the bloom mip chain.
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); bvec4 bad = bvec4(!(c.r >= 0.0 && c.r < 6.0e4), !(c.g >= 0.0 && c.g < 6.0e4), !(c.b >= 0.0 && c.b < 6.0e4), false); gl_FragColor = vec4(bad.x ? 0.0 : c.r, bad.y ? 0.0 : c.g, bad.z ? 0.0 : c.b, 1.0); }' }));
  bloom = new UnrealBloomPass(new THREE.Vector2(W0 * dpr, H0 * dpr), P.bloom.strength, P.bloom.radius, P.bloom.threshold);
  composer.addPass(bloom);
}
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(W0 * dpr, H0 * dpr) },
    uVignette: { value: P.grade.vignette }, uGrain: { value: preset.bloom ? P.grade.grain : 0.0 }, uAberr: { value: P.grade.aberration },
    uLift: { value: new THREE.Vector3(...P.grade.lift) }, uGain: { value: new THREE.Vector3(...P.grade.gain) },
    uSat: { value: P.grade.saturation }, uContrast: { value: P.grade.contrast },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uAberr, uSat, uContrast; uniform vec2 uRes; uniform vec3 uLift, uGain;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      vec3 c;
      if (uAberr > 0.0) { c.r = texture2D(tDiffuse, vUv + d*uAberr).r; c.g = texture2D(tDiffuse, vUv).g; c.b = texture2D(tDiffuse, vUv - d*uAberr).b; }
      else c = texture2D(tDiffuse, vUv).rgb;
      c = c * uGain + uLift * (1.0 - c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      // broad vignette: at most uVignette darkening in the corners
      float v = smoothstep(0.25, 0.75, length(d * vec2(1.0, 0.85)) );
      c *= 1.0 - uVignette * v;
      // static-ish monochrome grain (changes slowly) + 1/255 dither against banding
      vec2 px = floor(vUv * uRes);
      float g = h(px + floor(uTime * 12.0) * 7.31) - 0.5;
      c += g * uGrain * (0.35 + l);
      c += (h(px * 1.37 + 3.1) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
});
composer.addPass(grade);

const sceneAudio = createSceneAudioProbe(scene,camera,vehicles,people,heroes,presetName === 'high');
const audioEvents = createEventAdmissions(audio);
let audioSample = null;
const resetAudioEvents = (reason) => { audioEvents.boundary(reason); sceneAudio.reset(); audioSample=null; };
addEventListener('site01:audio-ready', e => audioEvents.ownerReady(e.detail,audioSample?{...audioSample,pass:sceneAudio.inspectPass(t)}:null,!captureMode&&!NP.motion().paused&&!document.hidden&&window.g2?.state!=='fallback'&&!!audioSample));
addEventListener('np:motion', () => resetAudioEvents('motion preference/pause'));
addEventListener('site01:audio-state', () => { if(!audio.canCue())audioEvents.boundary('audio lifecycle/mute'); });
document.addEventListener('visibilitychange', () => resetAudioEvents('visibility'));
for(const event of ['pagehide','pageshow','resize','orientationchange'])addEventListener(event,()=>resetAudioEvents(event));
// ---- frame update
let t = Number(qs.get('t') || 0);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let userPaused = false;
try { userPaused = sessionStorage.getItem('np-motion-paused') === 'true'; } catch { /* Storage is optional. */ }
let paused = userPaused || reduce.matches;
let last = performance.now();
function syncMotion() {
  paused = userPaused || reduce.matches;
  pointer.suspend(paused);
  last = performance.now();
  budget.reset(last);
  window.dispatchEvent(new Event('np:motion'));
}
NP.motion = () => ({ paused, userPaused, reduced:reduce.matches, time:t, frames:NP.frames || 0, head:pointer.info() });
NP.setPaused = (value) => {
  userPaused = !!value;
  try { sessionStorage.setItem('np-motion-paused', String(userPaused)); } catch { /* Storage is optional. */ }
  syncMotion();
};
reduce.addEventListener?.('change', syncMotion);
for (const event of ['visibilitychange', 'pageshow']) addEventListener(event, () => { last = performance.now(); budget.reset(last); pointer.discard(); });
syncMotion();
function setPixelUniforms(w, h) {
  const px = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / h;
  if (rain) { rain.material.uniforms.uPx.value = px; rain.material.uniforms.uRes.value.set(w, h); }
  traffic.material.uniforms.uPx.value = px;
}
setPixelUniforms(W0 * dpr, H0 * dpr);
function frame(time, pose = pointer.pose(), liveDelta = null) {
  applyHead(pose);
  NP.frames = (NP.frames || 0) + 1;
  G.uTime.value = time;
  grade.uniforms.uTime.value = time;
  G.npCamPos.value.copy(camera.position);
  vehicles.update(time);
  heroes?.update(time);
  people.update(time);
  if (liveDelta === null) ground.refreshReflection();
  renderer.info.reset();
  composer.render();
  // Visibility probes raycast and update skinned bounds. They are only needed after consent.
  if (liveDelta !== null && audio.needsScene()) {
    audioSample=sceneAudio.sample(time);
    audioEvents.frame(audioSample,liveDelta);
  }
}

function resizeBuffers(w, h) {
  dpr = baseDpr() * AUTO_RENDER_LEVELS[budget.level()].scale;
  if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setSize(w * dpr, h * dpr);
  ground.setSize(w * dpr, h * dpr);
  grade.uniforms.uRes.value.set(w * dpr, h * dpr);
  setPixelUniforms(w * dpr, h * dpr);
}
addEventListener('resize', () => {
  const w = innerWidth, h = innerHeight;
  budget.reset(performance.now());
  camCfg=w/h<.9?P.camera.mobile:P.camera.desktop;baseYaw=camCfg.yaw||0;setHeroFamily();
  view=coverageView(camCfg,w/h);
  camera.aspect=w/h;camera.fov=view.fov;camera.updateProjectionMatrix();
  resizeBuffers(w, h);
  // Resizing clears drawing buffers. Redraw without advancing time or changing pause.
  frame(t);
  // Low uses two reflection passes to settle its newly allocated target.
  if (!preset.liveReflection) frame(t);
});

// Deterministic captures centre by default; only an explicit normalized point moves the camera.
NP.renderAt = (time, point = [0, 0]) => { resetAudioEvents('inspection/seek'); t = time; frame(t, headPose(...point,headLimits(innerWidth,innerHeight))); return true; };
NP.cameraInfo = () => ({ family: camCfg === P.camera.mobile ? 'portrait' : 'desktop',
  position: camera.position.toArray(), rotation: camera.rotation.toArray(), fov:camera.fov,
  limits:headLimits(innerWidth,innerHeight),vp:view.vp,coverage:view.coverage });
NP.resetView = () => {pointer.reset();resetAudioEvents('centre view');frame(t);if(!preset.liveReflection)frame(t);};
NP.inspectAudioPass = time => sceneAudio.inspectPass(time);
NP.audioScene = () => ({sample:audioSample,events:audioEvents.info()});
NP._dbg = { scene, composer }; // look-dev debugging hook
NP.project = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; };
NP.hoardingInfo = () => hoarding.info(t);
NP.figureHeroes = () => heroes?.info() ?? null;
NP.walkerInfo = () => people.walkerInfo();
NP.inspectCraft = () => vehicles.cars.filter(c=>c.kind!=='far').map(c=>{
  const b=new THREE.Box3().setFromObject(c.g.children[0]),points=[];
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(NP.project(x,y,z));
  return {kind:c.kind,position:c.g.position.toArray(),screen:NP.project(...c.g.position.toArray()),bounds:{left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))}};
});
NP.heroScreen = () => { const p = vehicles.cars[0]?.g.position; return p ? NP.project(p.x, p.y, p.z) : null; };
NP.bench = (n = 120, at = 4) => {
  const gl = renderer.getContext(); const px = new Uint8Array(4);
  frame(at); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { frame(at + i / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  return (performance.now() - t0) / n;
};
NP.info = () => ({ preset: presetName, choice, level:budget.level(), reflectionInterval:AUTO_RENDER_LEVELS[budget.level()].reflectionInterval, dpr, canvas: [renderer.domElement.width, renderer.domElement.height], calls: renderer.info.render.calls, tris: renderer.info.render.triangles, lights: scene.children.filter((c) => c.isLight).length, gpu: (() => { const gl = renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })() });

frame(t);
// The Low preset bakes its reflection in the first frames; render a second to settle.
frame(t);
if (NP.errors.some(error => error.startsWith('shader: '))) throw Error('Opening scene shader compilation failed');
NP.ready = true;
NP.firstFrameAt = performance.now();

if (!captureMode) {
  budget.reset(performance.now());
  const loop = (now) => {
    const rawDt = (now - last) / 1000; const dt = Math.min(rawDt, 0.1); last = now;
    if (!paused && !document.hidden && window.g2?.state !== 'fallback') {
      if (adaptive && budget.sample(now, rawDt * 1000)) {
        ground.reflectionInterval = AUTO_RENDER_LEVELS[budget.level()].reflectionInterval;
        resizeBuffers(innerWidth, innerHeight);
      }
      pointer.step(dt); t += dt; frame(t,pointer.pose(),rawDt);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
