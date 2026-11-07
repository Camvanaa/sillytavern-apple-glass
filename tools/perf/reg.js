// reg: regression asserts + screenshots for the before/after pixel diff. CFG.phase = 'main' | 'styles'.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = 2000; CFG.settleChat = 3500;
await H.boot();
await H.openChar();
const scanSrc = await (await fetch('http://127.0.0.1:8799/scan.js?' + Date.now())).text();
const scan = async () => {
    const j = JSON.parse(await page.evaluate(`(${scanSrc})()`));
    return { ovf: j.overflowRight.length, dbl: j.doubleBorder.length, unhid: j.unhidden.length, nest: j.blurNested.length, blurVis: j.blurCount, blurDom: j.blurAllDom, topOff: j.topBar?.centerOff, docW: j.docScrollW, ovfL: j.overflowRight.slice(0, 3), dblL: j.doubleBorder.slice(0, 3), unhidL: j.unhidden.slice(0, 3) };
};
const tag = (CFG.v || 'x') + '-' + (CFG.w || 1440);
const shot = n => H.shot(`reg-${tag}-${n}`);
const out = {};
const rec = async (n, f) => { try { out[n] = await f(); } catch (e) { out[n] = 'ERR ' + String(e).slice(0, 200); } await H.save(n, out[n]); };
const hit = sel => H.ev(s => { const e = document.querySelector(s); if (!e) return 'none'; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === e || e.contains(t)); }, sel);
const toEnd = async () => { await H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; }); await sleep(500); };
const toMid = async () => { await H.ev(() => { document.querySelector('#chat').scrollTop = 1500; }); await sleep(500); };

if (CFG.phase === 'main') {
    await toEnd();
    await rec('chat', async () => ({
        ...(await scan()),
        send: await hit('#send_but'),
        scrollY: await H.ev(() => window.scrollY),
        avatar: await H.ev(() => { const r = document.querySelector('#chat .mes .avatar').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
        iframes: await H.ev(() => [...document.querySelectorAll('#chat .TH-render iframe')].map(f => { let inner = 0; try { inner = f.contentDocument.querySelector('.glass-card')?.getBoundingClientRect().height ?? -1; } catch { inner = -2; } return [Math.round(f.getBoundingClientRect().height), Math.round(inner)]; })),
        swipe: await H.ev(() => { const m = document.querySelector('#chat .mes.last_mes'), b = m.querySelector('.mes_block').getBoundingClientRect(), s = m.querySelector('.swipe_right'); if (!s) return 'none'; const r = s.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { hit: t === s || s.contains(t), inside: r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom, disp: getComputedStyle(s).display }; }),
    }));
    await shot('bottom');
    await toMid();
    await shot('mid');
    if (!CFG.mobile) await rec('hoverGeo', async () => {
        const g = () => H.ev(() => [...document.querySelectorAll('#chat .mes')].map(m => { const r = m.querySelector('.mes_block').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); }).join(';'));
        await page.mouse.move(5, 5); await sleep(350);
        const a = await g();
        const box = await H.ev(() => { const r = document.querySelector('#chat').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await page.mouse.move(box.x, box.y); await sleep(350);
        const b = await g();
        await page.mouse.move(5, 5); await sleep(300);
        return { same: a === b };
    });
    await rec('sheet', async () => { await H.ev(() => document.querySelector('#user-settings-button > .drawer-toggle').click()); await sleep(800); const s = await scan(); await shot('sheet'); await H.ev(() => document.querySelector('#user-settings-button > .drawer-toggle').click()); await sleep(700); return { ...s, closedDisplay: await H.ev(() => getComputedStyle(document.querySelector('#user-settings-block')).display) }; });
    await rec('rail', async () => { await H.ev(() => document.querySelector('#rightNavHolder > .drawer-toggle').click()); await sleep(800); const s = await scan(); await shot('rail'); await H.ev(() => document.querySelector('#rightNavHolder > .drawer-toggle').click()); await sleep(700); return { ...s, closedDisplay: await H.ev(() => getComputedStyle(document.querySelector('#right-nav-panel')).display) }; });
    await rec('popup', async () => { await H.ev(() => { SillyTavern.getContext().callGenericPopup('回归测试', 1); }); await sleep(700); const s = await scan(); await shot('popup'); await H.ev(() => document.querySelector('dialog.popup[open] .popup-button-ok').click()); await sleep(600); return s; });
} else {
    for (const v of [0, 1, 2, 3, 4, 5, 6]) {
        await H.setStyle(v);
        await sleep(700);
        await toEnd();
        await rec('style' + v, async () => ({ ...(await scan()), send: await hit('#send_but'), scrollY: await H.ev(() => window.scrollY), fixedOk: await H.ev(() => getComputedStyle(document.querySelector('#chat .mes .mes_block')).position) }));
        await shot('style' + v + '-bottom');
        await toMid();
        await shot('style' + v + '-mid');
    }
    await H.setStyle(0);
}
return out;
