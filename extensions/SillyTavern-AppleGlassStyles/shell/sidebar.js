// Apple Glass 2 shell — sidebar (DESIGN §5.1, §3; §9.2 #5).
// Header · search (placeholder until the P4 palette) · segments 对话/角色/群组 ·
// list · footer (connection, persona, settings).

import { icon } from './icons.js?v=202611090410';
import { openMenu } from './menu.js?v=202611090410';
import { local, isPinned, setPinned, renamePin, pinList } from './store.js?v=202611090410';
import {
    ctx, h, toast, guard, fmtTime, ageDays, summary, stem, thumb, charIndex, toggleDrawer, clickSt,
    openSettings, openEntry, openCharacter, openGroup, renameEntry, deleteEntry, getCurrentChatId, personaAvatar, onlineStatus,
} from './util.js?v=202611090410';

const SEGMENTS = [['chats', '对话'], ['chars', '角色'], ['groups', '群组']];
let root = null;
let recent = [];          // last /api/chats/recent result (enriched)
let loadSeq = 0;
let loaded = false;

export function getRecent() { return recent; }
export function isLoaded() { return loaded; }

export function mount(shell, api) {
    root = guard(h('aside', 'ag2-side ag2-glass'));
    root.id = 'ag2-sidebar';
    root.setAttribute('aria-label', '对话与角色');
    root.innerHTML = `
        <div class="ag2-side-head">
            <button type="button" class="ag2-ib" data-act="collapse" aria-label="收起侧栏" title="收起侧栏">${icon('panel-left', 18)}</button>
            <div class="ag2-side-title">SillyTavern</div>
            <button type="button" class="ag2-ib" data-act="new" aria-label="新建" title="新建" aria-haspopup="menu">${icon('square-pen', 18)}</button>
        </div>
        <button type="button" class="ag2-search" data-act="search" aria-label="搜索对话、角色、命令">
            ${icon('search', 15)}<span class="ag2-search-ph">搜索对话、角色、命令</span><kbd>⌘K</kbd>
        </button>
        <div class="ag2-seg" role="tablist" aria-label="侧栏分段">
            ${SEGMENTS.map(([k, t]) => `<button type="button" role="tab" data-seg="${k}">${t}</button>`).join('')}
        </div>
        <div class="ag2-side-list"></div>
        <div class="ag2-side-foot">
            <button type="button" class="ag2-conn" data-act="conn" title="连接设置"><span class="ag2-dot"></span><span class="ag2-conn-text">未连接</span></button>
            <div class="ag2-foot-row">
                <button type="button" class="ag2-persona" data-act="persona" title="切换人设">
                    <img class="ag2-av ag2-av-28" alt="" draggable="false"><span class="ag2-persona-name"></span><span class="ag2-persona-sub">当前人设</span>
                </button>
                <button type="button" class="ag2-ib" data-act="settings" aria-label="设置" title="设置">${icon('settings', 18)}</button>
            </div>
        </div>`;
    shell.append(root);

    root.addEventListener('click', e => {
        const seg = e.target.closest('button[data-seg]');
        if (seg) { setSegment(seg.dataset.seg); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'collapse') api.setCollapsed(true);
        else if (act === 'new') newMenu(b);
        else if (act === 'search') toast('info', '命令面板（⌘K）将在后续版本接入');
        else if (act === 'conn') openSettings('api');          // 设置 › 连接
        else if (act === 'persona') openSettings('persona');   // 设置 › 人设
        else if (act === 'settings') openSettings(null);       // last page (default 外观)
        else if (act === 'pick-char') setSegment('chars');
        else if (act === 'import') clickSt('#character_import_button');
    });
    root.querySelector('.ag2-side-list').addEventListener('click', onListClick);
    root.querySelector('.ag2-side-list').addEventListener('contextmenu', onListContext);
    rowKeys(root.querySelector('.ag2-side-list'));

    setSegment(local.get('seg', 'chats'), true);
    updateFooter();
}

export function unmount() {
    root?.remove();
    root = null;
    recent = [];
    loaded = false;
}

function segment() {
    return root?.dataset.segment || 'chats';
}

function setSegment(seg, silent) {
    if (!SEGMENTS.some(([k]) => k === seg)) seg = 'chats';
    root.dataset.segment = seg;
    for (const b of root.querySelectorAll('[data-seg]')) {
        const on = b.dataset.seg === seg;
        b.classList.toggle('ag2-on', on);
        b.setAttribute('aria-selected', String(on));
    }
    if (!silent) local.set('seg', seg);
    render();
}

function newMenu(anchor) {
    const c = ctx();
    const inChat = c.characterId !== undefined || !!c.groupId;
    openMenu(anchor, [
        { label: '新对话', icon: 'message-square-text', disabled: !inChat, onSelect: () => clickSt('#option_start_new_chat') },
        { separator: true },
        { label: '新建角色', icon: 'user-plus', onSelect: () => openRightMenu('#rm_button_create') },
        { label: '导入角色卡', icon: 'file-input', onSelect: () => clickSt('#character_import_button') },
        { label: '新建群组', icon: 'users', onSelect: () => openRightMenu('#rm_button_group_chats') },
    ], { align: 'end' });
}

/** Character create / group create live in ST's right panel (the P3 inspector); open it first. */
export async function openRightMenu(buttonSel) {
    await toggleDrawer('right-nav-panel', true);
    clickSt(buttonSel);
}

// ---------------------------------------------------------------- data
export async function refresh() {
    if (!root) return;
    const seq = ++loadSeq;
    try {
        const res = await fetch('/api/chats/recent', {
            method: 'POST',
            headers: ctx().getRequestHeaders(),
            body: JSON.stringify({ max: 60, pinned: pinList() }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (seq !== loadSeq || !root) return;
        recent = enrich(Array.isArray(data) ? data : []);
        loaded = true;
        render();
        root.dispatchEvent(new CustomEvent('ag2-recent'));
    } catch (e) {
        console.warn('[AG2] recent chats failed', e);
        loaded = true;
        if (seq === loadSeq && root) { render(); root.dispatchEvent(new CustomEvent('ag2-recent')); }
    }
}

const DEFAULT_NAME = /^.+ - \d{4}-\d{1,2}-\d{1,2}\s*@\d{1,2}h\s*\d{1,2}m\s*\d{1,2}s(\s*\d+ms)?$/;

function enrich(list) {
    const c = ctx();
    const counts = {};
    for (const r of list) { const k = r.group ? 'g' + r.group : 'c' + r.avatar; counts[k] = (counts[k] || 0) + 1; }
    const out = [];
    for (const r of list) {
        const e = { ...r };
        if (e.group) {
            const g = c.groups.find(x => String(x.id) === String(e.group));
            if (!g) continue;
            e.name = g.name;
            e.members = (g.members || []).slice(0, 3);
            e.groupAvatar = g.avatar_url || '';
        } else {
            const ch = c.characters[charIndex(e.avatar)];
            if (!ch) continue;
            e.name = ch.name;
        }
        const s = stem(e.file_name);
        e.prefix = '';
        if (counts[e.group ? 'g' + e.group : 'c' + e.avatar] > 1) {
            if (/^branch\s*#|分支/i.test(s)) e.prefix = '分支';
            else if (!DEFAULT_NAME.test(s) && !/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) e.prefix = e.name && s.startsWith(e.name + ' - ') ? s.slice(e.name.length + 3) : s;
        }
        e.text = summary(e.mes);
        e.pinned = isPinned(e);
        out.push(e);
    }
    return out;
}

function isActive(e) {
    const c = ctx();
    const cur = getCurrentChatId();
    if (!cur || stem(e.file_name) !== cur) return false;
    if (e.group) return String(c.groupId) === String(e.group);
    return !c.groupId && c.characters[c.characterId]?.avatar === e.avatar;
}

// ---------------------------------------------------------------- render
export function render() {
    if (!root) return;
    const list = root.querySelector('.ag2-side-list');
    const frag = document.createDocumentFragment();
    const seg = segment();
    list.setAttribute('aria-label', SEGMENTS.find(s => s[0] === seg)[1]);
    if (seg === 'chats') renderChats(frag);
    else if (seg === 'chars') renderChars(frag);
    else renderGroups(frag);
    list.replaceChildren(frag);
}

export function row(cls) {
    const b = h('div', cls);
    b.tabIndex = 0;
    b.setAttribute('role', 'button');
    return b;
}

/** Keyboard activation for div rows (Enter / Space), like a native button. */
export function rowKeys(container) {
    container.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][tabindex]') && !e.target.matches('button')) {
            e.preventDefault();
            e.target.click();
        }
    });
}

function section(frag, title) {
    frag.append(h('div', 'ag2-sec', title));
}

function avatarEl(e, size) {
    if (e.group && !e.groupAvatar) {
        const st = h('span', `ag2-av ag2-av-${size} ag2-av-stack`);
        const m = (e.members || []).slice(0, 2);
        if (!m.length) st.innerHTML = icon('users', 18);
        for (const a of m) { const i = h('img'); i.alt = ''; i.loading = 'lazy'; i.draggable = false; i.src = thumb('avatar', a); st.append(i); }
        return st;
    }
    const img = h('img', `ag2-av ag2-av-${size}`);
    img.alt = ''; img.loading = 'lazy'; img.draggable = false;
    img.src = e.group ? e.groupAvatar : thumb('avatar', e.avatar);
    return img;
}

function chatRow(e) {
    // Two-line list cell, not a text button: a focusable row (Enter/Space handled on the list).
    const b = row('ag2-row ag2-chat-row' + (isActive(e) ? ' ag2-on' : ''));
    b.dataset.idx = String(recent.indexOf(e));
    b.title = `${e.name} · ${stem(e.file_name)}`;
    b.append(avatarEl(e, 42));
    const body = h('span', 'ag2-row-body');
    const top = h('span', 'ag2-row-top');
    top.append(h('span', 'ag2-row-name', e.name));
    const t = h('span', 'ag2-row-time');
    if (e.pinned) t.innerHTML = icon('pin', 11, 'ag2-pin');
    t.append(fmtTime(e.last_mes));
    top.append(t);
    body.append(top);
    const sub = h('span', 'ag2-row-sub');
    if (e.prefix) sub.append(h('span', 'ag2-row-prefix', e.prefix + ' · '));
    sub.append(e.text || (e.chat_items ? `${e.chat_items} 条消息` : '空对话'));
    body.append(sub);
    b.append(body);
    if (isActive(e)) b.setAttribute('aria-current', 'true');
    return b;
}

function renderChats(frag) {
    if (!loaded) { frag.append(h('div', 'ag2-empty-note', '正在载入…')); return; }
    if (!recent.length) {
        const empty = h('div', 'ag2-empty');
        empty.innerHTML = `${icon('messages-square', 28)}<div class="ag2-empty-title">还没有对话</div>
            <div class="ag2-empty-actions"><button type="button" class="ag2-btn" data-act="pick-char">选择角色</button><button type="button" class="ag2-btn" data-act="import">导入角色卡</button></div>`;
        frag.append(empty);
        return;
    }
    const byTime = (a, b) => (Date.parse(b.last_mes) || 0) - (Date.parse(a.last_mes) || 0);
    const pinned = recent.filter(e => e.pinned).sort(byTime);
    const rest = recent.filter(e => !e.pinned);
    const recentRows = rest.filter(e => ageDays(e.last_mes) < 7);
    const older = rest.filter(e => ageDays(e.last_mes) >= 7);
    if (pinned.length) { section(frag, '置顶'); pinned.forEach(e => frag.append(chatRow(e))); }
    if (recentRows.length) { section(frag, '最近'); recentRows.forEach(e => frag.append(chatRow(e))); }
    if (older.length) { section(frag, '更早'); older.forEach(e => frag.append(chatRow(e))); }
}

const isFav = x => x?.fav === true || x?.fav === 'true' || x?.data?.extensions?.fav === true;
const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN');

function entityRow(kind, id, name, sub, avatar, fav, active) {
    const b = row('ag2-row ag2-ent-row' + (active ? ' ag2-on' : ''));
    b.dataset.kind = kind;
    b.dataset.id = String(id);
    b.title = name;
    b.append(avatar);
    const body = h('span', 'ag2-row-body');
    const top = h('span', 'ag2-row-top');
    top.append(h('span', 'ag2-row-name', name));
    if (fav) { const s = h('span', 'ag2-row-time'); s.innerHTML = icon('star', 12, 'ag2-fav'); top.append(s); }
    body.append(top);
    if (sub) body.append(h('span', 'ag2-row-sub', sub));
    b.append(body);
    return b;
}

function renderChars(frag) {
    const c = ctx();
    const list = c.characters.map((ch, id) => ({ ch, id, name: ch.name, fav: isFav(ch) }))
        .sort((a, b) => (b.fav - a.fav) || byName(a, b));
    if (!list.length) { frag.append(h('div', 'ag2-empty-note', '还没有角色')); return; }
    const favs = list.filter(x => x.fav);
    if (favs.length) section(frag, '收藏');
    let started = false;
    for (const x of list) {
        if (!x.fav && !started && favs.length) { section(frag, '全部'); started = true; }
        const img = h('img', 'ag2-av ag2-av-36'); img.alt = ''; img.loading = 'lazy'; img.draggable = false; img.src = thumb('avatar', x.ch.avatar);
        const active = !c.groupId && String(c.characterId) === String(x.id);
        // Secondary line: the character's tags (descriptions are prompt text, often macros).
        const tagNames = (c.tagMap?.[x.ch.avatar] || []).map(id => c.tags?.find(t => t.id === id)?.name).filter(Boolean).join(' · ');
        frag.append(entityRow('char', x.id, x.name, tagNames, img, x.fav, active));
    }
}

function renderGroups(frag) {
    const c = ctx();
    const list = (c.groups || []).map(g => ({ g, name: g.name, fav: isFav(g) })).sort((a, b) => (b.fav - a.fav) || byName(a, b));
    if (!list.length) {
        const empty = h('div', 'ag2-empty');
        empty.innerHTML = `${icon('users', 28)}<div class="ag2-empty-title">还没有群组</div>`;
        const btn = h('button', 'ag2-btn', '新建群组'); btn.type = 'button';
        btn.addEventListener('click', () => openRightMenu('#rm_button_group_chats'));
        empty.append(btn);
        frag.append(empty);
        return;
    }
    for (const x of list) {
        const av = avatarEl({ group: x.g.id, groupAvatar: x.g.avatar_url || '', members: x.g.members || [] }, 36);
        frag.append(entityRow('group', x.g.id, x.name, `${(x.g.members || []).length} 位成员`, av, x.fav, String(c.groupId) === String(x.g.id)));
    }
}

// ---------------------------------------------------------------- interaction
async function onListClick(ev) {
    const row = ev.target.closest('.ag2-row');
    if (!row) return;
    if (row.dataset.idx) {
        const e = recent[Number(row.dataset.idx)];
        if (e) await openEntry(e);
    } else if (row.dataset.kind === 'char') {
        await openCharacter(Number(row.dataset.id));
    } else if (row.dataset.kind === 'group') {
        await openGroup(row.dataset.id);
    }
}

function onListContext(ev) {
    const row = ev.target.closest('.ag2-chat-row');
    if (!row) return;
    ev.preventDefault();
    const e = recent[Number(row.dataset.idx)];
    if (!e) return;
    const at = ev.clientX || ev.clientY ? { x: ev.clientX, y: ev.clientY } : row;
    openMenu(at, [
        { id: 'pin', label: e.pinned ? '取消置顶' : '置顶', icon: 'pin', onSelect: () => { setPinned(e, !e.pinned); e.pinned = !e.pinned; render(); } },
        { id: 'rename', label: '重命名…', icon: 'pencil', onSelect: () => rename(e) },
        { separator: true },
        { id: 'delete', label: '删除…', icon: 'trash-2', danger: true, onSelect: () => remove(e) },
    ]);
}

async function rename(e) {
    const c = ctx();
    const old = stem(e.file_name);
    const name = await c.callGenericPopup('重命名对话', c.POPUP_TYPE.INPUT, old);
    if (!name || typeof name !== 'string' || name.trim() === '' || name.trim() === old) return;
    const next = name.trim();
    try {
        await renameEntry(e, next);
        renamePin(e, next + '.jsonl');
        await refresh();
    } catch (err) {
        console.error('[AG2] rename failed', err);
        toast('error', '重命名失败');
    }
}

async function remove(e) {
    const c = ctx();
    const div = h('div');
    div.append(h('h3', null, '删除这个对话？'), h('p', null, `“${e.name} · ${stem(e.file_name)}” 将被永久删除，无法恢复。`));
    const ok = await c.callGenericPopup(div, c.POPUP_TYPE.CONFIRM, '', { okButton: '删除', cancelButton: '取消' });
    if (ok !== c.POPUP_RESULT.AFFIRMATIVE) return;
    try {
        await deleteEntry(e);
        if (e.pinned) setPinned(e, false);
        await refresh();
    } catch (err) {
        console.error('[AG2] delete failed', err);
        toast('error', '删除失败');
    }
}

// ---------------------------------------------------------------- footer
const SOURCE_LABEL = {
    openai: 'OpenAI', claude: 'Claude', makersuite: 'Google AI Studio', vertexai: 'Vertex AI', openrouter: 'OpenRouter',
    mistralai: 'Mistral', deepseek: 'DeepSeek', groq: 'Groq', xai: 'xAI', cohere: 'Cohere', perplexity: 'Perplexity',
    custom: '自定义接口', azure_openai: 'Azure OpenAI', ai21: 'AI21', nanogpt: 'NanoGPT', moonshot: 'Moonshot',
};

function apiLabel() {
    const c = ctx();
    try {
        const cm = c.extensionSettings?.connectionManager;
        const p = cm?.selectedProfile && (cm.profiles || []).find(x => x.id === cm.selectedProfile);
        if (p?.name) return p.name;
    } catch { /* ignore */ }
    const api = c.mainApi;
    if (api === 'openai') return SOURCE_LABEL[c.chatCompletionSettings?.chat_completion_source] || c.chatCompletionSettings?.chat_completion_source || 'Chat Completion';
    if (api === 'textgenerationwebui') return c.textCompletionSettings?.type || 'Text Completion';
    return api || '';
}

export function updateFooter() {
    if (!root) return;
    const st = onlineStatus();
    const ok = st && st !== 'no_connection';
    const conn = root.querySelector('.ag2-conn');
    conn.classList.toggle('ag2-ok', !!ok);
    const label = apiLabel();
    conn.querySelector('.ag2-conn-text').textContent = ok ? `已连接${label ? ' · ' + label : ''}` : '未连接';
    conn.title = ok ? `已连接 · ${label}（点按打开连接设置）` : '未连接（点按打开连接设置）';
    const c = ctx();
    const p = root.querySelector('.ag2-persona');
    p.querySelector('img').src = thumb('persona', personaAvatar());
    p.querySelector('.ag2-persona-name').textContent = c.name1 || '';
    p.title = `${c.name1 || ''} · 切换人设`;
}
