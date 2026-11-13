import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
const ROOT = '/opt/server-agent/workspace/st-testdata/redesign/motion-fixes';

export default async function(T) {
    const mode = T.cfg.part || 'normal', view = T.cfg.phone ? 'phone' : 'desktop';
    const id = `${view}-${mode}${T.cfg.tag?'-'+T.cfg.tag:''}`, out = {ok:false, id, checks:{}, shots:[]};
    mkdirSync(ROOT, {recursive:true});
    const save = () => writeFileSync(`${ROOT}/${id}-detail.json`, JSON.stringify(out,null,2));
    const page = await T.newPage({reduced:mode==='os'||mode==='media-only'});
    await T.prepare(page,{powerUser:{reduced_motion:mode==='st'}});
    await T.boot(page,{ag2:true});
    await T.openChat(page, await T.longChat(page));
    const baselineErrors=new Set(T.errors(page));
    await page.evaluate(async()=>{
        const base='/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/',v=document.querySelector('#ag2-shell').dataset.build;
        window.mu=await import(base+'util.js?v='+v);
        window.mf=await mu.loadSettings();
    });
    out.channels = await page.evaluate(()=>({body:document.body.classList.contains('reduced-motion'),media:matchMedia('(prefers-reduced-motion: reduce)').matches}));
    if(mode==='media-only')await page.evaluate(()=>document.body.classList.remove('reduced-motion'));
    const shot=async name=>{out.shots.push(await T.shot(page,id+'-'+name,{animations:'allow'}));save();};
    const open=async p=>{
        await page.evaluate(p=>mf.open(p),p);
        await page.waitForFunction(p=>mf.isOpen()&&!mf.isNavigating()&&mf.currentPage()===p,p,{timeout:10000});
        await page.waitForFunction(()=>!document.querySelector('#ag2-settings').getAnimations({subtree:true}).some(a=>a.playState==='running'),null,{timeout:5000});
    };
    const close=()=>page.evaluate(()=>mf.close());
    const popup=async(long=false)=>{
        await page.evaluate(async long=>{const p=await import('/scripts/popup.js');void p.callGenericPopup(long?'<h3>中性长内容</h3>'+Array.from({length:50},(_,i)=>`<p>测试行 ${i}</p>`).join(''):'中性通知测试',p.POPUP_TYPE.INPUT,'测试',{allowVerticalScrolling:true});},long);
        await page.waitForSelector('dialog.popup[open]');
        await page.waitForFunction(()=>!document.querySelector('dialog.popup[open]').hasAttribute('opening'));
    };
    const toasts=()=>page.evaluate(()=>{for(let i=0;i<5;i++)toastr[i%2?'error':'info']('中性提示 '+i+' '+ '说明文字，'.repeat(i===0?60:5),null,{timeOut:0,extendedTimeOut:0});});
    const hit=async selector=>page.locator(selector).first().evaluate(e=>{
        const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,hit:[.25,.5,.75].every(n=>e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height*n)))};
    });
    try {
        if(T.cfg.tag!=='drag'){
        out.checks.layout=[];
        for(const width of T.cfg.phone?[360,390,600]:[1440]) {
            await page.setViewportSize({width,height:T.cfg.phone?844:900});
            await open('look');
            const layout=await page.evaluate(()=>[...document.querySelectorAll('.ag2-set-row:has(> :is(.ag2-range,.ag2-swatches))')].map(e=>{
                const l=e.querySelector('.ag2-set-lab'),s=l.querySelector('small'),r=l.getBoundingClientRect();return {width:r.width,small:getComputedStyle(s).color,opacity:getComputedStyle(s).opacity,overflow:e.scrollWidth>e.clientWidth+1};
            }));
            assert.ok(layout.every(x=>!x.overflow&&x.opacity==='1'&&(!T.cfg.phone||x.width>250)));
            await shot('look-'+width);
            await open('api');
            const profile=await page.locator('#connection_profiles').evaluate(e=>{
                const r=e.getBoundingClientRect(),buttons=[...e.parentElement.children].filter(b=>b!==e&&b.getBoundingClientRect().width);return {width:r.width,bottom:r.bottom,buttons:buttons.map(b=>({y:b.getBoundingClientRect().y,w:b.getBoundingClientRect().width}))};
            });
            if(T.cfg.phone){assert.ok(profile.width>250);assert.equal(profile.buttons.length,6);assert.ok(profile.buttons.every(b=>b.y>=profile.bottom));}
            await shot('api-'+width);
            out.checks.layout.push({width,layout,profile});
            await close();
            // Ordinary + long popup: all action centers remain reachable through many notices.
            for(const long of [false,true]){
                await popup(long);
                const before=await hit('dialog.popup[open] .popup-button-ok');
                await shot(`popup-${width}-${long}-before`);
                await toasts();await T.sleep(300);
                const buttons=await Promise.all(['.popup-button-ok','.popup-button-cancel'].map(s=>hit('dialog.popup[open] '+s)));
                assert.ok(buttons.every(b=>b.hit),JSON.stringify(buttons));
                const slot=await page.locator('dialog.popup[open] #toast-container').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,position:getComputedStyle(e).position}));
                assert.equal(slot.position,'static');assert.ok(slot.h<=161&&slot.sh>slot.h);
                await shot(`popup-${width}-${long}-toast`);
                await page.locator('dialog.popup[open] #toast-container').hover();
                await page.mouse.wheel(0,1000);await T.sleep(150);
                assert.ok(await page.locator('dialog.popup[open] #toast-container').evaluate(e=>e.scrollTop>0),'long notices reachable by real wheel');
                await page.evaluate(()=>toastr.remove());
                const after=await hit('dialog.popup[open] .popup-button-ok');
                assert.ok(after.hit&&Math.abs(before.y-after.y)<2,'no-toast geometry restored');
                await page.locator('dialog.popup[open] .popup-button-ok').click();
                await page.waitForSelector('dialog.popup[open]',{state:'detached'});
            }
            await page.keyboard.press('Control+k');await page.waitForSelector('#ag2-palette[open]');
            await page.locator('.ag2-pal-input').fill('api');await T.sleep(500);
            await toasts();await T.sleep(300);
            assert.ok((await hit('#ag2-pal-list [role=option]')).hit,'palette first option reachable');
            await shot('palette-toasts-'+width);
            await popup();await T.sleep(300);
            assert.ok((await hit('dialog.popup[open] .popup-button-ok')).hit);
            assert.equal(await page.locator('dialog.popup[open] #toast-container').count(),1);
            await page.keyboard.press('Escape');await page.waitForSelector('dialog.popup[open]',{state:'detached'});
            assert.equal(await page.locator('#ag2-palette[open] #toast-container').count(),1);
            assert.ok((await hit('#ag2-pal-list [role=option]')).hit);
            await page.evaluate(()=>toastr.remove());await page.keyboard.press('Escape');
        }
        out.checks.AV03=true;out.checks.AV04=true;out.checks.AV05=true;out.checks.AV06=true;save();
        out.checks.pickers=[];
        for(const [pageName,selector] of [['bg','#bg-sort'],['look','#ag2-meta'],['api','#custom_prompt_post_processing']]){
        await open(pageName);
        const select=page.locator(selector);
        await select.click();
        assert.equal(await select.evaluate(e=>e.matches(':open')),true,'native picker truly open');
        out.checks.picker=await select.evaluate(e=>({appearance:getComputedStyle(e).appearance,radius:getComputedStyle(e,'::picker(select)').borderRadius,before:e.value}));
        assert.equal(out.checks.picker.appearance,'base-select');
        await shot('native-picker-open-'+pageName);
        await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
        out.checks.picker.after=await select.inputValue();
        assert.notEqual(out.checks.picker.after,out.checks.picker.before);
        assert.equal(await select.evaluate(e=>document.activeElement===e),true);
        await select.click();await page.keyboard.press('Escape');
        assert.equal(await select.evaluate(e=>e.matches(':open')),false);
        assert.equal(await page.evaluate(()=>mf.currentPage()),pageName);
        assert.equal(await select.evaluate(e=>document.activeElement===e),true);
        out.checks.pickers.push({pageName,selector,...out.checks.picker});
        }
        await open('ai');
        const number=page.locator('#temp_counter_openai'),range=page.locator('#temp_openai');
        await number.fill('2');await number.dispatchEvent('input');await number.focus();
        await page.keyboard.press('ArrowDown');assert.equal(await number.inputValue(),'1.99');
        await page.keyboard.press('ArrowUp');assert.equal(await number.inputValue(),'2');
        await range.focus();await page.keyboard.press('ArrowLeft');assert.equal(await range.inputValue(),'1.99');
        await page.keyboard.press('ArrowRight');assert.equal(await range.inputValue(),'2');
        await shot('number-range');out.checks.numberRange=true;
        await open('wi');
        const s2=page.locator('.drawer-content.openDrawer .select2-selection').first();
        if(await s2.count()){
            await s2.click();await page.waitForSelector('.select2-dropdown');
            await shot('select2-open-natural');
            await page.evaluate(()=>{const e=document.querySelector('.select2-results__options');const li=document.createElement('li');li.id='mf-overflow';li.textContent='中性滚动测试';li.style.height='1000px';e.append(li);});
            const results=page.locator('.select2-results__options');await results.hover();await page.mouse.wheel(0,500);await T.sleep(200);
            assert.ok(await results.evaluate(e=>e.scrollTop>0));
            await shot('select2-wheel');await page.keyboard.press('Escape');out.checks.select2=true;
        }else out.checks.select2='phone ST uses native select (desktop tested separately)';
        // Neutral in-memory options exercise the real Select2 plugin's highlighted/
        // selected rows even when this fixture has no active world book results.
        await open('look');
        await page.mouse.move(0,0); // prior wheel pointer must not hover-select a newly opened row
        await page.evaluate(()=>{
            const s=document.createElement('select');s.id='mf-select2';s.innerHTML=Array.from({length:40},(_,i)=>`<option value="${i}">中性 Select2 选项 ${i}</option>`).join('');
            document.querySelector('.ag2-set-body').prepend(s);$(s).select2({width:'100%'});$(s).select2('open');
        });
        await page.waitForSelector('.select2-dropdown');
        const selected=page.locator('.select2-results__option--highlighted');
        await selected.waitFor();
        assert.equal(await selected.textContent(),'中性 Select2 选项 0');
        out.checks.select2Style=await selected.evaluate(e=>({radius:getComputedStyle(e).borderRadius,bg:getComputedStyle(e).backgroundColor,blur:getComputedStyle(e.closest('.select2-dropdown')).backdropFilter}));
        assert.equal(out.checks.select2Style.radius,'7px');assert.equal(out.checks.select2Style.blur,'none');
        await shot('select2-highlighted-neutral');
        await page.locator('.select2-search__field:visible').focus();
        await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
        assert.equal(await page.locator('#mf-select2').inputValue(),'1');
        await page.evaluate(()=>$('#mf-select2').select2('open'));
        await page.locator('.select2-results__options').hover();await page.mouse.wheel(0,600);await T.sleep(200);
        assert.ok(await page.locator('.select2-results__options').evaluate(e=>e.scrollTop>0));
        await shot('select2-options-wheel-neutral');await page.keyboard.press('Escape');
        await page.evaluate(()=>$('#mf-select2').select2('destroy').remove());
        await close();await page.keyboard.press('Control+k');await page.waitForSelector('#ag2-palette[open]');
        await page.locator('.ag2-pal-input').fill('api');await T.sleep(500);
        const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setScrollbarsHidden',{hidden:false});
        const list=page.locator('#ag2-pal-list');await list.hover();await page.mouse.wheel(0,500);await T.sleep(200);
        assert.ok(await list.evaluate(e=>e.scrollTop>0));
        out.checks.scrollbar=await list.evaluate(e=>({scheme:getComputedStyle(e).colorScheme,width:getComputedStyle(e).scrollbarWidth,color:getComputedStyle(e).scrollbarColor,button:getComputedStyle(e,'::-webkit-scrollbar-button').display,track:getComputedStyle(e,'::-webkit-scrollbar-track').backgroundColor}));
        // Explicit scrollbar parts provide the dark appearance; the scroll container
        // must retain the host scheme so embedded content does not gain an opaque canvas.
        assert.ok(out.checks.scrollbar.scheme.includes('light'));assert.equal(out.checks.scrollbar.button,'none');
        assert.equal(out.checks.scrollbar.track,'rgba(0, 0, 0, 0)');
        assert.equal(out.checks.scrollbar.width,'auto');assert.equal(out.checks.scrollbar.color,'auto');
        await shot('palette-scrollbar-cdp');await cdp.detach();await page.keyboard.press('Escape');
        }
        if(T.cfg.phone){
            await page.setViewportSize({width:390,height:844});
            out.checks.drag=[];
            for(const p of ['look','api'])for(const dismiss of [false,true]){
                await open(p);
                const frames=await page.evaluate(async({dismiss,mode})=>{
                    const handle=document.querySelector('.ag2-set-grab'),dy=dismiss?150:30;
                    const ev=(type,y)=>new PointerEvent(type,{bubbles:true,pointerId:91,isPrimary:true,pointerType:'touch',clientY:y,button:0});
                    handle.dispatchEvent(ev('pointerdown',100));window.dispatchEvent(ev('pointermove',100+dy));
                    await new Promise(r=>setTimeout(r,120));
                    const samples=[],start=performance.now();
                    const sample=()=>{const root=document.querySelector('#ag2-settings'),drawer=document.querySelector('.drawer-content.openDrawer');samples.push({t:performance.now()-start,dy:parseFloat(getComputedStyle(root).translate.split(' ')[1])||0,open:mf.isOpen(),shell:root.getBoundingClientRect().y,drawer:drawer?.getBoundingClientRect().y});};
                    sample();window.dispatchEvent(ev('pointerup',100+dy));sample();
                    while(performance.now()-start<1000){await new Promise(requestAnimationFrame);sample();if(performance.now()-start>350&&mf.isOpen()===!dismiss&&!document.body.classList.contains('ag2-sheet-drag'))break;}
                    return samples;
                },{dismiss,mode});
                writeFileSync(`${ROOT}/${id}-drag-${p}-${dismiss}.json`,JSON.stringify(frames,null,2));
                const moving=frames.filter(f=>f.dy>0&&f.dy<(dismiss?844:30));
                if(mode==='normal'){
                    assert.ok(moving.length>=2,'continuous intermediate dy');
                    assert.equal(frames[1].dy,frames[0].dy,'release has no position reset');
                    // Visual endpoint first; host close/forced layout may be observed later
                    // on this shared two-core runner. Final semantic state is asserted below.
                    const end=frames.find(f=>dismiss?f.dy>=843.9: f.dy<=.1);
                    assert.ok(end&&end.t>=160&&end.t<350,'bounded 200ms visual settle (otherwise inconclusive)');
                    const pairs=frames.filter(f=>f.drawer!=null&&f.open);
                    if(pairs.length)assert.ok(pairs.every(f=>Math.abs((f.drawer-f.shell)-(pairs[0].drawer-pairs[0].shell))<1),'shell/drawer same track');
                }else assert.equal(frames[1].dy,0,'reduced immediate');
                assert.equal(frames.at(-1).open,!dismiss);
                out.checks.drag.push({p,dismiss,samples:frames.length});await close();
            }
            await open('look');await page.evaluate(()=>document.body.classList.add('no-blur'));
            assert.equal(await page.locator('#ag2-settings').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(28, 28, 33)');
            await close();out.checks.noBlur=true;
        }
        out.newErrors=T.errors(page).filter(e=>!baselineErrors.has(e));
        assert.deepEqual(out.newErrors.filter(e=>/pageerror:|\[AG2\]/.test(e)),[]);
        out.ok=true;
    }finally{save();}
    return out;
}
