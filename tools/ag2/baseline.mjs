// tools/ag2/baseline.mjs — RUNBOOK 4.6 regression baseline (P0: under Apple Glass Dark).
//
//   node tools/ag2/run.mjs tools/ag2/baseline.mjs --part desk     # 1440: chat + every settings drawer, scan, send/gen/stop/swipe
//   node tools/ag2/run.mjs tools/ag2/baseline.mjs --part styles   # chat styles 0–6: scan + send
//   node tools/ag2/run.mjs tools/ag2/baseline.mjs --part reduced  # ST switch and OS setting
//   node tools/ag2/run.mjs tools/ag2/baseline.mjs --part phone    # 390×844 DPR3 iPhone UA: chat + drawers
//   node tools/ag2/run.mjs tools/ag2/baseline.mjs --part cold     # cold-start ready time, n=3 (median)
//   node tools/ag2/run.mjs tools/ag2/baseline.mjs --part compat   # LittleWhiteBox / TavernHelper / Moonlit / QR / ag2 absence
// Every part saves to the sink (results/ag2-<phase>.jsonl) and prints a compact summary.
// Later phases reuse the same parts with --phase P1a etc.; pass --ag2 to wait for body.ag2.

export const DRAWERS = {
    ai: ['#ai-config-button > .drawer-toggle', '#left-nav-panel'],
    api: ['#sys-settings-button > .drawer-toggle', '#rm_api_block'],
    fmt: ['#advanced-formatting-button > .drawer-toggle', '#AdvancedFormatting'],
    wi: ['#WI-SP-button > .drawer-toggle', '#WorldInfo'],
    user: ['#user-settings-button > .drawer-toggle', '#user-settings-block'],
    bg: ['#backgrounds-button > .drawer-toggle', '#Backgrounds'],
    ext: ['#extensions-settings-button > .drawer-toggle', '#rm_extensions_block'],
    persona: ['#persona-management-button > .drawer-toggle', '#PersonaManagement'],
    char: ['#rightNavHolder > .drawer-toggle', '#right-nav-panel'],
};

const PARTS = ['desk', 'styles', 'reduced', 'phone', 'cold', 'compat'];

async function enter(T, over = {}, opt = {}) {
    const page = await T.newPage(over);
    await T.prepare(page, opt);
    const b = await T.boot(page, { ag2: !!T.cfg.ag2, query: opt.query });
    const spec = await T.longChat(page);
    await T.openChat(page, spec, 20);
    return { page, boot: b, spec };
}

const isOpen = (page, root) => page.evaluate(r => document.querySelector(r)?.classList.contains('openDrawer'), root);
async function toggleDrawer(T, page, key, want) {
    const [toggle, root] = DRAWERS[key];
    if ((await isOpen(page, root)) === want) return;
    await page.evaluate(s => document.querySelector(s).click(), toggle);
    await T.sleep(900);
}

// ---------------------------------------------------------------- generation (mock)
export async function genChecks(T, page) {
    const out = {};
    const lastText = () => page.evaluate(() => document.querySelector('#chat .mes.last_mes .mes_text')?.innerText.slice(0, 40) || '');
    const count = () => page.evaluate(() => SillyTavern.getContext().chat.length);
    const idle = () => page.waitForFunction(() => {
        const s = document.querySelector('#send_but'), st = document.querySelector('#mes_stop');
        return s && getComputedStyle(s).display !== 'none' && (!st || getComputedStyle(st).display === 'none');
    }, null, { timeout: 30000, polling: 100 });
    try {
        const n0 = await count();
        await page.fill('#send_textarea', '测试消息：今天天气如何？');
        await page.evaluate(() => document.querySelector('#send_but').click());
        await page.waitForFunction(n => SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000, polling: 100 });
        await idle();
        const t = await lastText();
        out.send = t.includes('mock') ? 'ok' : 'FAIL text=' + t;
        out.generate = page.__gen.calls >= 1 ? 'ok' : 'FAIL calls=' + page.__gen.calls;
    } catch (e) { out.send = 'FAIL ' + String(e.message).slice(0, 120); }
    try {
        // ST writes the counter as "1\u200b/\u200b2"; compare with zero-width spaces stripped.
        const counter = () => page.evaluate(() => (document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent || '').replace(/[\u200b\s]/g, ''));
        const waitCounter = v => page.waitForFunction(v => (document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent || '').replace(/[\u200b\s]/g, '') === v, v, { timeout: 30000, polling: 100 });
        // › on the last AI message when it is already the last alternative = generate a new one (ST rule)
        const before = page.__gen.calls, c0 = await counter();
        await page.evaluate(() => document.querySelector('#chat .mes.last_mes .swipe_right').click());
        await waitCounter('2/2');
        await idle();
        await page.evaluate(() => document.querySelector('#chat .mes.last_mes .swipe_left').click());
        await waitCounter('1/2');
        // The awaited 2/2 → 1/2 counters prove the swipe. Ny may issue additional mocked
        // background requests, so the total request counter is a lower bound, not exactly one.
        out.swipe = page.__gen.calls >= before + 1 ? `ok (${c0} → 2/2 new → 1/2; ${page.__gen.calls - before} mock requests)` : 'FAIL calls ' + before + '→' + page.__gen.calls;
    } catch (e) { out.swipe = 'FAIL ' + String(e.message).slice(0, 120); }
    try {
        page.__gen.delayMs = 8000;
        const n0 = await count();
        await page.fill('#send_textarea', '测试停止');
        await page.evaluate(() => document.querySelector('#send_but').click());
        await page.waitForFunction(() => { const s = document.querySelector('#mes_stop'); return s && getComputedStyle(s).display !== 'none'; }, null, { timeout: 10000, polling: 100 });
        const tStop = Date.now();
        await page.evaluate(() => document.querySelector('#mes_stop').click());
        await idle();
        out.stop = 'ok (' + (Date.now() - tStop) + 'ms, chat ' + n0 + '→' + (await count()) + ')';
        page.__gen.delayMs = 0;
        await T.sleep(500);
    } catch (e) { out.stop = 'FAIL ' + String(e.message).slice(0, 120); page.__gen.delayMs = 0; }
    return out;
}

// ---------------------------------------------------------------- parts
async function desk(T) {
    const { page, boot } = await enter(T);
    const r = { boot };
    await page.evaluate(() => { document.querySelector('#chat').scrollTop = 1e6; });
    await T.sleep(600);
    await T.shot(page, 'desk-chat');
    r.chat = await T.scan(page, ['#chat', '#sheld']);
    r.drawers = {};
    for (const key of Object.keys(DRAWERS)) {
        try {
            await toggleDrawer(T, page, key, true);
            if (key === 'wi') {
                await page.evaluate(() => { const s = document.querySelector('#world_editor_select'); if (s && s.options.length > 1 && !s.value) { s.selectedIndex = 1; $(s).trigger('change'); } });
                await T.sleep(1500);
            }
            await T.shot(page, 'desk-drawer-' + key);
            const s = await T.scan(page, [DRAWERS[key][1]]);
            r.drawers[key] = s;
            await toggleDrawer(T, page, key, false);
        } catch (e) { r.drawers[key] = 'ERR ' + String(e.message).slice(0, 120); }
    }
    r.gen = await genChecks(T, page);
    r.afterGen = await T.scan(page, ['#chat']);
    r.errors = T.errors(page);
    return r;
}

async function styles(T) {
    const { page } = await enter(T);
    const r = {};
    for (let v = 0; v <= 6; v++) {
        await page.evaluate(x => { $('#chat_display').val(String(x)).trigger('change'); }, v);
        await T.sleep(900);
        await page.evaluate(() => { document.querySelector('#chat').scrollTop = 1e6; });
        await T.sleep(400);
        await T.shot(page, 'style-' + v);
        const s = await T.scan(page, ['#chat']);
        const cls = await page.evaluate(() => [...document.body.classList].filter(c => /bubble|document|ap-chat/.test(c)).join(' '));
        // a send per style (mock) proves the composer still works in that style
        const n0 = await page.evaluate(() => SillyTavern.getContext().chat.length);
        await page.fill('#send_textarea', '风格 ' + v + ' 发送测试');
        await page.evaluate(() => document.querySelector('#send_but').click());
        let send = 'ok';
        try { await page.waitForFunction(n => SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000, polling: 100 }); }
        catch { send = 'FAIL'; }
        await T.sleep(800);
        r[v] = { cls, ovf: s.ovf, dbl: s.dbl, unhid: s.unhid, nest: s.nest, docOk: s.doc.ok, scrollY: s.scrollY, blurVis: s.blurVis, send, detail: (s.ovf + s.dbl + s.unhid + s.nest) ? s.detail : undefined };
    }
    await page.evaluate(() => { $('#chat_display').val('0').trigger('change'); });
    r.errors = T.errors(page);
    return r;
}

async function motion(T, page) {
    const state = await page.evaluate(() => ({ bodyClass: document.body.classList.contains('reduced-motion'), fxOff: !!jQuery.fx.off }));
    const computed = await page.evaluate(() => {
        let tr = 0, an = 0, maxTr = 0, maxAn = 0;
        for (const e of document.querySelectorAll('body *')) {
            const c = getComputedStyle(e);
            const d = Math.max(...c.transitionDuration.split(',').map(parseFloat)) * 1000;
            if (d > 0.02) tr++;
            maxTr = Math.max(maxTr, d);
            if (c.animationName !== 'none') { const a = Math.max(...c.animationDuration.split(',').map(parseFloat)) * 1000; if (a > 0.02) an++; maxAn = Math.max(maxAn, a); }
        }
        return { trOver0: tr, anOver0: an, maxTransitionMs: Math.round(maxTr * 100) / 100, maxAnimationMs: Math.round(maxAn * 100) / 100 };
    });
    const live = async f => {
        await page.evaluate(() => { window.__mx = 0; window.__run = true; const t = () => { if (!window.__run) return; for (const a of document.getAnimations()) { const d = a.effect?.getComputedTiming?.().duration; if (d > window.__mx) window.__mx = d; } requestAnimationFrame(t); }; requestAnimationFrame(t); });
        await f(); await T.sleep(500);
        return page.evaluate(() => { window.__run = false; return Math.round(window.__mx * 100) / 100; });
    };
    const click = s => page.evaluate(x => document.querySelector(x).click(), s);
    const liveMs = {};
    liveMs.drawer = await live(() => click('#user-settings-button > .drawer-toggle'));
    await live(() => click('#user-settings-button > .drawer-toggle'));
    liveMs.rail = await live(() => click('#rightNavHolder > .drawer-toggle'));
    await live(() => click('#rightNavHolder > .drawer-toggle'));
    liveMs.popup = await live(() => page.evaluate(() => { SillyTavern.getContext().callGenericPopup('测试', 1); }));
    await live(() => click('dialog.popup[open] .popup-button-ok'));
    liveMs.newMes = await live(() => page.evaluate(() => { const c = SillyTavern.getContext(); const m = { name: 'test', is_user: false, is_system: false, send_date: new Date().toISOString(), mes: '减少动态测试', extra: {} }; c.chat.push(m); c.addOneMessage(m); }));
    return { state, computed, liveMaxMs: liveMs };
}

async function reduced(T) {
    const r = {};
    {
        const { page } = await enter(T, {}, { powerUser: { reduced_motion: true } });
        r.stSwitch = await motion(T, page);
        r.stSwitch.errors = T.errors(page).length;
    }
    {
        const { page } = await enter(T, { reduced: true });
        r.osSetting = await motion(T, page);
        r.osSetting.errors = T.errors(page).length;
    }
    {
        const { page } = await enter(T);
        r.normal = await motion(T, page);
    }
    return r;
}

async function phone(T) {
    const { page, boot } = await enter(T, { phone: true });
    const r = { boot };
    await page.evaluate(() => { document.querySelector('#chat').scrollTop = 1e6; });
    await T.sleep(600);
    await T.shot(page, 'phone-chat');
    r.chat = await T.scan(page, ['#chat', '#sheld']);
    r.drawers = {};
    for (const key of Object.keys(DRAWERS)) {
        try {
            await toggleDrawer(T, page, key, true);
            await T.shot(page, 'phone-drawer-' + key);
            const s = await T.scan(page, [DRAWERS[key][1]]);
            r.drawers[key] = { ovf: s.ovf, dbl: s.dbl, unhid: s.unhid, nest: s.nest, btn: s.btn, doc: s.doc, panel: s.panels[DRAWERS[key][1]], scrollY: s.scrollY, detail: (s.ovf + s.dbl + s.unhid + s.nest) ? s.detail : undefined };
            await toggleDrawer(T, page, key, false);
        } catch (e) { r.drawers[key] = 'ERR ' + String(e.message).slice(0, 120); }
    }
    r.gen = await genChecks(T, page);
    r.errors = T.errors(page);
    return r;
}

async function cold(T) {
    const runs = [];
    for (let i = 0; i < 3; i++) {
        const page = await T.newPage();
        await T.prepare(page);
        const b = await T.boot(page, { ag2: !!T.cfg.ag2, settle: 200 });
        runs.push(b.readyMs);
        await page.context().close();
    }
    return { readyMs: runs, median: T.median(runs) };
}

async function compat(T) {
    // The user keeps Quick Replies off; switch them on in memory only (settings/get is
    // rewritten in the browser, nothing is saved) so #qr--bar placement can be checked.
    const { page } = await enter(T, {}, { extSettings: { quickReplyV2: { isEnabled: true } } });
    return page.evaluate(() => {
        const c = SillyTavern.getContext();
        const es = c.extensionSettings;
        // #qr--bar lives inside #send_form; "above the composer" = above the input row #nonQRFormItems
        const qr = document.querySelector('#qr--bar'), sf = document.querySelector('#nonQRFormItems') || document.querySelector('#send_form');
        const qrR = qr?.getBoundingClientRect(), sfR = sf?.getBoundingClientRect();
        const th = [...document.querySelectorAll('.TH-render')];
        return {
            theme: c.powerUserSettings.theme,
            littleWhiteBox: { renderEnabled: es.LittleWhiteBox?.renderEnabled, enabled: es.LittleWhiteBox?.enabled },
            tavernHelper: { renderEnabled: es.tavern_helper?.render?.enabled, thRender: th.length, iframes: th.filter(e => e.querySelector('iframe')).length, iframeH: th.map(e => Math.round(e.querySelector('iframe')?.getBoundingClientRect().height || 0)) },
            moonlit: { disabled: (es.disabledExtensions || []).some(x => /Moonlit/.test(x)), scriptLoaded: [...document.scripts].some(s => /Moonlit/.test(s.src)), cssLoaded: [...document.styleSheets].some(s => /Moonlit/.test(s.href || '')) },
            qrBar: qr ? { visible: getComputedStyle(qr).display !== 'none' && qrR.height > 0, aboveComposer: qrR.bottom <= sfR.top + 1 || qr.closest('#send_form') !== null, inSendForm: !!qr.closest('#send_form'), qrBottom: Math.round(qrR.bottom), sendTop: Math.round(sfR.top) } : 'absent (quickReplyV2.isEnabled=' + es.quickReplyV2?.isEnabled + ')',
            // shell nodes are id="ag2-…" or class "ag2-…" / "ag2"; avatars named ag2_*.png do not count
            ag2: { bodyClass: document.body.classList.contains('ag2'), ag2Nodes: [...document.querySelectorAll('body, body *')].filter(e => /^ag2/.test(e.id) || [...e.classList].some(c => c === 'ag2' || c.startsWith('ag2-'))).map(e => e.tagName.toLowerCase() + '#' + e.id + '.' + [...e.classList].join('.')).slice(0, 8) },
            chatDisplay: c.powerUserSettings.chat_display,
        };
    });
}

export default async function (T) {
    const want = T.cfg.part && T.cfg.part !== true ? String(T.cfg.part).split(',') : PARTS;
    T.cfg.ag2 = process.argv.includes('--ag2');
    const fns = { desk, styles, reduced, phone, cold, compat };
    const out = {};
    for (const p of want) {
        const t0 = Date.now();
        try { out[p] = await fns[p](T); } catch (e) { out[p] = 'ERR ' + String(e && e.stack || e).slice(0, 400); }
        out[p + 'Sec'] = Math.round((Date.now() - t0) / 1000);
        await T.save('baseline-' + p, out[p]);
    }
    return out;
}
