import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function npMerge(gs) { const mixed = gs.some((g) => !g.index) && gs.some((g) => g.index); return mergeGeometries(mixed ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs); }
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G, rng, patchFog, shaderMat } from './util.js';
import { PARAMS } from './params.js';
import { LEFT_X, RIGHT_X, addLight, moveLight } from './city.js';

const P = PARAMS;

// ---------------------------------------------------------------- hover vehicles
// Loft a closed hull through rounded-rectangle sections [z, halfWidth, yBottom, yTop].
function loft(secs, n = 28, pw = 3.4) {
  const pos = [], idx = [];
  for (const [z, w, y0, y1] of secs) {
    const cy = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(Math.sign(c) * Math.pow(Math.abs(c), 2 / pw) * w, cy + Math.sign(sn) * Math.pow(Math.abs(sn), 2 / pw) * hy, z);
    }
  }
  for (let k = 0; k < secs.length - 1; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b2 = k * n + (i + 1) % n, c = a + n, d = b2 + n;
    idx.push(a, b2, c, b2, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function vehicleMeshes(accent) {
  // Hover car: lofted low body, raked glass cabin, roof panel, rear wing, four lift pods with glowing rings,
  // underside spine and ribs (the camera sees it from below), twin headlights, tail bar.
  const g = new THREE.Group();
  const body = patchFog(new THREE.MeshStandardMaterial({ color: 0x1a1d23, metalness: 0.85, roughness: 0.24, envMapIntensity: 2.6, side: THREE.DoubleSide }), { key: 'carbody' });
  const trim = patchFog(new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.7, roughness: 0.4, envMapIntensity: 1.8 }), { key: 'cartrim' });
  const glass = patchFog(new THREE.MeshStandardMaterial({ color: 0x05080e, metalness: 0.95, roughness: 0.06, envMapIntensity: 2.2, side: THREE.DoubleSide }), { key: 'carglass' });
  const emi = (c, k) => patchFog(new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }), { key: 'caremi' + k, emissiveVar: 'gl_FragColor.rgb' });
  const add = (geo, mat) => g.add(new THREE.Mesh(geo, mat));
  add(loft([[-2.72, 0.5, -0.1, 0.1], [-2.58, 0.96, -0.26, 0.22], [-1.9, 1.1, -0.36, 0.27], [-0.5, 1.14, -0.4, 0.22], [0.9, 1.12, -0.4, 0.15],
    [1.9, 1.04, -0.36, 0.05], [2.5, 0.92, -0.28, -0.04], [2.72, 0.6, -0.2, -0.09]]), body);
  add(loft([[-1.8, 0.5, 0.14, 0.2], [-1.3, 0.8, 0.14, 0.52], [-0.4, 0.86, 0.14, 0.63], [0.35, 0.82, 0.1, 0.57], [1.3, 0.7, 0.04, 0.12]], 24, 2.8), glass);
  add(loft([[-1.32, 0.5, 0.5, 0.56], [-0.4, 0.66, 0.6, 0.67], [0.38, 0.6, 0.54, 0.61]], 16, 4), body);
  // pillars, rear wing and its struts
  const tr = [];
  for (const x of [-0.84, 0.84]) tr.push(new THREE.BoxGeometry(0.05, 0.5, 0.07).translate(x * 0.97, 0.36, -0.4));
  tr.push(new THREE.BoxGeometry(2.0, 0.045, 0.42).translate(0, 0.5, -2.38));
  for (const x of [-0.7, 0.7]) tr.push(new THREE.BoxGeometry(0.06, 0.3, 0.3).translate(x, 0.36, -2.36));
  // underside: spine, ribs and intake
  tr.push(new THREE.BoxGeometry(0.5, 0.1, 3.9).translate(0, -0.43, 0.0));
  for (const z of [-1.2, -0.4, 0.4, 1.2]) tr.push(new THREE.BoxGeometry(1.9, 0.06, 0.12).translate(0, -0.42, z));
  tr.push(new THREE.BoxGeometry(1.2, 0.12, 0.08).translate(0, -0.2, 2.66));
  // lift pods
  for (const x of [-1.0, 1.0]) for (const z of [-1.65, 1.5]) tr.push(new THREE.CylinderGeometry(0.44, 0.5, 0.2, 24).translate(x, -0.42, z));
  add(npMerge(tr), trim);
  const rings = [];
  for (const x of [-1.0, 1.0]) for (const z of [-1.65, 1.5]) rings.push(new THREE.RingGeometry(0.3, 0.38, 24).rotateX(Math.PI / 2).translate(x, -0.535, z));
  add(npMerge(rings), emi(accent.clone().multiplyScalar(1.1), "ring"));
  add(new THREE.BoxGeometry(0.08, 0.02, 3.6).translate(0, -0.49, 0.1), emi(accent.clone().multiplyScalar(1.4), 'seam'));
  const hl = [];
  for (const x of [-0.52, 0.52]) hl.push(new THREE.SphereGeometry(0.12, 14, 10).scale(1.9, 0.75, 0.5).translate(x * 1.25, -0.1, 2.56));
  add(npMerge(hl), emi(new THREE.Color(1, 0.93, 0.84).multiplyScalar(2.1), 'hl'));
  add(new THREE.BoxGeometry(1.5, 0.05, 0.05).translate(0, 0.08, -2.7), emi(new THREE.Color(1, 0.12, 0.08).multiplyScalar(2.5), 'tail'));
  const side = [new THREE.BoxGeometry(0.02, 0.03, 3.4).translate(-1.145, -0.06, 0.0), new THREE.BoxGeometry(0.02, 0.03, 3.4).translate(1.145, -0.06, 0.0)];
  add(npMerge(side), emi(accent.clone().multiplyScalar(1.2), 'side'));
  return g;
}

function beamMaterial() {
  return shaderMat({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(0.75, 0.85, 1.0) }, uGain: { value: 0.035 } },
    vertex: `varying float vT; varying vec3 vN; varying vec3 vNpW; varying vec3 vV;
      void main(){ vT = uv.y; vec4 w = modelMatrix * vec4(position, 1.0); vNpW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragment: `uniform vec3 uCol; uniform float uGain; varying float vT; varying vec3 vN; varying vec3 vNpW; varying vec3 vV;
      void main(){ float edge = pow(clamp(abs(dot(normalize(vN + 1e-5), normalize(vV))), 1e-4, 1.0), 1.5);
        float along = pow(clamp(vT, 1e-4, 1.0), 1.6);
        float n = 0.7 + 0.3*npNoise(vec2(vNpW.y*0.6 + uTime*0.5, vNpW.x*0.4));
        float a = edge * along * n * uGain;
        if (!(a >= 0.0 && a < 10.0)) a = 0.0; // NaN guard (seen at one exact pose)
        gl_FragColor = vec4(uCol * a * (1.0 - npFogAmt(vNpW)), 1.0); }`,
  });
}

function glowSprite(color, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d'); const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  sp.scale.setScalar(size); return sp;
}

// Vehicle placement follows ART-DIRECTION v1 s.3: primary vehicle around x 52-68% / y 24-39%,
// one smaller vehicle making a slow, even pass near x 64-70% / y 45-50%, tiny far traffic only.
export function buildVehicles(scene, count) {
  const r = rng(P.seed + 61);
  const cars = [];
  const accents = [new THREE.Color(0.2, 0.75, 1.0), new THREE.Color(0.9, 0.3, 0.75), new THREE.Color(1.0, 0.6, 0.25)];
  const H = P.hero;
  for (let i = 0; i < count; i++) {
    const g = vehicleMeshes(accents[i % 3]);
    const kind = i === 0 ? 'hero' : i === 1 ? 'pass' : 'far';
    const car = { g, kind };
    if (kind === 'hero') {
      g.scale.setScalar(H.scale);
      const bm = beamMaterial();
      for (const x of [-0.72, 0.72]) { // x scaled to headlight positions
        const cone = new THREE.CylinderGeometry(0.09, 2.0, 14, 24, 1, true);
        cone.translate(0, -8, 0); cone.rotateX(-Math.PI / 2 + 0.62); cone.translate(x * 0.9, -0.1, 2.5);
        g.add(new THREE.Mesh(cone, bm));
        const sp = glowSprite(new THREE.Color(1.0, 0.95, 0.88).multiplyScalar(0.30), 0.82); sp.position.set(x * 0.9, -0.1, 2.68); g.add(sp);
      }
      car.light = addLight(scene, new THREE.Vector3(0, 6, -10), new THREE.Color(1.0, 0.92, 0.82), 42, { shaderGain: 0.7 });
      car.under = addLight(scene, new THREE.Vector3(0, 5, -10), accents[0], 22, { shaderGain: 0.8 });
    } else if (kind === 'pass') {
      g.scale.setScalar(0.9);
      car.lane = { x: 4.6, y: 9.4, v: 8.0, zFar: -640, zNear: 100, phase: 490 };
    } else {
      g.scale.setScalar(0.8);
      car.lane = { x: r.range(-3, 8), y: r.range(16, 40), v: r.range(14, 22), zFar: -950, zNear: -170, phase: r.range(0, 800) };
    }
    scene.add(g);
    cars.push(car);
  }
  const tmp = new THREE.Vector3();
  function update(t) {
    for (const c of cars) {
      if (c.kind === 'hero') {
        const x = H.pos[0] + Math.sin(t * 0.09) * H.driftX;
        const y = H.pos[1] + Math.sin(t * 0.7) * 0.12 + Math.sin(t * 0.23) * 0.2;
        const z = H.pos[2] + Math.sin(t * 0.06) * 1.2;
        c.g.position.set(x, y, z);
        c.g.rotation.set(0.06 + Math.sin(t * 0.5) * 0.015, H.yaw + Math.sin(t * 0.11) * 0.04, Math.sin(t * 0.45) * 0.02);
        c.g.updateMatrixWorld();
        moveLight(c.light, tmp.set(0, -0.6, 6.0).applyMatrix4(c.g.matrixWorld));
        moveLight(c.under, tmp.set(0, -1.4, 0).applyMatrix4(c.g.matrixWorld));
      } else {
        const L = c.lane, span = L.zNear - L.zFar;
        const z = L.zFar + ((((L.phase + L.v * t) % span) + span) % span);
        const climb = c.kind==='pass' ? 0 : Math.max(0, z - (L.zNear - 40));
        c.g.position.set(L.x, L.y + climb * climb * 0.03, z);
        c.g.rotation.set(-Math.min(climb * 0.012, 0.3), 0, Math.sin(t * 0.4 + L.y) * 0.03);
      }
    }
  }
  return { cars, update };
}

// ---------------------------------------------------------------- people
function personGeometry() {
  const parts = [];
  const tag = (g, v) => { if (g.index) g = g.toNonIndexed(); const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(v), 1)); g.deleteAttribute('uv'); return g; };
  const coat = [[0.0, 0.52], [0.25, 0.54], [0.23, 0.72], [0.205, 0.95], [0.185, 1.12], [0.2, 1.3], [0.235, 1.4], [0.215, 1.47], [0.12, 1.52], [0.065, 1.555], [0.0, 1.56]].map(([r, y]) => new THREE.Vector2(r, y));
  parts.push(tag(new THREE.LatheGeometry(coat, 14).scale(1, 1, 0.68), 0));
  parts.push(tag(new THREE.SphereGeometry(0.1, 12, 9).scale(0.9, 1.1, 1.0).translate(0, 1.66, 0.01), 0));
  parts.push(tag(new THREE.CylinderGeometry(0.075, 0.05, 0.56, 7).translate(-0.095, 0.28, 0), -1));
  parts.push(tag(new THREE.CylinderGeometry(0.075, 0.05, 0.56, 7).translate(0.095, 0.28, 0), 1));
  parts.push(tag(new THREE.CapsuleGeometry(0.048, 0.5, 4, 7).rotateZ(0.08).translate(-0.245, 1.12, 0.0), 0));
  parts.push(tag(new THREE.CapsuleGeometry(0.048, 0.5, 4, 7).rotateZ(-0.08).translate(0.245, 1.12, 0.0), 0));
  return npMerge(parts);
}
function umbrellaGeometry() {
  const c = new THREE.ConeGeometry(0.52, 0.26, 14, 1, true).translate(0, 2.0, 0);
  const s = new THREE.CylinderGeometry(0.012, 0.012, 0.78, 4).translate(0, 1.62, 0);
  const tag = (g, v) => { const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(v), 1)); g.deleteAttribute('uv'); return g; };
  return npMerge([tag(c, 2), tag(s, 0)]);
}

const WALK_VERT = /* glsl */`
  attribute vec4 aW; attribute vec4 aS; attribute float aPart; attribute float aE;
  uniform float uWalk;
  varying float vFade; varying vec4 vS; varying float vPart; varying vec3 vLocal;
  vec3 npWalk(vec3 p, out float yaw){
    float speed = aW.z;
    float standing = step(0.5, aS.w);
    float z = aW.y;
    float zr = 0.0;
    if (standing < 0.5) {
      float span = aE + 230.0;
      zr = mod(aW.y + 230.0 + speed * uTime * uWalk, span);
      z = zr - 230.0;
    }
    yaw = standing > 0.5 ? aW.w : (speed > 0.0 ? 0.0 : 3.14159);
    float ph = uTime * uWalk * abs(speed) * 5.6 + aW.w * 7.0;
    vec3 q = p * aS.x;
    if (abs(aPart - 0.0) > 0.5 && abs(aPart) < 1.5 && standing < 0.5) q.z += sin(ph) * aPart * (0.62 - q.y) * 0.55 * uWalk;
    q.y += standing < 0.5 ? abs(sin(ph)) * 0.035 * uWalk : 0.0;
    if (aPart > 1.5) q.y += sin(ph) * 0.02 * uWalk;
    float c = cos(yaw), s = sin(yaw);
    q.xz = mat2(c, -s, s, c) * q.xz;
    vFade = standing > 0.5 ? 1.0 : smoothstep(-228.0, -200.0, z) * (1.0 - smoothstep(aE - 6.0, aE, z));
    vS = aS; vPart = aPart; vLocal = p;
    return q + vec3(aW.x, 0.0, z);
  }`;

export function buildPeople(scene, count, walk) {
  const r = rng(P.seed + 71);
  const items = [];
  const low = !walk;
  const cam = P.camera.desktop.pos;
  // Walk end so a walker never enters the desktop text zone (screen x < ~36%).
  const zEndFor = (x) => Math.min(-8, cam[2] - Math.max(0, cam[0] - x) * 2.86); // also fade out >=14 m from camera: near walkers expose simple geometry
  const um = () => (r.chance(0.6) ? (r.chance(0.4) ? 2 : 1) : 0);
  // two conversational customers at the right counter (+ more on High)
  const stallSpots = [[RIGHT_X - 3.75, -8.6, 1.9], [RIGHT_X - 3.95, -9.5, 1.2], [RIGHT_X - 3.7, -15.2, 1.6], [RIGHT_X - 3.9, -21, 1.5], [RIGHT_X - 3.75, -26.5, 1.8], [RIGHT_X - 3.8, -27.4, 1.3], [RIGHT_X - 3.6, -33, 1.6]];
  stallSpots.slice(0, low ? 2 : 7).forEach(([x, z, yaw]) => items.push({ x, z, speed: 0, yaw, scale: r.range(0.95, 1.08), um: 0, stand: 1 }));
  // near umbrella group around screen x 44-51%
  const near = [[-1.2, -13.0, 2, 0.6], [-0.4, -13.7, 1, 3.6], [-1.9, -14.6, 0, 1.2]];
  near.slice(0, low ? 2 : 3).forEach(([x, z, u, yaw]) => items.push({ x, z, speed: 0, yaw, scale: r.range(1.0, 1.06), um: u, stand: 1 }));
  // small standing groups, irregular
  const nGroups = low ? 4 : 6;
  for (let g = 0; g < nGroups; g++) {
    const cx = r.range(-5.5, 3.5), cz = r.range(-30, -150);
    const m = r.int(1, 3);
    for (let k = 0; k < m; k++) items.push({ x: cx + r.range(-0.7, 0.7), z: cz + r.range(-0.8, 0.8), speed: 0, yaw: r.range(0, 6.28), scale: r.range(0.92, 1.08), um: um(), stand: 1 });
  }
  // walkers in clusters (couples, threes) so spacing is uneven
  while (items.length < count) {
    const z = r.range(-226, -6);
    const x = r.range(-6.5, 3.6);
    const dir = r.chance(0.5) ? 1 : -1;
    const sp = dir * r.range(1.0, 1.5);
    const m = r.chance(0.45) ? 1 : r.int(2, 3);
    for (let k = 0; k < m && items.length < count; k++) {
      const xx = THREE.MathUtils.clamp(x + r.range(-0.6, 0.6), -6.8, 3.8);
      items.push({ x: xx, z: z + r.range(-1.2, 1.2), speed: sp * r.range(0.96, 1.04), yaw: r(), scale: r.range(0.9, 1.1), um: um(), stand: 0 });
    }
  }
  items.forEach((p) => { p.zEnd = zEndFor(p.x); });
  const n = items.length;
  const aW = new Float32Array(n * 4), aS = new Float32Array(n * 4);
  const aEnd = new Float32Array(n);
  items.forEach((p, i) => { aW.set([p.x, p.z, p.speed, p.stand ? p.yaw : p.yaw * 10], i * 4); aS.set([p.scale, r(), p.um, p.stand], i * 4); aEnd[i] = p.zEnd; });

  const uniforms = { uWalk: { value: walk ? 1 : 0 } };
  const mkMat = (key, extraFrag) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.12 });
    patchFog(m, {
      key, uniforms, emissiveVar: 'npRimE',
      vertexPre: WALK_VERT,
      fragPre: `varying float vFade; varying vec4 vS; varying float vPart; varying vec3 vLocal;`,
      fragMain: (s) => s
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 coats[5]; coats[0]=vec3(0.010,0.010,0.012); coats[1]=vec3(0.022,0.015,0.012); coats[2]=vec3(0.008,0.012,0.018); coats[3]=vec3(0.028,0.028,0.03); coats[4]=vec3(0.018,0.007,0.008);
          diffuseColor.rgb = coats[int(vS.y*4.99)];
          if (vLocal.y > 1.55 && vPart < 0.5) diffuseColor.rgb = vec3(0.035, 0.024, 0.02);
          ${extraFrag || ''}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 npVd = normalize(vViewPosition);
          float npRim = pow(1.0 - abs(dot(normal, npVd)), 3.0);
          vec3 npRimC = vNpW.x > 3.0 && vNpW.z > -42.0 ? vec3(1.0, 0.55, 0.22) : mix(vec3(1.0, 0.2, 0.8), vec3(0.2, 0.85, 1.0), step(0.5, fract(vNpW.z*0.013)));
          vec3 npRimE = npRimC * npRim * 0.10 * vFade;
          totalEmissiveRadiance += npRimE;`)
        .replace('#include <fog_fragment>', `#include <fog_fragment>
          gl_FragColor.rgb = mix(npFogCol(normalize(vNpW-npCamPos), vNpW.y), gl_FragColor.rgb, vFade);`),
    });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh) => {
      prev(sh);
      sh.vertexShader = sh.vertexShader
        .replace('#include <beginnormal_vertex>', `float npYaw; vec3 npTmp = npWalk(position, npYaw);
          vec3 objectNormal = normal; { float c = cos(npYaw), s = sin(npYaw); objectNormal.xz = mat2(c, -s, s, c) * objectNormal.xz; }
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
          #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = npTmp;');
    };
    return m;
  };
  const bodyGeo = personGeometry();
  bodyGeo.setAttribute('aW', new THREE.InstancedBufferAttribute(aW, 4));
  bodyGeo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  bodyGeo.setAttribute('aE', new THREE.InstancedBufferAttribute(aEnd, 1));
  const bodies = new THREE.InstancedMesh(bodyGeo, mkMat('people'), n);
  bodies.frustumCulled = false; scene.add(bodies);

  // umbrellas: dark opaque ones and clear lit ones in separate draws
  const darkIdx = items.map((p, i) => (p.um === 1 ? i : -1)).filter((i) => i >= 0);
  const clearIdx = items.map((p, i) => (p.um === 2 ? i : -1)).filter((i) => i >= 0);
  const sub = (idx) => {
    const g = umbrellaGeometry();
    const w = new Float32Array(idx.length * 4), s = new Float32Array(idx.length * 4), e = new Float32Array(idx.length);
    idx.forEach((k, j) => { w.set(aW.subarray(k * 4, k * 4 + 4), j * 4); s.set(aS.subarray(k * 4, k * 4 + 4), j * 4); e[j] = aEnd[k]; });
    g.setAttribute('aE', new THREE.InstancedBufferAttribute(e, 1));
    g.setAttribute('aW', new THREE.InstancedBufferAttribute(w, 4));
    g.setAttribute('aS', new THREE.InstancedBufferAttribute(s, 4));
    return g;
  };
  const dark = new THREE.InstancedMesh(sub(darkIdx), mkMat('umbrella', `diffuseColor.rgb = vec3(0.012, 0.012, 0.014) + vec3(0.03,0.0,0.01)*step(0.7, vS.y);`), darkIdx.length);
  dark.material.side = THREE.DoubleSide; dark.frustumCulled = false; scene.add(dark);
  const clearMat = shaderMat({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms,
    vertex: `${WALK_VERT} varying vec3 vNpW; varying vec3 vN;
      void main(){ float yaw; vec3 p = npWalk(position, yaw); vNpW = p; vN = normal;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragment: `varying float vFade; varying vec4 vS; varying float vPart; varying vec3 vLocal; varying vec3 vNpW; varying vec3 vN;
      uniform vec3 npLightPos[12]; uniform vec3 npLightCol[12];
      void main(){
        vec3 V = normalize(npCamPos - vNpW);
        float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
        vec3 env = npFogCol(-V, vNpW.y) * 6.0;
        vec3 lit = vec3(0.0);
        for (int i=0;i<12;i++){ vec3 L = npLightPos[i]-vNpW; lit += npLightCol[i] / (dot(L,L)+1.0); }
        float rim = smoothstep(1.96, 1.93, vLocal.y) * step(1.9, vLocal.y);
        vec3 c = (env * 0.5 + lit * 0.8) * (0.25 + fres) + vec3(0.85, 0.95, 1.0) * rim * 0.8;
        float a = (0.06 + 0.3*fres + rim*0.5) * vFade * (vPart > 1.5 ? 1.0 : 0.6);
        c = mix(c, npFogCol(-V, vNpW.y), npFogAmt(vNpW));
        gl_FragColor = vec4(c, a);
      }`,
  });
  const clear = new THREE.InstancedMesh(sub(clearIdx), clearMat, clearIdx.length);
  clear.frustumCulled = false; clear.renderOrder = 3; scene.add(clear);
  return { bodies, uniforms };
}
