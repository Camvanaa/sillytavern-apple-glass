import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const ROOT='/opt/server-agent/workspace/st-testdata/redesign/motion-fixes';
export default async function(T){
    const mode=T.cfg.part||'normal',id=(T.cfg.phone?'phone':'desktop')+'-'+mode+(T.cfg.tag?'-'+T.cfg.tag:'');
    const page=await T.newPage({reduced:['os','media-only'].includes(mode)});
    await T.prepare(page,{powerUser:{reduced_motion:mode==='st'}});
    await T.boot(page,{ag2:true});await T.openChat(page,await T.longChat(page));
    const baselineErrors=new Set(T.errors(page));
    await page.evaluate(async()=>{const b='/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/',v=document.querySelector('#ag2-shell').dataset.build;window.mu=await import(b+'util.js?v='+v);window.mf=await mu.loadSettings();});
    const out={ok:false,id,checks:{},channels:await page.evaluate(()=>({body:document.body.classList.contains('reduced-motion'),media:matchMedia('(prefers-reduced-motion: reduce)').matches}))};
    if(mode==='media-only')await page.evaluate(()=>document.body.classList.remove('reduced-motion'));
    out.channelsTested=await page.evaluate(()=>({body:document.body.classList.contains('reduced-motion'),media:matchMedia('(prefers-reduced-motion: reduce)').matches}));
    if(mode==='media-only')assert.deepEqual(out.channelsTested,{body:false,media:true});
    // Observe the actual JS scroll option, then forward unchanged to the browser.
    await page.evaluate(()=>{
        window.mfScroll=[];
        for(const name of ['scrollTo','scrollIntoView']){
            const original=Element.prototype[name];Element.prototype[name]=function(...args){if(['chat','spoiler_free_desc'].includes(this.id))mfScroll.push({id:this.id,name,args});return original.apply(this,args);};
        }
        const chat=document.getElementById('chat');chat.scrollTop=0;chat.dispatchEvent(new Event('scroll'));
    });
    await page.waitForSelector('#ap-jump-latest.is-visible');
    await page.locator('#ap-jump-latest').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#ap-jump-latest').classList.contains('is-visible'));
    assert.equal(await page.locator('#ap-jump-latest').evaluate(e=>e.tabIndex),-1);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'send_textarea');
    await page.evaluate(()=>mu.setInspector(true));
    await page.waitForSelector('[data-ag2-act=notes]');
    await page.locator('[data-ag2-act=notes]').click();await T.sleep(150);
    out.checks.scroll=await page.evaluate(()=>mfScroll);
    const expected=mode==='normal'?'smooth':'auto';
    assert.ok(out.checks.scroll.some(x=>x.id==='chat'&&x.args[0]?.behavior===expected));
    assert.ok(out.checks.scroll.some(x=>x.id==='spoiler_free_desc'&&x.args[0]?.behavior===expected));
    await page.evaluate(()=>{const b=document.querySelector('[data-ag2-act=notes]');b.click();window.mfScroll=[];b.click();mu.inspectorModule().unmount();});
    await T.sleep(100);assert.equal(await page.evaluate(()=>mfScroll.filter(x=>x.id==='spoiler_free_desc').length),0);
    out.checks.notesTimer=true;
    // Unmount while a host toggle is waiting; old callbacks must not touch a new root.
    await page.evaluate(async()=>{await mf.open('api');void mf.go('ai');await new Promise(r=>setTimeout(r,45));mf.unmount();void mf.open('look');});
    await page.waitForFunction(()=>mf.isOpen()&&!mf.isNavigating()&&mf.currentPage()==='look'&&!!document.querySelector('#ag2-read-size')&&(!document.body.classList.contains('ag2-phone')||document.querySelector('#ag2-settings').dataset.level==='page'));
    out.checks.unmount=true;
    if(T.cfg.phone){
        const cdp=await page.context().newCDPSession(page);let film=[];
        cdp.on('Page.screencastFrame',e=>{film.push(e);void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId});});
        out.film=[];
        for(const [p,dy,dismiss] of [['look',30,false],['api',150,true]]){
        await page.evaluate(p=>mf.open(p),p);
        await page.waitForFunction(()=>!document.querySelector('#ag2-settings').getAnimations().some(a=>a.playState==='running'));
        film=[];
        await cdp.send('Page.startScreencast',{format:'png',everyNthFrame:1});
        const b=await page.locator('.ag2-set-grab').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy}]});
        await T.sleep(160);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForFunction(()=>!document.body.classList.contains('ag2-sheet-drag'));
        assert.equal(await page.evaluate(()=>mf.isOpen()),!dismiss);
        await cdp.send('Page.stopScreencast');
        out.film.push(...film.map((f,i)=>{const path=`${ROOT}/${id}-trusted-drag-${p}-${i}.png`;writeFileSync(path,Buffer.from(f.data,'base64'));return {path,metadata:f.metadata};}));
        }
        await cdp.detach();
        await page.evaluate(()=>mf.open('look'));
        // Settle interrupted by a new pointer, then cancel/blur/close: no late dismiss.
        out.checks.interrupt=await page.evaluate(async()=>{
            const h=document.querySelector('.ag2-set-grab');const ev=(type,y,id=5)=>new PointerEvent(type,{bubbles:true,pointerId:id,isPrimary:true,pointerType:'touch',button:0,clientY:y});
            const wait=ms=>new Promise(r=>setTimeout(r,ms));
            h.dispatchEvent(ev('pointerdown',100));window.dispatchEvent(ev('pointermove',250));window.dispatchEvent(ev('pointerup',250));
            if(!mf.isOpen())return {reducedImmediate:true};
            await new Promise(requestAnimationFrame);
            const before=getComputedStyle(h.closest('section')).translate;
            h.dispatchEvent(ev('pointerdown',200,7));
            const after=getComputedStyle(h.closest('section')).translate;
            window.dispatchEvent(ev('pointercancel',200,7));await wait(260);
            const cancelled=mf.isOpen()&&!document.body.classList.contains('ag2-sheet-drag');
            h.dispatchEvent(ev('pointerdown',100));window.dispatchEvent(ev('pointermove',250));window.dispatchEvent(ev('pointerup',250));window.dispatchEvent(new Event('blur'));await wait(260);
            return {before,after,cancelled,blur:mf.isOpen()&&!document.body.classList.contains('ag2-sheet-drag')};
        });
        if(mode==='normal'){assert.equal(out.checks.interrupt.before,out.checks.interrupt.after);assert.equal(out.checks.interrupt.cancelled,true);assert.equal(out.checks.interrupt.blur,true);}
        else assert.equal(out.checks.interrupt.reducedImmediate,true);
    }
    await page.evaluate(()=>mf.close());
    if(mode==='media-only')assert.equal(await page.evaluate(()=>document.body.classList.contains('reduced-motion')),false,'isolated media channel remained isolated');
    out.newErrors=T.errors(page).filter(e=>!baselineErrors.has(e));
    assert.deepEqual(out.newErrors.filter(e=>/pageerror:|\[AG2\]/.test(e)),[]);
    out.ok=true;return out;
}
