// tools/ag2/r3a.mjs — R3a: phone ⋯/× toggle + smallSysMes (storyline receipt) redesign.
//   node tools/ag2/run.mjs tools/ag2/r3a.mjs --phase R3a --part more|small|variants|func
//        [--phone] [--mem] [--tag x]
// parts:
//   more      task 1 — phone ⋯→× toggle: open / re-tap / outside / item / Esc / page switch /
//             5 rapid taps; desktop title menu unaffected.
//   small     task 2 — /sendas|/sys|/comment compact messages: geometry + scan per chat style.
//   variants  A/B/C screenshots (desk + phone) for the user to pick.
//   func      task 2 — edit / delete / copy / action-row / long text / <details> survive.
// Writes are stubbed (run.mjs); /sendas etc. only touch the in-memory chat.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const has = n => process.argv.includes('--' + n);
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const part = arg('part', 'more');
const MEM = has('mem');
const TAG = arg('tag', '');
const isPhone = () => process.argv.includes('--phone');
const SHOTROOT = '/opt/server-agent/workspace/st-testdata/redesign/real/R3a';
const NAME = 'Ny规则定下的走向';

async function enter(T, opt = {}) {
    const page = await T.newPage({ phone: isPhone(), ...(opt.page || {}) });
    await T.prepare(page, { ...(MEM ? { theme: 'ag2' } : {}), ...(opt.prep || {}) });
    const b = await T.boot(page, { ag2: true, settle: opt.settle ?? 2000 });
    if (!opt.noChat) { await T.openChat(page, opt.spec || await T.longChat(page), opt.minMes ?? 2); await T.sleep(500); }
    return { page, boot: b };
}

/** Create a compact system message through ST's own slash engine (in-memory only). */
const sendas = (page, cmd) => page.evaluate(c => SillyTavern.getContext().executeSlashCommandsWithOptions(c), cmd);
const idle = page => page.waitForFunction(() => {
    const s = document.querySelector('#send_but'), st = document.querySelector('#mes_stop');
    return s && getComputedStyle(s).display !== 'none' && (!st || getComputedStyle(st).display === 'none');
}, null, { timeout: 30000, polling: 100 });

/** Facts about every .smallSysMes on screen (small, DOM-only). */
const sySt = page => page.evaluate(() => {
    const vis = el => { if (!el) return false; const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden') return false; const q = el.getBoundingClientRect(); return q.width > 0.5 && q.height > 0.5; };
    const box = el => { if (!el) return null; const q = el.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)]; };
    const cs = el => { if (!el) return null; const c = getComputedStyle(el); return { bg: c.backgroundColor, radius: c.borderRadius, align: c.textAlign, display: c.display, color: c.color, fs: c.fontSize }; };
    const chat = document.getElementById('chat');
    return [...chat.querySelectorAll('.mes.smallSysMes')].map(el => {
        const r = el.getBoundingClientRect();
        const chn = el.querySelector('.ch_name > :first-child');
        const txt = el.querySelector('.mes_text');
        const block = el.querySelector('.mes_block');
        const glyph = block ? getComputedStyle(block, '::before') : null;
        return {
            mesid: el.getAttribute('mesid'),
            type: el.getAttribute('type'),
            ch_name: el.getAttribute('ch_name'),
            box: box(block), mesBox: box(el), text: el.querySelector('.mes_text')?.innerText?.slice(0, 40),
            inChat: (() => { const c = chat.getBoundingClientRect(), q = block.getBoundingClientRect(); return q.left >= c.left - 0.5 && q.right <= c.right + 0.5; })(),
            btnsOpacity: getComputedStyle(el.querySelector('.mes_buttons')).opacity,
            avatarVis: vis(el.querySelector('.mesAvatarWrapper > .avatar')),
            chNameVis: vis(chn), chNameBox: box(chn), chNameText: el.querySelector('.name_text')?.textContent?.trim(),
            nameStyle: cs(el.querySelector('.name_text')),
            textVis: vis(txt), textBox: box(txt), textStyle: cs(txt),
            glyphMask: glyph ? (glyph.maskImage || glyph.webkitMaskImage || 'none').slice(0, 16) : null,
            glyphMaskFull: glyph ? (glyph.maskImage || glyph.webkitMaskImage || 'none').length : 0,
            glyphBg: glyph ? glyph.backgroundColor : null,
            sw: block.scrollWidth, cw: block.clientWidth, overflowX: block.scrollWidth > block.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1,
            inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
            swipeVis: [...el.querySelectorAll('.swipe_left,.swipe_right,.swipes-counter')].some(vis),
            textSW: txt?.scrollWidth ?? 0, textCW: txt?.clientWidth ?? 0,
        };
    });
});
const moreSt = page => page.evaluate(() => {
    const b = document.getElementById('ag2-ph-more');
    const svg = b?.querySelector('svg');
    const html = svg ? svg.innerHTML : '';
    const menu = document.querySelector('.ag2-menu');
    return {
        found: !!b, vis: !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0,
        icon: /circle/.test(html) ? 'ellipsis' : (/M18 6/.test(html) ? 'x' : '?'),
        ariaLabel: b?.getAttribute('aria-label'), ariaExpanded: b?.getAttribute('aria-expanded'),
        title: b?.getAttribute('title'),
        menuOpen: !!menu, menuItems: menu ? menu.querySelectorAll('.ag2-menu-item').length : 0,
        anim: svg ? getComputedStyle(svg).animationName + ' ' + getComputedStyle(svg).animationDuration : null,
    };
});

// ------------------------------------------------------------------ task 1: ⋯ → ×
async function more(T) {
    const out = {};
    const { page } = await enter(T, {});
    const spec = await T.longChat(page);
    // ensure chat page
    if (!(await page.evaluate(() => document.body.dataset.ag2Ph === 'chat'))) {
        await page.evaluate(() => { /* stay */ });
    }
    await T.sleep(600);
    out.initial = await moreSt(page);
    await T.shot(page, `${TAG}more-00-initial`);
    // tap ⋯ → open, icon ×
    await page.tap('#ag2-ph-more'); await T.sleep(600);
    out.opened = await moreSt(page);
    await T.shot(page, `${TAG}more-01-open`);
    // tap again → close, icon ⋯
    await page.tap('#ag2-ph-more'); await T.sleep(600);
    out.reClosed = await moreSt(page);
    await T.shot(page, `${TAG}more-02-reclosed`);
    // open, then outside tap
    await page.tap('#ag2-ph-more'); await T.sleep(500);
    const o1 = await moreSt(page);
    // tap well away from the menu (anchored top-right); a fixed point below the chat top
    await page.mouse.click(24, 640); await T.sleep(600);
    out.outsideClose = { before: o1.icon, ...(await moreSt(page)) };
    // open, pick an item
    await page.tap('#ag2-ph-more'); await T.sleep(500);
    await page.locator('.ag2-menu .ag2-menu-item', { hasText: '搜索…' }).first().tap(); await T.sleep(900);
    out.itemClose = await moreSt(page);
    await page.keyboard.press('Escape'); await T.sleep(400); // close the palette
    // open, Esc
    await page.tap('#ag2-ph-more'); await T.sleep(500);
    const o2 = await moreSt(page);
    await page.keyboard.press('Escape'); await T.sleep(500);
    out.escClose = { before: o2.icon, ...(await moreSt(page)) };
    // open, then page switch (back to list)
    await page.tap('#ag2-ph-more'); await T.sleep(500);
    const o3 = await moreSt(page);
    await page.tap('#ag2-ph-back'); await T.sleep(800);
    out.pageClose = { before: o3.icon, ...(await moreSt(page)) };
    out.onList = await page.evaluate(() => ({ ph: document.body.dataset.ag2Ph, moreVis: getComputedStyle(document.getElementById('ag2-ph-more')).display !== 'none' }));
    // back to the chat
    await page.tap(`#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`); await T.sleep(2500);
    // 5 rapid taps: odd count → open, icon ×
    for (let i = 0; i < 5; i++) { await page.tap('#ag2-ph-more', { force: true }).catch(() => {}); await T.sleep(120); }
    await T.sleep(500);
    out.rapid5 = await moreSt(page);
    await T.shot(page, `${TAG}more-03-rapid5`);
    await page.keyboard.press('Escape'); await T.sleep(400);
    out.errors = T.errors(page);
    out.ok = out.initial.icon === 'ellipsis' && out.opened.icon === 'x' && out.opened.menuOpen
        && out.reClosed.icon === 'ellipsis' && !out.reClosed.menuOpen
        && out.outsideClose.icon === 'ellipsis' && !out.outsideClose.menuOpen
        && out.itemClose.icon === 'ellipsis' && !out.itemClose.menuOpen
        && out.escClose.icon === 'ellipsis' && !out.escClose.menuOpen
        && out.pageClose.icon === 'ellipsis' && !out.pageClose.menuOpen
        && out.rapid5.icon === 'x' && out.rapid5.menuOpen
        && (T.cfg.reduced ? parseFloat(out.opened.anim.split(' ')[1]) <= 0.00001 : /ag2-ph-more-in 0\.2s/.test(out.opened.anim));
    return out;
}

/** Desktop: the title-pill menu must be unaffected by the phone ⋯/× change. */
async function moreDesk(T) {
    const out = {};
    const { page } = await enter(T, {});
    const btn = '#ag2-title .ag2-title-btn';
    out.before = await page.evaluate(s => { const b = document.querySelector(s); return { exists: !!b, ariaExpanded: b?.getAttribute('aria-expanded') }; }, btn);
    await page.click(btn); await T.sleep(700);
    out.opened = await page.evaluate(() => ({ menuOpen: !!document.querySelector('.ag2-menu'), items: document.querySelectorAll('.ag2-menu .ag2-menu-item').length, ariaExpanded: document.querySelector('#ag2-title .ag2-title-btn')?.getAttribute('aria-expanded') }));
    await page.keyboard.press('Escape'); await T.sleep(500);
    out.closed = await page.evaluate(() => ({ menuOpen: !!document.querySelector('.ag2-menu'), ariaExpanded: document.querySelector('#ag2-title .ag2-title-btn')?.getAttribute('aria-expanded') }));
    out.moreHidden = await page.evaluate(() => { const b = document.getElementById('ag2-ph-more'); return !b || getComputedStyle(b).display === 'none'; });
    out.errors = T.errors(page);
    out.ok = out.opened.menuOpen && out.closed.menuOpen === false;
    return out;
}

// ------------------------------------------------------------------ task 2: receipt geometry + scan
const STYLES = ['阅读', '气泡', '文档', '回声', '低语', '涟漪', '轻声'];
async function small(T) {
    const out = {};
    const { page } = await enter(T, {});
    // three kinds of compact system messages
    await sendas(page, `/sendas name="${NAME}" compact=true ② 跟着老板去地窖看看那只旧箱子`);
    await T.sleep(500);
    await sendas(page, `/comment compact=true 这一段是作者对场景的旁注。`);
    await T.sleep(500);
    await sendas(page, `/sys compact=true 夜色渐深，远处的钟声敲了三下。`);
    await T.sleep(800);
    await idle(page);
    await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
    await T.sleep(400);
    out.types = await sySt(page);
    out.count = out.types.length;
    out.scan = await T.scan(page, ['#chat', '#form_sheld']);
    delete out.scan.detail;
    await T.shot(page, `${TAG}small-${isPhone() ? 'phone' : 'desk'}-0-read`);

    // per chat style
    out.styles = {};
    for (let v = 0; v <= 6; v++) {
        await page.evaluate(v => $('#chat_display').val(String(v)).trigger('change'), v);
        await T.sleep(800);
        await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
        await T.sleep(300);
        const sc = await T.scan(page, ['#chat', '#form_sheld']);
        const rows = await sySt(page);
        out.styles[`${v}·${STYLES[v]}`] = {
            body: await page.evaluate(() => [...document.body.classList].filter(c => /bubblechat|documentstyle|ap-chat/.test(c)).join(' ')),
            scan: { ovf: sc.ovf, dbl: sc.dbl, unhid: sc.unhid, nest: sc.nest, btn: sc.btn, doc: sc.doc.ok, scrollY: sc.scrollY },
            n: rows.length,
            overflowX: rows.filter(r => r.overflowX || !r.inChat).length,
            avatarVis: rows.filter(r => r.avatarVis).length,
            chNameVis: rows.filter(r => r.chNameVis).length,
            caption: rows.map(r => r.chNameText).filter(Boolean).slice(0, 1),
            lines: await page.evaluate(() => [...document.querySelectorAll('#chat .mes.smallSysMes')].filter(m => getComputedStyle(m, '::after').content !== 'none' && parseFloat(getComputedStyle(m, '::after').height) > 0).length),
            width: rows[0]?.box?.[2], height: rows[0]?.box?.[3], glyph: rows[0]?.glyphMask, glyphs: new Set(rows.map(r => r.glyphMaskFull)).size,
        };
        await T.shot(page, `${TAG}small-${isPhone() ? 'phone' : 'desk'}-style${v}`);
    }
    await page.evaluate(() => $('#chat_display').val('0').trigger('change'));
    out.errors = T.errors(page);
    out.ok = out.count === 3 && Object.values(out.styles).every(s => s.overflowX === 0 && s.scan.ovf === 0 && s.scan.unhid === 0 && s.avatarVis === 0 && s.chNameVis === 0 && s.lines === 3 && s.glyphs === 3 && s.scan.dbl + s.scan.nest + s.scan.btn === 0);
    return out;
}

// ------------------------------------------------------------------ variants A/B/C screenshots
// NOTE: since the user picked C (now shipped), the A/B shots of this part are historical (real/R3a/variant-*.png).
// A = shipped §5.3c. B / C = tools/ag2/r3a-variants/{B,C}.css, the exact blocks the main session
// would append after §5.3c (4 ids, so they beat A wherever they are loaded from).
const VARIANT = k => readFileSync(new URL(`./r3a-variants/${k}.css`, import.meta.url), 'utf8');

async function variants(T) {
    throw new Error('Historical A/B/C comparison: use archived real/R3a/variant-*.png. Current C interaction: r3a-c.mjs.');
    const out = {};
    const { page } = await enter(T, {});
    await sendas(page, `/sendas name="${NAME}" compact=true ② 跟着老板去地窖看看那只旧箱子`);
    await T.sleep(400);
    await sendas(page, `/sendas name="${NAME}" compact=true ③ 留在客厅等老板回来`);
    // the user's case: a 60-CJK-character option — must wrap, not truncate
    await sendas(page, `/sendas name="${NAME}" compact=true ${'口'.repeat(60)}`);
    await T.sleep(700);
    await idle(page);
    // A: shipped
    await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
    await T.sleep(400);
    await shotVariant(T, page, 'A', isPhone() ? 'phone' : 'desk');
    // the shipped theme IS C now; B is injected as the appendable block it is
    out.shipped = await capsule(page);
    // B / C: the variant block replaces nothing, it is appended (a <style> at the end of <head>)
    for (const k of ['B', 'C']) {
        await page.evaluate(([k, c]) => { document.getElementById('ag2-r3a-var')?.remove(); const s = document.createElement('style'); s.id = 'ag2-r3a-var'; s.dataset.k = k; s.textContent = c; document.head.append(s); }, [k, VARIANT(k)]);
        await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
        await T.sleep(500);
        await shotVariant(T, page, k, isPhone() ? 'phone' : 'desk');
        out[k] = await capsule(page);
    }
    const sc = await T.scan(page, ['#chat']);
    out.scanC = { ovf: sc.ovf, dbl: sc.dbl, unhid: sc.unhid, nest: sc.nest, btn: sc.btn };
    out.errors = T.errors(page);
    out.ok = true;
    return out;
}

/** Capsule boxes of every small system message + whether they stay inside #chat. */
const capsule = page => page.evaluate(() => {
    const c = document.getElementById('chat').getBoundingClientRect();
    return [...document.querySelectorAll('#chat .mes.smallSysMes')].map(el => {
        const q = el.querySelector('.mes_block').getBoundingClientRect(), t = el.querySelector('.mes_text').getBoundingClientRect();
        return { box: [q.left, q.top, q.width, q.height].map(Math.round), text: [t.left, t.top, t.width, t.height].map(Math.round), inside: q.left >= c.left - 0.5 && q.right <= c.right + 0.5 && t.left >= c.left - 0.5 && t.right <= c.right + 0.5 };
    });
});
async function shotVariant(T, page, k, view) {
    const png = await T.shot(page, `variant-${k}-${view}${TAG ? '-' + TAG : ''}`);
    return png;
}

// ------------------------------------------------------------------ func: what must keep working
// long text / <details> + <pre> / ST's own note · hover bar · “更多” · copy · edit · delete · no swipe
async function func(T) {
    const out = {};
    const { page } = await enter(T, {});
    const view = isPhone() ? 'phone' : 'desk';
    const bottom = async () => { await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; }); await T.sleep(350); };
    await sendas(page, `/sendas name="${NAME}" compact=true ② 跟着老板去地窖看看那只旧箱子`);
    await sendas(page, `/sendas name="${NAME}" compact=true ` + '这是一段用来验证自动换行与不越界的较长文字，'.repeat(9) + 'Averyveryverylongunbrokenlatinwordtocheckoverflowwrappingbehaviourinsidethecapsule0123456789。');
    await sendas(page, `/sendas name="${NAME}" compact=true ${'口'.repeat(60)}`);
    await sendas(page, '/comment compact=true <details><summary>展开旁注</summary>折叠里的说明文字。</details>\n```\nconst pre = "代码块一行";\n```');
    await page.evaluate(() => SillyTavern.getContext().sendSystemMessage('assistant_note'));
    await T.sleep(900);
    await idle(page);
    await bottom();
    const rows = await sySt(page);
    out.rows = rows.map(r => ({ type: r.type, name: r.chNameText, box: r.box, inChat: r.inChat, overflowX: r.overflowX, textSW: r.textSW, textCW: r.textCW, swipeVis: r.swipeVis, avatarVis: r.avatarVis, btnsOpacity: r.btnsOpacity }));
    out.cont = await page.evaluate(() => [...document.querySelectorAll('#chat .mes.smallSysMes')].map(e => ({ cont: e.classList.contains('ag2-cont'), day: e.classList.contains('ag2-day'), caption: getComputedStyle(e.querySelector('.ch_name > :first-child')).display, mb: getComputedStyle(e).marginBottom, last: e.classList.contains('last_mes') })));
    const sc = await T.scan(page, ['#chat', '#form_sheld']);
    out.scan = { ovf: sc.ovf, dbl: sc.dbl, unhid: sc.unhid, nest: sc.nest, btn: sc.btn, doc: sc.doc.ok, chat: sc.panels['#chat'].ok, scrollY: sc.scrollY, detail: (sc.ovf + sc.dbl + sc.unhid + sc.nest + sc.btn) ? sc.detail : undefined };
    await T.shot(page, `${TAG}func-${view}-0-all`);
    // <details> opens, <pre> stays inside the capsule
    await page.evaluate(() => { const d = document.querySelector('#chat .mes.smallSysMes[type="comment"] details'); if (d) d.open = true; });
    await T.sleep(300);
    out.details = await page.evaluate(() => {
        const m = document.querySelector('#chat .mes.smallSysMes[type="comment"]'); const b = m.querySelector('.mes_block').getBoundingClientRect(); const pre = m.querySelector('pre')?.getBoundingClientRect();
        return { open: !!m.querySelector('details[open]'), pre: !!pre, preInside: !pre || (pre.left >= b.left && pre.right <= b.right + 0.5) };
    });

    // the long (60-CJK) receipt: truncated to one line with the 展开 hint; click expands,
    // click again collapses. (Variant C: a receipt is a post-choice echo, so one line is
    // right; the expand shows the full text on demand.)
    const longId = await page.evaluate(() => { const m = [...document.querySelectorAll('#chat .mes.smallSysMes')].find(m => m.querySelector('.mes_text')?.innerText.includes('口')); m?.scrollIntoView({ block: 'center' }); return m?.getAttribute('mesid'); });
    const L = `#chat .mes[mesid="${longId}"]`;
    // phone taps (a real touch keeps sticky :hover); desktop clicks.
    // On touch, tap through CDP at the element's centre: Playwright's tap re-checks hit
    // targets while re-scrolling, which drops the sticky :hover mid-flight and leaves the
    // bar's own pointer-events:none in the way (the bar itself works — verified via
    // elementFromPoint).
    const cdp = isPhone() ? await page.context().newCDPSession(page) : null;
    const tapAt = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await T.sleep(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
    const centre = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
    const press = async (sel, o) => {
        if (!isPhone()) return page.click(sel, o);
        // The bar's buttons: a touch here must keep the sticky :hover on .mes (the tap lands
        // inside it), or the bar would hide before ST's click handler runs. CDP touch alone
        // does not set it, so nudge the mouse there first — exactly what a real tap on a
        // hover-revealed bar does.
        await tapAt(...await centre(sel));
    };
    await T.sleep(300);
    out.long = await page.evaluate(sel => {
        const m = document.querySelector(sel), t = m.querySelector('.mes_text'), ts = getComputedStyle(t);
        const q = t.getBoundingClientRect();
        const lineH = parseFloat(ts.lineHeight) || 20;
        const hint = getComputedStyle(m.querySelector('.mes_block'), '::after');
        return { clamp: t.dataset.ag2Clamp, lines: Math.round(q.height / lineH), oneLine: q.height <= lineH * 1.5, hintShown: hint.content.includes('⌄'), cursor: ts.cursor, mesH: Math.round(m.getBoundingClientRect().height), overflowX: m.scrollWidth > m.clientWidth + 1 };
    }, L);
    await T.shot(page, `${TAG}func-${view}-5-long-collapsed`);
    await press(L + ' .mes_text');
    await T.sleep(500);
    out.longOpen = await page.evaluate(sel => {
        const m = document.querySelector(sel), t = m.querySelector('.mes_text'), ts = getComputedStyle(t);
        const q = t.getBoundingClientRect(); const lineH = parseFloat(ts.lineHeight) || 20;
        const full = t.innerText;   // line-clamp keeps the full text in the DOM
        return { open: m.classList.contains('ag2-ssb-open'), clamp: t.dataset.ag2Clamp, lines: Math.round(q.height / lineH), multi: q.height > lineH * 1.5, hint: getComputedStyle(m.querySelector('.mes_block'), '::after').content.includes('⌃'), full: full.length, hasAll: full.replace(/\s/g, '').includes('口'.repeat(50)), inChat: (() => { const c = document.getElementById('chat').getBoundingClientRect(); const k = m.getBoundingClientRect(); return k.left >= c.left - 0.5 && k.right <= c.right + 0.5; })(), overflowX: m.scrollWidth > m.clientWidth + 1 };
    }, L);
    await T.shot(page, `${TAG}func-${view}-6-long-open`);
    await press(L + ' .mes_text');
    await T.sleep(400);
    out.longClosed = await page.evaluate(sel => { const m = document.querySelector(sel), t = m.querySelector('.mes_text'), q = t.getBoundingClientRect(); const lineH = parseFloat(getComputedStyle(t).lineHeight) || 20; return { open: m.classList.contains('ag2-ssb-open'), oneLine: q.height <= lineH * 1.5 }; }, L);
    // leave the long receipt collapsed AND the chat back at the bottom: the bar test below
    // picks the FIRST receipt, which must not sit under the composer (phone) when expanded
    await bottom();

    // the first receipt: scroll it to the middle, hover (desktop) / tap (phone) → the bar
    const id = await page.evaluate(() => { const m = document.querySelector('#chat .mes.smallSysMes'); m.scrollIntoView({ block: 'center' }); return m.getAttribute('mesid'); });
    await T.sleep(400);
    const M = `#chat .mes[mesid="${id}"]`;
    // the bar shows on hover (desktop) / after a tap on the capsule (touch: sticky :hover). Scroll
    // the receipt to the middle first: Playwright's scroll-into-view would drop the hover.
    const reveal = async () => {
        await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), M);
        await T.sleep(250);
        if (isPhone()) await page.tap(M + ' .mes_text'); else await page.hover(M + ' .mes_text');
        await T.sleep(300);
    };
    const bar = () => page.evaluate(sel => {
        const m = document.querySelector(sel), b = m.querySelector('.mes_buttons'), c = getComputedStyle(b), q = b.getBoundingClientRect(), k = m.querySelector('.mes_block').getBoundingClientRect();
        const x = m.querySelector('.extraMesButtons'), xq = x.getBoundingClientRect(), xc = getComputedStyle(x);
        const cap = m.querySelector('.ch_name > :first-child').getBoundingClientRect(), bk = m.querySelector('.mes_block');
        const hit = (() => { const e = document.elementFromPoint(q.left + 16, q.top + q.height / 2); return !!e && b.contains(e); })();
        return { hit, scrollTop: bk.scrollTop, captionIn: cap.top >= k.top - 0.5 && cap.bottom <= k.bottom + 0.5, opacity: c.opacity, pe: c.pointerEvents, box: [q.left, q.top, q.width, q.height].map(Math.round), inView: q.left >= 0 && q.right <= innerWidth, centred: Math.abs((q.left + q.right) / 2 - (k.left + k.right) / 2) < 1.5, capsuleH: Math.round(k.height),
            btns: [...b.children].filter(e => getComputedStyle(e).display !== 'none' && e !== x).length,
            more: xc.display !== 'none' ? { box: [xq.left, xq.top, xq.width, xq.height].map(Math.round), inView: xq.left >= 0 && xq.right <= innerWidth, below: xq.top >= q.bottom } : null };
    }, M);
    await page.mouse.move(5, 5); await T.sleep(250);
    out.barIdle = await bar();
    if (isPhone()) await page.tap(M + ' .mes_text'); else await page.hover(M + ' .mes_text');
    await T.sleep(450);
    out.barShown = await bar();
    await T.shot(page, `${TAG}func-${view}-1-bar`);
    // “更多”
    await reveal();
    await press(M + ' .extraMesButtonsHint'); await T.sleep(450);
    out.barMore = await bar();
    await T.shot(page, `${TAG}func-${view}-2-more`);
    await press(M + ' .extraMesButtonsHint').catch(() => {}); await T.sleep(250);
    // copy
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await reveal();
    await press(M + ' .mes_copy'); await T.sleep(500);
    out.copied = await page.evaluate(() => navigator.clipboard.readText().then(t => t.slice(0, 30), e => 'ERR ' + e.message));
    // edit: name line + textarea + edit buttons; type; confirm
    await reveal();
    await press(M + ' .mes_edit'); await T.sleep(700);
    const editSt = () => page.evaluate(sel => {
        const m = document.querySelector(sel), ta = m.querySelector('.edit_textarea'), n = m.querySelector('.name_text'), eb = m.querySelector('.mes_edit_buttons'), k = m.querySelector('.mes_block');
        const r = e => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].map(Math.round); };
        const v = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
        return { textarea: !!ta, ta: ta ? r(ta) : null, nameVis: v(n), name: n ? r(n) : null, editBtnsVis: v(eb), editBtns: eb ? r(eb) : null, nEdit: [...eb.querySelectorAll('.menu_button')].filter(v).length,
            mes: r(m), block: r(k), blockBg: getComputedStyle(k).backgroundColor, order: ta && n && eb ? (r(n)[1] < r(ta)[1] && r(ta)[1] < r(eb)[1]) : null, barVis: v(m.querySelector('.mes_buttons')) };
    }, M);
    out.edit = await editSt();
    await T.shot(page, `${TAG}func-${view}-3-edit`);
    await page.fill(M + ' .edit_textarea', '② 改过的走向：先去阁楼');
    await press(M + ' .mes_edit_done'); await T.sleep(700);
    out.edited = await page.evaluate(sel => { const m = document.querySelector(sel); return { textarea: !!m.querySelector('.edit_textarea'), text: m.querySelector('.mes_text').innerText.trim(), chat: SillyTavern.getContext().chat[Number(m.getAttribute('mesid'))].mes, capsule: getComputedStyle(m.querySelector('.mes_block')).backgroundColor !== 'rgba(0, 0, 0, 0)' }; }, M);
    // edit → cancel keeps the text
    await reveal();
    await press(M + ' .mes_edit'); await T.sleep(500);
    await press(M + ' .mes_edit_cancel'); await T.sleep(500);
    out.cancelled = await page.evaluate(sel => ({ textarea: !!document.querySelector(sel + ' .edit_textarea'), text: document.querySelector(sel + ' .mes_text').innerText.trim() }), M);
    // delete (edit → trash → ST's confirm)
    const n0 = await page.evaluate(() => SillyTavern.getContext().chat.length);
    await reveal();
    await press(M + ' .mes_edit'); await T.sleep(500);
    await press(M + ' .mes_edit_delete'); await T.sleep(700);
    const okBtn = page.locator('dialog.popup[open] .popup-button-ok').first();
    out.deleteConfirm = await okBtn.count();
    if (out.deleteConfirm) { await (isPhone() ? okBtn.tap() : okBtn.click()); await T.sleep(900); }
    out.deleted = await page.evaluate(n => ({ before: n, after: SillyTavern.getContext().chat.length, left: document.querySelectorAll('#chat .mes.smallSysMes').length }), n0);
    await bottom();
    await T.shot(page, `${TAG}func-${view}-4-after`);
    const sc2 = await T.scan(page, ['#chat']);
    out.scanAfter = { ovf: sc2.ovf, dbl: sc2.dbl, unhid: sc2.unhid, nest: sc2.nest, btn: sc2.btn };
    out.errors = T.errors(page).filter(e => !/404/.test(e));
    const z = o => o.ovf + o.dbl + o.unhid + o.nest + o.btn === 0;
    out.checks = {
        five: out.rows.length === 5, inChat: out.rows.every(r => r.inChat && !r.overflowX), noSwipe: out.rows.every(r => !r.swipeVis), noAvatar: out.rows.every(r => !r.avatarVis),
        captions: out.cont.every(c => c.caption === 'none'), /* variant C: no caption */ scan: z(out.scan) && out.scan.doc && out.scan.chat && z(out.scanAfter), details: out.details.open && out.details.preInside,
        barHidden: out.barIdle.opacity === '0' && out.barIdle.pe === 'none', barShown: out.barShown.opacity === '1' && out.barShown.hit && out.barShown.inView && out.barShown.centred && out.barShown.btns >= 3,
        noRoom: out.barIdle.capsuleH < 40, more: !!out.barMore.more && out.barMore.more.inView && out.barMore.more.below && out.barMore.scrollTop === 0 && out.barMore.hit,
        copy: /跟着老板/.test(out.copied), edit: out.edit.textarea && out.edit.nameVis && out.edit.editBtnsVis && out.edit.order === true && out.edit.nEdit >= 4 && !out.edit.barVis && out.edit.ta[2] > (isPhone() ? 300 : 600),
        edited: !out.edited.textarea && /阁楼/.test(out.edited.text) && /阁楼/.test(out.edited.chat), cancelled: !out.cancelled.textarea && /阁楼/.test(out.cancelled.text),
        deleted: out.deleted.after === out.deleted.before - 1 && out.deleted.left === 4,
        longTrunc: out.long.clamp === '1' && out.long.oneLine && out.long.hintShown && out.long.cursor === 'pointer' && !out.long.overflowX,
        longOpen: out.longOpen.open && out.longOpen.multi && out.longOpen.hint && out.longOpen.hasAll && out.longOpen.inChat && !out.longOpen.overflowX,
        longClose: !out.longClosed.open && out.longClosed.oneLine,
    };
    out.ok = Object.values(out.checks).every(Boolean);
    if (!out.ok) process.exitCode = 1;
    return out;
}

export default async function (T) {
    const parts = { more, moreDesk, small, variants, func };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    if (r.ok === false) process.exitCode = 1;
    await T.save('r3a-' + part, r);
    return r;
}
