// Browser regression for MF03. Synthetic pointer events exercise the real DOM handlers.
// Pause/seek the real return animation to a valid 60px presentation before takeover;
// do not claim this controlled setup or its fast same-turn move is a trusted gesture.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
const ROOT='/opt/server-agent/workspace/st-testdata/redesign/motion-fixes/mf03';
export default async function(T){
    const mode=T.cfg.part||'normal';
    mkdirSync(ROOT,{recursive:true});
    const out={ok:false,mode,eventSource:'synthetic PointerEvent in real browser; native WAAPI paused/seeked only for the residual fixture',cases:[]};
    const save=()=>writeFileSync(`${ROOT}/takeover-${mode}-detail.json`,JSON.stringify(out,null,2));
    const page=await T.newPage({phone:true,reduced:mode==='os'});
    await T.prepare(page,{powerUser:{reduced_motion:mode==='st'}});
    await T.boot(page,{ag2:true});
    const baseline=new Set(T.errors(page));
    await page.evaluate(async()=>{
        const v=document.querySelector('#ag2-shell').dataset.build;
        const u=await import('/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/util.js?v='+v);
        window.mf=await u.loadSettings();
    });
    out.channels=await page.evaluate(()=>({body:document.body.classList.contains('reduced-motion'),media:matchMedia('(prefers-reduced-motion: reduce)').matches}));
    try{
        for(const p of ['look','api'])for(const kind of ['stationary','up','fast-down']){
            await page.evaluate(p=>mf.open(p),p);
            await page.waitForFunction(()=>mf.isOpen()&&!mf.isNavigating()&&!document.querySelector('#ag2-settings').getAnimations({subtree:true}).some(a=>a.playState==='running'),null,{timeout:10000});
            const rec=await page.evaluate(async({p,kind,mode})=>{
                const root=document.querySelector('#ag2-settings'),h=root.querySelector('.ag2-set-grab');
                const offset=()=>parseFloat(getComputedStyle(root).translate.split(' ')[1])||0;
                const gestureAnimations=()=>document.getAnimations().filter(a=>a.effect?.getKeyframes().some(k=>k.translate));
                const ev=(type,y,id)=>new PointerEvent(type,{bubbles:true,isPrimary:true,pointerType:'touch',button:0,pointerId:id,clientY:y});
                h.dispatchEvent(ev('pointerdown',100,31));
                window.dispatchEvent(ev('pointermove',200,31));
                await new Promise(r=>setTimeout(r,500));
                window.dispatchEvent(ev('pointerup',200,31));
                const initialOpen=mf.isOpen();
                if(mode==='normal'){
                    const animations=gestureAnimations();
                    if(!animations.length)throw Error('Missing real return animation');
                    for(const a of animations)a.pause();
                    await Promise.all(animations.map(a=>a.ready));
                    let lo=0,hi=200;
                    for(let i=0;i<15;i++){
                        const t=(lo+hi)/2;for(const a of animations)a.currentTime=t;
                        if(offset()>60)lo=t;else hi=t;
                    }
                }
                const residual=offset();
                const beforeDown=performance.now();
                h.dispatchEvent(ev('pointerdown',200,32));
                const startDy=parseFloat(document.body.style.getPropertyValue('--ag2-sheet-dy'))||0;
                const delta=kind==='up'?-10:kind==='fast-down'?(mode==='normal'?40:60):0;
                if(kind!=='fast-down')await new Promise(r=>setTimeout(r,60));
                if(delta)window.dispatchEvent(ev('pointermove',200+delta,32));
                const elapsedUpper=performance.now()-beforeDown;
                const endDy=parseFloat(document.body.style.getPropertyValue('--ag2-sheet-dy'))||0;
                const speedLowerBound=delta/Math.max(1,elapsedUpper);
                if(kind==='fast-down'&&speedLowerBound<=.6)throw Error(`Inconclusive: synthetic fast gesture was too slow (${speedLowerBound} px/ms)`);
                window.dispatchEvent(ev('pointerup',200+delta,32));
                return {p,kind,initialOpen,residual,startDy,delta,endDy,elapsedUpper,speedLowerBound,
                    immediate:{open:mf.isOpen(),dy:offset(),drag:document.body.classList.contains('ag2-sheet-drag')},
                    targets:gestureAnimations().map(a=>a.effect.getKeyframes().at(-1).translate)};
            },{p,kind,mode});
            out.cases.push(rec);save();
            assert.equal(rec.initialOpen,true);
            assert.ok(mode==='normal'?Math.abs(rec.residual-60)<.1:rec.residual===0);
            assert.ok(Math.abs(rec.startDy-rec.residual)<.01,'takeover preserves current presentation');
            assert.ok(rec.endDy<=120,'velocity case must not use the absolute-distance branch');
            const dismiss=kind==='fast-down';
            if(mode==='normal'){
                assert.equal(rec.immediate.open,true);
                assert.ok(rec.targets.length>0&&rec.targets.every(t=>{
                    const [x,y='0px']=t.split(' '); // CSSOM serializes zero translate as just "0px"
                    return parseFloat(x)===0&&parseFloat(y)===(dismiss?844:0);
                }),'correct settle target for signed gesture delta');
            }else{
                assert.equal(rec.immediate.open,!dismiss);
                assert.equal(rec.immediate.dy,0);
                assert.equal(rec.immediate.drag,false);
            }
            await page.waitForFunction(()=>!document.body.classList.contains('ag2-sheet-drag')&&!mf.isNavigating(),null,{timeout:5000});
            rec.final=await page.evaluate(()=>({open:mf.isOpen(),dy:document.body.style.getPropertyValue('--ag2-sheet-dy')}));
            assert.equal(rec.final.open,!dismiss);
            assert.equal(rec.final.dy,'');
            await page.evaluate(()=>mf.close());save();
        }
        out.newErrors=T.errors(page).filter(e=>!baseline.has(e));
        assert.deepEqual(out.newErrors.filter(e=>/pageerror:|\[AG2\]/.test(e)),[]);
        out.ok=true;
    }finally{save();}
    return out;
}
