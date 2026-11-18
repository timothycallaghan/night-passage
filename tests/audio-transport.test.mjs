import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {loadAudioBytes,createTransferMetrics,createRequestLimiter,sha256Hex,MAX_PART_BYTES}from '../site/src/audio-transport.js';
import {AUDIO_TRANSPORT}from '../site/src/audio-manifest.js';
import {createAudioEngine,AUDIO_ASSETS}from '../site/src/audio-engine.js';
const hash=b=>crypto.createHash('sha256').update(new Uint8Array(b)).digest('hex');
const array=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const tick=()=>new Promise(r=>setTimeout(r,0));const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture(key='music'){
 const bodies=[Buffer.from('RIFF verified bytes '),Buffer.from('ordered transport data')];const all=Buffer.concat(bodies);let offset=0;
 const parts=bodies.map((b,index)=>{const p={index,offset,bytes:b.length,sha256:hash(array(b)),path:`../assets/audio/parts/${key}/${String(index).padStart(3,'0')}.bin`};offset+=b.length;return p;});
 return{manifest:{bytes:all.length,sha256:hash(array(all)),parts},bodies,all};
}
function fetcher(f,{missing=false,corrupt=false,reorder=false,wait=null}={}){return async(url,{signal}={})=>{
 const index=Number(new URL(url).pathname.split('/').at(-1).slice(0,3));if(wait)await wait;
 const data=Buffer.from(f.bodies[reorder?1-index:index]);if(corrupt&&index===0)data[0]^=1;
 return{ok:!(missing&&index===0),status:missing&&index===0?404:200,arrayBuffer:async()=>array(data)};
};}
test('the replacement M4A and six unchanged WAVs assemble from exact verified parts',async()=>{
 for(const[key,m]of Object.entries(AUDIO_TRANSPORT)){
  const metrics=createTransferMetrics();const packet=await loadAudioBytes(key,{manifest:m,metrics,fetchFile:async url=>{const b=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>array(b)};}});
  assert.equal(packet.bytes.byteLength,m.bytes);assert.equal(hash(packet.bytes),m.sha256);
  assert.equal(m.file,AUDIO_ASSETS[key].file);
  assert.ok(m.parts.every(p=>p.bytes<=MAX_PART_BYTES&&p.bytes<=524288));
  if (key === 'music') {
   assert.equal(m.sha256,'d2a63fb009070a6900725259ae827d18f4d570684d23ec108d66d670dec35b40');
   assert.equal(m.bytes,4335372);
   assert.equal(Buffer.from(packet.bytes,4,8).toString(),'ftypM4A ');
   assert.equal(m.folder,'neon-rain-blues');
   assert.equal(m.parts.length,9);
  } else {
   const view=new DataView(packet.bytes);assert.equal(Buffer.from(packet.bytes,0,4).toString(),'RIFF');let p=12,rate,channels,bits,frames;
   while(p+8<=view.byteLength){const id=Buffer.from(packet.bytes,p,4).toString(),n=view.getUint32(p+4,true);if(id==='fmt '){channels=view.getUint16(p+10,true);rate=view.getUint32(p+12,true);bits=view.getUint16(p+22,true);}if(id==='data')frames=n/(channels*bits/8);p+=8+n+(n%2);}
   assert.equal(rate,44100);assert.equal(bits,24);assert.equal(channels,2);assert.equal(frames/rate,AUDIO_ASSETS[key].seconds);
  }
  packet.release();assert.equal(packet.bytes,null);assert.equal(metrics.snapshot().assemblyBytes,0);assert.equal(metrics.snapshot().chunkBytes,0);assert.equal(metrics.snapshot().cryptoCopyBytes,0);assert.equal(metrics.snapshot().verifiedLayers,1);
 }
 assert.equal(Object.values(AUDIO_TRANSPORT).reduce((n,m)=>n+m.parts.length,0),54);
});
for(const mode of ['missing','corrupt','reorder'])test(mode+' part data rejects before decode and releases memory',async()=>{
 const f=fixture(),metrics=createTransferMetrics();await assert.rejects(loadAudioBytes('music',{manifest:f.manifest,metrics,fetchFile:fetcher(f,{[mode]:true})}));const s=metrics.snapshot();assert.equal(s.assemblyBytes+s.chunkBytes+s.cryptoCopyBytes,0);assert.equal(s.verifiedLayers,0);
});
test('missing/reordered manifest parts are rejected before network or allocation',async()=>{
 const f=fixture();for(const parts of [[f.manifest.parts[0]],[...f.manifest.parts].reverse()]){let calls=0;await assert.rejects(loadAudioBytes('music',{manifest:{...f.manifest,parts},fetchFile:()=>{calls++;}}));assert.equal(calls,0);}
});
test('out-of-order network completion reassembles in source order; only 2 requests globally',async()=>{
 const f=fixture(),limiter=createRequestLimiter(2),metrics=createTransferMetrics(),gate=deferred();let second=false;
 const packetPromise=loadAudioBytes('music',{manifest:f.manifest,metrics,requestLimiter:limiter,fetchFile:async url=>{const n=Number(new URL(url).pathname.split('/').at(-1).slice(0,3));if(n===0)await gate.promise;else second=true;return{ok:true,arrayBuffer:async()=>array(f.bodies[n])};}});
 await tick();assert.equal(second,true);assert.equal(limiter.snapshot().peak,2);gate.resolve();const p=await packetPromise;assert.deepEqual(Buffer.from(p.bytes),f.all);p.release();assert.equal(limiter.snapshot().active,0);
});
for(const stage of ['fetch','arraybuffer','part-hash','complete-hash'])test('Stop during '+stage+' prevents stale results and releases assembled storage',async()=>{
 const f=fixture(),metrics=createTransferMetrics(),abort=new AbortController(),gate=deferred();let reached=false;
 const fetchFile=async url=>{const n=Number(new URL(url).pathname.split('/').at(-1).slice(0,3));if(stage==='fetch'){reached=true;await gate.promise;}return{ok:true,arrayBuffer:async()=>{if(stage==='arraybuffer'){reached=true;await gate.promise;}return array(f.bodies[n]);}};};
 const h=async bytes=>{if((stage==='part-hash'&&bytes.byteLength!==f.all.length)||(stage==='complete-hash'&&bytes.byteLength===f.all.length)){reached=true;await gate.promise;}return hash(bytes);};
 const promise=loadAudioBytes('music',{manifest:f.manifest,metrics,signal:abort.signal,fetchFile,hash:h});await tick();assert.equal(reached,true);abort.abort();assert.equal(metrics.snapshot().assemblyBytes,0);gate.resolve();await assert.rejects(promise,{name:'AbortError'});const s=metrics.snapshot();assert.equal(s.assemblyBytes+s.chunkBytes+s.cryptoCopyBytes,0);assert.equal(s.verifiedLayers,0);
});
function engineRig(holdStage){
 const contexts=[],first=deferred();let firstOwner=true,reached=false,decodeCalls=0,fetches=0;
 class Param{value=1;cancelScheduledValues(){}cancelAndHoldAtTime(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
 class Node{gain=new Param();connect(){}disconnect(){}start(){this.started=true;}stop(){}}
 class Context{state='suspended';currentTime=0;sampleRate=48000;destination={};constructor(){contexts.push(this);}createGain(){return new Node();}createBufferSource(){return new Node();}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}async decodeAudioData(bytes){decodeCalls++;if(firstOwner&&holdStage==='decode'){reached=true;await first.promise;}return{numberOfChannels:2,duration:AUDIO_ASSETS[bytes.key].seconds,sampleRate:48000};}}
 const limiter=createRequestLimiter(2);
 const load=async(key,options)=>{const f=fixture(key),old=firstOwner;const p=await loadAudioBytes(key,{...options,manifest:f.manifest,requestLimiter:limiter,fetchFile:async url=>{fetches++;if(old&&holdStage==='fetch'){reached=true;await first.promise;}return fetcher(f,{missing:holdStage==='missing-rain'&&key==='rain'})(url);},hash:async bytes=>{if(old&&holdStage==='hash'){reached=true;await first.promise;}return hash(bytes);}});p.bytes.key=key;return p;};
 const e=createAudioEngine({makeContext:()=>new Context(),loadBytes:load,page:{hidden:false},storage:{getItem:()=>null,setItem(){}},blockedCues:{kitchen:'unchanged guard'}});
 return{e,contexts,first,get reached(){return reached;},get decodeCalls(){return decodeCalls;},get fetches(){return fetches;},newOwner:()=>firstOwner=false,limiter};
}
for(const stage of ['fetch','hash','decode'])test('integrated engine Stop during '+stage+' cannot schedule stale sources or affect new generation',async()=>{
 const r=engineRig(stage);assert.equal(r.fetches,0);const old=r.e.enable();await tick();assert.equal(r.reached,true);r.e.stop(true);r.newOwner();const fresh=r.e.enable();await tick();r.first.resolve();await Promise.all([old,fresh]);const id=r.e.info().owner;assert.equal(r.contexts.length,2);assert.equal(r.contexts[0].state,'closed');assert.equal(r.e.info().history.filter(x=>x.kind==='start'&&x.owner!==id).length,0);assert.ok(r.limiter.snapshot().peak<=2);r.e.stop(true);
});
test('integrated missing layer preserves other decoded beds and user level controls',async()=>{
 const r=engineRig('missing-rain');await r.e.enable();assert.ok(r.e.info().unavailable.rain);assert.equal(r.e.info().active.includes('rain'),false);assert.ok(r.e.info().active.includes('music'));r.e.setLevel('rain',.3);assert.equal(r.e.info().levels.rain,.3);assert.equal(r.e.playCue('kitchen'),false);r.e.stop(true);
});
