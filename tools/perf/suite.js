// suite: quantified scenarios. CFG.phase = 'cold' | 'inter' | 'long' | 'mobile'.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
const out = {};
const rec = async (name, f) => { try { out[name] = await f(); } catch (e) { out[name] = 'ERR ' + String(e).slice(0, 160); } await H.save(name, out[name]); };
const measure = async (ms, f) => {
    await H.ev(() => window.__p.startFrames());
    await H.resetLogs();
    const m0 = await H.metrics(), c0 = await H.cpu();
    await f();
    if (ms) await sleep(ms);
    const m1 = await H.metrics(), c1 = await H.cpu();
    const fr = await H.ev(() => window.__p.stopFrames());
    const l = await H.logs();
    return { ...H.diff(m0, m1), frames: fr.n, avg: R(fr.avg), max: R(fr.max), over50: fr.over50, longMs: l.longMs, cls: l.cls, cpu: H.cpuDiff(c0, c1)?.total ?? null };
};

if (CFG.phase === 'cold') {
    CFG.settle = 0; CFG.settleChat = 0;
    const b = await H.boot();
    const lb = await H.logs(), mb = await H.metrics();
    out.boot = { readyMs: b.readyMs, longtasks: lb.longtasks, longMs: lb.longMs, cls: lb.cls, layouts: mb.LayoutCount, recalcs: mb.RecalcStyleCount, recalcMs: R(mb.RecalcStyleDuration * 1000), layoutMs: R(mb.LayoutDuration * 1000), scriptMs: R(mb.ScriptDuration * 1000), taskMs: R(mb.TaskDuration * 1000) };
    await sleep(2500);
    const m0 = await H.metrics(), t0 = Date.now();
    // Cumulative cost at a fixed point (ready + 2.5s): less sensitive to which side of
    // the ready moment a late layout pass happens to land on.
    Object.assign(out.boot, { layouts25: m0.LayoutCount, layoutMs25: R(m0.LayoutDuration * 1000), recalcMs25: R(m0.RecalcStyleDuration * 1000), taskMs25: R(m0.TaskDuration * 1000) });
    await H.resetLogs();
    await H.ev(n => { [...document.querySelectorAll('#rm_print_characters_block .character_select')].find(e => e.textContent.includes(n)).click(); }, 'Seraphina');
    await page.waitForFunction(() => document.querySelectorAll('#chat .mes').length > 3, null, { timeout: 60000, polling: 50 });
    const firstMs = Date.now() - t0;
    await sleep(3000);
    const m1 = await H.metrics(), l = await H.logs();
    out.open = { firstMs, ...H.diff(m0, m1), longtasks: l.longtasks, longMs: l.longMs, cls: l.cls };
    await H.save('cold', out);
    return out;
}

CFG.settle = CFG.settle ?? 1500; CFG.settleChat = CFG.settleChat ?? 2500;
await H.boot();
await H.openChar();
if (CFG.cpuLate) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CFG.cpuLate });

if (CFG.phase === 'long') {
    const t0 = Date.now(), m0 = await H.metrics();
    await H.resetLogs();
    await H.ev(() => { SillyTavern.getContext().openCharacterChat('perf-long'); });
    await page.waitForFunction(() => document.querySelectorAll('#chat .mes').length >= 90, null, { timeout: 60000, polling: 50 });
    const firstMs = Date.now() - t0;
    await sleep(2500);
    const m1 = await H.metrics(), l = await H.logs();
    out.open = { firstMs, mes: await H.ev(() => document.querySelectorAll('#chat .mes').length), ...H.diff(m0, m1), longMs: l.longMs, cls: l.cls };
    await H.save('longOpen', out.open);
    await H.closeRail();
    await rec('scroll', async () => { const a = await H.rafScroll({ px: 40, frames: 90, start: 2000 }); const b = await H.rafScroll({ px: 40, frames: 90, start: 12000 }); return [a, b]; });
    await rec('stream', () => H.stream({ hz: 15, seconds: 3 }));
    await rec('profileStyle3', async () => { await H.setStyle(3); await sleep(400); const r = await H.profile(async () => { await H.stream({ hz: 15, seconds: 2 }); }); await H.setStyle(0); return r; });
    return out;
}

await rec('scroll', async () => { const r = []; for (let i = 0; i < (CFG.scrollN || 3); i++) r.push(await H.rafScroll({ px: CFG.px || 40, frames: CFG.frames || 90, start: 1500 * i })); return r; });
await rec('sheet', async () => { const r = []; for (let i = 0; i < 3; i++) r.push(await H.drawerCost('user-settings-button', { openWait: 800, closeWait: 700 })); return r; });
await rec('rail', async () => { const r = []; for (let i = 0; i < 3; i++) r.push(await H.drawerCost('rightNavHolder', { openWait: 800, closeWait: 700 })); return r; });
if (CFG.phase === 'inter2' || CFG.phase === 'mobile') return out;
return out;
