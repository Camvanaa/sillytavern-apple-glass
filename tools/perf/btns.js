// btns: open every drawer / panel, expand its inline drawers, run tools/btnscan.js.
// CFG.panels: subset of PANELS keys (default all). CFG.v names the screenshots.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = 2000; CFG.settleChat = 3500;
await H.boot();
await H.openChar();
const src = await (await fetch('http://127.0.0.1:8799/btnscan.js?' + Date.now())).text();
const PANELS = {
    ai: ['#ai-config-button > .drawer-toggle', '#left-nav-panel'],
    api: ['#sys-settings-button > .drawer-toggle', '#rm_api_block'],
    fmt: ['#advanced-formatting-button > .drawer-toggle', '#AdvancedFormatting'],
    wi: ['#WI-SP-button > .drawer-toggle', '#WorldInfo'],
    user: ['#user-settings-button > .drawer-toggle', '#user-settings-block'],
    bg: ['#backgrounds-button > .drawer-toggle', '#Backgrounds'],
    ext: ['#extensions-settings-button > .drawer-toggle', '#rm_extensions_block'],
    persona: ['#persona-management-button > .drawer-toggle', '#PersonaManagement'],
    char: ['#rightNavHolder > .drawer-toggle', '#right-nav-panel'],
    page: [null, 'body'], // chat screen with every drawer closed (top bar, QR bar, composer)
};
const tag = (CFG.v || 'x') + '-' + (CFG.w || 1440);
const isOpen = root => H.ev(r => r === 'body' || document.querySelector(r)?.classList.contains('openDrawer'), root);
const expand = root => H.ev(r => {
    let k = 0;
    for (const t of document.querySelectorAll(r + ' .inline-drawer-toggle')) {
        const c = t.parentElement?.querySelector(':scope > .inline-drawer-content');
        if (!c || getComputedStyle(c).display !== 'none' || !t.offsetParent) continue;
        if (++k > 40) break;
        t.click();
    }
    return k;
}, root);
const out = {};
for (const key of CFG.panels || Object.keys(PANELS)) {
    const [toggle, root] = PANELS[key];
    try {
        const was = await isOpen(root);
        if (!was) { await H.ev(s => document.querySelector(s).click(), toggle); await sleep(900); }
        let opened = 0;
        if (CFG.expand !== false && toggle) for (let i = 0; i < 2; i++) { opened += await expand(root); await sleep(700); }
        const j = JSON.parse(await page.evaluate(`(${src})(${JSON.stringify(root)})`));
        await H.ev(r => { const e = document.querySelector(r); if (e) e.scrollTop = 0; }, root);
        await H.shot(`p2-${tag}-${key}`);
        // close-up of the first few offenders (padded clip, viewport coords)
        let i = 0;
        for (const b of j.bad.slice(0, CFG.clips ?? 3)) {
            const box = await H.ev(({ s, t }) => {
                const es = s.slice(s.indexOf('>') + 1);
                let list = [];
                try { list = [...document.querySelectorAll(es)]; } catch { return null; }
                const cand = list.find(e => e.offsetParent && e.getBoundingClientRect().width > 0 && (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().startsWith(t));
                if (!cand) return null;
                cand.scrollIntoView({ block: 'center' });
                const r = cand.getBoundingClientRect();
                const x = Math.max(0, r.x - 60), y = Math.max(0, r.y - 30);
                return { x, y, width: Math.min(innerWidth - x, r.width + 120), height: Math.min(innerHeight - y, r.height + 60) };
            }, { s: b.sel, t: b.txt });
            if (box && box.width > 4 && box.height > 4) { await sleep(150); await page.screenshot({ path: `/opt/server-agent/workspace/st-testdata/fix-shots/p2-${tag}-${key}-${i++}.png`, clip: box, animations: 'disabled', caret: 'hide' }); }
        }
        out[key] = { n: j.n, opened, bad: j.bad };
        await H.save('btns-' + key, out[key]);
        if (!was) { await H.ev(s => document.querySelector(s).click(), toggle); await sleep(700); }
    } catch (e) { out[key] = 'ERR ' + String(e).slice(0, 160); }
}
return out;
