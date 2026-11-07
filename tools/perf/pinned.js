// pinned: both side rails pinned open must survive another drawer opening and closing,
// stay fully opaque and clickable, and keep #sheld (and the send button) between them.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = 1500; CFG.settleChat = 2500;
await H.boot();
await H.openChar();
const out = {};
const state = () => H.ev(() => {
    const q = s => document.querySelector(s);
    const panel = id => {
        const p = q(id), c = getComputedStyle(p), r = p.getBoundingClientRect();
        const t = r.width ? document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(200, r.height / 2)) : null;
        return { cls: ['openDrawer', 'closedDrawer', 'pinnedOpen'].filter(k => p.classList.contains(k)), op: c.opacity, display: c.display, pe: c.pointerEvents, x: [Math.round(r.left), Math.round(r.right)], hit: !!t && p.contains(t) };
    };
    const s = q('#send_but').getBoundingClientRect(), t = document.elementFromPoint(s.x + s.width / 2, s.y + s.height / 2), sh = q('#sheld').getBoundingClientRect();
    return { R: panel('#right-nav-panel'), L: panel('#left-nav-panel'), sheet: panel('#user-settings-block'), sendHit: !!t && (t === q('#send_but') || q('#send_but').contains(t)), sheld: [Math.round(sh.left), Math.round(sh.right)], scrollY };
});
const pin = async (toggle, box, panel) => {
    await H.ev(([t, p]) => { if (!document.querySelector(p).classList.contains('openDrawer')) document.querySelector(t).click(); }, [toggle, panel]);
    await sleep(800);
    await H.ev(b => { const e = document.querySelector(b); if (!e.checked) e.click(); }, box);
    await sleep(300);
};
await pin('#rightNavHolder > .drawer-toggle', '#rm_button_panel_pin', '#right-nav-panel');
await pin('#ai-config-button > .drawer-toggle', '#lm_button_panel_pin', '#left-nav-panel');
out.pinned = await state();
await H.ev(() => document.querySelector('#user-settings-button > .drawer-toggle').click());
await sleep(900);
out.sheetOpen = await state();
await H.ev(() => document.querySelector('#user-settings-button > .drawer-toggle').click());
await sleep(900);
out.sheetClosed = await state();
await H.save('pinned', out);
return out;
