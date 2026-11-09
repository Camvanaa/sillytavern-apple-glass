// tools/ag2/p2b-search.mjs — P2b cross-page search acceptance probe.
//   node tools/ag2/run.mjs tools/ag2/p2b-search.mjs --phase P2b [--mem] [--reduced] [--stclass]
//        [--terms 温度,世界书,流式,背景] [--pick 0,0,0,0] [--snap]
// --reduced: system prefers-reduced-motion (run.mjs); --stclass: ST's own switch (body.reduced-motion).
// Reports: lazy-load (search.js requested only on first keystroke), per term the top results
// (“页面 › 分组 › 设置项”), the revealed row (selector, page, visible, in viewport) and the
// hit animation (name, duration) right after the click.
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const MEM = process.argv.includes('--mem');
const STCLASS = process.argv.includes('--stclass');
const SNAP = process.argv.includes('--snap');
const TERMS = arg('terms', '温度,世界书,流式,背景').split(',');
const PICK = arg('pick', '').split(',').map(Number);
const PINYIN = { 温度: 'wendu', 世界书: 'shijieshu', 流式: 'liushi', 背景: 'beijing' };

export default async function (T) {
    const page = await T.newPage();
    const reqs = [];
    page.on('request', r => { if (/\/shell\/search\.js/.test(r.url())) reqs.push(r.url()); });
    await T.prepare(page, MEM ? { theme: 'ag2' } : {});
    await T.boot(page, { ag2: true, settle: 1500 });
    const lazy = { boot: reqs.length };
    await T.openChat(page, await T.longChat(page), 20);
    if (STCLASS) await page.evaluate(() => document.body.classList.add('reduced-motion'));
    await page.click('#ag2-sidebar [data-act="settings"]');
    await page.waitForSelector('#ag2-settings:not([hidden])', { timeout: 15000 });
    await T.sleep(800);
    lazy.open = reqs.length;
    // visit a couple of pages: still no index
    for (const p of ['ai', 'user']) { await page.click(`#ag2-settings .ag2-set-item[data-page="${p}"]`); await T.sleep(500); }
    lazy.pages = reqs.length;
    const input = '#ag2-settings .ag2-set-search input';
    const out = { lazy, terms: {} };
    for (const [ti, term] of TERMS.entries()) {
        await page.click(input);
        await page.fill(input, '');
        await page.keyboard.type(term, { delay: 30 });
        const t0 = Date.now();
        await page.waitForFunction(() => !document.querySelector('#ag2-settings .ag2-set-results')?.hidden, null, { timeout: 5000 }).catch(() => {});
        const ms = Date.now() - t0;
        await T.sleep(150);
        if (ti === 0) lazy.afterType = reqs.length;
        const list = await page.evaluate(() => [...document.querySelectorAll('#ag2-settings .ag2-res')].slice(0, 6).map(b => b.getAttribute('aria-label')));
        const pick = Number.isFinite(PICK[ti]) && arg('pick') ? PICK[ti] : Math.max(0, list.findIndex(t => t.includes('›')));
        const btn = (await page.$$('#ag2-settings .ag2-res'))[pick];
        if (!btn) { out.terms[term] = { list, ms, err: 'no result' }; continue; }
        await btn.click();
        await T.sleep(150);
        const early = await page.evaluate(() => {
            const r = document.querySelector('.ag2-hit');
            if (!r) return null;
            const a = r.getAnimations().find(x => x.animationName === 'ag2-hit');
            const cs = getComputedStyle(r);
            return { anim: a ? { name: a.animationName, dur: a.effect.getComputedTiming().duration, iter: a.effect.getComputedTiming().iterations } : null, cssDur: cs.animationDuration, outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor };
        });
        // ~600ms after the click = the 50% keyframe (ring + fill): measure, then the still
        await T.sleep(450);
        const where = await page.evaluate(() => {
            const r = document.querySelector('.ag2-hit');
            const set = document.getElementById('ag2-settings');
            const st = { page: set?.querySelector('.ag2-set-item[aria-current="page"], .ag2-set-item.ag2-on')?.dataset.page || null, search: set?.querySelector('.ag2-set-search input')?.value };
            if (!r) return { ...st, row: null };
            const d = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).filter(c => c !== 'ag2-hit').slice(0, 2).join('.') : '');
            const ctl = r.querySelector('input[id], select[id], textarea[id]');
            const b = r.getBoundingClientRect();
            const top = document.elementFromPoint(b.left + Math.min(20, b.width / 2), b.top + Math.min(10, b.height / 2));
            return {
                ...st, row: d(r) + (r.parentElement ? ' < ' + d(r.parentElement) : ''), ctl: ctl ? '#' + ctl.id : null,
                text: r.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
                rect: [b.left, b.top, b.width, b.height].map(Math.round),
                inView: b.top >= 0 && b.bottom <= innerHeight && b.width > 0,
                onTop: !!top && (r.contains(top) || top.contains(r)),
            };
        });
        out.terms[term] = { list, ms, pick, early, where };
        if (SNAP) await T.shot(page, `search-${PINYIN[term] || ti}`); // after measuring: the shot takes ~1s
        await T.sleep(1200);
    }
    return out;
}
