import {mkdirSync,writeFileSync} from 'node:fs';
const ROOT='/opt/server-agent/workspace/st-testdata/redesign/visual-fixes';
export default async function(T){
 mkdirSync(ROOT,{recursive:true}); const out={};
 for(const phone of [false,true]){
  const p=await T.newPage({phone});await T.prepare(p);await T.boot(p,{ag2:true});
  await p.evaluate(async()=>{const b=document.querySelector('#ag2-shell').dataset.build;window.u=await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/util.js?v=${b}`);window.s=await u.loadSettings();});
  const key=phone?'phone':'desktop';out[key]={};
  await T.openChat(p,await T.longChat(p));
  out[key].host=await p.evaluate(async()=>({select2:await(await fetch('/css/select2-overrides.css')).text(),focusRules:[...document.styleSheets].flatMap(sh=>{try{return [...sh.cssRules].filter(r=>/focus/.test(r.selectorText||'')).map(r=>({href:sh.href,css:r.cssText}));}catch{return[];}})}));
  await p.evaluate(()=>s.open('ai'));await T.sleep(500);
  const link=p.locator('#left-nav-panel a:visible').first();await link.focus();
  out[key].focus=await link.evaluate(e=>({html:e.outerHTML,outline:getComputedStyle(e).outline,shadow:getComputedStyle(e).boxShadow,visible:e.matches(':focus-visible')}));
  const cdp=await p.context().newCDPSession(p);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  const doc=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
  const node=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#left-nav-panel a'});
  out[key].matchedFocus=await cdp.send('CSS.getMatchedStylesForNode',{nodeId:node.nodeId});
  const select=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#settings_preset_openai'});
  out[key].selectUA=await cdp.send('DOM.describeNode',{nodeId:select.nodeId,depth:-1,pierce:true});
  out[key].select=await p.locator('#settings_preset_openai').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth,css:getComputedStyle(e).cssText,white:getComputedStyle(e).whiteSpace,overflow:getComputedStyle(e).overflow}));
  await sshot('ai');await p.evaluate(()=>s.open(null));await T.sleep(300);
  out[key].settingsFocus=await p.evaluate(()=>({html:document.activeElement.outerHTML,outline:getComputedStyle(document.activeElement).outline,shadow:getComputedStyle(document.activeElement).boxShadow}));
  await p.evaluate(()=>s.close());await T.sleep(400);
  await p.evaluate(()=>{const c=document.querySelector('#chat');c.scrollTop=c.scrollHeight-500;});
  out[key].dock=await p.evaluate(()=>{const d={};for(const s of ['#chat','#form_sheld','#qr-bar','#nonQRFormItems','#ag2-tabbar','.ag2-side-list']){const e=document.querySelector(s);if(e)d[s]={rect:e.getBoundingClientRect(),padding:getComputedStyle(e).padding,mask:getComputedStyle(e).maskImage};}d.h=getComputedStyle(document.body).getPropertyValue('--ag2-dock-h');return d;});
  await sshot('dock');
  if(!phone){out[key].title=[];for(const width of [1001,1100,1240,1440]){await p.setViewportSize({width,height:900});await p.evaluate(()=>u.setInspector(true));await T.sleep(600);out[key].title.push(await p.evaluate(()=>({w:innerWidth,title:document.querySelector('#ag2-title').getBoundingClientRect(),tools:document.querySelector('#ag2-tools').getBoundingClientRect(),panel:document.querySelector('#right-nav-panel').getBoundingClientRect()})));}}
  out[key].errors=T.errors(p);writeFileSync(ROOT+'/probe.json',JSON.stringify(out,null,2));await p.goto('about:blank');
  async function sshot(n){await T.shot(p,`before-${key}-${n}`,{animations:'allow'});}
 }
 return {ok:true,out};
}
