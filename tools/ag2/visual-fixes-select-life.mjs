import assert from 'node:assert/strict';
export default async function(T){
 const p=await T.newPage();await T.prepare(p);await T.boot(p,{ag2:true});
 await p.evaluate(async()=>{const b=document.querySelector('#ag2-shell').dataset.build,u=await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/util.js?v=${b}`);window.vs=await u.loadSettings();await vs.open('look');});
 const out={ok:false,checks:[]};
 await p.evaluate(()=>{const s=document.createElement('select');s.id='vf-dynamic';s.innerHTML='<option value="a">中性 A</option><option value="b">中性 B</option>';document.querySelector('.ag2-set-body').prepend(s);window.vfChanges=0;s.addEventListener('change',()=>vfChanges++);});
 await p.waitForSelector('#vf-dynamic selectedcontent');
 const state=()=>p.locator('#vf-dynamic').evaluate(s=>({value:s.value,text:s.querySelector('selectedcontent')?.textContent,options:s.options.length,buttons:s.querySelectorAll(':scope > button').length,tab:s.querySelector('button')?.tabIndex,events:vfChanges}));
 let f=await state();out.checks.push(f);assert.equal(f.options,2);assert.equal(f.buttons,1);assert.equal(f.tab,-1);assert.equal(f.text,'中性 A');
 await p.locator('#vf-dynamic').click();await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');f=await state();out.checks.push(f);assert.equal(f.value,'b');assert.equal(f.text,'中性 B');assert.equal(f.events,1);
 await p.locator('#vf-dynamic').evaluate(s=>s.selectedOptions[0].textContent='中性 B 更新');await p.waitForFunction(()=>document.querySelector('#vf-dynamic selectedcontent').textContent==='中性 B 更新');
 await p.locator('#vf-dynamic').evaluate(s=>{s.innerHTML='<option value="c">中性 C 重建</option><option value="d">中性 D</option>';});await p.waitForFunction(()=>document.querySelector('#vf-dynamic selectedcontent')?.textContent==='中性 C 重建');f=await state();out.checks.push(f);assert.equal(f.options,2);assert.equal(f.buttons,1);assert.equal(f.events,1);
 await p.locator('#vf-dynamic').evaluate(s=>s.multiple=true);await p.waitForFunction(()=>!document.querySelector('#vf-dynamic .ag2-select-button'));assert.equal(await p.locator('#vf-dynamic option').count(),2);
 await p.locator('#vf-dynamic').evaluate(s=>s.multiple=false);await p.waitForSelector('#vf-dynamic selectedcontent');
 await p.evaluate(()=>vs.close());assert.equal(await p.locator('.ag2-select-button').count(),0);
 await p.evaluate(()=>vs.open('bg'));await p.waitForSelector('#bg-sort selectedcontent');await p.evaluate(()=>$('#themes').val('Apple Glass Dark').trigger('change'));await p.waitForFunction(()=>!document.body.classList.contains('ag2'));assert.equal(await p.locator('.ag2-select-button').count(),0);
 out.ok=true;return out;
}
