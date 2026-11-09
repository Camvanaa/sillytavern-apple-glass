// tools/ag2/p5.mjs — P5 acceptance: phone layout (DESIGN §5.9), 390×844 DPR3 iPhone UA.
//   node tools/ag2/run.mjs tools/ag2/p5.mjs --phone --phase P5 --part dev|flow|... [--mem]
//   --mem: inject the worktree CSS in memory (debug); acceptance runs use the published theme.
// Writes stay stubbed (run.mjs); generation is the run.mjs SSE mock.

const part = (() => { const i = process.argv.indexOf('--part'); return i > 0 ? process.argv[i + 1] : 'dev'; })();
const MEM = process.argv.includes('--mem');

export async function enter(T, opt = {}) {
    const page = await T.newPage({ phone: true, ...(opt.page || {}) });
    if (opt.init) await page.addInitScript(opt.init);
    await T.prepare(page, { ...(MEM ? { theme: 'ag2' } : {}), ...(opt.prep || {}) });
    const b = await T.boot(page, { ag2: true, settle: 2000 });
    if (opt.chat) { await T.openChat(page, opt.chat === true ? await T.longChat(page) : opt.chat, 2); await T.sleep(400); }
    return { page, boot: b };
}

/** Everything a phone step is judged by (DOM only, small). */
export const st = page => page.evaluate(() => {
    const b = document.body;
    const vis = sel => { const e = document.querySelector(sel); if (!e) return false; const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05 && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
    const rect = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const se = document.scrollingElement;
    const set = document.getElementById('ag2-settings');
    const c = SillyTavern.getContext();
    let blur = 0;
    for (const e of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(e);
        if (!cs.backdropFilter || cs.backdropFilter === 'none' || cs.visibility === 'hidden' || cs.display === 'none') continue;
        const q = e.getBoundingClientRect();
        if (q.width > 0 && q.height > 0 && q.right > 0 && q.bottom > 0 && q.left < innerWidth && q.top < innerHeight) blur++;
    }
    // panels / pages that are on screen: own horizontal overflow
    const ovf = [];
    for (const sel of ['#ag2-sidebar', '#ag2-sidebar .ag2-side-list', '#ag2-settings', '#ag2-settings .ag2-set-nav', '#ag2-settings .ag2-set-body', '#right-nav-panel', '#right-nav-panel > .scrollableInner', '#chat', '#sheld', '#form_sheld', '#ag2-palette', '.drawer-content.openDrawer']) {
        const e = document.querySelector(sel);
        if (e && vis(sel) && e.scrollWidth > e.clientWidth + 1) ovf.push(sel + ' ' + e.scrollWidth + '>' + e.clientWidth);
    }
    return {
        phone: b.classList.contains('ag2-phone'), ph: b.dataset.ag2Ph || null, welcome: b.classList.contains('ag2-welcome'),
        list: vis('#ag2-sidebar'), tabbar: vis('#ag2-tabbar'), sheld: vis('#sheld'), back: vis('#ag2-ph-back'), title: vis('#ag2-title'), more: vis('#ag2-ph-more'),
        tools: vis('#ag2-tools'), topbar: vis('#top-bar'), composer: vis('#send_form'), plus: vis('#ag2-plus'), model: vis('#ag2-model'),
        big: document.querySelector('.ag2-ph-big')?.textContent || null,
        seg: document.getElementById('ag2-sidebar')?.dataset.segment || null,
        tab: document.querySelector('#ag2-tabbar .ag2-on')?.dataset.tab || null,
        setOpen: b.classList.contains('ag2-set-open'), setPhone: !!set?.classList.contains('ag2-set-phone'), level: set?.dataset.level || null, setPage: b.dataset.ag2Set || null,
        drawer: [...document.querySelectorAll('.drawer-content.openDrawer')].map(e => e.id).join(','),
        drawerRect: rect('#top-settings-holder .drawer-content.openDrawer'), sheetRect: rect('#ag2-settings'),
        insp: b.classList.contains('ag2-insp-open'), inspRect: rect('#right-nav-panel'), inspView: document.getElementById('right-nav-panel')?.dataset.ag2Insp || null,
        palette: !!document.querySelector('#ag2-palette[open]'), menu: !!document.querySelector('.ag2-menu'),
        chatId: c.getCurrentChatId?.() || null, name2: c.name2, mes: document.querySelectorAll('#chat .mes').length,
        scrollX: window.scrollX, scrollY: window.scrollY, doc: { sw: se.scrollWidth, cw: se.clientWidth, ok: se.scrollWidth <= se.clientWidth },
        ovf, blur, vvh: b.style.getPropertyValue('--ag2-vvh') || null,
    };
});

/** Interactive elements on screen smaller than 44×44 (touch targets, §5.9). */
export const small = (page, scope = 'body') => page.evaluate(sc => {
    const out = [];
    const root = document.querySelector(sc);
    if (!root) return out;
    for (const e of root.querySelectorAll('button, [role="button"], a[href], [role="tab"], input[type="checkbox"], select, .menu_button, .qr--button')) {
        const c = getComputedStyle(e);
        if (c.display === 'none' || c.visibility === 'hidden') continue;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        if (r.width < 44 || r.height < 44) out.push(((e.id ? '#' + e.id : e.tagName.toLowerCase()) + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)));
    }
    return out;
}, scope);

const tap = async (T, page, sel, ms = 700) => { await page.tap(sel); await T.sleep(ms); };

// ---------------------------------------------------------------- dev: one pass over the pages
async function dev(T) {
    const { page, boot } = await enter(T);
    const r = { boot, steps: {} };
    const step = async (name, shot = true) => { r.steps[name] = await st(page); if (shot) await T.shot(page, 'dev-' + name); };
    await step('home');
    // open Aldric's long chat from the list
    const spec = await T.longChat(page);
    const sel = `#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`;
    await tap(T, page, sel, 2500);
    await step('chat');
    await tap(T, page, '#ag2-title .ag2-title-btn', 1200);
    await step('insp');
    await tap(T, page, '#right-nav-panel [data-ag2-act="close"]', 800);
    await tap(T, page, '#ag2-ph-back', 800);
    await step('back');
    await tap(T, page, '#ag2-tabbar [data-tab="settings"]', 1200);
    await step('set-list');
    await tap(T, page, '#ag2-settings .ag2-set-item[data-page="api"]', 1500);
    await step('set-api');
    await tap(T, page, '#ag2-settings .ag2-set-back', 1000);
    await tap(T, page, '#ag2-settings .ag2-set-item[data-page="look"]', 1000);
    await step('set-look');
    r.small = await small(page, '#ag2-settings');
    r.errors = T.errors(page);
    return r;
}

export default async function (T) {
    const parts = { dev };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    await T.save('p5-' + part, r);
    return r;
}
