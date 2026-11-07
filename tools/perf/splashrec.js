// splashrec: record the start-up splash as it really paints.
//  - CDP Page.startScreencast frames (JPEG + timestamp) -> sink 'splash-<tag>' (decode with python)
//  - in-page timeline (addInitScript): when img.splash-logo is inserted, its computed `content`
//    and src at that moment and on every animation frame while it lives; preloader background;
//    popup ::backdrop filter; requests for /img/logo.png and the splash webp files.
// No CSS / extension injection: run with CFG.deployed = true against the data copy.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
const tag = CFG.tag || 'x';
const reqs = [];
const t0 = Date.now();
page.on('request', q => { const u = q.url(); if (/\/img\/logo\.png|splash-(logo|bg)\.webp/.test(u)) reqs.push({ t: Date.now() - t0, u: u.replace(/^.*\/(img|assets)\//, '$1/') }); });
page.on('requestfinished', q => { const u = q.url(); if (/\/img\/logo\.png|splash-(logo|bg)\.webp/.test(u)) reqs.push({ t: Date.now() - t0, done: u.replace(/^.*\/(img|assets)\//, '$1/') }); });
await page.addInitScript(() => {
    if (window.top !== window) return;
    const T = window.__splash = { ev: [], seen: new Set() };
    const now = () => Math.round(performance.now());
    const look = () => {
        const img = document.querySelector('img.splash-logo');
        if (img) {
            const c = getComputedStyle(img);
            const key = (c.content || '').slice(-40) + '|' + Math.round(img.getBoundingClientRect().width);
            if (!T.seen.has(key)) { T.seen.add(key); T.ev.push({ t: now(), what: 'logo', content: (c.content || '').replace(/^.*\//, '').slice(0, 40), w: Math.round(img.getBoundingClientRect().width), h: Math.round(img.getBoundingClientRect().height), src: img.getAttribute('src') }); }
            if (!T.logoAt) { T.logoAt = now(); }
            const dlg = img.closest('dialog');
            if (dlg && !T.dlg) { T.dlg = dlg; const b = getComputedStyle(dlg, '::backdrop'); T.ev.push({ t: now(), what: 'dialog', bg: getComputedStyle(dlg).backgroundColor, bdf: b.backdropFilter, bdbg: b.backgroundColor }); }
            if (dlg && !T.marked && dlg.classList.contains('ap-splash')) { T.marked = 1; T.ev.push({ t: now(), what: 'ap-splash-class' }); }
        } else if (T.logoAt && !T.logoGone) { T.logoGone = now(); T.ev.push({ t: now(), what: 'logo-gone' }); }
        // the splash dialog after ST removed #loader: what does it paint while closing?
        if (T.logoGone && T.dlg && T.dlg !== 1) {
            const d = T.dlg, c = getComputedStyle(d), b = getComputedStyle(d, '::backdrop');
            const k = d.isConnected ? [c.backgroundColor, c.borderTopWidth, c.opacity.slice(0, 4), b.backdropFilter, b.backgroundColor, d.hasAttribute('closing') ? 'closing' : '', d.className.includes('ap-splash') ? 'ap' : ''].join('|') : 'removed';
            if (k !== T.lastK) { T.lastK = k; T.ev.push({ t: now(), what: 'dlg', k }); }
            if (!d.isConnected) T.dlg = 1;
        }
        const p = document.getElementById('preloader');
        if (p && !T.pre) { T.pre = 1; const c = getComputedStyle(p); T.ev.push({ t: now(), what: 'preloader', bgimg: (c.backgroundImage || '').replace(/url\("?[^)]*\/([^/")]+)"?\)/g, 'url($1)').slice(0, 160), bdf: c.backdropFilter }); }
        if (!p && T.pre === 1) { T.pre = 2; T.ev.push({ t: now(), what: 'preloader-gone' }); }
        if (!T.stop) requestAnimationFrame(look);
    };
    document.addEventListener('readystatechange', () => { if (!T.started) { T.started = 1; requestAnimationFrame(look); } });
});
const frames = [];
await cdp.send('Page.enable');
cdp.on('Page.screencastFrame', async f => {
    frames.push({ t: Date.now() - t0, ts: f.metadata.timestamp, data: f.data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* closed */ }
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: CFG.w || 1440, maxHeight: CFG.h || 900, everyNthFrame: 1 });
const nav = Date.now() - t0;
await page.goto(BASE, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('preloader') && document.querySelectorAll('#rm_print_characters_block .character_select').length > 0, null, { timeout: 90000, polling: 100 });
const ready = Date.now() - t0;
await sleep(CFG.tail ?? 800);
await cdp.send('Page.stopScreencast');
const tl = await H.ev(() => { window.__splash.stop = 1; return { ev: window.__splash.ev, logoAt: window.__splash.logoAt, logoGone: window.__splash.logoGone, navStart: Math.round(performance.timeOrigin) }; });
// resource timing for the three images (page clock)
const rt = await H.ev(() => performance.getEntriesByType('resource').filter(e => /\/img\/logo\.png|splash-(logo|bg)\.webp/.test(e.name)).map(e => ({ n: e.name.replace(/^.*\//, ''), start: Math.round(e.startTime), end: Math.round(e.responseEnd), size: e.encodedBodySize || e.transferSize })));
for (let i = 0; i < frames.length; i += 4) {
    try { await fetch('http://127.0.0.1:8798/splash-' + tag, { method: 'POST', body: JSON.stringify(frames.slice(i, i + 4).map(f => ({ t: f.t, ts: f.ts, data: f.data }))) }); } catch { /* sink down */ }
}
return { nav, ready, frames: frames.length, firstFrame: frames[0]?.t, tl, rt, reqs };
