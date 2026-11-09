// tools/ag2/p6.mjs — P6 §9.3 third-party / built-in compatibility, AG Dark vs AG2 side by side.
//   node tools/ag2/run.mjs tools/ag2/p6.mjs --phase P6 --part compat [--phone]
// Theme must be published + active (AG2). The AG Dark run swaps the theme in memory (prepare
// theme:'dark'), so both runs use the same data and the same extension files. Writes are stubbed,
// generation is mocked; nothing that would call a real backend (translate / TTS / image gen) is
// clicked — those are checked for presence and placement only.
const vis = `e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'`;

// expressions in 立绘 (waifu / visual novel) mode: one neutral sprite is served from memory
const SPRITE = '/img/ag2-test-sprite.png';
async function spriteRoutes(page) {
    await page.route('**/api/sprites/get**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ label: 'neutral', path: SPRITE }]) }));
    await page.route('**' + SPRITE + '**', async r => {
        // 1x1 grey PNG scaled by ST's CSS; good enough to know the holder is laid out and visible
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        await r.fulfill({ status: 200, contentType: 'image/png', body: png });
    });
}

const fingerprint = page => page.evaluate(visSrc => {
    const vis = eval(visSrc);
    const q = s => document.querySelector(s);
    const qa = s => [...document.querySelectorAll(s)];
    const c = SillyTavern.getContext();
    const es = c.extensionSettings;
    const rect = e => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const th = qa('.TH-render');
    const mes = qa('#chat .mes');
    return {
        theme: c.powerUserSettings.theme,
        ag2: document.body.classList.contains('ag2'),
        // 小白X looks for .mes_block > .ch_name and .mes_buttons on every message
        mes: mes.length,
        chName: qa('#chat .mes .mes_block > .ch_name').length,
        mesButtons: qa('#chat .mes .mes_buttons').length,
        xbInMes: qa('#chat .mes [class*="xiaobaix"], #chat .mes [id*="xiaobaix"], #chat .mes [class*="xb-"]').length,
        xbGlobal: qa('[id^="xiaobaix"], [id^="xb-"], [class*="xiaobaix"]').filter(e => !e.closest('#chat')).length,
        lwb: { enabled: es.LittleWhiteBox?.enabled, renderEnabled: es.LittleWhiteBox?.renderEnabled },
        hooks: { nonQRFormItems: !!q('#nonQRFormItems'), send_form: !!q('#send_form'), qrBar: !!q('#qr--bar'), qrVisible: vis(q('#qr--bar')) },
        // 酒馆助手
        th: { render: th.length, iframes: th.filter(e => e.querySelector('iframe')).length, iframeH: th.map(e => Math.round(e.querySelector('iframe')?.getBoundingClientRect().height || 0)) },
        // wand (#extensionsMenu) items, by id or first class
        wand: qa('#extensionsMenu > *').map(e => e.id || (e.className || '').toString().split(' ')[0]).filter(Boolean),
        builtins: Object.fromEntries(['#sd_gen', '#translate_chat', '#ttsExtensionMenuItem', '#manageAttachments', '#attachFile', '#connection_profiles', '#logprobsViewer', '#cfgConfig', '#floatingPrompt', '#expression-wrapper', '#vectors_source', '#tts_settings', '#translation_provider', '#sd_refine_mode', '#expressions_allow_multiple'].map(s => [s, !!q(s)])),
        cssSnippets: { trigger: qa('.csss--trigger').length, inCustomCss: !!q('#CustomCSS-block > h4 .csss--trigger'), style: !!q('#csss--css-snippets') },
        customModels: { btn: qa('.stcm--btn').length },
        waifu: document.body.classList.contains('waifuMode'),
        expr: { holder: rect(q('#expression-holder')), img: rect(q('#expression-image')), imgVisible: vis(q('#expression-image')), src: (q('#expression-image')?.getAttribute('src') || '').replace(/\?.*/, '') },
        moonlit: { disabled: (es.disabledExtensions || []).some(x => /Moonlit/.test(x)), loaded: [...document.scripts].some(s => /Moonlit/.test(s.src)) },
    };
}, vis);

async function enter(T, dark, opt = {}) {
    const page = await T.newPage();
    if (opt.sprites) await spriteRoutes(page);
    await T.prepare(page, { ...(dark ? { theme: 'dark' } : {}), extSettings: { quickReplyV2: { isEnabled: true } }, powerUser: opt.powerUser });
    await T.boot(page, { ag2: !dark });
    const spec = await T.longChat(page);
    await T.openChat(page, spec, 20);
    return page;
}

/** open a settings page (AG2: shell window / phone sheet; returns the panel's visibility of selectors) */
async function settingsPage(T, page, id) {
    await page.evaluate(ph => (ph ? document.querySelector('#ag2-tabbar [data-tab="settings"]') : document.querySelector('#ag2-sidebar [data-act="settings"]'))?.click(), !!T.cfg.phone);
    await T.sleep(1200);
    await page.evaluate(p => document.querySelector(`#ag2-settings .ag2-set-item[data-page="${p}"]`)?.click(), id);
    await T.sleep(1500);
}
const closeSettings = async (T, page) => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Escape'); await T.sleep(400); await page.keyboard.press('Escape'); await T.sleep(600); };

async function compat(T) {
    const out = {};
    for (const [name, dark] of [['dark', true], ['ag2', false]]) {
        const page = await enter(T, dark);
        const r = { fp: await fingerprint(page) };
        // wand menu: AG Dark via ST's button; AG2 via + › 扩展工具
        if (dark) {
            await page.evaluate(() => document.querySelector('#extensionsMenuButton')?.click());
        } else {
            await page.evaluate(() => document.querySelector('#ag2-plus')?.click());
            await T.sleep(400);
            await page.evaluate(() => document.querySelector('#ag2-plus-menu [data-item="wand"]')?.click());
        }
        await T.sleep(600);
        r.wandVisible = await page.evaluate(visSrc => { const vis = eval(visSrc); const m = document.querySelector('#extensionsMenu'); return { menu: vis(m), items: [...(m?.querySelectorAll('.list-group-item, [id]') || [])].filter(vis).map(e => e.id || (e.textContent || '').trim().slice(0, 16)) }; }, vis);
        await T.shot(page, `compat-wand-${name}-${T.cfg.phone ? 'phone' : T.cfg.w}`);
        // data bank (wand › 附件) opens ST's popup — read-only list
        await page.evaluate(() => document.querySelector('#manageAttachments')?.click());
        await T.sleep(1200);
        r.dataBank = await page.evaluate(visSrc => { const vis = eval(visSrc); const p = [...document.querySelectorAll('dialog.popup[open], .popup')].filter(vis).pop(); return { popup: !!p, attachmentManager: !!p?.querySelector('.attachmentsList, .attachmentListItem, [class*="attachment"]') }; }, vis);
        await T.shot(page, `compat-databank-${name}-${T.cfg.phone ? 'phone' : T.cfg.w}`);
        await page.keyboard.press('Escape'); await T.sleep(600);
        await page.keyboard.press('Escape'); await T.sleep(400);
        // AG2: CSS Snippets / Custom Models / vectors / tts settings reachable in the settings window
        if (!dark) {
            const where = {};
            for (const [pg, sels] of [['user', ['#CustomCSS-block > h4 .csss--trigger']], ['api', ['.stcm--btn']], ['ext', ['#vectors_source', '#tts_settings', '#translation_provider', '#sd_refine_mode', '#expressions_allow_multiple', '#qr--settings', '.extension_container']]]) {
                await settingsPage(T, page, pg);
                // visible itself, or (collapsed ST inline drawer) its drawer header is visible
                where[pg] = await page.evaluate(([ss, visSrc]) => { const vis = eval(visSrc); return Object.fromEntries(ss.map(s => { const all = [...document.querySelectorAll(s)]; const e = all.find(vis); if (e) { e.scrollIntoView({ block: 'center' }); return [s, 'visible']; } const hd = all.map(x => x.closest('.inline-drawer')?.querySelector(':scope > .inline-drawer-header')).find(vis); return [s, hd ? 'header:' + hd.textContent.trim().replace(/\s+/g, ' ').slice(0, 24) : (all.length ? 'present-hidden' : 'absent')]; })); }, [sels, vis]);
                if (pg === 'user') {
                    // the CSS Snippets manager opens (it is ST-side UI; closed again right away)
                    // the CSS Snippets manager is a window.open() popup: it must open from the AG2 window
                    const pop = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
                    await page.evaluate(() => [...document.querySelectorAll('#CustomCSS-block > h4 .csss--trigger')].find(e => e.getClientRects().length)?.click());
                    const w = await pop;
                    where.csssManager = !!w;
                    if (w) { await T.sleep(1500); where.csssManagerBody = await w.evaluate(() => document.body.querySelectorAll('*').length).catch(e => 'ERR ' + e.message); await w.close().catch(() => {}); }
                }
                if (pg === 'ext') { await T.shot(page, `compat-ext-${T.cfg.phone ? 'phone' : T.cfg.w}`); }
                await closeSettings(T, page);
            }
            r.settingsReach = where;
        }
        r.errors = T.errors(page);
        out[name] = r;
        await page.context().close();
    }
    // the shell must not remove / add any third-party or built-in hook the classic UI has
    const a = out.dark.fp, b = out.ag2.fp;
    const keys = ['mes', 'chName', 'mesButtons', 'xbInMes', 'lwb', 'hooks', 'th', 'wand', 'builtins', 'cssSnippets', 'customModels', 'moonlit'];
    out.diff = keys.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => ({ k, dark: a[k], ag2: b[k] }));
    out.wandSame = JSON.stringify(out.dark.wandVisible.items) === JSON.stringify(out.ag2.wandVisible.items);
    return out;
}

// 表情立绘（立绘模式）: waifuMode on, one mocked sprite; the holder must be laid out under both themes
async function expr(T) {
    const out = {};
    for (const [name, dark] of [['dark', true], ['ag2', false]]) {
        const page = await enter(T, dark, { sprites: true, powerUser: { waifuMode: true } });
        await T.sleep(1500);
        out[name] = { fp: (await fingerprint(page)), scan: await T.scan(page, ['#chat', '#sheld']) };
        out[name].scan = { ovf: out[name].scan.ovf, dbl: out[name].scan.dbl, unhid: out[name].scan.unhid, nest: out[name].scan.nest, btn: out[name].scan.btn, scrollY: out[name].scan.scrollY };
        out[name].fp = { waifu: out[name].fp.waifu, expr: out[name].fp.expr, ag2: out[name].fp.ag2 };
        await T.shot(page, `compat-expr-${name}-${T.cfg.phone ? 'phone' : T.cfg.w}`);
        out[name].errors = T.errors(page);
        await page.context().close();
    }
    return out;
}

// Custom Models: its ✎ button sits on the OpenAI / Google … model selects. The test copy uses the
// “custom” source (no button there), so the source is switched to openai in memory only.
async function cm(T) {
    const out = {};
    for (const [name, dark] of [['dark', true], ['ag2', false]]) {
        const page = await T.newPage();
        await T.prepare(page, { ...(dark ? { theme: 'dark' } : {}), mutate: s => { s.main_api = 'openai'; s.oai_settings = { ...(s.oai_settings || {}), chat_completion_source: 'openai' }; } });
        await T.boot(page, { ag2: !dark });
        if (dark) { await page.evaluate(() => document.querySelector('#sys-settings-button .drawer-toggle')?.click()); await T.sleep(1500); }
        else await settingsPage(T, page, 'api');
        const r = await page.evaluate(visSrc => { const vis = eval(visSrc); const b = [...document.querySelectorAll('.stcm--btn')].find(vis); if (b) b.scrollIntoView({ block: 'center' }); return { source: document.querySelector('#chat_completion_source')?.value, btnVisible: !!b, btnTotal: document.querySelectorAll('.stcm--btn').length }; }, vis);
        await T.shot(page, `compat-cm-${name}-${T.cfg.phone ? 'phone' : T.cfg.w}`);
        await page.evaluate(visSrc => { const vis = eval(visSrc); [...document.querySelectorAll('.stcm--btn')].find(vis)?.click(); }, vis);
        await T.sleep(1200);
        r.popup = await page.evaluate(() => !![...document.querySelectorAll('dialog.popup[open]')].find(d => d.querySelector('textarea')));
        await T.shot(page, `compat-cm-popup-${name}-${T.cfg.phone ? 'phone' : T.cfg.w}`);
        // cancel (nothing saved; writes are stubbed anyway)
        await page.evaluate(() => [...document.querySelectorAll('dialog.popup[open] .popup-button-cancel, dialog.popup[open] .popup-button-close')].find(e => e.getClientRects().length)?.click());
        await T.sleep(600);
        r.popupClosed = await page.evaluate(() => !document.querySelector('dialog.popup[open]'));
        r.errors = T.errors(page);
        out[name] = r;
        await page.context().close();
    }
    return out;
}

export default async function (T) {
    const parts = String(T.cfg.part && T.cfg.part !== true ? T.cfg.part : 'compat').split(',');
    const fns = { compat, expr, cm };
    const out = {};
    for (const p of parts) {
        try { out[p] = await fns[p](T); } catch (e) { out[p] = 'ERR ' + String(e && e.stack || e).slice(0, 400); }
        await T.save('p6-' + p, out[p]);
    }
    return out;
}
