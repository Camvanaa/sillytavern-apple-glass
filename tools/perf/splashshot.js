// splashshot: a sharp screenshot of the splash, then (after ready) proof that nothing
// of it remains and that a run-time blocking loader keeps the theme's own look.
// Run with CFG.deployed = true (+ CFG.extUrl for a candidate extension).
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
const tag = (CFG.v || 'x') + '-' + (CFG.w || 1440);
const dir = '/opt/server-agent/workspace/st-testdata/fix-shots/';
const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'commit', timeout: 60000 });
await page.waitForSelector('img.splash-logo', { state: 'attached', timeout: 60000 });
await sleep(CFG.splashWait ?? 1200);
const during = await H.ev(() => {
    const img = document.querySelector('img.splash-logo'), r = img.getBoundingClientRect(), c = getComputedStyle(img);
    const p = document.getElementById('preloader'), pc = p && getComputedStyle(p);
    const msg = document.querySelector('.splash-message'), mr = msg?.getBoundingClientRect();
    const sp = document.getElementById('load-spinner');
    return {
        logo: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], content: (c.content || '').replace(/^.*\//, '').slice(0, 30),
        preBgSize: pc?.backgroundSize, preBdf: pc?.backdropFilter, vw: innerWidth, vh: innerHeight,
        msg: msg ? [msg.textContent, Math.round(mr.top), getComputedStyle(msg).color] : null,
        spinnerAnim: sp ? getComputedStyle(sp).animationName : null,
    };
});
await page.screenshot({ path: `${dir}p4-${tag}-splash.png`, animations: 'allow' });
await page.waitForFunction(() => !document.getElementById('preloader') && document.querySelectorAll('#rm_print_characters_block .character_select').length > 0, null, { timeout: 90000, polling: 100 });
const ready = Date.now() - t0;
await sleep(2500);
const after = await H.ev(() => {
    const hits = [];
    for (const e of [document.documentElement, document.body, ...document.querySelectorAll('body *')]) {
        const c = getComputedStyle(e);
        if (/splash-(bg|logo)/.test(c.backgroundImage) || /splash-logo/.test(c.content || '')) hits.push(e.id || e.className || e.tagName);
    }
    return { preloader: !!document.getElementById('preloader'), splashLoader: !!document.querySelector('#loader.splash-screen'), apSplash: document.querySelectorAll('.ap-splash').length, remnants: hits.slice(0, 5) };
});
// run-time blocking loader (what generation / long actions use): must look exactly as before
await H.ev(async () => { const m = await import('/scripts/loader.js'); m.showLoader(); });
await sleep(900);
const rt = await H.ev(() => {
    const l = document.getElementById('loader'), d = l?.closest('dialog');
    if (!d) return 'no loader';
    const c = getComputedStyle(d), b = getComputedStyle(d, '::backdrop');
    return { loaderCls: l.className, dlgCls: d.className.replace(/\s+/g, ' ').trim(), bg: c.backgroundColor, bdf: c.backdropFilter, border: c.borderTopWidth, backdrop: b.backgroundColor + ' / ' + b.backdropFilter, logo: !!d.querySelector('.splash-logo') };
});
await page.screenshot({ path: `${dir}p4-${tag}-runtime-loader.png`, animations: 'disabled' });
await H.ev(async () => { const m = await import('/scripts/loader.js'); await m.hideLoader(); });
await sleep(600);
return { ready, during, after, runtimeLoader: rt };
