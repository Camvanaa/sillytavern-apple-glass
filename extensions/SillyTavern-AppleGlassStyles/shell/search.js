// Apple Glass 2 shell — settings cross-page search (DESIGN §5.5 “跨页搜索”).
//
// Loaded on demand: settings.js imports this module on the first keystroke in the search
// field, and the index is built then (not at cold start, not when the window opens).
// Index: label text → { page, group, element } for every label-like node in the eight ST
// drawers, plus the shell's own pages. Results read “页面 › 分组 › 设置项”; picking one
// switches page (settings.go), opens any collapsed .inline-drawer around the item (ST's own
// utils.toggleDrawer), scrolls it into view inside the drawer and flashes an accent ring.

import { toggleDrawer as stToggleInline } from '../../../../utils.js';
import { SET_PANELS } from './util.js?v=20261113QA05';

/** Shell-built pages: static entries (their DOM is rendered on demand). */
const SHELL_ITEMS = [
    { page: 'look', group: '聊天样式', label: '聊天样式', sel: '.ag2-styles', kw: '气泡 文档 回声 低语 涟漪 轻声 阅读 chat style' },
    { page: 'look', group: '强调色', label: '强调色', sel: '.ag2-swatches', kw: '颜色 主题色 accent' },
    { page: 'look', group: '强调色', label: '聊天背景', sel: '[data-act="bg"]', kw: '背景 壁纸 background' },
    { page: 'look', group: '阅读', label: '正文字号', sel: '#ag2-read-size', kw: '字体 字号 字体大小 font' },
    { page: 'look', group: '阅读', label: '行宽', sel: '#ag2-read-width', kw: '宽度 聊天宽度 width' },
    { page: 'look', group: '阅读', label: '消息信息', sel: '#ag2-meta', kw: 'token 耗时 模型名' },
    { page: 'look', group: '阅读', label: '减少动态效果', sel: '[data-k="reduced"]', kw: '动画 动效 reduced motion' },
    { page: 'look', group: '阅读', label: '毛玻璃', sel: '[data-k="glass"]', kw: '模糊 blur 透明' },
    { page: 'about', group: '版本', label: 'SillyTavern 版本', sel: '.ag2-set-group', kw: '版本 version 关于' },
];

/** Label-like nodes inside the drawers, in document order. */
const LABEL_SEL = [
    'h3', 'h4', '.inline-drawer-header',
    'label', '.range-block-title',
    'small', '.standoutHeader',
].join(', ');
/** Groups: a heading sets the group for what follows it (document order, per drawer). */
const HEAD_SEL = 'h3, h4, .standoutHeader';
/** User content, not settings: entry lists, persona / background / prompt lists, popups. */
const SKIP_SEL = [
    '.world_entry', '#world_popup_entries_list', '#user_avatar_block', '.avatar-container',
    '.bg_example', '#bg_menu_content', '.completion_prompt_manager_prompt', '.select2-container',
    '.toggle-description', '.notes-link', 'option', '#version_display', '.ag2-hit-skip',
].join(', ');

let INDEX = null;
let PAGES = null; // [{ id, name, lead }] from settings.js

const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim();
const textOf = el => {
    // the visible label only: checkbox rows hold an <input>, headings may hold buttons/selects
    let t = '';
    for (const n of el.childNodes) {
        if (n.nodeType === 3) t += n.textContent;
        else if (n.nodeType === 1 && !n.matches('input, select, textarea, button, .menu_button, .fa-solid, .fa-regular, i, a.notes-link, .select2-container, .inline-drawer-icon')) t += ' ' + n.textContent;
    }
    return clean(t);
};

function build() {
    const out = [];
    for (const [page, id] of Object.entries(SET_PANELS)) {
        const root = document.getElementById(id);
        if (!root) continue;
        let head = '';
        for (const el of root.querySelectorAll(LABEL_SEL)) {
            if (el.closest(SKIP_SEL)) continue;
            // a <small>/<span> inside a label or heading is covered by that ancestor
            if (el.matches('small') && el.parentElement?.closest('label, h3, h4, .range-block-title, .inline-drawer-header')) continue;
            if (el.matches('label') && el.closest('.inline-drawer-header, h3, h4')) continue;
            const label = textOf(el);
            const isHead = el.matches(HEAD_SEL);
            // a heading ST hides (another API source's block) must not name the group of
            // the visible controls after it (“文本补全预设 › 温度” under Chat Completion)
            if (isHead && label) {
                if (!shownIn(el, root)) continue;
                head = label.slice(0, 40);
            }
            if ([...label].length < 2 || label.length > 60) continue;
            // group: the enclosing collapsible group wins, else the last heading above
            const drawer = el.closest('.inline-drawer-content')?.parentElement;
            const dh = drawer && root.contains(drawer) ? textOf(drawer.querySelector(':scope > .inline-drawer-header') || drawer) : '';
            const group = el.matches('.inline-drawer-header') || isHead ? '' : (dh || (head !== label ? head : ''));
            // same-named copies (ST keeps one block per API source, only one shown) all stay
            // in the index; query() keeps the first reachable one per path
            out.push({ page, group: group.slice(0, 40), label, el, lc: label.toLowerCase(), kw: '' });
        }
    }
    for (const it of SHELL_ITEMS) out.push({ ...it, lc: it.label.toLowerCase(), kw: (it.kw || '').toLowerCase() });
    return out;
}

/** Hidden by ST (other API source, display:none) → not a result; inside a collapsed
 *  .inline-drawer → still a result (it gets opened). The drawer root itself is closed
 *  while another page shows, so it is not checked. */
function shownIn(el, root) {
    for (let p = el; p && p !== root; p = p.parentElement) {
        if (p.classList?.contains('inline-drawer-content')) continue;
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
}
function reachable(it) {
    if (!it.el) return true;
    if (!it.el.isConnected) return false;
    return shownIn(it.el, document.getElementById(SET_PANELS[it.page]));
}

export function init(pages) { PAGES = pages; }

export function query(q, max = 40) {
    q = clean(q).toLowerCase();
    if (!q) return [];
    if (!INDEX) INDEX = build();
    const res = [];
    const pageHit = new Set();
    for (const p of PAGES || []) {
        if (p.name.toLowerCase().includes(q)) {
            pageHit.add(p.id);
            res.push({ page: p.id, label: p.name, group: '', kind: 'page', score: p.name.toLowerCase() === q ? -2 : -1 });
        }
    }
    for (const it of INDEX) {
        let score;
        if (it.lc === q) score = 0;
        else if (it.lc.startsWith(q)) score = 1;
        else if (it.lc.includes(q)) score = 2;
        else if (it.kw && it.kw.includes(q)) score = 3;
        else continue;
        // the query names a page (“世界书”, “背景”): that page's own matching items come
        // right after the page itself, before same-named items elsewhere (extensions …)
        if (pageHit.has(it.page) && score < 3) score = -0.5;
        res.push({ ...it, kind: 'item', score });
    }
    res.sort((a, b) => a.score - b.score || a.label.length - b.label.length);
    const out = [];
    const seen = new Set();
    const pageName = Object.fromEntries((PAGES || []).map(p => [p.id, p.name]));
    for (const r of res) {
        if (out.length >= max) break;
        if (r.kind === 'item') {
            // a page's own title heading (“世界书 › 世界书”) duplicates the page result
            if (!r.group && r.label === pageName[r.page]) continue;
            const key = r.page + '\u0001' + (r.group || '') + '\u0001' + r.label;
            if (seen.has(key) || !reachable(r)) continue;
            seen.add(key);
        }
        out.push(r);
    }
    return out;
}

/** Rebuild on next query (theme switch, extension settings appearing late …). */
export function reset() { INDEX = null; }

const scroller = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
};

let hitTimer = 0;
let hitEl = null;

/**
 * Bring a result into view: `go` = settings.go (queued page switch). For shell pages the
 * element is looked up in the freshly rendered page body.
 */
export async function reveal(r, go, body) {
    await go(r.page);
    if (r.kind === 'page') return null;
    let el = r.el || body?.querySelector(r.sel);
    if (!el || !el.isConnected) return null;
    // open collapsed groups around it, outermost first (ST's own helper: instant, no slide)
    const root = r.el ? document.getElementById(SET_PANELS[r.page]) : body;
    const closed = [];
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        if (p.classList.contains('inline-drawer-content') && getComputedStyle(p).display === 'none') closed.unshift(p.parentElement);
    }
    for (const d of closed) { try { stToggleInline(d, true); } catch { /* */ } }
    const row = el.closest('label.checkbox_label, .range-block, .inline-drawer-header, .ag2-set-row, .ag2-set-group')
        || (el.matches('small') ? el.parentElement : el);
    const sc = scroller(row);
    const reduced = document.body.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sc) {
        const a = row.getBoundingClientRect();
        const c = sc.getBoundingClientRect();
        const top = sc.scrollTop + (a.top - c.top) - Math.max(16, (c.height - a.height) / 3);
        sc.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
    }
    // accent ring: blinks 1.2s (CSS), static under reduced motion; cleared afterwards
    clearTimeout(hitTimer);
    hitEl?.classList.remove('ag2-hit');
    void row.offsetWidth; // restart the animation when the same row is hit twice
    row.classList.add('ag2-hit');
    hitEl = row;
    hitTimer = setTimeout(() => { row.classList.remove('ag2-hit'); if (hitEl === row) hitEl = null; }, reduced ? 2000 : 1600);
    return row;
}

export function clearHit() {
    clearTimeout(hitTimer);
    hitEl?.classList.remove('ag2-hit');
    hitEl = null;
}
