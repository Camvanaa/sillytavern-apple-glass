// tools/ag2/p1a.mjs — P1a acceptance checks for the AG2 shell.
//   node tools/ag2/run.mjs tools/ag2/p1a.mjs --phase P1a --part func|shots|pins|classic [--mem]
// --mem: inject the AG2 theme in memory (debug). Without it the suite expects the theme to be
// published + active in ag2-data (sync-css.sh start-test … --activate "Apple Glass 2").
const norm = s => String(s ?? '').replace(/\u200b/g, '');

async function enter(T, over = {}, prep = {}) {
    const page = await T.newPage(over);
    const mem = process.argv.includes('--mem');
    await T.prepare(page, { ...(mem ? { theme: 'ag2' } : {}), ...prep });
    const b = await T.boot(page, { ag2: !over.classic, query: over.query, settle: over.settle ?? 2500 });
    return { page, readyMs: b.readyMs };
}

const state = page => page.evaluate(() => {
    const c = SillyTavern.getContext();
    return { char: c.characters[c.characterId]?.avatar ?? null, group: c.groupId ?? null, chat: c.getCurrentChatId() ?? null, n: document.querySelectorAll('#chat .mes').length };
});

async function clickRow(page, nameText, sub) {
    const rows = page.locator('#ag2-sidebar .ag2-chat-row', { hasText: nameText });
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
        const t = await rows.nth(i).innerText();
        if (!sub || t.includes(sub)) { await rows.nth(i).click(); return true; }
    }
    return false;
}

async function waitChat(page, pred, ms = 20000) {
    const t0 = Date.now();
    for (;;) {
        const s = await state(page);
        if (pred(s)) { await page.waitForTimeout(800); return state(page); }
        if (Date.now() - t0 > ms) return { ...s, timeout: true };
        await page.waitForTimeout(150);
    }
}

async function func(T) {
    const out = {};
    const shortClicks = page => { page.setDefaultTimeout(8000); };
    // Startup alignment: pretend ST had the right panel, AI-config and WI drawers pinned open.
    const { page } = await enter(T, {}, {
        mutate: s => Object.assign(s.accountStorage ||= {}, { NavLockOn: 'true', NavOpened: 'true', LNavLockOn: 'true', LNavOpened: 'true', WINavLockOn: 'true', WINavOpened: 'true' }),
    });
    shortClicks(page);
    try { await funcBody(T, page, out); } catch (e) { out.ERROR = String(e.message).split('\n')[0]; out.dbg = await page.evaluate(() => ({ body: document.body.className, dialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.className), menus: document.querySelectorAll('.ag2-menu').length, sub: document.querySelector('.ag2-title-sub')?.textContent })).catch(() => null); }
    out.errors = T.errors(page);
    return out;
}

async function funcBody(T, page, out) {
    out.align = await page.evaluate(() => ({ open: [...document.querySelectorAll('.drawer-content.openDrawer')].map(e => e.id), body: [...document.body.classList].filter(c => c.startsWith('ag2')) }));

    // Sidebar switching: other character, same character's 2nd chat, group chat
    const sw = out.switch = {};
    await clickRow(page, '图书管理员 Mira', '只有一个字母');
    sw.mira = await waitChat(page, s => s.char === 'ag2_Mira.png' && s.n > 1);
    await clickRow(page, '旅店老板 Aldric', '钟楼的路');
    sw.aldric2 = await waitChat(page, s => s.chat === '旅店老板 Aldric - 钟楼的路');
    await clickRow(page, '旅店老板 Aldric', '晚安');
    sw.aldric1 = await waitChat(page, s => s.chat === '旅店老板 Aldric - 2026-11-06@19h00m00s' && s.n > 40);
    await clickRow(page, '旅途同伴');
    sw.group = await waitChat(page, s => s.group === 'ag2group01' && s.n > 1);
    sw.groupTitle = await page.evaluate(() => [document.querySelector('.ag2-title-name').textContent, document.querySelectorAll('.ag2-title-av.ag2-av-stack img').length]);
    sw.activeRow = await page.evaluate(() => document.querySelector('#ag2-sidebar .ag2-row.ag2-on .ag2-row-name')?.textContent);
    // character / group segments
    await page.click('#ag2-sidebar [data-seg="chars"]');
    sw.chars = await page.evaluate(() => [...document.querySelectorAll('#ag2-sidebar .ag2-ent-row .ag2-row-name')].map(e => e.textContent));
    await page.locator('#ag2-sidebar .ag2-ent-row', { hasText: '星港领航员 Kael' }).click();
    sw.kael = await waitChat(page, s => s.char === 'ag2_Kael.png' && s.n > 1);
    await page.click('#ag2-sidebar [data-seg="groups"]');
    sw.groups = await page.evaluate(() => [...document.querySelectorAll('#ag2-sidebar .ag2-ent-row')].map(e => e.innerText.replace(/\n/g, ' / ')));
    await page.click('#ag2-sidebar [data-seg="chats"]');
    out.switch = sw;

    // Switch during generation: held mock response keeps ST generating
    const g = out.genGuard = {};
    await clickRow(page, '旅店老板 Aldric', '晚安');
    await waitChat(page, s => s.chat === '旅店老板 Aldric - 2026-11-06@19h00m00s' && s.n > 40);
    page.__gen.delayMs = 7000;
    await page.fill('#send_textarea', '（测试）生成中切换');
    await page.click('#send_but');
    await page.waitForFunction(() => document.querySelector('#mes_stop') && getComputedStyle(document.querySelector('#mes_stop')).display !== 'none', null, { timeout: 10000 });
    g.subDuring = await page.evaluate(() => document.querySelector('.ag2-title-sub').textContent);
    await clickRow(page, '图书管理员 Mira', '只有一个字母');
    await page.waitForTimeout(600);
    g.toast = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.innerText).join(' | '));
    g.after = await state(page);
    await page.click('#mes_stop').catch(() => {});
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#mes_stop')).display === 'none', null, { timeout: 15000 }).catch(() => {});
    page.__gen.delayMs = 0;
    await page.waitForTimeout(800);
    g.subAfter = await page.evaluate(() => document.querySelector('.ag2-title-sub').textContent);
    out.genGuard = g;

    // Context menu → pin / unpin (in memory; persistence is the `pins` part)
    const p = out.pins = {};
    await page.locator('#ag2-sidebar .ag2-chat-row', { hasText: 'Seraphina' }).first().click({ button: 'right' });
    p.menu = await page.evaluate(() => [...document.querySelectorAll('.ag2-menu .ag2-menu-item')].map(b => b.innerText.trim()));
    await T.shot(page, 'ctx-menu-1440');
    await page.click('.ag2-menu [data-item="pin"]');
    await page.waitForTimeout(300);
    p.secs = await page.evaluate(() => [...document.querySelectorAll('#ag2-sidebar .ag2-sec')].map(e => e.textContent));
    p.pinnedRow = await page.evaluate(() => document.querySelector('#ag2-sidebar .ag2-sec + .ag2-chat-row .ag2-row-name')?.textContent + ' pin=' + !!document.querySelector('#ag2-sidebar .ag2-sec + .ag2-chat-row .ag2-pin'));
    p.store = await page.evaluate(() => Object.keys(SillyTavern.getContext().extensionSettings.appleGlass2?.pins || {}));
    await page.locator('#ag2-sidebar .ag2-chat-row', { hasText: 'Seraphina' }).first().click({ button: 'right' });
    p.menu2 = await page.evaluate(() => document.querySelector('.ag2-menu [data-item="pin"]')?.innerText.trim());
    await page.keyboard.press('Escape');
    p.escClosed = await page.evaluate(() => !document.querySelector('.ag2-menu'));
    // delete asks for confirmation (cancelled)
    await page.locator('#ag2-sidebar .ag2-chat-row', { hasText: 'Seraphina' }).first().click({ button: 'right' });
    await page.click('.ag2-menu [data-item="delete"]');
    await page.waitForTimeout(500);
    p.confirm = await page.evaluate(() => document.querySelector('dialog[open] .popup-content, dialog[open]')?.innerText.slice(0, 60));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    p.stillThere = await page.locator('#ag2-sidebar .ag2-chat-row', { hasText: 'Seraphina' }).count();
    await page.locator('#ag2-sidebar .ag2-chat-row', { hasText: 'Seraphina' }).first().click({ button: 'right' });
    await page.click('.ag2-menu [data-item="pin"]');
    p.unpinned = await page.evaluate(() => Object.keys(SillyTavern.getContext().extensionSettings.appleGlass2?.pins || {}).length);
    out.pins = p;

    // Title capsule menu, tool capsule
    const c = out.capsules = {};
    await page.click('#ag2-title .ag2-title-btn');
    c.titleMenu = await page.evaluate(() => [...document.querySelectorAll('.ag2-menu .ag2-menu-item')].map(b => b.innerText.trim()));
    await page.click('.ag2-menu [data-item="select"]');
    await page.waitForTimeout(800);
    c.selectChat = await page.evaluate(() => { const p = document.querySelector('#shadow_select_chat_popup'); return p ? getComputedStyle(p).display !== 'none' && p.querySelectorAll('.select_chat_block').length : 'missing'; });
    await page.evaluate(() => document.querySelector('#select_chat_cross')?.click());
    await page.waitForTimeout(500);
    await page.click('#ag2-tools [data-act="wi"]');
    await page.waitForTimeout(600);
    c.wiOpen = await page.evaluate(() => document.getElementById('WorldInfo').classList.contains('openDrawer'));
    await page.click('#ag2-tools [data-act="wi"]', { force: true }).catch(() => {});
    await page.waitForTimeout(600);
    c.wiClosed = await page.evaluate(() => !document.getElementById('WorldInfo').classList.contains('openDrawer'));
    await page.click('#ag2-tools [data-act="an"]');
    await page.waitForTimeout(800);
    c.anOpen = await page.evaluate(() => { const e = document.getElementById('floatingPrompt'); return !!e && getComputedStyle(e).display !== 'none'; });
    await page.evaluate(() => document.querySelector('#ANClose')?.click());
    await page.waitForTimeout(500);
    c.anClosed = await page.evaluate(() => { const e = document.getElementById('floatingPrompt'); return !e || getComputedStyle(e).display === 'none'; });
    // Collapse / expand
    await page.click('#ag2-sidebar [data-act="collapse"]');
    await page.waitForTimeout(500);
    c.collapsed = await page.evaluate(() => ({ cls: document.body.classList.contains('ag2-side-collapsed'), sheldLeft: Math.round(document.getElementById('sheld').getBoundingClientRect().left), expand: getComputedStyle(document.querySelector('#ag2-title .ag2-expand')).display, ls: localStorage.getItem('ag2.sidebar') }));
    await T.shot(page, 'collapsed-1440');
    await page.click('#ag2-title .ag2-expand');
    await page.waitForTimeout(500);
    c.expanded = await page.evaluate(() => ({ cls: document.body.classList.contains('ag2-side-collapsed'), sheldLeft: Math.round(document.getElementById('sheld').getBoundingClientRect().left) }));
    // Close chat → welcome; new-menu
    await page.click('#ag2-title .ag2-title-btn');
    await page.click('.ag2-menu [data-item="close"]');
    await page.waitForFunction(() => document.body.classList.contains('ag2-welcome'), null, { timeout: 10000 }).catch(() => {});
    c.welcomeAfterClose = await page.evaluate(() => ({ welcome: document.body.classList.contains('ag2-welcome'), cards: document.querySelectorAll('.ag2-wel-card').length, sheldVis: getComputedStyle(document.getElementById('sheld')).visibility }));
    out.capsules = c;
    out.scan = await T.scan(page, ['#ag2-sidebar .ag2-side-list', '#ag2-welcome']);
}

// Theme switch to AG Dark: no residue; back to AG2: shell again
async function themes(T) {
    const out = {};
    const { page } = await enter(T);
    await T.openChat(page, await T.longChat(page));
    const before = await page.evaluate(() => document.querySelectorAll('#chat .mes').length);
    await page.evaluate(() => { $('#themes').val('Apple Glass Dark').trigger('change'); });
    await page.waitForTimeout(2500);
    out.dark = await page.evaluate(() => ({
        theme: SillyTavern.getContext().powerUserSettings.theme,
        bodyAg2: [...document.body.classList].filter(c => c === 'ag2' || c.startsWith('ag2-')),
        nodes: [...document.querySelectorAll('[id^="ag2-"], [class*="ag2-"]')].map(e => e.id || e.className).slice(0, 5),
        sheld: (r => [r.left, r.top, r.width].map(Math.round).join(','))(document.getElementById('sheld').getBoundingClientRect()),
        topbarVisible: getComputedStyle(document.querySelector('#top-settings-holder .drawer-toggle')).visibility,
        mes: document.querySelectorAll('#chat .mes').length,
    }));
    out.dark.mesBefore = before;
    out.dark.scan = await T.scan(page, []);
    await T.shot(page, 'theme-back-dark-1440');
    await page.evaluate(() => { $('#themes').val('Apple Glass 2').trigger('change'); });
    await page.waitForTimeout(2500);
    out.ag2Again = await page.evaluate(() => ({ body: document.body.classList.contains('ag2'), sidebar: !!document.getElementById('ag2-sidebar'), rows: document.querySelectorAll('.ag2-chat-row').length, title: document.querySelector('.ag2-title-name')?.textContent }));
    out.errors = T.errors(page);
    return out;
}

async function classic(T) {
    const out = {};
    for (const q of ['?classic', '#classic']) {
        const { page } = await enter(T, { classic: true, query: q });
        out[q] = await page.evaluate(() => ({ body: [...document.body.classList].filter(c => c.startsWith('ag2')), nodes: document.querySelectorAll('[id^="ag2-"]').length, theme: SillyTavern.getContext().powerUserSettings.theme, topbar: getComputedStyle(document.querySelector('#top-settings-holder .drawer-toggle')).visibility }));
        if (q === '?classic') await T.shot(page, 'classic-1440');
        out[q].errors = T.errors(page).filter(e => !/FilesPluginApi|LittleWhiteBox_CommonSettings|Failed to load resource/.test(e));
    }
    return out;
}

// Design-comparison shots: 1440 + 1280, Seraphina chat like design 01, plus welcome
async function shots(T) {
    const out = {};
    for (const w of [1440, 1280]) {
        const { page, readyMs } = await enter(T, { w, h: 900 });
        out['ready' + w] = readyMs;
        await T.shot(page, `welcome-${w}`);
        out['welcomeScan' + w] = await T.scan(page, ['#ag2-sidebar .ag2-side-list', '#ag2-welcome']);
        await clickRow(page, 'Seraphina');
        await waitChat(page, s => s.char === 'default_Seraphina.png' && s.n > 1);
        await T.shot(page, `chat-sera-${w}`);
        await clickRow(page, '旅店老板 Aldric', '晚安');
        await waitChat(page, s => s.chat === '旅店老板 Aldric - 2026-11-06@19h00m00s' && s.n > 40);
        await T.shot(page, `chat-long-${w}`);
        out['chatScan' + w] = await T.scan(page, ['#ag2-sidebar .ag2-side-list']);
        out['geom' + w] = await page.evaluate(() => {
            const r = s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].map(Math.round).join(','); };
            return { side: r('#ag2-sidebar'), title: r('#ag2-title'), tools: r('#ag2-tools'), sheld: r('#sheld'), mes: r('#chat .mes:last-child'), form: r('#form_sheld') };
        });
        await page.click('#ag2-sidebar [data-act="new"]');
        await T.shot(page, `new-menu-${w}`);
        await page.keyboard.press('Escape');
        await page.click('#ag2-title .ag2-title-btn');
        await T.shot(page, `title-menu-${w}`);
        await page.keyboard.press('Escape');
        await page.click('#ag2-sidebar [data-seg="chars"]');
        await T.shot(page, `seg-chars-${w}`);
        await page.click('#ag2-sidebar [data-seg="groups"]');
        await T.shot(page, `seg-groups-${w}`);
        await page.click('#ag2-sidebar [data-seg="chats"]');
        out['errors' + w] = T.errors(page);
    }
    return out;
}

// Pin persistence across reload: settings/save goes through to the TEST copy only.
async function pins(T) {
    const out = {};
    const allowSave = async page => page.route('**/api/settings/save', r => r.continue());
    const a = await enter(T);
    await allowSave(a.page);
    const target = 'Seraphina';
    await a.page.locator('#ag2-sidebar .ag2-chat-row', { hasText: target }).first().click({ button: 'right' });
    await a.page.click('.ag2-menu [data-item="pin"]');
    const saved = a.page.waitForResponse(r => r.url().includes('/api/settings/save'), { timeout: 15000 }).catch(() => null);
    out.saveStatus = (await saved)?.status() ?? 'no-save';
    out.pinsA = await a.page.evaluate(() => Object.keys(SillyTavern.getContext().extensionSettings.appleGlass2?.pins || {}));
    await a.page.context().close();
    const b = await enter(T);
    await allowSave(b.page);
    out.afterReload = await b.page.evaluate(() => ({
        pins: Object.keys(SillyTavern.getContext().extensionSettings.appleGlass2?.pins || {}),
        firstSec: document.querySelector('#ag2-sidebar .ag2-sec')?.textContent,
        firstRow: document.querySelector('#ag2-sidebar .ag2-chat-row .ag2-row-name')?.textContent,
        pinIcon: !!document.querySelector('#ag2-sidebar .ag2-chat-row .ag2-pin'),
    }));
    await T.shot(b.page, 'pinned-after-reload-1440');
    await b.page.locator('#ag2-sidebar .ag2-chat-row', { hasText: target }).first().click({ button: 'right' });
    await b.page.click('.ag2-menu [data-item="pin"]');
    const saved2 = b.page.waitForResponse(r => r.url().includes('/api/settings/save'), { timeout: 15000 }).catch(() => null);
    out.saveStatus2 = (await saved2)?.status() ?? 'no-save';
    await b.page.context().close();
    const c = await enter(T);
    out.afterUnpinReload = await c.page.evaluate(() => ({
        pins: Object.keys(SillyTavern.getContext().extensionSettings.appleGlass2?.pins || {}),
        firstSec: document.querySelector('#ag2-sidebar .ag2-sec')?.textContent,
    }));
    return out;
}

export default async function (T) {
    const part = T.cfg.part || 'func';
    const fn = { func, themes, classic, shots, pins }[part];
    if (!fn) throw new Error('unknown part ' + part);
    return T.save('p1a-' + part, await fn(T));
}
