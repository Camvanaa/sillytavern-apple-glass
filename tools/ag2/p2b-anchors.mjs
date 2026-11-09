// tools/ag2/p2b-anchors.mjs — anchor capsules on the long pages (连接, 生成参数, 提示词与格式).
//   node tools/ag2/run.mjs tools/ag2/p2b-anchors.mjs --phase P2b [--reduced]
// Per page: capsule labels, bar sticks in the head, each capsule scrolls its target to the
// scroller's top (±24px, or the scroller is at its end) and becomes aria-current; short pages
// (外观, 背景) show no bar.
export default async function (T) {
    const page = await T.newPage();
    await T.prepare(page, {});
    await T.boot(page, { ag2: true, settle: 1500 });
    await T.openChat(page, await T.longChat(page), 20);
    await page.click('#ag2-sidebar [data-act="settings"]');
    await page.waitForSelector('#ag2-settings:not([hidden])', { timeout: 15000 });
    await T.sleep(800);
    const out = {};
    for (const p of ['api', 'ai', 'fmt', 'look', 'bg']) {
        await page.click(`#ag2-settings .ag2-set-item[data-page="${p}"]`);
        await T.sleep(1200);
        const bar = await page.evaluate(() => {
            const b = document.querySelector('#ag2-settings .ag2-anchors');
            return { hidden: !b || b.hidden || !b.getClientRects().length, labels: b ? [...b.querySelectorAll('.ag2-anchor')].map(x => x.textContent) : [] };
        });
        const r = { ...bar, clicks: [] };
        for (let i = 0; i < bar.labels.length && !bar.hidden; i++) {
            await page.click(`#ag2-settings .ag2-anchor[data-i="${i}"]`);
            await T.sleep(900);
            r.clicks.push(await page.evaluate(i => {
                const b = document.querySelector(`#ag2-settings .ag2-anchor[data-i="${i}"]`);
                const sc = [...document.querySelectorAll('#rm_api_block, #left-nav-panel > .scrollableInner, #AdvancedFormatting')].find(e => e.getClientRects().length && e.scrollHeight > e.clientHeight);
                const bar = document.querySelector('#ag2-settings .ag2-anchors').getBoundingClientRect();
                const atEnd = sc ? sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 : null;
                // target: first visible heading / block whose text starts with the label (api, fmt) or
                // the section block (ai) — the probe only checks that *something* titled so is in view
                const vis = e => e.getClientRects().length > 0;
                const lab = b.textContent;
                const cand = [...sc.querySelectorAll('h3, h4, .range-block, .inline-drawer, [id$="-block"]')].filter(vis)
                    .filter(e => (e.textContent || '').replace(/\s+/g, ' ').trim().startsWith(lab.slice(0, 4)));
                const top = sc.getBoundingClientRect().top;
                const y = cand.length ? Math.round(cand[0].getBoundingClientRect().top - top) : null;
                return { label: lab, current: b.getAttribute('aria-current'), scrollTop: sc && Math.round(sc.scrollTop), atEnd, barTop: Math.round(bar.top), y,
                    placed: y == null ? null : (Math.abs(y) <= 24 || (atEnd && y >= 0 && y < sc.clientHeight)) };
            }, i));
        }
        r.ok = bar.hidden ? ['look', 'bg'].includes(p) : r.clicks.every(c => c.current === 'true') && new Set(r.clicks.map(c => c.barTop)).size === 1;
        out[p] = r;
    }
    out.errors = T.errors(page);
    return out;
}
