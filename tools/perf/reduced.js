// reduced: how much motion is left with ST's switch (CFG.powerUser) or the OS setting (CFG.reducedMotion).
await H.setup();
CFG.settle = 1500; CFG.settleChat = 2500;
await H.boot();
await H.openChar();
const out = {};
out.state = await H.ev(() => ({ bodyClass: document.body.classList.contains('reduced-motion'), animDur: getComputedStyle(document.documentElement).getPropertyValue('--animation-duration'), apDur: getComputedStyle(document.body).getPropertyValue('--ap-dur'), fxOff: jQuery.fx.off }));
out.moving = await H.ev(() => {
    let tr = 0, an = 0; const ex = {};
    const name = e => e.id ? '#' + e.id : (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase());
    for (const e of document.querySelectorAll('body *')) {
        const c = getComputedStyle(e);
        const d = Math.max(...c.transitionDuration.split(',').map(parseFloat));
        if (d > 0.02) { tr++; ex[name(e)] = (ex[name(e)] || 0) + 1; }
        if (c.animationName !== 'none' && Math.max(...c.animationDuration.split(',').map(parseFloat)) > 0.02) an++;
    }
    return { tr, an, top: Object.entries(ex).sort((a, b) => b[1] - a[1]).slice(0, 6) };
});
await H.resetLogs();
const live = async f => {
    await H.ev(() => { window.__mx = 0; window.__run = true; const t = () => { if (!window.__run) return; for (const a of document.getAnimations()) { const d = a.effect?.getComputedTiming?.().duration; if (d > window.__mx) window.__mx = d; } requestAnimationFrame(t); }; requestAnimationFrame(t); });
    await f(); await sleep(450);
    return H.ev(() => { window.__run = false; return Math.round(window.__mx); });
};
const click = s => H.ev(x => document.querySelector(x).click(), s);
out.maxAnimMs = {};
out.maxAnimMs.sheet = await live(() => click('#user-settings-button > .drawer-toggle'));
await live(() => click('#user-settings-button > .drawer-toggle'));
out.maxAnimMs.rail = await live(() => click('#rightNavHolder > .drawer-toggle'));
await live(() => click('#rightNavHolder > .drawer-toggle'));
out.maxAnimMs.popup = await live(() => H.ev(() => { SillyTavern.getContext().callGenericPopup('测试', 1); }));
await live(() => click('dialog.popup[open] .popup-button-ok'));
out.maxAnimMs.newMes = await live(() => H.ev(() => { const c = SillyTavern.getContext(); const m = { name: 'perf', is_user: false, is_system: false, send_date: 'x', mes: '测试', extra: {} }; c.chat.push(m); c.addOneMessage(m); }));
const box = await H.ev(() => { const r = document.querySelector('#send_but').getBoundingClientRect(); return { x: r.x + 16, y: r.y + 16 }; });
out.maxAnimMs.hover = await live(() => page.mouse.move(box.x, box.y));
await H.save('reduced', out);
return out;
