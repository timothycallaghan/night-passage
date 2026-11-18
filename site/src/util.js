import * as THREE from 'three';

// Deterministic PRNG so every capture is the same city.
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a0, b0) => a0 + (b0 - a0) * f();
  f.int = (a0, b0) => Math.floor(f.range(a0, b0 + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

// Global uniforms shared by every material (one update per frame).
export const G = {
  uTime: { value: 0 },
  npFogColor: { value: new THREE.Color(0.010, 0.017, 0.026) },
  npGlowColor: { value: new THREE.Color(0.055, 0.085, 0.115) },
  npGlow2: { value: new THREE.Color(0.10, 0.035, 0.085) },
  npFogDensity: { value: 0.0086 },
  npFogStart: { value: 15.0 },
  npCamPos: { value: new THREE.Vector3() },
  npVpDir: { value: new THREE.Vector3(0.05, 0.0, -1).normalize() },
  // Up to 12 "important" lights used by custom shaders (ground, rain, people rim)
  npLightPos: { value: Array.from({ length: 12 }, () => new THREE.Vector3(0, -999, 0)) },
  npLightCol: { value: Array.from({ length: 12 }, () => new THREE.Vector3()) },
};

export const NOISE = /* glsl */`
float npHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float npHash3(vec3 p){ return npHash(p.xy + p.z*17.13); }
vec2 npHash2(vec2 p){ float n = npHash(p); return vec2(n, npHash(p + n + 3.1)); }
float npNoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(npHash(i), npHash(i+vec2(1,0)), u.x), mix(npHash(i+vec2(0,1)), npHash(i+vec2(1,1)), u.x), u.y); }
float npFbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*npNoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
`;

export const FOG = /* glsl */`
uniform vec3 npFogColor; uniform vec3 npGlowColor; uniform vec3 npGlow2; uniform float npFogDensity; uniform float npFogStart;
uniform vec3 npCamPos; uniform vec3 npVpDir; uniform float uTime;
vec3 npFogCol(vec3 dir, float wy){
  float a = max(dot(dir, npVpDir), 0.0);
  float g = pow(a, 5.0);
  float low = exp(-max(wy, 0.0) / 140.0);
  return npFogColor + npGlowColor * (0.25 + 0.75*g) * (0.35 + 0.65*low) + npGlow2 * pow(a, 14.0) * low;
}
float npFogAmtD(vec3 wp, float dens){
  // Art direction: blending starts ~15 m, ~30% at 60 m, ~70% at 140 m; capped so far layers survive.
  float dist = length(wp - npCamPos);
  // Clearer local subjects, slightly denser distant air; smooth depth strata.
  float range = max(dist - npFogStart, 0.0);
  float depthDensity = mix(0.74, 1.10, smoothstep(25.0, 240.0, dist));
  float f = 1.0 - exp(-range * dens * depthDensity);
  float h = mix(0.82, 1.04, exp(-max(wp.y, 0.0) / 110.0));
  return clamp(f * h, 0.0, 0.95);
}
float npFogAmt(vec3 wp){ return npFogAmtD(wp, npFogDensity); }
vec3 npApplyFog(vec3 col, vec3 wp){
  vec3 dir = normalize(wp - npCamPos);
  return mix(col, npFogCol(dir, wp.y), npFogAmt(wp));
}
`;

export const LIGHTS = /* glsl */`
uniform vec3 npLightPos[12]; uniform vec3 npLightCol[12];
vec3 npPointLights(vec3 wp, vec3 n, float wrap){
  vec3 acc = vec3(0.0);
  for (int i=0;i<12;i++){
    vec3 L = npLightPos[i] - wp; float d2 = dot(L,L);
    float ndl = clamp((dot(n, L*inversesqrt(d2)) + wrap) / (1.0 + wrap), 0.0, 1.0);
    acc += npLightCol[i] * ndl / (d2 + 1.0);
  }
  return acc;
}
`;

// Patch a built-in material: world position varying, custom fog, optional emissive-preserving fog.
export function patchFog(mat, { key = '', vertexPre = '', vertexMain = '', fragPre = '', fragMain = '', emissiveVar = null, uniforms = {} } = {}) {
  mat.fog = false;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, G, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vNpW;\nuniform float uTime;\n${NOISE}\n${vertexPre}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 npW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          npW = instanceMatrix * npW;
        #endif
        npW = modelMatrix * npW; vNpW = npW.xyz;
        ${vertexMain}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vNpW;\n${NOISE}\n${FOG}\n${fragPre}`)
      .replace('#include <fog_fragment>', emissiveVar
        ? `{ vec3 npE = ${emissiveVar}; vec3 npBase = max(gl_FragColor.rgb - npE, 0.0);
             vec3 npDir = normalize(vNpW - npCamPos);
             gl_FragColor.rgb = mix(npBase, npFogCol(npDir, vNpW.y), npFogAmt(vNpW)) + npE * (1.0 - npFogAmtD(vNpW, npFogDensity*0.62)); }`
        : `gl_FragColor.rgb = npApplyFog(gl_FragColor.rgb, vNpW);`);
    if (fragMain) sh.fragmentShader = fragMain(sh.fragmentShader);
    mat.userData.shader = sh;
  };
  mat.customProgramCacheKey = () => 'np-' + key;
  return mat;
}

export function shaderMat({ vertex, fragment, uniforms = {}, ...opts }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...G, ...uniforms },
    vertexShader: `uniform float uTime;\n${NOISE}\n${vertex}`,
    fragmentShader: `${NOISE}\n${FOG}\n${fragment}`,
    ...opts,
  });
}
