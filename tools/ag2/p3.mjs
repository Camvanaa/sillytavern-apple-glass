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


const clickRow = async (page, text) => { await page.locator('#ag2-sidebar .ag2-chat-row', { hasText: text }).first().click(); };
const waitChar = (page, name) => page.waitForFunction(n => SillyTavern.getContext().name2 === n && document.querySelectorAll('#chat .mes').length > 1, name, { timeout: 30000, polling: 100 });
const shortScan = s => ({ ovf: s.ovf, dbl: s.dbl, unhid: s.unhid, nest: s.nest, btn: s.btn, doc: s.doc?.ok, scrollY: s.scrollY, blurVis: s.blurVis, ...(s.ovf + s.dbl + s.unhid + s.nest + s.btn ? { detail: s.detail } : {}) });

/** In-page watcher: every frame, a visible editor must belong to the open chat's character. */
const startWatch = page => page.evaluate(() => {
    window.__p3w = { frames: 0, bad: [], views: {} };
    const vis = el => !!el && el.getClientRects().length > 0;
    const tick = () => {
        const w = window.__p3w; if (!w || w.stop) return;
        w.frames++;
        const p = document.getElementById('right-nav-panel');
        const c = SillyTavern.getContext();
        const cur = c.characterId !== undefined ? c.characters[c.characterId] : null;
        const pole = document.getElementById('avatar_url_pole')?.value;
        const formShown = vis(document.getElementById('descriptionWrapper')) || vis(document.getElementById('ag2-insp-hero'));
        const v = p.dataset.ag2Insp || '-'; w.views[v] = (w.views[v] || 0) + 1;
        const hero = document.getElementById('ag2-insp-name')?.textContent;
        if (formShown && (!cur || cur.avatar !== pole || (hero && hero !== cur.name))) w.bad.push({ f: w.frames, cur: cur?.name, pole, hero, v });
        const gShown = vis(document.getElementById('rm_group_chats_block'));
        if (gShown && p.dataset.menuType === 'group_edit' && !c.groupId) w.bad.push({ f: w.frames, g: 'group form without group chat' });
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
});
const stopWatch = page => page.evaluate(() => { const w = window.__p3w; w.stop = true; return { frames: w.frames, bad: w.bad.slice(0, 5), nBad: w.bad.length, views: w.views }; });

// ---------------------------------------------------------------- shots (+ scans) at the current width
async function shots(T) {
    const w = T.cfg.w;
    const { page } = await enter(T);
    const out = { w };
    await toggle(T, page);
    out.char = await st(page);
    out.charScan = shortScan(await T.scan(page, ['#right-nav-panel', '#right-nav-panel .scrollableInner']));
    await T.shot(page, `insp-char-${w}`);
    await page.click('#ag2-insp-head [data-seg="chat"]'); await T.sleep(400);
    out.chat = await st(page);
    out.chatScan = shortScan(await T.scan(page, ['#right-nav-panel']));
    await T.shot(page, `insp-chat-${w}`);
    await page.click('#ag2-insp-head [data-seg="main"]'); await T.sleep(300);
    // group
    await clickRow(page, '旅途同伴'); await T.sleep(2500);
    out.group = await st(page);
    out.groupScan = shortScan(await T.scan(page, ['#right-nav-panel', '#right-nav-panel .scrollableInner']));
    await T.shot(page, `insp-group-${w}`);
    // closed
    await toggle(T, page);
    out.closed = await st(page);
    out.closedScan = shortScan(await T.scan(page));
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- edit: description autosave targets the right card
async function edit(T) {
    const bodies = [];
    const { page } = await enter(T, { before: async pg => {
        await pg.route('**/api/characters/edit', r => {
            const body = r.request().postData() || '';
            const field = n => { const m = body.match(new RegExp('name="' + n + '"\\r?\\n\\r?\\n([\\s\\S]*?)\\r?\\n--')); return m ? m[1] : null; };
            bodies.push({ avatar_url: field('avatar_url'), ch_name: field('ch_name'), description: (field('description') || '').slice(-30) });
            return r.fallback();
        });
    } });
    const out = {};
    await toggle(T, page);
    out.before = await st(page);
    await page.click('#ag2-insp-desc-head [data-ag2-act="edit"]'); await T.sleep(300);
    out.editing = await page.evaluate(() => ({ ta: !!document.getElementById('description_textarea').getClientRects().length, focus: document.activeElement?.id, label: document.querySelector('#ag2-insp-desc-head [data-ag2-act="edit"]').textContent }));
    await T.shot(page, `insp-edit-${T.cfg.w}`);
    await page.keyboard.press('End');
    await page.keyboard.type(' [P3-aldric]');
    await T.sleep(2500);
    out.saves1 = bodies.splice(0);
    await page.click('#ag2-insp-desc-head [data-ag2-act="edit"]'); await T.sleep(300);
    out.afterDone = await st(page);
    // switch to Mira with the inspector open, edit there
    await clickRow(page, '图书管理员 Mira'); await waitChar(page, '图书管理员 Mira'); await T.sleep(1200);
    out.mira = await st(page);
    out.saves2a = bodies.splice(0); // switching may autosave nothing
    await page.click('#ag2-insp-desc-head [data-ag2-act="edit"]'); await T.sleep(300);
    await page.keyboard.press('End');
    await page.keyboard.type(' [P3-mira]');
    await T.sleep(2500);
    out.saves2 = bodies.splice(0);
    out.ok = out.saves1.length > 0 && out.saves1.every(b => b.avatar_url === AV.aldric && b.description.includes('[P3-aldric]'))
        && out.saves2.length > 0 && out.saves2.every(b => b.avatar_url === AV.mira && b.description.includes('[P3-mira]') && !b.description.includes('aldric'));
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- switch: no stale editor while switching
async function sw(T) {
    const { page } = await enter(T);
    await toggle(T, page);
    const out = { steps: [] };
    const seq = [['图书管理员 Mira', 'char'], ['星港领航员 Kael', 'char'], ['旅途同伴', 'group'], ['Seraphina', 'char'], ['旅店老板 Aldric', 'char']];
    for (const [name, kind] of seq) {
        await startWatch(page);
        await clickRow(page, name);
        let err = null;
        try {
            if (kind === 'char') await waitChar(page, name); else await page.waitForFunction(() => !!SillyTavern.getContext().groupId, null, { timeout: 30000 });
        } catch (e) { err = await page.evaluate(() => ({ name2: SillyTavern.getContext().name2, n: document.querySelectorAll('#chat .mes').length, rows: [...document.querySelectorAll('#ag2-sidebar .ag2-chat-row .ag2-row-name')].map(x => x.textContent).slice(0, 12) })); }
        await T.sleep(1500);
        const w = await stopWatch(page);
        const s = await st(page);
        out.steps.push({ err, to: name, view: s.view, hero: s.heroName, chatChar: s.chatChar, pole: s.pole, groupVis: s.groupVis, formVis: s.formVis, watch: w,
            ok: w.nBad === 0 && (kind === 'char' ? (s.view === 'char' && s.heroName === name && s.formVis && !s.groupVis) : (s.view === 'group' && s.groupVis && !s.formVis)) });
    }
    // seg = chat persists across switches; then close chat → empty
    await page.click('#ag2-insp-head [data-seg="chat"]'); await T.sleep(300);
    await clickRow(page, '图书管理员 Mira'); await waitChar(page, '图书管理员 Mira'); await T.sleep(1000);
    out.chatSeg = await page.evaluate(() => ({ view: document.getElementById('right-nav-panel').dataset.ag2Insp, file: document.querySelector('#ag2-insp-chat .ag2-insp-v')?.textContent }));
    await page.click('#ag2-insp-head [data-seg="main"]'); await T.sleep(300);
    await page.click('#ag2-title [data-act="title"]'); await T.sleep(300);
    await page.click('.ag2-menu [data-item="close"]'); await T.sleep(2000);
    out.closedChat = await st(page);
    await T.shot(page, `insp-empty-${T.cfg.w}`);
    out.ok = out.steps.every(x => x.ok) && out.closedChat.view === 'empty' && !out.closedChat.formVis && out.chatSeg.view === 'chat';
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- group: member add / remove UI (writes stubbed)
async function group(T) {
    const { page } = await enter(T);
    await clickRow(page, '旅途同伴');
    await page.waitForFunction(() => !!SillyTavern.getContext().groupId && document.querySelectorAll('#chat .mes').length > 1, null, { timeout: 30000 });
    await T.sleep(1200);
    await toggle(T, page);
    const out = { s: await st(page) };
    out.members = await page.evaluate(() => [...document.querySelectorAll('#rm_group_members .group_member')].map(m => m.querySelector('.ch_name')?.textContent?.trim()));
    out.addable = await page.evaluate(() => [...document.querySelectorAll('#rm_group_add_members .group_member')].map(m => m.querySelector('.ch_name')?.textContent?.trim()));
    await T.shot(page, `insp-group-members-${T.cfg.w}`);
    out.scan = shortScan(await T.scan(page, ['#right-nav-panel', '#right-nav-panel .scrollableInner']));
    // scroll to the add list and screenshot it; click “add” on one (in memory: /api/groups/edit is stubbed)
    // ST's “添加成员” drawer starts collapsed: open it the way a user would
    if (await page.evaluate(() => getComputedStyle(document.querySelector('#groupAddMemberListToggle + .inline-drawer-content')).display === 'none')) await page.click('#groupAddMemberListToggle', { timeout: 5000 }).catch(e => { out.addClickErr = String(e).slice(0, 80); });
    await T.sleep(500);
    out.addable = await page.evaluate(() => [...document.querySelectorAll('#rm_group_add_members .group_member')].map(m => m.querySelector('.ch_name')?.textContent?.trim()));
    out.addScan = shortScan(await T.scan(page, ['#right-nav-panel', '#right-nav-panel .scrollableInner']));
    await page.evaluate(() => document.getElementById('rm_group_add_members')?.scrollIntoView({ block: 'center' }));
    await T.sleep(400);
    await T.shot(page, `insp-group-add-${T.cfg.w}`);
    out.ok = out.s.view === 'group' && out.s.groupVis && out.members.length >= 2;
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- chat page: AN / CFG / Logprobs float left of the inspector
async function chat(T) {
    const { page } = await enter(T);
    await toggle(T, page);
    await page.click('#ag2-insp-head [data-seg="chat"]'); await T.sleep(400);
    const out = { rows: await page.evaluate(() => [...document.querySelectorAll('#ag2-insp-chat .ag2-insp-kv')].map(r => r.textContent.trim().slice(0, 50))) };
    const r = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length || getComputedStyle(e).display === 'none') return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; }, sel);
    const insp = await r('#right-nav-panel');
    out.panels = {};
    for (const [act, sel] of [['an', '#floatingPrompt'], ['cfg', '#cfgConfig'], ['logprobs', '#logprobsViewer']]) {
        await page.click(`#ag2-insp-chat [data-ag2-act="${act}"]`); await T.sleep(900);
        const box = await r(sel);
        out.panels[act] = { box, leftOfInsp: !!box && box[0] + box[2] <= insp[0] + 1, inView: !!box && box[0] >= 0 && box[1] >= 0 && box[1] + box[3] <= 900 };
        if (act === 'an') { await T.shot(page, `insp-an-${T.cfg.w}`); out.anScan = shortScan(await T.scan(page, ['#floatingPrompt'])); }
        await page.click(`#ag2-insp-chat [data-ag2-act="${act}"]`); await T.sleep(700); // toggle closed again
        out.panels[act].closed = !(await r(sel));
    }
    out.ok = Object.values(out.panels).every(p => p.box && p.leftOfInsp && p.inView && p.closed);
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- title menu + 更多 menu + quick actions wiring
async function title(T) {
    const { page } = await enter(T);
    const items = async () => { await page.click('#ag2-title [data-act="title"]'); await T.sleep(300); const r = await page.evaluate(() => [...document.querySelectorAll('.ag2-menu .ag2-menu-item')].map(b => b.dataset.item)); await page.keyboard.press('Escape'); await T.sleep(200); return r; };
    const out = {};
    out.main = await items();
    await T.shot(page, `title-menu-${T.cfg.w}`, {});
    await page.evaluate(() => { SillyTavern.getContext().chatMetadata.main_chat = 'P3 主线（内存）'; });
    out.branch = await items();
    await page.evaluate(() => { delete SillyTavern.getContext().chatMetadata.main_chat; });
    // checkpoint click → ST's own handler (save is stubbed); capture the chats/save request name
    const saved = [];
    page.on('request', rq => { if (/\/api\/chats\/save/.test(rq.url())) { try { saved.push(JSON.parse(rq.postData() || '{}').file_name); } catch { saved.push('?'); } } });
    await page.click('#ag2-title [data-act="title"]'); await T.sleep(300);
    await page.click('.ag2-menu [data-item="checkpoint"]'); await T.sleep(1500);
    out.checkpointPopup = await page.evaluate(() => !!document.querySelector('dialog[open], .popup[open]'));
    if (out.checkpointPopup) { await page.keyboard.press('Escape'); await T.sleep(400); }
    out.saved = saved.slice(0, 3);
    // inspector: 更多 menu above the panel
    await toggle(T, page);
    await page.click('#ag2-insp-actions [data-ag2-act="more"]'); await T.sleep(300);
    out.more = await page.evaluate(() => {
        const m = document.getElementById('ag2-insp-more'); if (!m) return null;
        const q = m.getBoundingClientRect();
        const top = document.elementFromPoint(q.x + q.width / 2, q.y + 20);
        return { inLayer: m.parentElement?.id, onTop: m.contains(top), n: m.querySelectorAll('.ag2-menu-item').length, labels: [...m.querySelectorAll('.ag2-menu-label')].map(x => x.textContent) };
    });
    await T.shot(page, `insp-more-${T.cfg.w}`);
    await page.keyboard.press('Escape'); await T.sleep(200);
    // group chat: convert hidden
    await clickRow(page, '旅途同伴'); await T.sleep(2500);
    out.group = await items();
    out.ok = out.main.includes('checkpoint') && out.main.includes('group') && !out.main.includes('main')
        && out.branch.includes('main') && !out.group.includes('group') && out.more?.onTop;
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- state: ag2.inspector survives reloads; NavLockOn untouched
async function state(T) {
    const { page } = await enter(T);
    const out = {};
    out.navLockBefore = await page.evaluate(() => SillyTavern.getContext().accountStorage?.getItem?.('NavLockOn') ?? null);
    await toggle(T, page);
    out.opened = await st(page);
    await page.reload(); await page.waitForFunction(() => document.body.classList.contains('ag2-ready'), null, { timeout: 60000 }); await T.sleep(3500);
    out.afterReloadOpen = await st(page); // may be the welcome page (no chat) → empty state
    if (!(await page.evaluate(() => SillyTavern.getContext().characterId !== undefined))) await T.openChat(page, await T.longChat(page), 2);
    await T.sleep(1200);
    out.afterReloadChat = await st(page);
    await page.click('#ag2-insp-head [data-ag2-act="close"]'); await T.sleep(700);
    out.closed = await st(page);
    await page.reload(); await page.waitForFunction(() => document.body.classList.contains('ag2-ready'), null, { timeout: 60000 }); await T.sleep(3500);
    out.afterReloadClosed = await st(page);
    out.navLockAfter = await page.evaluate(() => SillyTavern.getContext().accountStorage?.getItem?.('NavLockOn') ?? null);
    out.loadedModule = await page.evaluate(() => performance.getEntriesByType('resource').some(e => /shell\/inspector\.js/.test(e.name)));
    out.ok = out.opened.open && out.afterReloadOpen.open && ['char', 'empty'].includes(out.afterReloadOpen.view) && out.afterReloadChat.view === 'char' && !out.closed.open && !out.afterReloadClosed.open && !out.afterReloadClosed.drawer && out.navLockBefore === out.navLockAfter;
    out.errors = T.errors(page);
    return out;
}

// ---------------------------------------------------------------- create: sidebar 新建角色 opens ST's fresh form in the inspector
async function create(T) {
    const { page } = await enter(T);
    await page.click('#ag2-sidebar [data-act="new"]'); await T.sleep(300);
    await page.locator('.ag2-menu .ag2-menu-item', { hasText: '新建角色' }).click(); await T.sleep(1200);
    const out = { s: await st(page) };
    out.nameField = await page.evaluate(() => { const e = document.getElementById('character_name_pole'); return { vis: !!e?.getClientRects().length, val: e?.value }; });
    await T.shot(page, `insp-create-${T.cfg.w}`);
    out.scan = shortScan(await T.scan(page, ['#right-nav-panel']));
    out.ok = out.s.open && out.s.view === 'create' && out.nameField.vis && out.nameField.val === '';
    out.errors = T.errors(page);
    return out;
}

export default async function (T) {
    const parts = { dev, shots, edit, switch: sw, group, chat, title, state, create };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    await T.save('p3-' + part, r);
    return r;
}
