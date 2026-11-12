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
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const has = n => process.argv.includes('--' + n);
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const part = arg('part', 'more');
const MEM = has('mem');
const TAG = arg('tag', '');
const isPhone = () => process.argv.includes('--phone');
const SHOTROOT = '/opt/server-agent/workspace/st-testdata/redesign/real/R3a';
const NAME = 'Ny规则定下的走向';

/** URL-encoded #000 lucide glyph for a CSS mask (same bytes as the shipped §5.3c). */
function mask(body) {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'>" + body + "</svg>";
    const enc = [...svg].map(c => ('<>#\"% '.includes(c) ? '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0') : c)).join('');
    return `url("data:image/svg+xml,${enc}")`;
}
const BRANCH = mask('<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>');

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
            box: box(el), text: el.querySelector('.mes_text')?.innerText?.slice(0, 40),
            avatarVis: vis(el.querySelector('.mesAvatarWrapper > .avatar')),
            chNameVis: vis(chn), chNameBox: box(chn), chNameText: el.querySelector('.name_text')?.textContent?.trim(),
            nameStyle: cs(el.querySelector('.name_text')),
            textVis: vis(txt), textBox: box(txt), textStyle: cs(txt),
            glyphMask: glyph ? (glyph.maskImage || glyph.webkitMaskImage || 'none').slice(0, 16) : null,
            glyphBg: glyph ? glyph.backgroundColor : null,
            sw: el.scrollWidth, cw: el.clientWidth, overflowX: el.scrollWidth > el.clientWidth + 1,
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
        && out.rapid5.icon === 'x' && out.rapid5.menuOpen;
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
    await sendas(page, `/sendas name="${NAME}" compact=true 2️⃣ 跟着老板去地窖看看那只旧箱子`);
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
            overflowX: rows.filter(r => r.overflowX).length,
            avatarVis: rows.filter(r => r.avatarVis).length,
            chNameVis: rows.filter(r => r.chNameVis).length,
            caption: rows.map(r => r.chNameText).filter(Boolean).slice(0, 1),
            width: rows[0]?.box?.[2], glyph: rows[0]?.glyphMask,
        };
        await T.shot(page, `${TAG}small-${isPhone() ? 'phone' : 'desk'}-style${v}`);
    }
    await page.evaluate(() => $('#chat_display').val('0').trigger('change'));
    out.errors = T.errors(page);
    out.ok = out.count === 3 && Object.values(out.styles).every(s => s.overflowX === 0 && s.scan.ovf === 0 && s.scan.unhid === 0 && s.avatarVis === 0 && s.chNameVis >= 1);
    return out;
}

// ------------------------------------------------------------------ variants A/B/C screenshots
// A = shipped §5.3c. B/C are extra overrides injected here (copied into handoff/R3a.md).
const VAR_B = (M) => `
html body.ag2.ag2-r3avb:not(#_):not(#__) #chat .mes.smallSysMes { display: block !important; width: auto !important; max-width: none; margin: 0 0 18px !important; padding: 0 !important; background: none !important; box-shadow: none !important; overflow: visible; }
html body.ag2.ag2-r3avb:not(#_):not(#__) #chat .mes.smallSysMes > .mes_block::before,
html body.ag2.ag2-r3avb:not(#_):not(#__) #chat .mes.smallSysMes > .mes_block::after { content: none !important; }
html body.ag2.ag2-r3avb:not(#_):not(#__) #chat .mes.smallSysMes .ch_name { display: none !important; }
html body.ag2.ag2-r3avb:not(#_):not(#__) #chat .mes.smallSysMes .mes_text {
    justify-self: end; display: block; width: fit-content; max-width: 76%; margin-left: auto !important;
    min-height: 0 !important; padding: 9px 14px 9px 34px !important; border-radius: 20px;
    background: color-mix(in srgb, var(--ag2-accent) 12%, rgba(44, 44, 51, 0.5)) !important;
    box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--ag2-accent) 34%, transparent), inset 0 0.5px 0 rgba(255,255,255,.08) !important;
    position: relative; color: var(--ag2-l1) !important; font-size: 15px !important; line-height: 1.6 !important; text-align: left;
}
html body.ag2.ag2-r3avb:not(#_):not(#__) #chat .mes.smallSysMes .mes_text::before {
    content: ""; position: absolute; left: 12px; top: 12px; width: 16px; height: 16px; background: var(--ag2-accent);
    -webkit-mask: ${M} no-repeat center / 16px 16px; mask: ${M} no-repeat center / 16px 16px; opacity: .9;
}
html body.ag2.ag2-r3avb:not(#_):not(#__) #chat .mes.smallSysMes .mes_buttons { justify-self: end; }
html body.ag2.ag2-r3avb:not(#_):not(#__) #chat .mes.smallSysMes.ag2-day::before { content: attr(data-ag2-day); position: static; grid-row: auto; display: block; margin: 0 0 10px; text-align: center; color: var(--ag2-l3); font-size: var(--ag2-fs-section); font-weight: 560; }
`;
const VAR_C = (M) => `
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes {
    display: grid !important; grid-template-columns: minmax(24px, 1fr) auto minmax(24px, 1fr);
    align-items: center; width: 100% !important; max-width: none; margin: 2px 0 20px !important;
    padding: 0 !important; background: none !important; box-shadow: none !important; column-gap: 12px; overflow: visible;
}
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes > .mes_block { display: contents !important; }
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes > .mes_block::before,
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes > .mes_block::after { content: none !important; }
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes .ch_name { display: contents !important; }
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes .ch_name > :first-child { display: none !important; }
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes .mes_text {
    grid-column: 2; grid-row: 1; position: relative; display: inline-flex; align-items: center; gap: 8px;
    min-height: 0 !important; margin: 0 !important; padding: 0 !important; color: var(--ag2-l2) !important;
    font-size: 13px !important; line-height: 1.4 !important; white-space: nowrap; max-width: min(60vw, 420px);
    overflow: hidden; text-overflow: ellipsis;
}
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes .mes_text::before {
    content: ""; flex: none; width: 15px; height: 15px; background: var(--ag2-l3);
    -webkit-mask: ${M} no-repeat center / 15px 15px; mask: ${M} no-repeat center / 15px 15px;
}
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes::before { content: ""; grid-column: 1; grid-row: 1; height: 0.5px; background: var(--ag2-sep-strong); }
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes::after { content: ""; grid-column: 3; grid-row: 1; height: 0.5px; background: var(--ag2-sep-strong); }
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes .mes_buttons { grid-column: 1 / -1; grid-row: 2; justify-self: center; margin-top: 6px !important; }
html body.ag2.ag2-r3avc:not(#_):not(#__) #chat .mes.smallSysMes.ag2-day::before { height: auto; background: none; grid-column: 1 / -1; }
`;

async function variants(T) {
    const out = {};
    const { page } = await enter(T, {});
    await sendas(page, `/sendas name="${NAME}" compact=true 2️⃣ 跟着老板去地窖看看那只旧箱子`);
    await T.sleep(400);
    await sendas(page, `/sendas name="${NAME}" compact=true 3️⃣ 留在客厅等老板回来`);
    await T.sleep(700);
    await idle(page);
    // A: shipped
    await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
    await T.sleep(400);
    await shotVariant(T, page, 'A', isPhone() ? 'phone' : 'desk');
    // B / C: inject overrides
    for (const [k, mk] of [['B', VAR_B], ['C', VAR_C]]) {
        await page.evaluate((k) => { document.body.classList.remove('ag2-r3avb', 'ag2-r3avc'); document.body.classList.add('ag2-r3av' + k.toLowerCase()); }, k);
        const css = mk(BRANCH);
        await page.evaluate(([k, c]) => { let s = document.getElementById('ag2-r3a-' + k); if (!s) { s = document.createElement('style'); s.id = 'ag2-r3a-' + k; document.head.append(s); } s.textContent = c; }, [k, css]);
        await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
        await T.sleep(500);
        await shotVariant(T, page, k, isPhone() ? 'phone' : 'desk');
        out[k] = await page.evaluate(() => {
            const el = document.querySelector('#chat .mes.smallSysMes');
            const q = el.getBoundingClientRect();
            return { box: [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)], sw: el.scrollWidth, cw: el.clientWidth };
        });
    }
    out.errors = T.errors(page);
    out.ok = true;
    return out;
}

/** Expose the branch mask to the page (the variant CSS reuses it). */
async function shotVariant(T, page, k, view) {
    const png = await T.shot(page, `variant-${k}-${view}${TAG ? '-' + TAG : ''}`);
    return png;
}

// ------------------------------------------------------------------ func: edit/delete/copy survive
async function func(T) {
    const out = {};
    const { page } = await enter(T, {});
    await sendas(page, `/sendas name="${NAME}" compact=true 2️⃣ 跟着老板去地窖看看那只旧箱子`);
    await T.sleep(400);
    await sendas(page, `/sendas name="${NAME}" compact=true 长文本：` + '这是一段用来验证自动换行与不越界的较长文字。'.repeat(12));
    await T.sleep(400);
    await sendas(page, `/comment compact=true <details><summary>展开</summary><pre>code block line</pre></details>`);
    await T.sleep(800);
    await idle(page);
    await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
    await T.sleep(300);
    out.rows = await sySt(page);
    out.wrap = out.rows.map(r => ({ overflowX: r.overflowX, textSW: r.textSW, textCW: r.textCW, box: r.box }));
    out.scan = await T.scan(page, ['#chat']);
    delete out.scan.detail;
    await T.shot(page, `${TAG}func-${isPhone() ? 'phone' : 'desk'}-0`);

    // copy the last AI message (unaffected sanity)
    const copied = await page.evaluate(() => { const b = document.querySelector('#chat .mes.smallSysMes .mes_copy'); b?.click(); return !!b; });
    out.copyBtnExists = copied;
    await T.sleep(400);

    // edit the FIRST receipt: enter edit mode
    const first = await page.evaluate(() => document.querySelector('#chat .mes.smallSysMes')?.getAttribute('mesid'));
    await page.evaluate(id => { const m = document.querySelector(`#chat .mes[mesid="${id}"]`); m.querySelector('.mes_edit')?.click(); }, first);
    await T.sleep(700);
    out.edit = await page.evaluate(id => {
        const el = document.querySelector(`#chat .mes[mesid="${id}"]`);
        const ta = el.querySelector('.edit_textarea');
        const chn = el.querySelector('.ch_name > :first-child');
        const q = el.getBoundingClientRect();
        return { textarea: !!ta, taBox: ta ? [...[ta.getBoundingClientRect().left, ta.getBoundingClientRect().top, ta.getBoundingClientRect().width]].map(Math.round) : null,
            chNameVis: !!chn && getComputedStyle(chn).display !== 'none' && chn.getBoundingClientRect().height > 0,
            box: [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)], overflowX: el.scrollWidth > el.clientWidth + 1,
            editBtns: el.querySelectorAll('.mes_edit_buttons .menu_button').length };
    }, first);
    await T.shot(page, `${TAG}func-${isPhone() ? 'phone' : 'desk'}-edit`);
    // cancel edit
    await page.evaluate(id => document.querySelector(`#chat .mes[mesid="${id}"] .mes_edit_cancel`)?.click(), first);
    await T.sleep(600);
    out.afterCancel = await page.evaluate(id => { const el = document.querySelector(`#chat .mes[mesid="${id}"]`); return { textarea: !!el.querySelector('.edit_textarea'), cls: el.className }; }, first);
    out.errors = T.errors(page);
    out.ok = out.scan.ovf === 0 && out.wrap.every(w => !w.overflowX) && out.edit.textarea && out.edit.chNameVis && !out.afterCancel.textarea;
    return out;
}

export default async function (T) {
    const parts = { more, moreDesk, small, variants, func };
    if (!parts[part]) throw new Error('unknown part ' + part);
    const r = await parts[part](T);
    await T.save('r3a-' + part, r);
    return r;
}
