// Apple Glass 2 shell — phone navigation (DESIGN §5.9, design 05).
//
// Imported by index.js only at ≤1000px (body.ag2-phone, width only — never the UA); a
// desktop never downloads it. Pages, on body[data-ag2-ph]:
//   list — the sidebar (#ag2-sidebar) as a full-screen 大标题 list (对话 / 角色 / 群组
//          segments) above a floating tab bar 对话 · 角色 · 世界书 · 设置;
//   chat — ST's #sheld, with three capsules ‹ (back) · title · ⋯ and ST's composer below.
// Every shell node here is a child of #ag2-shell, outside #sheld: ST turns a horizontal swipe
// inside #sheld into “swipe the last reply” (RossAscends-mods), so lists and sheets must not
// live there. 世界书 / 设置 open the settings sheet (settings.js phone mode); the title (or
// ⋯ › 角色资料) opens the inspector as a full-screen sheet (inspector.js + CSS §5.9).
// Keyboard (iOS has no interactive-widget): visualViewport → --ag2-vvh / --ag2-vvt on body,
// body.ag2-kb while it is up; the chat page is sized from them so the composer rides on the
// keyboard's top edge.
// State: localStorage ag2.phPage = list | chat (per device, §9.1).

import { icon } from './icons.js?v=20261113QA01';
import { openMenu, closeMenu, isMenuOpen } from './menu.js?v=20261113QA01';
import { local } from './store.js?v=20261113QA01';
import { ctx, h, guard, getCurrentChatId, openSettings, setInspector, inspectorModule, openPalette, clickSt } from './util.js?v=20261113QA01';
import { chatMenuItems } from './chrome.js?v=20261113QA01';
import { segment, setSegment } from './sidebar.js?v=20261113QA01';

const TABS = [['chats', '对话', 'messages-square'], ['chars', '角色', 'users'], ['wi', '世界书', 'book-open'], ['settings', '设置', 'settings']];
const SEG_TITLE = { chats: '对话', chars: '角色', groups: '群组' };

let mounted = false;
let nodes = [];
let off = [];
let want = 'list';     // the page the user asked for; `chat` shows only while a chat is open
let lastChat = '';

export const isMounted = () => mounted;
export const page = () => document.body.dataset.ag2Ph || null;

export function mount(shell) {
    if (mounted || !shell) return;
    const side = document.getElementById('ag2-sidebar');
    if (!side) return;
    mounted = true;

    // 大标题 (32/760) above the search field; text follows the segment
    const big = h('h1', 'ag2-ph-x ag2-ph-big');
    side.querySelector('.ag2-side-head')?.after(big);

    const bar = guard(h('nav', 'ag2-ph-x ag2-ph-tabs'));
    bar.id = 'ag2-tabbar';
    bar.setAttribute('aria-label', '主导航');
    bar.innerHTML = TABS.map(([k, t, ic]) => `<button type="button" data-tab="${k}">${icon(ic, 22)}<span>${t}</span></button>`).join('');
    bar.addEventListener('click', onTab);

    const back = guard(h('button', 'ag2-ph-x ag2-cap ag2-ph-round'));
    back.id = 'ag2-ph-back';
    back.type = 'button';
    back.setAttribute('aria-label', '返回对话列表');
    back.title = '返回';
    back.innerHTML = icon('chevron-left', 22);
    back.addEventListener('click', () => setPage('list'));

    const more = guard(h('button', 'ag2-ph-x ag2-cap ag2-ph-round'));
    more.id = 'ag2-ph-more';
    more.type = 'button';
    more.setAttribute('aria-label', '更多');
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.title = '更多';
    setMoreIcon(more, 'ellipsis', '更多');
    // ⋯ opens the chat menu; while it is open the same button is × and closes it (R3a task 1).
    more.addEventListener('click', () => {
        if (isMenuOpen() && moreMenuOwner === more) { closeMenu(); return; }
        moreMenu(more);
    });

    shell.append(bar, back, more);
    nodes = [big, bar, back, more];

    // the title opens 角色资料 here (chrome.js), not a menu
    const tb = document.querySelector('#ag2-title .ag2-title-btn');
    if (tb) { tb.setAttribute('aria-haspopup', 'dialog'); tb.setAttribute('aria-label', '角色资料'); }

    const mo = new MutationObserver(syncTabs);
    mo.observe(side, { attributes: true, attributeFilter: ['data-segment'] });
    off.push(() => mo.disconnect());

    // Tapping the chat that is already open only has to push the chat page (no CHAT_CHANGED).
    const list = side.querySelector('.ag2-side-list');
    list.addEventListener('click', onListTap, true);
    off.push(() => list.removeEventListener('click', onListTap, true));

    const { eventSource, eventTypes: E } = ctx();
    eventSource.on(E.CHAT_CHANGED, onChat);
    off.push(() => eventSource.removeListener(E.CHAT_CHANGED, onChat));

    const vv = window.visualViewport;
    if (vv) {
        vv.addEventListener('resize', onViewport);
        vv.addEventListener('scroll', onViewport);
        off.push(() => { vv.removeEventListener('resize', onViewport); vv.removeEventListener('scroll', onViewport); });
    }
    onViewport();

    want = local.get('phPage', 'list') === 'chat' ? 'chat' : 'list';
    // mounted mid-session (window narrowed, theme switched): stay on the open chat
    if (document.body.classList.contains('ag2-ready') && chatKey()) want = 'chat';
    lastChat = chatKey();
    apply();
    syncTabs();
}

export function unmount() {
    if (!mounted) return;
    mounted = false;
    closeMenu();
    off.forEach(f => { try { f(); } catch { /* */ } });
    off = [];
    nodes.forEach(n => n.remove());
    nodes = [];
    const tb = document.querySelector('#ag2-title .ag2-title-btn');
    if (tb) { tb.setAttribute('aria-haspopup', 'menu'); tb.setAttribute('aria-label', '对话菜单'); }
    delete document.body.dataset.ag2Ph;
    document.body.classList.remove('ag2-kb');
    document.body.style.removeProperty('--ag2-vvh');
    document.body.style.removeProperty('--ag2-vvt');
}

// ------------------------------------------------------------------ pages

function chatKey() {
    const c = ctx();
    if (c.characterId === undefined && !c.groupId) return '';
    return (c.groupId ? 'g:' + c.groupId : 'c:' + c.characterId) + '/' + (getCurrentChatId() || '');
}

/** list | chat. `chat` falls back to the list while no chat is open (welcome state). */
export function setPage(p) {
    want = p === 'chat' ? 'chat' : 'list';
    local.set('phPage', want);
    apply();
}

function apply() {
    const p = want === 'chat' && chatKey() ? 'chat' : 'list';
    if (document.body.dataset.ag2Ph === p) return;
    closeMenu();
    document.body.dataset.ag2Ph = p;
    // the inspector sheet belongs to the chat page
    if (p === 'list' && document.body.classList.contains('ag2-insp-open')) setInspector(false);
    for (const b of nodes[1]?.querySelectorAll('[data-tab]') || []) b.tabIndex = p === 'list' ? 0 : -1;
}

/**
 * A different chat after the user has interacted (row tap, palette, 新对话, ST's own pickers …)
 * pushes the chat page; the chat ST restores at start-up does not (the stored page decides).
 * No chat any more (关闭对话, deleted) → the list.
 */
function onChat() {
    if (!mounted) return;
    const k = chatKey();
    const changed = k !== lastChat;
    lastChat = k;
    const active = navigator.userActivation ? navigator.userActivation.hasBeenActive : document.body.classList.contains('ag2-ready');
    if (changed && k && active) setPage('chat');
    else if (!k && active) want = 'list';
    apply();
}

function onListTap(e) {
    const row = e.target.closest('.ag2-row');
    if (row?.classList.contains('ag2-on')) setPage('chat');
}

function onTab(e) {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    const t = b.dataset.tab;
    if (t === 'chats' || t === 'chars') {
        setSegment(t);
        document.querySelector('#ag2-sidebar .ag2-side-list')?.scrollTo({ top: 0 });
    } else if (t === 'wi') openSettings('wi');
    else openSettings(null); // the sheet's list level
}

function syncTabs() {
    const seg = segment();
    const big = nodes[0];
    if (big) big.textContent = SEG_TITLE[seg] || '对话';
    const tab = seg === 'chats' ? 'chats' : 'chars';
    for (const b of nodes[1]?.querySelectorAll('[data-tab]') || []) {
        const on = b.dataset.tab === tab;
        b.classList.toggle('ag2-on', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
}

async function showInspector(seg) {
    await setInspector(true);
    inspectorModule()?.setSeg?.(seg);
}

/** The button that currently owns the open ⋯ menu (null when none) — R3a task 1. */
let moreMenuOwner = null;

/** Swaps the ⋯ button's glyph/label; the icon fades+rotates in via CSS (§5.9, --ag2-dur). */
function setMoreIcon(btn, name, label) {
    if (!btn) return;
    btn.innerHTML = icon(name, name === 'x' ? 18 : 20);
    btn.setAttribute('aria-label', label);
    btn.title = label;
}

function moreMenu(anchor) {
    const c = ctx();
    const inChat = !!chatKey();
    openMenu(anchor, [
        { id: 'profile', label: c.groupId ? '群组资料' : '角色资料', icon: 'contact', disabled: !inChat, onSelect: () => showInspector('main') },
        { id: 'chatinfo', label: '本次对话', icon: 'scroll-text', disabled: !inChat, onSelect: () => showInspector('chat') },
        { id: 'wi', label: '世界书', icon: 'book-open', onSelect: () => openSettings('wi') },
        { id: 'an', label: '作者注释', icon: 'notebook-pen', disabled: !inChat, onSelect: () => clickSt('#option_toggle_AN') },
        { separator: true },
        ...chatMenuItems(),
        { separator: true },
        { id: 'search', label: '搜索…', icon: 'search', onSelect: () => openPalette() },
    ], {
        align: 'end',
        // Every close path (outside tap, item pick, Esc, page switch, unmount) restores ⋯.
        // The callback captures its own anchor: a later openMenu() (which closes the current
        // menu first) only restores the icon if it is still the owner.
        onClose: () => {
            if (moreMenuOwner === anchor) {
                setMoreIcon(anchor, 'ellipsis', '更多');
                anchor.setAttribute('aria-expanded', 'false');
                moreMenuOwner = null;
            }
        },
    });
    // Set after openMenu (its internal closeMenu() may have run the previous onClose).
    moreMenuOwner = anchor;
    setMoreIcon(anchor, 'x', '关闭菜单');
    anchor.setAttribute('aria-expanded', 'true');
}

// ------------------------------------------------------------------ keyboard / viewport

function onViewport() {
    const vv = window.visualViewport;
    const s = document.body.style;
    if (!vv) return;
    s.setProperty('--ag2-vvh', Math.round(vv.height) + 'px');
    s.setProperty('--ag2-vvt', Math.max(0, Math.round(vv.offsetTop)) + 'px');
    // iOS keeps the layout viewport and shrinks only the visual one; Android Chrome
    // (interactive-widget=resizes-content) resizes both, where this stays false and the
    // layout follows by itself.
    document.body.classList.toggle('ag2-kb', window.innerHeight - vv.height > 120);
}
