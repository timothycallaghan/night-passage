import * as THREE from 'three';
import { rng } from './util.js';

// All imagery here is generated procedurally at runtime: original pseudo-script glyphs,
// generic shop words and Barlow Condensed (SIL OFL 1.1, self-hosted).

export const PALETTE = {
  // Parker ART-DIRECTION v1 palette roles: cyan = depth, amber = life, magenta = punctuation.
  magenta: '#d65cc4', pink: '#e36582', cyan: '#45c7ec', teal: '#4fd6e4', amber: '#f0a356',
  red: '#e0584f', violet: '#8f7ae0', white: '#f8f0e6', lime: '#9fe0b0',
};
const NEON = ['cyan', 'cyan', 'cyan', 'cyan', 'teal', 'teal', 'magenta', 'magenta', 'pink', 'amber', 'white', 'violet'];
const WORDS_V = ['HOTEL', 'RAMEN', 'BAR', 'OPEN', '24H', 'KARAOKE', 'NOODLE', 'CLINIC', 'ARCADE', 'MOTEL', 'SUSHI', 'REPAIR', 'DATA', 'LIVE', 'TEA', 'DUMPLING', 'CAFE', 'SOBA', 'GAMES', 'PAWN', 'LOANS', 'DINER', 'NIGHT', 'IMPLANT'];
const WORDS_H = ['NOODLE HOUSE', 'OPEN ALL NIGHT', 'CYBER REPAIR', 'HOT POT', 'LIVE MUSIC', 'NO VACANCY', 'MEDICAL', 'KOI CAFE', 'DATA BAR', 'PHARMACY', 'NIGHT MARKET', 'GRILL', 'LOUNGE', 'ROBOTICS', 'DREAMS', 'TATTOO'];

export function glyph(ctx, x, y, s, r) {
  // Original squarish pseudo-glyph: 3-6 strokes on a 4x4 lattice.
  const n = 3 + Math.floor(r() * 4);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const horiz = r() < 0.5;
    const a = Math.floor(r() * 5) / 4, b0 = Math.floor(r() * 3) / 4, b1 = b0 + (1 + Math.floor(r() * 2)) / 4;
    if (horiz) { ctx.moveTo(x + b0 * s, y + a * s); ctx.lineTo(x + Math.min(b1, 1) * s, y + a * s); }
    else { ctx.moveTo(x + a * s, y + b0 * s); ctx.lineTo(x + a * s, y + Math.min(b1, 1) * s); }
  }
  if (r() < 0.3) { ctx.moveTo(x + s * 0.5 + s * 0.18, y + s * 0.5); ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.18, 0, Math.PI * 2); }
  ctx.stroke();
}

function neonStroke(ctx, color, w, drawFn) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = w * 4;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w * 1.9; ctx.globalAlpha = 0.85;
  drawFn();
  ctx.shadowBlur = w * 1.5; ctx.globalAlpha = 1;
  ctx.strokeStyle = mixWhite(color, 0.55); ctx.fillStyle = mixWhite(color, 0.55); ctx.lineWidth = w * 0.8;
  drawFn();
  ctx.restore();
}
function mixWhite(hex, t) {
  const c = new THREE.Color(hex); c.lerp(new THREE.Color(1, 1, 1), t); return '#' + c.getHexString();
}

export async function loadFonts() {
  const faces = [
    new FontFace('BarlowC', 'url(fonts/barlow-condensed-latin-500-normal.woff2)', { weight: '500' }),
    new FontFace('BarlowC', 'url(fonts/barlow-condensed-latin-700-normal.woff2)', { weight: '700' }),
  ];
  for (const f of faces) { await f.load(); document.fonts.add(f); }
}

// Sign atlas: 2048x2048. Top 1536px: 16 x 3 vertical signs (128x512). Bottom 512: 4 x 4 horizontal (512x128).
export function makeSignAtlas(seed = 7) {
  const r = rng(seed);
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 2048;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2048, 2048);
  const meta = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 16; col++) {
    const x = col * 128, y = row * 512, cname = r.pick(NEON), color = PALETTE[cname];
    const type = r() < 0.38 ? 'box' : 'tube';
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, 128, 512); ctx.clip();
    if (type === 'box') {
      // Backlit lightbox: bright panel, dark lettering.
      const g = ctx.createLinearGradient(x, y, x, y + 512);
      g.addColorStop(0, mixWhite(color, 0.25)); g.addColorStop(0.5, color); g.addColorStop(1, mixWhite(color, 0.15));
      ctx.fillStyle = g; ctx.fillRect(x + 6, y + 6, 116, 500);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let k = 0; k < 500; k += 6) ctx.fillRect(x + 6, y + 6 + k, 116, 1);
      ctx.fillStyle = '#07040a'; ctx.strokeStyle = '#07040a'; ctx.lineWidth = 7; ctx.lineCap = 'square';
      fillContent(ctx, r, x, y, true);
    } else {
      ctx.fillStyle = '#06070b'; ctx.fillRect(x + 4, y + 4, 120, 504);
      neonStroke(ctx, color, 3.2, () => { roundRect(ctx, x + 12, y + 12, 104, 488, 10); ctx.stroke(); });
      neonStroke(ctx, r.chance(0.5) ? color : PALETTE[r.pick(NEON)], 3.6, () => fillContent(ctx, r, x, y, false));
    }
    ctx.restore();
    meta.push({ u0: x / 2048, v0: 1 - (y + 512) / 2048, u1: (x + 128) / 2048, v1: 1 - y / 2048, color: new THREE.Color(color), aspect: 0.25 });
  }
  const hmeta = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const x = col * 512, y = 1536 + row * 128, cname = r.pick(NEON), color = PALETTE[cname];
    const word = WORDS_H[(row * 4 + col) % WORDS_H.length];
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, 512, 128); ctx.clip();
    if (r() < 0.4) {
      ctx.fillStyle = color; ctx.fillRect(x + 6, y + 6, 500, 116);
      ctx.fillStyle = '#060308'; ctx.font = '700 84px BarlowC'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(word, x + 256, y + 68, 470);
    } else {
      ctx.fillStyle = '#05060a'; ctx.fillRect(x + 4, y + 4, 504, 120);
      neonStroke(ctx, color, 3, () => { roundRect(ctx, x + 10, y + 10, 492, 108, 14); ctx.stroke(); });
      ctx.font = '500 78px BarlowC'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      neonStroke(ctx, color, 3, () => ctx.fillText(word, x + 256, y + 68, 450));
    }
    ctx.restore();
    hmeta.push({ u0: x / 2048, v0: 1 - (y + 128) / 2048, u1: (x + 512) / 2048, v1: 1 - y / 2048, color: new THREE.Color(color), aspect: 4 });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, vertical: meta, horizontal: hmeta };
}

function fillContent(ctx, r, x, y, dark) {
  const mode = r();
  if (mode < 0.5) {
    // Stacked letters of a generic word.
    const w = r.pick(WORDS_V);
    const n = w.length; const step = Math.min(84, 460 / n);
    ctx.font = `${dark ? 700 : 500} ${Math.floor(step * 1.02)}px BarlowC`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) ctx.fillText(w[i], x + 64, y + 40 + step * (i + 0.5) + (480 - step * n) / 2 - 16);
  } else {
    ctx.lineWidth = dark ? 7 : 3.4;
    const n = 4 + Math.floor(r() * 3); const s = 66; const gap = (470 - n * s) / (n + 1);
    for (let i = 0; i < n; i++) glyph(ctx, x + 31, y + 22 + gap + i * (s + gap), s, r);
    if (r() < 0.5) { ctx.font = `${dark ? 700 : 500} 30px BarlowC`; ctx.textAlign = 'center'; ctx.fillText(r.pick(['24H', 'OPEN', 'B2', 'NO.7', '2F']), x + 64, y + 486); }
  }
}

function roundRect(ctx, x, y, w, h, rr) {
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

// Shop interiors: 2048x1024, 4x2 cells of 512x512. Linear-light "emissive" pictures.
export function makeShopAtlas(seed = 11) {
  const r = rng(seed);
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024;
  const ctx = cv.getContext('2d');
  const kinds = ['noodle', 'store', 'bar', 'shutter', 'warm', 'tech', 'noodle', 'warm'];
  const meta = [];
  kinds.forEach((k, i) => {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 512;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, 512, 512); ctx.clip();
    const base = { noodle: ['#ffb259', '#7a3a10'], store: ['#dff4ff', '#4a6a80'], bar: ['#ff3fbf', '#3a0a40'], shutter: ['#2a2f38', '#0b0d12'], warm: ['#ffc77a', '#5a2a0a'], tech: ['#4ff0ff', '#0a3048'] }[k];
    const g = ctx.createLinearGradient(x, y, x, y + 512); g.addColorStop(0, base[0]); g.addColorStop(1, base[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, 512, 512);
    if (k === 'shutter') {
      for (let s = 0; s < 512; s += 14) { ctx.fillStyle = s % 28 ? '#151820' : '#2b303a'; ctx.fillRect(x, y + s, 512, 7); }
      ctx.fillStyle = 'rgba(255,190,90,0.5)'; ctx.fillRect(x, y + 470, 512, 42);
    } else {
      // ceiling light strip
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x + 20, y + 18, 472, 10);
      // shelves / goods
      for (let s = 0; s < 4; s++) {
        const sy = y + 90 + s * 82;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + 10, sy + 54, 492, 8);
        for (let b = 0; b < 26; b++) {
          const bx = x + 16 + b * 18 + r() * 4, bh = 18 + r() * 34;
          ctx.fillStyle = r() < 0.6 ? `rgba(20,10,6,${0.6 + r() * 0.3})` : `hsla(${20 + r() * 30},${40 + r() * 30}%,${35 + r() * 25}%,0.9)`;
          ctx.fillRect(bx, sy + 54 - bh, 12, bh);
        }
      }
      // counter and silhouettes
      ctx.fillStyle = 'rgba(10,6,4,0.85)'; ctx.fillRect(x, y + 400, 512, 112);
      for (let p = 0; p < 2 + Math.floor(r() * 3); p++) {
        const px = x + 60 + r() * 380, sc = 0.8 + r() * 0.4;
        ctx.fillStyle = 'rgba(8,5,4,0.92)';
        ctx.beginPath(); ctx.arc(px, y + 300 * 1, 26 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(px - 40 * sc, y + 330, 80 * sc, 90);
      }
      if (k === 'noodle' || k === 'warm') {
        for (let s = 0; s < 6; s++) { ctx.fillStyle = 'rgba(255,240,220,0.18)'; ctx.beginPath(); ctx.ellipse(x + 80 + s * 70, y + 380, 30, 60, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
    meta.push({ u0: x / 2048, v0: 1 - (y + 512) / 1024, u1: (x + 512) / 2048, v1: 1 - y / 1024, kind: k, color: new THREE.Color(base[0]) });
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, cells: meta };
}

// Soft radial sprite for halos/bulbs.
export function makeRadial(size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); return t;
}
