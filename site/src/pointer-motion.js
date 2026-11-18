// Model-derived horizontal envelope. Metres/radians/seconds; no object scaling or scene crop at ordinary aspect ratios.
import { PARAMS } from './params.js';
const rad=d=>d*Math.PI/180;
export const HEAD_MOTION=Object.freeze({yaw:rad(36),pitch:rad(10),radius:.18,ease:.22});
const clamp=n=>Number.isFinite(n)?Math.max(-1,Math.min(1,n)):0;
const cameraFor=a=>a<.9?PARAMS.camera.mobile:PARAMS.camera.desktop;
export function coverageView(config,aspect){
  aspect=Math.max(.1,aspect);
  // Both near facades are continuous past this z. Kitchen's painted back ends at z=-1.
  // Keep every side/corner ray behind -1.15, with a neck-position margin.
  const left=Math.atan2(config.pos[0]+8-.08,config.pos[2]+1.15);
  const right=Math.atan2(8.96-config.pos[0]-.08,config.pos[2]+1.15);
  const tL=Math.tan(left-rad(4)),tR=Math.tan(right-rad(4));
  const half=Math.min(Math.tan(rad(config.fov)/2),(tL+tR)/(2*aspect));
  const vp=[Math.max(1-tR/(2*aspect*half),Math.min(tL/(2*aspect*half),config.vp[0])),config.vp[1]];
  const top=2*vp[1]*half,bottom=-2*(1-vp[1])*half,pitch=rad(10);
  const corner=(x,y,p)=>Math.atan2(x,Math.cos(p)-y*Math.sin(p));
  const maxEdge=x=>Math.max(...[-pitch,pitch].flatMap(p=>[corner(x,top,p),corner(x,bottom,p)]));
  const yawLeft=Math.max(0,Math.min(HEAD_MOTION.yaw,left-maxEdge(2*vp[0]*aspect*half)));
  const yawRight=Math.max(0,Math.min(HEAD_MOTION.yaw,right-maxEdge(2*(1-vp[0])*aspect*half)));
  return {fov:2*Math.atan(half)*180/Math.PI,vp,limits:{yawLeft,yawRight,yaw:Math.max(yawLeft,yawRight),pitch},coverage:{left,right,nearZ:-1.15}};
}
export const coverageFov=(config,aspect)=>coverageView(config,aspect).fov;
export function headLimits(width=1440,height=900){const a=width/Math.max(1,height);return coverageView(cameraFor(a),a).limits;}
export function headPose(x=0,y=0,limits=HEAD_MOTION){
  const yaw=-clamp(x)*(x<0?(limits.yawLeft??limits.yaw):(limits.yawRight??limits.yaw)),pitch=-clamp(y)*limits.pitch;
  return {yaw,pitch,offset:[-HEAD_MOTION.radius*Math.sin(yaw)*Math.cos(pitch),HEAD_MOTION.radius*Math.sin(pitch),HEAD_MOTION.radius*(1-Math.cos(yaw)*Math.cos(pitch))]};
}
export function createPointerMotion({ host = window, page = document, surface=page.getElementById?.('scene'), capture = false } = {}) {
  let x=0,y=0,targetX=0,targetY=0,suspended=false,drag=null;
  const pose=()=>headPose(x,y,headLimits(host.innerWidth,host.innerHeight));
  const discard=()=>{targetX=x;targetY=y;drag=null;};
  const available=()=>!capture&&!suspended&&!page.hidden;
  surface?.addEventListener('pointerdown',event=>{
    if(!available()||event.pointerType!=='touch'||event.isPrimary===false)return;
    drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:targetX,y:targetY,locked:false};
  },{passive:true});
  host.addEventListener('pointermove',event=>{
    if(!available()||event.isPrimary===false)return;
    if(event.pointerType==='touch'){
      if(!drag||event.pointerId!==drag.id)return;
      const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
      if(!drag.locked){
        if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){drag=null;return;}
        if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.1)return;
        drag.locked=true;
        try{surface.setPointerCapture(event.pointerId);}catch{/* Synthetic input has no active native pointer. */}
      }
      if(event.cancelable)event.preventDefault();
      targetX=clamp(drag.x-dx/Math.max(1,host.innerWidth)*1.25);
      targetY=clamp(drag.y-dy/Math.max(1,host.innerHeight)*1.25);
    }else if(event.pointerType==='mouse'&&!event.buttons){
      if(event.target?.closest?.('[data-camera-block],a,button,input,select,textarea')){discard();return;}
      targetX=clamp(event.clientX/Math.max(1,host.innerWidth)*2-1);
      targetY=clamp(event.clientY/Math.max(1,host.innerHeight)*2-1);
    }
  },{passive:false});
  host.addEventListener('pointerup',()=>{drag=null;},{passive:true});
  host.addEventListener('pointercancel',discard,{passive:true});
  page.documentElement.addEventListener('pointerleave',event=>{
    if(available()&&event.pointerType!=='touch'){targetX=0;targetY=0;}
  },{passive:true});
  for(const event of ['blur','pagehide','pageshow','resize','orientationchange'])host.addEventListener(event,discard);
  page.addEventListener('visibilitychange',discard);
  return {
    suspend(value){suspended=!!value;discard();},discard,
    reset(){x=y=targetX=targetY=0;drag=null;},
    step(dt){
      if(available()){
        const alpha=-Math.expm1(-Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1))/HEAD_MOTION.ease);
        x+=(targetX-x)*alpha;y+=(targetY-y)*alpha;
      }
      return pose();
    },pose,
    info:()=>({x,y,targetX,targetY,suspended,capture,dragging:!!drag?.locked,limits:headLimits(host.innerWidth,host.innerHeight),...pose()})
  };
}
