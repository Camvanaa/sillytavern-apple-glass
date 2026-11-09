// Apple Glass 2 shell — settings window (DESIGN §5.5, §9.2 #1/#2).
//
// Loaded on demand (util.openSettings → import()) the first time the window opens; nothing
// here runs at cold start.
//
// Frame: #ag2-set-dim (z 3001) + #ag2-settings (z 3002), children of <body>. Left: nav
// (search, iOS-style tiles, 关于). Right: page head (title + one-line lead) and, for the
// shell's own pages (外观 / 关于), a scrolling body.
// ST pages: the eight ST drawers stay inside their .drawer (rule 1: .drawer-content never
// moves). CSS under body.ag2-set-open turns the open drawer into a fixed box over the
// content area; #top-settings-holder (z 3005) stacks it above the frame.
// State follows ST: the current page is whichever of the eight drawers has .openDrawer.
// Switching uses doNavbarIconClick (util.toggleDrawer) — ST closes the previous unpinned
// drawer itself; pinned leftovers are closed here. Closing the window closes the drawer.

import { ctx, h, guard, toggleDrawer, SET_PANELS, pageOfPanel } from './util.js?v=202611091859';
import { icon } from './icons.js?v=202611091859';
import { local, appearance, setAppearance, ACCENTS, READ_SIZE, READ_WIDTH } from './store.js?v=202611091859';
import { isMenuOpen } from './menu.js?v=202611091859';

const PAGES = [
    { id: 'api', name: '连接', icon: 'plug', tile: 'green', group: 0, lead: '选择 API 来源，填写地址、密钥和模型。' },
    { id: 'ai', name: '生成参数', icon: 'sliders-horizontal', tile: 'blue', group: 0, lead: '温度、上下文长度和采样参数，作用于每一次回复。' },
    { id: 'fmt', name: '提示词与格式', icon: 'text-quote', tile: 'indigo', group: 0, lead: '系统提示词、上下文与指令模板。' },
    { id: 'wi', name: '世界书', icon: 'book-marked', tile: 'orange', group: 1, lead: '按关键词把设定注入对话。可以绑定到角色、对话或全局。' },
    { id: 'persona', name: '人设', icon: 'contact', tile: 'pink', group: 1, lead: '你在对话里的身份：名字、头像和描述。' },
    { id: 'bg', name: '背景', icon: 'image', tile: 'teal', group: 1, lead: '聊天背景图片。可以上传，也可以为单个对话单独设置。' },
    { id: 'look', name: '外观', icon: 'palette', tile: 'purple', group: 2, lead: '聊天样式、强调色和阅读排版。改动即时生效，无需保存。' },
    { id: 'user', name: '通用', icon: 'settings', tile: 'gray', group: 2, lead: '主题、界面行为、聊天选项与快捷操作。' },
    { id: 'ext', name: '扩展', icon: 'puzzle', tile: 'red', group: 2, lead: '已安装的扩展和它们的设置。' },
    { id: 'about', name: '关于', icon: 'info', tile: 'gray', group: 3, lead: 'SillyTavern 与 Apple Glass 2 的版本信息。' },
];
const PAGE = Object.fromEntries(PAGES.map(p => [p.id, { ...p, panel: SET_PANELS[p.id] || null }]));
const PANEL_IDS = Object.values(SET_PANELS);
const STYLES = ['阅读', '气泡', '文档', '回声', '低语', '涟漪', '轻声'];
const META_TEXT = {
    always: ['常显', '模型、Token 数、耗时总是显示'],
    hover: ['悬停时显示', '模型、Token 数、耗时只在悬停时显示（最后一条常显）'],
    hide: ['隐藏', '不显示模型、Token 数和耗时'],
};

let root = null;
let dim = null;
let isOpenNow = false;
let cur = null;
let switching = 0;
let queue = Promise.resolve();
let closeTimer = 0;
let opener = null;
let version = '';
const stEvents = [];

export const isOpen = () => isOpenNow;
export const currentPage = () => cur;

const openPanels = () => PANEL_IDS.filter(id => document.getElementById(id)?.classList.contains('openDrawer'));

// ------------------------------------------------------------------ frame

function build() {
    dim = guard(h('div'));
    dim.id = 'ag2-set-dim';
    dim.hidden = true;
    dim.addEventListener('pointerdown', e => { if (e.button === 0 || e.pointerType !== 'mouse') close(); });

    root = guard(h('section'));
    root.id = 'ag2-settings';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'ag2-set-title');
    let groups = '';
    for (let g = 0; g <= 3; g++) {
        groups += `<div class="ag2-set-grp${g === 3 ? ' ag2-set-grp-end' : ''}">` + PAGES.filter(p => p.group === g).map(p => `
            <button type="button" class="ag2-set-item" data-page="${p.id}">
                <span class="ag2-tile ag2-tile-${p.tile}">${icon(p.icon, 15)}</span>
                <span class="ag2-set-item-name">${p.name}</span><span class="ag2-set-item-v"></span>
            </button>`).join('') + '</div>';
    }
    root.innerHTML = `
        <nav class="ag2-set-nav" aria-label="设置分类">
            <label class="ag2-set-search">${icon('search', 15)}<input type="search" placeholder="搜索设置" aria-label="搜索设置" aria-controls="ag2-set-results" autocomplete="off" spellcheck="false"></label>
            <div class="ag2-set-results" id="ag2-set-results" role="list" aria-label="搜索结果" hidden></div>
            ${groups}
        </nav>
        <div class="ag2-set-page">
            <header class="ag2-set-head">
                <div class="ag2-set-titles"><h1 id="ag2-set-title"></h1><p class="ag2-set-lead"></p></div>
                <button type="button" class="ag2-set-close" aria-label="关闭设置" title="关闭（Esc）">${icon('x', 17)}</button>
                <nav class="ag2-anchors" aria-label="页内跳转" hidden></nav>
            </header>
            <div class="ag2-set-body" tabindex="-1"></div>
        </div>`;
    root.querySelector('.ag2-set-nav').addEventListener('click', e => {
        const b = e.target.closest('[data-page]');
        if (b) go(b.dataset.page);
    });
    root.querySelector('.ag2-set-nav').addEventListener('keydown', onNavKey);
    root.querySelector('.ag2-set-close').addEventListener('click', () => close());
    // Cross-page search (P2b): search.js + its index load on the first keystroke.
    const q = root.querySelector('.ag2-set-search input');
    q.addEventListener('input', e => onSearch(e.target.value));
    q.addEventListener('keydown', onSearchKey);
    const results = root.querySelector('.ag2-set-results');
    results.addEventListener('click', e => { const b = e.target.closest('.ag2-res'); if (b) pickResult(Number(b.dataset.i)); });
    results.addEventListener('keydown', onResultsKey);
    root.querySelector('.ag2-anchors').addEventListener('click', onAnchorClick);
    const body = root.querySelector('.ag2-set-body');
    body.addEventListener('click', e => { if (cur === 'look') onLookClick(e); });
    body.addEventListener('input', e => { if (cur === 'look') onLookInput(e); });
    body.addEventListener('change', e => { if (cur === 'look') onLookInput(e); });
    document.body.append(dim, root);

    // nav status follows ST (connection source, extension count)
    const { eventSource, eventTypes: E } = ctx();
    for (const t of [E.ONLINE_STATUS_CHANGED, E.CHATCOMPLETION_SOURCE_CHANGED, E.MAIN_API_CHANGED, E.SETTINGS_UPDATED]) {
        if (!t) continue;
        const fn = () => {
            searchMod?.reset(); // the API source decides which ST controls exist
            if (!isOpenNow) return;
            updateNavStatus();
            // the source changes which headings exist on 连接 / 生成参数
            if (ANCHORS[cur]) setTimeout(() => { if (isOpenNow && ANCHORS[cur]) renderAnchors(cur); }, 60);
        };
        eventSource.on(t, fn);
        stEvents.push([t, fn]);
    }
}

// ------------------------------------------------------------------ cross-page search (§5.5)

let searchMod = null;
let searchSeq = 0;
let results = [];

const loadSearch = async () => {
    if (!searchMod) {
        searchMod = await import('./search.js?v=202611091859');
        searchMod.init(PAGES.map(({ id, name, lead }) => ({ id, name, lead })));
    }
    return searchMod;
};

const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function markMatch(text, q) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0) return escHtml(text);
    return escHtml(text.slice(0, i)) + '<mark>' + escHtml(text.slice(i, i + q.length)) + '</mark>' + escHtml(text.slice(i + q.length));
}

async function onSearch(raw) {
    const q = String(raw || '').trim();
    const seq = ++searchSeq;
    const box = root.querySelector('.ag2-set-results');
    if (!q) {
        results = [];
        box.replaceChildren();
        box.hidden = true;
        root.classList.remove('ag2-searching');
        return;
    }
    const mod = await loadSearch();
    if (seq !== searchSeq || !root) return; // a newer keystroke won
    results = mod.query(q);
    root.classList.add('ag2-searching');
    box.hidden = false;
    if (!results.length) {
        box.innerHTML = '<div class="ag2-res-empty">没有找到相关设置</div>';
        return;
    }
    box.innerHTML = results.map((r, i) => {
        const p = PAGE[r.page];
        const grp = r.group && r.group !== p.name ? r.group : ''; // “背景 › 背景 › …” reads as a stutter
        const path = r.kind === 'page' ? '设置页' : [p.name, grp].filter(Boolean).join(' › ');
        const full = r.kind === 'page' ? p.name : [p.name, grp, r.label].filter(Boolean).join(' › ');
        return `<button type="button" class="ag2-res${i === 0 ? ' ag2-sel' : ''}" role="listitem" data-i="${i}" title="${escHtml(full)}" aria-label="${escHtml(full)}">
            <span class="ag2-tile ag2-tile-${p.tile}">${icon(p.icon, 13)}</span>
            <span class="ag2-res-txt"><span class="ag2-res-item">${markMatch(r.label, q)}</span><span class="ag2-res-path">${escHtml(path)}</span></span>
        </button>`;
    }).join('');
}

function clearSearch() {
    const q = root?.querySelector('.ag2-set-search input');
    if (q?.value) q.value = '';
    onSearch('');
}

function onSearchKey(e) {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') {
        const first = root.querySelector('.ag2-res');
        if (first) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Enter') {
        if (results.length) { e.preventDefault(); pickResult(0); }
    }
}

function onResultsKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...root.querySelectorAll('.ag2-res')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) { root.querySelector('.ag2-set-search input').focus(); return; }
    items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
}

/** Go to the result's page, open its group, scroll it into view, flash it. */
async function pickResult(i) {
    const r = results[i];
    if (!r || !searchMod) return null;
    for (const b of root.querySelectorAll('.ag2-res')) b.classList.toggle('ag2-sel', Number(b.dataset.i) === i);
    return searchMod.reveal(r, page => go(page), root.querySelector('.ag2-set-body'));
}

/** Test / P4 hook: run a query and reveal the first hit (P4's palette shares the index). */
export async function searchAndReveal(q, i = 0) {
    const input = root?.querySelector('.ag2-set-search input');
    if (!input) return null;
    input.value = q;
    await onSearch(q);
    return { results: results.map(r => ({ page: r.page, group: r.group || '', label: r.label, kind: r.kind })), hit: await pickResult(i) };
}

export async function searchIndex(q) {
    const mod = await loadSearch();
    return mod.query(q).map(r => ({ page: r.page, group: r.group || '', label: r.label, kind: r.kind }));
}

// ---- P4 command palette: same index, same reveal (DESIGN §5.7 “与设置窗口共用同一份索引”)
/** Page meta for result rows (name, tile colour, icon). */
export const pageMeta = id => PAGE[id] ? { id, name: PAGE[id].name, icon: PAGE[id].icon, tile: PAGE[id].tile } : null;
/** Raw results (with element refs) for the palette; `fresh` drops the index first. */
export async function searchItems(q, max = 12, { fresh = false } = {}) {
    const mod = await loadSearch();
    if (fresh) mod.reset();
    return mod.query(q, max);
}
/** Opens the window on the result's page, then scrolls to / flashes the item. */
export async function revealItem(r) {
    const mod = await loadSearch();
    await open(r.page);
    if (!isOpenNow) return null;
    return mod.reveal(r, page => go(page), root.querySelector('.ag2-set-body'));
}

// ------------------------------------------------------------------ sliders: accent fill
// ST's range inputs get --ag2-pct (CSS draws the accent part of the track up to it).
function paintRanges(scope) {
    if (!scope) return;
    for (const r of scope.querySelectorAll('input[type="range"]')) paintOne(r);
}
function paintOne(r) {
    const min = Number(r.min || 0), max = Number(r.max || 100);
    const pct = max > min ? (Number(r.value) - min) / (max - min) * 100 : 0;
    r.style.setProperty('--ag2-pct', Math.max(0, Math.min(100, pct)).toFixed(2) + '%');
}
function onPanelInput(e) {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !PAGE[cur]?.panel) return;
    const panel = document.getElementById(PAGE[cur].panel);
    if (!panel?.contains(t)) return;
    if (t.type === 'range') paintOne(t);
    else if (t.type === 'number') setTimeout(() => paintRanges(panel), 0); // ST syncs the slider from its box
}

// ------------------------------------------------------------------ anchor capsules (long pages)
const visibleEl = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const shortLabel = s => String(s || '').replace(/\s*[（(][^）)]*[）)]\s*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12);
const firstVisible = (root, sel) => [...root.querySelectorAll(sel)].find(visibleEl) || null;
const ANCHORS = {
    api: {
        scroll: '#rm_api_block',
        items: root => [...root.querySelectorAll('h3, h4')].filter(visibleEl).map(e => [shortLabel(e.firstChild?.textContent?.trim() ? e.firstChild.textContent : e.textContent), e]),
    },
    ai: {
        scroll: '#left-nav-panel > .scrollableInner',
        items: root => [
            ['预设', firstVisible(root, '#respective-presets-block')],
            ['长度', firstVisible(root, '#respective-ranges-and-temps .range-block, #respective-ranges-and-temps')],
            ['采样', firstVisible(root, '.range-block:has(input[type="range"][id^="temp"])')],
            ['提示词', firstVisible(root, '#range_block_openai > .inline-drawer, #range_block_openai .inline-drawer')],
            ['高级', firstVisible(root, '#advanced-ai-config-block .inline-drawer, #advanced-ai-config-block .range-block, #advanced-ai-config-block')],
        ],
    },
    fmt: {
        scroll: '#AdvancedFormatting',
        items: root => [...root.querySelectorAll('h4.standoutHeader')].filter(visibleEl).map(e => [shortLabel(e.textContent), e]),
    },
};
let anchorList = [];
let anchorScroller = null;
let spyRaf = 0;
// a clicked capsule stays current until the user scrolls by hand: the smooth scroll passes
// other sections on the way, and near the end of a page the target may never reach the top
let anchorPin = null;
const unpin = () => { anchorPin = null; };
const PIN_OFF = ['wheel', 'touchstart', 'pointerdown', 'keydown'];

function renderAnchors(page) {
    const bar = root.querySelector('.ag2-anchors');
    // a re-render on the same page (ST settings events fire often) keeps the clicked
    // capsule pinned when its label still exists
    const keep = document.body.dataset.ag2Anchors === page && anchorPin != null ? anchorList[anchorPin]?.label : null;
    detachSpy();
    anchorList = [];
    const def = ANCHORS[page];
    const panel = def && document.getElementById(PAGE[page].panel);
    if (def && panel) {
        const seen = new Set();
        for (const [label, el] of def.items(panel)) {
            if (!el || !label || seen.has(el)) continue;
            seen.add(el);
            anchorList.push({ label, el });
        }
    }
    if (anchorList.length < 2) {
        bar.hidden = true;
        bar.replaceChildren();
        delete document.body.dataset.ag2Anchors;
        anchorList = [];
        return;
    }
    bar.innerHTML = anchorList.map((a, i) => `<button type="button" class="ag2-anchor" data-i="${i}">${escHtml(a.label)}</button>`).join('');
    bar.hidden = false;
    document.body.dataset.ag2Anchors = page;
    anchorScroller = document.querySelector(def.scroll);
    anchorScroller?.addEventListener('scroll', onSpyScroll, { passive: true });
    for (const t of PIN_OFF) anchorScroller?.addEventListener(t, unpin, { passive: true });
    const k = keep == null ? -1 : anchorList.findIndex(a => a.label === keep);
    anchorPin = k >= 0 ? k : null;
    spy();
}

function detachSpy() {
    anchorScroller?.removeEventListener('scroll', onSpyScroll);
    for (const t of PIN_OFF) anchorScroller?.removeEventListener(t, unpin);
    anchorScroller = null;
    anchorPin = null;
    cancelAnimationFrame(spyRaf);
}

function onSpyScroll() {
    cancelAnimationFrame(spyRaf);
    spyRaf = requestAnimationFrame(() => spy()); // not (spy): rAF passes a timestamp as `forced`
}

/** Current anchor = the last one whose top has reached the scroller's top edge (ties keep
 *  the current one: 提示词与格式 has three columns starting at the same height). */
function spy(forced = null) {
    const sc = anchorScroller;
    const bar = root?.querySelector('.ag2-anchors');
    if (!sc || !bar || !anchorList.length) return;
    let cur = forced ?? anchorPin;
    if (cur == null) {
        const top = sc.getBoundingClientRect().top;
        const prev = Number(bar.querySelector('[aria-current="true"]')?.dataset.i ?? -1);
        let best = 0, bestY = -Infinity;
        anchorList.forEach((a, i) => {
            const y = a.el.getBoundingClientRect().top - top;
            if (y <= 24 && (y > bestY + 1 || (Math.abs(y - bestY) <= 1 && i === prev))) { best = i; bestY = y; }
        });
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 && prev >= 0) {
            // at the very bottom the clicked anchor may never reach the top: keep it
            const py = anchorList[prev]?.el.getBoundingClientRect().top - top;
            if (py >= 0 && py < sc.clientHeight) best = prev;
        }
        cur = best;
    }
    for (const b of bar.querySelectorAll('.ag2-anchor')) b.setAttribute('aria-current', String(Number(b.dataset.i) === cur));
}

function onAnchorClick(e) {
    const b = e.target.closest('.ag2-anchor');
    const a = b && anchorList[Number(b.dataset.i)];
    if (!a || !anchorScroller) return;
    const sc = anchorScroller;
    const reduced = document.body.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = sc.scrollTop + (a.el.getBoundingClientRect().top - sc.getBoundingClientRect().top) - 8;
    anchorPin = Number(b.dataset.i);
    sc.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
    spy();
}

function onNavKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...root.querySelectorAll('.ag2-set-item:not([hidden])')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    next.focus();
    go(next.dataset.page);
}

function updateNavStatus() {
    const set = (page, text) => { const v = root.querySelector(`[data-page="${page}"] .ag2-set-item-v`); if (v) v.textContent = text || ''; };
    let api = '';
    try {
        const main = $('#main_api').val();
        api = main === 'openai' ? $('#chat_completion_source option:selected').text() : $('#main_api option:selected').text();
    } catch { /* */ }
    // short status: “自定义（兼容 OpenAI）” → “自定义”
    set('api', String(api || '').replace(/\s*[（(].*$/, '').trim());
    const ext = document.querySelectorAll('#extensions_settings > .extension_container, #extensions_settings2 > .extension_container, #extensions_settings > .inline-drawer, #extensions_settings2 > .inline-drawer').length
        || document.querySelectorAll('#extensions_settings > *, #extensions_settings2 > *').length;
    const ev = root.querySelector('[data-page="ext"] .ag2-set-item-v');
    if (ev) { ev.textContent = ext ? String(ext) : ''; ev.classList.toggle('ag2-set-badge', !!ext); }
    set('about', version);
    if (!version) fetchVersion();
}

async function fetchVersion() {
    try {
        const r = await fetch('/version');
        const j = await r.json();
        version = String(j.pkgVersion || '').trim();
        if (version && root) {
            root.querySelector('[data-page="about"] .ag2-set-item-v').textContent = version;
            if (cur === 'about') renderAbout();
        }
    } catch { /* offline */ }
}

// ------------------------------------------------------------------ open / switch / close

/**
 * page: one of PAGES ids; null → the ST drawer that is already open (adopted), else the
 * last page, else 外观.
 */
export function open(page = null) {
    if (!root) build();
    if (!PAGE[page]) {
        const adopt = openPanels();
        page = adopt.length ? pageOfPanel(adopt[adopt.length - 1]) : local.get('setPage', 'look');
        if (!PAGE[page]) page = 'look';
    }
    if (!isOpenNow) {
        isOpenNow = true;
        opener = document.activeElement instanceof HTMLElement && !root.contains(document.activeElement) ? document.activeElement : null;
        document.body.classList.add('ag2-set-open');
        dim.hidden = false;
        root.hidden = false;
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        document.addEventListener('input', onPanelInput, true);
        document.addEventListener('change', onPanelInput, true);
        updateNavStatus();
    }
    return go(page, { focus: true });
}

/** Serialised: ST's drawer switch waits animation_duration, so clicks queue up instead of racing. */
export function go(page, opt = {}) {
    queue = queue.then(() => goNow(page, opt)).catch(e => console.error('[AG2] settings page switch failed', e));
    return queue;
}

async function goNow(page, { focus = false } = {}) {
    if (!isOpenNow || !PAGE[page]) return;
    const p = PAGE[page];
    clearTimeout(closeTimer);
    switching++;
    try {
        setCurrent(page);
        searchMod?.clearHit();
        if (p.panel) {
            // doNavbarIconClick closes every other unpinned drawer and opens this one.
            await toggleDrawer(p.panel, true);
            for (const id of openPanels()) if (id !== p.panel) await toggleDrawer(id, false); // pinned leftovers
            renderBody(null);
            paintRanges(document.getElementById(p.panel));
        } else {
            for (const id of openPanels()) await toggleDrawer(id, false);
            renderBody(page);
        }
        if (cur === page) renderAnchors(page);
    } finally {
        switching--;
    }
    if (focus) root.querySelector(`.ag2-set-item[data-page="${page}"]`)?.focus({ preventScroll: true });
}

function setCurrent(page) {
    const p = PAGE[page];
    cur = page;
    local.set('setPage', page);
    document.body.dataset.ag2Set = page;
    root.classList.toggle('ag2-set-st', !!p.panel);
    root.querySelector('#ag2-set-title').textContent = p.name;
    root.querySelector('.ag2-set-lead').textContent = p.lead;
    for (const b of root.querySelectorAll('.ag2-set-item')) {
        const on = b.dataset.page === page;
        b.classList.toggle('ag2-on', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
}

/**
 * Called by index.js's drawer observer while the window is open. `.openDrawer` is the source
 * of truth: a drawer ST opened by itself becomes the current page; if ST closed the current
 * drawer and nothing replaced it, the window closes too.
 */
export function sync(id, opened) {
    if (!isOpenNow || switching) return;
    if (opened) {
        const page = pageOfPanel(id);
        if (page && page !== cur) go(page);
        return;
    }
    if (!PAGE[cur]?.panel || id !== PAGE[cur].panel) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
        if (isOpenNow && !switching && PAGE[cur]?.panel && !openPanels().length) close();
    }, 450);
}

export async function close() {
    if (!isOpenNow) return;
    isOpenNow = false;
    clearTimeout(closeTimer);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('input', onPanelInput, true);
    document.removeEventListener('change', onPanelInput, true);
    searchMod?.clearHit();
    detachSpy();
    delete document.body.dataset.ag2Anchors;
    // Drawers close first (synchronous class flip inside doNavbarIconClick) while the window
    // CSS still positions them, so nothing flashes at ST's default drawer spot.
    const ids = openPanels();
    const pending = ids.map(id => toggleDrawer(id, false));
    document.body.classList.remove('ag2-set-open');
    delete document.body.dataset.ag2Set;
    dim.hidden = true;
    root.hidden = true;
    clearSearch();
    await Promise.all(pending);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
}

/** Shell teardown: nodes and listeners go; ST drawers stay as they are (the theme may have
 *  been switched from inside 通用, where the user keeps working in the classic drawer). */
export function unmount() {
    isOpenNow = false;
    clearTimeout(closeTimer);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('input', onPanelInput, true);
    document.removeEventListener('change', onPanelInput, true);
    searchMod?.clearHit();
    detachSpy();
    delete document.body.dataset.ag2Anchors;
    try { const { eventSource } = ctx(); for (const [t, fn] of stEvents) eventSource.removeListener(t, fn); } catch { /* */ }
    stEvents.length = 0;
    document.body.classList.remove('ag2-set-open');
    delete document.body.dataset.ag2Set;
    dim?.remove();
    root?.remove();
    dim = root = null;
    cur = null;
}

function onResize() {
    // Narrow viewport = ST's mobile layout (P5): the window does not apply there.
    if (isOpenNow && !window.matchMedia('(min-width: 1001px)').matches) close();
}

// ------------------------------------------------------------------ Esc layers

const visible = sel => { try { return $(sel).is(':visible'); } catch { return false; } };
/** ST layers that own Esc while they are up (they sit above the window). */
function stLayerUp() {
    return !!document.querySelector('dialog[open]')
        || !!document.querySelector('.select2-container--open')
        || visible('#shadow_popup') || visible('#dialogue_popup') || visible('#character_popup')
        || visible('#select_chat_popup') || visible('#curEditTextarea') || visible('#dialogue_del_mes_cancel');
}

function onKey(e) {
    if (e.key !== 'Escape' || !isOpenNow || e.isComposing) return;
    if (stLayerUp() || isMenuOpen()) return; // their own Esc runs first (one layer per press)
    const a = document.activeElement;
    const q = root.querySelector('.ag2-set-search input');
    e.preventDefault();
    e.stopImmediatePropagation(); // ST's own Esc would close the drawer behind our back
    if (q.value && (a === q || root.querySelector('.ag2-set-results').contains(a))) { clearSearch(); q.focus(); return; }
    // A field being edited inside the page: the first Esc leaves the field.
    if (a instanceof HTMLElement && a !== q && a.matches('input, textarea, select, [contenteditable="true"]')
        && (root.contains(a) || PANEL_IDS.some(id => document.getElementById(id)?.contains(a)))) {
        a.blur();
        return;
    }
    close();
}

// ------------------------------------------------------------------ shell pages

function renderBody(page) {
    const body = root.querySelector('.ag2-set-body');
    body.replaceChildren();
    body.scrollTop = 0;
    if (page === 'look') renderLook(body);
    else if (page === 'about') renderAbout(body);
}

const sw = (k, label, sub) => `
    <div class="ag2-set-row">
        <div class="ag2-set-lab"><span id="ag2-lab-${k}">${label}</span><small>${sub}</small></div>
        <button type="button" class="ag2-switch" role="switch" data-k="${k}" aria-labelledby="ag2-lab-${k}"></button>
    </div>`;

function styleThumb(i) {
    const ln = (s = '') => `<i class="ag2-ln${s}"></i>`;
    switch (i) {
        case 0: return `<i class="ag2-th-ava"></i>${ln()}${ln()}${ln(' ag2-s')}<i class="ag2-th-ub"></i>`;
        case 1: return `<i class="ag2-th-bb">${ln()}${ln(' ag2-s')}</i><i class="ag2-th-ub"></i>`;
        case 2: return `${ln()}${ln()}${ln()}${ln(' ag2-s')}`;
        case 3: return `<i class="ag2-th-row"><i class="ag2-th-side"></i><i class="ag2-th-col">${ln()}${ln()}${ln(' ag2-s')}</i></i>`;
        case 4: return `<i class="ag2-th-bb ag2-th-dot">${ln()}${ln(' ag2-s')}</i>`;
        case 5: return `<i class="ag2-th-row"><i class="ag2-th-side ag2-th-short"></i><i class="ag2-th-col">${ln()}${ln(' ag2-s')}</i></i>`;
        default: return `<i class="ag2-th-bb ag2-th-edge">${ln()}${ln(' ag2-s')}</i>`;
    }
}

function renderLook(body) {
    body.innerHTML = `
        <div class="ag2-set-gtitle">聊天样式</div>
        <div class="ag2-set-group">
            <div class="ag2-styles" role="radiogroup" aria-label="聊天样式">
                ${STYLES.map((n, i) => `<button type="button" class="ag2-sty" role="radio" data-style="${i}"><span class="ag2-sty-th">${styleThumb(i)}</span><span>${n}</span></button>`).join('')}
            </div>
        </div>
        <div class="ag2-set-gtitle">强调色</div>
        <div class="ag2-set-group">
            <div class="ag2-set-row">
                <div class="ag2-set-lab">强调色<small>按钮、链接、选中态</small></div>
                <div class="ag2-swatches" role="radiogroup" aria-label="强调色">
                    ${ACCENTS.map(a => `<button type="button" class="ag2-sw" role="radio" data-accent="${a.id}" style="--sw:${a.color}" aria-label="${a.name}" title="${a.name}"></button>`).join('')}
                </div>
            </div>
            <div class="ag2-set-row">
                <span class="ag2-wallthumb" aria-hidden="true"></span>
                <div class="ag2-set-lab">聊天背景<small class="ag2-bg-name"></small></div>
                <button type="button" class="ag2-set-btn" data-act="bg">更换…</button>
            </div>
        </div>
        <div class="ag2-set-gtitle">阅读</div>
        <div class="ag2-set-group">
            <div class="ag2-set-row">
                <label class="ag2-set-lab" for="ag2-read-size">正文字号<small>只影响聊天正文，不改 ST 的全局字体缩放</small></label>
                <input id="ag2-read-size" class="ag2-range" type="range" data-k="readSize" min="${READ_SIZE.min}" max="${READ_SIZE.max}" step="${READ_SIZE.step}">
                <output class="ag2-num" for="ag2-read-size"></output>
            </div>
            <div class="ag2-set-row">
                <label class="ag2-set-lab" for="ag2-read-width">行宽<small>聊天正文和输入框的最大宽度</small></label>
                <input id="ag2-read-width" class="ag2-range" type="range" data-k="readWidth" min="${READ_WIDTH.min}" max="${READ_WIDTH.max}" step="${READ_WIDTH.step}">
                <output class="ag2-num" for="ag2-read-width"></output>
            </div>
            <div class="ag2-set-row">
                <label class="ag2-set-lab" for="ag2-meta">消息信息<small class="ag2-meta-sub"></small></label>
                <span class="ag2-select-wrap"><select id="ag2-meta" class="ag2-select" data-k="meta">
                    ${Object.entries(META_TEXT).map(([v, [n]]) => `<option value="${v}">${n}</option>`).join('')}
                </select>${icon('chevron-down', 13)}</span>
            </div>
            ${sw('reduced', '减少动态效果', '跟随系统设置；开启后关闭所有过渡和动画')}
            ${sw('glass', '毛玻璃', '关闭后改用不透明材质，低端设备更流畅')}
        </div>`;
    syncLook(body);
}

/** Re-reads every control from its source (ST's controls / shell settings). */
function syncLook(body = root?.querySelector('.ag2-set-body')) {
    if (!body || cur !== 'look') return;
    const a = appearance();
    const style = Number($('#chat_display').val() ?? 0);
    for (const b of body.querySelectorAll('.ag2-sty')) b.setAttribute('aria-checked', String(Number(b.dataset.style) === style));
    for (const b of body.querySelectorAll('.ag2-sw')) b.setAttribute('aria-checked', String(b.dataset.accent === a.accent));
    const size = body.querySelector('[data-k="readSize"]');
    const width = body.querySelector('[data-k="readWidth"]');
    size.value = a.readSize;
    width.value = a.readWidth;
    paintRange(size, `${a.readSize} px`);
    paintRange(width, `${a.readWidth} px`);
    const meta = body.querySelector('[data-k="meta"]');
    meta.value = a.meta;
    body.querySelector('.ag2-meta-sub').textContent = META_TEXT[a.meta][1];
    const rm = document.getElementById('reduced_motion');
    const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSwitch(body.querySelector('[data-k="reduced"]'), !!rm?.checked || osReduced, !rm || osReduced);
    const fast = document.getElementById('fast_ui_mode');
    setSwitch(body.querySelector('[data-k="glass"]'), !fast?.checked, !fast);
    // current background (ST paints it on #bg1; a per-chat one on #bg_custom)
    const thumb = body.querySelector('.ag2-wallthumb');
    const custom = document.getElementById('bg_custom');
    const src = [custom, document.getElementById('bg1')].map(el => el ? getComputedStyle(el).backgroundImage : 'none').find(v => v && v !== 'none') || 'none';
    thumb.style.backgroundImage = src;
    const file = (src.match(/url\(["']?([^"')]+)["']?\)/) || [])[1] || '';
    let name = '';
    try { name = decodeURIComponent(file.split('/').pop() || ''); } catch { name = file.split('/').pop() || ''; }
    body.querySelector('.ag2-bg-name').textContent = name ? name.replace(/\.[a-z0-9]+$/i, '') : '未设置';
}

function paintRange(input, text) {
    const pct = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty('--ag2-pct', pct + '%');
    const out = input.parentElement.querySelector('output');
    if (out) out.textContent = text;
}

function setSwitch(b, on, disabled) {
    if (!b) return;
    b.setAttribute('aria-checked', String(!!on));
    b.disabled = !!disabled;
}

function onLookClick(e) {
    const t = e.target;
    const sty = t.closest('.ag2-sty');
    if (sty) {
        // ST stores the value + saves on change; ../index.js applies the style class.
        $('#chat_display').val(sty.dataset.style).trigger('change');
        syncLook();
        return;
    }
    const swatch = t.closest('.ag2-sw');
    if (swatch) { setAppearance('accent', swatch.dataset.accent); syncLook(); return; }
    if (t.closest('[data-act="bg"]')) { go('bg'); return; }
    const sw = t.closest('.ag2-switch');
    if (sw && !sw.disabled) {
        const on = sw.getAttribute('aria-checked') !== 'true';
        if (sw.dataset.k === 'reduced') {
            $('#reduced_motion').prop('checked', on).trigger('input'); // ST listens on input
        } else if (sw.dataset.k === 'glass') {
            $('#fast_ui_mode').prop('checked', !on).trigger('change'); // 毛玻璃 = !fast_ui_mode
        }
        syncLook();
    }
}

function onLookInput(e) {
    const t = e.target;
    const k = t.dataset?.k;
    if (k === 'readSize' || k === 'readWidth') {
        paintRange(t, `${t.value} px`);
        if (e.type === 'input' || e.type === 'change') setAppearance(k, Number(t.value));
    } else if (k === 'meta' && e.type === 'change') {
        setAppearance('meta', t.value);
        syncLook();
    }
}

function renderAbout(body = root?.querySelector('.ag2-set-body')) {
    if (!body || cur !== 'about') return;
    const shellBuild = document.getElementById('ag2-shell')?.dataset.build || '';
    const theme = (() => { try { return ctx().powerUserSettings?.theme || ''; } catch { return ''; } })();
    const row = (k, v) => `<div class="ag2-set-row"><div class="ag2-set-lab">${k}</div><span class="ag2-set-val"></span></div>`;
    body.innerHTML = `
        <div class="ag2-set-gtitle">版本</div>
        <div class="ag2-set-group">${row('SillyTavern')}${row('Apple Glass 2 外壳')}${row('当前主题')}</div>
        <p class="ag2-set-note">图标来自 Lucide（ISC 许可）。原生界面可通过网址加 <code>?classic</code> 打开。</p>`;
    const vals = body.querySelectorAll('.ag2-set-val');
    vals[0].textContent = version || '…';
    vals[1].textContent = shellBuild;
    vals[2].textContent = theme;
    if (!version) fetchVersion();
}
