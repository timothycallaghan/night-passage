// Fable pass: authored, articulated street figures (replaces r1's lathe mannequins).
// Every figure is lofted from elliptical cross-sections (coat, limbs with elbows and knees, shoes, hair, hoods)
// and posed/animated on the GPU with a small two-level joint hierarchy. All geometry is original code.
import * as THREE from 'three';
import { PARAMS } from './params.js';
import { rng, patchFog, shaderMat, LIGHTS } from './util.js';
import { RIGHT_X } from './city.js';
import { buildWalkerFlow } from './walker-flow.js';

const P = PARAMS;
const SEG = 14;

// ------------------------------------------------------------------ loft builder
class Builder {
  constructor() { this.geos = []; }
  // Tube through pts with radii ra (local x) / rb (front) / rbk (back). flat: rings stay horizontal.
  tube(pts, ra, rb, bone, mat, { rbk = null, flat = false, capA = true, capB = true, ref = [1, 0, 0], seg = SEG, bones = null } = {}) {
    const n = pts.length, pos = [], idx = [], bn = [];
    const X = new THREE.Vector3(...ref), dir = new THREE.Vector3(), ax = new THREE.Vector3(), az = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      if (flat) dir.set(0, 1, 0); else dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      ax.copy(X).addScaledVector(dir, -X.dot(dir)).normalize(); az.crossVectors(ax, dir);
      for (let j = 0; j < seg; j++) {
        const th = (j / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        const rz = s < 0 && rbk ? rbk[i] : rb[i];
        pos.push(pts[i][0] + ax.x * c * ra[i] + az.x * s * rz, pts[i][1] + ax.y * c * ra[i] + az.y * s * rz, pts[i][2] + ax.z * c * ra[i] + az.z * s * rz);
        bn.push(bones ? bones[i] : bone);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + (j + 1) % seg, c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
    const cap = (i, flip) => {
      const k = pos.length / 3; pos.push(...pts[i]); bn.push(bones ? bones[i] : bone);
      for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg; if (flip) idx.push(k, a, b); else idx.push(k, b, a); }
    };
    if (capA) cap(0, true); if (capB) cap(n - 1, false);
    return this.raw(pos, idx, bn, mat);
  }
  raw(pos, idx, bn, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.setAttribute('aBone', new THREE.Float32BufferAttribute(typeof bn === 'number' ? new Array(pos.length / 3).fill(bn) : bn, 1));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(mat), 1));
    this.geos.push(g); return g;
  }
  build() {
    let nv = 0, ni = 0; for (const g of this.geos) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), bone = new Float32Array(nv), mat = new Float32Array(nv), idx = new Uint32Array(ni);
    let v = 0, k = 0;
    for (const g of this.geos) {
      pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); bone.set(g.attributes.aBone.array, v); mat.set(g.attributes.aMat.array, v);
      const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[k++] = ia[i] + v;
      v += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('aBone', new THREE.BufferAttribute(bone, 1)); out.setAttribute('aMat', new THREE.BufferAttribute(mat, 1));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
}
const M = { coat: 0, trouser: 1, shoe: 2, skin: 3, hair: 4, bag: 5, inner: 6, canopy: 7, metal: 8 };
const col = (rows, k) => rows.map((r) => r[k]);

// ------------------------------------------------------------------ one figure archetype
// opt: { hem, slim, puffer, hood: 'up'|'down'|null, hair: 'short'|'long'|'bun', pack, tote, belt, scarf, cap }
function figureGeometry(o) {
  const B = new Builder();
  const w = o.slim ? 0.9 : 1.0, d = o.slim ? 0.92 : 1.0;
  // --- legs, shoes (bones 1/2 on +x, 3/4 on -x)
  for (const A of [1, -1]) {
    const th = A > 0 ? 1 : 3, shn = th + 1, x = 0.09 * A;
    B.tube([[x * 1.06, 0.50, 0.01], [x * 1.03, 0.66, 0.012], [x, 0.84, 0.0], [x * 0.95, 0.97, 0.0]], [0.058 * w, 0.07 * w, 0.084 * w, 0.08 * w], [0.062, 0.076, 0.092, 0.09], th, M.trouser, { capA: true });
    B.tube([[x * 1.06, 0.075, -0.012], [x * 1.06, 0.12, -0.012], [x * 1.06, 0.36, -0.004], [x * 1.06, 0.46, 0.008], [x * 1.06, 0.53, 0.012]],
      [0.052 * w, 0.046 * w, 0.056 * w, 0.056 * w, 0.058 * w], [0.058, 0.048, 0.05, 0.056, 0.06], shn, M.trouser, { rbk: [0.06, 0.05, 0.066, 0.06, 0.06] });
    // shoe: heel -> toe
    B.tube([[x * 1.06, 0.035, -0.085], [x * 1.06, 0.045, -0.07], [x * 1.06, 0.05, 0.0], [x * 1.08, 0.042, 0.09], [x * 1.1, 0.03, 0.165], [x * 1.1, 0.022, 0.19]],
      [0.03, 0.046, 0.05, 0.052, 0.044, 0.02], [0.03, 0.045, 0.05, 0.042, 0.03, 0.016], shn, M.shoe);
  }
  // --- pelvis under the coat
  B.tube([[0, 0.80, 0], [0, 0.9, 0], [0, 1.0, 0]], [0.15 * w, 0.165 * w, 0.16 * w], [0.1, 0.115, 0.11], 0, M.trouser, { rbk: [0.11, 0.125, 0.12], flat: true });
  // --- torso / coat
  const hem = o.hem ?? 0.86;
  let rows = [ // y, rx, front, back, z, bone
    [0.86, 0.185, 0.125, 0.135, 0, 0], [0.98, 0.176, 0.122, 0.128, 0, 0], [1.10, 0.166, 0.116, 0.116, 0, 0], [1.25, 0.186, 0.134, 0.122, 0.005, 0],
    [1.37, 0.205, 0.128, 0.128, 0, 0], [1.445, 0.198, 0.108, 0.122, -0.004, 0], [1.495, 0.118, 0.082, 0.098, -0.006, 0], [1.535, 0.064, 0.06, 0.068, -0.004, 0], [1.575, 0.05, 0.05, 0.056, 0, 0],
  ];
  if (o.slim) rows = rows.map((r) => [r[0], r[1] * (r[0] < 1.2 ? 0.93 : 0.88), r[2] * 0.95, r[3] * 0.92, r[4], r[5]]);
  if (hem < 0.86) { // long coat: skirt rings follow the legs (bone 10)
    const n = Math.max(2, Math.round((0.86 - hem) / 0.11)); const sk = [];
    for (let i = 0; i < n; i++) { const t = 1 - i / n, y = hem + (0.86 - hem) * (i / n); sk.push([y, (0.185 + 0.03 * t) * (o.slim ? 0.95 : 1), 0.125 + 0.022 * t, 0.135 + 0.03 * t, 0, 10]); }
    rows = [...sk, ...rows.map((r, i) => (i === 0 ? [...r.slice(0, 5), 10] : r))];
  }
  if (o.puffer) { // quilted ribs
    const out = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1]; out.push(a);
      if (a[0] < 1.4 && b[0] - a[0] > 0.09) { const m = a.map((v, k) => (v + b[k]) / 2); m[1] += 0.014; m[2] += 0.016; m[3] += 0.016; m[5] = a[5]; out.push(m); }
    }
    out.push(rows.at(-1)); rows = out.map((r) => (r[0] < 1.45 ? [r[0], r[1] + 0.012, r[2] + 0.014, r[3] + 0.014, r[4], r[5]] : r));
  }
  B.tube(rows.map((r) => [0, r[0], r[4]]), col(rows, 1), col(rows, 2), 0, M.coat, { rbk: col(rows, 3), flat: true, bones: col(rows, 5), seg: 18 });
  if (o.belt) B.tube([[0, 1.07, 0], [0, 1.09, 0], [0, 1.115, 0], [0, 1.135, 0]], [0.16 * w, 0.176 * w, 0.177 * w, 0.16 * w], [0.11, 0.126, 0.127, 0.11], 0, M.bag, { rbk: [0.11, 0.126, 0.126, 0.11], flat: true, seg: 18 });
  // collar / scarf
  if (o.scarf) B.tube([[0, 1.47, 0], [0, 1.50, 0], [0, 1.55, 0.004], [0, 1.585, 0.004], [0, 1.6, 0]], [0.09, 0.105, 0.108, 0.095, 0.06], [0.085, 0.1, 0.105, 0.092, 0.06], 0, M.inner, { rbk: [0.09, 0.1, 0.1, 0.088, 0.06], flat: true });
  else B.tube([[0, 1.485, -0.004], [0, 1.53, -0.008], [0, 1.575, -0.014]], [0.082, 0.088, 0.094], [0.07, 0.07, 0.066], 0, M.coat, { rbk: [0.085, 0.092, 0.1], flat: true, capA: false, capB: false });
  // --- arms (bones 5/6 on +x, 7/8 on -x)
  for (const A of [1, -1]) {
    const up = A > 0 ? 5 : 7, fo = up + 1, pf = o.puffer ? 0.012 : 0;
    B.tube([[0.245 * A, 1.12, 0.0], [0.24 * A, 1.2, 0.0], [0.225 * A, 1.36, 0.0], [0.205 * A, 1.445, 0.0], [0.185 * A, 1.475, 0.0]],
      [0.05 * w + pf, 0.054 * w + pf, 0.06 * w + pf, 0.058 * w + pf, 0.03], [0.052 + pf, 0.056 + pf, 0.064 + pf, 0.062 + pf, 0.03], up, M.coat);
    B.tube([[0.25 * A, 0.9, 0.03], [0.25 * A, 0.93, 0.028], [0.248 * A, 1.06, 0.01], [0.245 * A, 1.16, 0.0]],
      [0.04 * w + pf * 0.6, 0.043 * w + pf, 0.048 * w + pf, 0.05 * w + pf], [0.042 + pf * 0.6, 0.045 + pf, 0.05 + pf, 0.052 + pf], fo, M.coat);
    B.tube([[0.25 * A, 0.80, 0.05], [0.25 * A, 0.825, 0.048], [0.25 * A, 0.87, 0.04], [0.25 * A, 0.91, 0.032]], [0.012, 0.02, 0.022, 0.02], [0.022, 0.038, 0.04, 0.03], fo, M.skin);
  }
  // --- head (bone 9)
  const hd = [[1.525, 0.03, 0.036, 0.02, 0.03], [1.56, 0.056, 0.068, 0.056, 0.016], [1.61, 0.07, 0.086, 0.08, 0.01], [1.665, 0.075, 0.09, 0.092, 0.006], [1.715, 0.068, 0.078, 0.088, 0.0], [1.75, 0.04, 0.045, 0.052, -0.004]];
  B.tube(hd.map((r) => [0, r[0], r[4]]), col(hd, 1), col(hd, 2), 9, M.skin, { rbk: col(hd, 3), flat: true });
  B.tube([[0, 1.615, 0.085], [0, 1.635, 0.098], [0, 1.655, 0.088]], [0.012, 0.014, 0.008], [0.012, 0.012, 0.008], 9, M.skin); // nose
  if (o.hood === 'up') {
    const h = [[1.47, 0.11, 0.06, 0.1, -0.01], [1.56, 0.112, 0.07, 0.118, -0.01], [1.66, 0.108, 0.082, 0.124, -0.008], [1.74, 0.092, 0.08, 0.112, -0.008], [1.79, 0.055, 0.05, 0.075, -0.012]];
    B.tube(h.map((r) => [0, r[0], r[4]]), col(h, 1), col(h, 2), 9, M.coat, { rbk: col(h, 3), flat: true, capA: false });
  } else {
    const hr = [[1.6, 0.074, 0.012, 0.094, -0.004], [1.66, 0.08, 0.05, 0.1, 0.0], [1.705, 0.076, 0.082, 0.098, 0.0], [1.745, 0.058, 0.066, 0.076, -0.002], [1.772, 0.026, 0.03, 0.036, -0.006]];
    if (o.cap) { hr[1][2] = 0.094; hr[2][2] = 0.096; }
    B.tube(hr.map((r) => [0, r[0], r[4]]), col(hr, 1), col(hr, 2), 9, o.cap ? M.inner : M.hair, { rbk: col(hr, 3), flat: true, capA: false });
    if (o.cap) B.tube([[0, 1.675, 0.08], [0, 1.668, 0.13], [0, 1.66, 0.175]], [0.07, 0.066, 0.04], [0.008, 0.007, 0.005], 9, M.inner); // peak
    if (o.hair === 'long') {
      const lh = [[1.3, 0.085, 0.012, 0.04, -0.085], [1.4, 0.1, 0.02, 0.05, -0.075], [1.5, 0.098, 0.03, 0.06, -0.055], [1.6, 0.09, 0.04, 0.085, -0.02], [1.68, 0.084, 0.06, 0.098, -0.004]];
      B.tube(lh.map((r) => [0, r[0], r[4]]), col(lh, 1), col(lh, 2), 0, M.hair, { rbk: col(lh, 3), flat: true, capB: false });
    }
    if (o.hair === 'bun') B.tube([[0, 1.69, -0.085], [0, 1.72, -0.11], [0, 1.75, -0.12], [0, 1.775, -0.105]], [0.03, 0.05, 0.048, 0.02], [0.03, 0.045, 0.042, 0.02], 9, M.hair);
    if (o.hood === 'down') B.tube([[-0.13, 1.47, 0.03], [-0.125, 1.5, -0.07], [-0.07, 1.51, -0.135], [0, 1.515, -0.155], [0.07, 1.51, -0.135], [0.125, 1.5, -0.07], [0.13, 1.47, 0.03]],
      [0.03, 0.045, 0.055, 0.06, 0.055, 0.045, 0.03], [0.03, 0.05, 0.062, 0.066, 0.062, 0.05, 0.03], 0, M.coat, { ref: [0, 1, 0] });
  }
  if (o.pack) {
    B.tube([[0, 1.02, -0.2], [0, 1.06, -0.205], [0, 1.25, -0.215], [0, 1.4, -0.2], [0, 1.44, -0.185]], [0.1, 0.14, 0.145, 0.135, 0.09], [0.04, 0.075, 0.08, 0.07, 0.035], 0, M.bag, { flat: true });
    for (const A of [1, -1]) B.tube([[0.12 * A, 1.1, -0.14], [0.15 * A, 1.25, 0.11], [0.13 * A, 1.4, 0.125], [0.11 * A, 1.47, 0.02], [0.11 * A, 1.42, -0.15]], Array(5).fill(0.018), Array(5).fill(0.008), 0, M.bag, { ref: [1, 0, 0] });
  }
  if (o.tote) {
    B.tube([[-0.27, 0.74, 0.0], [-0.275, 0.77, 0.0], [-0.275, 0.93, 0.0], [-0.27, 0.96, 0.0]], [0.035, 0.05, 0.05, 0.035], [0.12, 0.14, 0.14, 0.12], 0, M.bag, { flat: true });
    B.tube([[-0.27, 0.95, 0.06], [-0.25, 1.25, 0.04], [-0.2, 1.47, 0.0], [-0.25, 1.25, -0.05], [-0.27, 0.95, -0.06]], Array(5).fill(0.008), Array(5).fill(0.014), 0, M.bag, { ref: [0, 0, 1] });
  }
  return B.build();
}

// ------------------------------------------------------------------ umbrellas (built in figure space, held in the +x hand)
const UMB = { hand: [0.25, 1.33, 0.33], apex: [0.1, 2.06, 0.1] };
function umbrellaGeometry(clear) {
  const B = new Builder();
  const R = clear ? 0.47 : 0.56, depth = clear ? 0.34 : 0.2, G = 8, RS = 8, AS = G * 4;
  const hand = new THREE.Vector3(...UMB.hand), apex = new THREE.Vector3(...UMB.apex);
  const up = apex.clone().sub(hand).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const pt = (r, th, lift = 0) => {
    const gf = (th / (Math.PI * 2) * G) % 1, poly = Math.cos(Math.PI / G) / Math.cos((gf - 0.5) * 2 * Math.PI / G);
    const rr = r * (1 - (1 - poly) * (r / R) * 0.9), t = r / R;
    const y = clear ? -depth * (1 - Math.sqrt(Math.max(1 - t * t * 0.96, 0))) / (1 - Math.sqrt(0.04)) : -depth * t * t;
    const sag = clear ? 0 : -0.022 * Math.sin(gf * Math.PI) * t;
    return new THREE.Vector3(Math.cos(th) * rr, y + sag + lift, Math.sin(th) * rr).applyQuaternion(q).add(apex);
  };
  const pos = [], idx = [];
  for (let i = 0; i <= RS; i++) for (let j = 0; j < AS; j++) { const v = pt(R * Math.pow(i / RS, 0.85), (j / AS) * Math.PI * 2); pos.push(v.x, v.y, v.z); }
  for (let i = 0; i < RS; i++) for (let j = 0; j < AS; j++) { const a = i * AS + j, b = i * AS + (j + 1) % AS, c = a + AS, d = b + AS; idx.push(a, b, c, b, d, c); }
  B.raw(pos, idx, 0, M.canopy);
  // ribs + stretchers, shaft, ferrule, handle
  for (let g = 0; g < G; g++) {
    const th = (g / G) * Math.PI * 2, pts = [];
    for (let i = 0; i <= 5; i++) { const v = pt(R * (i / 5), th, -0.006); pts.push([v.x, v.y, v.z]); }
    B.tube(pts, Array(6).fill(0.0035), Array(6).fill(0.0035), 0, M.metal, { seg: 4, ref: [0.3, 0.2, 0.9] });
    const m = pt(R * 0.5, th, -0.008), hub = apex.clone().addScaledVector(up, -0.3);
    B.tube([[hub.x, hub.y, hub.z], [m.x, m.y, m.z]], [0.003, 0.003], [0.003, 0.003], 0, M.metal, { seg: 4, ref: [0.3, 0.2, 0.9] });
  }
  const bot = hand.clone().addScaledVector(up, -0.1), top = apex.clone().addScaledVector(up, 0.07);
  B.tube([[bot.x, bot.y, bot.z], [top.x, top.y, top.z]], [0.007, 0.006], [0.007, 0.006], 0, M.metal, { seg: 6 });
  const hk = [0, 0.03, 0.055, 0.06, 0.04].map((v, i) => { const p = bot.clone().addScaledVector(up, -[0, 0.04, 0.06, 0.05, 0.03][i]); p.z -= v; return [p.x, p.y, p.z]; });
  B.tube(hk, Array(5).fill(0.011), Array(5).fill(0.011), 0, M.shoe, { seg: 6 });
  return B.build();
}

const CLEAR_FRAG = `${LIGHTS} varying float vFade; varying float vMat; varying float vSeed; varying vec3 vLocal; varying vec3 vNpW; varying vec3 vN;
      void main(){
        vec3 V = normalize(npCamPos - vNpW); vec3 N = normalize(vN);
        float fres = pow(1.0 - abs(dot(N, V)), 2.2);
        vec3 lit = vec3(0.0);
        for (int i=0;i<12;i++){ vec3 L = npLightPos[i]-vNpW; float d2 = dot(L,L); vec3 Ln = L*inversesqrt(d2);
          float sp = pow(max(dot(reflect(-Ln, N*sign(dot(N,V))), V), 0.0), 24.0);
          lit += npLightCol[i] * (0.25 + 2.0*sp) / (d2 + 1.0); }
        vec3 env = npFogCol(-V, vNpW.y) * 5.0;
        // beaded rain on the dome + panel seams
        vec2 dropUV=vLocal.xz*42.0;vec2 dropFW=fwidth(dropUV);
        float resolved=1.0-smoothstep(.18,.7,max(dropFW.x,dropFW.y));
        vec2 bead=fract(dropUV)-.5;float beadR=length(bead);
        float drops=(1.0-smoothstep(.08,.08+max(dropFW.x,dropFW.y),beadR))*step(.91,npHash(floor(dropUV)))*resolved*.28;
        vec3 c; float a;
        if (vMat > 7.5) { c = vec3(0.55, 0.6, 0.65) * (0.25 + lit*1.5) + vec3(0.03); a = 0.9 * vFade; }
        else { c = (env * 0.6 + lit) * (0.3 + fres) + lit * drops * .7 + env * drops * .4;
          a = (0.07 + 0.42*fres + drops*0.16) * vFade; }
        c = mix(c, npFogCol(-V, vNpW.y), npFogAmt(vNpW));
        gl_FragColor = vec4(c, a);
      }`;

// One clear umbrella in object space (geometry kept in figure space; the parent places UMB.hand at the grip).
export function heroUmbrella() {
  const m = shaderMat({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertex: `attribute float aMat; varying float vFade; varying float vMat; varying float vSeed; varying vec3 vLocal; varying vec3 vNpW; varying vec3 vN;
      void main(){ vLocal = position; vMat = aMat; vSeed = 0.0; vFade = 1.0; vec4 w = modelMatrix * vec4(position, 1.0); vNpW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragment: CLEAR_FRAG,
  });
  const mesh = new THREE.Mesh(umbrellaGeometry(true), m);
  mesh.position.set(-UMB.hand[0], -UMB.hand[1], -UMB.hand[2]); mesh.renderOrder = 3; mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------ GPU pose + walk
const FIG_VERT = /* glsl */`
  attribute float aBone; attribute float aMat;
  attribute vec4 aW; attribute vec4 aS; attribute vec4 aLeg; attribute vec4 aArm; attribute vec4 aMisc;
  uniform float uWalk;
  attribute vec4 aPose; attribute vec4 aMotion;
  varying float vFade; varying float vMat; varying float vSeed; varying vec3 vLocal;
  vec3 rX(vec3 d, float a){ float c=cos(a), s=sin(a); return vec3(d.x, c*d.y + s*d.z, -s*d.y + c*d.z); }
  vec3 rY(vec3 d, float a){ float c=cos(a), s=sin(a); return vec3(c*d.x + s*d.z, d.y, -s*d.x + c*d.z); }
  void npFig(inout vec3 p, inout vec3 n){
    vLocal = p; vMat = aMat; vSeed = aS.y;
    float sp = aW.z; float walking = step(0.001, abs(sp));
    vec2 root=vec2(aW.x,aW.y); float routeYaw=aW.w, bank=0.0, travelled=abs(sp)*uTime*uWalk;
    if (walking > 0.5) {
      if (uWalk > 0.5) { root=aPose.xy; routeYaw=aPose.z; bank=aMotion.y; travelled=aPose.w; }
      else { root.y=mod(aW.y+230.0,aS.z+230.0)-230.0; routeYaw=sp>0.0?0.0:3.14159; }
    }
    if (walking > 0.5 && aMotion.z > 0.5 && aMotion.z < 1.5) {
      vec3 h=vec3(0.25,1.33,0.33), d=p-h; float c=cos(bank), s=sin(bank);
      p=h+vec3(c*d.x-s*d.y,s*d.x+c*d.y,d.z);
      n=vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z);
    }
    float amp = max(aMisc.x, 0.0) * (walking > 0.5 && uWalk > 0.5 ? aMotion.x : 1.0), wk = max(-aMisc.x, 0.0) * uWalk;
    float ph = travelled/(0.70*aS.x)*3.14159 + aMisc.y;
    float sA = sin(ph), cA = cos(ph);
    float idle = ((1.0 - walking) + walking * (1.0 - aMotion.x)) * uWalk;
    float tA = aLeg.x + amp*0.44*sA, kA = aLeg.y + amp*(0.08 + 0.9*pow(max(cA,0.0),2.0));
    float tB = aLeg.z - amp*0.44*sA, kB = aLeg.w + amp*(0.08 + 0.9*pow(max(-cA,0.0),2.0));
    vec2 sw = vec2(mod(aS.w, 2.0), floor(aS.w*0.5));
    float sa = aArm.x - amp*0.36*sA*sw.x + wk*0.22*sin(uTime*2.1 + aMisc.y);
    float ea = aArm.y + amp*(0.22 + 0.2*max(-sA,0.0))*sw.x + wk*0.3*sin(uTime*2.1 + aMisc.y + 1.0);
    float sb = aArm.z + amp*0.36*sA*sw.y + wk*0.18*sin(uTime*1.6 + aMisc.y*2.0);
    float eb = aArm.w + amp*(0.22 + 0.2*max(sA,0.0))*sw.y + wk*0.25*sin(uTime*1.6 + aMisc.y*2.0 + 0.7);
    const vec3 hip = vec3(0.09, 0.92, 0.0), knee = vec3(0.095, 0.50, 0.01), sh = vec3(0.2, 1.43, 0.0), el = vec3(0.245, 1.14, 0.0), neck = vec3(0.0, 1.54, 0.0);
    float b = aBone;
    if (b > 0.5 && b < 4.5) {
      float A = b < 2.5 ? 1.0 : -1.0; vec3 m = vec3(A, 1.0, 1.0); float th = A > 0.0 ? tA : tB, kn = A > 0.0 ? kA : kB;
      if (mod(b, 2.0) < 0.5) { p = knee*m + rX(p - knee*m, -kn); n = rX(n, -kn); }
      p = hip*m + rX(p - hip*m, th); n = rX(n, th);
    } else if (b > 4.5 && b < 8.5) {
      float A = b < 6.5 ? 1.0 : -1.0; vec3 m = vec3(A, 1.0, 1.0); float s0 = A > 0.0 ? sa : sb, e0 = A > 0.0 ? ea : eb;
      if (mod(b, 2.0) < 0.5) { p = el*m + rX(p - el*m, e0); n = rX(n, e0); }
      p = sh*m + rX(p - sh*m, s0); n = rX(n, s0);
    } else if (b > 8.5 && b < 9.5) {
      float hy = aMisc.z + idle*0.16*sin(uTime*0.37 + aS.y*50.0);
      vec3 dd = rY(rX(p - neck, aMisc.w), hy); p = neck + dd; n = rY(rX(n, aMisc.w), hy);
    } else if (b > 9.5) {
      float s = smoothstep(-0.1, 0.1, p.x); float la = mix(tB, tA, s);
      p.z += sin(la) * max(0.92 - p.y, 0.0) * 0.85;
    }
    p.y -= amp*0.045*sA*sA;
    p.x += idle*0.008*sin(uTime*0.5 + aS.y*40.0)*p.y;
    p *= aS.x;
    float yaw = walking > 0.5 ? routeYaw : aW.w;
    p = rY(p, yaw); n = rY(n, yaw);
    p += vec3(root.x, 0.0, root.y);
    vFade = 1.0; // High uses real route occlusion. Low retains its original static pose/shading.
    if (walking > 0.5 && uWalk < 0.5) vFade=smoothstep(-228.0,-200.0,root.y)*(1.0-smoothstep(aS.z-5.0,aS.z,root.y));
  }`;

function setInst(geo, list, prop = 0, flow) {
  const n = list.length, mk = () => new Float32Array(n * 4);
  const aW = mk(), aS = mk(), aLeg = mk(), aArm = mk(), aMisc = mk();
  const {pose, motion}=flow.register(geo,list,prop);
  geo.setAttribute('aPose', new THREE.InstancedBufferAttribute(pose,4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aMotion', new THREE.InstancedBufferAttribute(motion,4).setUsage(THREE.DynamicDrawUsage));
  list.forEach((p, i) => {
    aW.set([p.x, p.z, p.speed || 0, p.yaw || 0], i * 4); aS.set([p.scale, p.seed, p.zEnd ?? 0, p.swing ?? 3], i * 4);
    aLeg.set(p.leg || [0, 0, 0, 0], i * 4); aArm.set(p.arm || [0, 0.12, 0, 0.12], i * 4); aMisc.set([p.amp ?? 0, p.phase ?? 0, p.headYaw ?? 0, p.headPitch ?? 0], i * 4);
  });
  for (const [k, a] of Object.entries({ aW, aS, aLeg, aArm, aMisc })) geo.setAttribute(k, new THREE.InstancedBufferAttribute(a, 4));
  return geo;
}

function figMaterial(key, uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.0, envMapIntensity: 0.35, side: THREE.DoubleSide });
  patchFog(m, {
    key, uniforms, emissiveVar: 'npRimE',
    vertexPre: FIG_VERT,
    fragPre: `${LIGHTS}\nvarying float vFade; varying float vMat; varying float vSeed; varying vec3 vLocal;`,
    fragMain: (s) => s
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 npC = vec3(0.03); float npR = 0.85; float sd = vSeed;
        if (vMat < 0.5) {
          vec3 coats[7]; coats[0]=vec3(0.030,0.027,0.028); coats[1]=vec3(0.062,0.042,0.030); coats[2]=vec3(0.026,0.036,0.058); coats[3]=vec3(0.070,0.070,0.076);
          coats[4]=vec3(0.085,0.024,0.030); coats[5]=vec3(0.115,0.094,0.062); coats[6]=vec3(0.040,0.056,0.046);
          npC = coats[int(fract(sd*6.37)*6.99)]; npR = fract(sd*7.3) < 0.45 ? 0.34 : 0.82;
          if (npR > 0.5) npC *= 0.82 + 0.36*npNoise(vLocal.xy*vec2(90.0, 60.0) + vLocal.z*31.0);
          if (sd > 0.97) { npC = vec3(0.50, 0.49, 0.45); npR = 0.8; }
        } else if (vMat < 1.5) { npC = mix(vec3(0.022,0.024,0.032), vec3(0.06,0.052,0.045), fract(sd*3.7)); npR = 0.82; }
        else if (vMat < 2.5) { npC = vec3(0.018, 0.016, 0.016); npR = 0.38; }
        else if (vMat < 3.5) { npC = mix(vec3(0.46,0.29,0.20), vec3(0.20,0.12,0.085), fract(sd*5.1)); npR = 0.6; }
        else if (vMat < 4.5) { npC = fract(sd*9.1) < 0.7 ? vec3(0.014,0.012,0.012) : vec3(0.07,0.04,0.022); npR = 0.42; }
        else if (vMat < 5.5) { npC = mix(vec3(0.05,0.032,0.022), vec3(0.03,0.035,0.045), fract(sd*4.3)); npR = 0.55; }
        else if (vMat < 6.5) { npC = mix(vec3(0.20,0.19,0.17), vec3(0.22,0.05,0.04), step(0.6, fract(sd*8.7))); npR = 0.85; }
        else if (vMat < 7.5) { npC = mix(vec3(0.016,0.016,0.02), vec3(0.06,0.012,0.02), step(0.75, fract(sd*5.9))); npR = 0.4; }
        else { npC = vec3(0.3, 0.3, 0.32); npR = 0.3; }
        diffuseColor.rgb = npC;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = npR;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n metalnessFactor = vMat > 7.5 ? 0.9 : 0.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 npVd = normalize(vViewPosition);
        float npRim = pow(1.0 - abs(dot(normal, npVd)), 3.0);
        vec3 npNw = inverseTransformDirection(normal, viewMatrix);
        vec3 npZone = mix(vec3(1.0, 0.2, 0.8), vec3(0.2, 0.85, 1.0), step(0.5, fract(vNpW.z*0.013)));
        vec3 npRimE = (npPointLights(vNpW, npNw, 1.0) * 0.5 + npZone * 0.05) * npRim * (1.3 - npR) * vFade;
        totalEmissiveRadiance += npRimE;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(npFogCol(normalize(vNpW-npCamPos), vNpW.y), gl_FragColor.rgb, vFade);`),
  });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    prev(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <beginnormal_vertex>', `vec3 npP = position; vec3 objectNormal = normal; npFig(npP, objectNormal);
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = npP;');
  };
  return m;
}

// Poses: leg [thighA, kneeA, thighB, kneeB], arm [shoulderA, elbowA, shoulderB, elbowB]
const POSE = {
  umbrella: { arm: [0.35, 1.75, -0.08, 0.5], swing: 2 },
  pockets: { arm: [-0.1, 0.55, -0.1, 0.55], swing: 0 },
  phone: { arm: [0.32, 1.95, -0.1, 0.55], headPitch: -0.3, swing: 0 },
  counter: { arm: [0.72, 0.95, 0.6, 1.1], leg: [0.1, 0.2, -0.06, 0.02], headPitch: -0.16, swing: 0 },
  eat: { arm: [0.5, 1.9, 0.7, 0.9], leg: [-0.05, 0.02, 0.12, 0.25], headPitch: -0.22, swing: 0 },
  cook: { arm: [0.75, 0.85, 0.55, 1.2], headPitch: -0.3, swing: 0, amp: -1 },
  stand: { arm: [0.02, 0.14, -0.03, 0.2], leg: [0.04, 0.03, -0.05, 0.1], swing: 0 },
  walk: { arm: [0, 0.1, 0, 0.1], swing: 3, amp: 1 },
};

const ARCH = [
  { o: { hood: 'down' }, name: 'jacket' },                                  // 0 short jacket, hood down
  { o: { hem: 0.5, slim: true, hair: 'long', tote: true, belt: true }, name: 'longcoat' }, // 1 long coat, long hair
  { o: { puffer: true, hood: 'up', hem: 0.78, pack: true }, name: 'parka' }, // 2 hooded puffer, backpack
  { o: { hem: 0.58, scarf: true, belt: true }, name: 'trench' },            // 3 trench + scarf
  { o: { slim: true, hair: 'bun', puffer: true, hem: 0.8 }, name: 'bomber' }, // 4 short puffer, bun
  { o: { cap: true, hem: 0.84 }, name: 'cap' },                             // 5 cap + work jacket (vendors too)
];

// heroes: true when authored GLB figures replace the three tagged items (their RNG draws are kept so the crowd is unchanged).
export function buildPeople(scene, count, walk, heroes = false) {
  const r = rng(P.seed + 71);
  const low = !walk;
  const cam = P.camera.desktop.pos;
  const zEndFor = (x) => Math.min(-6.5, cam[2] - Math.max(0, cam[0] - x) * 2.86); // legacy r2 metadata; actual terminal routes are in walker-routes.js
  const items = [];
  const add = (a, x, z, pose, extra = {}) => { const it = { a, x, z, scale: r.range(0.96, 1.05), seed: r() * 0.95, um: 0, phase: r() * 6.28, ...POSE[pose], ...extra }; items.push(it); return it; };
  // --- foreground stall: two customers at the counter, one vendor behind it (the concept's right-hand group)
  add(0, 4.95, -1.75, 'counter', { yaw: 1.2, scale: 1.04, seed: 0.02, headYaw: -0.5, hero: 'customer' });
  add(1, 5.15, -2.75, 'eat', { yaw: 1.95, scale: 0.97, seed: 0.33, headYaw: 0.35, omitted: 'obscured-adjacent' });
  add(5, 6.95, -2.9, 'cook', { yaw: -1.75, scale: 1.0, seed: 0.985, hero: 'vendor' });
  if (!low) {
    add(5, 7.0, -12.6, 'cook', { yaw: -1.5, seed: 0.99 });
    add(3, 5.0, -12.2, 'counter', { yaw: 1.7, seed: 0.41 });
    add(4, 4.85, -13.4, 'phone', { yaw: 0.9, seed: 0.62 });
    add(2, 5.05, -22.5, 'eat', { yaw: 1.4, seed: 0.2 });
    add(5, 6.9, -23.0, 'cook', { yaw: -1.6, seed: 0.975 });
    add(0, 4.9, -24.6, 'pockets', { yaw: 2.3, seed: 0.77 });
    add(1, 5.0, -31.5, 'counter', { yaw: 1.5, seed: 0.55 });
  }
  // --- umbrella group left of the route (screen x ~44-51%): two talking under umbrellas, one apart
  add(1, -1.25, -12.8, 'umbrella', { yaw: 0.75, um: 2, seed: 0.12, headYaw: 0.3, hero: 'umbrella' });
  add(3, -0.45, -13.35, 'umbrella', { yaw: -2.5, um: 1, seed: 0.47 });
  if (!low) add(2, -2.6, -17.2, 'phone', { yaw: 0.4, seed: 0.66 });
  // --- sheltering / waiting figures at irregular spots
  const nStand = low ? 3 : 9;
  for (let g = 0; g < nStand; g++) {
    const cx = r.range(-5.5, 3.6), cz = r.range(-26, -150), m = r.int(1, 2);
    for (let k = 0; k < m; k++) { const u = r.chance(0.55) ? (r.chance(0.5) ? 2 : 1) : 0; add(r.int(0, 4), cx + k * 0.75 + r.range(-0.1, 0.1), cz + r.range(-0.5, 0.5), u ? 'umbrella' : r.pick(['pockets', 'phone', 'stand']), { yaw: k ? r.range(-2.6, -1.4) : r.range(0.6, 1.8), um: u }); }
  }
  // --- walkers: singles, pairs, a few threes; uneven spacing; each keeps to a lane
  while (items.length < count) {
    const z = r.range(-226, -9), x = r.range(-6.4, 3.7), dir = r.chance(0.5) ? 1 : -1, sp = dir * r.range(1.05, 1.45);
    const m = r.chance(0.5) ? 1 : r.int(2, 3);
    for (let k = 0; k < m && items.length < count; k++) {
      const u = r.chance(0.6) ? (r.chance(0.45) ? 2 : 1) : 0;
      const xx = THREE.MathUtils.clamp(x + k * 0.7 + r.range(-0.12, 0.12), -6.8, 3.9);
      const it = add(r.int(0, 4), xx, z + r.range(-0.5, 0.5), u ? 'umbrella' : (r.chance(0.3) ? 'pockets' : 'walk'), { speed: sp * (m > 1 ? 1 : r.range(0.92, 1.08)), um: u, amp: 1 });
      it.zEnd = zEndFor(xx);
    }
  }
  // Keep all RNG draws and the walker allocation count; omit only the figure
  // at (5.15, -2.75) identified in Tim's feedback, including the fallback scene.
  const drawn = items.filter((p) => !p.omitted && (!heroes || !p.hero));
  const flow=buildWalkerFlow(drawn,walk);
  const uniforms = { uWalk: { value: walk ? 1 : 0 } };
  const mat = figMaterial('figure', uniforms);
  const meshes = [];
  ARCH.forEach((A, ai) => {
    const list = drawn.filter((p) => p.a === ai); if (!list.length) return;
    const mesh = new THREE.InstancedMesh(setInst(figureGeometry(A.o), list, 0, flow), mat, list.length);
    mesh.frustumCulled = false; scene.add(mesh); meshes.push(mesh);
  });
  const darkList = drawn.filter((p) => p.um === 1), clearList = drawn.filter((p) => p.um === 2);
  if (darkList.length) { const d = new THREE.InstancedMesh(setInst(umbrellaGeometry(false), darkList, 1, flow), mat, darkList.length); d.frustumCulled = false; scene.add(d); }
  const clearMat = shaderMat({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms,
    vertex: `${FIG_VERT} varying vec3 vNpW; varying vec3 vN;
      void main(){ vec3 p = position; vec3 n = normal; npFig(p, n); vNpW = p; vN = n; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragment: CLEAR_FRAG,
  });
  if (clearList.length) { const c = new THREE.InstancedMesh(setInst(umbrellaGeometry(true), clearList, 2, flow), clearMat, clearList.length); c.frustumCulled = false; c.renderOrder = 3; scene.add(c); }
  flow.update(0);
  return { update:flow.update, walkerInfo:flow.info, audioWalkers:flow.renderedInfo, bodies: meshes[0], uniforms, count: items.length, heroes: items.filter((p) => p.hero) };
}
