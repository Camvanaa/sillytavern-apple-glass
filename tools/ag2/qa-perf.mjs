// Isolated breakpoint trace: one page, serial modes, no detector unless explicitly requested.
import { mkdirSync, writeFileSync } from 'node:fs';
export default async function(T) {
    const page = await T.newPage();
    await T.prepare(page);
    if(T.cfg.part === 'viewport-ab') await page.route('**/shell/phone.js*',async route=>{
        const res=await route.fetch();
        let src=await res.text();
        // Historical baseline is frozen so this A/B remains reproducible after the fix.
        src=src.slice(0,src.indexOf('function onViewport() {'))+`function originalOnViewport() {
            const vv=window.visualViewport, s=document.body.style;if(!vv)return;
            s.setProperty('--ag2-vvh',Math.round(vv.height)+'px');
            s.setProperty('--ag2-vvt',Math.max(0,Math.round(vv.offsetTop))+'px');
            document.body.classList.toggle('ag2-kb',window.innerHeight-vv.height>120);
        }`;
        src+=`\nfunction onViewport() {
            if (!window.qaBatchViewport) return originalOnViewport();
            const vv=window.visualViewport; if(!vv)return;
            const height=vv.height, top=vv.offsetTop, layoutHeight=window.innerHeight;
            const s=document.body.style;
            const set=(k,v)=>{if(s.getPropertyValue(k)!==v)s.setProperty(k,v);};
            set('--ag2-vvh',Math.round(height)+'px');
            set('--ag2-vvt',Math.max(0,Math.round(top))+'px');
            document.body.classList.toggle('ag2-kb',layoutHeight-height>120);
        }`;
        await route.fulfill({response:res,body:src});
    });
    await T.boot(page, {ag2:true});
    await T.openChat(page, await T.longChat(page));
    const dir = '/tmp/opencode/qa-fixes'; mkdirSync(dir, {recursive:true});
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.evaluate(() => {
        window.qaLong = [];
        new PerformanceObserver(l => window.qaLong.push(...l.getEntries().map(e => ({start:e.startTime, duration:e.duration}))))
            .observe({type:'longtask', buffered:false});
    });
    const out = [];
    for (const mode of ['normal', 'reduced', 'dark']) {
        await page.emulateMedia({reducedMotion:mode === 'reduced' ? 'reduce' : 'no-preference'});
        if (mode === 'dark') await page.evaluate(() => $('#themes').val('Apple Glass Dark').trigger('change'));
        await T.sleep(1800);
        for (const detector of [false, true]) {
            if (T.cfg.part === 'no-scan' && detector) continue;
            const ab=T.cfg.part==='viewport-ab';
            if(ab)await page.evaluate(v=>window.qaBatchViewport=v,detector);
            const samples = [];
            await cdp.send('Tracing.start', {transferMode:'ReturnAsStream', categories:'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack,v8.execute,blink.user_timing'});
            for (let i=0;i<3;i++) {
                await page.setViewportSize({width:1440,height:900}); await T.sleep(900);
                const start = await page.evaluate(() => { window.qaLong=[]; performance.mark('qa-resize'); return performance.now(); });
                const before = (await cdp.send('Performance.getMetrics')).metrics;
                await page.setViewportSize({width:1000,height:844});
                if (detector&&!ab) await T.scan(page);
                await T.sleep(800);
                await page.setViewportSize({width:1100,height:740});
                if (detector&&!ab) await T.scan(page);
                await T.sleep(800);
                const after = (await cdp.send('Performance.getMetrics')).metrics;
                const delta = Object.fromEntries(['LayoutDuration','RecalcStyleDuration','ScriptDuration','TaskDuration','LayoutCount','RecalcStyleCount'].map(k => [k, after.find(x=>x.name===k).value-before.find(x=>x.name===k).value]));
                samples.push({start, delta, long:await page.evaluate(() => window.qaLong)});
            }
            const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
            await cdp.send('Tracing.end'); const {stream} = await done;
            let trace=''; for (;;) { const chunk = await cdp.send('IO.read',{handle:stream}); trace+=chunk.data; if(chunk.eof) break; }
            await cdp.send('IO.close',{handle:stream});
            const label=ab?(detector?'batched':'original'):(detector?'scan':'isolated');
            const file = `${dir}/${T.cfg.tag}-${mode}-${label}.trace.json`; writeFileSync(file,trace);
            out.push({mode,detector:detector&&!ab,batched:ab?detector:undefined,samples,trace:file});
        }
    }
    await cdp.detach();
    writeFileSync(`${dir}/${T.cfg.tag}-perf.json`, JSON.stringify(out,null,2));
    return out;
}
