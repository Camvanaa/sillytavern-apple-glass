// tools/ag2/p4.mjs — P4 acceptance: command palette + shortcuts.
//   node tools/ag2/run.mjs tools/ag2/p4.mjs --phase P4 --part dev|search|keys|focus|esc|mac|shots|lazy [--w 1280] [--mem]
//   --mem: inject the worktree CSS in memory (debug); acceptance runs use the published theme.
// Writes stay stubbed (run.mjs): “新对话” etc. only change the in-memory chat.

const part = (() => { const i = process.argv.indexOf('--part'); return i > 0 ? process.argv[i + 1] : 'dev'; })();
const MEM = process.argv.includes('--mem');

async function enter(T, opt = {}) {
    const page = await T.newPage(opt.page || {});
    if (opt.init) await page.addInitScript(opt.init);
    await T.prepare(page, { ...(MEM ? { theme: 'ag2' } : {}), ...(opt.prep || {}) });
    const b = await T.boot(page, { ag2: true, settle: 2000 });
    if (opt.noChat) return { page, boot: b };
    await T.openChat(page, opt.spec || await T.longChat(page), 2);
    await T.sleep(500);
    return { page, boot: b };
}

/** Palette state from the DOM: open, query, rows (group, title, marked text, selected). */
const pal = page => page.evaluate(() => {
    const d = document.getElementById('ag2-palette');
    if (!d) return { exists: false, open: false };
    const rows = [];
    let g = '';
    for (const n of d.querySelectorAll('.ag2-pal-list > *')) {
        if (n.classList.contains('ag2-pal-head')) { g = n.textContent; continue; }
        if (!n.classList.contains('ag2-pal-row')) continue;
        rows.push({
            g, t: n.querySelector('.ag2-pal-title')?.textContent || '',
            m: [...n.querySelectorAll('.ag2-pal-m')].map(x => x.textContent).join('|'),
            sel: n.classList.contains('ag2-sel'),
        });
    }
    const a = document.activeElement;
    return {
        exists: true, open: d.open, modal: d.matches(':modal'), q: d.querySelector('.ag2-pal-input')?.value,
        active: a === d.querySelector('.ag2-pal-input') ? 'input' : (a?.id || a?.className || a?.tagName || '').toString().slice(0, 60),
        inDialog: d.contains(a), rows: rows.slice(0, 40), n: rows.length,
        selIdx: rows.findIndex(r => r.sel), activedesc: d.querySelector('.ag2-pal-input')?.getAttribute('aria-activedescendant'),
    };
});

const shell = page => page.evaluate(() => {
    const c = SillyTavern.getContext();
    const a = document.activeElement;
    return {
        name2: c.name2, chatId: c.getCurrentChatId(), mes: document.querySelectorAll('#chat .mes').length,
        setOpen: document.body.classList.contains('ag2-set-open'), setPage: document.body.dataset.ag2Set || null,
        insp: document.body.classList.contains('ag2-insp-open'), side: !document.body.classList.contains('ag2-side-collapsed'),
        menu: !!document.querySelector('.ag2-menu'),
        active: a?.id || (a?.className || a?.tagName || '').toString().slice(0, 50),
        ta: document.getElementById('send_textarea')?.value ?? null,
        hit: document.querySelector('.ag2-hit')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 50) || null,
        stPopup: !!document.querySelector('dialog.popup[open]'),
    };
});

const openByKey = async (T, page, key = 'Control+K') => { await page.keyboard.press(key); await T.sleep(400); };
const typeQ = async (T, page, q) => { await page.keyboard.type(q, { delay: 30 }); await T.sleep(700); };
/** Moves the selection to the first row of group g whose title passes test; returns its index. */
async function selectRow(T, page, g, test = () => true) {
    const s = await pal(page);
    const i = s.rows.findIndex(r => r.g === g && test(r.t));
    if (i < 0) return -1;
    const steps = i - s.selIdx;
    for (let k = 0; k < Math.abs(steps); k++) await page.keyboard.press(steps > 0 ? 'ArrowDown' : 'ArrowUp');
    await T.sleep(100);
    return i;
}
const close = async (T, page) => { await page.keyboard.press('Escape'); await T.sleep(300); };

// ---------------------------------------------------------------- dev
async function dev(T) {
    const { page } = await enter(T);
    await page.click('#ag2-sidebar .ag2-search');
    await T.sleep(600);
    const empty = await pal(page);
    await T.shot(page, `dev-empty-${T.cfg.w}`);
    await typeQ(T, page, 'Ser');
    const ser = await pal(page);
    await T.shot(page, `dev-ser-${T.cfg.w}`);
    return { empty, ser, kbd: await page.textContent('#ag2-sidebar .ag2-search kbd'), errors: T.errors(page) };
}

// ---------------------------------------------------------------- search: the four acceptance queries + execution
async function search(T) {
    const out = {};
    const { page } = await enter(T);
    const sera = (await T.recent(page)).filter(x => x.avatar === 'default_Seraphina.png');
    out.seraRecent = sera.map(x => x.file);

    // 1a “Ser” → 角色 Seraphina + 对话 rows; Enter on the first 对话 row opens that chat
    await openByKey(T, page);
    await typeQ(T, page, 'Ser');
    let s = await pal(page);
    out.ser = { groups: [...new Set(s.rows.map(r => r.g))], chars: s.rows.filter(r => r.g === '角色').map(r => r.t), chats: s.rows.filter(r => r.g === '对话').map(r => r.t), marks: s.rows.slice(0, 3).map(r => r.m) };
    await selectRow(T, page, '对话', t => t.startsWith('Seraphina'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => SillyTavern.getContext().name2 === 'Seraphina' && document.querySelectorAll('#chat .mes').length > 0, null, { timeout: 30000 }).catch(() => {});
    await T.sleep(1200);
    let sh = await shell(page);
    out.ser.chatRun = { name2: sh.name2, chatId: sh.chatId, expected: sera[0]?.file, ok: sh.name2 === 'Seraphina' && sh.chatId === sera[0]?.file, palOpen: (await pal(page)).open };

    // 1b back to Aldric, then “Ser” → 角色 row → selectCharacterById(Seraphina)
    await T.openChat(page, await T.longChat(page), 2);
    await openByKey(T, page);
    await typeQ(T, page, 'Ser');
    await selectRow(T, page, '角色', t => t === 'Seraphina');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => SillyTavern.getContext().name2 === 'Seraphina', null, { timeout: 30000 }).catch(() => {});
    await T.sleep(1200);
    sh = await shell(page);
    out.ser.charRun = { name2: sh.name2, chatId: sh.chatId, ok: sh.name2 === 'Seraphina' };

    // 2 “温度” → 设置 row → settings window on 生成参数 with the item flashed
    await openByKey(T, page);
    await typeQ(T, page, '温度');
    await T.sleep(800); // the settings group arrives after the index is built
    s = await pal(page);
    out.temp = { rows: s.rows.slice(0, 10).map(r => `${r.g}|${r.t}|${r.m}`) };
    await selectRow(T, page, '设置', t => t.includes('温度'));
    await page.keyboard.press('Enter');
    await T.sleep(1500);
    sh = await shell(page);
    out.temp.run = { setOpen: sh.setOpen, page: sh.setPage, hit: sh.hit, ok: sh.setOpen && sh.setPage === 'ai' && /温度/.test(sh.hit || '') };
    await T.shot(page, `search-temp-hit-${T.cfg.w}`);
    await close(T, page); // closes the settings window
    sh = await shell(page);
    out.temp.closed = !sh.setOpen;

    // 3 “/wo” → 命令 /world …; Enter puts “/world ” into the input box (nothing runs)
    await page.evaluate(() => { const t = document.getElementById('send_textarea'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
    await openByKey(T, page);
    await typeQ(T, page, '/wo');
    s = await pal(page);
    out.wo = { rows: s.rows.slice(0, 6).map(r => `${r.g}|${r.t}|${r.m}`) };
    await T.shot(page, `search-wo-${T.cfg.w}`);
    const wi = s.rows.findIndex(r => r.t === '/world');
    await selectRow(T, page, '命令', t => t === '/world');
    await page.keyboard.press('Enter');
    await T.sleep(500);
    sh = await shell(page);
    out.wo.run = { idx: wi, ta: sh.ta, active: sh.active, ok: sh.ta === '/world ' && sh.active === 'send_textarea' };
    await page.evaluate(() => { const t = document.getElementById('send_textarea'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); });
    await page.keyboard.press('Escape'); // closes ST's slash autocomplete if it popped
    await T.sleep(300);

    // 4 “新对话” → 操作 新对话 → ST's own confirm → new chat
    const before = (await shell(page)).chatId;
    await openByKey(T, page);
    await typeQ(T, page, '新对话');
    s = await pal(page);
    out.newChat = { rows: s.rows.slice(0, 5).map(r => `${r.g}|${r.t}|${r.m}`), first: s.rows[0] };
    await page.keyboard.press('Enter');
    await T.sleep(800);
    const popup = (await shell(page)).stPopup;
    if (popup) { await page.click('dialog.popup[open] .popup-button-ok'); }
    await page.waitForFunction(b => SillyTavern.getContext().getCurrentChatId() !== b, before, { timeout: 20000 }).catch(() => {});
    await T.sleep(1000);
    sh = await shell(page);
    out.newChat.run = { popup, before, after: sh.chatId, mes: sh.mes, ok: popup && sh.chatId !== before && sh.mes <= 2 };

    // 5 “世界” (design 04b) → 操作 打开世界书 + 世界书 Eldoria + 设置; run Eldoria → WI page, editor shows it
    await openByKey(T, page);
    await typeQ(T, page, '世界');
    await T.sleep(800);
    s = await pal(page);
    out.world = { rows: s.rows.slice(0, 12).map(r => `${r.g}|${r.t}|${r.m}`) };
    await T.shot(page, `search-world-${T.cfg.w}`);
    await selectRow(T, page, '世界书', t => t === 'Eldoria');
    await page.keyboard.press('Enter');
    await T.sleep(1800);
    sh = await shell(page);
    const wsel = await page.evaluate(() => $('#world_editor_select option:selected').text());
    out.world.run = { setPage: sh.setPage, editor: wsel, ok: sh.setPage === 'wi' && wsel === 'Eldoria' };
    await close(T, page);

    // 6 empty query: 最近对话 + 常用操作; a no-hit query shows the empty note
    await openByKey(T, page);
    s = await pal(page);
    out.empty = { groups: [...new Set(s.rows.map(r => r.g))], n: s.n };
    await typeQ(T, page, 'zzqx无此项');
    out.none = await page.evaluate(() => document.querySelector('#ag2-palette .ag2-pal-empty')?.textContent || null);
    await close(T, page);
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- keys: navigation, shortcuts, md hotkeys, IME, ST keys untouched
async function keys(T) {
    const out = {};
    const { page } = await enter(T, { prep: { powerUser: { enable_md_hotkeys: true } } });
    // arrows wrap; aria-activedescendant follows; typed keys do not reach ST (swipe arrows)
    const swipeBefore = await page.evaluate(() => { const c = SillyTavern.getContext(); return c.chat[c.chat.length - 1]?.swipe_id ?? null; });
    const calls0 = page.__gen.calls;
    await openByKey(T, page);
    await typeQ(T, page, 'a');
    let s = await pal(page);
    const n = s.n;
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    const s2 = await pal(page);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    const s3 = await pal(page);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
    await T.sleep(400);
    out.nav = { n, sel0: s.selIdx, afterDown2: s2.selIdx, afterUp3: s3.selIdx, wrapOk: s3.selIdx === n - 1, desc: s3.activedesc };
    out.stUntouched = {
        swipe: swipeBefore === await page.evaluate(() => { const c = SillyTavern.getContext(); return c.chat[c.chat.length - 1]?.swipe_id ?? null; }),
        gen: page.__gen.calls === calls0,
    };
    // Ctrl+K toggles closed
    await openByKey(T, page);
    out.toggleClose = !(await pal(page)).open;

    // md hotkeys on: Ctrl+K in #send_textarea → ST inline code; palette stays closed
    await page.click('#send_textarea');
    await page.keyboard.type('abc');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+K');
    await T.sleep(400);
    out.mdCtrlK = { ta: (await shell(page)).ta, pal: (await pal(page)).open };
    // Ctrl+Shift+K opens it there
    await page.keyboard.press('Control+Shift+K');
    await T.sleep(400);
    s = await pal(page);
    out.ctrlShiftK = { open: s.open, active: s.active };
    await close(T, page);
    out.afterClose = { active: (await shell(page)).active };
    await page.evaluate(() => { const t = document.getElementById('send_textarea'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });

    // IME: keydowns while composing never act (Ctrl+K, Ctrl+., Ctrl+\)
    out.ime = await page.evaluate(async () => {
        const t = document.getElementById('send_textarea');
        t.focus();
        const fire = o => t.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
        fire({ key: 'k', code: 'KeyK', ctrlKey: true, isComposing: true });
        fire({ key: 'Process', code: 'KeyK', ctrlKey: true, keyCode: 229 });
        fire({ key: '.', code: 'Period', ctrlKey: true, isComposing: true });
        fire({ key: '\\', code: 'Backslash', ctrlKey: true, isComposing: true });
        await new Promise(r => setTimeout(r, 500));
        return { pal: !!document.getElementById('ag2-palette')?.open, insp: document.body.classList.contains('ag2-insp-open'), collapsed: document.body.classList.contains('ag2-side-collapsed') };
    });
    // IME inside the palette: Enter while composing does not run the selection
    await openByKey(T, page);
    await typeQ(T, page, 'Ser');
    out.imeEnter = await page.evaluate(async () => {
        const i = document.querySelector('#ag2-palette .ag2-pal-input');
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }));
        await new Promise(r => setTimeout(r, 300));
        return { stillOpen: document.getElementById('ag2-palette').open };
    });
    await close(T, page);

    // Ctrl+\ sidebar: focus stays in the input box
    await page.click('#send_textarea');
    await page.keyboard.press('Control+Backslash');
    await T.sleep(500);
    let sh = await shell(page);
    out.sideOff = { side: sh.side, active: sh.active, stored: await page.evaluate(() => localStorage.getItem('ag2.sidebar')) };
    await page.keyboard.press('Control+Backslash');
    await T.sleep(500);
    sh = await shell(page);
    out.sideOn = { side: sh.side, active: sh.active };

    // Ctrl+. inspector on / off
    await page.keyboard.press('Control+Period');
    await T.sleep(900);
    sh = await shell(page);
    out.inspOn = { insp: sh.insp, active: sh.active };
    await page.keyboard.press('Control+Period');
    await T.sleep(900);
    out.inspOff = { insp: (await shell(page)).insp };

    // ST shortcuts still work: Ctrl+Enter regenerates (mock), ←/→ swipe with focus outside inputs
    const c1 = page.__gen.calls;
    await page.click('#send_textarea');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('#mes_stop:not([style*="none"])') || true, null, { timeout: 5000 }).catch(() => {});
    await T.sleep(2500);
    out.stCtrlEnter = { calls: page.__gen.calls - c1 };
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- focus: trap + restore
async function focus(T) {
    const out = {};
    const { page } = await enter(T);
    // from the input box
    await page.click('#send_textarea');
    await openByKey(T, page);
    let s = await pal(page);
    out.open = { open: s.open, modal: s.modal, active: s.active };
    const trail = [];
    for (let k = 0; k < 4; k++) { await page.keyboard.press(k % 2 ? 'Shift+Tab' : 'Tab'); trail.push((await pal(page)).inDialog); }
    out.tabTrapped = trail;
    // background inert: a click on the sidebar row behind does nothing but close? (backdrop click closes)
    out.inert = await page.evaluate(() => {
        const el = document.elementFromPoint(150, 300);
        return el ? (el.closest('#ag2-palette') ? 'palette' : el.tagName + '#' + (el.id || '')) : null;
    });
    await close(T, page);
    out.restoreInput = (await shell(page)).active;
    // from the sidebar search button (mouse) → Esc → focus back on the button
    await page.click('#ag2-sidebar .ag2-search');
    await T.sleep(500);
    s = await pal(page);
    out.clickOpen = { open: s.open, active: s.active };
    await close(T, page);
    out.restoreSearch = await page.evaluate(() => document.activeElement?.classList.contains('ag2-search'));
    // backdrop click closes
    await page.click('#ag2-sidebar .ag2-search');
    await T.sleep(500);
    await page.mouse.click(1400, 860);
    await T.sleep(400);
    out.backdropClose = !(await pal(page)).open;
    // mouse: hover moves the selection, click runs (open 外观)
    await openByKey(T, page);
    await typeQ(T, page, '外观');
    await page.locator('#ag2-palette .ag2-pal-row', { hasText: '打开外观' }).first().click();
    await T.sleep(1200);
    const sh = await shell(page);
    out.clickRun = { setOpen: sh.setOpen, page: sh.setPage };
    await close(T, page);
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- esc: layer order (palette → menu → settings → inspector → ST)
async function esc(T) {
    const out = {};
    const { page } = await enter(T);
    // inspector open + settings window open + palette open
    await page.keyboard.press('Control+Period');
    await T.sleep(900);
    await page.click('#ag2-sidebar [data-act="settings"]');
    await T.sleep(1200);
    await openByKey(T, page);
    const seq = [];
    const snap = async tag => { const s = await shell(page); const p = await pal(page); seq.push({ tag, pal: p.open, set: s.setOpen, insp: s.insp, menu: s.menu }); };
    await snap('start');
    for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape'); await T.sleep(700); await snap('esc' + (k + 1)); }
    out.seq = seq;
    // menu above the inspector: Esc closes the menu only
    await page.keyboard.press('Control+Period');
    await T.sleep(900);
    await page.click('#ag2-title .ag2-title-btn');
    await T.sleep(400);
    const m0 = await shell(page);
    await page.keyboard.press('Escape');
    await T.sleep(400);
    const m1 = await shell(page);
    out.menu = { before: { menu: m0.menu, insp: m0.insp }, after: { menu: m1.menu, insp: m1.insp } };
    // field inside the inspector: first Esc blurs, second closes
    const fieldOk = await page.evaluate(() => {
        const f = [...document.querySelectorAll('#right-nav-panel input[type="text"], #right-nav-panel textarea')].find(x => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
        if (!f) return null; f.focus(); return document.activeElement === f ? (f.id || f.name || 'field') : null;
    });
    await page.keyboard.press('Escape'); await T.sleep(400);
    const f1 = await shell(page);
    await page.keyboard.press('Escape'); await T.sleep(800);
    const f2 = await shell(page);
    out.field = { field: fieldOk, afterFirst: { insp: f1.insp, active: f1.active }, afterSecond: { insp: f2.insp } };
    // nothing of ours open: Esc falls through to ST (AN panel opened by ST closes via ST's Esc)
    await page.evaluate(() => $('#option_toggle_AN').trigger('click'));
    await T.sleep(800);
    const an0 = await page.evaluate(() => $('#floatingPrompt').is(':visible'));
    await page.keyboard.press('Escape'); await T.sleep(800);
    const an1 = await page.evaluate(() => $('#floatingPrompt').is(':visible'));
    out.stEsc = { anOpen: an0, anAfterEsc: an1 };
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- mac: ⌘ only, kbd label
async function mac(T) {
    const init = () => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
        Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ platform: 'macOS', brands: [], mobile: false }) });
    };
    const { page } = await enter(T, { init, prep: { powerUser: { enable_md_hotkeys: true } } });
    const out = { kbd: await page.textContent('#ag2-sidebar .ag2-search kbd'), insTitle: await page.getAttribute('#ag2-tools [data-act="insp"]', 'title') };
    await page.click('#send_textarea');
    await page.keyboard.type('xyz');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+K'); // ST's md hotkey (Ctrl), not ours on macOS
    await T.sleep(400);
    out.ctrlK = { pal: (await pal(page)).open, ta: (await shell(page)).ta };
    await page.keyboard.press('Meta+K');
    await T.sleep(400);
    out.metaK = (await pal(page)).open;
    await close(T, page);
    await page.keyboard.press('Meta+Period');
    await T.sleep(900);
    out.metaPeriod = (await shell(page)).insp;
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- lazy: palette.js / settings.js not requested at boot
async function lazy(T) {
    const page = await T.newPage();
    const req = [];
    page.on('request', r => { const u = r.url(); if (/shell\/(palette|settings|search|keys)\.js/.test(u)) req.push(u.replace(/^.*shell\//, '').replace(/\?.*/, '')); });
    await T.prepare(page, MEM ? { theme: 'ag2' } : {});
    await T.boot(page, { ag2: true, settle: 2500 });
    const atBoot = [...req];
    await page.keyboard.press('Control+K');
    await T.sleep(800);
    const afterOpen = [...req];
    await page.keyboard.type('温度', { delay: 30 });
    await T.sleep(1200);
    return { atBoot, afterOpen, afterQuery: [...req], errors: T.errors(page) };
}

// ---------------------------------------------------------------- shots + scan with the palette open
async function shots(T) {
    const out = {};
    const { page } = await enter(T);
    const w = T.cfg.w;
    await openByKey(T, page);
    await T.sleep(400);
    await T.shot(page, `pal-empty-${w}`);
    const sc = s => ({ ovf: s.ovf, dbl: s.dbl, unhid: s.unhid, nest: s.nest, btn: s.btn, doc: s.doc?.ok, scrollY: s.scrollY, blurVis: s.blurVis, blurBy: s.blurBy, panels: s.panels, ...(s.ovf + s.dbl + s.unhid + s.nest + s.btn ? { detail: s.detail } : {}) });
    out.empty = sc(await T.scan(page, ['#ag2-palette', '#ag2-pal-list']));
    for (const [q, name] of [['世界', 'world'], ['Ser', 'ser'], ['温度', 'temp'], ['/wo', 'cmd'], ['新对话', 'new']]) {
        await page.fill('#ag2-palette .ag2-pal-input', '');
        await typeQ(T, page, q);
        await T.sleep(600);
        await T.shot(page, `pal-${name}-${w}`);
        out[name] = sc(await T.scan(page, ['#ag2-palette', '#ag2-pal-list']));
    }
    await close(T, page);
    out.sideKbd = await page.textContent('#ag2-sidebar .ag2-search kbd');
    out.errors = T.errors(page);
    return out;
}

export default async function (T) {
    const parts = { dev, search, keys, focus, esc, mac, lazy, shots };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    await T.save('p4-' + part, r);
    return r;
}
