import test from 'node:test';import assert from 'node:assert/strict';
import {createAudioEngine,AUDIO_ASSETS,BUS_GAIN}from '../site/src/audio-engine.js';
import {createEventAdmissions}from '../site/src/audio-events.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function rig({fetchHold=false,decodeHold=false,resumeHold=false,fail='',durationWrong='',musicFrameDelta=0,sampleRate=48000,blockedCues={},secure=()=>true}={}){
 const contexts=[],fetches=[],decodes=[],resumes=[],page={hidden:false};const saved=new Map();
 class Param{value=1;events=[];cancelScheduledValues(t){this.events.push(['cancel',t]);}cancelAndHoldAtTime(t){this.events.push(['hold',t]);}setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);}}
 class Node{connections=[];gain=new Param();playbackRate=new Param();pan=new Param();connect(n){this.connections.push(n);return n;}disconnect(){this.disconnected=true;}start(...v){this.startArgs=v;}stop(at){this.stopAt=at;}}
 class Context{state='suspended';sampleRate=sampleRate;currentTime=10;destination={};nodes=[];constructor(){contexts.push(this);}createGain(){const n=new Node();this.nodes.push(n);return n;}createStereoPanner(){const n=new Node();this.nodes.push(n);return n;}createBufferSource(){const n=new Node();this.nodes.push(n);return n;}async resume(){if(resumeHold)await new Promise(r=>resumes.push(r));this.state='running';this.onstatechange?.();}async suspend(){this.state='suspended';this.onstatechange?.();}async close(){this.state='closed';this.onstatechange?.();}async decodeAudioData(bytes){if(decodeHold)await new Promise(r=>decodes.push(r));const key=bytes.key;
  const seconds=AUDIO_ASSETS[key].seconds+(key==='music'?musicFrameDelta/sampleRate:0);
  return{numberOfChannels:2,duration:durationWrong===key?99:seconds,sampleRate};}}
 const e=createAudioEngine({makeContext:()=>new Context(),secure,blockedCues,page,loadBytes:async(key,{fetchFile,signal,valid})=>{if(!valid())throw Error('Stale');const response=await fetchFile(new URL(AUDIO_ASSETS[key].file,'https://example.invalid/'),{signal});if(!valid())throw Error('Stale');if(!response.ok)throw Error('HTTP '+response.status);const bytes=await response.arrayBuffer();if(!valid())throw Error('Stale');return{bytes,release(){this.bytes=null;}};},storage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},fetchFile:async url=>{const key=Object.keys(AUDIO_ASSETS).find(k=>decodeURIComponent(url.pathname.slice(1))===AUDIO_ASSETS[k].file);if(fetchHold)await new Promise(r=>fetches.push(r));return{ok:key!==fail&&fail!=='all',status:key===fail||fail==='all'?503:200,arrayBuffer:async()=>({key})};}});
 return{e,page,contexts,saved,fetches,decodes,resumes,release:list=>list.splice(0).forEach(r=>r()),setFail:v=>fail=v,setFetch:v=>fetchHold=v,setDecode:v=>decodeHold=v,setResume:v=>resumeHold=v};
}
test('silent arrival, exact beds/origins, once-only graph/gains and repeated enable',async()=>{
 const r=rig();assert.equal(r.e.info().consent,false);assert.equal(r.contexts.length,0);r.e.setLevel('ambience',.5);r.e.setLevel('master',.4);await Promise.all([r.e.enable(),r.e.enable(),r.e.enable()]);assert.equal(r.contexts.length,1);
 let starts=r.e.info().history.filter(x=>x.kind==='start');assert.deepEqual(starts.map(x=>x.key),['rain','music','city','crowd']);assert.equal(starts[0].at,starts[1].at);assert.ok(Math.abs(starts[2].at-starts[0].at-2.3)<1e-10);assert.ok(Math.abs(starts[3].at-starts[0].at-5.7)<1e-10);
 const c=r.contexts[0];const sources=c.nodes.filter(n=>n.startArgs);for(const s of sources){assert.equal(s.startArgs[1],0);assert.equal(s.loopEnd,AUDIO_ASSETS[starts[sources.indexOf(s)].key].seconds);assert.equal(s.connections[0].gain.events.at(-1)[1],1);}
 assert.equal(c.nodes[0].gain.value,.4);assert.equal(c.nodes[3].gain.value,.65);await r.e.enable();assert.equal(r.e.info().history.filter(x=>x.kind==='start').length,4);r.e.stop(true);
});
for(const stage of ['fetch','decode','resume'])test('Stop during '+stage+' makes late old completion inert and cannot replace new owner',async()=>{
 const r=rig({fetchHold:stage==='fetch',decodeHold:stage==='decode',resumeHold:stage==='resume'});const pending=r.e.enable();await delay(0);r.e.stop(true);
 r.setFetch(false);r.setDecode(false);r.setResume(false);await r.e.enable();const id=r.e.info().owner;
 r.release(r.fetches);r.release(r.decodes);r.release(r.resumes);await pending;await delay(0);
 assert.equal(r.e.info().owner,id);assert.equal(r.e.info().history.filter(x=>x.kind==='start'&&x.owner!==id).length,0);assert.equal(r.contexts[0].state,'closed');r.e.stop(true);
});
test('hidden pending work never starts; explicit resume can finish same owner; levels/mute survive',async()=>{
 const r=rig({decodeHold:true});const p=r.e.enable();await delay(0);r.page.hidden=true;r.e.visibility();r.release(r.decodes);await p;assert.equal(r.e.info().history.filter(x=>x.kind==='start').length,0);
 r.e.setLevel('music',.25);r.e.mute(true);r.setDecode(false);r.page.hidden=false;r.e.visibility();await r.e.resume();assert.equal(r.e.info().muted,true);assert.equal(r.e.info().levels.music,.25);assert.equal(r.contexts[0].nodes[0].gain.value,0);r.e.stop(true);
});
test('per-layer transport/decode failure leaves other beds and controls working',async()=>{
 const r=rig({fail:'rain',durationWrong:'music'});await r.e.enable();assert.equal(Object.keys(r.e.info().unavailable).length,2);assert.deepEqual(r.e.info().active,['city','crowd']);r.e.setLevel('ambience',.7);assert.equal(r.e.info().levels.ambience,.7);r.e.stop(true);
});
test('cue slot remains busy throughout cancellation fade; pagehide hard closes',async()=>{
 const r=rig();await r.e.enable();assert.equal(r.e.playCue('hover'),true);r.e.cancelEvents('pause');assert.equal(r.e.playCue('hover'),false);const source=r.contexts[0].nodes.filter(n=>n.startArgs).at(-1);assert.equal(source.stopAt,10.02);source.onended();assert.equal(r.e.playCue('hover'),true);r.e.stop(true);assert.equal(r.e.info().consent,false);assert.equal(r.e.info().owner,null);
});
function gateRig(can=true){const starts=[],cancels=[];return{starts,cancels,setCan:v=>can=v,gate:createEventAdmissions({canCue:()=>can,playCue:k=>{if(can)starts.push(k);return can;},cancelEvents:r=>cancels.push(r),cancelCue:(k,r)=>cancels.push([k,r])})};}
const sample=(kitchen=true,steps=true,z=-100,cycle=1,visible=true)=>({time:82,kitchen,steps,activityReady:true,pass:{z,cycle,visible,remaining:5,distance:Math.abs(z),radial:-8,gain:1,rate:1.02,pan:.1}});
test('one enable activity cue each over 45s, no wrap/member replacement or resume/unmute replay',()=>{
 const r=gateRig(),s=sample();r.gate.ownerReady(1,s,true);for(let n=0;n<2700;n++)r.gate.frame({...s,time:n/60,groupEvidence:{id:n%7}},1/60);assert.deepEqual(r.starts,['kitchen','steps']);
 r.gate.boundary('pause/hidden');r.gate.frame({...s,activityReady:false},1/60);r.gate.frame(s,1/60);r.gate.frame(s,1/60);assert.equal(r.starts.length,2);
 r.gate.ownerReady(1,s,true);r.setCan(false);r.gate.frame(s,1/60);r.setCan(true);r.gate.frame(s,1/60);assert.equal(r.starts.length,2);
 r.gate.frame(sample(true,false),1/60);r.gate.frame(s,1/60);assert.equal(r.starts.at(-1),'steps');r.gate.ownerReady(2,s,true);r.gate.frame(s,1/60);assert.deepEqual(r.starts.slice(-2),['kitchen','steps']);
});
test('initially Low/paused/muted/unavailable opportunity drops, no deferred admission',()=>{
 for(const mode of ['paused','low','muted','unavailable']){const r=gateRig(mode!=='muted'&&mode!=='unavailable');r.gate.ownerReady(1,sample(false,false),mode!=='paused');r.gate.frame(sample(false,false),1/60);r.gate.boundary('return');r.setCan(true);r.gate.frame({...sample(),activityReady:false},1/60);r.gate.frame(sample(),1/60);r.gate.frame(sample(),1/60);assert.equal(r.starts.length,0,mode);}
});
test('approach range crossing only; invisible/late edge drops; occlusion/exit does not cancel full hover',()=>{
 const r=gateRig();r.gate.frame(sample(false,false,-65.1),1/60);r.gate.frame(sample(false,false,-64.9),1/60);assert.deepEqual(r.starts,['hover']);r.gate.frame(sample(false,false,-38,1,false),1/60);r.gate.frame(sample(false,false,-640,2,false),1/60);assert.equal(r.cancels.length,0);
 const dropped=gateRig();dropped.gate.frame(sample(false,false,-65.1),1/60);dropped.gate.frame(sample(false,false,-64.9,1,false),1/60);dropped.gate.frame(sample(false,false,-60),1/60);assert.equal(dropped.starts.length,0);
});

test('known blocked kitchen binding remains unavailable without suppressing other cues',async()=>{const r=rig({blockedCues:{kitchen:'pending activity review'}});await r.e.enable();assert.equal(r.e.playCue('kitchen'),false);assert.equal(r.e.playCue('steps'),true);assert.equal(r.e.info().unavailable.kitchen,'pending activity review');r.e.stop(true);});

test('speaker directly consents, a loading toggle cancels, then fresh enable/mute/unmute',async()=>{
 const r=rig({decodeHold:true});assert.equal(r.e.info().consent,false);const pending=r.e.toggle();await delay(0);assert.equal(r.e.info().status,'loading');await r.e.toggle();assert.equal(r.e.info().consent,false);
 r.setDecode(false);await r.e.toggle();const owner=r.e.info().owner;r.release(r.decodes);await pending;
 assert.equal(r.e.info().owner,owner);assert.equal(r.e.info().muted,false);assert.equal(r.e.info().active.length,4);
 await r.e.toggle();assert.equal(r.e.info().muted,true);await r.e.toggle();assert.equal(r.e.info().muted,false);assert.equal(r.e.info().owner,owner);r.e.stop(true);
});
test('requested bus boost once, music unchanged, persisted slider values still scale, headroom bound',async()=>{
 const r=rig();await r.e.enable();const c=r.contexts[0];assert.deepEqual(c.nodes.slice(2,5).map(n=>n.gain.value),[1,1.3,1.3]);
 r.e.setLevel('rain',.5);assert.equal(c.nodes[4].gain.value,.65);r.e.setLevel('ambience',.5);assert.equal(c.nodes[3].gain.value,.65);assert.equal(c.nodes[2].gain.value,1);
 // Sum of independent absolute accepted peaks, including 2.8x max flyby gain, < full scale.
 assert.ok(.52+1.3*(.031623+.01259+.019953+.019953+.025119+.025119*2.8)<1);assert.deepEqual(BUS_GAIN,{music:1,ambience:1.3,rain:1.3});r.e.stop(true);
});
test('flyby spatial gain/rate/pan updates only an admitted live slot; mute/Stop cannot revive it',async()=>{
 const r=rig();await r.e.enable();r.e.playCue('hover');r.e.updateFlyby({gain:2.8,rate:1.023,pan:.2});const s=r.contexts[0].nodes.findLast(n=>n.startArgs);
 assert.equal(s.playbackRate.value,1.023);const gain=s.connections[0],pan=gain.connections[0];assert.equal(gain.gain.value,2.8);assert.equal(pan.pan.value,.2);
 r.e.mute(true);r.e.updateFlyby({gain:2.8});assert.equal(gain.gain.value,0);r.e.stop(true);r.e.updateFlyby({gain:2.8});assert.equal(r.e.info().owner,null);
});

test('enabling during a visible in-range flyby admits once; paused enable and fresh hidden baseline do not replay',()=>{
 const r=gateRig(),s=sample(false,false,-45);r.gate.ownerReady(1,s,true);r.gate.frame(s,1/60);r.gate.frame(s,1/60);assert.deepEqual(r.starts,['hover']);
 r.gate.boundary('hidden');r.gate.frame({...s,pass:{...s.pass,visible:false}},1/60);assert.deepEqual(r.starts,['hover']);
 const paused=gateRig();paused.gate.ownerReady(1,s,false);paused.gate.frame(s,1/60);assert.equal(paused.starts.length,0);
});

test('total audio failure stays honestly unavailable; direct retry replaces failed owner',async()=>{
 const r=rig({fail:'all'});assert.equal(await r.e.toggle(),false);assert.equal(r.e.info().status,'unavailable');assert.equal(r.e.canCue(),false);assert.equal(r.e.info().active.length,0);const old=r.e.info().owner;
 r.setFail('');await r.e.toggle();assert.equal(r.e.info().status,'enabled');assert.notEqual(r.e.info().owner,old);assert.equal(r.e.info().active.length,4);r.e.stop(true);
});

test('rain starts first, late music starts at the beginning and late ambience keeps its phase',async()=>{
 const r=rig({fetchHold:true});
 const pending=r.e.enable();
 await delay(0);
 assert.equal(r.e.info().status,'loading');
 r.release(r.fetches);
 await delay(0);
 assert.deepEqual(r.e.info().active,['rain']);
 assert.equal(r.e.info().status,'enabled');
 assert.equal(r.e.canCue(),false);
 r.contexts[0].currentTime+=6;
 r.setFetch(false);
 r.release(r.fetches);
 await pending;
 const starts=Object.fromEntries(r.e.info().history.filter(x=>x.kind==='start').map(x=>[x.key,x]));
 assert.equal(starts.music.offset,0);
 assert.ok(Math.abs(starts.music.at-starts.rain.at-6)<1e-10);
 assert.ok(Math.abs(starts.city.offset-3.7)<1e-10);
 assert.ok(Math.abs(starts.crowd.offset-.3)<1e-10);
 assert.equal(r.e.canCue(),true);
 r.e.stop(true);
});
test('insecure context skips consent, context construction and audio requests',async()=>{
 const r=rig({secure:()=>false,fetchHold:true});
 assert.equal(await r.e.enable(),false);
 assert.equal(r.e.info().detail,'secure-context');
 assert.equal(r.e.info().consent,false);
 assert.equal(r.contexts.length,0);
 assert.equal(r.fetches.length,0);
});

test('music repeats at the decoded endpoint, allowing AAC padding and resampling', async () => {
 for (const [sampleRate, musicFrameDelta] of [[44100,-1], [48000,0], [48000,3072]]) {
  const r = rig({sampleRate,musicFrameDelta});
  await r.e.enable();
  const music = r.contexts[0].nodes.filter(node => node.startArgs)[1];
  assert.equal(music.loopStart,0);
  assert.equal(music.loopEnd,AUDIO_ASSETS.music.seconds+musicFrameDelta/sampleRate);
  assert.equal(music.startArgs[1],0);
  assert.equal(r.e.info().unavailable.music,undefined);
  r.e.stop(true);
 }
 for (const musicFrameDelta of [-2,3074]) {
  const r = rig({musicFrameDelta});
  await r.e.enable();
  assert.match(r.e.info().unavailable.music,/Unexpected decoded duration/);
  assert.deepEqual(r.e.info().active,['rain','city','crowd']);
  r.e.stop(true);
 }
});
