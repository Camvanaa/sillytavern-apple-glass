// Independent parent verification of screenshot findings; measurement-only, guarded by run.mjs.
import assert from 'node:assert/strict';

export default async function(T) {
    const page = await T.newPage();
    await T.prepare(page, { powerUser: { reduced_motion: false } });
    await T.boot(page, { ag2: true });
    await T.openChat(page, await T.longChat(page));
    const errorBaseline = new Set(T.errors(page));
    const view = T.cfg.phone ? 'phone' : 'desktop';
    const result = { ok: false, measurementOnly: true, productPass: null, view, shots: [], settings: {}, toast: {} };
    const shot = async name => result.shots.push(await T.shot(page, `${view}-${name}`, { animations: 'allow' }));
    await page.evaluate(async () => {
        const build = document.querySelector('#ag2-shell').dataset.build;
        window.parentAuditSettings = await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/settings.js?v=${build}`);
    });
    for (const tab of ['look', 'api']) {
        await page.evaluate(tab => parentAuditSettings.open(tab), tab);
        await T.sleep(800);
        result.settings[tab] = await page.evaluate(() => {
            const visible = e => e.getClientRects().length && getComputedStyle(e).visibility === 'visible';
            const rect = e => { const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
            const describe = e => {
                const c = getComputedStyle(e), r = document.createRange();
                r.selectNodeContents(e);
                const ancestors = [];
                for (let p = e; p && ancestors.length < 6; p = p.parentElement) {
                    const s = getComputedStyle(p);
                    ancestors.push({tag:p.tagName,id:p.id,cls:p.className,rect:rect(p),color:s.color,bg:s.backgroundColor,filter:s.backdropFilter,opacity:s.opacity,display:s.display,flex:s.flex,gap:s.gap,padding:s.padding});
                }
                return {tag:e.tagName,id:e.id,cls:e.className,text:e.textContent.trim().slice(0,100),rect:rect(e),font:c.font,color:c.color,lines:[...r.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),ancestors};
            };
            const labels = [...document.querySelectorAll('#ag2-settings *')].filter(e => !e.children.length && visible(e) && /只影响聊天正文|聊天正文和输入框|按钮、链接|减少动态|关闭过渡/.test(e.textContent)).map(describe);
            const selections = [...document.querySelectorAll('#rm_api_block select')].filter(visible).map(e=>({id:e.id,rect:rect(e),valueText:e.selectedOptions[0]?.textContent,clientWidth:e.clientWidth,padding:getComputedStyle(e).padding}));
            return {labels,selections};
        });
        await shot(`settings-${tab}`);
    }
    assert.ok(result.settings.look.labels.length, 'appearance labels measured');
    await page.evaluate(() => parentAuditSettings.close());
    await T.sleep(350);
    await page.evaluate(async () => {
        const m = await import('/scripts/popup.js');
        void m.callGenericPopup('视觉审计：通知位置', m.POPUP_TYPE.INPUT, '中性测试');
    });
    await page.waitForSelector('dialog.popup[open]');
    await T.sleep(400);
    await shot('dialog-before-toast');
    await page.evaluate(() => toastr.info('视觉审计通知', null, {timeOut:0,extendedTimeOut:0}));
    await T.sleep(400);
    result.toast.dialog = await page.evaluate(() => {
        const toast = document.querySelector('#toast-container > div');
        const buttons = [...document.querySelectorAll('dialog.popup[open] .popup-button-ok, dialog.popup[open] .popup-button-cancel')];
        const describe = e => { const r=e.getBoundingClientRect();return {id:e.id,cls:e.className,text:e.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height}; };
        const container=document.getElementById('toast-container'), c=getComputedStyle(container), dialog=container.closest('dialog'), ds=getComputedStyle(dialog);
        return {toast:toast && describe(toast),container:{...describe(container),position:c.position,top:c.top,marginTop:c.marginTop,parent:container.parentElement.id,dialog:describe(dialog),dialogTransform:ds.transform,dialogFilter:ds.backdropFilter},buttons:buttons.map(e=>{
            const r=e.getBoundingClientRect();
            return {...describe(e),hits:[.25,.5,.75].map(y=>{
                const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height*y);
                return {x:r.x+r.width/2,y:r.y+r.height*y,own:e.contains(hit),toast:!!hit?.closest('#toast-container'),hit:hit?.id||hit?.className};
            })};
        })};
    });
    await shot('dialog-toast');
    const ok = page.locator('dialog.popup[open] .popup-button-ok');
    const box = await ok.boundingBox();
    assert.ok(box, 'confirm button box');
    if (T.cfg.phone) await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2);
    else await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
    await T.sleep(250);
    result.toast.dialog.centerClickClosedDialog = await page.locator('dialog.popup[open]').count() === 0;
    await page.evaluate(() => toastr.remove());
    if (!result.toast.dialog.centerClickClosedDialog) {
        await ok.click();
        await T.sleep(250);
    }
    result.toast.dialog.closedAfterRemovingToast = await page.locator('dialog.popup[open]').count() === 0;
    assert.ok(result.toast.dialog.closedAfterRemovingToast, 'dialog cleanup');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#ag2-palette[open]');
    await T.sleep(400);
    await shot('palette-before-toast');
    await page.evaluate(() => {
        toastr.info('审计：信息提示', null, {timeOut:0,extendedTimeOut:0});
        toastr.error('审计：错误提示', null, {timeOut:0,extendedTimeOut:0});
    });
    await T.sleep(400);
    result.toast.palette = await page.evaluate(() => {
        const dialog = document.querySelector('#ag2-palette');
        const target = dialog.querySelector('[aria-selected="true"]') || dialog.querySelector('[role="option"]') || dialog.querySelector('button');
        const describe = e => {
            if (!e) return null;
            const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
            return {tag:e.tagName,id:e.id,cls:e.className,text:e.textContent.trim().slice(0,80),x:r.x,y:r.y,w:r.width,h:r.height,centerHitToast:!!hit?.closest('#toast-container')};
        };
        const container=document.getElementById('toast-container'), c=getComputedStyle(container), ds=getComputedStyle(dialog);
        return {selected:describe(target),container:{...describe(container),position:c.position,top:c.top,marginTop:c.marginTop,parent:container.parentElement.id,dialog:describe(dialog),dialogTransform:ds.transform,dialogFilter:ds.backdropFilter},toasts:[...document.querySelectorAll('#toast-container > div')].map(describe)};
    });
    await shot('palette-two-toasts');
    await page.evaluate(() => toastr.remove());
    await page.keyboard.press('Escape');
    await T.sleep(300);
    // Explicit memory-only CSS stress states, not the user's default appearance.
    result.materialStress = [];
    for (const scenario of ['no-blur', 'bright-background']) {
        await page.evaluate(scenario => {
            document.body.classList.toggle('no-blur', scenario === 'no-blur');
            if (scenario === 'bright-background') {
                const style = document.createElement('style');
                style.id = 'parent-audit-background';
                style.textContent = '#bg1,#bg_custom { background-image:none!important; background-color:rgb(235,235,235)!important; }';
                document.head.append(style);
            }
        }, scenario);
        await T.sleep(350);
        result.materialStress.push(await page.evaluate(scenario => ({
            scenario,
            simulatedClassOnly: scenario === 'no-blur',
            backgroundNodes: [...document.querySelectorAll('#bg1,#bg_custom')].map(e=>({id:e.id,bg:getComputedStyle(e).backgroundColor,image:getComputedStyle(e).backgroundImage})),
            visibleBlur: [...document.querySelectorAll('#ag2-shell *,#send_form,#right-nav-panel')].filter(e=>{
                const s=getComputedStyle(e);return e.getClientRects().length&&s.visibility==='visible'&&s.backdropFilter!=='none';
            }).map(e=>({id:e.id,cls:e.className,filter:getComputedStyle(e).backdropFilter})),
        }), scenario));
        await shot(`material-${scenario}`);
    }
    await page.evaluate(() => {
        document.getElementById('parent-audit-background')?.remove();
        document.body.classList.remove('no-blur');
    });
    result.newErrors = T.errors(page).filter(e=>!errorBaseline.has(e));
    assert.equal(result.newErrors.length, 0, 'new console/page errors');
    result.ok = true; // Measurement completed, not a claim that measured UI passed.
    return result;
}
