import assert from 'node:assert/strict';
export default async function(T){
    const page=await T.newPage();
    const fallback=T.cfg.part==='fallback';
    await T.prepare(page,fallback?{mutate(s,j){
        const strip=css=>{
            const start=css.indexOf('@supports (appearance: base-select)');
            assert.ok(start>=0);const brace=css.indexOf('{',start);let depth=1,end=brace+1;
            for(;depth&&end<css.length;end++){if(css[end]==='{')depth++;if(css[end]==='}')depth--;}
            assert.equal(depth,0);return css.slice(0,start)+css.slice(end);
        };
        s.power_user.custom_css=strip(s.power_user.custom_css);
        for(const theme of j.themes||[])if(theme.name==='Apple Glass 2')theme.custom_css=strip(theme.custom_css);
    }}:{});
    await T.boot(page,{ag2:true});
    const id=fallback?'fallback':'headed';
    await page.evaluate(async()=>{const v=document.querySelector('#ag2-shell').dataset.build;const u=await import('/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/util.js?v='+v);window.mf=await u.loadSettings();await mf.open('bg');});
    const s=page.locator('#bg-sort');
    const style=await s.evaluate(e=>({appearance:getComputedStyle(e).appearance,scheme:getComputedStyle(e).colorScheme}));
    assert.equal(style.scheme,'dark');assert.equal(style.appearance==='base-select',!fallback);
    await s.focus();const before=await s.inputValue();await page.keyboard.press('ArrowDown');
    if(!fallback)await page.keyboard.press('Enter');
    const after=await s.inputValue();assert.notEqual(before,after);
    await s.click();await T.shot(page,id+'-picker',{animations:'allow'});await page.keyboard.press('Escape');
    assert.equal(await s.evaluate(e=>document.activeElement===e),true);
    await page.evaluate(()=>mf.close());await page.keyboard.press('Control+k');await page.waitForSelector('#ag2-palette[open]');
    await page.locator('.ag2-pal-input').fill('api');await T.sleep(600);
    const list=page.locator('#ag2-pal-list');
    const b=await list.boundingBox();await page.mouse.move(b.x+b.width-3,b.y+60);
    await T.shot(page,id+'-scrollbar-top',{animations:'allow'});await page.mouse.wheel(0,450);await T.sleep(200);
    assert.ok(await list.evaluate(e=>e.scrollTop>0));await T.shot(page,id+'-scrollbar-bottom',{animations:'allow'});
    const scrollbar=await list.evaluate(e=>({cw:e.clientWidth,ow:e.offsetWidth,width:getComputedStyle(e).scrollbarWidth,color:getComputedStyle(e).scrollbarColor,thumb:getComputedStyle(e,'::-webkit-scrollbar-thumb').backgroundColor,track:getComputedStyle(e,'::-webkit-scrollbar-track').backgroundColor,button:getComputedStyle(e,'::-webkit-scrollbar-button').display}));
    assert.equal(scrollbar.button,'none');
    assert.equal(scrollbar.width,'auto');assert.equal(scrollbar.color,'auto');
    return {ok:true,id,style,before,after,scrollbar,fallbackMethod:fallback?'In-memory removal of base-select @supports block only; Chromium, not Safari/Firefox':'real Chromium headed via Xvfb'};
}
