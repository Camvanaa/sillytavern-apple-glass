// Real keyboard endpoints, logical ST drawer focus, layer/drag teardown and visual fixtures.
import assert from 'node:assert/strict';
const BASE='/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/';
export default async function(T) {
    const page=await T.newPage();
    await page.addInitScript(() => {
        const events=window.qaListeners={};
        const add=window.addEventListener, remove=window.removeEventListener;
        window.addEventListener=function(type,fn,opt){if(['pointermove','pointerup','pointercancel','blur'].includes(type))(events[type]??=new Set()).add(fn);return add.call(this,type,fn,opt);};
        window.removeEventListener=function(type,fn,opt){events[type]?.delete(fn);return remove.call(this,type,fn,opt);};
    });
    const control=T.cfg.part==='errors-control';
    await T.prepare(page,control?{theme:'dark'}:{}); await T.boot(page,{ag2:!control});
    await page.evaluate(()=>{window.qaFocusLog=[];document.addEventListener('focusin',e=>{qaFocusLog.push({target:e.target.id||e.target.className,active:document.activeElement.id||document.activeElement.className});if(qaFocusLog.length>12)qaFocusLog.shift();},true);});
    await T.openChat(page,await T.longChat(page));
    if(control) {
        await page.locator('#extensions-settings-button > .drawer-toggle').click();
        await T.sleep(5000);
        return {control:'AGDark native extensions drawer',ag2:await page.evaluate(()=>document.body.classList.contains('ag2')),errors:T.errors(page)};
    }
    const baselineErrors=new Set(T.errors(page));
    await page.evaluate(async base => {
        const v=document.querySelector('#ag2-shell').dataset.build;
        window.qaSettings=await import(base+'settings.js?v='+v);
    },BASE);
    const view=T.cfg.phone?'phone':'desktop', prefix=`${T.cfg.tag||'post'}-${view}`;
    const shot=label=>T.shot(page,prefix+'-'+label);
    const open=async p=>{await page.evaluate(p=>qaSettings.open(p),p);await T.sleep(650);};
    await shot('chat'); await open('api'); await shot('settings-api');
    await open('look'); await shot('settings-look');
    await page.evaluate(()=>qaSettings.close());
    await page.keyboard.press('Control+k'); await T.sleep(700);
    await page.evaluate(()=>{toastr.info('QA 信息提示',null,{timeOut:0,extendedTimeOut:0});toastr.error('QA 错误提示',null,{timeOut:0,extendedTimeOut:0});});
    await T.sleep(500); await shot('palette-toast');
    const toast=await page.evaluate(()=>[...document.querySelectorAll('#toast-container > div')].map(e=>({filter:getComputedStyle(e).backdropFilter,parent:e.parentElement.parentElement.id})));
    if(T.cfg.part==='baseline') return {baseline:true,toast};
    assert.ok(toast.length>=2); assert.ok(toast.every(t=>t.filter==='none'&&t.parent==='ag2-palette'));
    await page.evaluate(()=>toastr.clear()); await page.keyboard.press('Escape'); await T.sleep(300);
    const result={ok:false,toast,layers:{},focus:[],drag:[]};
    // ST popup promises resolve on close: start asynchronously, then operate its real DOM.
    const popup=async()=>{
        await page.evaluate(async()=>{const m=await import('/scripts/popup.js');void m.callGenericPopup('QA nested popup',m.POPUP_TYPE.INPUT,'QA');});
        await page.waitForSelector('dialog.popup[open]'); await T.sleep(300);
    };
    const toastState=()=>page.evaluate(()=>[...document.querySelectorAll('#toast-container > div')].map(e=>({filter:getComputedStyle(e).backdropFilter,parent:e.parentElement.parentElement.id,popup:!!e.closest('dialog.popup')})));
    const checkToasts=async(label,predicate)=>{
        const states=result.layers[label]=await toastState();
        assert.ok(states.length>0&&states.every(predicate),label+' '+JSON.stringify(states));
    };
    await popup(); await page.evaluate(()=>toastr.info('普通 ST dialog',null,{timeOut:0})); await T.sleep(300);
    await checkToasts('ordinary-dialog',t=>t.popup&&t.filter==='none');
    await shot('nested-dialog-toast');
    await page.locator('dialog.popup[open] .popup-button-ok').click(); await T.sleep(300);
    await page.evaluate(()=>toastr.clear());
    await page.keyboard.press('Control+k'); await T.sleep(400); await popup();
    await page.evaluate(()=>toastr.error('nested dialog',null,{timeOut:0})); await T.sleep(300);
    await checkToasts('nested-dialog',t=>t.popup&&t.filter==='none');
    await page.locator('dialog.popup[open] .popup-button-ok').click(); await T.sleep(500);
    await checkToasts('restored-palette',t=>t.parent==='ag2-palette'&&t.filter==='none');
    await page.keyboard.press('Escape'); await T.sleep(400);
    await page.evaluate(()=>{toastr.clear();toastr.info('背景提示',null,{timeOut:0});}); await T.sleep(400);
    await checkToasts('background',t=>t.filter.includes('blur')&&!t.popup&&t.parent!=='ag2-palette');
    await page.evaluate(()=>toastr.remove());
    const getItems=()=>page.evaluate(()=>{
        const ids={api:'rm_api_block',ai:'left-nav-panel',fmt:'AdvancedFormatting',wi:'WorldInfo',persona:'PersonaManagement',bg:'Backgrounds',user:'user-settings-block',ext:'rm_extensions_block'};
        const root=document.querySelector('#ag2-settings'), panel=document.getElementById(ids[qaSettings.currentPage()]);
        const scopes=[root,panel?.classList.contains('openDrawer')?panel:null].filter(Boolean);
        const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],[inert]');
        const items=scopes.flatMap(s=>[...s.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]')])
            .filter(e=>visible(e)&&e.tabIndex>=0&&!e.matches(':disabled'))
            .filter(e=>!e.matches('input[type="radio"][name]')||!e.name||!scopes.some(s=>[...s.querySelectorAll('input[type="radio"]')].some(r=>r.name===e.name&&r.form===e.form&&r.checked&&r!==e&&visible(r))))
            .sort((a,b)=>(a.tabIndex||Infinity)-(b.tabIndex||Infinity));
        return items.map((e,i)=>{e.dataset.qaFocus=String(i);return {i,panel:!!panel?.contains(e),name:e.id||e.className};});
    });
    const active=()=>page.evaluate(()=>document.activeElement?.dataset.qaFocus);
    const diagnostic=()=>page.evaluate(()=>({active:document.activeElement.outerHTML.slice(0,400),layers:[...document.querySelectorAll('dialog[open],.select2-container--open,.autoComplete,.ui-autocomplete,[role="menu"],#curEditTextarea')].filter(e=>$(e).is(':visible')).map(e=>({id:e.id,cls:e.className}))}));
    for(const p of ['look','api','ai','fmt','wi','persona','bg','user','ext','about']) {
        await open(p); const items=await getItems(); assert.ok(items.length);
        const first=items[0],last=items.at(-1);
        await page.locator(`[data-qa-focus="${last.i}"]`).last().focus(); await page.keyboard.press('Tab'); assert.equal(await active(),String(first.i),p+' end Tab');
        await page.keyboard.press('Shift+Tab'); assert.equal(await active(),String(last.i),p+' start ShiftTab');
        const boundary=items.findIndex(e=>e.panel);
        if(boundary>0){
            await page.locator(`#ag2-settings [data-qa-focus="${boundary-1}"]`).focus(); await page.keyboard.press('Tab'); assert.equal(await active(),String(boundary),p+' nav → drawer');
            await page.keyboard.press('Shift+Tab'); assert.equal(await active(),String(boundary-1),p+' drawer → nav '+JSON.stringify(await diagnostic()));
        }
        await page.evaluate(()=>document.querySelector('#send_textarea').focus());
        const escaped=await page.evaluate(()=>({inside:!!document.activeElement.closest('#ag2-settings,.openDrawer'),active:document.activeElement.outerHTML.slice(0,400),log:qaFocusLog,layers:[...document.querySelectorAll('dialog[open],.select2-container--open,.autoComplete,.ui-autocomplete,[role="menu"],#shadow_popup,#dialogue_popup,#character_popup,#select_chat_popup,#curEditTextarea,#dialogue_del_mes_cancel')].filter(e=>$(e).is(':visible')).map(e=>({id:e.id,cls:e.className}))}));
        assert.ok(escaped.inside,p+' programmatic escape '+JSON.stringify(escaped));
        result.focus.push({page:p,items:items.length,boundary});
        await page.evaluate(()=>document.querySelectorAll('[data-qa-focus]').forEach(e=>delete e.dataset.qaFocus));
    }
    await open('api'); await popup();
    await page.locator('dialog.popup[open] input, dialog.popup[open] textarea').first().focus(); await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(()=>!!document.activeElement.closest('dialog.popup')));
    await page.locator('dialog.popup[open] .popup-button-ok').click(); await T.sleep(300);
    // Real Select2 widget, hosted in the current logical domain; native popup lives under body.
    assert.equal(await page.evaluate(()=>qaSettings.isOpen()),true);
    await page.evaluate(()=>{
        const s=document.createElement('select');s.id='qa-select2';s.innerHTML='<option>one</option><option>two</option>';
        document.querySelector('#rm_api_block').append(s);$(s).select2();$(s).select2('open');
    }); await T.sleep(200);
    await page.locator('.select2-container--open .select2-search__field').focus();
    assert.ok(await page.evaluate(()=>document.activeElement.matches('.select2-search__field')));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>qaSettings.isOpen()),true);
    await page.evaluate(()=>{$('#qa-select2').select2('destroy').remove();});
    // External autocomplete/menu focus must win; no blanket background inert.
    for(const type of ['autoComplete','menu']) {
        await page.evaluate(type=>{
            const e=document.createElement('div');e.id='qa-layer';if(type==='menu')e.setAttribute('role','menu');else e.className=type;
            e.innerHTML='<button id="qa-layer-button">QA</button>';document.body.append(e);e.firstChild.focus();
        },type);
        assert.equal(await page.evaluate(()=>document.activeElement.id),'qa-layer-button');
        await page.evaluate(()=>document.querySelector('#qa-layer').remove());
    }
    await page.evaluate(()=>qaSettings.close());
    await page.locator('#send_textarea').focus(); await open('look'); await page.evaluate(()=>qaSettings.close());
    assert.equal(await page.evaluate(()=>document.activeElement.id),'send_textarea');
    await open('look');
    await page.evaluate(()=>{
        const button=document.querySelector('#ag2-settings .ag2-sty');button.focus();button.disabled=true;
        document.querySelector('#send_textarea').focus();
    });
    assert.ok(await page.evaluate(()=>!!document.activeElement.closest('#ag2-settings')),'disabled previous focus must fall back to a live control');
    await page.evaluate(()=>document.querySelector('#ag2-settings .ag2-sty').disabled=false);
    await page.evaluate(()=>qaSettings.close());
    if(T.cfg.phone) {
        await open(null); assert.equal(await page.locator('#ag2-settings').getAttribute('data-level'),'list');
        const items=await getItems();await page.locator(`[data-qa-focus="${items.at(-1).i}"]`).focus();await page.keyboard.press('Tab');assert.equal(await active(),'0');
        await page.locator('#ag2-settings [data-page="api"]').click();await T.sleep(650);assert.equal(await page.locator('#ag2-settings').getAttribute('data-level'),'page');
        await page.locator('.ag2-set-back').click();await T.sleep(500);assert.equal(await page.locator('#ag2-settings').getAttribute('data-level'),'list');
        const counts=()=>page.evaluate(()=>Object.fromEntries(['pointermove','pointerup','pointercancel','blur'].map(k=>[k,qaListeners[k]?.size||0])));
        const start=async()=>{
            await page.evaluate(()=>document.querySelector('.ag2-set-grab').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:71,isPrimary:true,clientY:20,pointerType:'touch'})));
            await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointermove',{pointerId:71,clientY:180})));
            assert.equal(await page.evaluate(()=>document.body.style.getPropertyValue('--ag2-sheet-dy')),'160px');
        };
        const clean=async()=>assert.deepEqual(await page.evaluate(()=>({drag:document.body.classList.contains('ag2-sheet-drag'),dy:document.body.style.getPropertyValue('--ag2-sheet-dy')})),{drag:false,dy:''});
        for(const action of ['cancel','blur','close','theme']) {
            await open(null);const before=await counts();await start();
            await page.evaluate(()=>{
                document.querySelector('.ag2-set-grab').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:72,isPrimary:true,clientY:0}));
                window.dispatchEvent(new PointerEvent('pointerup',{pointerId:72}));
                window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:72}));
            });assert.equal(await page.evaluate(()=>document.body.style.getPropertyValue('--ag2-sheet-dy')),'160px');
            if(action==='cancel')await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:71})));
            if(action==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
            if(action==='close')await page.evaluate(()=>qaSettings.close());
            if(action==='theme') {await page.evaluate(()=>$('#themes').val('Apple Glass Dark').trigger('change'));await T.sleep(1200);}
            await clean();assert.deepEqual(await counts(),before,action+' listener cleanup');
            if(['cancel','blur'].includes(action))assert.equal(await page.evaluate(()=>qaSettings.isOpen()),true);
            result.drag.push(action);
            if(action==='theme'){await page.locator('#send_textarea').focus();assert.equal(await page.evaluate(()=>document.activeElement.id),'send_textarea');await page.evaluate(()=>$('#themes').val('Apple Glass 2').trigger('change'));await T.sleep(1600);}
        }
        await open(null);await start();await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:71})));await T.sleep(500);assert.equal(await page.evaluate(()=>qaSettings.isOpen()),false);
        // Trusted browser touch sequence complements synthetic pointer-ID/cancel probes.
        await open(null);
        const box=await page.locator('.ag2-set-grab').boundingBox();
        assert.ok(box);
        const cdp=await page.context().newCDPSession(page), x=box.x+box.width/2, y=box.y+box.height/2;
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+80}]});
        await T.sleep(100);
        assert.ok(await page.evaluate(()=>document.body.classList.contains('ag2-sheet-drag')));
        await shot('trusted-touch-drag');
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await clean();
        assert.equal(await page.evaluate(()=>qaSettings.isOpen()),true);
        await cdp.detach();result.drag.push('trusted-touch-cancel');
    }
    await open('look');await page.evaluate(()=>$('#themes').val('Apple Glass Dark').trigger('change'));await T.sleep(1200);
    assert.equal(await page.locator('#ag2-settings').count(),0);
    await page.locator('#send_textarea').focus();assert.equal(await page.evaluate(()=>document.activeElement.id),'send_textarea');
    result.newErrors=T.errors(page).filter(e=>!baselineErrors.has(e));
    assert.deepEqual(result.newErrors,[]);
    result.ok=true; return result;
}
