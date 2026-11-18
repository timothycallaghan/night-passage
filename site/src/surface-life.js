// Sparse authored ambient events. No RNG is consumed and scene time is never reset.
// Low holds these effects at t=0 because its wet reflection is baked.
export const LIFE = { uAmbientLife: { value: 1 }, uTVTimeScale: { value: 1 } };
export const ROOMS = [
  { name: 'left-near-room', seed: 0.9589983224868774, cell: [2,3], slot: 1, first: 124, on: 242, period: 661, fade: 1.8 },
  { name: 'left-tv-room', seed: 0.48319485783576965, cell: [4,3], slot: 4, tv: true },
  { name: 'left-middle-room', seed: 0.4926784038543701, cell: [3,5], slot: 2, first: 207, on: 303, period: 787, fade: 2.2 },
  { name: 'left-far-room', seed: 0.6436777114868164, cell: [3,6], slot: 3, first: 291, on: 263, period: 719, fade: 1.5 },
];
export const NEON_EVENTS = [
  { slot: 1, first: 47, period: 311, dips: [[0,.10,.24,.42,.58],[.60,.70,.85,1.04,.26]] },
  { slot: 2, first: 173, period: 389, dips: [[0,.14,.31,.51,.46],[.71,.79,.96,1.15,.22]] },
];
const f=n=>Number.isInteger(n)?n+'.0':String(n);
const smooth=(a,b,x)=>{x=Math.max(0,Math.min(1,(x-a)/(b-a)));return x*x*(3-2*x)};
export function roomLevel(slot,t){const r=ROOMS.find(r=>r.slot===slot);if(!r||r.tv)return 1;const q=((t-r.first)%r.period+r.period)%r.period;return .06+.94*smooth(0,r.fade,q)*(1-smooth(r.on,r.on+r.fade,q));}
export function neonLevel(slot,t){const r=NEON_EVENTS.find(r=>r.slot===slot);if(!r)return 1;const q=((t-r.first)%r.period+r.period)%r.period;return 1-r.dips.reduce((v,[a,b,c,d,depth])=>v+depth*smooth(a,b,q)*(1-smooth(c,d,q)),0);}
export const LIFE_GLSL = `
uniform float uAmbientLife; uniform float uTVTimeScale;
float npRoomLevel(float slot,float t){
 ${ROOMS.filter(r=>!r.tv).map(r=>`if(abs(slot-${f(r.slot)})<0.1){float q=mod(t-${f(r.first)}+${f(r.period)},${f(r.period)});return 0.06+0.94*smoothstep(0.0,${f(r.fade)},q)*(1.0-smoothstep(${f(r.on)},${f(r.on+r.fade)},q));}`).join('\n ')}
 return 1.0;
}
float npNeonLevel(float slot,float t){
 ${NEON_EVENTS.map(r=>`if(abs(slot-${f(r.slot)})<0.1){float q=mod(t-${f(r.first)}+${f(r.period)},${f(r.period)});return 1.0-${r.dips.map(([a,b,c,d,depth])=>`${f(depth)}*smoothstep(${f(a)},${f(b)},q)*(1.0-smoothstep(${f(c)},${f(d)},q))`).join('-')};}`).join('\n ')}
 return 1.0;
}
`;
