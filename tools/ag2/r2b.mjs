// tools/ag2/r2b.mjs — R2b: inspector creator's-notes leak + ST native popups.
//   node tools/ag2/run.mjs tools/ag2/r2b.mjs --phase R2b --part insp|popups|toast [--w 1440 --h 900|--phone] [--tag pre|post] [--mem]
// Writes stay stubbed (run.mjs).

const has = n => process.argv.includes('--' + n);
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const part = arg('part', 'insp');
const MEM = has('mem');
const TAG = arg('tag', 'pre');
const AV = { aldric: 'ag2_Aldric.png', mira: 'ag2_Mira.png', kael: 'ag2_Kael.png', sera: 'default_Seraphina.png', asst: 'default_Assistant.png' };

async function enter(T, opt = {}) {
    const page = await T.newPage(opt.page || {});
    await T.prepare(page, { ...(MEM ? { theme: 'ag2' } : {}), ...(opt.prep || {}) });
    const b = await T.boot(page, { ag2: true, settle: 2200 });
    if (opt.noChat) return { page, boot: b };
    await T.openChat(page, opt.spec || await T.longChat(page), opt.minMes ?? 2);
    await T.sleep(700);
    return { page, boot: b };
}
const isPhone = () => process.argv.includes('--phone');
/** Desktop: the tool capsule toggles the inspector. Phone: the title button opens it (§5.9).
 *  Uses a JS click (the phone sheet's seg buttons can overlay the title's hit box). */
const toggle = async (T, page) => {
    const open = await page.evaluate(() => document.body.classList.contains('ag2-insp-open'));
    if (open) return;
    if (isPhone()) { await page.evaluate(() => document.querySelector('#ag2-title .ag2-title-btn')?.click()); await T.sleep(900); }
    else { await page.click('#ag2-tools [data-act="insp"]'); await T.sleep(800); }
};
const shot = (T, page, n) => T.shot(page, `${TAG}-${n}`);

/** Inspector notes facts. */
const notesSt = page => page.evaluate(() => {
    const p = document.getElementById('right-nav-panel');
    const vis = el => { if (!el) return false; const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden') return false; const q = el.getBoundingClientRect(); return q.width > 0.5 && q.height > 0.5; };
    const box = el => { if (!el) return null; const q = el.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const sf = document.getElementById('spoiler_free_desc');
    const hdr = document.querySelector('#spoiler_free_desc > .inline-drawer-header');
    const h4 = document.querySelector('#spoiler_free_desc > .inline-drawer-header .title_restorable');
    const icon = document.querySelector('#spoiler_free_desc .inline-drawer-icon');
    const content = document.querySelector('#spoiler_free_desc > .inline-drawer-content');
    const hidden = document.getElementById('creators_note_desc_hidden');
    const empty = document.getElementById('creator_notes_empty');
    const spoiler = document.getElementById('creator_notes_spoiler');
    const cs = el => { if (!el) return null; const c = getComputedStyle(el); return { bgImage: c.backgroundImage.slice(0, 40), bg: c.backgroundColor, border: c.borderTopWidth + ' ' + c.borderTopColor, radius: c.borderRadius, filter: c.filter, color: c.color, display: c.display }; };
    return {
        view: p.dataset.ag2Insp || null, notesAttr: !!p.dataset.ag2Notes,
        sfVis: vis(sf), sfBox: box(sf), sfStyle: cs(sf),
        hdrVis: vis(hdr), hdrStyle: cs(hdr),
        titleStyle: cs(h4), titleText: h4?.textContent?.trim().slice(0, 30),
        iconVis: vis(icon), iconStyle: icon ? { display: getComputedStyle(icon).display, fontSize: getComputedStyle(icon).fontSize, color: getComputedStyle(icon).color } : null,
        contentVis: vis(content), contentStyle: cs(content),
        hiddenVis: vis(hidden), emptyVis: vis(empty), spoilerVis: vis(spoiler),
        spoilerHTML: (spoiler?.innerHTML || '').slice(0, 120),
        noteButtons: !!document.getElementById('creators_note_styles_button') && !!document.getElementById('spoiler_free_desc_button'),
        // is there any visible native gradient header anywhere in the inspector?
        standoutVis: [...document.querySelectorAll('#right-nav-panel .standoutHeader')].filter(vis).map(e => (e.id || e.className).slice(0, 40)),
    };
});

// ---------------------------------------------------------------- insp: the notes block in every view
async function insp(T) {
    const out = {};
    const { page } = await enter(T); // Aldric: has creator_notes
    await toggle(T, page);
    out.charCollapsed = await notesSt(page);
    await shot(T, page, 'insp-char-collapsed');
    // click 查看
    await page.click('#ag2-insp-links [data-ag2-act="notes"]'); await T.sleep(900);
    out.charExpanded = await notesSt(page);
    await shot(T, page, 'insp-char-expanded');
    // click again → 收起
    await page.click('#ag2-insp-links [data-ag2-act="notes"]'); await T.sleep(500);
    out.charCollapsed2 = await notesSt(page);
    // group view: open group chat, inspector
    await page.locator('#ag2-sidebar .ag2-chat-row', { hasText: '旅途同伴' }).first().click();
    await page.waitForFunction(() => !!SillyTavern.getContext().groupId && document.querySelectorAll('#chat .mes').length > 1, null, { timeout: 30000, polling: 100 });
    await T.sleep(1500);
    out.group = await notesSt(page);
    await shot(T, page, 'insp-group');
    // create view: sidebar 新建角色
    await page.click('#ag2-sidebar [data-act="new"]'); await T.sleep(300);
    await page.locator('.ag2-menu .ag2-menu-item', { hasText: '新建角色' }).click(); await T.sleep(1500);
    out.create = await notesSt(page);
    await shot(T, page, 'insp-create');
    // no-notes char: back to Aldric, blank notes in memory
    await page.evaluate(() => { const c = SillyTavern.getContext(); const ch = c.characters.find(x => x.avatar === 'ag2_Aldric.png'); ch.data.creator_notes = ''; ch.creatorcomment = ''; });
    await page.evaluate(async () => { const c = SillyTavern.getContext(); const id = c.characters.findIndex(x => x.avatar === 'ag2_Aldric.png'); await c.selectCharacterById(id); });
    await T.sleep(1500);
    if (!(await page.evaluate(() => document.body.classList.contains('ag2-insp-open')))) await toggle(T, page);
    out.noNotesCollapsed = await notesSt(page);
    await shot(T, page, 'insp-nonotes-collapsed');
    await page.click('#ag2-insp-links [data-ag2-act="notes"]').catch(() => {});
    await T.sleep(600);
    out.noNotesExpanded = await notesSt(page);
    await shot(T, page, 'insp-nonotes-expanded');
    out.errors = T.errors(page);
    out.ok = !out.charCollapsed.sfVis && !out.group.sfVis && !out.noNotesCollapsed.sfVis;
    return out;
}

// ---------------------------------------------------------------- popups: open each ST popup, measure it
const popSt = page => page.evaluate(() => {
    const vis = el => { if (!el) return false; const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden') return false; const q = el.getBoundingClientRect(); return q.width > 0.5 && q.height > 0.5; };
    const cs = el => { if (!el) return null; const c = getComputedStyle(el); const q = el.getBoundingClientRect(); return { box: [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)], bg: c.backgroundColor, bgImage: c.backgroundImage.slice(0, 30), radius: c.borderRadius, border: c.borderTopWidth + ' ' + c.borderTopColor, shadow: c.boxShadow.slice(0, 60), backdrop: (c.backdropFilter || c.webkitBackdropFilter || 'none').slice(0, 40), padding: c.padding }; };
    const dlg = document.querySelector('dialog.popup[open]');
    const btns = dlg ? [...dlg.querySelectorAll('.popup-controls .menu_button, .popup-button-close')].filter(vis).map(b => ({ t: b.textContent.trim().slice(0, 14), cls: b.className.slice(0, 50), bg: getComputedStyle(b).backgroundColor, radius: getComputedStyle(b).borderRadius })) : [];
    return {
        dlgOpen: !!dlg, dlg: cs(dlg),
        body: cs(document.querySelector('dialog.popup .popup-body')),
        header: document.querySelector('dialog.popup .popup-header')?.textContent?.trim().slice(0, 40),
        h3: document.querySelector('dialog.popup .popup-content h3')?.textContent?.trim().slice(0, 40),
        hasMultiline: !!document.querySelector('dialog.popup .multiline'),
        hasPersonaList: !!document.querySelector('dialog.popup .persona-list'),
        btns,
        // legacy
        shadowPopup: vis(document.getElementById('shadow_popup')), dialogueVisible: vis(document.getElementById('dialogue_popup')),
        dlgPopup: cs(document.getElementById('dialogue_popup')),
        charPopup: vis(document.getElementById('character_popup')), charPopupCS: cs(document.getElementById('character_popup')),
        charPopupDrawers: [...document.querySelectorAll('#character_popup .inline-drawer-header')].map(h => { const c = getComputedStyle(h); const h4 = h.querySelector('h4'); return { text: (h4?.textContent || '').trim().slice(0, 30), bg: c.backgroundColor, bgImage: c.backgroundImage.slice(0, 30), radius: c.borderRadius, border: c.borderTopWidth + ' ' + c.borderTopColor }; }),
        selChatPopup: vis(document.getElementById('shadow_select_chat_popup')), selChatCS: cs(document.getElementById('select_chat_popup')),
        // toastr
        toast: [...document.querySelectorAll('#toast-container > div')].map(t => { const c = getComputedStyle(t); const q = t.getBoundingClientRect(); return { box: [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)], bg: c.backgroundColor, radius: c.borderRadius, color: c.color }; }),
        toastContainerCls: document.getElementById('toast-container')?.className || null,
    };
});

async function popups(T) {
    const out = {};
    const { page } = await enter(T);
    await toggle(T, page);
    // 1. persona connections (modern dialog.popup)
    await page.click('#ag2-insp-links [data-ag2-act="persona"]'); await T.sleep(900);
    out.persona = await popSt(page);
    await shot(T, page, 'popup-persona');
    await page.keyboard.press('Escape'); await T.sleep(600);
    out.personaClosed = await page.evaluate(() => !document.querySelector('dialog.popup[open]'));
    // 2. advanced definitions (#character_popup)
    await page.click('#ag2-insp-links [data-ag2-act="adv"]'); await T.sleep(900);
    out.adv = await popSt(page);
    await shot(T, page, 'popup-adv');
    await page.keyboard.press('Escape'); await T.sleep(600);
    out.advClosed = await page.evaluate(() => { const e = document.getElementById('character_popup'); return !e || getComputedStyle(e).display === 'none'; });
    // 3. switch chat file popup (#shadow_select_chat_popup) via ST's own menu entry
    //    (on phones the title opens the inspector, so drive ST's option directly)
    await page.evaluate(() => document.querySelector('#option_select_chat')?.click()); await T.sleep(1600);
    out.select = await popSt(page);
    await shot(T, page, 'popup-selectchat');
    await page.evaluate(() => document.getElementById('select_chat_cross')?.click()); await T.sleep(900);
    out.selectClosed = await page.evaluate(() => { const e = document.getElementById('shadow_select_chat_popup'); return !e || getComputedStyle(e).display === 'none'; });
    // 4. legacy #shadow_popup > #dialogue_popup via ST's own callPopup (real flow)
    const usedCallPopup = await page.evaluate(() => {
        const c = SillyTavern.getContext();
        if (typeof c.callPopup !== 'function') return false;
        c.callPopup('<h3 class="margin0">删除这条消息？</h3><p>此操作不可撤销。</p>', 'confirm');
        return true;
    });
    if (!usedCallPopup) {
        await page.evaluate(() => {
            document.getElementById('dialogue_popup_text').innerHTML = '<h3 class="margin0">删除这条消息？</h3><p>此操作不可撤销。</p>';
            document.getElementById('shadow_popup').style.display = 'block';
            document.getElementById('shadow_popup').style.opacity = '1';
            const dp = document.getElementById('dialogue_popup');
            dp.style.display = 'flex'; dp.style.opacity = '1';
        });
    }
    await T.sleep(600);
    out.dialogueViaCallPopup = usedCallPopup;
    out.dialogue = await popSt(page);
    await shot(T, page, 'popup-dialogue');
    await page.evaluate(() => { document.getElementById('dialogue_popup_cancel')?.click(); document.getElementById('shadow_popup').style.display = 'none'; document.getElementById('dialogue_popup').style.display = 'none'; });
    await T.sleep(400);
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- toast: ST toastr
async function toast(T) {
    const out = {};
    const { page } = await enter(T);
    await page.evaluate(() => { toastr.success('设置已保存', '成功'); toastr.error('连接失败', '错误'); toastr.info('这是一条信息', '提示'); });
    await T.sleep(500);
    out.shown = await popSt(page);
    await shot(T, page, 'toastr');
    await T.sleep(4500);
    out.gone = await page.evaluate(() => document.querySelectorAll('#toast-container > div').length);
    // in-dialog toast: ST moves #toast-container into the open dialog → must be opaque (§18a)
    await toggle(T, page);
    await page.click('#ag2-insp-links [data-ag2-act="persona"]'); await T.sleep(700);
    await page.evaluate(() => toastr.info('弹窗内提示', '测试'));
    await T.sleep(400);
    out.inDialog = await page.evaluate(() => {
        const c = document.getElementById('toast-container');
        const t = c?.querySelector('.toast');
        const dlg = document.querySelector('dialog.popup[open]');
        return { inDialog: !!dlg && dlg.contains(c), backdrop: t ? (getComputedStyle(t).backdropFilter || getComputedStyle(t).webkitBackdropFilter) : null, bg: t ? getComputedStyle(t).backgroundColor : null };
    });
    await shot(T, page, 'toast-in-dialog');
    await page.keyboard.press('Escape'); await T.sleep(500);
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- func: controls inside the popups still work
async function func(T) {
    const out = {};
    const { page } = await enter(T);
    await toggle(T, page);
    // advanced definitions: a drawer toggles and an input is editable
    await page.click('#ag2-insp-links [data-ag2-act="adv"]'); await T.sleep(800);
    out.advOpen = await page.evaluate(() => getComputedStyle(document.getElementById('character_popup')).display !== 'none');
    const drawerBox = await page.evaluate(() => { const h = document.querySelector('#character_popup .inline-drawer-header'); if (!h) return null; const q = h.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; });
    if (drawerBox) { await page.mouse.click(drawerBox[0], drawerBox[1]); await T.sleep(500); }
    out.advDrawerOpened = await page.evaluate(() => { const d = document.querySelector('#character_popup .inline-drawer'); const c = d?.querySelector('.inline-drawer-content'); return !!c && getComputedStyle(c).display !== 'none'; });
    out.advInputEditable = await page.evaluate(() => { const t = document.querySelector('#character_popup textarea#personality_textarea'); return !!t && !t.readOnly && !t.disabled; });
    await page.evaluate(() => document.getElementById('character_cross')?.click()); await T.sleep(700);
    out.advClosed = await page.evaluate(() => getComputedStyle(document.getElementById('character_popup')).display === 'none');
    // persona popup: OK button closes it (confirm flow)
    await page.click('#ag2-insp-links [data-ag2-act="persona"]'); await T.sleep(800);
    out.personaOpen = await page.evaluate(() => !!document.querySelector('dialog.popup[open]'));
    out.personaAvatars = await page.evaluate(() => document.querySelectorAll('dialog.popup[open] .persona-list .avatar').length);
    await page.evaluate(() => document.querySelector('dialog.popup[open] .popup-button-ok')?.click()); await T.sleep(800);
    out.personaOkClosed = await page.evaluate(() => !document.querySelector('dialog.popup[open]'));
    out.errors = T.errors(page);
    out.ok = out.advOpen && out.advDrawerOpened && out.advInputEditable && out.advClosed && out.personaOpen && out.personaOkClosed;
    return out;
}

export default async function (T) {
    const parts = { insp, popups, toast, func };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    await T.save('r2b-' + part, r);
    return r;
}
