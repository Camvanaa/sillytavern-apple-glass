// cold: one cold start in a fresh context. CFG.userCssUrl replaces /css/user.css
// (both variants go through the same route, so the comparison is symmetric).
// Returns readyMs (goto -> preloader gone + character list + ST context), FCP and
// when the splash logo was inserted.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
if (CFG.userCssUrl) {
    const css = await (await fetch(CFG.userCssUrl)).text();
    await page.route('**/css/user.css', r => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
}
await page.addInitScript(() => {
    if (window.top !== window) return;
    const mo = new MutationObserver(() => { if (!window.__logoAt && document.querySelector('img.splash-logo')) window.__logoAt = Math.round(performance.now()); });
    document.addEventListener('readystatechange', () => mo.observe(document.documentElement, { childList: true, subtree: true }), { once: true });
});
const b = await H.boot();
const t = await H.ev(() => ({ fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || -1), logoAt: window.__logoAt || -1, imgs: performance.getEntriesByType('resource').filter(e => /splash-|img\/logo\.png/.test(e.name)).map(e => e.name.replace(/^.*\//, '') + ':' + Math.round(e.responseEnd - e.startTime) + 'ms') }));
await H.save('cold', { v: CFG.v, ...b, ...t });
return { v: CFG.v, ...b, ...t };
