// Apple Glass 2 shell — title capsule, tool capsule, welcome page (DESIGN §5.2, §5.10).

import { icon } from './icons.js?v=20261113QA01';
import { openMenu } from './menu.js?v=20261113QA01';
import { ctx, h, guard, thumb, fmtTime, clickSt, openEntry, openSettings, newAssistantChat, setInspector, modCombo, isPhone } from './util.js?v=20261113QA01';
import { showBookmarksButtons } from '../../../../bookmarks.js';
import { getRecent, isLoaded, openRightMenu, row, rowKeys } from './sidebar.js?v=20261113QA01';

let title = null, tools = null, welcome = null;
let generating = false;

export function mount(shell, api) {
    // Title capsule: [expand-sidebar] [avatar · name / subtitle ⌄]
    title = guard(h('div', 'ag2-cap ag2-glass-float ag2-title-cap'));
    title.id = 'ag2-title';
    title.innerHTML = `
        <button type="button" class="ag2-ib ag2-expand" data-act="expand" aria-label="展开侧栏" title="展开侧栏（${modCombo('\\')}）">${icon('panel-left', 18)}</button>
        <div class="ag2-title-btn" role="button" tabindex="0" data-act="title" aria-haspopup="menu" aria-label="对话菜单">
            <span class="ag2-title-av"></span>
            <span class="ag2-title-text"><span class="ag2-title-name"></span><span class="ag2-title-sub"></span></span>
            ${icon('chevron-down', 14, 'ag2-chev')}
        </div>`;
    title.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'expand') api.setCollapsed(false);
        else if (isPhone()) setInspector(true); // phones: the title opens 角色资料 (§5.9)
        else titleMenu(b);
    });

    // Tool capsule: 世界书 · 作者注释 | 检视器
    tools = guard(h('div', 'ag2-cap ag2-glass-float ag2-tools-cap'));
    tools.id = 'ag2-tools';
    tools.innerHTML = `
        <button type="button" class="ag2-tool" data-act="wi" title="世界书">${icon('book-open', 15)}<span>世界书</span><i class="ag2-badge"></i></button>
        <button type="button" class="ag2-tool" data-act="an" title="作者注释">${icon('notebook-pen', 15)}<span>作者注释</span><i class="ag2-badge"></i></button>
        <span class="ag2-cap-sep"></span>
        <button type="button" class="ag2-ib ag2-insp-toggle" data-act="insp" aria-label="检视器" aria-pressed="false" title="检视器（${modCombo('.')}）">${icon('panel-right', 18)}</button>`;
    tools.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'wi') openSettings('wi');
        else if (b.dataset.act === 'an') clickSt('#option_toggle_AN');
        else if (b.dataset.act === 'insp') setInspector();
    });

    // Welcome page (no chat open), drawn outside #sheld.
    welcome = guard(h('section', 'ag2-welcome'));
    welcome.id = 'ag2-welcome';
    welcome.setAttribute('aria-label', '欢迎');
    welcome.innerHTML = `
        <div class="ag2-wel-inner">
            <h1 class="ag2-wel-title"></h1>
            <p class="ag2-wel-sub">继续最近的对话，或者开始新的。</p>
            <div class="ag2-wel-grid"></div>
            <div class="ag2-wel-actions">
                <button type="button" class="ag2-btn" data-act="create">${icon('user-plus', 16)}<span>新建角色</span></button>
                <button type="button" class="ag2-btn" data-act="import">${icon('file-input', 16)}<span>导入角色卡</span></button>
                <button type="button" class="ag2-btn" data-act="temp">${icon('message-square-text', 16)}<span>临时对话</span></button>
            </div>
        </div>`;
    welcome.addEventListener('click', async e => {
        const card = e.target.closest('[data-idx]');
        if (card) { const r = getRecent()[Number(card.dataset.idx)]; if (r) await openEntry(r); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'create') openRightMenu('#rm_button_create');
        else if (b.dataset.act === 'import') clickSt('#character_import_button');
        else if (b.dataset.act === 'temp') newAssistantChat({ temporary: true });
    });

    rowKeys(welcome);
    rowKeys(title); // the title trigger is a two-line div[role=button]
    shell.append(title, tools, welcome);
}

export function unmount() {
    title?.remove(); tools?.remove(); welcome?.remove();
    title = tools = welcome = null;
}

export function setGenerating(on) {
    generating = on;
    updateTitle();
}

/** ST shows / hides its own #option_* rows (inline display); read the result. */
const stShown = id => { const el = document.getElementById(id); return !!el && el.style.display !== 'none' && !el.classList.contains('displayNone'); };

function titleMenu(anchor) {
    openMenu(anchor, chatMenuItems());
}

/** The title menu's items (desktop title capsule; the phone ⋯ menu reuses them, §5.9). */
export function chatMenuItems() {
    const c = ctx();
    const inChat = c.characterId !== undefined || !!c.groupId;
    // Checkpoint / back to main / convert to group follow ST's own rules (bookmarks.js §9.2 #6).
    try { showBookmarksButtons(); } catch { /* no chat */ }
    const bm = inChat && stShown('option_new_bookmark');
    const back = inChat && stShown('option_back_to_main');
    const conv = inChat && !c.groupId && stShown('option_convert_to_group');
    return [
        { id: 'select', label: '切换聊天文件…', icon: 'history', disabled: !inChat, onSelect: () => clickSt('#option_select_chat') },
        { id: 'new', label: '新对话', icon: 'message-square-text', disabled: !inChat, onSelect: () => clickSt('#option_start_new_chat') },
        bm && { id: 'checkpoint', label: '创建检查点', icon: 'flag', onSelect: () => clickSt('#option_new_bookmark') },
        back && { id: 'main', label: '回到主线', icon: 'git-branch', onSelect: () => clickSt('#option_back_to_main') },
        conv && { id: 'group', label: '转为群聊', icon: 'users', onSelect: () => clickSt('#option_convert_to_group') },
        { separator: true },
        { id: 'close', label: '关闭对话', icon: 'x', onSelect: () => clickSt('#option_close_chat') },
    ];
}

function charWorld(c) {
    if (c.groupId || c.characterId === undefined) return '';
    const ch = c.characters[c.characterId];
    return ch?.data?.extensions?.world || '';
}

export function updateTitle() {
    if (!title) return;
    const c = ctx();
    const av = title.querySelector('.ag2-title-av');
    av.replaceChildren();
    let name = c.name2 || '';
    if (c.groupId) {
        const g = c.groups.find(x => String(x.id) === String(c.groupId));
        name = g?.name || name;
        av.classList.add('ag2-av-stack');
        if (g?.avatar_url) { av.classList.remove('ag2-av-stack'); const i = h('img'); i.alt = ''; i.src = g.avatar_url; av.append(i); }
        else for (const m of (g?.members || []).slice(0, 2)) { const i = h('img'); i.alt = ''; i.src = thumb('avatar', m); av.append(i); }
    } else {
        av.classList.remove('ag2-av-stack');
        const ch = c.characters[c.characterId];
        const i = h('img'); i.alt = '';
        i.src = ch ? thumb('avatar', ch.avatar) : 'img/five.png';
        av.append(i);
    }
    title.querySelector('.ag2-title-name').textContent = name;
    const world = c.chatMetadata?.world_info || charWorld(c);
    const n = Array.isArray(c.chat) ? c.chat.length : 0;
    const sub = generating ? '正在回复…' : `${n} 条消息${world ? ' · 世界书 ' + world : ''}`;
    title.querySelector('.ag2-title-sub').textContent = sub;
    title.querySelector('.ag2-title-btn').title = `${name} · ${sub}`;
    if (tools) {
        tools.querySelector('[data-act="wi"]').classList.toggle('ag2-has', !!world);
        tools.querySelector('[data-act="an"]').classList.toggle('ag2-has', !!String(c.chatMetadata?.note_prompt ?? '').trim());
    }
}

function greeting() {
    const hr = new Date().getHours();
    const part = hr < 5 ? '夜深了' : hr < 11 ? '早上好' : hr < 13 ? '中午好' : hr < 18 ? '下午好' : '晚上好';
    const n = ctx().name1;
    return n ? `${part}，${n}` : part;
}

export function renderWelcome() {
    if (!welcome) return;
    welcome.querySelector('.ag2-wel-title').textContent = greeting();
    const grid = welcome.querySelector('.ag2-wel-grid');
    const all = getRecent();
    const list = all.slice().sort((a, b) => (b.pinned - a.pinned) || ((Date.parse(b.last_mes) || 0) - (Date.parse(a.last_mes) || 0))).slice(0, 6);
    const frag = document.createDocumentFragment();
    for (const e of list) {
        const b = row('ag2-wel-card');
        b.dataset.idx = String(all.indexOf(e));
        b.title = `${e.name} · ${e.file_name.replace(/\.jsonl$/, '')}`;
        const head = h('span', 'ag2-wel-card-head');
        const img = h('img', 'ag2-av ag2-av-32'); img.alt = ''; img.loading = 'lazy'; img.draggable = false;
        img.src = e.group ? (e.groupAvatar || thumb('avatar', e.members?.[0])) : thumb('avatar', e.avatar);
        head.append(img, h('span', 'ag2-row-name', e.name), h('span', 'ag2-row-time', fmtTime(e.last_mes)));
        b.append(head, h('span', 'ag2-wel-card-text', e.text || `${e.chat_items || 0} 条消息`));
        frag.append(b);
    }
    if (!list.length) frag.append(h('div', 'ag2-empty-note', isLoaded() ? '还没有对话' : '正在载入…'));
    grid.replaceChildren(frag);
}
