// Regression: native-control theming must not change embedded message rendering.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

export default async function(T) {
    const mode=T.cfg.part||'current';
    const page=await T.newPage();
    const old=execFileSync('git',['show','51677cc:apple-glass-2.css'],{encoding:'utf8'});
    await T.prepare(page,mode==='old'?{mutate(s,j){s.power_user.custom_css=old;for(const t of j.themes||[])if(t.name==='Apple Glass 2')t.custom_css=old;}}:{});
    await T.boot(page,{ag2:true});
    const baseline=new Set(T.errors(page));
    if(mode==='isolate')await page.addStyleTag({content:'html body.ag2:not(#_):not(#__) {color-scheme:only light!important;}'});
    await page.evaluate(()=>{
        const host=document.createElement('div');host.id='embedded-regression';
        host.style.cssText='position:fixed;inset:70px 10% 70px;z-index:2990;overflow:auto;background:#18202b;color:#eee;padding:12px';
        document.body.append(host);
        const common='html,body{margin:0;background:transparent;color:#eee;font:15px sans-serif}body{padding:10px}.glass-card{padding:18px;border:1px solid #ffffff55;border-radius:18px;background:rgba(255,255,255,.12)}button{display:block;width:100%;text-align:left;padding:12px;margin:5px 0;color:inherit;background:#ffffff0a;border:1px solid #ffffff18;border-radius:12px}';
        const make=(id,extra='',sandbox=false)=>{
            const frame=document.createElement('iframe');frame.id=id;frame.title=id;frame.style.cssText='display:block;width:100%;height:235px;border:0;background:transparent;margin-bottom:10px';
            if(sandbox)frame.setAttribute('sandbox','allow-scripts');
            frame.srcdoc=`<style>${common}${extra}</style><div class="glass-card"><strong>请选择旅店的下一步行动（中性测试）</strong><div class="options-list"><button onclick="document.body.dataset.choice='1'">01 查看地图</button><button>02 整理行李</button><button>03 拜访图书馆</button></div></div>`;
            host.append(frame);
        };
        make('neutral-transparent');
        make('neutral-sandbox','',true);
        make('neutral-explicit-light',':root{color-scheme:light}');
        make('neutral-adaptive', '@media(prefers-color-scheme:dark){.glass-card{border-color:rgb(255,100,0)}}');
        make('neutral-explicit-dark',':root{color-scheme:dark}');
        make('neutral-own-background','body{background:rgb(32,64,96)}');
        const image=document.createElement('img');image.id='neutral-svg';image.style.cssText='width:100px;height:40px';
        image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><style>rect{fill:#246840}@media(prefers-color-scheme:dark){rect{fill:#f06400}}</style><rect width="100" height="40"/></svg>');host.append(image);
    });
    await page.waitForFunction(()=>[...document.querySelectorAll('#embedded-regression iframe')].every(e=>e.contentWindow));
    await T.sleep(500);
    const frames=[];
    const parts=[];
    for(const id of ['neutral-transparent','neutral-sandbox','neutral-explicit-light','neutral-adaptive','neutral-explicit-dark','neutral-own-background']){
        const frame=await page.locator('#'+id).elementHandle();const context=await frame.contentFrame();
        await context.waitForSelector('.glass-card');
        frames.push(await context.evaluate(id=>({id,prefersDark:matchMedia('(prefers-color-scheme:dark)').matches,htmlScheme:getComputedStyle(document.documentElement).colorScheme,bodyBackground:getComputedStyle(document.body).backgroundColor,border:getComputedStyle(document.querySelector('.glass-card')).borderColor}),id));
        if(['old','fixed'].includes(mode)) {
            await page.locator('#'+id).scrollIntoViewIfNeeded();
            parts.push(await T.shot(page,`${T.cfg.phone?'phone':'desktop'}-${mode}-${id}`,{animations:'allow'}));
            await context.locator('button').first().click();
            assert.equal(await context.evaluate(()=>document.body.dataset.choice),'1');
        }
    }
    await page.locator('#neutral-svg').scrollIntoViewIfNeeded();
    parts.push(await T.shot(page,`${T.cfg.phone?'phone':'desktop'}-${mode}-svg`,{animations:'allow'}));
    await page.locator('#neutral-transparent').scrollIntoViewIfNeeded();
    const parent=await page.evaluate(()=>({bodyScheme:getComputedStyle(document.body).colorScheme,frameSchemes:[...document.querySelectorAll('#embedded-regression iframe')].map(e=>getComputedStyle(e).colorScheme)}));
    const screenshot=await T.shot(page,`${T.cfg.phone?'phone':'desktop'}-${mode}-embedded`,{animations:'allow'});
    if(mode==='fixed'){assert.ok(parent.bodyScheme.includes('light'));assert.ok(frames.every(f=>!f.prefersDark));}
    await page.evaluate(()=>document.getElementById('embedded-regression').remove());
    await page.evaluate(async()=>{const b=document.querySelector('#ag2-shell').dataset.build;const u=await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/util.js?v=${b}`);window.schemeSettings=await u.loadSettings();await schemeSettings.open('bg');});
    const control=await page.locator('#bg-sort').evaluate(e=>({scheme:getComputedStyle(e).colorScheme,appearance:getComputedStyle(e).appearance}));
    if(mode==='fixed'){assert.equal(control.scheme,'dark');assert.equal(control.appearance,'base-select');}
    const newErrors=T.errors(page).filter(e=>!baseline.has(e));assert.deepEqual(newErrors,[]);
    return {ok:true,mode,parent,frames,control,screenshot,parts,newErrors};
}
