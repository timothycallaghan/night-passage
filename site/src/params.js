// Every art-direction knob for Night Passage lives here.
// Override any value at runtime with a URL hash, e.g.
//   index.html#fog.density=0.006&bloom.strength=1.1&camera.fov=48
// Colours are linear-ish RGB triples (0..1), applied before tone mapping.

export const PARAMS = {
  seed: 20261115,
  // Linear RGB. Display targets from Parker's ART-DIRECTION v1 (sRGB): cyan #45C7EC, magenta #D872C7,
  // amber #F0A356, haze #3C6A87, building #060A0E, lamp core #F8F0E6.
  palette: {
    magenta: [0.69, 0.17, 0.57], cyan: [0.06, 0.57, 0.84], amber: [0.87, 0.37, 0.09],
    lantern: [1.0, 0.42, 0.13], warmWindow: [1.0, 0.55, 0.22], coolWindow: [0.62, 0.80, 1.0],
  },
  fog: {
    color: [0.010, 0.022, 0.036],     // base haze, everywhere
    glow: [0.030, 0.080, 0.135],      // cool haze toward the vanishing point (#3C6A87 on screen)
    glow2: [0.080, 0.022, 0.066],     // faint magenta city glow low in the canyon
    density: 0.0086,                  // per metre after start
    start: 15,                        // metres before blending begins (sheet: 12-20 m)
  },
  light: {
    exposure: 1.0,
    toneMapping: 'ACES',              // ACES | AgX | Neutral
    hemiSky: [0.05, 0.08, 0.12], hemiGround: [0.03, 0.02, 0.03], hemiIntensity: 0.5,
    envIntensity: 0.45,
    windowGain: 1.0, signGain: 1.0, stallGain: 1.0,
  },
  // Compact halo: 3-8 px at 1440 wide, sharp cores. Threshold in scene-linear units.
  bloom: { strength: 0.55, radius: 0.18, threshold: 1.0 },
  grade: {
    vignette: 0.14,                   // max corner darkening (sheet: <= 10-15%)
    grain: 0.008,                     // ~0.8% luminance, static-ish
    aberration: 0.0,
    lift: [0.002, 0.004, 0.007],      // cool shadows
    gain: [1.02, 0.99, 0.98],         // warm highlights
    saturation: 1.0, contrast: 1.04,
  },
  // Eye height 1.6 m, vertical FOV 42, level camera (upright verticals). vp = where the street
  // vanishing point lands on screen (fractions from top-left), achieved with lens shift.
  camera: {
    desktop: { pos: [3.3, 1.6, 6.0], yaw: 0.0, fov: 42, vp: [0.66, 0.64], drift: 0 },
    mobile: { pos: [3.6, 1.6, 6.0], yaw: 0.0, fov: 62, vp: [0.72, 0.62], drift: 0 },
  },
  // Primary vehicle: world position/yaw tuned so it lands around screen x 52-68%, y 24-39% at 1440x900.
  hero: { pos: [2.1, 6.6, -15.5], yaw: 0.38, scale: 1.0, driftX: 0.5 },
  // Portrait: comparable apparent craft size/height; same model scale, closer world position.
  heroMobile: { pos: [3.0, 7.8, -12], yaw: 0.38, scale: 1, driftX: 0.5 },
  rain: { count: 7000, opacity: 0.45, speed: 15.0, wind: 1.2 },
  ground: { reflect: 1.0, puddles: 0.5, streak: 1.0, ripple: 1.0 },
  life: { people: 70, vehicles: 5 },
};

export const PRESETS = {
  high: { reflectionScale: 0.5, pixelRatio: 1, rain: true, bloom: true, steam: true, walk: true, vehicles: 5, people: 70, liveReflection: true, buildingsFar: 1.0 },
  low: { reflectionScale: 0.35, pixelRatio: 1.25, rain: false, bloom: false, steam: false, walk: false, vehicles: 1, people: 12, liveReflection: false, buildingsFar: 0.6 },
};

export function applyHashOverrides(target = PARAMS) {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  for (const kv of h.split('&')) {
    const [k, v] = kv.split('=');
    if (!k || v === undefined) continue;
    const path = decodeURIComponent(k).split('.');
    let o = target;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]] ??= {};
    let val = decodeURIComponent(v);
    try { val = JSON.parse(val); } catch { /* string */ }
    o[path.at(-1)] = val;
  }
}
