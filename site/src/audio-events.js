import { FLYBY_RANGE } from './flyby.js';
// Admission is frame-driven. No cue timer, backlog, clip-wrap or member retrigger.
export function createEventAdmissions(engine) {
  let owner=null,initial=null,previous=null;const history=[];
  const note=(kind,data={})=>{history.push({kind,...data});if(history.length>200)history.shift();};
  function boundary(reason){initial=null;previous=null;engine.cancelEvents(reason);note('baseline',{reason});}
  function ownerReady(id,sample,live){if(owner===id)return;owner=id;initial=live&&engine.canCue()?{kitchen:!!sample?.kitchen,steps:!!sample?.steps,hover:sample?.pass?.visible&&sample.pass.distance<=FLYBY_RANGE}:null;previous=sample||null;note('enable opportunity',{owner:id,initial});}
  function admit(key,eligible,reason){if(!eligible)return;const played=engine.playCue(key);note(played?'admitted':'consumed/drop',{key,reason,sceneTime:previous?.time});}
  function frame(sample,rawDt){if(rawDt>.1||rawDt<=0){boundary('stalled/nonadvancing frame');return;}if(!sample.activityReady){previous=null;initial=null;return;}const prior=previous;previous=sample;
    if(initial){const opportunity=initial;initial=null;admit('kitchen',opportunity.kitchen&&sample.kitchen,'explicit enable visible activity');admit('steps',opportunity.steps&&sample.steps,'explicit enable visible group');admit('hover',opportunity.hover&&sample.pass?.distance<=FLYBY_RANGE,'explicit enable visible flyby');}
    if(!prior){if(sample.pass)engine.updateFlyby?.(sample.pass);return;}
    if(prior.steps&&!sample.steps)engine.cancelCue('steps','moving group ended');
    // One kitchen opportunity per enable; no inference from repeating work clips.
    if(!prior.steps&&sample.steps)admit('steps',true,'new empty-to-nonempty group');
    if(prior.pass&&sample.pass&&prior.pass.cycle===sample.pass.cycle&&prior.pass.distance>FLYBY_RANGE&&sample.pass.distance<=FLYBY_RANGE&&sample.pass.radial<0){
      admit('hover',sample.pass.visible,'actual approaching flyby range crossing');
    }
    if(sample.pass)engine.updateFlyby?.(sample.pass);
    // Hover intentionally continues through natural occlusion/exit after admission.
    if(prior.kitchen&&!sample.kitchen)engine.cancelCue('kitchen','cooking activity ended');
  }
  return {ownerReady,boundary,frame,info:()=>({owner,initial,previous,history:[...history]})};
}
