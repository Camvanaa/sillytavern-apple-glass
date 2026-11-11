// tools/ag2/r2a.mjs — R2a: settings pages, layout review at every scroll position.
//   node tools/ag2/run.mjs tools/ag2/r2a.mjs --phase R2a --part sweep [--w 1440 --h 900 | --phone]
//        [--tag pre|post] [--pages ai,wi] [--expand] [--noshot] [--mem] [--vw 360] [--wiempty] [--ios]
//   --part sweep   every settings page, scrolled screen by screen: screenshot + checks
//   --part func    controls still work (slider, switch, select, 世界书 create / select, persona click)
//   --expand       open every collapsed .inline-drawer of the page first (long: 扩展 / 通用 / 生成参数)
//   --mem          inject the worktree CSS in memory (debug); acceptance runs use the published theme
// Checks per page (all must be 0):
//   clip   a visible element whose box sticks out of the nearest clipping ancestor (overflow-x
//          hidden / auto / scroll / clip) on the left or right. This is what T.scan cannot see:
//          scan.js only reports boxes beyond the *viewport* edge and skips anything a clipping
//          ancestor cuts, and the panel's own scrollWidth is that of a box with overflow-x:hidden
//          further in — a toolbar cut by its own parent leaves no trace in either.
//   over   two controls / texts of the page whose boxes overlap although neither contains the other
//   native ST's own look left on a heading (gradient bar, glow border)
//   scan   the RUNBOOK §4.6 counts (ovf / dbl / unhid / nest / btn)
// Writes stay stubbed (run.mjs).

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const has = n => process.argv.includes('--' + n);
const part = arg('part', 'sweep');
const MEM = has('mem');
const TAG = arg('tag', 'post');
const ALL = ['api', 'ai', 'fmt', 'wi', 'persona', 'bg', 'look', 'user', 'ext', 'about'];
const PAGES = arg('pages', '') ? arg('pages', '').split(',') : ALL;
const PANEL = { api: '#rm_api_block', ai: '#left-nav-panel', fmt: '#AdvancedFormatting', wi: '#WorldInfo', persona: '#PersonaManagement', bg: '#Backgrounds', user: '#user-settings-block', ext: '#rm_extensions_block' };

// ---------------------------------------------------------------- in-page checks
/** Runs in the page. roots: selectors of the boxes that make up the settings page. */
export const checks = (page, roots) => page.evaluate(rs => {
    const name = e => {
        let s = e.tagName.toLowerCase();
        if (e.id) s += '#' + e.id;
        else if (typeof e.className === 'string' && e.className.trim()) s += '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.');
        return s;
    };
    const path = e => { const p = e.parentElement; return (p ? name(p) + '>' : '') + name(e); };
    const shown = e => {
        const c = getComputedStyle(e);
        if (c.display === 'none' || c.visibility !== 'visible' || +c.opacity < 0.02) return false;
        // content of a closed <details> keeps a box (content-visibility) but is not rendered
        if (e.checkVisibility && !e.checkVisibility({ contentVisibilityAuto: true })) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0.5 && r.height > 0.5;
    };
    // an element is only painted if no ancestor is invisible (opacity 0 / visibility) either
    const painted = e => { for (let p = e; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || +c.opacity < 0.02) return false; } return true; };
    const rootEls = rs.map(s => document.querySelector(s)).filter(e => e && shown(e));
    const els = [];
    for (const r of rootEls) for (const e of r.querySelectorAll('*')) {
        if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
        if (['OPTION', 'OPTGROUP', 'SCRIPT', 'STYLE', 'TEMPLATE', 'BR'].includes(e.tagName)) continue;
        if (!shown(e) || !painted(e)) continue;
        els.push(e);
    }
    // ---- clip
    // Deliberate horizontal scrollers / single-line ellipsis boxes are not “cut content”.
    const SCROLLERS = '.bg_example, .ag2-anchors, .ag2-seg, .select2-selection__rendered, .ag2-look-styles, .ag2-set-results, pre, code, table, .CodeMirror, textarea';
    const clipOf = e => {
        const fixed = getComputedStyle(e).position === 'fixed';
        if (fixed) return null;
        let abs = getComputedStyle(e).position === 'absolute';
        for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
            const c = getComputedStyle(p);
            if (abs) { if (c.position === 'static') continue; abs = false; } // only the containing block chain clips
            if (c.overflowX !== 'visible') return p;
            if (c.position === 'absolute') abs = true;
            else if (c.position === 'fixed') return null;
        }
        return null;
    };
    const cut = new Map();
    for (const e of els) {
        const p = clipOf(e);
        if (!p) continue;
        const c = getComputedStyle(p);
        if (p.matches(SCROLLERS) || e.closest(SCROLLERS)) continue;
        if (c.textOverflow === 'ellipsis' || getComputedStyle(e).textOverflow === 'ellipsis') continue;
        const pr = p.getBoundingClientRect();
        const l = pr.left + p.clientLeft, r = l + p.clientWidth;
        const q = e.getBoundingClientRect();
        // above / below the visible part of a vertical scroller: not on screen, still measured
        const dr = q.right - r, dl = l - q.left;
        if (dr > 1.5 || dl > 1.5) cut.set(e, { p, dr: Math.round(dr), dl: Math.round(dl) });
    }
    const clip = [];
    for (const [e, v] of cut) {
        if (cut.has(e.parentElement) && cut.get(e.parentElement).p === v.p) continue; // report the outermost offender
        clip.push(path(e) + ' ⊄ ' + name(v.p) + (v.dr > 1 ? ' R+' + v.dr : '') + (v.dl > 1 ? ' L+' + v.dl : ''));
    }
    // ---- overlap: “atoms” (controls, icons, text leaves) that intersect
    const isAtom = e => {
        if (e.matches('input, select, textarea, button, .menu_button, .menu_button_icon, i[class*="fa-"], .right_menu_button, .select2-container, .ag2-switch, .ag2-anchor')) return true;
        if (e.matches('label, small, span, b, strong, h1, h2, h3, h4, h5, a, div, p, li')) return [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
        return false;
    };
    const rawRect = e => {
        // text leaves: the text's own box, not the (often full-width) block
        if (!e.matches('input, select, textarea, button, .menu_button, .select2-container') && e.children.length === 0) {
            const g = document.createRange(); g.selectNodeContents(e);
            const b = g.getBoundingClientRect();
            if (b.width > 0) return b;
        }
        return e.getBoundingClientRect();
    };
    // the part of the box that is really painted: cut by every clipping ancestor (content
    // scrolled under the window head is not “overlapping” the head)
    const rect = e => {
        const b = rawRect(e);
        let l = b.left, t = b.top, r = b.right, bt = b.bottom;
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
            const c = getComputedStyle(p);
            if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
            const q = p.getBoundingClientRect();
            if (c.overflowX !== 'visible') { l = Math.max(l, q.left); r = Math.min(r, q.right); }
            if (c.overflowY !== 'visible') { t = Math.max(t, q.top); bt = Math.min(bt, q.bottom); }
        }
        l = Math.max(l, 0); t = Math.max(t, 0); r = Math.min(r, innerWidth); bt = Math.min(bt, innerHeight);
        return { left: l, top: t, right: r, bottom: bt, width: r - l, height: bt - t };
    };
    const atomBoxes = els.filter(isAtom).map(e => [e, rect(e)]).filter(([, r]) => r.width > 1 && r.height > 1);
    const atoms = atomBoxes.map(x => x[0]);
    const over = [];
    const boxes = atomBoxes;
    for (let i = 0; i < boxes.length; i++) {
        const [a, ra] = boxes[i];
        for (let j = i + 1; j < boxes.length; j++) {
            const [b, rb] = boxes[j];
            if (a.contains(b) || b.contains(a)) continue;
            const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const hh = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (w < 3 || hh < 3) continue;
            // an input with a deliberately overlaid icon / label (same positioned wrapper)
            const pa = getComputedStyle(a).position, pb = getComputedStyle(b).position;
            if ((pa === 'absolute' || pb === 'absolute') && (a.parentElement === b.parentElement || a.parentElement.contains(b) || b.parentElement.contains(a))) continue;
            if (a.matches('.select2-container') || b.matches('.select2-container')) { if (a.previousElementSibling === b || b.previousElementSibling === a) continue; }
            // a checkbox / radio stacked over its own switch drawing
            if (over.length < 40) over.push(path(a) + ' × ' + path(b) + ' ' + Math.round(w) + 'x' + Math.round(hh) + ' @' + Math.round(Math.max(ra.left, rb.left)) + ',' + Math.round(Math.max(ra.top, rb.top)));
        }
    }
    // ---- native: ST's own look left on something inside an ST page — a gradient fill (heading
    // bars), a browser-drawn checkbox / select
    const native = [];
    for (const e of els) {
        if (e.closest('#ag2-settings')) continue; // the shell's own nodes
        const c = getComputedStyle(e);
        if (/gradient/.test(c.backgroundImage) && !e.matches('input[type="range"], .ag2-hit, .bg_example, .thumbnail-clipper, .BGSampleTitle, .avatar, img')) native.push(path(e) + ' gradient');
        if (e.matches('input[type="checkbox"], input[type="radio"], select:not([multiple]):not([size])') && (c.appearance || c.webkitAppearance) !== 'none') native.push(path(e) + ' appearance:' + c.appearance);
    }
    // ---- rows: controls of one flex row with different heights (text inputs / selects / buttons)
    const rows = [];
    const seenRow = new Set();
    for (const e of atoms) {
        if (!e.matches('input[type="text"], input[type="search"], input[type="number"], input:not([type]), select, .menu_button, .select2-container')) continue;
        const p = e.parentElement;
        if (!p || seenRow.has(p)) continue;
        seenRow.add(p);
        const kids = [...p.children].filter(k => atoms.includes(k) && k.matches('input[type="text"], input[type="search"], input[type="number"], input:not([type]), select, .menu_button, .select2-container'));
        if (kids.length < 2) continue;
        const sameLine = kids.filter(k => Math.abs(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2 - (kids[0].getBoundingClientRect().top + kids[0].getBoundingClientRect().height / 2)) < 12);
        const hs = sameLine.map(k => Math.round(k.getBoundingClientRect().height));
        if (Math.max(...hs) - Math.min(...hs) > 4) rows.push(path(p) + ' [' + sameLine.map((k, i) => name(k).slice(0, 26) + ':' + hs[i]).join(' ') + ']');
    }
    return { clip, over, native, rows: rows.slice(0, 30), n: els.length };
}, roots);

/** Touch targets inside the page that are narrower / lower than `min` (phones). */
const smallTargets = (page, root, min = 40) => page.evaluate(([sel, m]) => {
    const out = [];
    const r0 = document.querySelector(sel);
    if (!r0) return out;
    for (const e of r0.querySelectorAll('button, .menu_button, .menu_button_icon, select, input[type="text"], input[type="search"], input[type="number"], .right_menu_button, i.interactable')) {
        const c = getComputedStyle(e);
        if (c.display === 'none' || c.visibility !== 'visible') continue;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;
        const b = getComputedStyle(e, '::before');
        const ext = b.content !== 'none' && b.position === 'absolute';
        const w = ext ? Math.max(r.width, parseFloat(b.width) || 0) : r.width, hh = ext ? Math.max(r.height, parseFloat(b.height) || 0) : r.height;
        if (w < m - 0.5 || hh < m - 0.5) out.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '')) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    return out;
}, [root, min]);

// ---------------------------------------------------------------- entry
async function enter(T, opt = {}) {
    const phone = !!T.cfg.phone;
    const page = await T.newPage();
    // --vw 360: a narrower phone (the suite's phone context is 390×844)
    if (phone && arg('vw', '')) await page.setViewportSize({ width: Number(arg('vw', 390)), height: Number(arg('vh', 844)) });
    await T.prepare(page, { ...(MEM ? { theme: 'ag2' } : {}), ...opt });
    // --ios: ST's mobile-styles.css ends with an iOS-only block, `@supports (-webkit-touch-callout:
    // none) { … }`, that Chromium never applies (it resizes #world_popup / .drawer-content /
    // #sheld to the viewport). Serve the sheet with that condition made true, so the rules take
    // part in the cascade exactly where they do on an iPhone.
    if (has('ios')) {
        await page.route('**/css/mobile-styles.css*', async route => {
            const res = await route.fetch();
            const css = (await res.text()).replace(/@supports\s*\(\s*-webkit-touch-callout\s*:\s*none\s*\)/g, '@supports (display: block)');
            page.__iosBlock = /@supports \(display: block\)/.test(css);
            await route.fulfill({ response: res, body: css });
        });
    }
    await T.boot(page, { ag2: true, settle: 2000 });
    if (!phone) await T.openChat(page, await T.longChat(page), 20);
    return { page, phone };
}
const openSettings = async (T, page, phone) => {
    if (phone) await page.tap('#ag2-tabbar [data-tab="settings"]');
    else await page.click('#ag2-sidebar [data-act="settings"]');
    await page.waitForSelector('#ag2-settings:not([hidden])', { timeout: 15000 });
    await T.sleep(900);
};
const goPage = async (T, page, phone, p) => {
    if (phone) {
        const lvl = await page.evaluate(() => document.getElementById('ag2-settings')?.dataset.level);
        if (lvl === 'page') { await page.tap('#ag2-settings .ag2-set-back'); await T.sleep(700); }
        await page.locator(`#ag2-settings .ag2-set-item[data-page="${p}"]`).scrollIntoViewIfNeeded();
        await page.tap(`#ag2-settings .ag2-set-item[data-page="${p}"]`);
    } else await page.click(`#ag2-settings .ag2-set-item[data-page="${p}"]`);
    await T.sleep(1300);
};
/** The page's main vertical scroller: marks it with data-r2a-sc, returns its metrics. */
const markScroller = (page, rootSel) => page.evaluate(sel => {
    document.querySelectorAll('[data-r2a-sc]').forEach(e => e.removeAttribute('data-r2a-sc'));
    const root = document.querySelector(sel);
    if (!root) return null;
    let best = null, area = 0;
    for (const e of [root, ...root.querySelectorAll('*')]) {
        const c = getComputedStyle(e);
        if (!/(auto|scroll)/.test(c.overflowY) || e.scrollHeight <= e.clientHeight + 8 || e.clientHeight < 160) continue;
        if (e.getClientRects().length === 0) continue;
        const a = e.clientHeight * e.clientWidth;
        if (a > area) { area = a; best = e; }
    }
    if (!best) return { none: true };
    best.setAttribute('data-r2a-sc', '1');
    best.scrollTop = 0;
    return { sel: (best.id ? '#' + best.id : best.tagName.toLowerCase() + '.' + String(best.className).trim().split(/\s+/)[0]), sh: best.scrollHeight, ch: best.clientHeight };
}, rootSel);

// ---------------------------------------------------------------- sweep
async function sweep(T) {
    const { page, phone } = await enter(T);
    const vp = phone ? 'ph' + (arg('vw', '') || '') + (has('ios') ? 'i' : '') : String(T.cfg.w);
    const out = { vp, tag: TAG, pages: {}, totals: { clip: 0, over: 0, native: 0, rows: 0, scan: 0 } };
    await openSettings(T, page, phone);
    for (const p of PAGES) {
        await goPage(T, page, phone, p);
        if (p === 'wi') {
            if (!has('wiempty')) await page.evaluate(() => { const s = document.querySelector('#world_editor_select'); if (s && s.options.length > 1 && !s.value) { s.selectedIndex = 1; $(s).trigger('change'); } });
            await T.sleep(1500);
        }
        const rootSel = PANEL[p] || '#ag2-settings .ag2-set-body';
        if (has('expand')) {
            await page.evaluate(sel => { for (const d of document.querySelectorAll(sel + ' .inline-drawer')) { const c = d.querySelector(':scope > .inline-drawer-content'); if (c && getComputedStyle(c).display === 'none') d.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header')?.click(); } }, rootSel);
            await T.sleep(1500);
        }
        const sc = await markScroller(page, rootSel);
        const rec = { scroller: sc, screens: 0, clip: [], over: [], native: [], rows: [] };
        const add = (k, list) => { for (const x of list) if (!rec[k].includes(x)) rec[k].push(x); };
        const max = has('expand') ? 24 : 14;
        for (let i = 0; i < max; i++) {
            await T.sleep(350);
            const c = await checks(page, ['#ag2-settings', rootSel]);
            add('clip', c.clip); add('over', c.over.map(x => x.replace(/ @.*$/, ''))); add('native', c.native); add('rows', c.rows);
            if (i === 0) {
                const s = await T.scan(page, [rootSel]);
                rec.scan = { ovf: s.ovf, dbl: s.dbl, unhid: s.unhid, nest: s.nest, btn: s.btn, doc: s.doc.ok, panelOk: Object.values(s.panels)[0]?.ok ?? null };
                if (s.ovf + s.dbl + s.unhid + s.nest + s.btn) rec.scanDetail = s.detail;
                if (phone) rec.small = await smallTargets(page, rootSel);
            }
            if (!has('noshot')) await T.shot(page, `${TAG}-${vp}-${p}${has('expand') ? 'x' : ''}${has('wiempty') ? 'e' : ''}-${String(i + 1).padStart(2, '0')}`);
            rec.screens = i + 1;
            if (!sc || sc.none) break;
            const more = await page.evaluate(() => {
                const e = document.querySelector('[data-r2a-sc]');
                if (!e) return false;
                const before = e.scrollTop;
                e.scrollTop = before + Math.round(e.clientHeight * 0.86);
                return e.scrollTop > before + 4;
            });
            if (!more) break;
        }
        out.pages[p] = rec;
        out.totals.clip += rec.clip.length; out.totals.over += rec.over.length; out.totals.native += rec.native.length; out.totals.rows += rec.rows.length;
        out.totals.scan += rec.scan ? rec.scan.ovf + rec.scan.dbl + rec.scan.unhid + rec.scan.nest + rec.scan.btn : 0;
    }
    out.errors = T.errors(page).filter(e => !/404|Failed to load resource/.test(e)).slice(0, 8);
    return out;
}

// ---------------------------------------------------------------- dev: one page, R2A_CODE evaluated, optional shot
//   R2A_CODE='…js…' node tools/ag2/run.mjs tools/ag2/r2a.mjs --phase R2a-dev --part dev --pages wi [--phone] [--mem] [--snap name] [--scroll 600]
async function dev(T) {
    const { page, phone } = await enter(T);
    await openSettings(T, page, phone);
    const p = PAGES[0];
    await goPage(T, page, phone, p);
    if (p === 'wi') {
        if (!has('wiempty')) await page.evaluate(() => { const s = document.querySelector('#world_editor_select'); if (s && s.options.length > 1 && !s.value) { s.selectedIndex = 1; $(s).trigger('change'); } });
        await T.sleep(1500);
    }
    const rootSel = PANEL[p] || '#ag2-settings .ag2-set-body';
    if (has('expand')) {
        await page.evaluate(sel => { for (const d of document.querySelectorAll(sel + ' .inline-drawer')) { const c = d.querySelector(':scope > .inline-drawer-content'); if (c && getComputedStyle(c).display === 'none') d.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header')?.click(); } }, rootSel);
        await T.sleep(1200);
    }
    await markScroller(page, rootSel);
    const y = Number(arg('scroll', 0));
    if (y) { await page.evaluate(v => { const e = document.querySelector('[data-r2a-sc]'); if (e) e.scrollTop = v; }, y); await T.sleep(400); }
    const out = {};
    if (process.env.R2A_CODE) out.probe = await page.evaluate(process.env.R2A_CODE);
    await T.sleep(300);
    if (has('check')) {
        out.checks = await checks(page, ['#ag2-settings', rootSel]);
        const s = await T.scan(page, [rootSel]);
        out.scan = { ovf: s.ovf, dbl: s.dbl, unhid: s.unhid, nest: s.nest, btn: s.btn, doc: s.doc, panel: Object.values(s.panels)[0], detail: s.ovf + s.dbl + s.unhid + s.nest + s.btn ? s.detail : undefined };
        if (has('ios')) out.iosBlock = !!page.__iosBlock;
    }
    if (arg('snap', '')) await T.shot(page, arg('snap', ''));
    out.errors = T.errors(page).filter(e => !/404|Failed to load resource/.test(e)).slice(0, 5);
    return out;
}

export default async function (T) {
    const parts = { sweep, dev };
    if (!parts[part]) throw new Error('unknown part ' + part);
    return parts[part](T);
}
