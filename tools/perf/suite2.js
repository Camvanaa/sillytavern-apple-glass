// suite2: style switch, hover, resize, Profiler attribution.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
const out = {};
const rec = async (name, f) => { try { out[name] = await f(); } catch (e) { out[name] = 'ERR ' + String(e).slice(0, 160); } await H.save(name, out[name]); };
const measure = async (ms, f) => {
    await H.ev(() => window.__p.startFrames());
    await H.resetLogs();
    const m0 = await H.metrics();
    await f();
    if (ms) await sleep(ms);
    const m1 = await H.metrics();
    const fr = await H.ev(() => window.__p.stopFrames());
    const l = await H.logs();
    return { ...H.diff(m0, m1), frames: fr.n, avg: R(fr.avg), max: R(fr.max), over50: fr.over50, longMs: l.longMs, trTotal: l.trTotal, tr: l.transitions.slice(0, 5) };
};
CFG.settle = 1500; CFG.settleChat = 2500;
await H.boot();
await H.openChar();
if (CFG.cpuLate) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CFG.cpuLate });
await rec('style', async () => { const r = {}; for (const v of [3, 4, 5, 6, 1, 2, 0]) r[v] = await measure(500, () => H.setStyle(v)); return r; });
if (!CFG.mobile) await rec('hover', async () => {
    await H.ev(() => { document.querySelector('#chat').scrollTop = 900; });
    await sleep(300);
    const box = await H.ev(() => { const r = document.querySelector('#chat').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y, h: r.height }; });
    return measure(100, async () => { for (let i = 0; i < 60; i++) { await page.mouse.move(box.x, box.y + 20 + (box.h - 40) * (i % 30) / 30); await sleep(16); } });
});
await rec('resize', async () => {
    const w = CFG.w || 1440, h = CFG.h || 900, r = [];
    for (const [a, b] of (CFG.mobile ? [[360, h], [w, h], [360, h]] : [[1200, h], [w, h], [1000, h], [w, h]])) r.push(await measure(350, () => page.setViewportSize({ width: a, height: b })));
    return r;
});
await rec('profileScroll', () => H.profile(async () => { await H.rafScroll({ px: 40, frames: 60, start: 0 }); }));
await rec('profileChat', () => H.profile(async () => { await H.stream({ hz: 15, seconds: 2 }); }));
return out;
