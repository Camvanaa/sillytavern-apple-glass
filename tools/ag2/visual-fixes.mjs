// Read-only regression through run.mjs. All custom text/options are neutral memory fixtures.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const ROOT='/opt/server-agent/workspace/st-testdata/redesign/visual-fixes';
export default async function(T){
 const part=T.cfg.part||'messages',view=T.cfg.phone?'phone':'desktop',id=`${part}-${view}${T.cfg.tag?'-'+T.cfg.tag:''}`;
 const out={ok:false,id,checks:[],shots:[]};mkdirSync(ROOT,{recursive:true});
 const save=()=>writeFileSync(`${ROOT}/${id}-detail.json`,JSON.stringify(out,null,2));
 const p=await T.newPage();await T.prepare(p,{powerUser:{reduced_motion:false}});await T.boot(p,{ag2:true});
 const baseErrors=new Set(T.errors(p));
 await p.evaluate(async()=>{const b=document.querySelector('#ag2-shell').dataset.build;window.vu=await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/util.js?v=${b}`);window.vs=await vu.loadSettings();});
 const shot=async n=>{out.shots.push(await T.shot(p,`${id}-${n}`,{animations:'allow'}));save();};
 const open=async name=>{await p.evaluate(n=>vs.open(n),name);await p.waitForFunction(n=>vs.isOpen()&&!vs.isNavigating()&&vs.currentPage()===n,name);await T.sleep(350);};
 try{
 if(part==='messages'){
  await T.openChat(p,await T.longChat(p));
  await p.evaluate(async()=>{for(const n of ['上邻','当前','下邻'])await SillyTavern.getContext().executeSlashCommandsWithOptions(`/sendas name="旅店老板 Aldric" 【${n}中性样本】用末行检验操作展开时正文仍完整可读。**这是正文末尾**。`);});
  const mid=await p.locator('#chat .mes').nth(-2).getAttribute('mesid');let sel=`#chat .mes[mesid="${mid}"]`;
  const facts=()=>p.locator(sel).evaluate(m=>{const r=e=>e?.getBoundingClientRect().toJSON();const extra=m.querySelector('.extraMesButtons');return {mes:r(m),text:r(m.querySelector('.mes_text')),buttons:r(m.querySelector('.mes_buttons')),extra:r(extra),before:r(m.previousElementSibling),after:r(m.nextElementSibling),opacity:getComputedStyle(extra).opacity,display:getComputedStyle(extra).display,position:getComputedStyle(extra).position,sw:m.scrollWidth,cw:m.clientWidth,children:[...extra.children].filter(e=>e.getBoundingClientRect().width).map(e=>({rect:r(e),hit:(()=>{const x=e.getBoundingClientRect();return e.contains(document.elementFromPoint(x.x+x.width/2,x.y+x.height/2));})()}))};});
  for(const width of T.cfg.phone?[360,390,600]:[1440]){
   await p.setViewportSize({width,height:T.cfg.phone?844:900});
   for(const style of [0,1,2,3,4,5,6]){
    sel=style===2?'#chat .mes.last_mes':`#chat .mes[mesid="${mid}"]`; // ST document style intentionally exposes only last-message actions.
    await p.evaluate(v=>$('#chat_display').val(String(v)).trigger('change'),style);await T.sleep(250);
    await p.locator(sel+' .mes_text').click();await T.sleep(700);await p.locator(sel).scrollIntoViewIfNeeded();
    const before=await facts();await p.locator(sel+' .extraMesButtonsHint').click();await T.sleep(900);
    await p.locator(sel).scrollIntoViewIfNeeded();const after=await facts();out.checks.push({width,style,before,after});save();
    assert.equal(after.opacity,'1');assert.equal(after.position,'static');assert.ok(after.extra.top>=after.text.bottom,'no text overlap');
    assert.ok(after.extra.bottom<=after.mes.bottom+.5&&(!after.after||after.extra.bottom<=after.after.top),'in-flow, no next-message overlap');
    assert.ok(after.mes.height>before.mes.height,'expanded row reserves height');assert.ok(after.sw<=after.cw+1,'no message horizontal overflow');
    assert.ok(after.children.every(c=>c.rect.right<=after.mes.right+.5&&c.rect.left>=after.mes.left-.5),'all action buttons inside');
    if(width!==600||style===0)await shot(`w${width}-style${style}-more`);
   }
  }
  // Last message: real bottom scroll and original action function (edit/cancel).
  await p.locator(sel+' .mes_text').click();await T.sleep(700);
  const last='#chat .mes.last_mes';await p.locator(last).scrollIntoViewIfNeeded();await p.locator(last+' .extraMesButtonsHint').click();await T.sleep(900);
  await p.evaluate(()=>{const c=document.querySelector('#chat');c.scrollTop=c.scrollHeight;});
  const bottom=await p.locator(last+' .extraMesButtons').evaluate(e=>({rect:e.getBoundingClientRect(),dock:document.querySelector('#form_sheld').getBoundingClientRect()}));
  out.bottom=bottom;assert.ok(bottom.rect.bottom<=bottom.dock.top,'bottom actions scroll above dock');await shot('bottom-more');
  await p.locator(last+' .mes_edit').click();await p.waitForSelector(last+' .edit_textarea');await p.locator(last+' .mes_edit_cancel').click();out.edit=true;
  // ST persistent expand preference, all styles, using the host change handler.
  if(T.cfg.phone)await p.setViewportSize({width:360,height:844});
  await p.evaluate(()=>$('#expandMessageActions').prop('checked',true).trigger('input'));
  assert.equal(await p.evaluate(()=>document.body.classList.contains('expandMessageActions')),true);
  out.persistent=[];
  for(const style of [0,1,2,3,4,5,6]){sel=style===2?'#chat .mes.last_mes':`#chat .mes[mesid="${mid}"]`;await p.evaluate(v=>$('#chat_display').val(String(v)).trigger('change'),style);await T.sleep(250);await p.locator(sel).scrollIntoViewIfNeeded();const f=await facts();out.persistent.push({style,...f});save();assert.equal(f.display,'flex');assert.ok(f.extra.top>=f.text.bottom&&(!f.after||f.extra.bottom<=f.after.top));assert.ok(f.sw<=f.cw+1);}
  await p.evaluate(()=>{const c=document.querySelector('#chat');c.scrollTop=c.scrollHeight;});
  await p.locator('#chat .mes.last_mes .mes_text').click();
  out.persistentBottom=await p.locator('#chat .mes.last_mes .extraMesButtons').evaluate(e=>({rect:e.getBoundingClientRect(),dock:document.querySelector('#form_sheld').getBoundingClientRect(),buttons:[...e.children].filter(b=>b.getBoundingClientRect().width).map(b=>{const r=b.getBoundingClientRect();return {rect:r,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})}));
  assert.ok(out.persistentBottom.rect.bottom<=out.persistentBottom.dock.top,'persistent bottom scrolls fully clear of dock');
  assert.ok(out.persistentBottom.buttons.every(b=>b.hit),'persistent actions reachable');
  await shot('persistent');
 }
 if(part==='controls'){
  const cdp=await p.context().newCDPSession(p);await cdp.send('DOM.enable');await cdp.send('CSS.enable');out.select=[];
  for(const width of T.cfg.phone?[360,390,600]:[1001,1100,1240,1440]){
   await p.setViewportSize({width,height:T.cfg.phone?844:900});await open('ai');
   const sel=p.locator('#settings_preset_openai');
   // Preserve the real select and its UA chosen-content; only alter the selected label in memory.
   await sel.evaluate(e=>{e.selectedOptions[0].textContent='中性长预设-LongPresetName_这是完整可换行选项说明_ABCDEFGHIJKLMNOPQRSTUVWXYZ';});
   const f=await sel.evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth,white:getComputedStyle(e).whiteSpace,overflow:getComputedStyle(e).overflow,textOverflow:getComputedStyle(e).textOverflow}));
   const {root}=await cdp.send('DOM.getDocument',{depth:0});const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#settings_preset_openai'});
   const {node}=await cdp.send('DOM.describeNode',{nodeId,depth:2,pierce:true});
   const chosen=await sel.locator('selectedcontent').evaluate(e=>{const c=getComputedStyle(e);return {white:c.whiteSpace,overflow:c.overflow,textOverflow:c.textOverflow,h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth,text:e.textContent,selected:e.closest('select').selectedOptions[0].textContent};});
   f.ua=chosen;f.shadow=node.shadowRoots;out.select.push({width,...f});save();
   assert.equal(f.white,'nowrap');assert.equal(f.overflow,'hidden');assert.ok(f.sh<=f.h+1);assert.equal(f.ua.white,'nowrap');assert.equal(f.ua.textOverflow,'ellipsis');assert.equal(f.ua.text,f.ua.selected);
   await shot('w'+width+'-selected');await sel.click();assert.equal(await sel.evaluate(e=>e.matches(':open')),true);
   const opt=await sel.locator('option:checked').evaluate(e=>({white:getComputedStyle(e).whiteSpace,rect:e.getBoundingClientRect()}));assert.equal(opt.white,'normal');
   out.select.at(-1).option=opt;await shot('w'+width+'-picker');await p.keyboard.press('Escape');assert.equal(await sel.evaluate(e=>e.matches(':open')),false);assert.equal(await p.evaluate(()=>vs.currentPage()),'ai');
   assert.equal(await sel.evaluate(e=>document.activeElement===e),true);
  }
  const help=p.locator('#left-nav-panel a:visible').first();await help.focus();out.linkFocus=await help.evaluate(e=>({outline:getComputedStyle(e).outline,visible:e.matches(':focus-visible')}));assert.match(out.linkFocus.outline,/solid 2px/);await shot('link-focus');
  await open('look');out.search2=[];
  for(const multi of [false,true]){
   await p.mouse.move(0,0);
   await p.evaluate(m=>{const s=document.createElement('select');s.id='vf-select2';s.multiple=m;s.innerHTML='<option value="0">【中性选项零】</option><option value="d" disabled>【不可选项】</option><option value="1">【中性选项一】</option><option value="2">【中性选项二】</option>';document.querySelector('.ag2-set-body').prepend(s);$(s).select2({width:'100%',closeOnSelect:!m});$(s).val(m?['0']:'0').trigger('change');$(s).select2('open');},multi);
   await p.waitForSelector('.select2-dropdown');await T.sleep(300);
   const facts=await p.evaluate(()=>({rows:[...document.querySelectorAll('.select2-results__option')].map(e=>({text:e.textContent,disabled:e.getAttribute('aria-disabled'),cls:e.className,pad:getComputedStyle(e).paddingLeft,opacity:getComputedStyle(e).opacity,filter:getComputedStyle(e).filter,before:{content:getComputedStyle(e,'::before').content,display:getComputedStyle(e,'::before').display,width:getComputedStyle(e,'::before').width,left:getComputedStyle(e,'::before').left}})),search:[...document.querySelectorAll('.select2-search__field')].filter(e=>e.getBoundingClientRect().width).map(e=>({radius:getComputedStyle(e).borderRadius,bg:getComputedStyle(e).backgroundColor}))}));
   out.search2.push({multi,...facts});save();assert.ok(facts.rows.every(r=>parseFloat(r.pad)>=30));assert.ok(facts.rows.filter(r=>r.disabled!=='true').every(r=>r.opacity==='1'));assert.ok(facts.rows.some(r=>r.disabled==='true'&&r.filter==='brightness(0.5)'));assert.ok(facts.rows.some(r=>r.before.content.includes('✓')));
   await shot(multi?'select2-multi':'select2-single');
   const search=p.locator('.select2-search__field:visible').last();await search.focus();await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');
   const value=await p.locator('#vf-select2').evaluate(e=>[...e.selectedOptions].map(o=>o.value));assert.deepEqual(value,multi?['0','1']:['1']);
   if(!multi)await p.evaluate(()=>$('#vf-select2').select2('open'));
   await p.keyboard.press('Escape');assert.equal(await p.locator('.select2-dropdown').count(),0);assert.equal(await p.evaluate(()=>vs.currentPage()),'look');
   await p.evaluate(()=>$('#vf-select2').select2('destroy').remove());
  }
  if(T.cfg.phone){await p.setViewportSize({width:390,height:844});await p.locator('.ag2-set-back').tap();await T.sleep(350);out.done=await p.locator('.ag2-set-done').evaluate(e=>({outline:getComputedStyle(e).outline,active:document.activeElement===e}));await p.keyboard.press('Tab');await p.locator('.ag2-set-done').focus();assert.match(await p.locator('.ag2-set-done').evaluate(e=>getComputedStyle(e).outline),/solid 2px/);await shot('settings-focus');}
 }
 if(part==='layout'){
  out.welcome=await p.locator('.ag2-wel-card .ag2-av-stack').count();if(!T.cfg.phone){assert.ok(out.welcome>0);await shot('welcome');}
  await T.openChat(p,await T.longChat(p));out.title=[];
  if(!T.cfg.phone)for(const width of [1001,1100,1240,1440])for(const long of [false,true]){
   await p.setViewportSize({width,height:900});await p.evaluate(()=>vu.setInspector(true));await T.sleep(400);
   await p.evaluate(long=>{document.querySelector('#ag2-tools [data-act="wi"] > span').textContent=long?'Sehr lange lokalisierte Weltinformationen':'世界书';document.querySelector('#ag2-tools [data-act="an"] > span').textContent=long?'Ausführliche Anmerkungen der Autorinnen':'作者注释';},long);await T.sleep(300);
   const f=await p.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {title:r('#ag2-title'),name:r('.ag2-title-name'),tools:r('#ag2-tools'),panel:r('#right-nav-panel'),buttons:[...document.querySelectorAll('#ag2-tools button')].map(e=>e.getBoundingClientRect().toJSON())};});out.title.push({width,long,...f});save();
   assert.ok(f.name.width>=60,'readable title');assert.ok(f.title.right+9<=f.tools.left,'capsules separated');assert.ok(f.tools.right<f.panel.left);assert.ok(f.buttons.every(b=>b.left>=f.tools.left&&b.right<=f.tools.right),'localized buttons constrained');await shot(`w${width}-${long?'long':'normal'}`);
  }
  if(T.cfg.phone){await p.locator('#ag2-title').tap();await p.waitForSelector('body.ag2-insp-open');await T.sleep(400);const v=()=>p.evaluate(()=>['ag2-title','ag2-ph-back','ag2-ph-more'].map(id=>({id,v:getComputedStyle(document.getElementById(id)).visibility})));out.hidden=await v();assert.ok(out.hidden.every(e=>e.v==='hidden'));await shot('inspector');await p.locator('[data-ag2-act="close"]').tap();await p.waitForSelector('body:not(.ag2-insp-open)');await T.sleep(400);out.restored=await v();assert.ok(out.restored.every(e=>e.v==='visible'));await shot('inspector-closed');}
 }
 out.newErrors=T.errors(p).filter(e=>!baseErrors.has(e));assert.deepEqual(out.newErrors.filter(e=>/pageerror:|\[AG2\]/.test(e)),[]);out.ok=true;
 }catch(e){out.failure=String(e);out.state=await p.evaluate(()=>({body:document.body.className,extras:[...document.querySelectorAll('#chat .mes')].slice(-3).map(m=>({id:m.getAttribute('mesid'),user:m.getAttribute('is_user'),html:m.querySelector('.mes_buttons')?.outerHTML,rect:m.getBoundingClientRect()}))}));await shot('failure');throw e;}finally{save();}
 return out;
}
