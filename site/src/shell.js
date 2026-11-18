import { audio } from './audio-ui.js';
import './page-navigation.js';
import { resolveQuality,saveQuality } from './quality.js';
const qs = new URLSearchParams(location.search);
const status = document.getElementById('scene-status');
const button = document.getElementById('motion');
const quality = document.getElementById('quality');
const reset = document.getElementById('reset-view');
const selected=resolveQuality(qs.get('preset'),{getItem:key=>sessionStorage.getItem(key)});
window.npQuality = selected;
quality.value = selected;
// Explicit handler also supports clients whose synthetic click does not activate native form submission.
const form=document.querySelector('.controls form');
function applyQuality(event) {
  event.preventDefault();
  const url=new URL(location.href); url.searchParams.set('preset',quality.value); url.searchParams.delete('scene');
  saveQuality(quality.value,{setItem:(key,value)=>sessionStorage.setItem(key,value)});
  location.assign(url.href);
}
form.addEventListener('submit',applyQuality);
form.querySelector('button').addEventListener('click',applyQuality);
if (qs.get('overlay') === '0') document.body.classList.add('no-overlay');
if (qs.has('capture')) document.body.classList.add('no-wip');
if (qs.get('text') === '0') document.body.classList.add('no-text');
window.g2 = { state:'loading', failures:[], violations:[], errors:[], startedAt:performance.now() };
addEventListener('securitypolicyviolation',e=>g2.violations.push({directive:e.violatedDirective,blocked:e.blockedURI}));
addEventListener('error',e=>g2.errors.push(String(e.message)));
addEventListener('unhandledrejection',e=>g2.errors.push(String(e.reason)));
function fail(reason) {
  document.documentElement.dataset.scenePaused='true';
  g2.state='fallback'; g2.failures.push(String(reason));
  document.body.classList.add('scene-failed');
  document.documentElement.classList.remove('scene-ready');
  status.textContent='Scene unavailable. Navigation and page content remain available.';
  button.disabled=true; reset.disabled=true;
  window.dispatchEvent(new Event('np:motion'));
}
function syncButton() {
  const motion = window.NP?.motion?.();
  if (!motion) return;
  document.documentElement.dataset.scenePaused=String(motion.paused);
  button.textContent = motion.reduced ? 'Motion reduced by system' : motion.paused ? 'Resume motion' : 'Pause motion';
  button.disabled = motion.reduced || g2.state === 'fallback' || g2.state === 'loading';
  reset.disabled = g2.state === 'fallback' || g2.state === 'loading';
}
window.addEventListener('np:motion', syncButton);
button.addEventListener('click', () => NP.setPaused(!NP.motion().paused));
reset.addEventListener('click',()=>window.NP?.resetView?.());
document.getElementById('scene').addEventListener('webglcontextlost', (e) => { e.preventDefault(); window.NP?.setPaused?.(true); fail('WebGL context lost'); });
if (qs.get('scene')==='off') fail('Scene deliberately disabled');
else {
  const timer=setTimeout(()=>{ if(g2.state==='loading') status.textContent='Scene is taking longer to load. All page content is available.'; },10000);
  try { await import('./main.js');
    if(g2.state!=='fallback') { g2.degraded=[...NP.degraded]; g2.state=g2.degraded.length ? 'degraded' : 'ready'; g2.readyAt=performance.now(); g2.firstFrameAt=NP.firstFrameAt;
      requestAnimationFrame(() => {
        if (g2.state !== 'fallback') document.documentElement.classList.add('scene-ready');
      }); button.disabled=false; status.textContent=g2.degraded.length ? 'Scene partly available. Authored figures could not load; procedural figures are shown. Navigation and page content remain available.' : 'Scene ready.'; window.dispatchEvent(new Event('np:motion')); }
  } catch(e) { fail(e.message); }
  finally { clearTimeout(timer); }
}
