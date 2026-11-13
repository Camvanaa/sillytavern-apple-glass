// Read-only runtime audit; run exclusively through run.mjs safety harness.
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const ROOT='/opt/server-agent/workspace/st-testdata/redesign/motion-audit/runtime';
export default async function(T){
 const mode=T.cfg.part||'normal',view=T.cfg.phone?'phone':'desktop',id=`${view}-${mode}${T.cfg.tag?'-'+T.cfg.tag:''}`,dir=path.join(ROOT,id);
 mkdirSync(dir,{recursive:true});
 const page=await T.newPage({reduced:mode==='os'});page.setDefaultTimeout(12000);
 const result={id,mode,view,steps:[],screenshots:[],failures:[],ok:false};
 const persist=()=>writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));
 await T.prepare(page,{powerUser:{reduced_motion:mode==='st'}});
 await page.addInitScript(()=>{
  window.ma={events:[],frames:[],on:false};
  for(const type of ['animationstart','animationend','animationcancel','transitionrun','transitionstart','transitionend','transitioncancel'])document.addEventListener(type,e=>{if(ma.on)ma.events.push({t:performance.now(),type,target:e.target.id||e.target.className,name:e.animationName||e.propertyName,elapsed:e.elapsedTime});},true);
   const sels=['#ag2-settings','#ag2-settings .ag2-set-body','#ag2-settings .ag2-set-nav','.drawer-content.openDrawer','#right-nav-panel','#right-nav-panel > .scrollableInner','#ag2-sidebar','#sheld','#chat','#ag2-palette','.ag2-menu','#extensionsMenu','dialog.popup[open]','#toast-container > div','#chat .mes.last_mes .mes_text','#ag2-ph-more'];
  window.maSample=()=>{
   const start=performance.now(),els={};
   for(const sel of sels){const e=document.querySelector(sel);if(!e)continue;const c=getComputedStyle(e),r=e.getBoundingClientRect();els[sel]={transform:c.transform,opacity:c.opacity,rect:[r.x,r.y,r.width,r.height],visibility:c.visibility,display:c.display,transition:c.transitionDuration,animation:c.animationDuration,scrollTop:e.scrollTop,overflow:e.scrollWidth>e.clientWidth+1,filter:c.backdropFilter};}
   const animations=document.getAnimations().map(a=>({target:a.effect?.target?.id||a.effect?.target?.className,name:a.animationName||a.transitionProperty,state:a.playState,start:a.startTime,current:a.currentTime,timing:a.effect?.getComputedTiming()}));
   return {t:start,els,animations,body:document.body?.className,page:document.body?.dataset.ag2Set,level:document.querySelector('#ag2-settings')?.dataset.level,dy:document.body?.style.getPropertyValue('--ag2-sheet-dy'),focus:document.activeElement?.id||document.activeElement?.className,cost:performance.now()-start};
  };
  function raf(){if(ma.on)ma.frames.push(maSample());requestAnimationFrame(raf);}requestAnimationFrame(raf);
 });
 const boot=await T.boot(page,{ag2:true,settle:300});result.boot=boot;
 await T.openChat(page,await T.longChat(page));
 await page.evaluate(async()=>{const b='/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/',v=document.querySelector('#ag2-shell').dataset.build;window.ms=await import(b+'settings.js?v='+v);window.mu=await import(b+'util.js?v='+v);});
 result.channels=await page.evaluate(()=>({os:matchMedia('(prefers-reduced-motion: reduce)').matches,st:document.body.classList.contains('reduced-motion'),build:document.querySelector('#ag2-shell').dataset.build}));
 result.naturalChannels={...result.channels};
 if(mode==='os'){
  // ST mirrors the media preference to body automatically. Isolate the CSS media
  // channel in memory, without changing any product/fixture/config file.
  await page.evaluate(()=>{const isolate=()=>{if(document.body.classList.contains('reduced-motion'))document.body.classList.remove('reduced-motion');};isolate();window.maChannelObserver=new MutationObserver(isolate);maChannelObserver.observe(document.body,{attributes:true,attributeFilter:['class']});});
  result.channels.st=await page.evaluate(()=>document.body.classList.contains('reduced-motion'));
 }
 const expected={os:mode==='os',st:mode==='st'};
 if(result.channels.os!==expected.os||result.channels.st!==expected.st)throw Error('Motion channel mismatch '+JSON.stringify(result.channels));
 const baseErrors=new Set(T.errors(page));
 const cdp=await page.context().newCDPSession(page);let film=null;
 cdp.on('Page.screencastFrame',e=>{if(film&&film.length<40)film.push({data:e.data,metadata:e.metadata});void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId});});
 const shot=async(name)=>{const file=path.join(dir,name+'.png');const before=await page.evaluate(()=>performance.now());await page.screenshot({path:file,animations:'allow',caret:'initial',timeout:15000});result.screenshots.push({scene:name,viewport:page.viewportSize(),mode,source:file,tBefore:before,tAfter:await page.evaluate(()=>performance.now()),kind:'original-device-png'});persist();};
 const click=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);if(!e)throw Error('missing '+sel);e.click();},sel);
 const open=p=>page.evaluate(p=>ms.open(p),p);
 const close=()=>page.evaluate(()=>ms.close());
 const esc=()=>page.keyboard.press('Escape');
 const seq=async(name,action,{capture=false,check=null,filmstrip=false}={})=>{
  await page.evaluate(()=>{ma.frames=[];ma.events=[];ma.on=true;ma.frames.push(maSample());});
  if(filmstrip){await shot(name+'-initial');film=[];await cdp.send('Page.startScreencast',{format:'png',everyNthFrame:1});}
  const rec={name};result.steps.push(rec);
  try{
   await action();
   await page.waitForFunction(()=>{const f=ma.frames;if(f.length<5)return false;const now=performance.now(),last=f.at(-1);if(now-f[0].t>4500)return true;const s=x=>JSON.stringify({els:x.els,body:x.body,page:x.page,level:x.level});return now-f[0].t>350&&f.slice(-4).every(x=>s(x)===s(last))&&!last.animations.some(a=>a.state==='running'&&a.timing?.iterations!==Infinity);},null,{timeout:7000,polling:'raf'});
   rec.trace=await page.evaluate(()=>{ma.on=false;return {frames:ma.frames,events:ma.events,final:maSample()};});
   if(check){rec.check=await check();if(rec.check!==true)result.failures.push({name,check:rec.check});}
   if(capture)await shot(name+'-steady');
  }catch(e){rec.error=String(e.stack||e);rec.trace=await page.evaluate(()=>{ma.on=false;return {frames:ma.frames,events:ma.events,final:maSample()};});result.failures.push({name,error:rec.error});throw e;}
  finally{
   if(filmstrip){await cdp.send('Page.stopScreencast');const frames=film||[];film=null;rec.film=frames.map((f,i)=>{const file=path.join(dir,`${name}-film-${String(i).padStart(2,'0')}.png`);writeFileSync(file,Buffer.from(f.data,'base64'));const item={scene:name,viewport:page.viewportSize(),mode,source:file,kind:'cdp-real-frame',metadata:f.metadata};result.screenshots.push(item);return item;});}
   if(rec.trace){writeFileSync(path.join(dir,name+'.trace.json'),JSON.stringify(rec.trace));rec.samples=rec.trace.frames.length;rec.events=rec.trace.events;rec.start=rec.trace.frames[0]?.t;rec.end=rec.trace.final.t;rec.final=rec.trace.final;delete rec.trace;}
   persist();
  }
 };
 const isSet=x=>page.evaluate(x=>ms.isOpen()===x,x);
 if(T.cfg.tag==='visual'){
  try{
   await seq('look-metrics',()=>open('look'),{capture:true});
   result.typography=await page.evaluate(()=>[...document.querySelectorAll('#ag2-settings .ag2-set-lab,#ag2-settings .ag2-set-lab small,#ag2-settings .ag2-set-row,#ag2-settings .ag2-swatches')].map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {class:e.className,text:e.textContent.trim().slice(0,80),rect:[r.x,r.y,r.width,r.height],font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,lineHeight:c.lineHeight,color:c.color,bg:c.backgroundColor,filter:c.backdropFilter,overflow:e.scrollWidth>e.clientWidth+1};}));
   await close();await seq('nested-palette',()=>page.keyboard.press('Control+k'));
   await seq('nested-popup',async()=>{await page.evaluate(async()=>{const p=await import('/scripts/popup.js');void p.callGenericPopup('Esc top-layer verification',p.POPUP_TYPE.INPUT,'Neutral QA');});await page.waitForSelector('dialog.popup[open]');},{capture:true});
   result.topBefore=await page.evaluate(()=>({popup:!!document.querySelector('dialog.popup[open]'),palette:!!document.querySelector('#ag2-palette[open]'),focus:document.activeElement?.className}));
   await seq('nested-first-real-escape',esc,{capture:true});
   result.topAfter=await page.evaluate(()=>({popup:!!document.querySelector('dialog.popup[open]'),palette:!!document.querySelector('#ag2-palette[open]'),focus:document.activeElement?.className}));
   // No assertion disguises the known layer-order failure as a test-runner success.
   if(result.topAfter.popup||!result.topAfter.palette)result.failures.push({name:'top-layer-escape',expected:{popup:false,palette:true},actual:result.topAfter});
   result.ok=result.failures.length===0;
  }finally{persist();await cdp.detach();}
  return {id,ok:result.ok,failures:result.failures};
 }
 if(T.cfg.tag==='repro'){
  try{
   await page.evaluate(()=>{window.mp=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>mp.push({t:performance.now(),type,y:e.clientY,target:e.target.id||e.target.className,trusted:e.isTrusted}),true);});
   for(let i=0;i<3;i++){
    await close();
    await seq('queue-real-escape-'+i,async()=>{await page.evaluate(async()=>{void ms.open('api');await new Promise(r=>setTimeout(r,45));void ms.open('ai');await new Promise(r=>setTimeout(r,45));void ms.open('fmt');});await esc();await page.evaluate(()=>{void ms.close();void ms.open('look');});await page.waitForTimeout(900);},{capture:true,check:()=>page.evaluate(()=>ms.isOpen()&&document.body.dataset.ag2Set==='look')});
   }
   await close();
   if(T.cfg.phone&&mode==='normal')for(const level of [null,'api'])for(const kind of ['stable150','early150','fast45']){
    await open(level);
    if(kind!=='early150')await page.waitForFunction(()=>!document.querySelector('#ag2-settings').getAnimations().some(a=>a.playState==='running'));
    else await T.sleep(80);
    const b=await page.locator('.ag2-set-grab').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
    result.steps.push({name:'hit-'+(level||'list')+'-'+kind,point:{x,y},hit:await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.className,{x,y})});
    await seq('verify-drag-'+(level||'list')+'-'+kind,async()=>{await page.evaluate(()=>mp=[]);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(kind==='fast45'?45:150)}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});},{capture:true});
    result.steps.at(-1).pointerEvents=await page.evaluate(()=>mp);await close();persist();
   }
   result.ok=result.failures.length===0;
  }finally{persist();await cdp.detach();}
  return {id,ok:result.ok,steps:result.steps.length,failures:result.failures};
 }
 if(T.cfg.tag==='extra'){
  try{
   await seq('jump-scroll-up',()=>page.evaluate(()=>{const c=document.querySelector('#chat');c.scrollTop=0;c.dispatchEvent(new Event('scroll'));}));
   result.jumpButton=await page.locator('#ap-jump-latest').count();
   if(result.jumpButton)await seq('jump-latest',()=>click('#ap-jump-latest'),{capture:true});
   await seq('queue-interruption',()=>page.evaluate(async()=>{ms.open('api');await new Promise(r=>setTimeout(r,45));ms.open('ai');await new Promise(r=>setTimeout(r,45));ms.open('fmt');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));ms.close();ms.open('look');}),{capture:true,check:()=>page.evaluate(()=>ms.isOpen()&&document.body.dataset.ag2Set==='look')});
   await close();
   await seq('layer-inspector',()=>page.evaluate(()=>mu.setInspector(true)));
   await seq('layer-settings',()=>open('api'));
   await seq('layer-palette',()=>page.keyboard.press('Control+k'));
   await seq('layer-native-toast',async()=>{await page.evaluate(async()=>{const p=await import('/scripts/popup.js');void p.callGenericPopup('Nested neutral audit',p.POPUP_TYPE.INPUT,'QA');});await page.waitForSelector('dialog.popup[open]');await page.evaluate(()=>toastr.info('Nested layer notification',null,{timeOut:0}));},{capture:true});
   await seq('layer-escape-native',esc,{capture:true});
   await seq('layer-escape-palette',esc,{capture:true});
   await seq('layer-escape-settings',esc,{capture:true});
   await page.evaluate(()=>toastr.remove());await close();await page.evaluate(()=>mu.setInspector(false));
   if(T.cfg.phone&&mode==='normal'){
    for(const level of [null,'api'])for(const kind of ['slow60','fast45','release150','cancel']){
     await open(level);await page.waitForFunction(()=>document.querySelector('#ag2-settings')?.getBoundingClientRect().y<200);
     const b=await page.locator('.ag2-set-grab').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
     await seq(`drag-${level||'list'}-${kind}`,async()=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(const dy of (kind==='fast45'?[45]:kind==='slow60'?[20,40,60]:[40,80,150])){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy}]});if(kind==='slow60')await T.sleep(140);else await page.evaluate(()=>new Promise(requestAnimationFrame));}await cdp.send('Input.dispatchTouchEvent',{type:kind==='cancel'?'touchCancel':'touchEnd',touchPoints:[]});},{capture:true,filmstrip:kind==='slow60',check:()=>page.evaluate(kind=>!document.body.classList.contains('ag2-sheet-drag')&&ms.isOpen()===['slow60','cancel'].includes(kind),kind)});
     await close();
    }
    await seq('look-back-loop',async()=>{await open(null);await click('#ag2-settings [data-page="look"]');await click('.ag2-set-back');},{capture:true});await close();
   }
   if(!T.cfg.phone&&mode==='normal')for(const w of [1440,1100]){
    await page.setViewportSize({width:w,height:900});
    await seq('reverse-sidebar-'+w,()=>page.evaluate(async()=>{for(let i=0;i<4;i++){document.querySelector(document.body.classList.contains('ag2-side-collapsed')?'#ag2-title .ag2-expand':'#ag2-sidebar [data-act="collapse"]').click();await new Promise(r=>setTimeout(r,65));}}),{capture:true});
    await seq('reverse-inspector-'+w,()=>page.evaluate(async()=>{for(let i=0;i<4;i++){void mu.setInspector(i%2===0);await new Promise(r=>setTimeout(r,65));}}),{capture:true});
   }
   await page.setViewportSize(T.cfg.phone?{width:390,height:844}:{width:1440,height:900});
   await seq('hover-plus',()=>page.locator('#ag2-plus').hover(),{capture:true});
   const bb=await page.locator('#ag2-plus').boundingBox();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.down();await shot('pressed-plus');await page.mouse.up();await esc();
   await seq('notes-inspector',()=>page.evaluate(()=>mu.setInspector(true)));
   result.notes=await page.evaluate(()=>{const e=document.querySelector('[data-ag2-act="notes"]');return {exists:!!e,hidden:e?.hidden,rect:e?Array.from([e.getBoundingClientRect().width,e.getBoundingClientRect().height]):null};});
   if(result.notes.rect?.[0])await seq('creator-notes-scroll',()=>click('[data-ag2-act="notes"]'),{capture:true});
   result.newErrors=T.errors(page).filter(e=>!baseErrors.has(e));result.mockCalls=page.__gen.calls;result.ok=result.failures.length===0;
  }finally{persist();await cdp.detach();}
  return {id,ok:result.ok,steps:result.steps.length,failures:result.failures,newErrors:result.newErrors};
 }
 try{
  await shot('chat');
  await seq('settings-open',()=>open(T.cfg.phone?null:'api'),{capture:true,filmstrip:mode==='normal',check:()=>isSet(true)});
  if(T.cfg.phone)await seq('settings-api',()=>click('#ag2-settings [data-page="api"]'),{capture:true});
  await seq('settings-look',()=>open('look'),{capture:true});
  await seq('settings-world-info',()=>open('wi'),{capture:true});
  if(T.cfg.phone)await seq('settings-back',()=>click('.ag2-set-back'),{capture:true,check:()=>page.evaluate(()=>document.querySelector('#ag2-settings').dataset.level==='list')});
  await seq('settings-close',close,{check:()=>isSet(false)});
  await seq('inspector-open',()=>page.evaluate(()=>mu.setInspector(true)),{capture:true,check:()=>page.evaluate(()=>document.body.classList.contains('ag2-insp-open'))});
  await seq('inspector-close',()=>click('#right-nav-panel [data-ag2-act="close"]'),{check:()=>page.evaluate(()=>!document.body.classList.contains('ag2-insp-open'))});
  if(!T.cfg.phone){await seq('sidebar-collapse',()=>click('#ag2-sidebar [data-act="collapse"]'),{capture:true,check:()=>page.evaluate(()=>document.body.classList.contains('ag2-side-collapsed'))});await seq('sidebar-restore',()=>click('#ag2-title .ag2-expand'),{capture:true,check:()=>page.evaluate(()=>!document.body.classList.contains('ag2-side-collapsed'))});}
  await seq('palette-open',()=>page.keyboard.press('Control+k'),{capture:true,filmstrip:mode==='normal'});
  await seq('palette-close',esc,{check:()=>page.evaluate(()=>!document.querySelector('#ag2-palette')?.open)});
  await seq('palette-setting-select',async()=>{await page.keyboard.press('Control+k');await page.locator('.ag2-pal-input').fill('温度');await page.locator('.ag2-pal-title').filter({hasText:'温度'}).first().waitFor({state:'visible'});await page.locator('.ag2-pal-title').filter({hasText:'温度'}).first().click();},{capture:true,check:()=>page.evaluate(()=>ms.isOpen()&&document.body.dataset.ag2Set==='ai')});
  await seq('palette-setting-close',close);
  await seq('plus-menu-open',()=>click('#ag2-plus'),{capture:true});
  await seq('plus-submenu-open',()=>click('#ag2-plus-menu [data-item="wand"]'),{capture:true});
  await seq('plus-submenu-escape',esc);
  await seq('plus-menu-close',esc);
  if(T.cfg.phone){await seq('phone-more-open',()=>click('#ag2-ph-more'),{capture:true});await seq('phone-more-x-close',()=>click('#ag2-ph-more'),{capture:true,check:()=>page.evaluate(()=>!document.querySelector('.ag2-menu'))});}
  await seq('native-popup-toast',async()=>{await page.evaluate(async()=>{const p=await import('/scripts/popup.js');void p.callGenericPopup('Motion audit · neutral QA',p.POPUP_TYPE.INPUT,'Aldric');});await page.waitForSelector('dialog.popup[open]');await page.evaluate(()=>toastr.info('Neutral QA notification',null,{timeOut:0,extendedTimeOut:0}));},{capture:true});
  await seq('native-popup-close',()=>click('dialog.popup[open] .popup-button-ok'));
  await seq('toast-close',()=>page.evaluate(()=>toastr.clear()));
  await page.evaluate(async()=>{await SillyTavern.getContext().executeSlashCommandsWithOptions('/sendas name="Ny规则定下的走向" compact=true '+('中性回执，旅店的灯光已经点亮。'.repeat(12)));});
  await page.waitForSelector('#chat .mes.last_mes .mes_text[data-ag2-clamp]');await page.locator('#chat .mes.last_mes .mes_text').scrollIntoViewIfNeeded();
  await shot('receipt-collapsed');
  await seq('receipt-expand',()=>click('#chat .mes.last_mes .mes_text'),{capture:true,check:()=>page.evaluate(()=>document.querySelector('#chat .mes.last_mes .mes_text').getAttribute('aria-expanded')==='true')});
  await seq('receipt-collapse',()=>click('#chat .mes.last_mes .mes_text'),{capture:true,check:()=>page.evaluate(()=>document.querySelector('#chat .mes.last_mes .mes_text').getAttribute('aria-expanded')==='false')});
  await seq('rapid-open-close-open',()=>page.evaluate(async()=>{ms.open('api');await new Promise(requestAnimationFrame);ms.close();await new Promise(requestAnimationFrame);ms.open('look');}),{capture:true,check:()=>isSet(true)});
  await seq('escape-interrupt',async()=>{await close();await open('api');await esc();},{check:()=>T.cfg.phone?page.evaluate(()=>ms.isOpen()&&document.querySelector('#ag2-settings').dataset.level==='list'):isSet(false)});
  if(T.cfg.phone)await seq('escape-list-close',esc,{check:()=>isSet(false)});
  await seq('alternate-settings-inspector',async()=>{await open('look');await page.evaluate(()=>mu.setInspector(true));await open('api');},{capture:true,check:()=>isSet(true)});
  await close();await page.evaluate(()=>{if(document.body.classList.contains('ag2-insp-open'))document.querySelector('#right-nav-panel [data-ag2-act="close"]').click();});
  if(T.cfg.phone){
   for(const end of ['touchCancel','touchEnd']){
    await open(null);await page.waitForFunction(()=>document.querySelector('#ag2-settings')?.getBoundingClientRect().y<200);
    const b=await page.locator('.ag2-set-grab').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
    await seq('sheet-drag-'+end,async()=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(const dy of [30,65,100,150]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}await shot('sheet-'+end+'-dragging');await cdp.send('Input.dispatchTouchEvent',{type:end,touchPoints:[]});},{capture:true,check:()=>page.evaluate(end=>!document.body.classList.contains('ag2-sheet-drag')&&!document.body.style.getPropertyValue('--ag2-sheet-dy')&&ms.isOpen()===(end==='touchCancel'),end)});
   }
  }
  if(!T.cfg.phone){for(const w of [1000,1001,1440])await seq('breakpoint-'+w,()=>page.setViewportSize({width:w,height:w===1440?900:844}),{capture:true,check:()=>page.evaluate(w=>document.body.classList.contains('ag2-phone')===(w<=1000),w)});}
  await seq('keyboard-focus',async()=>{await open('look');await page.keyboard.press('Tab');},{capture:true});await close();
  await seq('theme-dark',()=>page.evaluate(()=>$('#themes').val('Apple Glass Dark').trigger('change')),{check:()=>page.evaluate(()=>!document.body.classList.contains('ag2')&&!document.querySelector('#ag2-settings'))});
  await seq('theme-ag2',async()=>{await page.evaluate(()=>$('#themes').val('Apple Glass 2').trigger('change'));await page.waitForFunction(()=>document.body.classList.contains('ag2')&&!!document.querySelector('#ag2-shell'),null,{timeout:20000});await open('look');},{capture:true,check:()=>page.evaluate(()=>document.body.classList.contains('ag2')&&!!document.querySelector('#ag2-settings'))});
  result.newErrors=T.errors(page).filter(e=>!baseErrors.has(e));result.mockCalls=page.__gen.calls;result.ok=result.failures.length===0;
 }finally{persist();await cdp.detach();}
 return {id,ok:result.ok,steps:result.steps.length,failures:result.failures,newErrors:result.newErrors,result:path.join(dir,'result.json')};
}
