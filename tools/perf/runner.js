// Body of an async (page0, CFG) function. Fresh context per run; results go to the sink.
const AF = (async () => {}).constructor;
const get = async f => (await fetch('http://127.0.0.1:8799/' + f + '?t=' + Date.now())).text();
const V = CFG.deployed ? 'deployed' : CFG.v === 'after' ? 'after' : 'before';
// CFG.deployed: measure what the instance actually serves (no CSS / extension injection).
if (!CFG.deployed) {
    CFG.cssUrl = CFG.cssUrl || `http://127.0.0.1:8799/css-${V}.css`;
    CFG.extUrl = CFG.extUrl || `http://127.0.0.1:8799/ext-${V}.js`;
}
CFG.run = (CFG.suite || 'x') + ':' + (CFG.phase || '') + ':' + V + (CFG.tag ? ':' + CFG.tag : '');
const lib = await get('perf-lib.js');
const body = await get(CFG.suite + '.js');
const ctx = await page0.context().browser().newContext({ viewport: { width: CFG.w || 1440, height: CFG.h || 900 }, deviceScaleFactor: CFG.dpr || 1, isMobile: !!CFG.mobile, hasTouch: !!CFG.mobile, reducedMotion: CFG.reducedMotion || 'no-preference' });
const page = await ctx.newPage();
const t0 = Date.now();
try {
    const r = await new AF('page', 'CFG', lib + '\n' + body)(page, CFG);
    return CFG.full ? JSON.stringify(r) : `done ${CFG.run} ${Math.round((Date.now() - t0) / 1000)}s`;
} catch (e) {
    return 'ERR ' + CFG.run + ' ' + Math.round((Date.now() - t0) / 1000) + 's ' + (e && e.stack || e);
} finally {
    await ctx.close().catch(() => {});
}
