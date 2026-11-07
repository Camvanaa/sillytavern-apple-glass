// tools/run.js — launcher for browser_run_code_unsafe.
// Paste as the `code` argument, after editing SUITE / CFG. Every run gets a
// fresh browser context (empty cache, no state from earlier runs).
async (page0) => {
    const SUITE = 'SUITE_NAME';
    const CFG = CFG_JSON;
    const AF = (async () => {}).constructor;
    const get = async f => (await fetch('http://127.0.0.1:8799/' + f + '?t=' + Date.now())).text();
    const lib = await get('perf-lib.js');
    const body = await get(SUITE + '.js');
    const ctx = await page0.context().browser().newContext({
        viewport: { width: CFG.w || 1440, height: CFG.h || 900 },
        deviceScaleFactor: CFG.dpr || 1,
        isMobile: !!CFG.mobile,
        hasTouch: !!CFG.mobile,
        reducedMotion: CFG.reducedMotion || 'no-preference',
    });
    const page = await ctx.newPage();
    try {
        return JSON.stringify(await new AF('page', 'CFG', lib + '\n' + body)(page, CFG));
    } catch (e) {
        return 'ERR ' + (e && e.stack || e);
    } finally {
        await ctx.close();
    }
}
