// World kinematics shared by admission, gain and Doppler. No timer detached from craft motion.
export const FLYBY_RANGE=65;
export function flybyState(position,eye,velocity=[0,0,8],yaw=0){
  const d=position.map((v,i)=>v-eye[i]),distance=Math.hypot(...d),radial=d.reduce((n,v,i)=>n+v*velocity[i],0)/Math.max(.01,distance);
  const right=d[0]*Math.cos(yaw)-d[2]*Math.sin(yaw);
  return {distance,radial,rate:Math.max(.94,Math.min(1.06,343/(343+radial))),pan:Math.max(-.8,Math.min(.8,right/Math.max(10,distance))),
    gain:Math.min(2.8,2.8*Math.pow(10/Math.max(10,distance),.85))};
}
