import { makeWalkerRoute, sampleWalkerRoute } from './walker-routes.js';
const STEP=1/60, mod=(x,n)=>((x%n)+n)%n;
// Deterministic local passage management. Waiting figures remain animated at
// idle; every walker retains its route and resumes. No scene-time rewind.
export function buildWalkerFlow(items, walk) {
  const walkers=items.filter(p=>p.speed).map((p,id)=>({id,...p,route:makeWalkerRoute(p),refs:[]}));
  // Preserve authored walking groups and their props. A free single walker can
  // make a local sidestep without pulling a companion or umbrella across lanes.
  const passers=new Set(walkers.filter(p=>p.speed>0 && p.um===0 && p.route.family>0 &&
    !walkers.some(b=>b!==p && b.speed===p.speed && Math.abs(b.x-p.x)<2 && Math.abs(b.z-p.z)<1.2)).map(p=>p.id));
  const byKey=new Map(walkers.map(p=>[[p.x,p.z,p.speed].join(','),p]));
  let tick=0,states=walkers.map(p=>({d:p.route.initial,travel:0,v:Math.abs(p.speed),blend:1,owned:false,wait:0,waitMax:0,wraps:0,side:0,sideV:0,heading:0,headingV:0}));
  let gates={left:{dir:0,opened:0},right:{dir:0,opened:0}};
  const snapshots=new Map();
  const family=p=>p.route.family<0?'left':'right', edge=p=>p.route.lf+p.route.straight-3.5;
  const snapshot=()=>({states:states.map(s=>({...s})),gates:JSON.parse(JSON.stringify(gates))});snapshots.set(0,snapshot());
  function step(){
    const phases=walkers.map((p,i)=>mod(states[i].d,p.route.length));
    const positions=walkers.map((p,i)=>sampleWalkerRoute(p.route,states[i].d,Math.sign(p.speed)));
    // Release only beyond the shared approach or after an occluded wrap.
    walkers.forEach((p,i)=>{if(states[i].owned&&p.speed<0&&phases[i]<edge(p)-.6)states[i].owned=false;});
    for(const key of ['left','right']){
      const g=gates[key],active=walkers.filter((p,i)=>family(p)===key&&states[i].owned);
      const requests=walkers.filter((p,i)=>family(p)===key&&!states[i].owned&&((p.speed>0&&phases[i]>edge(p)-.4)||(p.speed<0&&phases[i]>edge(p))));
      if(!active.length){g.dir=0;if(requests.length){requests.sort((a,b)=>states[b.id].wait-states[a.id].wait||a.id-b.id);g.dir=Math.sign(requests[0].speed);g.opened=tick;}}
      const opposite=requests.some(p=>Math.sign(p.speed)!==g.dir);
      requests.sort((a,b)=>a.speed>0&&b.speed>0?(a.route.length-phases[a.id])-(b.route.length-phases[b.id]):states[b.id].wait-states[a.id].wait||a.id-b.id);
      for(const p of requests){if(Math.sign(p.speed)===g.dir&&(!opposite||tick-g.opened<480)){
          const entryBusy=walkers.some(b=>family(b)===key&&states[b.id].owned&&(p.speed<0?b.route.length-phases[b.id]<1.6:phases[b.id]<edge(b)+1.6));
          const q=positions[p.id];
          const queuedAhead=p.speed>0&&walkers.some(b=>b.id!==p.id&&b.speed>0&&family(b)===key&&!states[b.id].owned&&phases[b.id]>edge(b)-12&&Math.abs(positions[b.id].x-q.x)<.8&&positions[b.id].z>q.z+.03);
          if(!entryBusy&&!queuedAhead)states[p.id].owned=true;
        }}
    }
    const next=walkers.map((p,i)=>{
      const s=states[i],r=p.route,q=phases[i],sign=Math.sign(p.speed),native=Math.abs(p.speed);let target=native;
      if(!s.owned){if(sign>0&&q>edge(p)-3)target*=Math.max(0,Math.min(1,(edge(p)-q-.3)/1.5));if(sign<0&&q>edge(p))target=0;}
      if(q>edge(p)-4){for(let j=0;j<walkers.length;j++){if(i===j)continue;const b=walkers[j];if(family(b)!==family(p)||Math.sign(b.speed)!==sign||phases[j]<edge(b)-4||!states[j].owned)continue;
        const gap=sign*((r.length-q)-(b.route.length-phases[j]));if(gap>0)target=Math.min(target,Math.max(0,(gap-1.35)*1.5));}}
      if(sign>0&&!s.owned&&q>edge(p)-12){const pos=positions[i];for(let j=0;j<walkers.length;j++){const b=walkers[j],bpos=positions[j];if(i===j||b.speed<0||family(b)!==family(p)||phases[j]<edge(b)-12)continue;const ahead=bpos.z-pos.z;if(ahead>.03&&Math.abs(bpos.x-pos.x)<.8)target=Math.min(target,Math.max(0,(ahead-1.1)*1.5));}}
      const dv=target-s.v,v=s.v+Math.max(-3*STEP,Math.min(.9*STEP,dv));
      const ds=sign*v*STEP;let d=s.d+ds,owned=s.owned,wraps=s.wraps;
      if(Math.floor(d/r.length)!==Math.floor(s.d/r.length)){owned=false;wraps++;}
      const waiting=v<.15,wait=waiting?s.wait+STEP:0;
      return {d,travel:s.travel+Math.abs(ds),v,blend:s.blend+(v/native-s.blend)*Math.min(1,STEP*8),owned,wait,waitMax:Math.max(s.waitMax,wait),wraps};
    });
    // Passing room on the right straight lanes. Only the approaching walker
    // steps aside; its opposing companion keeps the inherited lane. This is
    // spatial and repeatable, with no selected id or scene timestamp.
    for (const p of walkers) {
      const i=p.id,s=states[i],n=next[i],q=positions[i],r=p.route;
      if (!passers.has(i)) { n.side=0; n.sideV=0; n.heading=0; n.headingV=0; continue; }
      let targetSide=0;
      const straight=phases[i]>r.lf-6 && phases[i]<r.lf+r.straight;
      if (p.speed>0 && r.family>0 && straight) {
        const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
        const endWeight=ease((phases[i]-r.lf+6)/4)*ease((r.lf+r.straight-phases[i])/3);
        for (const b of walkers) {
          if (b.speed>=0 || b.route.family<0 || phases[b.id]<=b.route.lf-6 || phases[b.id]>=b.route.lf+b.route.straight) continue;
          const dx=r.x-b.route.x,dz=Math.abs(q.z-positions[b.id].z);
          if (Math.abs(dx)>=.4 || dz>=6) continue;
          const side=(dx===0?-1:Math.sign(dx))*(.68-Math.abs(dx))*ease((6-dz)/4.8)*endWeight;
          if (Math.abs(side)>Math.abs(targetSide)) targetSide=side;
        }
      }
      // Lateral travel slows with the forward stride and stops when yielding.
      // Heading eases into the passing trajectory; endpoints remain unchanged.
      const ds=n.d-s.d,wrapped=n.wraps!==s.wraps;
      const lateralStep=.4*STEP*Math.min(1,n.v/Math.abs(p.speed));
      n.side=wrapped?0:s.side+Math.max(-lateralStep,Math.min(lateralStep,targetSide-s.side));
      n.sideV=wrapped?0:(n.side-s.side)/STEP;
      const nq=sampleWalkerRoute(r,n.d,Math.sign(p.speed));
      const desiredHeading=Math.atan2(Math.sin(nq.yaw)*n.v+n.sideV,Math.cos(nq.yaw)*n.v)-nq.yaw;
      const turn=Math.atan2(Math.sin(desiredHeading),Math.cos(desiredHeading))*Math.min(1,n.v/.25);
      n.heading=wrapped?0:s.heading+Math.max(-.8*STEP,Math.min(.8*STEP,turn-s.heading));
      n.headingV=wrapped?0:(n.heading-s.heading)/STEP;
      const travelled=wrapped?Math.abs(ds):Math.hypot(nq.x+n.side-q.x-s.side,nq.z-q.z);
      n.travel=s.travel+travelled;
      n.blend=s.blend+(Math.min(1,travelled/STEP/Math.abs(p.speed))-s.blend)*Math.min(1,STEP*8);
    }
    states=next;tick++;if(tick%600===0){snapshots.set(tick,snapshot());if(snapshots.size>361)snapshots.delete([...snapshots.keys()][1]);}
  }
  return {
    register(geometry,list,prop){const pose=new Float32Array(list.length*4),motion=new Float32Array(list.length*4);list.forEach((p,i)=>{if(p.speed){const w=byKey.get([p.x,p.z,p.speed].join(','));w.refs.push({pose,motion,i,geometry});motion[i*4+2]=prop;}});return {pose,motion};},
    update(time){if(!walk)return;const target=Math.max(0,Math.floor(time/STEP+1e-6));if(target<tick){const at=Math.floor(target/600)*600,snap=snapshots.get(at)||snapshots.get(0);states=snap.states.map(s=>({...s}));gates=JSON.parse(JSON.stringify(snap.gates));tick=snapshots.has(at)?at:0;}
      while(tick<target)step();const sub=Math.max(0,time-tick*STEP);
      for(const p of walkers){const s=states[p.id],d=s.d+Math.sign(p.speed)*s.v*sub,q=sampleWalkerRoute(p.route,d,Math.sign(p.speed));for(const ref of p.refs){const j=ref.i*4;ref.pose.set([q.x+s.side+s.sideV*sub,q.z,q.yaw+s.heading+s.headingV*sub,s.travel+Math.hypot(Math.sin(q.yaw)*s.v+s.sideV,Math.cos(q.yaw)*s.v)*sub],j);ref.motion[j]=s.blend;ref.motion[j+1]=q.tilt;ref.geometry.attributes.aPose.needsUpdate=true;ref.geometry.attributes.aMotion.needsUpdate=true;}}
    },
    renderedInfo:()=>walkers.map(p=>{const s=states[p.id],ref=p.refs[0],j=(ref?.i||0)*4;return {id:p.id,x:ref?.pose[j],z:ref?.pose[j+1],travel:ref?.pose[j+3],v:s.v,blend:s.blend,scale:p.scale};}),
    info:()=>walkers.map(p=>({id:p.id,x:p.x,z:p.z,speed:p.speed,um:p.um,scale:p.scale,route:p.route,...states[p.id],phase:mod(states[p.id].d,p.route.length)})),
  };
}
