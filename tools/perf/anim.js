// anim: behaviour of each animation, sampled per frame. CFG.cssUrl/extUrl pick the variant.
await H.setup();
await page.route('**/api/backends/**', r => r.abort()); // a swipe must never reach a model
const out = {};
const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));
const step = async (name, f) => { try { out[name] = await f(); } catch (e) { out[name] = 'ERR ' + String(e).slice(0, 160); } await H.save(name, out[name]); };
CFG.settle = 1500; CFG.settleChat = 2500;
await H.boot();
await H.resetLogs();
await H.openChar();
await step('openAnims', async () => pick(await H.logs(), ['animations']));
const ks = ['d', 'op', 'tf', 'h', 'x', 'y'];
const cl = (id, sel, ms = 600) => async () => H.compact(await H.sampleFrames(sel, () => H.ev(i => document.querySelector(i).click(), id), ms), ks);
await step('sheetOpen', cl('#user-settings-button > .drawer-toggle', '#user-settings-block'));
await step('sheetClose', cl('#user-settings-button > .drawer-toggle', '#user-settings-block'));
await step('railOpen', cl('#rightNavHolder > .drawer-toggle', '#right-nav-panel'));
await step('railClose', cl('#rightNavHolder > .drawer-toggle', '#right-nav-panel'));
await step('toast', async () => {
    const s = await H.sampleFrames('#toast-container > div', () => H.ev(() => { toastr.info('测试', '', { timeOut: 300, extendedTimeOut: 0 }); }), 1400);
    return H.compact(s, ['op', 'd']).slice(0, 14);
});
await step('popup', async () => {
    const s = await H.sampleFrames('dialog.popup[open]', () => H.ev(() => { SillyTavern.getContext().callGenericPopup('测试', 1); }), 550);
    const a = H.compact(s, ['op', 'tf']).slice(0, 12);
    const s2 = await H.sampleFrames('dialog.popup[open]', () => H.ev(() => document.querySelector('dialog.popup[open] .popup-button-ok').click()), 550);
    return { open: a, close: H.compact(s2, ['op', 'tf']).slice(0, 12) };
});
await step('jump', async () => {
    await H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; });
    await sleep(400);
    const show = await H.sampleFrames('#ap-jump-latest', () => H.ev(() => { document.querySelector('#chat').scrollTop = 500; }), 400);
    const hide = await H.sampleFrames('#ap-jump-latest', () => H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; }), 400);
    return { show: H.compact(show, ['op', 'tf']).slice(0, 14), hide: H.compact(hide, ['op', 'tf']).slice(0, 14) };
});
await step('press', async () => {
    const box = await H.ev(() => { const r = document.querySelector('#send_but').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    await sleep(300);
    const s = await H.sampleFrames('#send_but', async () => { await page.mouse.down(); await sleep(220); await page.evaluate(() => { const b = document.querySelector('#send_but'); b.addEventListener('click', e => { e.stopImmediatePropagation(); e.preventDefault(); }, { capture: true, once: true }); }); await page.mouse.move(box.x + 60, box.y - 200); await page.mouse.up(); }, 650);
    return H.compact(s, ['tf']).slice(0, 16);
});
await step('newMessage', async () => {
    await H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; });
    await H.resetLogs();
    await H.ev(() => { const c = SillyTavern.getContext(); const m = { name: 'perf', is_user: false, is_system: false, send_date: 'x', mes: '性能测试消息', extra: {} }; c.chat.push(m); c.addOneMessage(m); });
    await sleep(500);
    const added = pick(await H.logs(), ['animations']);
    await H.resetLogs();
    await H.ev(() => { const c = SillyTavern.getContext(); c.chat.pop(); document.querySelector('#chat .mes.last_mes').remove(); const l = [...document.querySelectorAll('#chat .mes')].at(-1); l.classList.add('last_mes'); });
    await sleep(500);
    return { added, afterDelete: pick(await H.logs(), ['animations']) };
});
await step('swipe', async () => {
    await H.ev(() => { const c = SillyTavern.getContext(); const m = c.chat.at(-1); m.swipes = [m.mes, m.mes + '\n\n第二版']; m.swipe_id = 0; m.swipe_info = [{}, {}]; document.querySelector('#chat').scrollTop = 1e6; c.refreshSwipeButtons?.(); });
    await sleep(300);
    await H.resetLogs();
    const s = await H.sampleFrames('#chat .mes.last_mes .mes_block', () => H.ev(() => document.querySelector('#chat .mes.last_mes .swipe_right').click()), 900);
    const l = await H.logs();
    return { block: H.compact(s, ['op', 'tf', 'tr', 'x']).slice(0, 14), animations: l.animations };
});
return out;
