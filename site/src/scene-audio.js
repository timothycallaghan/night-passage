import * as THREE from 'three';
import { flybyState,FLYBY_RANGE } from './flyby.js';
import { createActorSurfaceFallback } from './actor-surface.js';
// Read current rendered transforms. Never alter the scene or use fog as audio gain.
export function createSceneAudioProbe(scene,camera,vehicles,people,heroes,high) {
  const ray=new THREE.Raycaster(),eye=new THREE.Vector3(),v=new THREE.Vector3(),projected=new THREE.Vector3();
  let previousHands=new Map(),previousWalkers=new Map(),lastSample=null,lastTime=-Infinity,lastPass=null,workVerified=false,previousClip=null;
  let boundsTime=-Infinity;
  const boxes=new Map();const opaque=[];scene.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&!o.material?.transparent)opaque.push(o);});
  const surfaceFallback=createActorSurfaceFallback();let visibilityWork=null;
  const belongs=(object,root)=>{for(let p=object;p;p=p.parent)if(p===root)return true;return false;};
  const shown=object=>{for(let p=object;p;p=p.parent){if(!p.visible)return false;if(p===scene)return true;}return false;};
  function visible(point,target){projected.copy(point).project(camera);if(projected.z<=-1||projected.z>=1||Math.abs(projected.x)>1||Math.abs(projected.y)>1)return false;
    camera.getWorldPosition(eye);v.copy(point).sub(eye);const distance=v.length();ray.set(eye,v.normalize());ray.far=distance+.15;
    if(visibilityWork)visibilityWork.rays++;
    const shortlist=opaque.filter(o=>{if(!shown(o))return false;if(o.isSkinnedMesh)return true;let box=boxes.get(o);if(!box){if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();box=o.geometry.boundingBox.clone();boxes.set(o,box);}return ray.ray.intersectsBox(box.clone().applyMatrix4(o.matrixWorld));});
    const hit=ray.intersectObjects(shortlist,false).find(h=>h.distance>camera.near);
    return target?!!hit&&belongs(hit.object,target):!hit||hit.distance>=distance-.15;
  }
  function boneBounds(time){if(boundsTime===time)return;boundsTime=time;for(const o of opaque)if(o.isSkinnedMesh){o.computeBoundingSphere();o.computeBoundingBox();}}
  function passInfo(time,force=false){
    const car=vehicles.cars.find(c=>c.kind==='pass');if(!high||!car)return null;
    const lane=car.lane,span=lane.zNear-lane.zFar,cycle=Math.floor((lane.phase+lane.v*time)/span);
    camera.getWorldPosition(eye);
    const spatial=flybyState(car.g.position.toArray(),eye.toArray(),[0,0,lane.v],camera.rotation.y);
    const crossing=lastPass&&lastPass.cycle===cycle&&lastPass.distance>FLYBY_RANGE&&spatial.distance<=FLYBY_RANGE&&spatial.radial<0;
    const enabling=!lastPass&&spatial.distance<=FLYBY_RANGE;
    lastPass={cycle,distance:spatial.distance};let seen=false;
    if(force||crossing||enabling){boneBounds(time);car.g.traverse(o=>{if(seen||!o.isMesh||o.material?.transparent)return;const a=o.geometry.getAttribute('position'),index=o.geometry.index,count=index?index.count:a.count;
      for(let k=0;k<count-2;k+=Math.max(3,Math.floor(count/48/3)*3)){
        const p=new THREE.Vector3();for(let j=0;j<3;j++)p.add(new THREE.Vector3().fromBufferAttribute(a,index?index.getX(k+j):k+j));p.multiplyScalar(1/3).applyMatrix4(o.matrixWorld);
        if(visible(p,car.g)){seen=true;break;}
      }
    });}
    return {z:car.g.position.z,position:car.g.position.toArray(),cycle,remaining:(lane.zNear-car.g.position.z)/lane.v,visible:seen,visibilityTested:!!(force||crossing||enabling),...spatial};
  }
  return {sample(time){const pass=passInfo(time);if(time-lastTime<.1&&lastSample)return {...lastSample,time,pass};lastTime=time;boneBounds(time);
    let kitchen=false,kitchenEvidence=null;const vendor=heroes?.audioVendor();const hands=new Map();
    const kitchenVisibility={fastPoints:0,surfacePoints:0,rays:0,fallback:false};visibilityWork=kitchenVisibility;
    if(high&&vendor&&shown(vendor.root)){for(const name of ['Bip01_R_Hand','Bip01_L_Hand','Bip01_R_Forearm','Bip01_L_Forearm','Bip01_R_UpperArm','Bip01_L_UpperArm','Bip01_Spine2','Bip01_Head']){
      const bone=vendor.root.getObjectByName(name);if(bone)hands.set(name,bone.getWorldPosition(new THREE.Vector3()));
    }let visibleBone=null;for(const[name,point]of hands){const old=previousHands.get(name),movement=old?point.distanceTo(old):0;
      if(movement>.00002)workVerified=true;
      if(!visibleBone){kitchenVisibility.fastPoints++;if(visible(point,vendor.root))visibleBone={bone:name,point:point.toArray(),movement};}
    }
    const clip=vendor.mixer.time,advancing=previousClip!==null&&clip>previousClip;previousClip=clip;
    // The accepted work activity includes held keyframes. A hold/clip wrap is not an action end.
    if(!visibleBone&&workVerified&&advancing){kitchenVisibility.fallback=true;visibleBone=surfaceFallback(vendor.root,visible,kitchenVisibility);}
    kitchen=workVerified&&advancing&&!!visibleBone;kitchenEvidence=kitchen?{...visibleBone,workVerified,clip,advancing}:null;
    }previousHands=hands;
    visibilityWork=null;
    const walkers=people.audioWalkers(),now=new Map();let steps=false,groupEvidence=null;
    for(const w of walkers){if(!Number.isFinite(w.x)||!Number.isFinite(w.z))continue;const point=new THREE.Vector3(w.x,.95*w.scale,w.z);now.set(w.id,point);const prior=previousWalkers.get(w.id),movement=prior?point.distanceTo(prior):0;
      if(high&&!steps&&w.v>=.15&&w.blend>.1&&movement>.001&&movement<1&&visible(point,null)){steps=true;groupEvidence={id:w.id,position:point.toArray(),v:w.v,blend:w.blend,movement,travel:w.travel};}
    }previousWalkers=now;lastSample={time,kitchen,steps,kitchenEvidence,kitchenVisibility,groupEvidence,pass,activityReady:lastSample!==null};return lastSample;
  },inspectPass:time=>passInfo(time,true),reset(){previousHands.clear();previousWalkers.clear();lastTime=-Infinity,lastPass=null,workVerified=false,previousClip=null;lastSample=null;lastPass=null;workVerified=false;previousClip=null;}};
}
