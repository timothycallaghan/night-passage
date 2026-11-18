// Supplied Opus diagrams; local pause affects diagrams only. Scene/system/hidden
// state is read one-way and can never be overridden by the local control.
export function diagramPauseState({localPaused=false,scenePaused=false,reduced=false,hidden=false,ready=true,unavailable=false}={}){
  const reason=reduced?'system':hidden?'hidden':unavailable?'unavailable':!ready?'loading':scenePaused?'scene':localPaused?'local':'running';
  const blocked=!['running','local'].includes(reason);
  const label={system:'Diagrams paused by system',hidden:'Diagrams paused while hidden',unavailable:'Diagrams paused: scene unavailable',loading:'Preparing diagrams',scene:'Diagrams paused with scene',local:'Resume diagrams',running:'Pause diagrams'}[reason];
  return {paused:reason!=='running',blocked,reason,label,localPaused,reduced,hidden,scenePaused};
}
export function installAboutDiagrams({host=window,page=document}={}){
  const root=page.documentElement,button=page.getElementById('about-anim'),panel=page.getElementById('about-story');
  const reduce=host.matchMedia('(prefers-reduced-motion: reduce)');let localPaused=false,current;
  root.classList.add('about-js');
  function sync(){
    const motion=host.NP?.motion?.();
    current=diagramPauseState({localPaused,reduced:reduce.matches,hidden:page.hidden,scenePaused:!!motion?.paused,ready:!!motion&&host.NP?.ready!==false,unavailable:host.g2?.state==='fallback'});
    root.classList.toggle('about-paused',current.paused);root.dataset.diagramPaused=String(current.paused);root.dataset.diagramPauseReason=current.reason;
    if(button){button.disabled=current.blocked;button.textContent=current.label;button.setAttribute('aria-pressed',String(current.paused));button.title=current.blocked?current.label:'Pause or resume diagrams only';}
  }
  button?.addEventListener('click',()=>{if(current.blocked)return;localPaused=!localPaused;sync();});
  reduce.addEventListener?.('change',sync);host.addEventListener('np:motion',sync);page.addEventListener('visibilitychange',sync);
  const figures=panel?.querySelectorAll('.fig')||[];
  if(host.IntersectionObserver){
    const io=new host.IntersectionObserver(entries=>{for(const e of entries){e.target.classList.toggle('live',e.isIntersecting);if(e.isIntersecting)e.target.classList.add('seen');}},{root:panel,threshold:[0,.05,.2]});
    figures.forEach(f=>io.observe(f));
  }else figures.forEach(f=>f.classList.add('live','seen'));
  sync();return {sync,info:()=>({...current})};
}
