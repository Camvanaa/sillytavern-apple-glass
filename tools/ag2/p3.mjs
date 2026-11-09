// tools/ag2/p3.mjs — P3 acceptance: inspector (ST's right panel) + title menu.
//   node tools/ag2/run.mjs tools/ag2/p3.mjs --phase P3 --part dev|shots|edit|switch|group|chat|title|state [--w 1280] [--mem]
//   --mem: inject the worktree CSS in memory (debug); acceptance runs use the published theme.
// Writes stay stubbed (run.mjs). `edit` additionally records the /api/characters/edit body
// (still fulfilled in memory) to check which card an autosave targets.

const part = (() => { const i = process.argv.indexOf('--part'); return i > 0 ? process.argv[i + 1] : 'dev'; })();
const MEM = process.argv.includes('--mem');
const AV = { aldric: 'ag2_Aldric.png', mira: 'ag2_Mira.png', kael: 'ag2_Kael.png', sera: 'default_Seraphina.png' };

async function enter(T, opt = {}) {
    const page = await T.newPage(opt.page || {});
    await T.prepare(page, { ...(MEM ? { theme: 'ag2' } : {}), ...(opt.prep || {}) });
    if (opt.before) await opt.before(page);
    const b = await T.boot(page, { ag2: true, settle: 2000 });
    if (opt.noChat) return { page, boot: b };
    await T.openChat(page, opt.spec || await T.longChat(page), opt.minMes ?? 2);
    await T.sleep(600);
    return { page, boot: b };
}

/** Inspector state: open, view, which character the visible form belongs to, geometry. */
const st = page => page.evaluate(() => {
    const p = document.getElementById('right-nav-panel');
    const r = el => { if (!el) return null; const q = el.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const c = SillyTavern.getContext();
    const cur = c.characterId !== undefined ? c.characters[c.characterId] : null;
    return {
        open: document.body.classList.contains('ag2-insp-open'), drawer: p.classList.contains('openDrawer'),
        pinned: p.classList.contains('pinnedOpen'), menuType: p.dataset.menuType || null, view: p.dataset.ag2Insp || null,
        chatChar: cur?.name || null, group: c.groupId || null,
        pole: document.getElementById('avatar_url_pole')?.value || null,
        heroName: document.getElementById('ag2-insp-name')?.textContent || null,
        heroVis: vis(document.getElementById('ag2-insp-hero')),
        formVis: vis(document.getElementById('descriptionWrapper')),
        groupVis: vis(document.getElementById('rm_group_chats_block')),
        descSum: (document.getElementById('ag2-insp-desc-sum')?.textContent || '').slice(0, 40),
        tags: [...document.querySelectorAll('#tagList .tag')].filter(vis).map(t => t.textContent.trim()).slice(0, 5),
        panel: r(p), sheld: r(document.getElementById('sheld')), tools: r(document.getElementById('ag2-tools')),
        title: r(document.getElementById('ag2-title')),
        toggle: document.querySelector('#ag2-tools [data-act="insp"]')?.getAttribute('aria-pressed'),
        stored: localStorage.getItem('ag2.inspector'),
    };
});

const toggle = async (T, page) => { await page.click('#ag2-tools [data-act="insp"]'); await T.sleep(700); };

// ---------------------------------------------------------------- dev: quick look
async function dev(T) {
    const { page } = await enter(T);
    await toggle(T, page);
    const s1 = await st(page);
    await T.shot(page, `dev-insp-${T.cfg.w}`);
    const scan = await T.scan(page, ['#right-nav-panel']);
    return { s1, scan: { ovf: scan.ovf, dbl: scan.dbl, unhid: scan.unhid, nest: scan.nest, btn: scan.btn, blurVis: scan.blurVis, detail: scan.detail }, errors: T.errors(page) };
}

export default async function (T) {
    const parts = { dev };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    await T.save('p3-' + part, r);
    return r;
}
