// Terminal routes use existing cover: left service gap, rear of stall A,
// and the existing left alley at z=-238. Main lanes and speeds are retained.
const PI = Math.PI;
export const ROUTE = Object.freeze({ farX: -18, farZ: -238, leftX: -7.1,
  leftGapZ: (-20.81739644811023 - 21.847258889465593) / 2,
  leftEndX: -10.7, rightX: 5.6, rightZ: -11.2, rightEndX: 8.15,
  sRadius: 1.5, sAngle: Math.acos(.8), darkTilt: .6 });
const mod=(x,n)=>((x%n)+n)%n;
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
export function makeWalkerRoute(p) {
  const x=Math.fround(p.x), family=x<.4?-1:1, sign=Math.sign(p.speed);
  // Centre the turned canopy in the existing 1.03m left gap. Dark umbrellas
  // bank about their hand by 34deg while turning, reducing their cross-section.
  const centre=p.um===1?-.08579489703813253:p.um===2?.16629323363304138:0;
  const nearZ=Math.fround(family<0?ROUTE.leftGapZ-sign*centre*p.scale:ROUTE.rightZ+(sign<0?.45:0));
  const rf=x-ROUTE.farX, lf=rf*PI/2, zf=ROUTE.farZ+rf;
  const rn=family<0?x-ROUTE.leftX:ROUTE.rightX-x, zn=nearZ-rn;
  const straight=zn-zf, ln=rn*PI/2, tail=family<0?ROUTE.leftX-ROUTE.leftEndX:2*ROUTE.sRadius*ROUTE.sAngle+ROUTE.rightEndX-7.4;
  const length=Math.fround(lf+straight+ln+tail), z=Math.fround(p.z);
  let initial;
  if(z<zf)initial=rf*Math.acos(Math.max(-1,Math.min(1,1-(z-ROUTE.farZ)/rf)));
  else if(z<=zn)initial=lf+z-zf;
  else initial=lf+straight+rn*Math.asin(Math.max(-1,Math.min(1,(z-zn)/rn)));
  return {x,family,nearZ,rf,lf,zf,rn,zn,straight,ln,tail,length,initial:Math.fround(initial)};
}
export function sampleWalkerRoute(r,distance,sign=1) {
  let s=mod(distance,r.length),x,z,dx,dz,tilt=0;
  if(s<r.lf){const a=s/r.rf;x=ROUTE.farX+r.rf*Math.sin(a);z=ROUTE.farZ+r.rf*(1-Math.cos(a));dx=Math.cos(a);dz=Math.sin(a);}
  else if((s-=r.lf)<r.straight){x=r.x;z=r.zf+s;dx=0;dz=1;}
  else if((s-=r.straight)<r.ln){const a=s/r.rn,side=r.family;x=r.x+side*r.rn*(1-Math.cos(a));z=r.zn+r.rn*Math.sin(a);dx=side*Math.sin(a);dz=Math.cos(a);tilt=r.family<0?ROUTE.darkTilt*smooth(s/r.ln):0;}
  else {s-=r.ln;if(r.family<0){x=ROUTE.leftX-s;z=r.nearZ;dx=-1;dz=0;tilt=ROUTE.darkTilt;}
    else {const R=ROUTE.sRadius,A=ROUTE.sAngle,L=R*A;if(s<L){const a=s/R;x=ROUTE.rightX+R*Math.sin(a);z=r.nearZ+R*(1-Math.cos(a));dx=Math.cos(a);dz=Math.sin(a);}
      else if(s<2*L){const a=A-(s-L)/R;x=ROUTE.rightX+2*R*Math.sin(A)-R*Math.sin(a);z=r.nearZ+R*(1-2*Math.cos(A)+Math.cos(a));dx=Math.cos(a);dz=Math.sin(a);}
      else{x=7.4+s-2*L;z=r.nearZ+.6;dx=1;dz=0;}}}
  return {x,z,yaw:Math.atan2(dx*sign,dz*sign),tilt,s:mod(distance,r.length)};
}
