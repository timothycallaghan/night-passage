const panel=document.getElementById('sound-controls');
const toggle=document.getElementById('settings-toggle');
const focusable=()=>[...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]:not([hidden])')];
export function setSettingsOpen(open,restore=true) {
  panel.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'Close settings':'Open settings');
  if(open)focusable()[0]?.focus();
  else if(restore)toggle.focus();
}
toggle.addEventListener('click',()=>setSettingsOpen(panel.hidden));
toggle.disabled=false;
document.getElementById('settings-close').addEventListener('click',()=>setSettingsOpen(false));
document.addEventListener('keydown',event=>{
  if(panel.hidden)return;
  if(event.key==='Escape'){event.preventDefault();setSettingsOpen(false);}
  if(event.key==='Tab'){
    const items=focusable(),first=items[0],last=items.at(-1),active=document.activeElement;
    if(event.shiftKey&&(active===first||!panel.contains(active))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(active===last||!panel.contains(active))){event.preventDefault();first?.focus();}
  }
});
document.addEventListener('pointerdown',event=>{
  if(!panel.hidden&&!panel.contains(event.target)&&!toggle.contains(event.target))setSettingsOpen(false,false);
},{passive:true});
