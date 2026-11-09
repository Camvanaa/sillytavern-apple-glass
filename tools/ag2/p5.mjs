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
        // a transparent ::before hit area (§5.9) counts
        const b = getComputedStyle(e, '::before');
        const hw = b.content !== 'none' && b.position === 'absolute' ? Math.max(r.width, parseFloat(b.width) || 0) : r.width;
        const hh = b.content !== 'none' && b.position === 'absolute' ? Math.max(r.height, parseFloat(b.height) || 0) : r.height;
        if (hw < 44 || hh < 44) out.push(((e.id ? '#' + e.id : e.tagName.toLowerCase()) + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)));
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

// ---------------------------------------------------------------- menus: + · ⋯ · long-press · palette
async function menus(T) {
    const { page } = await enter(T);
    const r = {};
    const spec = await T.longChat(page);
    const row = `#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`;
    // long press on a list row → pin / rename / delete (touch; iOS fires no contextmenu)
    const box = await page.locator(row).boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const pt = { x: box.x + 120, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await T.sleep(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await T.sleep(500);
    r.longpress = { menu: await page.evaluate(() => [...document.querySelectorAll('.ag2-menu .ag2-menu-item')].map(b => b.textContent.trim())), st: await st(page) };
    await T.shot(page, 'menu-longpress');
    await page.keyboard.press('Escape'); await T.sleep(300);
    await tap(T, page, row, 2500);
    r.chat = await st(page);
    await tap(T, page, '#ag2-plus', 700);
    r.plus = { menu: await page.evaluate(() => [...document.querySelectorAll('.ag2-menu .ag2-menu-item')].map(b => b.textContent.trim()).slice(0, 14)), st: await st(page), small: await small(page, '.ag2-menu') };
    await T.shot(page, 'menu-plus');
    await page.keyboard.press('Escape'); await T.sleep(300);
    await tap(T, page, '#ag2-ph-more', 700);
    r.more = { menu: await page.evaluate(() => [...document.querySelectorAll('.ag2-menu .ag2-menu-item')].map(b => b.textContent.trim())), st: await st(page) };
    await T.shot(page, 'menu-more');
    // ⋯ › 搜索… → palette
    await page.tap('.ag2-menu .ag2-menu-item:last-child'); await T.sleep(900);
    await page.keyboard.type('Ser', { delay: 40 }); await T.sleep(900);
    r.palette = { st: await st(page), rows: await page.evaluate(() => document.querySelectorAll('#ag2-palette .ag2-pal-row').length), small: await small(page, '#ag2-palette') };
    await T.shot(page, 'palette');
    r.small = await small(page, '#ag2-shell');
    r.errors = T.errors(page);
    return r;
}

// ---------------------------------------------------------------- flow: the acceptance walk
// 列表 → 聊天 → 发送（mock）→ 返回 → 设置 → 各页 → 返回, a screenshot + checks per step.
const SET_PAGES = ['api', 'ai', 'fmt', 'wi', 'persona', 'bg', 'look', 'user', 'ext', 'about'];
async function flow(T) {
    const { page, boot } = await enter(T);
    const r = { boot, steps: [] };
    const step = async (name, roots = []) => {
        const s = await st(page);
        const sc = await T.scan(page, roots);
        const rec = { name, ...s, scan: { ovf: sc.ovf, dbl: sc.dbl, unhid: sc.unhid, nest: sc.nest, btn: sc.btn, doc: sc.doc.ok, scrollY: sc.scrollY, blur: sc.blurVis, panels: sc.panels, detail: (sc.ovf + sc.dbl + sc.unhid + sc.nest + sc.btn) ? sc.detail : undefined } };
        r.steps.push(rec);
        await T.shot(page, 'flow-' + String(r.steps.length).padStart(2, '0') + '-' + name);
        return rec;
    };
    await step('list', ['#ag2-sidebar', '#ag2-sidebar .ag2-side-list']);
    const spec = await T.longChat(page);
    await tap(T, page, `#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`, 2500);
    await step('chat', ['#chat', '#sheld', '#form_sheld']);
    // send (mock): type, tap ↑, wait for the reply
    const n0 = await page.evaluate(() => SillyTavern.getContext().chat.length);
    await page.tap('#send_textarea');
    await page.fill('#send_textarea', '测试消息：今天天气如何？');
    await T.sleep(300);
    await step('typing', ['#chat', '#form_sheld']);
    await page.tap('#send_but');
    let sent = 'FAIL';
    try {
        await page.waitForFunction(n => SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000, polling: 100 });
        await page.waitForFunction(() => { const s = document.querySelector('#send_but'); return s && getComputedStyle(s).display !== 'none'; }, null, { timeout: 30000 });
        sent = await page.evaluate(() => document.querySelector('#chat .mes.last_mes .mes_text')?.innerText.includes('mock') ? 'ok' : 'FAIL text');
    } catch (e) { sent = 'FAIL ' + String(e.message).slice(0, 80); }
    await T.sleep(800);
    r.sent = sent;
    await step('sent', ['#chat', '#form_sheld']);
    await tap(T, page, '#ag2-ph-back', 900);
    await step('back', ['#ag2-sidebar']);
    await tap(T, page, '#ag2-tabbar [data-tab="settings"]', 1200);
    await step('settings', ['#ag2-settings', '#ag2-settings .ag2-set-nav']);
    for (const p of SET_PAGES) {
        await tap(T, page, `#ag2-settings .ag2-set-nav [data-page="${p}"].ag2-set-item`, 1600);
        const rec = await step('set-' + p, ['#ag2-settings', '.drawer-content.openDrawer', '#ag2-settings .ag2-set-body']);
        rec.ok = rec.setOpen && rec.level === 'page' && rec.setPage === p;
        await tap(T, page, '#ag2-settings .ag2-set-back', 900);
        const back = await st(page);
        rec.backOk = back.level === 'list' && !back.drawer;
    }
    await tap(T, page, '#ag2-settings .ag2-set-done', 900);
    await step('closed', ['#ag2-sidebar']);
    r.errors = T.errors(page);
    return r;
}

// ---------------------------------------------------------------- edge: 1000 / 1001 (width only)
const layout = page => page.evaluate(() => {
    const vis = sel => [...document.querySelectorAll(sel)].some(e => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; });
    const w = sel => Math.round(document.querySelector(sel)?.getBoundingClientRect().width || 0);
    const set = document.getElementById('ag2-settings');
    return {
        w: innerWidth, phone: document.body.classList.contains('ag2-phone'), ph: document.body.dataset.ag2Ph || null,
        phoneJs: !!document.querySelector('#ag2-tabbar'), tabbar: vis('#ag2-tabbar'), phX: vis('.ag2-ph-x'), tools: vis('#ag2-tools'), topbar: vis('#top-bar'),
        sideW: w('#ag2-sidebar'), sheldL: Math.round(document.getElementById('sheld').getBoundingClientRect().left), sheldW: w('#sheld'),
        setOpen: document.body.classList.contains('ag2-set-open'), setPhone: !!set?.classList.contains('ag2-set-phone'), setW: set && !set.hidden ? w('#ag2-settings') : 0,
        doc: document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth, scrollX: scrollX,
        phoneModule: performance.getEntriesByType('resource').some(e => /shell\/phone\.js/.test(e.name)),
    };
});

async function edge(T) {
    const r = {};
    for (const w of [1000, 1001]) {
        const { page } = await enter(T, { page: { phone: false, w, h: 900 }, chat: true });
        const a = await layout(page);
        await page.evaluate(() => document.querySelector('#ag2-tabbar [data-tab="settings"], #ag2-sidebar [data-act="settings"]')?.click());
        await T.sleep(1200);
        const b = await layout(page);
        await T.shot(page, `edge-${w}-settings`);
        await page.keyboard.press('Escape'); await T.sleep(600);
        r[w] = { chat: a, settings: b, errors: T.errors(page).filter(e => !/404/.test(e)) };
        await page.context().close();
    }
    // live resize across the boundary (desktop window narrowed / widened), settings open while crossing
    const { page } = await enter(T, { page: { phone: false, w: 1001, h: 900 }, chat: true });
    const seq = [];
    await page.evaluate(() => document.querySelector('#ag2-sidebar [data-act="settings"]').click());
    await T.sleep(1200);
    seq.push(['1001+set', await layout(page)]);
    for (const w of [1000, 1001, 1000, 1001]) {
        await page.setViewportSize({ width: w, height: 900 });
        await T.sleep(900);
        seq.push([String(w), await layout(page)]);
    }
    await page.setViewportSize({ width: 1000, height: 900 });
    await T.sleep(900);
    await page.evaluate(() => document.querySelector('#ag2-tabbar [data-tab="settings"]').click());
    await T.sleep(1200);
    seq.push(['1000+sheet', await layout(page)]);
    await page.setViewportSize({ width: 1001, height: 900 });
    await T.sleep(900);
    seq.push(['1001 after sheet', await layout(page)]);
    r.resize = seq;
    r.errors = T.errors(page).filter(e => !/404/.test(e));
    return r;
}

// ---------------------------------------------------------------- gestures: ST swipes only inside #sheld
async function swipe(T, page, cdp, x0, x1, y) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 6, y }] }); await T.sleep(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await T.sleep(1200);
}
const swipeId = page => page.evaluate(() => { const c = SillyTavern.getContext(); const m = c.chat[c.chat.length - 1]; return { id: m?.swipe_id ?? null, n: m?.swipes?.length ?? 0, len: c.chat.length }; });

async function gest(T) {
    const { page } = await enter(T);
    const cdp = await page.context().newCDPSession(page);
    const r = {};
    const spec = await T.longChat(page);
    await tap(T, page, `#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`, 2500);
    const y = await page.evaluate(() => { const m = document.querySelector('#chat .last_mes .mes_text'); const q = m.getBoundingClientRect(); return Math.round(q.top + Math.min(20, q.height / 2)); });
    r.before = await swipeId(page);
    // control: inside #sheld a right-to-left swipe on the last reply = ST's next swipe
    await swipe(T, page, cdp, 320, 80, y);
    r.chatSwipe = await swipeId(page);
    // list page (outside #sheld)
    await tap(T, page, '#ag2-ph-back', 900);
    await swipe(T, page, cdp, 320, 80, 400);
    await swipe(T, page, cdp, 80, 320, 400);
    r.listSwipe = await swipeId(page);
    r.listPh = (await st(page)).ph;
    // settings sheet
    await tap(T, page, '#ag2-tabbar [data-tab="settings"]', 1200);
    await swipe(T, page, cdp, 320, 80, 400);
    r.sheetSwipe = await swipeId(page);
    r.sheetOpen = (await st(page)).setOpen;
    await tap(T, page, '#ag2-settings .ag2-set-done', 800);
    // inspector sheet
    await tap(T, page, `#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`, 1500);
    await tap(T, page, '#ag2-title .ag2-title-btn', 1200);
    await swipe(T, page, cdp, 320, 80, 500);
    r.inspSwipe = await swipeId(page);
    r.inspOpen = (await st(page)).insp;
    r.errors = T.errors(page).filter(e => !/404/.test(e));
    return r;
}

// ---------------------------------------------------------------- pages: 角色 tab, group, AN, 本次对话, close, 世界书, keyboard
async function pages(T) {
    const { page } = await enter(T);
    const r = {};
    const menuPick = async label => {
        await tap(T, page, '#ag2-ph-more', 600);
        await page.locator('.ag2-menu .ag2-menu-item', { hasText: label }).first().tap();
        await T.sleep(1300);
    };
    await tap(T, page, '#ag2-tabbar [data-tab="chars"]', 700);
    r.chars = await st(page);
    await T.shot(page, 'pg-chars');
    await tap(T, page, '#ag2-sidebar .ag2-seg [data-seg="groups"]', 700);
    r.groups = await st(page);
    await T.shot(page, 'pg-groups');
    // group → chat page → 群组资料 (inspector sheet, group page)
    await tap(T, page, '#ag2-sidebar .ag2-ent-row', 2800);
    r.groupChat = await st(page);
    await menuPick('群组资料');
    r.groupInsp = await st(page);
    r.groupInspScan = await T.scan(page, ['#right-nav-panel', '#right-nav-panel > .scrollableInner']);
    await T.shot(page, 'pg-group-insp');
    await tap(T, page, '#right-nav-panel [data-ag2-act="close"]', 800);
    // a character from the 角色 tab
    await tap(T, page, '#ag2-ph-back', 800);
    await tap(T, page, '#ag2-sidebar .ag2-seg [data-seg="chars"]', 700);
    await tap(T, page, '#ag2-sidebar .ag2-ent-row[title*="Mira"], #ag2-sidebar .ag2-ent-row:nth-child(2)', 2800);
    r.charChat = await st(page);
    await menuPick('本次对话');
    r.chatInfo = await st(page);
    await T.shot(page, 'pg-chatinfo');
    await tap(T, page, '#right-nav-panel [data-ag2-act="close"]', 800);
    await menuPick('作者注释');
    r.an = await page.evaluate(() => { const e = document.getElementById('floatingPrompt'); const q = e?.getBoundingClientRect(); return e ? { vis: getComputedStyle(e).display !== 'none', rect: [q.left, q.top, q.width, q.height].map(Math.round), sw: e.scrollWidth, cw: e.clientWidth } : null; });
    r.anScan = await T.scan(page, ['#floatingPrompt']);
    await T.shot(page, 'pg-an');
    await page.evaluate(() => document.getElementById('option_toggle_AN')?.click());
    await T.sleep(800);
    // keyboard: emulate iOS shrinking only the visual viewport (Chromium cannot): the chat
    // page must follow --ag2-vvh and the composer sit on its bottom edge
    await page.evaluate(() => { document.body.style.setProperty('--ag2-vvh', '500px'); document.body.classList.add('ag2-kb'); });
    await T.sleep(300);
    r.kb = await page.evaluate(() => { const q = id => document.getElementById(id).getBoundingClientRect(); return { sheldH: Math.round(q('sheld').height), composerBottom: Math.round(q('form_sheld').bottom), islandBottom: Math.round(q('nonQRFormItems').bottom) }; });
    await T.shot(page, 'pg-kb-sim');
    await page.evaluate(() => { document.body.classList.remove('ag2-kb'); window.visualViewport.dispatchEvent(new Event('resize')); });
    await T.sleep(300);
    r.kbAfter = await page.evaluate(() => ({ vvh: document.body.style.getPropertyValue('--ag2-vvh'), kb: document.body.classList.contains('ag2-kb'), sheldH: Math.round(document.getElementById('sheld').getBoundingClientRect().height) }));
    // ⋯ › 关闭对话 → back on the list
    await menuPick('关闭对话');
    await T.sleep(800);
    r.closed = await st(page);
    await T.shot(page, 'pg-closed');
    // 世界书 tab → the sheet on 世界书
    await tap(T, page, '#ag2-tabbar [data-tab="wi"]', 1500);
    r.wi = await st(page);
    await T.shot(page, 'pg-wi');
    r.errors = T.errors(page).filter(e => !/404/.test(e));
    return r;
}

// ---------------------------------------------------------------- reduced motion (ST switch / OS setting) on the phone pages
async function phoneMotion(T, page) {
    const computed = () => page.evaluate(() => {
        let maxTr = 0, maxAn = 0;
        for (const e of document.querySelectorAll('body *')) {
            const c = getComputedStyle(e);
            maxTr = Math.max(maxTr, ...c.transitionDuration.split(',').map(x => parseFloat(x) * 1000));
            if (c.animationName !== 'none') maxAn = Math.max(maxAn, ...c.animationDuration.split(',').map(x => parseFloat(x) * 1000));
        }
        return { maxTransitionMs: Math.round(maxTr * 100) / 100, maxAnimationMs: Math.round(maxAn * 100) / 100 };
    });
    const live = async f => {
        await page.evaluate(() => { window.__mx = 0; window.__run = true; const t = () => { if (!window.__run) return; for (const a of document.getAnimations()) { const d = a.effect?.getComputedTiming?.().duration; if (d > window.__mx) window.__mx = d; } requestAnimationFrame(t); }; requestAnimationFrame(t); });
        await f(); await T.sleep(600);
        return page.evaluate(() => { window.__run = false; return Math.round(window.__mx * 100) / 100; });
    };
    const out = { bodyClass: await page.evaluate(() => document.body.classList.contains('reduced-motion')), list: await computed(), live: {} };
    const spec = await T.longChat(page);
    out.live.push = await live(() => page.tap(`#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`));
    await T.sleep(1500);
    out.chat = await computed();
    out.live.insp = await live(() => page.tap('#ag2-title .ag2-title-btn'));
    out.live.inspClose = await live(() => page.tap('#right-nav-panel [data-ag2-act="close"]'));
    out.live.pop = await live(() => page.tap('#ag2-ph-back'));
    out.live.sheet = await live(() => page.tap('#ag2-tabbar [data-tab="settings"]'));
    out.live.pagePush = await live(() => page.tap('#ag2-settings .ag2-set-item[data-page="ai"]'));
    out.sheet = await computed();
    return out;
}

async function reduced(T) {
    const r = {};
    { const { page } = await enter(T, { prep: { powerUser: { reduced_motion: true } } }); r.stSwitch = await phoneMotion(T, page); r.stSwitch.errors = T.errors(page).filter(e => !/404/.test(e)); await page.context().close(); }
    { const { page } = await enter(T, { page: { reduced: true } }); r.osSetting = await phoneMotion(T, page); r.osSetting.errors = T.errors(page).filter(e => !/404/.test(e)); await page.context().close(); }
    { const { page } = await enter(T); r.normal = await phoneMotion(T, page); }
    return r;
}

// ---------------------------------------------------------------- teardown / ?classic / lazy loading on phones
async function teardown(T) {
    const r = {};
    {
        const { page } = await enter(T);
        const spec = await T.longChat(page);
        await tap(T, page, `#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`, 2500);
        await page.evaluate(() => { $('#themes').val('Apple Glass Dark').trigger('change'); });
        await T.sleep(3000);
        r.toDark = await page.evaluate(() => ({
            bodyAg2: [...document.body.classList].filter(c => /^ag2/.test(c)), ph: document.body.dataset.ag2Ph || null,
            nodes: document.querySelectorAll('[id^="ag2-"], .ag2-ph-x').length, vv: document.body.style.getPropertyValue('--ag2-vvh'),
            mes: document.querySelectorAll('#chat .mes').length, sheldVis: getComputedStyle(document.getElementById('sheld')).visibility,
        }));
        const sc = await T.scan(page, ['#chat', '#sheld']);
        r.toDarkScan = { ovf: sc.ovf, dbl: sc.dbl, unhid: sc.unhid, nest: sc.nest, doc: sc.doc.ok, scrollY: sc.scrollY };
        await T.shot(page, 'teardown-dark');
        await page.evaluate(() => { $('#themes').val('Apple Glass 2').trigger('change'); });
        await T.sleep(3500);
        r.backToAg2 = await st(page);
        await T.shot(page, 'teardown-back');
        r.errors = T.errors(page).filter(e => !/404/.test(e));
        await page.context().close();
    }
    {
        const page = await T.newPage({ phone: true });
        await T.prepare(page, {});
        await T.boot(page, { ag2: false, query: '?classic', settle: 2500 });
        r.classic = await page.evaluate(() => ({ ag2: document.body.classList.contains('ag2'), nodes: document.querySelectorAll('[id^="ag2-"]').length }));
        await page.context().close();
    }
    // desktop never requests phone.js; a phone does
    for (const [name, over] of [['desk', { phone: false, w: 1440, h: 900 }], ['phone', { phone: true }]]) {
        const page = await T.newPage(over);
        const reqs = [];
        page.on('request', q => { if (/\/shell\/[a-z]+\.js/.test(q.url())) reqs.push(q.url().replace(/^.*\/shell\//, '').replace(/\?.*$/, '')); });
        await T.prepare(page, {});
        await T.boot(page, { ag2: true, settle: 2500 });
        r['modules_' + name] = [...new Set(reqs)].sort();
        await page.context().close();
    }
    return r;
}

// ---------------------------------------------------------------- touch targets (shell controls ≥44pt)
async function touch(T) {
    const { page } = await enter(T);
    const r = {};
    r.list = await small(page, '#ag2-shell');
    r.listRowH = await page.evaluate(() => [...document.querySelectorAll('#ag2-sidebar .ag2-row')].slice(0, 5).map(e => Math.round(e.getBoundingClientRect().height)));
    const spec = await T.longChat(page);
    await tap(T, page, `#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`, 2500);
    r.chatShell = await small(page, '#ag2-shell');
    r.composer = await small(page, '#nonQRFormItems');
    r.qr = await small(page, '#send_form .qr--buttons');
    await tap(T, page, '#ag2-title .ag2-title-btn', 1200);
    r.inspHead = await small(page, '#right-nav-panel .ag2-insp-head');
    await tap(T, page, '#right-nav-panel [data-ag2-act="close"]', 800);
    await tap(T, page, '#ag2-ph-back', 800);
    await tap(T, page, '#ag2-tabbar [data-tab="settings"]', 1200);
    r.sheetList = await small(page, '#ag2-settings');
    await tap(T, page, '#ag2-settings .ag2-set-item[data-page="look"]', 1000);
    r.look = await small(page, '#ag2-settings');
    await T.shot(page, 'touch-look');
    await tap(T, page, '#ag2-settings .ag2-set-back', 800);
    await tap(T, page, '#ag2-settings .ag2-set-item[data-page="user"]', 1500);
    r.stPanelUser = (await small(page, '#user-settings-block')).length; // ST's own controls (count only)
    r.errors = T.errors(page).filter(e => !/404/.test(e));
    return r;
}

export default async function (T) {
    const parts = { dev, menus, flow, edge, gest, pages, reduced, teardown, touch };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    await T.save('p5-' + part, r);
    return r;
}
