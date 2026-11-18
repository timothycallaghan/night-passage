import { AUDIO_TRANSPORT } from './audio-manifest.js';
export const MAX_PART_BYTES=2*1024*1024;
const abortError=()=>Object.assign(new Error('Audio load cancelled'),{name:'AbortError'});
export function sha256Hex(bytes){const result=globalThis.crypto.subtle.digest('SHA-256',bytes);bytes=null;return result.then(hash=>Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''));}
export function createTransferMetrics(){
  const s={requests:0,receivedBytes:0,activeRequests:0,maxActiveRequests:0,assemblyBytes:0,chunkBytes:0,cryptoCopyBytes:0,peakTransportBytes:0,verifiedLayers:0,integrityChecks:0};
  return {add(k,n){s[k]+=n;if(k==='activeRequests')s.maxActiveRequests=Math.max(s.maxActiveRequests,s.activeRequests);s.peakTransportBytes=Math.max(s.peakTransportBytes,s.assemblyBytes+s.chunkBytes+s.cryptoCopyBytes);},snapshot:()=>({...s})};
}
// Shared by all consent generations in this document, including retiring loads.
export function createRequestLimiter(limit=2){let active=0,peak=0;const queue=[];
  function pump(){while(active<limit&&queue.length){const e=queue.shift();e.remove();if(e.signal?.aborted||!e.valid()){e.reject(abortError());continue;}active++;peak=Math.max(peak,active);let released=false;e.resolve(()=>{if(released)return;released=true;active--;pump();});}}
  return {async run(fn,valid,signal){const release=await new Promise((resolve,reject)=>{const e={resolve,reject,valid,signal,remove:()=>signal?.removeEventListener('abort',cancel)};function cancel(){const i=queue.indexOf(e);if(i>=0){queue.splice(i,1);e.remove();reject(abortError());}}if(signal?.aborted||!valid()){reject(abortError());return;}signal?.addEventListener('abort',cancel,{once:true});queue.push(e);pump();});try{if(signal?.aborted||!valid())throw abortError();return await fn();}finally{release();}},snapshot:()=>({active,peak,queued:queue.length,limit})};
}
const limiter=createRequestLimiter(2);
export const transportRequests=()=>limiter.snapshot();
export async function loadAudioBytes(key,{fetchFile=(...a)=>fetch(...a),signal,valid=()=>true,hash=sha256Hex,metrics=createTransferMetrics(),requestLimiter=limiter,manifest=AUDIO_TRANSPORT[key]}={}){
  const def=manifest;const check=()=>{if(signal?.aborted||local.signal.aborted||!valid())throw abortError();};const local=new AbortController();
  let assembly=null,assemblyHeld=0,transferred=false,next=0;
  const releaseAssembly=()=>{if(assemblyHeld){metrics.add('assemblyBytes',-assemblyHeld);assemblyHeld=0;}assembly=null;};
  const cancel=()=>{local.abort();releaseAssembly();};signal?.addEventListener('abort',cancel,{once:true});
  async function digest(buffer){check();const size=buffer.byteLength;metrics.add('integrityChecks',1);metrics.add('cryptoCopyBytes',size);try{const pending=hash(buffer);buffer=null;const value=await pending;check();return value;}finally{metrics.add('cryptoCopyBytes',-size);}}
  try{
    check();if(!def||!Number.isSafeInteger(def.bytes)||def.bytes<=0||def.bytes>25*1024*1024||!/^[a-f0-9]{64}$/.test(def.sha256)||!Array.isArray(def.parts)||!def.parts.length)throw Error('Invalid audio manifest');
    const folder = def.folder ?? key;
    if (!/^[a-z0-9-]+$/.test(folder) || def.parts.length > 1000) throw Error('Invalid audio part directory');
    let offset=0;for(const[p,part]of def.parts.entries()){
      const path = `../assets/audio/parts/${folder}/${String(p).padStart(3,'0')}.bin`;
      if(part.index!==p||part.offset!==offset||!Number.isSafeInteger(part.bytes)||part.bytes<=0||part.bytes>MAX_PART_BYTES||!/^[a-f0-9]{64}$/.test(part.sha256)||part.path!==path)throw Error('Invalid audio part order/metadata');offset+=part.bytes;
    }if(offset!==def.bytes)throw Error('Incomplete audio manifest');
    check();assembly=new Uint8Array(def.bytes);assemblyHeld=def.bytes;metrics.add('assemblyBytes',assemblyHeld);
    async function worker(){let chunk=null,held=0;const release=()=>{if(held){metrics.add('chunkBytes',-held);held=0;}chunk=null;};local.signal.addEventListener('abort',release);
      try{while(next<def.parts.length){check();const part=def.parts[next++];
        try{
          chunk=await requestLimiter.run(async()=>{check();metrics.add('requests',1);metrics.add('activeRequests',1);try{
            const response=await fetchFile(new URL(part.path,import.meta.url),{signal:local.signal});check();if(!response.ok)throw Error('Audio request failed: HTTP '+response.status);
            const bytes=await response.arrayBuffer();check();return bytes;
          }finally{metrics.add('activeRequests',-1);}},()=>!local.signal.aborted&&!signal?.aborted&&valid(),local.signal);
          check();held=chunk.byteLength;metrics.add('chunkBytes',held);metrics.add('receivedBytes',held);
          if(held!==part.bytes)throw Error('Audio part length mismatch');const actual=await digest(chunk);check();if(actual!==part.sha256)throw Error('Audio integrity check failed');
          assembly.set(new Uint8Array(chunk),part.offset);
        }finally{release();}
      }}finally{local.signal.removeEventListener('abort',release);release();}}
    const workers=[worker(),worker()];try{await Promise.all(workers);}catch(e){cancel();await Promise.allSettled(workers);throw e;}
    check();const complete=await digest(assembly.buffer);check();if(complete!==def.sha256)throw Error('Complete audio integrity check failed');metrics.add('verifiedLayers',1);
    const result={bytes:assembly.buffer,release(){releaseAssembly();this.bytes=null;}};transferred=true;assembly=null;return result;
  }finally{signal?.removeEventListener('abort',cancel);if(!transferred)releaseAssembly();local.abort();}
}
