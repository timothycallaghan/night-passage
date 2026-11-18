// Three authored foreground figures (Microsoft Rocketbox avatars, MIT licence; see assets/figures/CREDITS.md).
// They take the anchors, yaw and scale of the procedural figures tagged `hero` in figures.js. Animation is
// sampled from scene time (deterministic for captures); the Low preset holds one pose, like the crowd.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { patchFog, LIGHTS } from './util.js';
import { heroUmbrella } from './figures.js';
import { loopWithOverlap, restrainedGesture } from './figure-motion.js';

// Vendor retains the r1 placement/pose accepted in the revised brief.
// The 0.2 m offset is a composition choice, not a physical supporting floor.
const CFG = {
  customer: { url: 'assets/figures/customer.glb', t0: 6.0, speed: 0.5, dx: 0.65, dz: -1.15, lift: 0, albedo: 1.0, env: 0.28 },
  vendor: { url: 'assets/figures/vendor.glb', t0: 4.5, dx: 0.12, lift: 0.2, albedo: 0.62 },
  umbrella: { url: 'assets/figures/umbrella.glb', t0: 2.0, dx: 0, lift: 0, albedo: 0.7, umbrella: 'R' },
};

export function loadHeroAssets() {
  const L = new GLTFLoader();
  L.setMeshoptDecoder(MeshoptDecoder);
  return Promise.all(Object.entries(CFG).map(([k, c]) => L.loadAsync(c.url).then((g) => [k, g])))
    .then((pairs) => Object.fromEntries(pairs));
}

function heroMaterial(m, key, albedo, env = 0.35) {
  m.color.multiplyScalar(albedo);
  m.envMapIntensity = env;
  const customer = key === 'customer';
  if (customer) {
    m.metalness = 0;
    m.roughness = m.name === 'head' ? 0.86 : 0.95;
    m.normalScale?.setScalar(m.name === 'head' ? 0.45 : 0.65);
  }
  // Same fog and stall-light rim as the procedural crowd (figures.js figMaterial), without its GPU posing.
  patchFog(m, {
    key: 'hero-' + key + '-' + m.name, emissiveVar: 'npRimE',
    fragPre: LIGHTS,
    fragMain: (s) => s.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 npVd = normalize(vViewPosition);
        float npRim = pow(1.0 - abs(dot(normal, npVd)), 3.0);
        vec3 npNw = inverseTransformDirection(normal, viewMatrix);
        vec3 npZone = mix(vec3(1.0, 0.2, 0.8), vec3(0.2, 0.85, 1.0), step(0.5, fract(vNpW.z*0.013)));
        vec3 npRimE = (npPointLights(vNpW, npNw, 1.0) * 0.5 + npZone * 0.05) * npRim * ${customer ? '0.04 * diffuseColor.rgb' : '0.9'};
        ${customer ? 'vec3 npFill = diffuseColor.rgb * vec3(0.22, 0.30, 0.42) * (0.4 + 0.6 * max(dot(normal, npVd), 0.0)); totalEmissiveRadiance += npFill;' : ''}
        totalEmissiveRadiance += npRimE;`)
      .replace('vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;',
        `vec3 totalSpecular = (reflectedLight.directSpecular + reflectedLight.indirectSpecular) * ${customer ? '0.25' : '1.0'};`),
  });
}

export function buildHeroes(scene, anchors, gltfs, walk) {
  const heroes = [];
  for (const a of anchors) {
    const c = CFG[a.hero], g = gltfs[a.hero];
    const root = new THREE.Group();
    root.position.set(a.x + c.dx, c.lift, a.z + (c.dz || 0));
    root.rotation.y = a.yaw;
    root.scale.setScalar(a.scale);
    root.add(g.scene);
    const mats = new Set();
    g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; mats.add(o.material); } });
    mats.forEach((m) => heroMaterial(m, a.hero, c.albedo, c.env));
    scene.add(root);
    const mixer = new THREE.AnimationMixer(g.scene);
    mixer.clipAction(g.animations[0]).play();
    const h = { name: a.hero, mixer, t0: c.t0, speed: c.speed || 1, root };
    if (a.hero === 'customer') {
      mixer.setTime(c.t0);
      h.correctPose = restrainedGesture(root, 0.4);
    }
    if (a.hero === 'umbrella') h.loop = loopWithOverlap(mixer, g.animations[0]);
    if (c.umbrella) {
      // Grip = centre of the proximal middle finger; the canopy keeps the crowd umbrella's tilt (mirrored for the right hand).
      h.grip = [g.scene.getObjectByName(`Bip01_${c.umbrella}_Finger2`), g.scene.getObjectByName(`Bip01_${c.umbrella}_Finger21`)];
      h.pivot = new THREE.Group();
      h.pivot.rotation.y = a.yaw;
      h.pivot.scale.set(c.umbrella === 'R' ? -a.scale : a.scale, a.scale, a.scale);
      h.pivot.add(heroUmbrella());
      scene.add(h.pivot);
    }
    heroes.push(h);
  }
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  return {
    count: heroes.length,
    audioVendor: () => heroes.find(h => h.name === 'vendor'),
    // Debug/evidence hook: root and head positions (metres) and the sampled clip time.
    info: () => heroes.map((h) => { const hd = h.root.getObjectByName('Bip01_Head').getWorldPosition(new THREE.Vector3());
      return { name: h.name, root: h.root.position.toArray().map((v) => +v.toFixed(3)), head: hd.toArray().map((v) => +v.toFixed(3)), clipTime: +(h.sampleTime ?? h.mixer.time).toFixed(3), ...(h.loop ? { period: h.loop.period, overlap: h.loop.overlap } : {}) }; }),
    update(time) {
      for (const h of heroes) {
        const sampleTime = walk ? h.t0 + time * h.speed : h.t0;
        h.correctPose?.restore();
        if (h.loop) h.sampleTime = h.loop.sample(sampleTime);
        else h.mixer.setTime(sampleTime);
        h.correctPose?.();
        if (h.pivot) {
          h.root.updateMatrixWorld(true);
          h.grip[0].getWorldPosition(va); h.grip[1].getWorldPosition(vb);
          h.pivot.position.copy(va).add(vb).multiplyScalar(0.5);
        }
      }
    },
  };
}
