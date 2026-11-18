import './settings-ui.js';
import { createAudioEngine } from './audio-engine.js';

const root=document.querySelector('#sound-controls');
const state=root.querySelector('#sound-status'),enable=root.querySelector('#sound-enable'),stop=root.querySelector('#sound-stop'),mute=document.getElementById('sound-mute');
const announcement=document.getElementById('sound-announcement');
const secureLink=document.getElementById('sound-secure-link');
export const audio=createAudioEngine({change:update,ready:id=>dispatchEvent(new CustomEvent('site01:audio-ready',{detail:id}))});

function update(info=audio.info()) {
  const {status,detail,consent,muted,levels}=info;
  const loading=status==='loading';
  enable.textContent=loading?'Loading sound…':status==='resume'?'Resume sound':status==='unavailable'?'Retry sound':consent?'Sound enabled':'Enable sound';
  enable.disabled=loading||status==='enabled'||detail==='secure-context';
  stop.disabled=!consent;
  mute.setAttribute('aria-pressed',String(consent&&!muted&&!loading&&status==='enabled'));
  mute.dataset.audible=String(consent&&status==='enabled'&&!muted&&levels.master>0);
  const label=detail==='secure-context'?'Sound requires HTTPS':status==='unavailable'?'Sound unavailable. Retry sound':loading?'Cancel loading sound':!consent?'Enable sound':status==='resume'?'Resume sound':muted?'Unmute sound':'Mute sound';
  mute.setAttribute('aria-label',label);
  mute.title=label;
  for(const input of root.querySelectorAll('input[data-bus]')){
    input.value=Math.round(levels[input.dataset.bus]*100);
    input.nextElementSibling.textContent=input.value+'%';
  }

  const errors=Object.keys(info.unavailable);
  const message={
    disabled:'Sound off. Enable sound on this page to listen.',
    hidden:'Sound suspended while this page is hidden.',
    unavailable:detail==='secure-context'?'Sound requires HTTPS.':detail==='web-audio'?'This browser could not start sound. Retry sound to listen.':'Sound unavailable. Retry sound to listen.',
    resume:'Sound paused by the browser. Resume sound to continue.',
    loading:'Loading sound…',
    enabled:muted?'Sound muted.':'Sound enabled.',
  }[status];
  const settingsMessage=errors.length?message+' Unavailable layers: '+errors.join(', ')+'.':message;
  if (state.textContent!==settingsMessage) state.textContent=settingsMessage;
  if (announcement.textContent!==message) announcement.textContent=message;
  announcement.classList.toggle('sr-only',!loading&&status!=='unavailable'&&status!=='resume');
  secureLink.hidden=detail!=='secure-context';
  if (!secureLink.hidden) {
    const url=new URL(location.href);
    url.protocol='https:';
    secureLink.href=url.href;
  }
  dispatchEvent(new Event('site01:audio-state'));
}
enable.addEventListener('click',()=>void audio.enable());
stop.addEventListener('click',()=>audio.stop());
mute.addEventListener('click',()=>void audio.toggle());
for(const input of root.querySelectorAll('input[data-bus]'))input.addEventListener('input',()=>audio.setLevel(input.dataset.bus,Number(input.value)/100));
document.addEventListener('visibilitychange',()=>audio.visibility());
addEventListener('pagehide',()=>audio.stop(true));
addEventListener('pageshow',()=>audio.stop(true));
window.NPAudio=audio;
mute.disabled=false;
update();
