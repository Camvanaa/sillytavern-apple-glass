// Apple Glass 2 shell — inspector (DESIGN §5.6, §9.2 #2/#3). Loaded on first use only.
//
// The inspector IS ST's #right-nav-panel: nothing of ST's is moved or cloned. CSS turns the
// panel into the right-hand glass panel and decides which block shows; this module adds a few
// presentation nodes of its own (all `.ag2-insp-x`, removed on unmount):
//   panel   : head (segments 角色|本次对话 + ×), empty state, 本次对话 page
//   #form_create (ST's character editor — its fields stay inside the form, FormData is untouched):
//             hero, quick actions, description / first-message card heads + summaries,
//             secondary entries, footer (tokens · created)
//   #tags_div: the name line (above ST's own tag capsules) and “+ 标签”
// Stale-editor rule (§9.2 #3): ST autosaves whatever character `#avatar_url_pole` points to,
// so the form is only shown (panel[data-ag2-insp="char"]) when the menu type is
// character_edit AND that field is the open chat's character; the group form only for
// group_edit of the open group. Anything else → ask ST to re-select (its own
// #rm_button_selected_ch) and show a neutral placeholder meanwhile.

import { icon } from './icons.js?v=20261114VF02';
import { openMenu, closeMenu } from './menu.js?v=20261114VF02';
import { local } from './store.js?v=20261114VF02';
import { ctx, h, guard, clickSt, isDesktop, INSP_ID, setInspector, restoreInspectorPin, getCurrentChatId, summary, toDate } from './util.js?v=20261114VF02';
import { guarded } from './index.js?v=20261114VF02';
import { openGroupId } from '../../../../group-chats.js';

let panel = null;
let mounted = false;
let nodes = [];
let listeners = [];
let observers = [];
let seg = local.get('inspSeg', 'main') === 'chat' ? 'chat' : 'main';
let resyncKey = '';
let raf = 0;
let mq = null;
let ui = {};

const $id = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');

function node(tag, cls, id) {
    const e = guard(h(tag, 'ag2-insp-x ' + cls));
    if (id) e.id = id;
    if (tag === 'button') e.type = 'button';
    nodes.push(e);
    return e;
}

/** Menus anchored in the panel live above it (#ag2-layer, z 3006; see menu.js). */
function layer() {
    let l = $id('ag2-layer');
    if (!l) { l = h('div'); l.id = 'ag2-layer'; document.body.append(l); }
    return l;
}

function listen(type, fn) {
    if (!type) return;
    const w = guarded(fn);
    ctx().eventSource.on(type, w);
    listeners.push([type, w]);
}

export function mount() {
    if (mounted) return;
    panel = $id(INSP_ID);
    const form = $id('form_create');
    if (!panel || !form) return;
    mounted = true;

    // --- panel head: segments + close
    const head = node('div', 'ag2-insp-head', 'ag2-insp-head');
    head.innerHTML = `
        <div class="ag2-insp-seg" role="tablist" aria-label="检视器分段">
            <button type="button" role="tab" data-ag2-act="seg" data-seg="main"><span>角色</span></button>
            <button type="button" role="tab" data-ag2-act="seg" data-seg="chat"><span>本次对话</span></button>
        </div>
        <button type="button" class="ag2-insp-ib" data-ag2-act="close" aria-label="关闭检视器" title="关闭检视器">${icon('x', 16)}</button>`;
    panel.prepend(head);

    const empty = node('div', 'ag2-insp-empty', 'ag2-insp-empty');
    empty.innerHTML = `${icon('panel-right', 30)}
        <p class="ag2-insp-empty-t ag2-when-empty">选择一个对话</p>
        <p class="ag2-insp-empty-s ag2-when-empty">在左侧选择角色或对话后，这里显示它的资料。</p>
        <p class="ag2-insp-empty-t ag2-when-pending">正在载入…</p>`;
    const chat = node('div', 'ag2-insp-chat', 'ag2-insp-chat');
    panel.append(empty, chat);

    // --- character page (inside ST's form; ST's fields are never moved)
    const hero = node('div', 'ag2-insp-hero', 'ag2-insp-hero');
    hero.innerHTML = '<img alt="" draggable="false" decoding="async"><span class="ag2-insp-hero-fade"></span>';
    const acts = node('div', 'ag2-insp-actions', 'ag2-insp-actions');
    acts.innerHTML = `
        <button type="button" data-ag2-act="fav" title="收藏">${icon('star', 18)}<span>收藏</span></button>
        <button type="button" data-ag2-act="newchat" title="新对话">${icon('messages-square', 18)}<span>新对话</span></button>
        <button type="button" data-ag2-act="world" title="角色世界书（Shift 点击：绑定）">${icon('book-open', 18)}<span>世界书</span></button>
        <button type="button" data-ag2-act="more" aria-haspopup="menu" title="更多">${icon('ellipsis', 18)}<span>更多</span></button>`;
    form.prepend(hero, acts);

    const name = node('div', 'ag2-insp-name', 'ag2-insp-name');
    const addTag = node('button', 'ag2-insp-addtag', 'ag2-insp-addtag');
    addTag.dataset.ag2Act = 'addtag';
    addTag.textContent = '+ 标签';
    $id('tags_div')?.prepend(name);
    $id('tagList')?.after(addTag);

    const card = (wrapId, id, title, extra) => {
        const top = node('div', 'ag2-insp-card-head', id + '-head');
        top.innerHTML = `<span class="ag2-insp-card-t">${title}</span>${extra}`;
        const sum = node('div', 'ag2-insp-sum', id + '-sum');
        $id(wrapId)?.prepend(top, sum);
        return { top, sum };
    };
    const desc = card('descriptionWrapper', 'ag2-insp-desc', '角色描述',
        '<button type="button" class="ag2-insp-link" data-ag2-act="edit" data-field="desc">编辑</button>');
    const first = card('firstMessageWrapper', 'ag2-insp-first', '开场白',
        '<button type="button" class="ag2-insp-link" data-ag2-act="edit" data-field="first">编辑</button>'
        + '<button type="button" class="ag2-insp-link" data-ag2-act="alt"></button>');

    const links = node('div', 'ag2-insp-links', 'ag2-insp-links');
    links.innerHTML = [
        ['persona', 'contact', '绑定人设'],
        ['charworld', 'book-marked', '角色世界书'],
        ['notes', 'notebook-pen', '创作者的注释'],
        ['adv', 'sliders-horizontal', '高级定义'],
    ].map(([a, i, t]) => `<button type="button" class="ag2-insp-row" data-ag2-act="${a}">${icon(i, 17)}<span class="ag2-insp-row-t">${t}</span><span class="ag2-insp-row-v"></span>${icon('chevron-right', 14, 'ag2-insp-chev')}</button>`).join('');
    const foot = node('div', 'ag2-insp-foot', 'ag2-insp-foot');
    foot.innerHTML = '<span class="ag2-insp-tok"></span><span class="ag2-insp-date"></span>';
    const hidden = $id('hidden-divs');
    if (hidden) form.insertBefore(links, hidden); else form.append(links);
    links.after(foot);

    ui = { head, empty, chat, hero, acts, name, addTag, desc, first, links, foot };

    // One delegated handler for every shell node in the panel.
    panel.addEventListener('click', onClick);
    $id('tags_div')?.addEventListener('focusout', onTagFocusOut);

    // --- re-render triggers
    const E = ctx().eventTypes;
    for (const t of [E.CHAT_CHANGED, E.CHARACTER_EDITOR_OPENED, E.CHARACTER_EDITED, E.CHARACTER_RENAMED,
        E.CHARACTER_DELETED, E.GROUP_UPDATED, E.MESSAGE_SENT, E.MESSAGE_RECEIVED, E.MESSAGE_DELETED,
        E.SETTINGS_UPDATED, E.WORLDINFO_SETTINGS_UPDATED]) listen(t, schedule);
    listen(E.CHAT_CHANGED, () => { resyncKey = ''; });
    // ST's menu switch (data-menu-type) and chat clearing / filling (switching chats) re-check
    // freshness synchronously: observer callbacks run as a microtask, before the next paint,
    // so a switched characterId never gets a frame with the previous character's form.
    const mo = new MutationObserver(guarded(() => render()));
    mo.observe(panel, { attributes: true, attributeFilter: ['data-menu-type'] });
    const chatEl = $id('chat');
    if (chatEl) mo.observe(chatEl, { childList: true });
    for (const id of ['result_info_total_tokens', 'result_info_permanent_tokens']) {
        const el = $id(id);
        if (el) mo.observe(el, { childList: true, characterData: true, subtree: true });
    }
    observers.push(mo);
    mq = window.matchMedia('(min-width: 1001px)');
    mq.addEventListener('change', onMq);
    sync();
}

const onMq = guarded(() => sync());

export function unmount() {
    clearTimeout(notesTimer);
    clearTimeout(tagTimer);
    if (!mounted) return;
    mounted = false;
    closeMenu();
    for (const [t, fn] of listeners) { try { ctx().eventSource.removeListener(t, fn); } catch { /* */ } }
    listeners = [];
    observers.forEach(o => o.disconnect());
    observers = [];
    mq?.removeEventListener('change', onMq);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    panel?.removeEventListener('click', onClick);
    $id('tags_div')?.removeEventListener('focusout', onTagFocusOut);
    nodes.forEach(n => n.remove());
    nodes = [];
    $id('ag2-layer')?.remove();
    if (panel) {
        for (const k of ['ag2Insp', 'ag2Edit', 'ag2Tagging', 'ag2Notes']) delete panel.dataset[k];
        restoreInspectorPin();
    }
    document.body.classList.remove('ag2-insp-open');
    panel = null;
    ui = {};
}

/** Follows ST's `.openDrawer` on the panel (called by index.js's drawer observer too). */
export function sync() {
    if (!mounted) return;
    // both layouts: desktop column / floating panel, phone full-screen sheet (§5.9)
    const open = panel.classList.contains('openDrawer');
    document.body.classList.toggle('ag2-insp-open', open);
    if (open) panel.classList.add('pinnedOpen');
    const t = document.querySelector('#ag2-tools [data-act="insp"]');
    if (t) { t.setAttribute('aria-pressed', String(open)); t.classList.toggle('ag2-on', open); }
    if (open) render();
}

function schedule() {
    if (!mounted || raf) return;
    raf = requestAnimationFrame(guarded(() => { raf = 0; render(); }));
}

// ------------------------------------------------------------------ view
/** Which block may show. Never the form of a character / group other than the open one. */
export function computeView() {
    const c = ctx();
    const mt = panel.dataset.menuType || 'characters';
    if (mt === 'create' || mt === 'group_create') return mt; // ST's own fresh “new” forms
    const inChat = c.characterId !== undefined || !!c.groupId;
    if (!inChat) return 'empty';
    if (seg === 'chat') return 'chat';
    const ch = c.characterId !== undefined ? c.characters[c.characterId] : null;
    if (mt === 'character_edit' && ch && $id('avatar_url_pole')?.value === ch.avatar) return 'char';
    if (c.groupId && c.characterId === undefined && mt === 'group_edit' && String(openGroupId) === String(c.groupId)) return 'group';
    resync(mt);
    return 'pending';
}

/** Ask ST to show the open chat's editor (its own “selected character” tab button). Once per state. */
function resync(mt) {
    const c = ctx();
    const key = `${c.characterId}|${c.groupId}|${mt}`;
    if (resyncKey === key) return;
    resyncKey = key;
    setTimeout(guarded(() => { clickSt('#rm_button_selected_ch'); schedule(); }), 0);
}

export function render() {
    if (!mounted || !document.body.classList.contains('ag2-insp-open')) return;
    const c = ctx();
    const view = computeView();
    panel.dataset.ag2Insp = view;
    // head
    const inChat = c.characterId !== undefined || !!c.groupId;
    const segBtns = ui.head.querySelectorAll('[data-seg]');
    segBtns[0].querySelector('span').textContent = c.groupId && c.characterId === undefined ? '群组' : '角色';
    for (const b of segBtns) {
        const on = (b.dataset.seg === seg) && inChat;
        b.classList.toggle('ag2-on', on);
        b.setAttribute('aria-selected', String(on));
        b.disabled = !inChat;
    }
    ui.head.classList.toggle('ag2-insp-head-new', view === 'create' || view === 'group_create');
    if (view === 'char') renderChar(c);
    else if (view === 'chat') renderChat(c);
}

function renderChar(c) {
    const ch = c.characters[c.characterId];
    // Hero: the card's original image (not the thumbnail), §5.6
    const img = ui.hero.querySelector('img');
    const src = ch.avatar && ch.avatar !== 'none' ? `/characters/${encodeURIComponent(ch.avatar)}` : 'img/ai4.png';
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    ui.name.textContent = ch.name || '';
    ui.name.title = ch.name || '';
    ui.acts.querySelector('[data-ag2-act="fav"]').classList.toggle('ag2-on', !!$id('favorite_button')?.classList.contains('fav_on'));
    // Cards: summaries read ST's own fields (what is being edited), not a copy.
    const editing = panel.dataset.ag2Edit;
    const descText = $id('description_textarea')?.value ?? ch.description ?? '';
    const firstText = $id('firstmessage_textarea')?.value ?? ch.first_mes ?? '';
    if (editing !== 'desc') ui.desc.sum.textContent = summary(descText, 600) || '（没有描述）';
    if (editing !== 'first') ui.first.sum.textContent = summary(firstText, 300) || '（没有开场白）';
    ui.desc.top.querySelector('[data-ag2-act="edit"]').textContent = editing === 'desc' ? '完成' : '编辑';
    ui.first.top.querySelector('[data-ag2-act="edit"]').textContent = editing === 'first' ? '完成' : '编辑';
    const alts = Array.isArray(ch.data?.alternate_greetings) ? ch.data.alternate_greetings.length : 0;
    ui.first.top.querySelector('[data-ag2-act="alt"]').textContent = alts ? `${alts} 个备选` : '添加备选';
    // Secondary entries
    const val = (a, v) => { ui.links.querySelector(`[data-ag2-act="${a}"] .ag2-insp-row-v`).textContent = v; };
    val('persona', personaFor(c, ch.avatar));
    val('charworld', ch.data?.extensions?.world || '未绑定');
    const notes = String(ch.data?.creator_notes || ch.creatorcomment || '').trim();
    // R2b: no notes → the row only reads “无” and does nothing; a click must not open
    // ST's empty #creator_notes_empty block in the inspector.
    const notesBtn = ui.links.querySelector('[data-ag2-act="notes"]');
    if (notesBtn) notesBtn.disabled = !notes;
    if (!notes) delete panel.dataset.ag2Notes;
    val('notes', notes ? (panel.dataset.ag2Notes ? '收起' : '查看') : '无');
    val('adv', '');
    // Footer: ST's token counter (#result_info) + creation date
    const tot = ($id('result_info_total_tokens')?.textContent || '').trim();
    const perm = ($id('result_info_permanent_tokens')?.textContent || '').trim();
    ui.foot.querySelector('.ag2-insp-tok').textContent = /\d/.test(tot) ? `永久 ${perm || '—'} · 总计 ${tot} tokens` : '正在统计 tokens…';
    const d = toDate($id('create_date_pole')?.value) || toDate(ch.create_date);
    ui.foot.querySelector('.ag2-insp-date').textContent = d && !isNaN(d) ? `创建于 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
}

function personaFor(c, avatar) {
    const pu = c.powerUserSettings || {};
    const names = [];
    for (const [id, d] of Object.entries(pu.persona_descriptions || {})) {
        if ((d?.connections || []).some(x => x?.type === 'character' && x?.id === avatar)) names.push(pu.personas?.[id] || id);
    }
    return names.length ? names.join('、') : '未绑定';
}

function renderChat(c) {
    const md = c.chatMetadata || {};
    const file = getCurrentChatId() || '';
    const n = Array.isArray(c.chat) ? c.chat.length : 0;
    const note = String(md.note_prompt ?? '').trim();
    const rows = [
        ['聊天文件', file],
        ['消息', `${n} 条`],
        ['聊天世界书', md.world_info || '未绑定', 'chatworld'],
        ['分支', md.main_chat ? `检查点 · 主线 ${md.main_chat}` : '主线'],
    ];
    const frag = document.createDocumentFragment();
    const info = h('div', 'ag2-insp-card ag2-insp-info');
    for (const [k, v, act] of rows) {
        const r = h(act ? 'button' : 'div', 'ag2-insp-kv');
        if (act) { r.type = 'button'; r.dataset.ag2Act = act; r.title = '绑定或更换这个聊天的世界书'; }
        r.append(h('span', 'ag2-insp-k', k), h('span', 'ag2-insp-v', v));
        info.append(r);
    }
    const list = h('div', 'ag2-insp-card ag2-insp-entries');
    for (const [a, i, t, v] of [
        ['an', 'notebook-pen', '作者注释', note ? '有内容' : ''],
        ['cfg', 'sliders-horizontal', 'CFG', ''],
        ['logprobs', 'list-ordered', 'Logprobs', ''],
    ]) {
        const b = h('button', 'ag2-insp-row');
        b.type = 'button';
        b.dataset.ag2Act = a;
        b.innerHTML = `${icon(i, 17)}<span class="ag2-insp-row-t"></span><span class="ag2-insp-row-v"></span>${icon('chevron-right', 14, 'ag2-insp-chev')}`;
        b.querySelector('.ag2-insp-row-t').textContent = t;
        b.querySelector('.ag2-insp-row-v').textContent = v;
        list.append(b);
    }
    const hint = h('p', 'ag2-insp-hint', '作者注释、CFG 和 Logprobs 在 ST 自己的浮动面板里打开（桌面上显示在检视器左侧）。');
    frag.append(info, list, hint);
    ui.chat.replaceChildren(frag);
}

// ------------------------------------------------------------------ actions
export function setSeg(s) {
    seg = s === 'chat' ? 'chat' : 'main';
    local.set('inspSeg', seg);
    render();
}

/** Picks an option of ST's “more” dropdown (#char-management-dropdown) the way a user would. */
function pickManagement(optId) {
    const sel = $id('char-management-dropdown');
    const opt = $id(optId);
    if (!sel || !opt || opt.disabled) return false;
    opt.selected = true;
    $(sel).trigger('change');
    return true;
}

function moreMenu(anchor) {
    const c = ctx();
    const inGroup = !!c.groupId;
    const src = $id('character_source');
    openMenu(anchor, [
        { label: '导出为 PNG', icon: 'download', onSelect: () => clickSt('#export_format_popup .export_format[data-format="png"]') },
        { label: '导出为 JSON', icon: 'file-text', onSelect: () => clickSt('#export_format_popup .export_format[data-format="json"]') },
        { label: '复制角色', icon: 'copy', onSelect: () => clickSt('#dupe_button') },
        { label: '重命名…', icon: 'pencil', onSelect: () => pickManagement('renameCharButton') },
        { label: '更换头像…', icon: 'image', onSelect: () => clickSt('#add_avatar_button') },
        { separator: true },
        { label: '转为群聊', icon: 'users', disabled: inGroup, onSelect: () => clickSt('#option_convert_to_group') },
        { label: '角色设置覆盖…', icon: 'sliders-horizontal', disabled: inGroup, onSelect: () => pickManagement('set_chat_character_settings') },
        { label: '转为人设', icon: 'contact', onSelect: () => pickManagement('convert_to_persona') },
        { label: '导入卡内世界书', icon: 'file-input', onSelect: () => pickManagement('import_character_info') },
        { label: '打开来源链接', icon: 'globe', disabled: !src || src.disabled, onSelect: () => pickManagement('character_source') },
        { separator: true },
        { label: '删除角色…', icon: 'trash-2', danger: true, onSelect: () => clickSt('#delete_button') },
    ], { align: 'end', host: layer(), id: 'ag2-insp-more' });
}

function toggleEdit(field) {
    const ta = $id(field === 'desc' ? 'description_textarea' : 'firstmessage_textarea');
    if (panel.dataset.ag2Edit === field) {
        delete panel.dataset.ag2Edit;
        render();
        return;
    }
    panel.dataset.ag2Edit = field;
    render();
    ta?.focus({ preventScroll: true });
    ta?.scrollIntoView({ block: 'nearest' });
}

let notesTimer = 0;
function toggleNotes() {
    clearTimeout(notesTimer);
    // R2b: nothing to show → stay shut (the row is also disabled in renderChar).
    const notes = String($id('creator_notes_spoiler')?.textContent || '').trim();
    if (panel.dataset.ag2Notes) delete panel.dataset.ag2Notes;
    else {
        if (!notes) return;
        panel.dataset.ag2Notes = '1';
        // ST's own inline drawer: open its content if it is collapsed.
        const content = document.querySelector('#spoiler_free_desc > .inline-drawer-content');
        if (content && getComputedStyle(content).display === 'none') $('#spoiler_free_desc > .inline-drawer-toggle').trigger('click');
        const owner = panel;
        notesTimer = setTimeout(() => {
            if (!mounted || panel !== owner || !panel.dataset.ag2Notes || !document.body.classList.contains('ag2-insp-open')) return;
            const reduced = document.body.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
            $id('spoiler_free_desc')?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
        }, 50);
    }
    render();
}

let tagTimer = 0;
function startTagging() {
    panel.dataset.ag2Tagging = '1';
    $id('tagInput')?.focus();
}
function onTagFocusOut() {
    clearTimeout(tagTimer);
    // the autocomplete list lives outside #tags_div: give its click time to land
    tagTimer = setTimeout(() => {
        if (!panel) return;
        if ($id('tags_div')?.contains(document.activeElement)) return;
        if (document.querySelector('.ui-autocomplete:not([style*="display: none"])')?.offsetParent) return;
        delete panel.dataset.ag2Tagging;
    }, 250);
}

const onClick = guarded(e => {
    const b = e.target.closest('[data-ag2-act]');
    if (!b || !b.closest('.ag2-insp-x')) return;
    e.preventDefault();
    switch (b.dataset.ag2Act) {
        case 'close': setInspector(false); break;
        case 'seg': if (!b.disabled) setSeg(b.dataset.seg); break;
        case 'fav': clickSt('#favorite_button'); setTimeout(schedule, 0); break;
        case 'newchat': clickSt('#option_start_new_chat'); break;
        case 'world': clickSt('#world_button'); break;
        case 'more': moreMenu(b); break;
        case 'edit': toggleEdit(b.dataset.field); break;
        case 'alt': clickSt('#firstMessageWrapper .open_alternate_greetings'); break;
        case 'addtag': startTagging(); break;
        case 'persona': clickSt('#char_connections_button'); break;
        case 'charworld': pickManagement('set_character_world'); break;
        case 'notes': toggleNotes(); break;
        case 'adv': clickSt('#advanced_div'); break;
        case 'chatworld': clickSt('.chat_lorebook_button'); break;
        case 'an': clickSt('#option_toggle_AN'); break;
        case 'cfg': clickSt('#option_toggle_CFG'); break;
        case 'logprobs': clickSt('#option_toggle_logprobs'); break;
    }
});
