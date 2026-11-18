import { loadAudioBytes, createTransferMetrics, transportRequests } from './audio-transport.js';
// Accepted buffers retain their mix. The requested 30% boost is applied once per bus.
export const BUS_GAIN=Object.freeze({music:1,ambience:1.3,rain:1.3});
export const AUDIO_ASSETS = Object.freeze({
  music: { file:'Neon Rain Blues (Deckard).m4a', seconds:179.84, bus:'music', delay:0, loop:true },
  rain: { file:'rain-loop-13p5s.wav', seconds:13.5, bus:'rain', delay:0, loop:true },
  city: { file:'city-loop-13p5s.wav', seconds:13.5, bus:'ambience', delay:2.3, loop:true },
  crowd: { file:'crowd-loop-13p5s.wav', seconds:13.5, bus:'ambience', delay:5.7, loop:true },
  kitchen: { file:'kitchen-event-15s.wav', seconds:15, bus:'ambience' },
  steps: { file:'steps-event-15s.wav', seconds:15, bus:'ambience' },
  hover: { file:'hover-event-15s.wav', seconds:15, bus:'ambience' },
});
const LOAD_ORDER = ['rain', 'music', 'city', 'crowd', 'kitchen', 'steps', 'hover'];
// Decoders can keep the AAC encoder's 2,112 priming and 960 remainder frames.
const MUSIC_PADDING_SECONDS = (2112 + 960) / 48000;
const makeWebAudioContext = () => new (globalThis.AudioContext ?? globalThis.webkitAudioContext)();
function resumeContext(ctx, signal, stale) {
  // Invoke resume in the click stack. Some browsers keep this promise pending when playback is blocked.
  const resumed = ctx.resume();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(reject, Error('Audio resume timed out')), 2500);
    const abort = () => finish(reject, Error('Audio resume cancelled'));
    function finish(callback, value) {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      callback(value);
    }
    signal.addEventListener('abort', abort, {once:true});
    resumed.then(value => {
      if (stale() && ctx.state !== 'closed') void ctx.close().catch(()=>{});
      finish(resolve, value);
    }, error => finish(reject, error));
  });
}
const bounded = n => Math.max(0,Math.min(1,Number.isFinite(+n)?+n:1));
export function createAudioEngine({ makeContext=makeWebAudioContext,secure=()=>globalThis.isSecureContext!==false, fetchFile=(url,options)=>fetch(url,options), page=document, storage=localStorage, change=()=>{}, ready=()=>{}, blockedCues={}, loadBytes=loadAudioBytes }={}) {
  let generation=0, operation=0, owner=null, consent=false, pending=null, status='disabled', detail=null;
  const levels={master:1,music:1,ambience:1,rain:1};let muted=false;
  try { const saved=JSON.parse(storage.getItem('site01-audio-levels')||'{}');for(const k of Object.keys(levels))if(k in saved)levels[k]=bounded(saved[k]);muted=saved.muted===true; } catch { /* Optional level persistence. Never consent. */ }
  const retired=new Set();
  const history=[];const log=(kind,data={})=>{history.push({kind,generation,...data});if(history.length>300)history.shift();};
  const current=o=>consent && owner===o && generation===o.id;
  const valid=(o,ticket)=>current(o)&&operation===ticket&&!page.hidden;
  function notify(){change(info());}
  function ramp(param,value,seconds,ctx){if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(ctx.currentTime);else {const value=param.value;param.cancelScheduledValues(ctx.currentTime);param.setValueAtTime(value,ctx.currentTime);}param.linearRampToValueAtTime(value,ctx.currentTime+seconds);}
  function finishSlot(o,key,slot){if(o.slots.get(key)!==slot)return;slot.source.disconnect();slot.gain.disconnect();slot.pan?.disconnect();o.slots.delete(key);log('ended',{key,owner:o.id,at:o.ctx.currentTime});}
  function cancelEvents(reason,only){const o=owner;if(!o)return;for(const[key,slot]of o.slots){if(AUDIO_ASSETS[key].loop||slot.cancelling||(only&&key!==only))continue;slot.cancelling=true;ramp(slot.gain.gain,0,.02,o.ctx);try{slot.source.stop(o.ctx.currentTime+.02);}catch{}log('cancel',{key,reason,owner:o.id});}}
  function dispose(o,hard=false){if(!o)return;o.abort.abort();if(hard){o.life.gain.cancelScheduledValues(o.ctx.currentTime);o.life.gain.setValueAtTime(0,o.ctx.currentTime);}else ramp(o.life.gain,0,.05,o.ctx);
    const at=o.ctx.currentTime+(hard?0:.05);
    for(const slot of o.slots.values()){try{slot.source.stop(at);}catch{}if(hard){slot.source.disconnect();slot.gain.disconnect();slot.pan?.disconnect();}}
    // Offline/suspended contexts cannot complete a fade. Close immediately there.
    let complete;const closed=new Promise(r=>complete=r);const entry={ctx:o.ctx,closed};retired.add(entry);
    const close=()=>{for(const slot of o.slots.values()){slot.source.disconnect();slot.gain.disconnect();slot.pan?.disconnect();}o.slots.clear();void o.ctx.close().catch(()=>{}).finally(()=>{retired.delete(entry);complete();});};
    if(hard||o.ctx.state!=='running')close();else setTimeout(close,50);
    log('disposed',{owner:o.id,hard});
  }
  function interrupt(o) {
    operation++;
    pending=null;
    o.abort.abort();
    o.abort=new AbortController();
  }
  function stop(hard=false){if(hard)for(const e of retired)void e.ctx.close().catch(()=>{});consent=false;generation++;operation++;pending=null;const old=owner;owner=null;status='disabled';detail=null;dispose(old,hard);notify();}
  function makeOwner(){const ctx=makeContext();const master=ctx.createGain(),life=ctx.createGain(),buses={};master.gain.value=muted?0:levels.master;life.gain.value=0;master.connect(life);life.connect(ctx.destination);
    for(const k of ['music','ambience','rain']){buses[k]=ctx.createGain();buses[k].gain.value=levels[k]*BUS_GAIN[k];buses[k].connect(master);}
    const o={id:generation,ctx,master,life,buses,buffers:new Map(),errors:{},slots:new Map(),abort:new AbortController(),origin:null,started:false,complete:false,transfer:createTransferMetrics()};
    ctx.onstatechange=()=>{if(current(o)&&ctx.state!=='running'&&(status==='enabled'||ctx.state==='interrupted')){interrupt(o);cancelEvents('context interruption');o.life.gain.cancelScheduledValues(ctx.currentTime);o.life.gain.setValueAtTime(0,ctx.currentTime);status=page.hidden?'hidden':'resume';notify();}};return o;
  }
  function source(o,key,at,loop,offset=0) {
    const def=AUDIO_ASSETS[key],s=o.ctx.createBufferSource(),gain=o.ctx.createGain();
    s.buffer=o.buffers.get(key);
    s.loop=loop;
    if(loop){
      s.loopStart=0;
      s.loopEnd=key==='music'?s.buffer.duration:def.seconds;
      gain.gain.value=0;
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(1,at+1);
    } else gain.gain.value=key==='hover'?0:1;
    let pan=null;
    s.connect(gain);
    if(key==='hover'&&o.ctx.createStereoPanner){
      pan=o.ctx.createStereoPanner();gain.connect(pan);pan.connect(o.buses[def.bus]);
    } else gain.connect(o.buses[def.bus]);
    const slot={source:s,gain,pan,cancelling:false};
    s.onended=()=>finishSlot(o,key,slot);
    try { s.start(at,offset); }
    catch(error) {s.disconnect();gain.disconnect();pan?.disconnect();throw error;}
    o.slots.set(key,slot);
    log('start',{key,owner:o.id,at,offset,loop,seconds:loop?s.loopEnd:def.seconds});
    return slot;
  }
  function startBed(o, key) {
    const def = AUDIO_ASSETS[key];
    const soon = o.ctx.currentTime + .03;
    o.origin ??= soon - def.delay;
    const due = o.origin + def.delay;
    // Music starts at its opening. Late ambience beds join the shared clock in phase.
    const offset = key === 'music' ? 0 : Math.max(0, soon - due) % def.seconds;
    source(o, key, Math.max(soon, due), true, offset);
    o.started = true;
  }
  async function loadLayer(o, key, ticket, signal) {
    let packet;
    try {
      packet = await loadBytes(key, {fetchFile,signal,valid:()=>valid(o,ticket),metrics:o.transfer});
      if (!valid(o,ticket)) return;
      const buffer = await o.ctx.decodeAudioData(packet.bytes);
      if (!valid(o,ticket)) return;
      const def = AUDIO_ASSETS[key];
      const extraFrames = Math.round((buffer.duration - def.seconds) * buffer.sampleRate);
      const maxExtraFrames = key === 'music' ? 1 + Math.ceil(MUSIC_PADDING_SECONDS * buffer.sampleRate) : 1;
      if (buffer.numberOfChannels !== 2 || extraFrames < -1 || extraFrames > maxExtraFrames)
        throw Error('Unexpected decoded duration/channels');
      o.buffers.set(key,buffer);
      if (def.loop) startBed(o,key);
      log('decoded',{key,owner:o.id,duration:buffer.duration,sampleRate:buffer.sampleRate});
    } catch (error) {
      if (valid(o,ticket)) {
        o.buffers.delete(key);
        o.errors[key]=String(error);
        log('layer failure',{key,error:String(error)});
      }
    } finally {
      packet?.release();
    }
  }
  function showEnabled(o) {
    if (status === 'enabled') return;
    ramp(o.life.gain,1,.05,o.ctx);
    status='enabled';
    notify();
  }
  async function activate() {
    if (status==='unavailable' && consent) stop(true);
    if (!secure()) {
      status='unavailable';detail='secure-context';notify();return false;
    }
    if (page.hidden) return false;
    if (pending) return pending;
    if (consent && owner?.complete && status==='enabled') return true;
    if (!consent) {
      consent=true;generation++;operation++;
      try { owner=makeOwner(); }
      catch(e) {
        consent=false;status='unavailable';detail='web-audio';
        log('context failure',{error:String(e)});notify();return false;
      }
    }
    const o=owner,ticket=++operation,signal=o.abort.signal;
    status='loading';detail=null;notify();
    const run=(async()=>{
      try {
        await resumeContext(o.ctx,signal,()=>!current(o));
        if (!valid(o,ticket)) return false;
        await Promise.all([...retired].map(e=>e.closed));
        if (!valid(o,ticket)) return false;
        if (o.ctx.state!=='running') {status='resume';return false;}
        if (o.started) showEnabled(o);
        // Prioritise a short bed with an audible bus, then complete the accepted mix and cues.
        const order=levels.rain===0 && levels.music>0 ? ['music', ...LOAD_ORDER.filter(key=>key!=='music')] : LOAD_ORDER;
        for (const key of order) {
          if (!valid(o,ticket)) return false;
          if (o.buffers.has(key)||o.errors[key]) continue;
          await loadLayer(o,key,ticket,signal);
          if (!valid(o,ticket)) return false;
          if (o.slots.has(key) && levels[AUDIO_ASSETS[key].bus]>0) showEnabled(o);
        }
        if (!o.started) {status='unavailable';detail='layers';return false;}
        showEnabled(o);
        o.complete=true;
        ready(o.id);
        return true;
      } catch (e) {
        if (valid(o,ticket)) {
          status='resume';
          log('resume failure',{owner:o.id,error:String(e)});
        }
        return false;
      }
    })();
    pending=run;
    try { return await run; }
    finally { if(current(o)&&operation===ticket){pending=null;notify();} }
  }
  function visibility() {
    const o=owner;
    if (!o) return;
    if (page.hidden) {
      interrupt(o);
      cancelEvents('hidden');status='hidden';ramp(o.life.gain,0,.05,o.ctx);
      // The audio clock keeps bed playheads across suspension.
      void o.ctx.suspend().catch(()=>{});notify();
    } else if (o.started) {
      void activate();
    } else {
      status='resume';notify();
    }
  }
  function setLevel(key,value){if(!(key in levels))return;levels[key]=bounded(value);try{storage.setItem('site01-audio-levels',JSON.stringify({...levels,muted}));}catch{}
    const o=owner;if(o)ramp(key==='master'?o.master.gain:o.buses[key].gain,key==='master'?(muted?0:levels[key]):levels[key]*BUS_GAIN[key],.1,o.ctx);
    if(!levels.master||!levels.ambience)cancelEvents('inaudible');notify();}
  function mute(value){muted=!!value;try{storage.setItem('site01-audio-levels',JSON.stringify({...levels,muted}));}catch{}if(owner)ramp(owner.master.gain,muted?0:levels.master,.02,owner.ctx);if(muted)cancelEvents('mute');notify();}
  function toggle(){
    if(status==='loading'){stop();return Promise.resolve(false);}
    if(!consent||status==='resume'||status==='hidden'||status==='unavailable'){mute(false);return activate();}
    mute(!muted);return Promise.resolve(!muted);
  }
  function updateFlyby({gain=0,rate=1,pan=0}={}){const o=owner,s=o?.slots.get('hover');if(!s||s.cancelling||!current(o)||!canCue())return;
    ramp(s.gain.gain,Math.max(0,Math.min(2.8,gain)),.08,o.ctx);
    if(s.source.playbackRate)ramp(s.source.playbackRate,Math.max(.94,Math.min(1.06,rate)),.08,o.ctx);
    if(s.pan)ramp(s.pan.pan,Math.max(-1,Math.min(1,pan)),.08,o.ctx);
  }
  const canCue=()=>!!owner&&current(owner)&&owner.complete&&!page.hidden&&status==='enabled'&&owner.ctx.state==='running'&&!muted&&levels.master>0&&levels.ambience>0;
  function playCue(key){const o=owner;if(blockedCues[key])return false;if(!o||!current(o)||!o.complete||page.hidden||status!=='enabled'||o.ctx.state!=='running'||muted||!levels.master||!levels.ambience||!o.buffers.has(key)||o.slots.has(key)||AUDIO_ASSETS[key]?.loop)return false;
    source(o,key,o.ctx.currentTime,false);return true;}
  function info(){return {status,detail,consent,generation,owner:owner?.id??null,context:owner?.ctx.state??null,started:owner?.started??false,levels:{...levels},muted,unavailable:{...blockedCues,...owner?.errors},active:[...owner?.slots.keys()||[]],history:[...history],transfer:owner?.transfer.snapshot()??null,requestBounds:transportRequests()};}
  return {enable:activate,resume:activate,toggle,updateFlyby,stop,visibility,needsScene:()=>consent&&!!owner&&owner.ctx.state==='running',setLevel,mute,cancelEvents,cancelCue:(key,reason)=>cancelEvents(reason,key),playCue,info,canCue};
}
