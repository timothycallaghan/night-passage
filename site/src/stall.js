// Fable pass: the right-foreground food stalls, rebuilt as dressed, individually lit working stalls
// (replaces r1's continuous bottle-shelf bar and glowing slab canopy). Everything is authored code:
// sagging tarp awnings on a frame, slatted counters, pots, steamers, bowls, stools, cloth, paper lanterns
// with separate cores, and a painted (canvas) interior wall. No imported assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, patchFog, shaderMat } from './util.js';
import { PARAMS } from './params.js';
import { RIGHT_X, addLight } from './city.js';
import { glyph } from './textures.js';

const P = PARAMS;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);

function prep(g, color) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(color, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function beam(a, b, t, tz = t) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.BoxGeometry(t, len, tz);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const C = {
  woodDark: [0.05, 0.028, 0.017], wood: [0.115, 0.064, 0.034], woodPale: [0.2, 0.125, 0.07], bamboo: [0.3, 0.2, 0.095],
  steel: [0.5, 0.5, 0.52], iron: [0.035, 0.035, 0.04], brass: [0.55, 0.38, 0.16],
  ceramic: [0.5, 0.47, 0.41], ceramicBlue: [0.1, 0.16, 0.3], cloth: [0.36, 0.32, 0.26], noren: [0.11, 0.016, 0.018], indigo: [0.018, 0.028, 0.07],
  tarp: [0.032, 0.02, 0.017], tarpB: [0.016, 0.027, 0.03], tarpC: [0.04, 0.012, 0.012], plasticR: [0.2, 0.025, 0.02], plasticB: [0.02, 0.05, 0.16], glassG: [0.02, 0.08, 0.04], glassA: [0.22, 0.09, 0.02],
};

// ------------------------------------------------------------------ painted interior wall (canvas, original)
function makeStallPicture(seed) {
  const r = rng(seed); const W = 896, H = 1024;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120a06'); g.addColorStop(0.45, '#2c170b'); g.addColorStop(1, '#100805');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 56) { x.fillStyle = `rgba(0,0,0,${0.18 + r() * 0.2})`; x.fillRect(i + r() * 3, 0, 2, H); }
  x.fillStyle = '#070403'; x.fillRect(0, 0, W, 70);
  x.fillStyle = '#4a4744'; x.fillRect(0, 98, W, 5);
  // menu boards hung from the rail
  for (let i = 0; i < 5; i++) {
    const bx = 22 + i * 148 + r() * 12, by = 116 + r() * 16, bw = 112 + r() * 12, bh = 188 + r() * 34, red = i === 1 || i === 4;
    x.strokeStyle = '#2a2420'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx + 14, 100); x.lineTo(bx + 14, by); x.moveTo(bx + bw - 14, 100); x.lineTo(bx + bw - 14, by); x.stroke();
    g = x.createLinearGradient(0, by, 0, by + bh);
    if (red) { g.addColorStop(0, '#4c0e0a'); g.addColorStop(1, '#d83a22'); } else { g.addColorStop(0, '#6e5230'); g.addColorStop(1, '#f6cf8c'); }
    x.fillStyle = g; x.fillRect(bx, by, bw, bh);
    x.strokeStyle = red ? '#ffd9a0' : '#1c0d06'; x.lineWidth = 4; x.lineCap = 'square';
    const cols = 2 + (r() < 0.5 ? 1 : 0), s = 24;
    for (let c = 0; c < cols; c++) for (let k = 0; k < Math.floor((bh - 30) / 34); k++) if (r() < 0.86) glyph(x, bx + bw - 14 - (c + 1) * (bw - 20) / cols + 6, by + 16 + k * 34, s, r);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(bx, by, bw, 5);
  }
  // hanging ladles / pans on the right
  for (let i = 0; i < 4; i++) {
    const hx = 780 + i * 28, hl = 150 + r() * 90;
    x.strokeStyle = '#8a8580'; x.lineWidth = 3; x.beginPath(); x.moveTo(hx, 102); x.lineTo(hx, 102 + hl); x.stroke();
    x.fillStyle = i % 2 ? '#3a3632' : '#6b655e'; x.beginPath(); x.ellipse(hx, 102 + hl + 14, 13, 15, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,200,130,0.5)'; x.fillRect(hx - 9, 102 + hl + 4, 3, 14);
  }
  // three shelves with jars, bottles, bowl stacks, boxes
  const shelves = [436, 556, 676];
  shelves.forEach((sy, si) => {
    g = x.createLinearGradient(0, sy - 112, 0, sy); g.addColorStop(0, 'rgba(255,186,104,0.62)'); g.addColorStop(1, 'rgba(255,170,90,0.10)');
    x.fillStyle = g; x.fillRect(0, sy - 110, W, 110);
    x.fillStyle = 'rgba(255,238,200,0.95)'; x.fillRect(10, sy - 111, W - 20, 3);
    let cx = 10 + r() * 12;
    while (cx < W - 40) {
      const k = r();
      if (k < 0.34) { // jar
        const w = 32 + r() * 18, h = 44 + r() * 30, hue = r.pick(['#d48a2a', '#73903a', '#b5412a', '#e6d6ae', '#7a4a1c', '#c8a23a']);
        x.fillStyle = hue; x.globalAlpha = 0.92; x.beginPath(); x.roundRect(cx, sy - h, w, h, 6); x.fill(); x.globalAlpha = 1;
        x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(cx + w * 0.55, sy - h + 4, w * 0.4, h - 6);
        x.fillStyle = 'rgba(255,244,214,0.7)'; x.fillRect(cx + 5, sy - h + 8, 4, h - 16);
        x.fillStyle = r() < 0.5 ? '#1b120c' : '#b6aea0'; x.fillRect(cx - 1, sy - h - 7, w + 2, 9);
        cx += w + 5 + r() * 8;
      } else if (k < 0.62) { // bottle
        const w = 19 + r() * 7, h = 76 + r() * 26, hue = r.pick(['#2c5a38', '#c6762a', '#cfdede', '#5a2a16', '#1f3d5a']);
        x.fillStyle = hue; x.beginPath(); x.roundRect(cx, sy - h * 0.7, w, h * 0.7, 4); x.fill(); x.fillRect(cx + w * 0.3, sy - h, w * 0.4, h * 0.34);
        x.fillStyle = '#e8dcc0'; x.fillRect(cx + 1, sy - h * 0.5, w - 2, h * 0.24);
        x.fillStyle = 'rgba(255,250,230,0.75)'; x.fillRect(cx + 3, sy - h * 0.68, 3, h * 0.6);
        x.fillStyle = '#c9a23a'; x.fillRect(cx + w * 0.26, sy - h - 5, w * 0.48, 7);
        cx += w + 4 + r() * 6;
      } else if (k < 0.82) { // stacked bowls
        const w = 50 + r() * 14, n = 3 + Math.floor(r() * 4);
        for (let b = 0; b < n; b++) { x.fillStyle = b % 2 ? '#d9cdb6' : '#efe5cf'; x.beginPath(); x.ellipse(cx + w / 2, sy - 6 - b * 9, w / 2 - b * 0.6, 8, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(40,20,8,0.5)'; x.fillRect(cx + 4, sy - 3 - b * 9, w - 8, 2); }
        if (r() < 0.5) { x.fillStyle = '#27456e'; x.fillRect(cx + 6, sy - 10 - (n - 1) * 9, w - 12, 3); }
        cx += w + 8 + r() * 10;
      } else if (k < 0.93) { // box
        const w = 48 + r() * 26, h = 34 + r() * 20;
        x.fillStyle = '#8c5d2e'; x.fillRect(cx, sy - h, w, h); x.fillStyle = '#c69a5c'; x.fillRect(cx, sy - h * 0.62, w, 5); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(cx + w * 0.6, sy - h, w * 0.4, h);
        cx += w + 6;
      } else cx += 26 + r() * 30;
    }
    x.fillStyle = '#070403'; x.fillRect(0, sy, W, 11); x.fillStyle = '#b97c40'; x.fillRect(0, sy, W, 2);
    if (si === 1) { x.fillStyle = '#ff5a2a'; x.fillRect(640, sy - 22, 6, 6); x.fillStyle = '#58f0c0'; x.fillRect(654, sy - 22, 6, 6); }
  });
  // back counter with a stock pot, kettle and burner
  g = x.createLinearGradient(0, 786, 0, H); g.addColorStop(0, '#5a554e'); g.addColorStop(0.12, '#2e2b28'); g.addColorStop(1, '#0d0c0b');
  x.fillStyle = g; x.fillRect(0, 786, W, H - 786);
  x.fillStyle = '#e8c79a'; x.fillRect(0, 784, W, 4);
  for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(12 + i * 222, 812, 206, 196); x.fillStyle = '#2a2826'; x.fillRect(16 + i * 222, 816, 198, 188); x.fillStyle = '#8a8478'; x.fillRect(190 + i * 222, 880, 8, 56); }
  const pot = (px, pw, ph, steel) => {
    g = x.createLinearGradient(px, 0, px + pw, 0); g.addColorStop(0, steel ? '#56524c' : '#1c1a18'); g.addColorStop(0.3, steel ? '#e6d2b0' : '#5a4630'); g.addColorStop(0.55, steel ? '#8c8478' : '#2a231c'); g.addColorStop(1, '#1a1715');
    x.fillStyle = g; x.fillRect(px, 784 - ph, pw, ph); x.fillStyle = '#f2e2c2'; x.fillRect(px - 5, 784 - ph - 5, pw + 10, 6);
    x.fillStyle = '#2a2622'; x.fillRect(px - 14, 784 - ph * 0.7, 14, 9); x.fillRect(px + pw, 784 - ph * 0.7, 14, 9);
  };
  pot(70, 190, 98, true); pot(330, 120, 64, false); pot(690, 150, 82, true);
  for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(96,170,255,0.9)'; x.beginPath(); x.moveTo(84 + i * 19, 790); x.lineTo(91 + i * 19, 778); x.lineTo(98 + i * 19, 790); x.fill(); }
  x.fillStyle = '#efe9dc'; x.beginPath(); x.roundRect(500, 716, 120, 68, 16); x.fill(); x.fillStyle = '#ff7a2a'; x.fillRect(548, 760, 22, 6);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// ------------------------------------------------------------------ build
export function buildStalls(scene, halos, steamEmitters, low = false) {
  const r = rng(P.seed + 113);
  const gain = P.light.stallGain;
  const S = { matte: [], gloss: [], metal: [], tarp: [] };
  const put = (set, g, c) => { S[set].push(prep(g, c)); };
  const lanterns = [], bulbs = [], pics = [];
  const lanternAt = (x, y, z, rad, c, drop = 0.35) => {
    lanterns.push({ p: V(x, y, z), rad, c });
    put('metal', new THREE.CylinderGeometry(rad * 0.34, rad * 0.4, rad * 0.16, 10).translate(x, y + rad * 0.93, z), C.iron);
    put('metal', new THREE.CylinderGeometry(rad * 0.36, rad * 0.3, rad * 0.14, 10).translate(x, y - rad * 0.93, z), C.iron);
    put('metal', new THREE.CylinderGeometry(0.006, 0.006, drop, 4).translate(x, y + rad + drop / 2, z), C.iron);
    put('matte', new THREE.CylinderGeometry(0.012, 0.022, rad * 0.7, 5).translate(x, y - rad * 1.4, z), [0.3, 0.03, 0.02]);
    halos.push({ pos: V(x - 0.15, y, z + 0.15), size: new THREE.Vector2(rad * 5, rad * 5), color: new THREE.Color(c[0], c[1], c[2]), inten: 0.075 });
  };
  const RED = [1.0, 0.15, 0.05], ORA = [1.0, 0.34, 0.07], PAP = [1.0, 0.56, 0.2];

  // ---- awning: sagging tarp on rafters with a scalloped valance
  const awning = (A) => {
    const L = A.z0 - A.z1, bays = Math.max(2, Math.round(L / 1.6)), bay = L / bays, nz = bays * 8, nx = 8;
    const yAt = (u, w) => { const f = (w * bays) % 1; const s = Math.sin(Math.PI * f); return A.yF + u * (A.yB - A.yF) - A.sag * s * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(u * 1.1, 1))) - 0.04 * s * (1 - u); };
    const g = new THREE.PlaneGeometry(1, 1, nx, nz), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) + 0.5, w = p.getY(i) + 0.5; p.setXYZ(i, A.front + u * (RIGHT_X - A.front), yAt(u, w), A.z0 - w * L); }
    g.computeVertexNormals();
    const pg = prep(g, A.tarp), col = pg.attributes.color, pp = pg.attributes.position;
    for (let i = 0; i < col.count; i++) { const b = Math.floor((A.z0 - pp.getZ(i)) / bay - 1e-4), k = 0.75 + 0.5 * ((Math.sin(b * 12.9898 + A.z0) * 43758.5453) % 1 + 1) % 1; col.setXYZ(i, A.tarp[0] * k, A.tarp[1] * k, A.tarp[2] * k); }
    S.tarp.push(pg);
    const vg = new THREE.PlaneGeometry(1, 1, nz, 1), vp = vg.attributes.position;
    for (let i = 0; i < vp.count; i++) { const w = vp.getX(i) + 0.5, top = vp.getY(i) > 0, f = (w * bays * 3) % 1; vp.setXYZ(i, A.front - 0.012, yAt(0, w) - (top ? 0 : 0.17 + 0.07 * Math.abs(Math.sin(Math.PI * f))), A.z0 - w * L); }
    vg.computeVertexNormals(); put('tarp', vg, A.tarp.map((c) => c * 1.5));
    put('metal', beam(V(A.front + 0.03, A.yF - 0.06, A.z0), V(A.front + 0.03, A.yF - 0.06, A.z1), 0.055, 0.075), C.iron);
    for (let b = 0; b <= bays; b++) {
      const z = A.z0 - b * bay;
      put('metal', beam(V(A.front, A.yF - 0.035, z), V(RIGHT_X, A.yB - 0.035, z), 0.05, 0.045), C.iron);
      if (A.ties && b % 2 === 0) put('metal', beam(V(A.front + 0.04, A.yF, z), V(RIGHT_X, A.yB + 2.3, z), 0.022), C.iron);
    }
    for (const z of A.posts || []) {
      put('metal', beam(V(A.front + 0.03, 0, z), V(A.front + 0.03, A.yF - 0.03, z), 0.07), C.iron);
      put('metal', new THREE.BoxGeometry(0.2, 0.025, 0.2).translate(A.front + 0.03, 0.012, z), C.iron);
      put('metal', beam(V(A.front + 0.03, A.yF - 0.5, z), V(A.front + 0.5, A.yF + 0.02, z), 0.03), C.iron);
    }
    // festoon: small warm bulbs on a sagging wire just inside the front beam
    const fx = A.front + 0.22, n = Math.round(L / 0.55);
    const pts = [];
    for (let i = 0; i <= n; i++) { const w = i / n, f = (w * bays) % 1; const q = V(fx, A.yF - 0.12 - 0.09 * Math.sin(Math.PI * f), A.z0 - w * L); pts.push(q); if (i % 1 === 0 && r.chance(0.82)) bulbs.push(q.clone().add(V(0, -0.04, 0))); }
    put('metal', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.006, 4), C.iron);
  };

  // ---- counter with slatted front, top slab, foot rail
  const counter = (x0, x1, z0, z1, h, wood = C.wood) => {
    const L = z0 - z1, zc = (z0 + z1) / 2;
    put('matte', new THREE.BoxGeometry(x1 - x0 - 0.04, h - 0.1, L).translate((x0 + x1) / 2 + 0.02, (h - 0.1) / 2 + 0.1, zc), C.woodDark);
    for (let z = z0 - 0.06; z > z1 + 0.05; z -= 0.118) put('matte', new THREE.BoxGeometry(0.022, h - 0.16, 0.092).translate(x0 + 0.008, h / 2 + 0.05, z), wood.map((c) => c * (0.75 + 0.5 * r())));
    put('matte', new THREE.BoxGeometry(x1 - x0 + 0.26, 0.05, L + 0.1).translate((x0 + x1) / 2 - 0.02, h + 0.025, zc), C.woodPale.map((c) => c * 0.8));
    put('metal', new THREE.BoxGeometry(0.012, 0.03, L + 0.1).translate(x0 - 0.146, h + 0.025, zc), C.brass);
    put('metal', new THREE.BoxGeometry(x1 - x0, 0.1, L).translate((x0 + x1) / 2, 0.05, zc), C.iron);
    put('metal', new THREE.CylinderGeometry(0.018, 0.018, L, 6).rotateX(Math.PI / 2).translate(x0 - 0.13, 0.2, zc), C.steel);
    for (let z = z0 - 0.3; z > z1; z -= 1.4) put('metal', beam(V(x0, 0.2, z), V(x0 - 0.13, 0.2, z), 0.016), C.steel);
  };
  const bowl = (x, y, z, s = 1, c = C.ceramic) => put('gloss', lathe([[0, 0.012], [0.05, 0.0], [0.07, 0.012], [0.1, 0.05], [0.116, 0.088], [0.108, 0.088], [0.09, 0.045], [0, 0.03]], 14).scale(s, s, s).translate(x, y, z), c);
  const bowlStack = (x, y, z, n) => { for (let i = 0; i < n; i++) bowl(x + r.range(-0.006, 0.006), y + i * 0.034, z + r.range(-0.006, 0.006), 1, i % 3 === 2 ? C.ceramicBlue : C.ceramic); };
  const bottle = (x, y, z, c, s = 1) => { put('gloss', lathe([[0, 0], [0.032, 0], [0.034, 0.13], [0.03, 0.16], [0.013, 0.2], [0.013, 0.25], [0, 0.25]], 10).scale(s, s, s).translate(x, y, z), c); put('metal', new THREE.CylinderGeometry(0.015 * s, 0.015 * s, 0.02, 8).translate(x, y + 0.255 * s, z), C.brass); };
  const pot = (x, y, z, rad, h, steam) => {
    put('metal', new THREE.CylinderGeometry(rad, rad * 0.97, h, 22).translate(x, y + h / 2, z), C.steel);
    put('metal', new THREE.TorusGeometry(rad, 0.012, 6, 22).rotateX(Math.PI / 2).translate(x, y + h, z), C.steel);
    put('metal', new THREE.SphereGeometry(rad * 0.98, 18, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.22, 1).rotateZ(0.2).translate(x + 0.05, y + h + 0.03, z), C.steel);
    for (const s of [-1, 1]) put('metal', new THREE.BoxGeometry(0.03, 0.02, 0.1).translate(x, y + h * 0.78, z + s * (rad + 0.012)), C.iron);
    if (steam) steamEmitters.push({ pos: V(x, y + h + 0.05, z), color: new THREE.Color(1, 0.62, 0.3), rate: steam.rate ?? 1, height: steam.h ?? 1.8, spread: steam.s ?? 0.3 });
  };
  const steamer = (x, y, z, rad, tiers, steam) => {
    for (let i = 0; i < tiers; i++) {
      put('matte', new THREE.CylinderGeometry(rad, rad, 0.095, 20).translate(x, y + 0.05 + i * 0.105, z), C.bamboo.map((c) => c * (0.8 + 0.3 * r())));
      put('matte', new THREE.CylinderGeometry(rad * 1.012, rad * 1.012, 0.018, 20).translate(x, y + 0.1 + i * 0.105, z), C.woodDark);
    }
    put('matte', new THREE.SphereGeometry(rad, 18, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.3, 1).translate(x, y + tiers * 0.105, z), C.bamboo);
    if (steam) steamEmitters.push({ pos: V(x, y + tiers * 0.105 + 0.08, z), color: new THREE.Color(1, 0.62, 0.3), rate: steam.rate ?? 1, height: steam.h ?? 2.2, spread: steam.s ?? 0.35 });
  };
  const stool = (x, z, h = 0.66, rot = 0) => {
    put('matte', new THREE.CylinderGeometry(0.165, 0.155, 0.045, 14).translate(x, h, z), C.wood.map((c) => c * (0.8 + 0.5 * r())));
    for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2; put('metal', beam(V(x + Math.cos(a) * 0.1, h - 0.02, z + Math.sin(a) * 0.1), V(x + Math.cos(a) * 0.19, 0, z + Math.sin(a) * 0.19), 0.02), C.iron); }
    put('metal', new THREE.TorusGeometry(0.155, 0.008, 5, 14).rotateX(Math.PI / 2).translate(x, 0.24, z), C.steel);
  };
  const crate = (x, y, z, c, ry = 0) => put('gloss', new THREE.BoxGeometry(0.5, 0.28, 0.34).rotateY(ry).translate(x, y + 0.14, z), c);
  const noren = (x, yTop, z0, z1, c) => { for (let z = z0; z > z1 + 0.2; z -= 0.47) { const len = 0.4 + r() * 0.12; const g = new THREE.PlaneGeometry(0.43, len, 1, 3).rotateY(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.03 * Math.sin(p.getY(i) * 9 + z)); g.computeVertexNormals(); g.translate(x, yTop - len / 2, z - 0.235); put('tarp', g, c.map((v) => v * (0.8 + 0.4 * r()))); } };
  const picture = (w, h, pos, ry, u0, u1, inten) => { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0)); g.rotateY(ry).translate(pos.x, pos.y, pos.z); const n = g.attributes.position.count, a = new Float32Array(n).fill(inten); g.setAttribute('aI', new THREE.BufferAttribute(a, 1)); pics.push(g); };

  // ============ Stall A: the near noodle stall (hero group) ============
  const A = { z0: 1.6, z1: -9.3, front: 4.55, yF: 2.74, yB: 3.72, sag: 0.11, tarp: C.tarp, posts: [-4.9, -9.25], ties: true };
  awning(A);
  counter(6.3, 6.95, -0.9, -4.55, 1.02);
  counter(6.3, 6.95, -4.7, -8.3, 0.94, C.woodPale);
  put('matte', new THREE.BoxGeometry(0.05, 1.06, 0.14).translate(6.3, 0.53, -4.62), C.woodDark); // seam post between the two units
  // counter-top dressing (customer side near camera, cooking toward the far end)
  bowl(6.38, 1.045, -2.75, 1.25); bowl(6.42, 1.045, -3.35, 1.15, C.ceramicBlue);
  put('matte', new THREE.BoxGeometry(0.34, 0.012, 0.5).translate(6.42, 1.05, -3.05), C.woodDark); // tray
  put('matte', beam(V(6.3, 1.16, -2.86), V(6.5, 1.16, -2.74), 0.006), C.woodPale); put('matte', beam(V(6.3, 1.16, -2.82), V(6.5, 1.165, -2.7), 0.006), C.woodPale); // chopsticks
  bottle(6.78, 1.045, -2.2, C.glassA); bottle(6.84, 1.045, -2.32, C.glassG, 0.9); bottle(6.74, 1.045, -2.4, [0.3, 0.02, 0.02], 0.8); bottle(6.8, 1.045, -3.9, C.glassA, 1.05);
  put('gloss', new THREE.BoxGeometry(0.12, 0.1, 0.16).translate(6.8, 1.095, -2.62), C.ceramic); // napkin box
  bowlStack(6.72, 1.045, -1.5, 6); bowlStack(6.5, 1.045, -1.32, 4);
  { const g = new THREE.PlaneGeometry(0.62, 0.56, 4, 4).rotateY(-Math.PI / 2); g.translate(6.155, 0.8, -4.0); put('tarp', g, C.cloth); put('tarp', new THREE.PlaneGeometry(0.3, 0.62).rotateX(-Math.PI / 2).translate(6.3, 1.052, -4.0), C.cloth); } // cloth over the edge
  steamer(6.62, 0.965, -5.5, 0.2, 3, { rate: 0.9, h: 1.7, s: 0.26 });
  pot(6.62, 0.965, -6.55, 0.25, 0.36, { rate: 1.1, h: 2.2, s: 0.34 });
  bowlStack(6.5, 0.965, -7.35, 5); bowlStack(6.78, 0.965, -7.6, 7);
  put('matte', new THREE.BoxGeometry(0.4, 0.03, 0.28).translate(6.6, 0.98, -4.98), C.woodPale); // chopping board
  // stools: uneven, one pulled out
  stool(5.72, -1.45, 0.66, 0.3); stool(5.52, -4.35, 0.66, 1.0); stool(5.78, -6.3, 0.6, 0.5); stool(5.7, -7.5, 0.66, 0.2);
  // back counter with big pots (seen past the vendor)
  put('metal', new THREE.BoxGeometry(0.62, 0.9, 5.2).translate(8.6, 0.45, -6.4), [0.18, 0.18, 0.19]);
  pot(8.55, 0.9, -5.2, 0.3, 0.42, { rate: 0.8, h: 1.6, s: 0.3 }); pot(8.5, 0.9, -7.6, 0.27, 0.3, null);
  // end partition facing the camera + back wall, both painted
  picture(2.86, 3.3, V(7.55, 1.65, -9.22), 0, 0, 1, 0.8 * gain);
  picture(8.2, 3.3, V(RIGHT_X - 0.04, 1.65, -5.1), -Math.PI / 2, 0, 2.6, 0.6 * gain);
  put('matte', new THREE.BoxGeometry(0.1, 3.4, 0.1).translate(6.1, 1.7, -9.25), C.woodDark);
  noren(4.6, 2.62, -5.2, -9.2, C.noren);
  // lanterns: separate shapes, dark gaps, varied drop
  lanternAt(4.86, 2.2, -1.5, 0.23, RED, 0.3); lanternAt(4.8, 2.06, -3.7, 0.2, ORA, 0.45);
  lanternAt(6.55, 2.42, -2.6, 0.2, RED, 0.6); lanternAt(6.7, 2.26, -5.9, 0.24, RED, 0.75); lanternAt(7.6, 2.5, -7.9, 0.2, ORA, 0.6);
  // crates and a steamer cart at the stall's street corner (source of the tall plume)
  crate(4.95, 0, -8.7, C.plasticB, 0.2); crate(4.98, 0.28, -8.72, C.plasticR, -0.1); crate(5.5, 0, -8.85, C.plasticR, 0.5);
  put('metal', new THREE.BoxGeometry(0.72, 0.62, 1.0).translate(5.05, 0.5, -10.0), [0.3, 0.3, 0.31]);
  for (const s of [-0.4, 0.4]) put('metal', new THREE.TorusGeometry(0.13, 0.035, 6, 14).rotateY(Math.PI / 2).translate(4.72, 0.16, -10.0 + s), C.iron);
  steamer(5.05, 0.81, -9.82, 0.3, 4, { rate: 1.0, h: 7.5, s: 0.85 });
  pot(5.05, 0.81, -10.32, 0.17, 0.2, null);

  // ============ Stall B: lower grill stall, different tarp ============
  const B = { z0: -10.9, z1: -18.6, front: 4.95, yF: 2.46, yB: 3.25, sag: 0.08, tarp: C.tarpB, posts: [-11.0, -18.5] };
  awning(B);
  counter(6.7, 7.3, -11.5, -17.8, 0.9, C.wood);
  put('metal', new THREE.BoxGeometry(0.5, 0.14, 1.9).translate(7.0, 1.0, -13.4), C.iron); // grill trough
  pot(7.0, 0.925, -16.2, 0.24, 0.32, { rate: 0.9, h: 2.0, s: 0.3 }); bowlStack(6.95, 0.925, -15.2, 5); bottle(7.05, 0.925, -11.9, C.glassG); bottle(6.95, 0.925, -12.05, C.glassA);
  steamEmitters.push({ pos: V(7.0, 1.1, -13.4), color: new THREE.Color(1, 0.5, 0.2), rate: 1.2, height: 1.9, spread: 0.45 });
  stool(6.1, -12.6, 0.62, 0.4); stool(6.05, -14.9, 0.62, 0.9); stool(6.15, -16.8, 0.62, 0.1);
  picture(7.7, 3.0, V(RIGHT_X - 0.04, 1.5, -14.75), -Math.PI / 2, 0.15, 2.3, 0.62 * gain);
  lanternAt(5.25, 2.02, -12.2, 0.2, PAP, 0.3); lanternAt(5.2, 1.94, -15.6, 0.22, PAP, 0.35); lanternAt(6.9, 2.1, -17.4, 0.18, ORA, 0.5);
  put('metal', new THREE.CylinderGeometry(0.15, 0.15, 0.55, 12).translate(5.3, 0.275, -18.3), [0.25, 0.08, 0.05]);

  // ============ closed bay: roller shutter, furled awning, stacked crates ============
  put('metal', new THREE.BoxGeometry(0.06, 3.1, 5.6).translate(RIGHT_X - 0.4, 1.55, -22.3), [0.1, 0.105, 0.115]);
  for (let y = 0.15; y < 3.0; y += 0.16) put('metal', new THREE.BoxGeometry(0.03, 0.05, 5.5).translate(RIGHT_X - 0.44, y, -22.3), [0.16, 0.165, 0.18]);
  put('tarp', new THREE.CylinderGeometry(0.16, 0.16, 5.6, 10).rotateX(Math.PI / 2).translate(RIGHT_X - 0.6, 3.3, -22.3), C.tarpC);
  crate(8.1, 0, -20.6, C.plasticB, 0.1); crate(8.12, 0.28, -20.62, C.plasticB, -0.05); crate(8.1, 0, -21.3, C.plasticR, 0.2);

  // ============ Stall C: far warm stall ============
  const Cc = { z0: -26.0, z1: -37.6, front: 4.7, yF: 2.8, yB: 3.6, sag: 0.1, tarp: C.tarpC, posts: [-26.1, -31.8, -37.5] };
  awning(Cc);
  counter(6.4, 7.0, -26.8, -36.8, 1.0, C.wood);
  steamer(6.7, 1.05, -29.0, 0.22, 3, { rate: 1.0, h: 2.4, s: 0.4 }); pot(6.7, 1.05, -33.5, 0.26, 0.34, { rate: 0.9, h: 2.4, s: 0.4 });
  picture(11.4, 3.3, V(RIGHT_X - 0.04, 1.65, -31.8), -Math.PI / 2, 0.3, 3.6, 0.7 * gain);
  for (const [z, c, y] of [[-27.4, RED, 2.2], [-30.2, RED, 2.1], [-33.0, ORA, 2.25], [-35.8, RED, 2.15]]) lanternAt(4.95, y, z, 0.22, c, 0.35);

  // ---- meshes
  const mk = (list, opts, key) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list), patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, ...opts }), { key })); m.frustumCulled = false; scene.add(m); };
  mk(S.matte, { roughness: 0.72 }, 'st-matte');
  mk(S.gloss, { roughness: 0.24, envMapIntensity: 0.8 }, 'st-gloss');
  mk(S.metal, { roughness: 0.38, metalness: 0.82, envMapIntensity: 0.9 }, 'st-metal');
  mk(S.tarp, { roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.5 }, 'st-tarp');

  // painted walls
  const picMat = new THREE.MeshBasicMaterial({ map: makeStallPicture(P.seed + 7) });
  picMat.map.wrapS = THREE.RepeatWrapping;
  patchFog(picMat, { key: 'st-pic', emissiveVar: 'gl_FragColor.rgb', vertexPre: 'attribute float aI; varying float vI;', vertexMain: 'vI = aI;', fragPre: 'varying float vI;',
    fragMain: (s) => s.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= vI;') });
  scene.add(new THREE.Mesh(mergeGeometries(pics), picMat));

  // lanterns: paper globes, ribbed, dark caps, hot core fading to a red rim (never a merged white strip)
  const lg = new THREE.SphereGeometry(1, 20, 14);
  const lm = new THREE.InstancedMesh(lg, shaderMat({
    uniforms: { uGain: { value: 1.0 * gain } },
    vertex: `attribute vec4 aCol; varying vec3 vCol; varying vec3 vN; varying vec3 vP; varying vec3 vNpW;
      void main(){ vCol = aCol.rgb; vP = position;
        vec4 w = instanceMatrix * vec4(position, 1.0);
        float sw = sin(uTime*0.8 + aCol.a*6.283) * 0.022 + sin(uTime*1.7 + aCol.a*17.0) * 0.006; w.x += sw; w.z += sw*0.5;
        vN = normalize(mat3(instanceMatrix) * normal); vNpW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragment: `uniform float uGain; varying vec3 vCol; varying vec3 vN; varying vec3 vP; varying vec3 vNpW;
      void main(){ vec3 Vd = normalize(npCamPos - vNpW); float f = max(dot(normalize(vN), Vd), 0.0);
        float ribs = 0.66 + 0.34*smoothstep(0.0, 0.5, abs(fract(vP.y*5.5 + 0.5) - 0.5)*2.0);
        float seam = 0.9 + 0.1*smoothstep(0.0, 0.2, abs(fract(atan(vP.z, vP.x)*1.2732) - 0.5)*2.0);
        float low = 0.8 - 0.3*vP.y;
        vec3 c = vCol * (0.22 + 1.5*pow(f, 2.2)) * ribs * seam * low;
        c += vec3(1.0, 0.72, 0.36) * pow(f, 9.0) * 1.25 * (0.75 - 0.25*vP.y);
        c *= uGain * (1.0 - 0.93*smoothstep(0.8, 0.86, abs(vP.y)));
        gl_FragColor = vec4(c*(1.0 - npFogAmtD(vNpW, npFogDensity*0.6)) + npFogCol(normalize(vNpW - npCamPos), vNpW.y)*npFogAmt(vNpW), 1.0); }`,
  }), lanterns.length);
  const aCol = new Float32Array(lanterns.length * 4);
  lanterns.forEach((l, i) => { lm.setMatrixAt(i, new THREE.Matrix4().compose(l.p, new THREE.Quaternion(), V(l.rad, l.rad * 0.94, l.rad))); aCol.set([...l.c, r()], i * 4); });
  lg.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 4));
  lm.frustumCulled = false; scene.add(lm);

  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.6, 0.27).multiplyScalar(2.6) });
  patchFog(bulbMat, { key: 'st-bulb', emissiveVar: 'gl_FragColor.rgb' });
  const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.026, 6, 4), bulbMat, bulbs.length);
  bulbs.forEach((p, i) => bm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  bm.frustumCulled = false; scene.add(bm);

  // ---- light: local amber pools under the lamps, not a glowing roof
  const amber = new THREE.Color(...P.palette.amber), warm = new THREE.Color(1.0, 0.5, 0.2);
  addLight(scene, V(6.25, 2.1, -3.1), warm, 15 * gain, { shaderGain: 1.6 });
  addLight(scene, V(6.9, 2.0, -6.6), amber, 13 * gain, { shaderGain: 1.4 });
  addLight(scene, V(6.2, 1.9, -14.4), new THREE.Color(1.0, 0.56, 0.24), 13 * gain, { shaderGain: 1.6 });
  addLight(scene, V(5.9, 2.1, -31.0), amber, 20 * gain, { shaderGain: 1.6 });
  return { lanterns };
}
