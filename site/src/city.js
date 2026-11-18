import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function npMerge(gs) { const mixed = gs.some((g) => !g.index) && gs.some((g) => g.index); return mergeGeometries(mixed ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs); }
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G, rng, patchFog, shaderMat, LIGHTS } from './util.js';
import { PARAMS } from './params.js';
import { LIFE, LIFE_GLSL, ROOMS } from './surface-life.js';

export const LEFT_X = -8, RIGHT_X = 9;
const P = PARAMS;
const col = (a) => new THREE.Color(a[0], a[1], a[2]);

// ---------------------------------------------------------------- lights registry
export const lightRegistry = [];
export function addLight(scene, pos, color, intensity, { real = true, shaderGain = 1, distance = 0 } = {}) {
  let light = null;
  if (real) {
    light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.copy(pos); scene.add(light);
  }
  const idx = lightRegistry.length;
  if (idx < 12) {
    G.npLightPos.value[idx].copy(pos);
    G.npLightCol.value[idx].set(color.r, color.g, color.b).multiplyScalar(intensity * shaderGain / (4 * Math.PI));
  }
  lightRegistry.push({ light, pos: pos.clone(), color, intensity, shaderGain, idx });
  return lightRegistry.at(-1);
}
export function moveLight(entry, pos) {
  entry.pos.copy(pos); if (entry.light) entry.light.position.copy(pos);
  if (entry.idx < 12) G.npLightPos.value[entry.idx].copy(pos);
}

// ---------------------------------------------------------------- buildings
function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.0 });
  const uniforms = {
    ...LIFE, uWinGain: { value: P.light.windowGain },
    uWarm: { value: col(P.palette.warmWindow) }, uCool: { value: col(P.palette.coolWindow) },
    uMag: { value: col(P.palette.magenta) }, uCyan: { value: col(P.palette.cyan) }, uAmber: { value: col(P.palette.amber) },
  };
  patchFog(mat, {
    key: 'bld', emissiveVar: 'npEmis', uniforms,
    vertexPre: `attribute vec4 aB; attribute vec4 aL; attribute vec4 aRoom; varying vec4 vRoom; varying vec4 vB; varying vec4 vL; varying vec3 vLocal; varying vec3 vObjN; varying vec3 vSize;`,
    vertexMain: `vRoom = aRoom; vB = aB; vL = aL; vObjN = normal;
      vec3 npC = instanceMatrix[3].xyz;
      vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vLocal = vNpW - (npC - vec3(vSize.x*0.5, 0.0, vSize.z*0.5));`,
    fragPre: `${LIFE_GLSL}
      varying vec4 vRoom; varying vec4 vB; varying vec4 vL; varying vec3 vLocal; varying vec3 vObjN; varying vec3 vSize;
      float npRelief;
      uniform float uWinGain; uniform vec3 uWarm, uCool, uMag, uCyan, uAmber;
      void npFacade(out vec3 albedo, out vec3 emis, out float rough, out float metal){
        vec3 n = vObjN; npRelief=0.0;
        float seed = vB.x, floorH = vB.y, winW = vB.z, style = vB.w;
        float litP = vL.x, warm = vL.y, dark = vL.z, accent = vL.w;
        float dark0 = dark;
        // The left near wall stays black beside the type zone, then wakes up along the street.
        float wake = dark0 * smoothstep(-24.0, -42.0, vNpW.z);
        litP = mix(litP, 0.36, wake); warm = mix(warm, 0.92, wake); dark *= 1.0 - 0.8*wake;
        vec3 wallC = vec3(0.040, 0.044, 0.052) * (0.55 + 0.9*fract(seed*7.31));
        wallC *= mix(vec3(1.0), vec3(1.15, 0.97, 0.85), step(0.6, fract(seed*3.7)));
        wallC *= (1.0 - 0.5*dark);
        albedo = wallC; emis = vec3(0.0); rough = 0.55; metal = 0.0;
        float y = vLocal.y;
        bool xf = abs(n.x) > 0.5;
        float u = xf ? vLocal.z : vLocal.x;
        float width = xf ? vSize.z : vSize.x;
        // grime: broad stains and vertical rain streaks; wet streaks are smoother
        float stain = npFbm(vec2(u*0.35, y*0.12) + seed);
        float streak = npFbm(vec2(u*2.6 + seed*31.0, y*0.06));
        albedo *= (0.68 + 0.55*stain) * (0.7 + 0.55*streak);
        rough = mix(0.34, 0.72, streak);
        float leftFinish = step(vNpW.x,-6.8) * step(0.5,n.x) * (1.0-smoothstep(160.0,240.0,-vNpW.z));
        float finishDetail = 1.0-smoothstep(0.07,0.25,max(fwidth(u),fwidth(y)));
        // Cast-stone aggregate, small repair patches, rain leaching and thin mortar.
        vec2 stoneQ=vec2(u/1.05,y/.47);stoneQ.x+=mod(floor(stoneQ.y),2.0)*.5;
        vec2 stoneF=fract(stoneQ),stoneAA=fwidth(stoneQ);
        float joint=1.0-smoothstep(.008,.022+max(stoneAA.x,stoneAA.y),min(min(stoneF.x,1.0-stoneF.x),min(stoneF.y,1.0-stoneF.y)));
        float repair=npHash(floor(vec2(u/2.8,y/1.7))+seed*9.0);
        float gritAA=1.0-smoothstep(.25,.9,max(fwidth(u*28.0),fwidth(y*28.0)));
        float grit=mix(.5,npNoise(vec2(u,y)*28.0+seed*81.0),gritAA);
        float patina=npNoise(vec2(u*4.0,y*.19)+seed*11.0);
        albedo *= mix(1.0,(.78+.30*patina+.16*repair)*(1.0-.20*joint*finishDetail)*(1.0+(grit-.5)*.28*finishDetail),leftFinish);
        rough = mix(rough,clamp(rough+.13*(1.0-patina)+.05*joint,.2,.9),leftFinish);
        npRelief=leftFinish*finishDetail*(.0012*grit-.0007*joint);
        if (n.y > 0.5) { albedo *= 0.5; rough = 0.9; return; }
        if (n.y < -0.5) return;
        float face = xf ? (n.x > 0.0 ? 1.0 : 2.0) : (n.z > 0.0 ? 3.0 : 4.0);
        vec2 cell = vec2(u / winW, y / floorH);
        vec2 id = floor(cell); vec2 f = fract(cell);
        vec2 fw = fwidth(cell);
        float det = 1.0 - smoothstep(0.02, 0.09, max(fw.x, fw.y));   // near-detail weight
        float cols = floor(width / winW);
        float inside = step(1.0, id.x) * step(id.x, cols - 2.0) * step(1.5, id.y) * step(y, vSize.y - floorH*0.8);
        vec2 lo = style < 0.5 ? vec2(0.2, 0.24) : (style < 1.5 ? vec2(0.05, 0.10) : vec2(0.12, 0.3));
        vec2 hi = style < 0.5 ? vec2(0.8, 0.84) : (style < 1.5 ? vec2(0.95, 0.94) : vec2(0.88, 0.82));
        // view ray in facade space (sideways and up, per metre of depth into the wall)
        vec3 vd = normalize(vNpW - npCamPos);
        vec3 T = xf ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
        float vn = max(-dot(vd, n), 0.07);
        vec2 slope = vec2(dot(vd, T), vd.y) / vn;
        float D = (style < 0.5 ? 0.34 : (style < 1.5 ? 0.10 : 0.22)) + leftFinish*0.08;   // reveal depth, metres
        vec2 gf = f + clamp(slope * D, -1.2, 1.2) / vec2(winW, floorH); // where the ray meets the glass
        // piers, string courses and their shadow lines (masonry and banded styles)
        vec2 m = smoothstep(lo - fw, lo + fw, f) - smoothstep(hi - fw, hi + fw, f);
        float open = m.x * m.y * inside;
        if (style < 0.5 || style > 1.5) {
          float pier = (1.0 - smoothstep(0.03-fw.x, 0.06+fw.x, f.x)) + smoothstep(0.94-fw.x, 0.97+fw.x, f.x);
          float course = step(mod(id.y, 4.0), 0.5) * (1.0 - smoothstep(0.07, 0.09, f.y)) * step(1.5, id.y);
          float shade = step(mod(id.y + 1.0, 4.0), 0.5) * smoothstep(0.92, 0.99, f.y);
          albedo *= 1.0 + det * (0.30*pier + 0.60*course);
          albedo *= 1.0 - det * 0.55 * shade;
          // sill: a lighter wet lip under each opening
          float sill = step(lo.x - 0.03, f.x) * step(f.x, hi.x + 0.03) * step(lo.y - 0.045, f.y) * step(f.y, lo.y) * inside;
          albedo *= 1.0 + det * 1.1 * sill; rough = mix(rough, 0.25, det*sill);
        }
        vec2 mg = smoothstep(lo - fw, lo + fw, gf) - smoothstep(hi - fw, hi + fw, gf);
        float glassD = open * mg.x * mg.y;
        float win = mix(open, glassD, det);
        float reveal = (open - glassD) * det;
        float cover = (hi.x-lo.x)*(hi.y-lo.y) * inside;
        float farW = smoothstep(0.28, 0.75, max(fw.x, fw.y));
        float h = npHash(id + seed*13.7 + face*3.1);
        float cluster = npNoise(id*vec2(0.31, 0.19) + seed*5.0 + face);
        float p = litP * (0.25 + 1.5*cluster*cluster);
        float lit = step(h, p);
        float h2 = npHash(id*1.7 + seed + face);
        vec3 wc = h2 < warm ? uWarm : (h2 < 0.94 ? uCool : (h2 < 0.975 ? uCyan*0.8 : uMag*0.8));
        wc *= mix(vec3(1.0), vec3(1.0, 0.82, 0.62), npHash(id + 12.4) * step(h2, warm));   // warm windows vary in temperature
        float inten = 0.35 + 1.5*pow(npHash(id + 7.7 + seed), 2.0);
        float selectedRoom = step(0.5,vRoom.z) * (1.0-step(0.1,abs(id.x-vRoom.x))) * (1.0-step(0.1,abs(id.y-vRoom.y))) * step(0.5,n.x);
        float lifeTime=uTime*uAmbientLife;
        if(selectedRoom>0.5){
          lit=npRoomLevel(vRoom.z,lifeTime);wc=uWarm*vec3(.90,.86,.82);inten=.85;
          if(vRoom.z>3.5){
            // Soft irregular television scene changes, never a high-frequency flash.
            float tvTime=mod(lifeTime*uTVTimeScale,61.0);
            // Uneven television scene holds, joined over 3–5 seconds; no rapid noise.
            vec3 tvCol=vec3(.10,.20,.53);
            tvCol=mix(tvCol,vec3(.34,.50,.95),smoothstep(3.0,6.0,tvTime));
            tvCol=mix(tvCol,vec3(.17,.23,.56),smoothstep(17.0,21.0,tvTime));
            tvCol=mix(tvCol,vec3(.22,.44,.74),smoothstep(34.0,39.0,tvTime));
            tvCol=mix(tvCol,vec3(.10,.20,.53),smoothstep(51.0,56.0,tvTime));
            lit=1.0;wc=tvCol;inten=1.8;
          }
        }
        // simple far look
        float blinds0 = npHash(id + 2.3) < 0.35 ? (0.55 + 0.45*step(0.5, fract(f.y*9.0))) : 1.0;
        float grad = mix(0.7, 1.15, smoothstep(lo.y, hi.y, f.y));
        vec3 winFar = wc * inten * blinds0 * grad * lit;
        // near look: a box room behind the glass (interior mapping) with blinds, curtains and glazing bars at the glass
        vec2 sl = slope / vec2(winW, floorH);
        sl += (step(abs(sl), vec2(1e-4)) * 2e-4);
        vec2 tw = (step(vec2(0.0), sl) - gf) / sl;
        float Rd = 2.6 + 2.4*npHash(id + 5.5);
        float sd = min(Rd, min(tw.x, tw.y));
        vec2 hp = gf + sl * sd;
        float room;
        if (sd >= Rd) { vec2 bq = floor(hp * vec2(5.0, 4.0)); room = (0.5 + 0.45*npHash(bq + id*3.1)) * (0.55 + 0.65*hp.y); }
        else if (tw.y < tw.x) room = sl.y > 0.0 ? 1.15 + 0.9*step(0.62, fract(sd*0.8 + h2)) : 0.28;
        else room = 0.62;
        room *= mix(1.05, 0.5, sd / Rd);
        // A few interior silhouettes and imperfect painted frames, confined to left facades.
        float furniture=step(.18,hp.x)*step(hp.x,.57)*step(.08,hp.y)*step(hp.y,.29);
        float shelfLine=(1.0-smoothstep(.01,.025,abs(hp.y-.43)))*step(.1,hp.x)*step(hp.x,.85);
        room *= 1.0-leftFinish*(.24*furniture+.15*shelfLine);
        vec2 gq = (gf - lo) / (hi - lo);
        float blinds = npHash(id + 2.3) < 0.35 ? (0.42 + 0.58*step(0.45, fract(gq.y*14.0))) * step(gq.y, 0.35 + 0.65*npHash(id + 1.9)) + step(0.35 + 0.65*npHash(id + 1.9), gq.y) : 1.0;
        float cw = 0.55 * npHash(id + 6.1) * step(npHash(id + 8.8), 0.42);
        float curtain = max(step(gq.x, cw), step(1.0 - cw*0.7, gq.x)) * step(0.001, cw);
        float person = step(npHash(id+9.1), 0.14) * smoothstep(0.08, 0.0, abs(gq.x-0.5-0.3*(npHash(id+4.0)-0.5))-0.07) * step(gq.y, 0.5);
        vec2 panes = style < 0.5 ? vec2(2.0, 2.0) : (style < 1.5 ? vec2(1.0, 1.0) : vec2(3.0, 1.0));
        vec2 pq = abs(fract(gq * panes + 0.5) - 0.5) / panes;
        float mull = 1.0 - smoothstep(0.012, 0.03, min(pq.x * (hi.x-lo.x) * winW, pq.y * (hi.y-lo.y) * floorH) * 0.5);
        vec3 winNear = wc * inten * lit * mix(room * blinds, 0.42 * (0.8 + 0.2*sin(gq.x*winW*38.0)), curtain) * (1.0 - 0.75*person) * (1.0 - 0.9*mull);
        vec3 winEm = mix(winFar * open, winNear * glassD, det);
        winEm += wc * inten * lit * reveal * 0.10;      // light spilling onto the reveal
        vec3 avgEm = mix(uCool, uWarm, warm) * 0.95 * p * cover;
        avgEm=mix(avgEm,wc*inten*lit*cover,selectedRoom);
        emis = mix(winEm, avgEm, farW) * uWinGain * (1.0 - 0.6*dark);
        // glass vs wall
        float glassDirt=npNoise(vec2(u*9.0,y*.55)+seed*16.0);
        vec3 glass = vec3(0.006, 0.008, 0.012) * (1.0+leftFinish*(glassDirt-.5)*.4);
        float glassAmt = mix(win, cover, farW);
        if (style > 0.5 && style < 1.5) { glassAmt = max(glassAmt, 0.6*inside); }
        albedo *= 1.0 - 0.5*reveal;
        albedo = mix(albedo, glass, glassAmt);
        float frameWear=.72+.40*npNoise(vec2(u,y)*12.0+seed);
        albedo = mix(albedo,vec3(.03,.032,.036)*mix(1.0,frameWear,leftFinish),mull*glassD*det);
        rough = mix(rough, mix(0.08+leftFinish*.11*glassDirt,0.45,mull*det),glassAmt);
        metal = mix(0.0,0.2,glassAmt); npRelief*=1.0-glassAmt;
        // slab lines
        if (style < 0.5) albedo *= mix(1.0, 1.25, (1.0 - farW) * step(f.y, lo.y*0.5));
        // base storey: rusticated wet stone, cornice lip, and (on the dark wall) shut shopfront bays
        float baseTop = 1.5 * floorH;
        if (y < baseTop) {
          float ry = y / 0.42;
          float rl = step(fract(ry), 0.09) * (1.0 - smoothstep(0.15, 0.5, fwidth(ry)));
          albedo *= 1.3 * (1.0 - 0.5*rl); rough = mix(rough, 0.3, 0.6);
          albedo *= 1.0 + 0.9 * step(baseTop - 0.32, y);
          if (dark0 > 0.5 && y < 3.5) {
            vec2 bc = vec2(u / 4.4, y / 3.5); vec2 bid = floor(bc); vec2 bf = fract(bc);
            float op = step(0.12, bf.x) * step(bf.x, 0.88) * step(bf.y, 0.9);
            float bh = npHash(vec2(bid.x, seed*91.0));
            float bars = max(step(abs(fract(bf.x*4.0 + 0.5) - 0.5), 0.03), step(abs(bf.y - 0.68), 0.012));
            // shop interior: shelves of stock under ceiling light, dark stall riser, coloured fascia strip above
            vec2 iq = vec2(bf.x*16.0, bf.y*5.5); vec2 ii = floor(iq); vec2 fi = fract(iq);
            float stock = step(npHash(ii + bid*7.3 + seed), 0.7) * step(0.12, fi.x) * step(fi.y, 0.25 + 0.6*npHash(ii + 3.3)) * step(0.16, bf.y);
            vec3 stockC = 0.5 + 0.5*cos(6.2832*(npHash(ii + bid + 1.7) + vec3(0.0, 0.33, 0.67)));
            float shelf = step(fi.y, 0.08) * step(0.16, bf.y);
            vec3 base = (bh < 0.5 ? uWarm : mix(uWarm, uCyan, 0.55)*0.7) * step(bh, 0.74) * wake;
            vec3 glow = base * (0.10 + 0.55*bf.y*bf.y) * step(0.14, bf.y);
            glow = mix(glow, base * stockC * 0.42, stock) * (1.0 - 0.6*shelf);
            glow += base * 1.6 * step(0.86, bf.y) * step(abs(fract(bf.x*3.0) - 0.5), 0.36);   // ceiling tubes
            albedo = mix(albedo, vec3(0.006, 0.008, 0.012), op); rough = mix(rough, 0.1, op);
            emis += glow * op * (1.0 - 0.85*bars) * 0.9;
            float fas = step(0.12, bf.x) * step(bf.x, 0.88) * step(0.93, bf.y) * step(bh, 0.74) * wake;
            emis += (npHash(vec2(bid.x, seed*17.0)) < 0.5 ? uMag : uCyan) * fas * 0.9 * step(abs(bf.y - 0.965), 0.012);
          }
        }
        // LED bands
        if (style > 1.5) {
          float band = (smoothstep(0.0, fw.y + 0.02, f.y) - smoothstep(0.06, 0.06 + fw.y + 0.02, f.y)) * step(mod(id.y, 3.0), 0.5) * step(1.5, id.y);
          vec3 bc = fract(seed*11.0) < 0.5 ? uCyan : uMag;
          emis += bc * band * 1.6 * (1.0 - dark);
        }
        // accent corner strips
        if (accent > 0.72) {
          float e = min(u, width - u);
          float strip = 1.0 - smoothstep(0.12, 0.12 + fwidth(u)*1.5 + 0.02, e);
          vec3 sc = fract(seed*5.3) < 0.5 ? uCyan : uMag;
          emis += sc * strip * 2.2 * step(6.0, y);
        }
        // street-level neon bounce on walls
        float zN = npNoise(vec2(vNpW.z * 0.025, seed));
        vec3 tint = mix(uMag, uCyan, smoothstep(0.35, 0.65, zN));
        if (vNpW.x > 0.0 && vNpW.z > -40.0) tint = uAmber;
        float bounceFinish=mix(1.0,(.58+.55*patina+.24*repair+.38*(grit-.5)*finishDetail)*(1.0-.28*joint*finishDetail),leftFinish*(1.0-glassAmt));
        emis += tint*exp(-y/8.0)*.05*(1.0-dark*.85)*(1.0-glassAmt*.5)*bounceFinish;
      }`,
    fragMain: (s) => s
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 npAlb; vec3 npEmis; float npRough; float npMetal;
        npFacade(npAlb, npEmis, npRough, npMetal);
        diffuseColor.rgb = npAlb;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec3 npDx=dFdx(-vViewPosition),npDy=dFdy(-vViewPosition);
        vec3 npR1=cross(npDy,normal),npR2=cross(normal,npDx);
        float npDet=dot(npDx,npR1);
        vec3 npGrad=sign(npDet)*(dFdx(npRelief)*npR1+dFdy(npRelief)*npR2);
        normal=normalize(mix(normal,normalize(abs(npDet)*normal-npGrad),.35));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = npRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = npMetal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = npEmis;'),
  });
  return mat;
}

export function buildCity(scene, preset) {
  LIFE.uAmbientLife.value = preset.liveReflection ? 1 : 0;
  const r = rng(P.seed);
  const list = [];
  const fronts = []; // street-facing buildings for signs/shops
  const farMul = preset.buildingsFar;
  for (const side of [-1, 1]) {
    let z = 36;
    while (z > -1000 * farMul) {
      const near = z > -60;
      const dz = r.range(9, 24) * (z < -350 ? 1.4 : 1);
      if (!near && r.chance(0.07)) { z -= r.range(10, 16); continue; }
      let h;
      if (side < 0 && near) h = r.range(80, 120);
      else if (near) h = r.range(55, 95);
      else h = r.range(45, 130) + Math.max(0, -z) * r.range(0.04, 0.22);
      const inset = near ? 0 : r.range(0, 3.5);
      const fx = side < 0 ? LEFT_X - inset : RIGHT_X + inset;
      const d = r.range(20, 34);
      const b = {
        side, cx: fx + side * d / 2, cz: z - dz / 2, sx: d, sz: dz, h, fx, z0: z, z1: z - dz,
        seed: r(), floorH: r.range(3.2, 4.2), winW: r.range(1.8, 3.0), style: r.pick([0, 0, 1, 1, 2]),
        litP: r.range(0.18, 0.5), warm: r.range(0.4, 0.8), dark: 0, accent: r(),
      };
      if (side < 0 && near) { b.dark = 1; b.litP = 0.05; b.style = 0; b.accent = 0; }
      list.push(b); fronts.push(b);
      // crown / setback
      if (!near && r.chance(0.35)) {
        const sh = r.range(15, 50);
        list.push({ ...b, cx: b.cx + side * r.range(1, 4), sx: b.sx * 0.65, sz: b.sz * 0.7, base: b.h, h: sh, seed: r(), accent: r() });
      }
      z -= dz + (r.chance(0.25) ? r.range(0.5, 2.0) : 0);
    }
    // back row towers
    for (let z2 = -30; z2 > -1100 * farMul; z2 -= r.range(18, 40)) {
      const off = r.range(38, 75);
      list.push({ side, cx: side < 0 ? LEFT_X - off : RIGHT_X + off, cz: z2, sx: r.range(18, 30), sz: r.range(18, 30),
        h: r.range(110, 320), seed: r(), floorH: r.range(3.4, 4.0), winW: r.range(2, 3), style: r.pick([0, 1, 1, 2]),
        litP: r.range(0.15, 0.45), warm: r.range(0.3, 0.7), dark: 0, accent: r() });
    }
  }
  // far cluster closing the vanishing point
  for (let i = 0; i < 26 * farMul; i++) {
    list.push({ side: 0, cx: r.range(-90, 100), cz: r.range(-1050, -1350), sx: r.range(25, 45), sz: r.range(25, 45),
      h: r.range(180, 460), seed: r(), floorH: 4, winW: 2.6, style: r.pick([0, 1, 2]), litP: r.range(0.2, 0.45), warm: 0.5, dark: 0, accent: r() });
  }

  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, buildingMaterial(), list.length);
  const aB = new Float32Array(list.length * 4), aL = new Float32Array(list.length * 4), aRoom = new Float32Array(list.length*4);
  const m4 = new THREE.Matrix4();
  list.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.cx, b.base || 0, b.cz), new THREE.Quaternion(), new THREE.Vector3(b.sx, b.h, b.sz));
    mesh.setMatrixAt(i, m4);
    aB.set([b.seed, b.floorH, b.winW, b.style], i * 4);
    aL.set([b.litP,b.warm,b.dark,b.accent],i*4);
    const room=ROOMS.find(q=>Math.abs(q.seed-b.seed)<1e-6 && b.side<0 && !b.base);
    if(room)aRoom.set([...room.cell,room.slot,0],i*4);
  });
  geo.setAttribute('aRoom',new THREE.InstancedBufferAttribute(aRoom,4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  geo.setAttribute('aL', new THREE.InstancedBufferAttribute(aL, 4));
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { buildings: list, fronts, mesh };
}

// ---------------------------------------------------------------- emissive atlas material (signs, shops)
export function emissiveAtlasMaterial(map, key) {
  const mat = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
  patchFog(mat, {
    key: 'emi-' + key, emissiveVar: 'gl_FragColor.rgb', uniforms: LIFE,
    vertexPre: 'attribute vec3 aSign; varying vec3 vSign;',
    vertexMain: 'vSign = aSign;',
    fragPre: `${LIFE_GLSL} varying vec3 vSign;`,
    fragMain: (s) => s.replace('#include <map_fragment>', `#include <map_fragment>
      float npFl = 1.0;
      npFl = npNeonLevel(vSign.z,uTime*uAmbientLife);
      diffuseColor.rgb = diffuseColor.rgb * diffuseColor.rgb * 1.0 + diffuseColor.rgb * 0.15;
      diffuseColor.rgb *= vSign.y * npFl;`),
  });
  return mat;
}

function boxWithFaceUV(w, h, d, rect, faceIdx = [4]) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (faceIdx.includes(f)) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, rect.u0 + u * (rect.u1 - rect.u0), rect.v0 + v * (rect.v1 - rect.v0));
    } else uv.setXY(i, 0.0008, 0.9995);
  }
  return g;
}
function withSignAttr(g, phase, inten, flicker) {
  const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([phase, inten, flicker], i * 3);
  g.setAttribute('aSign', new THREE.BufferAttribute(a, 3));
  return g;
}

// ---------------------------------------------------------------- signs
export function buildSigns(scene, fronts, atlas, halos) {
  const r = rng(P.seed + 5);
  const geos = [];
  const gain = P.light.signGain;
  let chosen=0;const selected=[];
  for (const b of fronts) {
    if (b.dark) continue;
    const dist = -b.cz;
    if (dist > 900) continue;
    const scale = 1 + Math.max(0, dist - 60) / 160;
    const nCols = (b.side < 0 && dist < 70) || dist < 26 ? 0 : r.int(1, dist < 120 ? 3 : 2);
    for (let c = 0; c < nCols; c++) {
      const zz = THREE.MathUtils.lerp(b.z0 - 1, b.z1 + 1, (c + 0.5) / nCols) + r.range(-1, 1);
      let y = r.range(5.5, 9);
      const stack = r.int(1, dist < 150 ? 4 : 3);
      for (let s = 0; s < stack && y < b.h - 4; s++) {
        const m = r.pick(atlas.vertical);
        const w = r.range(1.2, 2.2) * scale, h = w / m.aspect * r.range(0.8, 1.05);
        const x = b.fx - b.side * (0.35 + w / 2 + r.range(0, 0.6));
        const inten = r.range(1.3, 2.6) * gain * (dist > 300 ? 1.3 : 1);
        const slot=b.side<0 && dist>100 && dist<180 && c===0 && s===0 && chosen<2 ? ++chosen : 0;
        const g=withSignAttr(boxWithFaceUV(w,h,.22,m,[4,5]),r()*10,inten,slot);
        if(slot)selected.push({slot,position:[x,y+h/2,zz],size:[w,h],atlasIndex:atlas.vertical.indexOf(m)});
        g.translate(x, y + h / 2, zz);
        geos.push(g);
        halos.push({ pos: new THREE.Vector3(x, y + h / 2, zz + 0.4), size: new THREE.Vector2(w * 3.2, h * 1.5), color:m.color,inten:0.11*inten/3,lifeSlot:slot });
        y += h + r.range(0.6, 6) * scale;
      }
    }
    // horizontal facade signs facing the street above shops
    if (dist < 400 && r.chance(0.8)) {
      const m = r.pick(atlas.horizontal);
      const w = Math.min(b.sz * 0.7, r.range(4, 7)), h = w / m.aspect;
      const g = withSignAttr(boxWithFaceUV(0.18, h, w, m, [b.side < 0 ? 0 : 1]), r() * 10, r.range(1.2, 2.0) * gain, 0);
      g.translate(b.fx - b.side * 0.12, 4.6 + h / 2 + r.range(0, 2.5), b.cz + r.range(-1, 1));
      geos.push(g);
    }
  }
  const mesh = new THREE.Mesh(npMerge(geos), emissiveAtlasMaterial(atlas.tex, 'sign'));
  mesh.userData.ambientSigns=selected;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- shopfronts and awnings
export function buildShops(scene, fronts, shopAtlas, halos) {
  const r = rng(P.seed + 9);
  const shopGeos = [], awnGeos = [];
  for (const b of fronts) {
    const dist = -b.cz;
    if (dist > 420 || b.side === 0) continue;
    if (b.side > 0 && b.z0 > -40 && b.z1 < 0) continue; // food stall zone handled separately
    const len = Math.abs(b.z0 - b.z1) - 1.2;
    const nSeg = Math.max(1, Math.round(len / 4.5));
    const segL = len / nSeg;
    for (let s = 0; s < nSeg; s++) {
      const zc = b.z0 - 0.6 - segL * (s + 0.5);
      let cell = r.pick(shopAtlas.cells);
      let inten = r.range(0.7, 1.6);
      if (b.dark) { if (b.cz > -45 || r() > 0.35) continue; cell = shopAtlas.cells[3]; inten = 1.1; }
      if (cell.kind === 'shutter') inten *= 0.35;
      const g = withSignAttr(boxWithFaceUV(0.1, 3.2, segL - 0.5, cell, [b.side < 0 ? 0 : 1]), 0, inten * P.light.stallGain, 0);
      g.translate(b.fx - b.side * 0.06, 0.3 + 1.6, zc);
      shopGeos.push(g);
      if (!b.dark && r.chance(0.6)) {
        const aw = new THREE.BoxGeometry(1.6, 0.06, segL - 0.3);
        aw.rotateZ(b.side * -0.32);
        aw.translate(b.fx - b.side * 0.8, 3.75, zc);
        awnGeos.push(aw);
      }
      if (!b.dark && dist < 160 && r.chance(0.35)) halos.push({ pos: new THREE.Vector3(b.fx - b.side * 1.2, 2, zc), size: new THREE.Vector2(5, 4), color: cell.color, inten: 0.05 * inten });
    }
  }
  const shops = new THREE.Mesh(npMerge(shopGeos), emissiveAtlasMaterial(shopAtlas.tex, 'shop'));
  shops.frustumCulled = false; scene.add(shops);
  const awnMat = patchFog(new THREE.MeshStandardMaterial({ color: 0x1a1316, roughness: 0.6 }), { key: 'awn' });
  const awn = new THREE.Mesh(npMerge(awnGeos), awnMat); scene.add(awn);
}

// ---------------------------------------------------------------- food stalls (right foreground)
export function buildStalls(scene, shopAtlas, halos, steamEmitters) {
  const r = rng(P.seed + 13);
  const z0 = -4, z1 = -40;
  const gain = P.light.stallGain;
  const lantern = col(P.palette.lantern), amber = col(P.palette.amber);
  // interior back wall glowing
  const back = [];
  for (let z = z0; z > z1; z -= 4.5) {
    const cell = shopAtlas.cells[r.pick([0, 4, 6, 7])];
    back.push(withSignAttr(boxWithFaceUV(0.1, 3.0, 4.3, cell, [1]), 0, r.range(0.55, 0.95) * gain, 0).translate(RIGHT_X - 0.05, 1.7, z - 2.25));
  }
  const backMesh = new THREE.Mesh(npMerge(back), emissiveAtlasMaterial(shopAtlas.tex, 'stallback'));
  scene.add(backMesh);
  // canopy, counters, posts, stools
  const wood = patchFog(new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.55 }), { key: 'wood' });
  const metal = patchFog(new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.35, metalness: 0.7 }), { key: 'metal' });
  const canopyMat = patchFog(new THREE.MeshStandardMaterial({ color: 0x24161a, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide, emissive: new THREE.Color(0.25, 0.09, 0.03), emissiveIntensity: 0.06 * gain }), { key: 'canopy' });
  const cg = [], wg = [], mg = [];
  const canopy = new THREE.BoxGeometry(4.6, 0.05, Math.abs(z1 - z0));
  canopy.rotateZ(-0.2); canopy.translate(RIGHT_X - 2.1, 3.25, (z0 + z1) / 2); cg.push(canopy);
  for (let z = z0; z > z1; z -= 3.0) {
    mg.push(new THREE.CylinderGeometry(0.05, 0.05, 2.85, 6).translate(RIGHT_X - 4.2, 1.42, z));
  }
  for (let z = z0 - 0.5; z > z1 + 1; z -= 4.5) {
    wg.push(new RoundedBoxGeometry(0.9, 1.05, 4.0, 2, 0.05).translate(RIGHT_X - 2.4, 0.525, z - 2));
    wg.push(new THREE.BoxGeometry(1.2, 0.06, 4.1).translate(RIGHT_X - 2.5, 1.08, z - 2));
    for (let k = 0; k < 3; k++) mg.push(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12).translate(RIGHT_X - 3.3, 0.72, z - 0.8 - k * 1.3), new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5).translate(RIGHT_X - 3.3, 0.35, z - 0.8 - k * 1.3));
    steamEmitters.push({ pos: new THREE.Vector3(RIGHT_X - 1.4, 1.4, z - 2 + r.range(-1, 1)), color: amber.clone().multiplyScalar(0.9), rate: r.range(0.8, 1.2), height: 5, spread: 1.0 });
  }
  scene.add(new THREE.Mesh(npMerge(cg), canopyMat));
  scene.add(new THREE.Mesh(npMerge(wg), wood));
  scene.add(new THREE.Mesh(npMerge(mg), metal));
  // lanterns: paper globes with ribs
  const lanternMat = shaderMat({
    uniforms: { uGain: { value: 1.25 * gain } },
    vertex: `attribute vec3 aCol; varying vec3 vCol; varying vec3 vN; varying vec3 vP; varying vec3 vNpW;
      void main(){ vCol = aCol; vP = position; vN = normalize(normalMatrix*normal);
        vec4 w = instanceMatrix * vec4(position,1.0); w.x += sin(uTime*0.9 + w.z)*0.02; vNpW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragment: `uniform float uGain; varying vec3 vCol; varying vec3 vN; varying vec3 vP; varying vec3 vNpW;
      void main(){ float ribs = 0.75 + 0.25*smoothstep(0.0,0.25,abs(fract(vP.y*7.0)-0.5));
        float core = 0.55 + 0.45*abs(vN.z);
        vec3 c = vCol * uGain * ribs * core;
        c *= 1.0 - 0.85*smoothstep(0.42, 0.5, abs(vP.y));
        gl_FragColor = vec4(npApplyFog(c, vNpW)*0.0 + c*(1.0-npFogAmtD(vNpW, npFogDensity*0.6)) + npFogCol(normalize(vNpW-npCamPos), vNpW.y)*npFogAmt(vNpW), 1.0); }`,
  });
  const lg = new THREE.SphereGeometry(0.2, 16, 12); lg.scale(1, 1.3, 1);
  const lanterns = [];
  for (let z = z0 - 0.6; z > z1; z -= r.range(1.6, 3.6)) lanterns.push(new THREE.Vector3(RIGHT_X - 4.15 + r.range(-0.1, 0.1), 2.55 + r.range(-0.15, 0.1), z));
  const lm = new THREE.InstancedMesh(lg, lanternMat, lanterns.length);
  const aCol = new Float32Array(lanterns.length * 3);
  lanterns.forEach((p, i) => {
    lm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
    const c = r.chance(0.75) ? lantern : amber; aCol.set([c.r, c.g, c.b], i * 3);
    halos.push({ pos: p.clone().add(new THREE.Vector3(0, 0, 0.3)), size: new THREE.Vector2(1.6, 1.6), color: c, inten: 0.12 });
  });
  lg.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  scene.add(lm);
  // warm lights under the canopy
  for (let z = z0 - 3; z > z1; z -= 9) addLight(scene, new THREE.Vector3(RIGHT_X - 3.0, 2.6, z), amber, 45 * gain, { shaderGain: 1.0 });
  return { lanterns };
}

// ---------------------------------------------------------------- cables, string lights, AC units, bridge
export function buildDetails(scene, fronts, halos) {
  const r = rng(P.seed + 21);
  const cables = [];
  for (let z = -10; z > -260; z -= r.range(4, 14)) {
    const n = r.int(1, 3);
    for (let k = 0; k < n; k++) {
      const y0 = r.range(7, 26), y1 = y0 + r.range(-3, 3), z2 = z + r.range(-6, 6);
      const a = new THREE.Vector3(LEFT_X, y0, z), b = new THREE.Vector3(RIGHT_X, y1, z2);
      const mid = a.clone().lerp(b, 0.5); mid.y -= r.range(0.6, 2.5);
      cables.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, r.range(0.025, 0.05), 4));
    }
  }
  for (let k = 0; k < 6; k++) {
    const x = RIGHT_X - 0.4, y = r.range(5, 14);
    cables.push(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y + r.range(-1, 1), -200)), 2, 0.04, 4));
  }
  const cableMat = patchFog(new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.5 }), { key: 'cable' });
  scene.add(new THREE.Mesh(npMerge(cables), cableMat));

  // string lights above the stalls and across the street
  const bulbs = [];
  const strands = [
    [new THREE.Vector3(RIGHT_X, 7, -12), new THREE.Vector3(LEFT_X + 6, 9.5, -26), 1.4],
    [new THREE.Vector3(RIGHT_X, 8.5, -30), new THREE.Vector3(LEFT_X, 9, -48), 1.6],
    [new THREE.Vector3(RIGHT_X, 10, -55), new THREE.Vector3(LEFT_X, 11, -66), 1.6]];
  for (const [a, b, sag] of strands) {
    const n = Math.floor(a.distanceTo(b) / 0.9);
    for (let i = 1; i < n; i++) {
      const t = i / n; const p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag; bulbs.push(p);
    }
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.3).multiplyScalar(4) });
  patchFog(bulbMat, { key: 'bulb', emissiveVar: 'gl_FragColor.rgb' });
  const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), bulbMat, bulbs.length);
  bulbs.forEach((p, i) => { bm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)); if (i % 2 === 0) halos.push({ pos: p, size: new THREE.Vector2(0.9, 0.9), color: new THREE.Color(1, 0.6, 0.3), inten: 0.16 }); });
  scene.add(bm);

  // AC units / boxes on facades
  const ac = [];
  for (const b of fronts) {
    if (-b.cz > 260 || b.side === 0) continue;
    const n = b.dark ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(0.6, 0.65, 1.0);
      g.translate(b.fx - b.side * 0.3, r.range(5, Math.min(b.h - 2, 45)), r.range(b.z1 + 0.6, b.z0 - 0.6));
      ac.push(g);
    }
    // vertical drain pipes
    if (r.chance(0.6)) ac.push(new THREE.CylinderGeometry(0.09, 0.09, Math.min(b.h, 60), 6).translate(b.fx - b.side * 0.15, Math.min(b.h, 60) / 2, b.z0 - 0.4));
  }
  // cornice ledges: real depth lines on the nearer facades (top of the base storey, then every few floors)
  for (const b of fronts) {
    if (-b.cz > 220 || b.side === 0) continue;
    const L = Math.abs(b.z0 - b.z1);
    for (let k = 0, y = 1.5 * b.floorH; y < Math.min(b.h - 3, 70); k++, y += b.floorH * (b.style === 1 ? 6 : 4)) {
      const d = k === 0 ? 0.5 : 0.3;
      ac.push(new THREE.BoxGeometry(d, k === 0 ? 0.34 : 0.22, L).translate(b.fx - b.side * d / 2, y - 0.1, b.cz));
    }
  }
  const acMat = patchFog(new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.45, metalness: 0.5 }), { key: 'ac' });
  scene.add(new THREE.Mesh(npMerge(ac), acMat));

  // skybridge across the canyon
  const bridgeMat = patchFog(new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.4, metalness: 0.6 }), { key: 'bridge' });
  const bridges = [];
  for (const [z, y] of [[-150, 34], [-320, 62], [-520, 48]]) {
    bridges.push(new THREE.BoxGeometry(RIGHT_X - LEFT_X + 8, 3.2, 5).translate((LEFT_X + RIGHT_X) / 2, y, z));
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(RIGHT_X - LEFT_X + 8, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.95, 1.0).multiplyScalar(2.2) }));
    patchFog(strip.material, { key: 'strip', emissiveVar: 'gl_FragColor.rgb' });
    strip.position.set((LEFT_X + RIGHT_X) / 2, y + 0.2, z + 2.52); scene.add(strip);
    halos.push({ pos: new THREE.Vector3((LEFT_X + RIGHT_X) / 2, y + 0.2, z + 3), size: new THREE.Vector2(26, 6), color: new THREE.Color(0.3, 0.9, 1), inten: 0.07 });
  }
  scene.add(new THREE.Mesh(npMerge(bridges), bridgeMat));
}

// ---------------------------------------------------------------- holographic billboards
export function buildHolos(scene, halos) {
  const mat = shaderMat({
    uniforms: { uGain: { value: 1.5 * P.light.signGain }, uMag: { value: col(P.palette.magenta) }, uCyan: { value: col(P.palette.cyan) } },
    transparent: false,
    vertex: `attribute float aSeed; varying float vSeed; varying vec2 vUv; varying vec3 vNpW;
      void main(){ vUv = uv; vSeed = aSeed; vec4 w = modelMatrix*vec4(position,1.0); vNpW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragment: `uniform float uGain; uniform vec3 uMag, uCyan; varying float vSeed; varying vec2 vUv; varying vec3 vNpW;
      void main(){
        vec2 uv = vUv; float t = uTime*0.22 + vSeed*10.0;
        float w = sin(uv.y*5.0 + t*2.0 + sin(uv.x*3.5 - t)*1.6)*0.5+0.5;
        vec3 c = mix(uMag, uCyan, w);
        // flowing ribbon figure + glyph columns (no target/ring motif)
        float cx = 0.5 + 0.22*sin(uv.y*3.2 + t*1.4) + 0.06*sin(uv.y*9.0 - t);
        float wid = 0.07 + 0.05*sin(uv.y*6.0 + t);
        float ribbon = smoothstep(wid, wid*0.4, abs(uv.x - cx)) * smoothstep(0.08, 0.2, uv.y) * smoothstep(0.84, 0.7, uv.y);
        vec2 gc = floor(uv * vec2(9.0, 26.0));
        float glyph = step(0.55, npHash(gc + floor(t*0.5))) * step(0.25, fract(uv.x*9.0)) * step(0.3, fract(uv.y*26.0));
        glyph *= step(uv.x, 0.24) + step(0.78, uv.x);
        float shape = ribbon + glyph*0.35;
        c = c * (0.14 + 1.0*shape);
        float lines = 0.82 + 0.18*sin(uv.y*140.0 - uTime*3.0);
        float fwl = fwidth(uv.y*140.0); lines = mix(lines, 0.9, smoothstep(0.5, 2.0, fwl));
        c *= lines;
        float bars = step(0.86, uv.y) * step(fract(uv.x*7.0 + floor(t*2.0)*0.37), 0.6) * 0.9;
        c += uCyan * bars * 0.6;
        float edge = 1.0 - smoothstep(0.0, 0.02, min(min(uv.x, 1.0-uv.x), min(uv.y, 1.0-uv.y)));
        c += vec3(0.8,0.95,1.0) * edge * 0.9;
        c *= uGain * (0.92 + 0.08*npNoise(vec2(uTime*6.0, vSeed)));
        float fe = npFogAmtD(vNpW, npFogDensity*0.62);
        gl_FragColor = vec4(c*(1.0-fe) + npFogCol(normalize(vNpW-npCamPos), vNpW.y)*npFogAmt(vNpW), 1.0);
      }`,
  });
  const defs = [[RIGHT_X - 1.0, 30, -96, 9, 15], [LEFT_X - 0.5, 42, -230, 12, 20], [RIGHT_X + 2, 80, -380, 18, 30]];
  defs.forEach(([x, y, z, w, h], i) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(4).fill(i * 1.37), 1));
    const m = new THREE.Mesh(g, mat); m.position.set(x - (x > 0 ? w / 2 : -w / 2), y, z); scene.add(m);
    halos.push({ pos: new THREE.Vector3(m.position.x, y, z + 1), size: new THREE.Vector2(w * 2.2, h * 1.6), color: new THREE.Color(0.7, 0.4, 1.0), inten: 0.06 });
  });
}
