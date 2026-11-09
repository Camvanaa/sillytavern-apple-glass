// tools/ag2/p2a.mjs — P2a acceptance: settings window (frame, 9 pages, Esc layers, entry
// points, drawer adoption) and the 外观 page (each control works + survives a reload).
//   node tools/ag2/run.mjs tools/ag2/p2a.mjs --phase P2a --part shots|func|esc|look|persist [--w 1280] [--mem]
//   --mem: inject the worktree CSS in memory (debug); acceptance runs use the published theme.
// Writes stay stubbed (run.mjs). “Persist” replays the captured /api/settings/save body as the
// next page's /api/settings/get (in memory), so nothing is written to the test copy.

const PAGES = ['api', 'ai', 'fmt', 'wi', 'persona', 'bg', 'look', 'user', 'ext', 'about'];
const PANEL = { api: '#rm_api_block', ai: '#left-nav-panel', fmt: '#AdvancedFormatting', wi: '#WorldInfo', persona: '#PersonaManagement', bg: '#Backgrounds', user: '#user-settings-block', ext: '#rm_extensions_block' };
const IDS = Object.values(PANEL);

const part = (() => { const i = process.argv.indexOf('--part'); return i > 0 ? process.argv[i + 1] : 'func'; })();
const MEM = process.argv.includes('--mem');

async function enter(T, opt = {}) {
    const page = await T.newPage();
    await T.prepare(page, { ...(MEM ? { theme: 'ag2' } : {}), ...opt });
    const b = await T.boot(page, { ag2: true, settle: 2000 });
    await T.openChat(page, await T.longChat(page), 20);
    return { page, boot: b };
}

const state = page => page.evaluate(ids => {
    const r = el => { if (!el) return null; const q = el.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const win = document.getElementById('ag2-settings');
    const open = ids.filter(s => document.querySelector(s)?.classList.contains('openDrawer'));
    return {
        open: document.body.classList.contains('ag2-set-open'),
        winVisible: !!win && !win.hidden && getComputedStyle(win).display !== 'none',
        page: document.body.dataset.ag2Set || null,
        nav: document.querySelector('#ag2-settings .ag2-set-item.ag2-on')?.dataset.page || null,
        title: document.getElementById('ag2-set-title')?.textContent || '',
        panels: open,
        win: r(win),
        panel: open.length ? r(document.querySelector(open[0])) : null,
        dim: !!document.getElementById('ag2-set-dim') && !document.getElementById('ag2-set-dim').hidden,
        inspVis: getComputedStyle(document.getElementById('right-nav-panel')).visibility,
    };
}, IDS);

const waitIdle = async (T, ms = 700) => T.sleep(ms);
const clickNav = (page, p) => page.click(`#ag2-settings .ag2-set-item[data-page="${p}"]`);
const inside = (a, b) => a && b && a[0] >= b[0] - 1 && a[1] >= b[1] - 1 && a[0] + a[2] <= b[0] + b[2] + 1 && a[1] + a[3] <= b[1] + b[3] + 1;

// ---------------------------------------------------------------- shots: every page, scan
async function shots(T) {
    const { page } = await enter(T);
    const w = T.cfg.w;
    const out = { w, pages: {} };
    await page.click('#ag2-sidebar [data-act="settings"]');
    await page.waitForSelector('#ag2-settings:not([hidden])', { timeout: 15000 });
    await waitIdle(T);
    for (const p of PAGES) {
        await clickNav(page, p);
        await waitIdle(T, 900);
        if (p === 'wi') {
            await page.evaluate(() => { const s = document.querySelector('#world_editor_select'); if (s && s.options.length > 1 && !s.value) { s.selectedIndex = 1; $(s).trigger('change'); } });
            await T.sleep(1200);
        }
        const st = await state(page);
        const roots = PANEL[p] ? [PANEL[p]] : ['#ag2-settings .ag2-set-body'];
        const s = await T.scan(page, roots);
        await T.shot(page, `set-${p}-${w}`);
        out.pages[p] = {
            nav: st.nav === p, page: st.page === p, title: st.title,
            panels: st.panels, onlyCurrent: PANEL[p] ? (st.panels.length === 1 && st.panels[0] === PANEL[p]) : st.panels.length === 0,
            panelInWin: PANEL[p] ? inside(st.panel, st.win) : null, panel: st.panel, win: st.win,
            ovf: s.ovf, dbl: s.dbl, unhid: s.unhid, nest: s.nest, btn: s.btn, doc: s.doc.ok, scrollY: s.scrollY, panelOk: Object.values(s.panels)[0]?.ok ?? Object.values(s.panels)[0], blurVis: s.blurVis,
            ...(s.ovf + s.dbl + s.unhid + s.nest + s.btn ? { detail: s.detail } : {}),
        };
    }
    await page.click('#ag2-settings .ag2-set-close');
    await waitIdle(T);
    out.afterClose = await state(page);
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- func: entries, switching, clicks, adoption
async function func(T) {
    const { page } = await enter(T);
    const out = {};
    const closeWin = async () => { await page.click('#ag2-settings .ag2-set-close'); await waitIdle(T); };
    // entry points
    const entries = [
        ['gear', '#ag2-sidebar [data-act="settings"]', null],
        ['conn', '#ag2-sidebar [data-act="conn"]', 'api'],
        ['persona', '#ag2-sidebar [data-act="persona"]', 'persona'],
        ['wiTool', '#ag2-tools [data-act="wi"]', 'wi'],
    ];
    out.entries = {};
    for (const [name, sel, want] of entries) {
        try {
            await page.click(sel);
            await waitIdle(T, 1000);
            const st = await state(page);
            out.entries[name] = { open: st.open, page: st.page, panels: st.panels, ok: st.open && (!want || (st.page === want && st.panels[0] === PANEL[want])) };
            await closeWin();
        } catch (e) { out.entries[name] = 'ERR ' + String(e.message).slice(0, 120); }
    }
    // model capsule → 连接设置…
    try {
        await page.click('#ag2-model');
        await page.waitForSelector('#ag2-model-menu', { timeout: 5000 });
        await page.click('#ag2-model-menu [data-item="conn"]');
        await waitIdle(T, 1000);
        const st = await state(page);
        out.entries.modelConn = { page: st.page, panels: st.panels, ok: st.page === 'api' && st.panels[0] === '#rm_api_block' };
        await closeWin();
    } catch (e) { out.entries.modelConn = 'ERR ' + String(e.message).slice(0, 120); }

    // switch through all pages in quick succession (queue), then each one settles
    await page.click('#ag2-sidebar [data-act="settings"]');
    await waitIdle(T);
    for (const p of ['api', 'ai', 'wi', 'user']) await clickNav(page, p); // rapid
    await waitIdle(T, 2500);
    let st = await state(page);
    out.rapid = { page: st.page, panels: st.panels, ok: st.page === 'user' && st.panels.length === 1 && st.panels[0] === '#user-settings-block' };
    out.switch = {};
    for (const p of PAGES) {
        await clickNav(page, p);
        await waitIdle(T, 900);
        st = await state(page);
        out.switch[p] = st.page === p && st.nav === p && (PANEL[p] ? st.panels.length === 1 && st.panels[0] === PANEL[p] : st.panels.length === 0) ? 'ok' : st;
    }
    out.inspectorHidden = st.inspVis === 'hidden';

    // clicks inside panels must not close them (ST's html mousedown autoclose)
    out.clickInside = {};
    const tryClick = async (p, sel) => {
        await clickNav(page, p); await waitIdle(T, 900);
        // first VISIBLE match (ST keeps controls of other APIs hidden in the same panel)
        const found = await page.evaluate(s => {
            document.querySelectorAll('[data-ag2-t]').forEach(x => x.removeAttribute('data-ag2-t'));
            const e = [...document.querySelectorAll(s)].find(x => x.offsetParent && x.getClientRects().length);
            if (!e) return false; e.scrollIntoView({ block: 'center' }); e.setAttribute('data-ag2-t', '1'); return true;
        }, sel);
        if (!found) return 'missing ' + sel;
        try { await page.click('[data-ag2-t]', { timeout: 4000 }); } catch (e) { return 'click failed ' + String(e.message).slice(0, 80); }
        await waitIdle(T, 600);
        const s2 = await state(page);
        await page.evaluate(() => document.activeElement?.blur?.());
        await waitIdle(T, 300);
        return s2.open && s2.panels[0] === PANEL[p] ? 'ok' : s2;
    };
    out.clickInside.userCheckbox = await tryClick('user', '#user-settings-block label.checkbox_label');
    out.clickInside.aiRange = await tryClick('ai', '#left-nav-panel input[type="range"]');
    out.clickInside.apiText = await tryClick('api', '#rm_api_block .text_pole');
    out.clickInside.fmtHeader = await tryClick('fmt', '#AdvancedFormatting h3, #AdvancedFormatting h4');
    out.clickInside.extDrawer = await tryClick('ext', '#rm_extensions_block .inline-drawer-toggle');
    // clicking the window chrome (nav blank area / head) keeps the drawer
    await clickNav(page, 'ai'); await waitIdle(T, 900);
    await page.click('#ag2-settings .ag2-set-head h1');
    await waitIdle(T, 500);
    st = await state(page);
    out.clickHead = st.open && st.panels[0] === '#left-nav-panel' ? 'ok' : st;
    // click on the dim closes the window and the drawer
    await page.mouse.click(10, 10);
    await waitIdle(T);
    st = await state(page);
    out.dimClose = !st.open && !st.panels.length && !st.winVisible ? 'ok' : st;

    // adoption: ST opening a settings drawer by itself (hidden top-bar toggle) → window on that page
    await page.evaluate(() => document.querySelector('#WI-SP-button > .drawer-toggle').click());
    await waitIdle(T, 1200);
    st = await state(page);
    out.adopt = st.open && st.page === 'wi' && st.panels[0] === '#WorldInfo' ? 'ok' : st;
    // ST closing the current drawer by itself → window closes too
    await page.evaluate(() => document.querySelector('#WI-SP-button > .drawer-toggle').click());
    await waitIdle(T, 1200);
    st = await state(page);
    out.stClose = !st.open && !st.panels.length ? 'ok' : st;

    // reopen = last page
    await page.click('#ag2-sidebar [data-act="settings"]');
    await waitIdle(T, 900);
    st = await state(page);
    out.reopenLast = st.page;
    await closeWin();
    st = await state(page);
    out.final = { open: st.open, panels: st.panels, bodyAttr: st.page };
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- esc layers
async function esc(T) {
    const { page } = await enter(T);
    const out = {};
    const open = async p => { await page.click('#ag2-sidebar [data-act="settings"]'); await waitIdle(T); await clickNav(page, p); await waitIdle(T, 900); };
    // 1. plain: Esc closes window + drawer
    await open('api');
    await page.keyboard.press('Escape'); await waitIdle(T);
    let st = await state(page);
    out.plain = !st.open && !st.panels.length ? 'ok' : st;
    // 2. field focused inside the drawer: 1st Esc leaves the field, 2nd closes
    await open('ai');
    const focused = await page.evaluate(() => { const t = [...document.querySelectorAll('#left-nav-panel input[type="number"], #left-nav-panel textarea, #left-nav-panel input.text_pole')].find(x => x.offsetParent && x.getClientRects().length); if (!t) return false; t.scrollIntoView({ block: 'center' }); t.focus(); return document.activeElement === t; });
    await page.keyboard.press('Escape'); await waitIdle(T, 400);
    const s1 = await state(page);
    await page.keyboard.press('Escape'); await waitIdle(T);
    const s2 = await state(page);
    out.field = { focused, first: s1.open && s1.panels.length === 1, second: !s2.open && !s2.panels.length };
    // 3. search text: 1st Esc clears, 2nd closes
    await open('look');
    await page.click('#ag2-settings .ag2-set-search input');
    await page.keyboard.type('世界');
    const filtered = await page.evaluate(() => [...document.querySelectorAll('#ag2-settings .ag2-set-item')].filter(b => !b.hidden).map(b => b.dataset.page));
    await page.keyboard.press('Escape'); await waitIdle(T, 300);
    const q = await page.evaluate(() => document.querySelector('#ag2-settings .ag2-set-search input').value);
    const s3 = await state(page);
    await page.keyboard.press('Escape'); await waitIdle(T);
    const s4 = await state(page);
    out.search = { filtered, cleared: q === '' && s3.open, second: !s4.open };
    // 4. ST popup (dialog) over the window: Esc closes the popup only, next Esc the window
    await open('ext');
    const popped = await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        const P = c.Popup; if (!P) return 'no Popup';
        const p = new P('AG2 Esc 测试', c.POPUP_TYPE?.TEXT ?? 1);
        p.show();
        await new Promise(r => setTimeout(r, 400));
        return !!document.querySelector('dialog[open]');
    });
    await page.keyboard.press('Escape'); await waitIdle(T, 600);
    const s5 = await state(page);
    const dlg = await page.evaluate(() => !!document.querySelector('dialog[open]'));
    await page.keyboard.press('Escape'); await waitIdle(T);
    const s6 = await state(page);
    out.popup = { popped, popupClosed: !dlg, windowKept: s5.open && s5.panels[0] === '#rm_extensions_block', second: !s6.open && !s6.panels.length };
    // 5. Esc with the window closed still reaches ST (no swallowed keys): open ST's chat menu? just verify no window
    out.final = await state(page);
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- look: each control
async function look(T) {
    const saves = [];
    const { page } = await enter(T);
    await page.route('**/api/settings/save', r => { saves.push(r.request().postData() || ''); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    const out = {};
    await page.click('#ag2-sidebar [data-act="settings"]');
    await waitIdle(T);
    await clickNav(page, 'look');
    await waitIdle(T, 700);
    await T.shot(page, `set-look-before-${T.cfg.w}`);
    // chat styles
    out.styles = {};
    for (const i of [1, 2, 4, 5, 6, 0, 3]) {
        await page.click(`#ag2-settings .ag2-sty[data-style="${i}"]`);
        await waitIdle(T, 500);
        out.styles[i] = await page.evaluate(i => ({
            select: Number($('#chat_display').val()), pu: SillyTavern.getContext().powerUserSettings.chat_display,
            checked: document.querySelector(`#ag2-settings .ag2-sty[data-style="${i}"]`).getAttribute('aria-checked'),
            bodyCls: [...document.body.classList].filter(c => /style|bubble|document|flat/i.test(c)).join(' '),
        }), i);
        out.styles[i].ok = out.styles[i].select === i && out.styles[i].pu === i && out.styles[i].checked === 'true';
    }
    // accent
    out.accent = {};
    for (const a of ['purple', 'teal', 'graphite', 'blue', 'pink']) {
        await page.click(`#ag2-settings .ag2-sw[data-accent="${a}"]`);
        await waitIdle(T, 200);
        out.accent[a] = await page.evaluate(() => ({
            attr: document.body.dataset.ag2Accent,
            v: getComputedStyle(document.body).getPropertyValue('--ag2-accent').trim(),
            send: getComputedStyle(document.querySelector('.ag2-sty[aria-checked="true"] .ag2-sty-th')).boxShadow.slice(0, 40),
        }));
    }
    // reading size / width (keyboard on the slider: real input events)
    const slide = async (sel, key, n) => { await page.focus(sel); for (let i = 0; i < n; i++) await page.keyboard.press(key); await waitIdle(T, 300); };
    await slide('#ag2-read-size', 'ArrowRight', 2); // 16 → 18
    await slide('#ag2-read-width', 'ArrowRight', 3); // 720 → 780
    out.reading = await page.evaluate(() => {
        const t = document.querySelector('#chat .mes:not([is_user="true"]) .mes_text');
        const chat = document.getElementById('chat');
        const col = document.querySelector('#chat .mes:not([is_user="true"])');
        return {
            sizeOut: document.querySelector('#ag2-read-size + output').textContent, widthOut: document.querySelector('#ag2-read-width + output').textContent,
            fontSize: getComputedStyle(t).fontSize, varWidth: getComputedStyle(document.body).getPropertyValue('--ag2-read-width').trim(),
            mesWidth: Math.round(col.getBoundingClientRect().width), chatPad: getComputedStyle(chat).paddingLeft,
            stFontScale: SillyTavern.getContext().powerUserSettings.font_scale, stChatWidth: SillyTavern.getContext().powerUserSettings.chat_width,
        };
    });
    // meta
    out.meta = {};
    for (const v of ['hide', 'hover', 'always']) {
        await page.selectOption('#ag2-meta', v);
        await waitIdle(T, 300);
        out.meta[v] = await page.evaluate(() => {
            const m = [...document.querySelectorAll('#chat .mes:not(.last_mes):not([is_user="true"])')].find(x => x.querySelector('.mes_timer, .tokenCounterDisplay'));
            const el = m?.querySelector('.tokenCounterDisplay') || m?.querySelector('.mes_timer');
            const cs = el ? getComputedStyle(el) : null;
            const after = m ? getComputedStyle(m, '::after') : null;
            return { attr: document.body.dataset.ag2Meta, display: cs?.display, opacity: cs?.opacity, model: after?.content?.slice(0, 30), modelOpacity: after?.opacity, sub: document.querySelector('.ag2-meta-sub')?.textContent };
        });
    }
    // reduced motion + glass (proxies for #reduced_motion / #fast_ui_mode)
    const sw = k => page.click(`#ag2-settings .ag2-switch[data-k="${k}"]`);
    const flags = () => page.evaluate(() => ({ reduced: document.body.classList.contains('reduced-motion'), noBlur: document.body.classList.contains('no-blur'), pu: { rm: SillyTavern.getContext().powerUserSettings.reduced_motion, fast: SillyTavern.getContext().powerUserSettings.fast_ui_mode }, sw: { reduced: document.querySelector('.ag2-switch[data-k="reduced"]').getAttribute('aria-checked'), glass: document.querySelector('.ag2-switch[data-k="glass"]').getAttribute('aria-checked') }, winBlur: getComputedStyle(document.getElementById('ag2-settings')).backdropFilter }));
    out.flags0 = await flags();
    await sw('reduced'); await waitIdle(T, 300);
    out.flagsReduced = await flags();
    await sw('glass'); await waitIdle(T, 300);
    out.flagsNoGlass = await flags();
    await T.shot(page, `set-look-after-${T.cfg.w}`);
    // background button → 背景 page
    await page.click('#ag2-settings [data-act="bg"]');
    await waitIdle(T, 900);
    out.bgButton = (await state(page)).page;
    await page.keyboard.press('Escape');
    await waitIdle(T, 1500); // saveSettingsDebounced
    // the save payload carries all of it
    const last = saves.length ? JSON.parse(saves[saves.length - 1]) : null;
    out.saved = last ? { count: saves.length, ag2: last.extension_settings?.appleGlass2 && (({ accent, readSize, readWidth, meta }) => ({ accent, readSize, readWidth, meta }))(last.extension_settings.appleGlass2), chat_display: last.power_user?.chat_display, reduced_motion: last.power_user?.reduced_motion, fast_ui_mode: last.power_user?.fast_ui_mode } : null;
    out.errors = T.errors(page);

    // reload with the captured settings (in memory)
    if (last) {
        const want = { ...last.extension_settings.appleGlass2 };
        const { page: p2 } = await enter(T, { mutate: (s) => { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, last); } });
        out.afterReload = await p2.evaluate(() => {
            const t = document.querySelector('#chat .mes:not([is_user="true"]) .mes_text');
            return {
                accent: document.body.dataset.ag2Accent, accentVar: getComputedStyle(document.body).getPropertyValue('--ag2-accent').trim(),
                meta: document.body.dataset.ag2Meta, fontSize: getComputedStyle(t).fontSize,
                width: getComputedStyle(document.body).getPropertyValue('--ag2-read-width').trim(),
                chat_display: SillyTavern.getContext().powerUserSettings.chat_display,
                reduced: document.body.classList.contains('reduced-motion'), noBlur: document.body.classList.contains('no-blur'),
            };
        });
        out.afterReload.want = want;
        await p2.click('#ag2-sidebar [data-act="settings"]');
        await waitIdle(T, 900);
        out.afterReload.reopenPage = (await state(p2)).page;
        out.afterReload.controls = await p2.evaluate(() => ({
            sty: document.querySelector('#ag2-settings .ag2-sty[aria-checked="true"]')?.dataset.style,
            sw: document.querySelector('#ag2-settings .ag2-sw[aria-checked="true"]')?.dataset.accent,
            size: document.getElementById('ag2-read-size')?.value, width: document.getElementById('ag2-read-width')?.value,
            meta: document.getElementById('ag2-meta')?.value,
            reduced: document.querySelector('.ag2-switch[data-k="reduced"]')?.getAttribute('aria-checked'),
            glass: document.querySelector('.ag2-switch[data-k="glass"]')?.getAttribute('aria-checked'),
        }));
        out.errors2 = T.errors(p2);
    }
    return out;
}

// ---------------------------------------------------------------- themes: switch away from inside 通用 and back
async function themes(T) {
    const { page } = await enter(T);
    const out = {};
    await page.click('#ag2-sidebar [data-act="settings"]');
    await waitIdle(T);
    await clickNav(page, 'look');
    await waitIdle(T, 600);
    await page.click('#ag2-settings .ag2-sw[data-accent="purple"]');
    await page.selectOption('#ag2-meta', 'hide');
    await clickNav(page, 'user');
    await waitIdle(T, 900);
    await page.evaluate(() => { $('#themes').val('Apple Glass Dark').trigger('change'); });
    await T.sleep(2500);
    out.dark = await page.evaluate(() => {
        const u = document.getElementById('user-settings-block');
        const q = u.getBoundingClientRect();
        return {
            bodyAg2: [...document.body.classList].filter(c => c === 'ag2' || c.startsWith('ag2-')),
            dataAttrs: Object.keys(document.body.dataset).filter(k => k.startsWith('ag2')),
            inlineVars: [...document.body.style].filter(p => p.startsWith('--ag2')),
            nodes: [...document.querySelectorAll('[id^="ag2-"], [class*="ag2-"]')].map(e => e.id || e.className).slice(0, 5),
            userDrawerOpen: u.classList.contains('openDrawer'), userDrawerRect: [q.x, q.y, q.width, q.height].map(Math.round),
            userDrawerPos: getComputedStyle(u).position,
        };
    });
    out.dark.scan = await T.scan(page, ['#user-settings-block']);
    await T.shot(page, 'theme-dark-from-window-1440');
    await page.evaluate(() => { $('#themes').val('Apple Glass 2').trigger('change'); });
    await T.sleep(3500);
    const st = await state(page);
    out.ag2Again = {
        windowAdopted: st.open && st.page === 'user' && st.panels[0] === '#user-settings-block', panelInWin: inside(st.panel, st.win),
        ...(await page.evaluate(() => ({ accent: document.body.dataset.ag2Accent, meta: document.body.dataset.ag2Meta }))),
    };
    await T.shot(page, 'theme-ag2-adopt-1440');
    await page.keyboard.press('Escape');
    await waitIdle(T);
    out.ag2Again.closed = !(await state(page)).open;
    out.errors = T.errors(page);
    return out;
}

export default async function (T) {
    const parts = { shots, func, esc, look, themes };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    await T.save(part, r);
    return r;
}
