// extra: swipe overflow, pinned rail, delete-last replay, jump button under reduced flag.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = 1500; CFG.settleChat = 2500;
await H.boot();
await H.openChar();
const out = {};
out.swipe = await H.ev(async () => {
    const c = SillyTavern.getContext(), m = c.chat.at(-1), chat = document.querySelector('#chat');
    m.swipes = [m.mes, m.mes + '\n\n第二版']; m.swipe_id = 0; m.swipe_info = [{}, {}];
    chat.scrollTop = 1e6;
    await new Promise(r => setTimeout(r, 300));
    const start = { x: scrollX, y: scrollY, sl: chat.scrollLeft };
    let maxX = 0, maxSL = 0, maxDoc = 0, run = true;
    const t = () => { if (!run) return; maxX = Math.max(maxX, Math.abs(scrollX)); maxSL = Math.max(maxSL, chat.scrollLeft); maxDoc = Math.max(maxDoc, document.documentElement.scrollWidth); requestAnimationFrame(t); };
    requestAnimationFrame(t);
    document.querySelector('#chat .mes.last_mes .swipe_right').click();
    await new Promise(r => setTimeout(r, 1200));
    run = false;
    return { start, maxX, maxSL, maxDoc, W: innerWidth, swipeId: c.chat.at(-1).swipe_id, counter: document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent, transformLeft: getComputedStyle(document.querySelector('#chat .mes.last_mes .mes_block')).transform };
});
// pinned rail: click the real pin, click outside, rail must stay fully opaque and the send button reachable
await H.ev(() => document.querySelector('#rightNavHolder > .drawer-toggle').click());
await sleep(700);
await H.ev(() => document.querySelector('#rm_button_panel_pin').click());
await sleep(300);
await H.ev(() => document.querySelector('#chat').click());
await sleep(600);
out.pinned = await H.ev(() => { const p = document.querySelector('#right-nav-panel'), c = getComputedStyle(p), r = document.querySelector('#send_but').getBoundingClientRect(), t = document.elementFromPoint(r.x + 16, r.y + 16), pr = p.getBoundingClientRect(), sr = document.querySelector('#sheld').getBoundingClientRect(); return { cls: ['openDrawer', 'closedDrawer', 'pinnedOpen'].filter(k => p.classList.contains(k)), op: c.opacity, display: c.display, sendHit: t === document.querySelector('#send_but') || document.querySelector('#send_but').contains(t), sheldRight: Math.round(sr.right), railLeft: Math.round(pr.left) }; });
// sheet above pinned rail
await H.ev(() => document.querySelector('#user-settings-button > .drawer-toggle').click());
await sleep(800);
out.sheetOverRail = await H.ev(() => { const s = document.querySelector('#user-settings-block'), r = s.getBoundingClientRect(), x = Math.min(r.right - 30, innerWidth - 40), t = document.elementFromPoint(x, r.top + 60); return { hitInSheet: s.contains(t), op: getComputedStyle(s).opacity }; });
await H.save('extra', out);
return out;
