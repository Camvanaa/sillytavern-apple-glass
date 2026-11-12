// Apple Glass 2 shell — command palette (DESIGN §5.7, §8; design 04b).
//
// Loaded on demand (util.openPalette → first ⌘K / Ctrl+K or a click on the sidebar search),
// never at cold start. A native <dialog> opened with showModal(): top layer (above ST's
// panels and old-style popups), inert background, Tab cannot leave it; on close focus goes
// back to the element that had it.
// Sources: recent chats (the sidebar's /api/chats/recent list), characters, groups, world
// books (world_names), settings items (the settings window's own index, search.js — shared,
// built on the first non-empty query), actions, slash commands (SlashCommandParser.commands).
// Matching: substring first (prefix / word start rank higher), then in-order subsequence;
// matched characters are bold + underlined. Every action goes through ST's own entry points.

import { icon } from './icons.js?v=202611121609';
import { world_names, selected_world_info, METADATA_KEY } from '../../../../world-info.js';
import {
    ctx, h, guard, toast, thumb, fmtTime, summary, stem, clickSt, openEntry, openCharacter, openGroup,
    openSettings, loadSettings, setInspector, isInspectorOpen, isDesktop, modKeyLabel, modCombo, getShellApi,
} from './util.js?v=202611121609';
import { getRecent, openRightMenu } from './sidebar.js?v=202611121609';
import { closeMenu } from './menu.js?v=202611121609';

const GROUPS = {
    recent: { name: '最近对话', max: 5 },
    chat: { name: '对话', max: 6 },
    char: { name: '角色', max: 5 },
    group: { name: '群组', max: 4 },
    act: { name: '操作', max: 6 },
    wi: { name: '世界书', max: 5 },
    set: { name: '设置', max: 6 },
    theme: { name: '主题', max: 8 },
    cmd: { name: '命令', max: 8 },
};
const ORDER = ['recent', 'chat', 'char', 'group', 'act', 'theme', 'wi', 'set', 'cmd'];

let dlg = null;
let input = null;
let list = null;
let items = [];        // flat, in display order
let sel = 0;
let opener = null;
let seq = 0;
let freshIndex = false; // the settings index is rebuilt on the first query of each opening
let cmdCache = null;

export const isOpen = () => !!dlg?.open;

// ------------------------------------------------------------------ matching

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SEP = /[\s\-_/·›.,:：（(]/;
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
/** Settings items are many and specific: entities / actions / world books rank first on ties. */
const BIAS = { set: 1.5 };

/** → { score, idx } (lower is better) or null. q is already lower-cased and trimmed. */
export function fuzzy(text, q) {
    if (!q) return { score: 0, idx: [] };
    const t = String(text || '').toLowerCase();
    const i = t.indexOf(q);
    if (i >= 0) {
        const idx = Array.from({ length: q.length }, (_, k) => i + k);
        // CJK has no word breaks: “打开世界书” matches “世界” as well as a word start would
        const base = i === 0 ? 0 : SEP.test(t[i - 1]) || CJK.test(q[0]) ? 1 : 2;
        return { score: base - (t.length === q.length ? 0.5 : 0), idx };
    }
    if (q.length < 2) return null;
    // in-order subsequence (“nwc” → “New Chat”); scattered matches rank last
    const idx = [];
    let gaps = 0;
    for (let k = 0, j = 0; k < t.length && j < q.length; k++) {
        if (t[k] !== q[j]) continue;
        if (idx.length && k !== idx[idx.length - 1] + 1) gaps++;
        idx.push(k);
        j++;
    }
    if (idx.length < q.length || gaps > Math.max(1, Math.floor(q.length / 2))) return null;
    return { score: 3 + gaps * 0.5 + idx[0] * 0.01, idx };
}

function mark(text, idx) {
    if (!idx?.length) return esc(text);
    const s = new Set(idx);
    let out = '';
    let open = false;
    String(text).split('').forEach((ch, k) => {
        // idx are UTF-16 offsets (indexOf on the lower-cased label), so walk code units
        if (s.has(k) && !open) { out += '<b class="ag2-pal-m">'; open = true; }
        if (!s.has(k) && open) { out += '</b>'; open = false; }
        out += esc(ch);
    });
    return out + (open ? '</b>' : '');
}

/** title match first; keywords (kw) match without highlight. */
function score(it, q) {
    const m = fuzzy(it.title, q);
    if (m) return m;
    // keywords: word starts only (“ser” must not hit “user settings”); CJK words are whole
    if (it.kw && it.kw.toLowerCase().split(/\s+/).some(w => w.startsWith(q))) return { score: 4, idx: [] };
    // the query names the kind (“世界书”, “lorebook”): every item of it, after title hits
    if (it.gkw && q.length > 1 && it.gkw.toLowerCase().split(/\s+/).some(w => w.startsWith(q) || q.startsWith(w))) return { score: 1.5, idx: [] };
    return null;
}

// ------------------------------------------------------------------ sources

const inChat = () => { const c = ctx(); return c.characterId !== undefined || !!c.groupId; };
const tile = (name, color) => `<span class="ag2-pal-tile ag2-tile-${color}">${icon(name, 14)}</span>`;
const avatar = src => `<img class="ag2-pal-av" src="${esc(src)}" alt="" loading="lazy" draggable="false">`;

function chatItems(group) {
    return getRecent().map(e => {
        const title = e.prefix ? `${e.name} · ${e.prefix}` : e.name;
        return {
            group, title, kw: stem(e.file_name),
            sub: [fmtTime(e.last_mes), summary(e.text, 48)].filter(Boolean).join(' · '),
            lead: e.group ? tile('users', 'indigo') : avatar(thumb('avatar', e.avatar)),
            hint: e.pinned ? icon('pin', 12) : '',
            run: () => openEntry(e),
        };
    });
}

function charItems() {
    const c = ctx();
    return c.characters.map((ch, id) => ch && ({
        group: 'char', title: ch.name || '',
        sub: summary(ch.data?.creator_notes || ch.description || '', 40) || '角色',
        lead: avatar(thumb('avatar', ch.avatar)),
        run: () => openCharacter(id),
    })).filter(Boolean);
}

function groupItems() {
    const c = ctx();
    return (c.groups || []).map(g => ({
        group: 'group', title: g.name || '',
        sub: (g.members || []).map(a => c.characters.find(x => x.avatar === a)?.name).filter(Boolean).join('、'),
        lead: tile('users', 'indigo'),
        run: () => openGroup(g.id),
    }));
}

function worldItems() {
    const c = ctx();
    const charWorld = c.characterId !== undefined ? c.characters[c.characterId]?.data?.extensions?.world : null;
    const chatWorld = c.chatMetadata?.[METADATA_KEY];
    return (world_names || []).map(name => ({
        group: 'wi', title: name, gkw: '世界书 world lorebook',
        sub: [selected_world_info?.includes(name) && '全局', charWorld === name && '角色绑定', chatWorld === name && '本对话'].filter(Boolean).join(' · ') || '世界书',
        lead: tile('book-marked', 'orange'),
        run: () => openWorld(name),
    }));
}

/** ST's openWorldInfoEditor, with the drawer opened through the settings window instead of
 *  #WIDrawerIcon (a click on it would write NavOpened / bypass the window). */
async function openWorld(name) {
    await openSettings('wi');
    const index = world_names.indexOf(name);
    if (index >= 0 && $('#world_editor_select option:selected').text() !== name) $('#world_editor_select').val(index).trigger('change');
}

const PAGES = [
    ['api', '打开连接设置', 'plug', 'green', 'api 来源 密钥 模型 连接'],
    ['ai', '打开生成参数', 'sliders-horizontal', 'blue', '温度 采样 上下文 预设'],
    ['fmt', '打开提示词与格式', 'text-quote', 'indigo', '系统提示词 模板 指令 instruct'],
    ['wi', '打开世界书', 'book-marked', 'orange', 'world info lorebook'],
    ['persona', '打开人设', 'contact', 'pink', 'persona 用户'],
    ['bg', '打开背景', 'image', 'teal', 'background 壁纸'],
    ['look', '打开外观', 'palette', 'purple', '强调色 字号 行宽 聊天样式'],
    ['user', '打开通用设置', 'settings', 'gray', '主题 界面 user settings'],
    ['ext', '打开扩展', 'puzzle', 'red', 'extensions 插件'],
];

function actionItems() {
    const chat = inChat();
    const collapsed = document.body.classList.contains('ag2-side-collapsed');
    const insp = isInspectorOpen() && document.body.classList.contains('ag2-insp-open');
    const a = [];
    const add = (title, ic, color, run, opt = {}) => a.push({ group: 'act', title, lead: tile(ic, color), run, ...opt });
    if (chat) {
        add('新对话', 'message-square-text', 'blue', () => clickSt('#option_start_new_chat'), { kw: 'new chat 新聊天 开始', common: true });
        add('重新生成', 'rotate-cw', 'blue', () => clickSt('#option_regenerate'), { kw: 'regenerate 重试', common: true });
        add('继续', 'fast-forward', 'blue', () => clickSt('#option_continue'), { kw: 'continue 续写' });
        add('管理聊天文件', 'history', 'gray', () => clickSt('#option_select_chat'), { kw: 'chat files 历史 对话列表' });
        add('作者注释', 'notebook-pen', 'gray', () => clickSt('#option_toggle_AN'), { kw: "author's note an" });
    } else {
        add('新对话（助手）', 'message-square-text', 'blue', () => clickSt('#option_start_new_chat'), { kw: 'new chat 新聊天 新对话', common: true });
    }
    if (isDesktop()) {
        add(collapsed ? '显示侧栏' : '隐藏侧栏', 'panel-left', 'gray', () => getShellApi()?.setCollapsed(!collapsed),
            { kw: 'sidebar 侧栏 切换', hint: modCombo('\\'), common: true });
        add(insp ? '隐藏检视器' : '显示检视器', 'panel-right', 'gray', () => setInspector(!insp),
            { kw: 'inspector 检视器 角色卡 切换', hint: modCombo('.'), common: true });
    } else if (chat) {
        // phones (§5.9): no sidebar to collapse; the inspector is the 角色资料 sheet
        add('角色资料', 'contact', 'gray', () => setInspector(true), { kw: 'inspector 检视器 角色卡 资料', common: true });
    }
    add('新建角色', 'user-plus', 'green', () => openRightMenu('#rm_button_create'), { kw: 'create character 角色卡' });
    add('导入角色卡', 'file-input', 'green', () => clickSt('#character_import_button'), { kw: 'import character' });
    add('新建群组', 'users', 'green', () => openRightMenu('#rm_button_group_chats'), { kw: 'create group 群聊' });
    for (const [page, title, ic, color, kw] of PAGES) add(title, ic, color, () => openSettings(page), { kw: '设置 ' + kw, common: page === 'look' });
    // 切换主题: ST's own #themes select (index.js tears the shell down when it leaves AG2)
    const curTheme = ctx().powerUserSettings?.theme;
    for (const o of document.querySelectorAll('#themes option')) {
        if (!o.value || o.value === curTheme) continue;
        add(`切换主题：${o.value}`, 'palette', 'purple', () => $('#themes').val(o.value).trigger('change'), { group: 'theme', kw: 'theme 主题 皮肤' });
    }
    return a;
}

function commandList() {
    if (cmdCache) return cmdCache;
    const all = ctx().SlashCommandParser?.commands || {};
    const seen = new Set();
    const out = [];
    for (const cmd of Object.values(all)) {
        if (!cmd?.name || seen.has(cmd)) continue;
        seen.add(cmd);
        out.push({
            group: 'cmd', title: '/' + cmd.name, name: cmd.name,
            aliases: (cmd.aliases || []).map(x => '/' + x).join(' '),
            sub: summary(cmd.helpString || '', 70),
            lead: tile('command', 'gray'),
            run: () => insertCommand(cmd.name),
        });
    }
    out.sort((x, y) => x.name.localeCompare(y.name));
    return (cmdCache = out);
}

/** Commands usually take arguments: put `/name ` into the input box (before any text already
 *  typed, which becomes the argument) and let the user press Enter. Nothing runs by itself. */
function insertCommand(name) {
    const ta = document.getElementById('send_textarea');
    if (!ta) return;
    const cur = ta.value;
    const rest = cur.startsWith('/') ? cur.replace(/^\/\S*\s?/, '') : cur;
    ta.value = `/${name} ${rest}`;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    const end = name.length + 2;
    ta.setSelectionRange(end, end);
}

// ------------------------------------------------------------------ query → groups

function collect(q) {
    const res = {};
    const push = (it, m) => (res[it.group] ||= []).push({ ...it, score: m.score, idx: m.idx });
    if (!q) {
        for (const it of chatItems('recent').slice(0, GROUPS.recent.max)) push(it, { score: 0, idx: [] });
        for (const it of actionItems().filter(x => x.common)) push(it, { score: 0, idx: [] });
        return res;
    }
    if (q.startsWith('/')) {
        const qq = q.slice(1);
        for (const it of commandList()) {
            const m = fuzzy(it.name, qq) || (qq && it.aliases.toLowerCase().includes(qq) ? { score: 3.5, idx: [] } : null);
            if (m) push(it, { score: m.score, idx: m.idx.map(k => k + 1) }); // +1: the leading “/”
        }
        return res;
    }
    for (const src of [chatItems('chat'), charItems(), groupItems(), actionItems(), worldItems()]) {
        for (const it of src) { const m = score(it, q); if (m) push(it, m); }
    }
    // commands without the “/”: name prefix hits only, latin queries (“/” lists them all)
    if (/^[a-z][a-z0-9-]+$/.test(q)) {
        for (const it of commandList()) { const m = fuzzy(it.name, q); if (m && m.score <= 0) push(it, { score: m.score + 1.5, idx: m.idx.map(k => k + 1) }); }
    }
    return res;
}

/** Groups whose source order means something (recency, ST's list order) keep it on ties;
 *  the rest prefer the shorter title (“温度” before “温度采样”). */
const KEEP_ORDER = new Set(['recent', 'chat', 'wi', 'set', 'theme']);

function order(res, q) {
    const out = [];
    for (const g of Object.keys(res)) {
        res[g].forEach((it, k) => { it.ord = k; });
        res[g].sort((a, b) => a.score - b.score || (KEEP_ORDER.has(g) ? 0 : a.title.length - b.title.length) || a.ord - b.ord);
        out.push({ g, best: res[g][0].score, rows: res[g].slice(0, q.startsWith('/') ? 40 : GROUPS[g].max) });
    }
    out.sort((a, b) => (q ? a.best - b.best : 0) || ORDER.indexOf(a.g) - ORDER.indexOf(b.g));
    return out;
}

// ------------------------------------------------------------------ render

function build() {
    dlg = guard(h('dialog', 'ag2-pal'));
    dlg.id = 'ag2-palette';
    dlg.setAttribute('aria-label', '命令面板');
    const mod = modKeyLabel();
    dlg.innerHTML = `
        <div class="ag2-pal-field">${icon('search', 17)}
            <input type="text" class="ag2-pal-input" role="combobox" aria-expanded="true" aria-controls="ag2-pal-list" aria-autocomplete="list"
                aria-label="搜索对话、角色、设置和命令" placeholder="搜索对话、角色、设置，或输入 / 查找命令" autocomplete="off" spellcheck="false">
            <kbd>esc</kbd>
        </div>
        <div class="ag2-pal-list" id="ag2-pal-list" role="listbox" aria-label="结果"></div>
        <div class="ag2-pal-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>esc</kbd> 关闭</span>
            <span class="ag2-pal-scope">对话 · 角色 · 设置 · 命令 <kbd>${esc(mod)}K</kbd></span>
        </div>`;
    input = dlg.querySelector('.ag2-pal-input');
    list = dlg.querySelector('.ag2-pal-list');
    input.addEventListener('input', () => refresh());
    dlg.addEventListener('keydown', onKey);
    // ST's document-level key handlers (hotkeys, Enter-to-click, swipe arrows …) never see
    // keys typed in the palette.
    dlg.addEventListener('keydown', e => e.stopPropagation());
    dlg.addEventListener('keyup', e => e.stopPropagation());
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
    // a click on the backdrop lands on the <dialog> itself, outside its box
    dlg.addEventListener('pointerdown', e => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    });
    list.addEventListener('mousedown', e => e.preventDefault()); // keep the caret in the field
    list.addEventListener('click', e => { const r = e.target.closest('.ag2-pal-row'); if (r) run(Number(r.dataset.i)); });
    list.addEventListener('mousemove', e => {
        const r = e.target.closest('.ag2-pal-row');
        if (r && Number(r.dataset.i) !== sel) select(Number(r.dataset.i), false);
    });
    document.body.append(dlg);
}

async function refresh() {
    const my = ++seq;
    const raw = input.value.trim();
    const q = raw.toLowerCase();
    const res = collect(q);
    render(order(res, q), q);
    // settings items: the settings window's index (search.js), loaded/built on demand
    if (!q || q.startsWith('/')) return;
    try {
        const m = await loadSettings();
        const hits = await m.searchItems(raw, 14, { fresh: freshIndex });
        freshIndex = false;
        if (my !== seq || !dlg?.open) return;
        const rows = hits.filter(r => r.kind === 'item').map(r => {
            const p = m.pageMeta(r.page);
            const f = fuzzy(r.label, q);
            return {
                group: 'set', title: r.label, idx: f?.idx || [], score: (f ? f.score : 2.5) + BIAS.set,
                sub: [p?.name, r.group && r.group !== p?.name ? r.group : ''].filter(Boolean).join(' › '),
                lead: p ? `<span class="ag2-pal-tile ag2-tile-${p.tile}">${icon(p.icon, 14)}</span>` : '',
                run: () => m.revealItem(r), // window on desktop, sheet on phones (§5.9)
            };
        });
        if (!rows.length) return;
        res.set = rows;
        const keep = items[sel];
        render(order(res, q), q, keep);
    } catch (e) {
        console.warn('[AG2] palette: settings index failed', e);
    }
}

function render(groups, q, keep = null) {
    items = [];
    let html = '';
    for (const { g, rows } of groups) {
        html += `<div class="ag2-pal-head" role="presentation">${GROUPS[g].name}</div>`;
        for (const it of rows) {
            const i = items.length;
            items.push(it);
            html += `<div class="ag2-pal-row" role="option" id="ag2-pal-o${i}" data-i="${i}" aria-selected="false">
                ${it.lead || ''}<span class="ag2-pal-txt"><span class="ag2-pal-title">${mark(it.title, it.idx)}</span>${it.sub ? `<span class="ag2-pal-sub">${esc(it.sub)}</span>` : ''}</span>
                ${it.hint ? `<span class="ag2-pal-hint">${it.hint.startsWith('<') ? it.hint : `<kbd>${esc(it.hint)}</kbd>`}</span>` : ''}
                <span class="ag2-pal-enter" aria-hidden="true">${icon('corner-down-left', 13)}</span>
            </div>`;
        }
    }
    if (!items.length) html = `<div class="ag2-pal-empty">${q ? '没有找到结果' : '还没有对话'}</div>`;
    list.innerHTML = html;
    // a late group (settings) must not move the selection the user is on
    let i = 0;
    if (keep) { const k = items.findIndex(x => x.title === keep.title && x.group === keep.group); if (k >= 0) i = k; }
    select(i, true);
}

function select(i, scroll = true) {
    const rows = list.querySelectorAll('.ag2-pal-row');
    if (!rows.length) { sel = 0; input.removeAttribute('aria-activedescendant'); return; }
    sel = (i + rows.length) % rows.length;
    rows.forEach((r, k) => { const on = k === sel; r.classList.toggle('ag2-sel', on); r.setAttribute('aria-selected', String(on)); });
    input.setAttribute('aria-activedescendant', 'ag2-pal-o' + sel);
    if (scroll) rows[sel].scrollIntoView({ block: 'nearest' });
}

function onKey(e) {
    if (e.isComposing || e.keyCode === 229) return; // IME composing: arrows / Enter belong to the IME
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        select(sel + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
        e.preventDefault();
        run(sel);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
    } else if (e.key === 'Tab') {
        e.preventDefault(); // the field is the only stop: focus stays in the palette
        input.focus();
    }
}

async function run(i) {
    const it = items[i];
    if (!it) return;
    close();
    try { await it.run(); } catch (err) { console.error('[AG2] palette action failed', err); toast('error', '操作失败'); }
}

// ------------------------------------------------------------------ open / close

export function open({ query = '' } = {}) {
    if (!dlg) build();
    if (dlg.open) { input.focus(); input.select(); return true; }
    closeMenu();
    const a = document.activeElement;
    opener = a instanceof HTMLElement && a !== document.body ? a : null;
    freshIndex = true;
    cmdCache = null; // extensions may register commands late
    input.value = query;
    dlg.showModal();
    input.focus();
    refresh();
    return true;
}

export function close() {
    if (!dlg?.open) return false;
    seq++;
    dlg.close();
    list.replaceChildren();
    items = [];
    const o = opener;
    opener = null;
    if (o?.isConnected) o.focus({ preventScroll: true });
    return true;
}

export function toggle(opt) { return isOpen() ? close() : open(opt); }

export function unmount() {
    try { if (dlg?.open) dlg.close(); } catch { /* */ }
    dlg?.remove();
    dlg = input = list = null;
    items = [];
    opener = null;
    cmdCache = null;
}

/** Test hook: the current rows as { group, title, sub }. */
export const rows = () => items.map(x => ({ group: x.group, title: x.title, sub: x.sub || '' }));
