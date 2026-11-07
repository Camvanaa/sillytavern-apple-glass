// s2check: probe a before/after pixel difference on one chat style at the bottom of
// the chat. Records the fractional geometry of the visible messages, takes a shot,
// then re-shoots after each CFG.toggles entry in turn. An entry is either override
// CSS (string) or { css?, swapCss?, js?, resize? }: swapCss is a URL whose text
// replaces the theme stylesheet in place, js is an expression evaluated in the page,
// resize nudges the viewport by 1px and back. CFG.region = [x, y, w, h] also dumps
// every rendered element whose box intersects the region, with compositing-relevant
// computed style. CFG.style (default 2 = document).
// Shots: perf-shots/s2-<v>-<w>-<tag>-<name>.png
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = 2000; CFG.settleChat = 3500;
await H.boot();
await H.openChar();
await H.setStyle(CFG.style ?? 2);
await sleep(700);
const toEnd = async () => { await H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; }); await sleep(500); };
const geo = () => H.ev(() => {
    const c = document.querySelector('#chat');
    const ms = [...c.querySelectorAll('.mes')].map(m => {
        const r = m.getBoundingClientRect(), b = m.querySelector('.mes_block'), br = b.getBoundingClientRect(), cs = getComputedStyle(b);
        return { id: m.getAttribute('mesid'), last: m.classList.contains('last_mes'), top: r.top, h: r.height, bTop: br.top, bH: br.height, tf: cs.transform, tr: cs.translate, an: cs.animationName, bf: cs.backdropFilter, ct: cs.contain };
    }).filter(x => x.top + x.h > -50 && x.top < innerHeight + 50);
    return { st: c.scrollTop, sh: c.scrollHeight, ch: c.clientHeight, cTop: c.getBoundingClientRect().top, body: document.body.className.split(/\s+/).filter(x => /style|ap-chat|bubble/.test(x)), ms };
});
const dump = region => H.ev(([x, y, w, h]) => {
    const props = ['position', 'z-index', 'opacity', 'transform', 'translate', 'filter', 'backdrop-filter', 'mask-image', 'will-change', 'contain', 'isolation', 'mix-blend-mode', 'overflow', 'visibility', 'clip-path'];
    const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.right < x || r.left > x + w || r.bottom < y || r.top > y + h) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        const o = { el: desc(el), r: [r.x, r.y, r.width, r.height].map(v => Math.round(v * 64) / 64) };
        for (const p of props) o[p] = cs.getPropertyValue(p);
        out.push(o);
    }
    return out;
}, region);
const tag = `${CFG.v}-${CFG.w || 1440}-${CFG.tag || 'r'}`;
const out = {};
await toEnd();
out.asis = await geo();
if (CFG.region) await H.save('dump', { v: CFG.v, tag, items: await dump(CFG.region) });
await H.shot(`s2-${tag}-asis`);
for (const [k, t0] of Object.entries(CFG.toggles || {})) {
    const t = typeof t0 === 'string' ? { css: t0 } : t0;
    if (t.css !== undefined) await H.setCss(t.css);
    if (t.swapCss) { // replace the whole theme stylesheet in place (ST's #custom-style)
        const css = await (await fetch(t.swapCss + '?t=' + Date.now())).text();
        await H.ev(c => { document.getElementById('custom-style').textContent = c; }, css);
        await sleep(800);
    }
    if (t.js) { await page.evaluate(t.js); await sleep(t.wait ?? 600); }
    if (t.resize) {
        const vs = page.viewportSize();
        await page.setViewportSize({ width: vs.width, height: vs.height + 1 }); await sleep(400);
        await page.setViewportSize(vs); await sleep(400);
    }
    await toEnd();
    out[k] = await geo();
    await H.shot(`s2-${tag}-${k}`);
}
await H.setCss('');
await H.save('s2', out);
return out;
