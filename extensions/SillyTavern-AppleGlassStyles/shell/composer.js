// Apple Glass 2 shell — input island: + menu, model capsule, send state, QR row
// (DESIGN §5.4, §9.2 #6).
//
// ST's composer (#form_sheld › #send_form › #nonQRFormItems) stays where it is; CSS
// floats it over the chat as the “input island”. The shell only adds three buttons
// into it (ids `ag2-*`, removed on teardown) and a few classes / variables:
//   #ag2-plus     (#leftSendForm, first)  → + menu (ST's ☰ and wand are hidden by CSS)
//   #ag2-model    (#rightSendForm)        → model capsule / list from #model_<source>_select
//   #ag2-qr-add   (#send_form, after the QR bars) → ghost “+ 快速回复”
//   #send_form.ag2-has-text               → send key turns accent
//   #send_form.ag2-multi                  → the island is taller than one line (r 24)
//   body.ag2-wand-open                    → ST's own #extensionsMenu shown as submenu
//   body --ag2-dock-h                     → island height, the chat pads its bottom by it
// Every action is a click on ST's own control (`#option_*`, `#attachFile`, the model
// <select>), as ST's core does it.

import { icon } from './icons.js?v=202611091045';
import { openMenu, closeMenu } from './menu.js?v=202611091045';
import { ctx, h, guard, clickSt, toggleDrawer, openSettings, busy, onlineStatus } from './util.js?v=202611091045';
import { showBookmarksButtons } from '../../../../bookmarks.js';

const NO_CONN_TEXT = '未连接 API — 点此连接';
// ST keeps sd / dice sub-poppers anchored to these wand items: do not close on them.
const WAND_KEEP = ['#sd_gen', '#roll_dice'];

let plus = null, model = null, qrAdd = null;
let ro = null;
let cleanups = [];
let wandOpen = false;
let savedNoConn = null;

const on = (el, type, fn, opt) => { el.addEventListener(type, fn, opt); cleanups.push(() => el.removeEventListener(type, fn, opt)); };

export function mount() {
    const left = document.getElementById('leftSendForm');
    const right = document.getElementById('rightSendForm');
    const form = document.getElementById('send_form');
    const ta = document.getElementById('send_textarea');
    if (!left || !right || !form || !ta) return false;

    plus = guard(h('button', 'ag2-plus'));
    plus.id = 'ag2-plus';
    plus.type = 'button';
    plus.setAttribute('aria-label', '更多操作');
    plus.setAttribute('aria-haspopup', 'menu');
    plus.title = '更多操作';
    plus.innerHTML = icon('plus', 20, 'ag2-plus-i') + icon('x', 20, 'ag2-x-i');
    plus.addEventListener('click', () => (plus.classList.contains('ag2-open') ? closeMenu() : plusMenu()));
    left.prepend(plus);

    model = guard(h('button', 'ag2-model'));
    model.id = 'ag2-model';
    model.type = 'button';
    model.setAttribute('aria-haspopup', 'menu');
    model.innerHTML = `<i class="ag2-model-dot"></i>${icon('zap', 13, 'ag2-model-zap')}<span class="ag2-model-name"></span>${icon('chevron-down', 13, 'ag2-model-chev')}`;
    model.addEventListener('click', () => (model.classList.contains('ag2-open') ? closeMenu() : modelMenu()));
    right.insertBefore(model, document.getElementById('send_but'));

    qrAdd = guard(h('button', 'ag2-qr-add'));
    qrAdd.id = 'ag2-qr-add';
    qrAdd.type = 'button';
    qrAdd.title = '管理快速回复';
    qrAdd.innerHTML = `${icon('plus', 14)}<span>快速回复</span>`;
    qrAdd.addEventListener('click', openQrSettings);
    const bars = form.querySelectorAll(':scope > #qr--bar, :scope > #qr-bar');
    const lastBar = bars[bars.length - 1];
    form.insertBefore(qrAdd, lastBar ? lastBar.nextSibling : form.firstChild);

    // Send key: grey while empty, accent with text (§5.4). ST clears the box with an
    // `input` event; keyup/focus catch programmatic fills (e.g. impersonate).
    const sync = () => syncText();
    for (const t of ['input', 'keyup', 'change', 'focus', 'blur']) on(ta, t, sync);

    // Not connected: ST swaps the placeholder to `no_connection_text`; reword it and make
    // a click on the empty box open the connection settings (§5.4 “点此连接”).
    savedNoConn = ta.getAttribute('no_connection_text');
    ta.setAttribute('no_connection_text', NO_CONN_TEXT);
    if (form.classList.contains('no-connection')) ta.setAttribute('placeholder', NO_CONN_TEXT);
    // isTrusted: ST itself fires a synthetic click on the box after every chat load
    on(ta, 'click', e => {
        if (e.isTrusted && form.classList.contains('no-connection') && !ta.value) openSettings('api');
    });

    // Island height → --ag2-dock-h: the chat's bottom padding follows a growing island,
    // and a chat that sat at the bottom stays at the bottom.
    // The island also switches from capsule (r 27) to rounded rectangle (r 24) once it
    // grows past one line (§5.4).
    const fs = document.getElementById('form_sheld');
    const chat = document.getElementById('chat');
    const island = document.getElementById('nonQRFormItems');
    if (fs && chat && 'ResizeObserver' in window) {
        let last = 0;
        ro = new ResizeObserver(() => {
            if (island) form.classList.toggle('ag2-multi', island.getBoundingClientRect().height > 62);
            const hgt = Math.round(fs.getBoundingClientRect().height);
            if (hgt === last) return;
            const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 24;
            last = hgt;
            document.body.style.setProperty('--ag2-dock-h', hgt + 'px');
            if (atBottom) chat.scrollTop = chat.scrollHeight;
        });
        ro.observe(fs);
        if (island) ro.observe(island);
    }

    syncText();
    updateModel();
    return true;
}

export function unmount() {
    closeWand();
    cleanups.forEach(f => f());
    cleanups = [];
    ro?.disconnect();
    ro = null;
    plus?.remove(); model?.remove(); qrAdd?.remove();
    plus = model = qrAdd = null;
    const ta = document.getElementById('send_textarea');
    if (ta) {
        if (savedNoConn != null) ta.setAttribute('no_connection_text', savedNoConn);
        if (ta.getAttribute('placeholder') === NO_CONN_TEXT && savedNoConn != null) ta.setAttribute('placeholder', savedNoConn);
    }
    savedNoConn = null;
    document.getElementById('send_form')?.classList.remove('ag2-has-text', 'ag2-multi');
    document.body.style.removeProperty('--ag2-dock-h');
}

export function syncText() {
    const ta = document.getElementById('send_textarea');
    document.getElementById('send_form')?.classList.toggle('ag2-has-text', !!ta && ta.value.trim().length > 0);
}

// ------------------------------------------------------------------ + menu (§5.4)

function inChat() {
    const c = ctx();
    return c.characterId !== undefined || !!c.groupId;
}

function plusMenu() {
    try { showBookmarksButtons(); } catch { /* no chat yet */ }
    const chatOpen = inChat();
    const gen = busy();
    plus.classList.add('ag2-open');
    plus.setAttribute('aria-label', '关闭菜单');
    openMenu(plus, [
        { header: '本条回复' },
        { id: 'regenerate', label: '重新生成', icon: 'rotate-cw', hint: '⌃↵', disabled: !chatOpen || gen, onSelect: () => clickSt('#option_regenerate') },
        { id: 'continue', label: '继续', icon: 'fast-forward', hint: '⌥↵', disabled: !chatOpen || gen, onSelect: () => clickSt('#option_continue') },
        { id: 'impersonate', label: '代我写', icon: 'venetian-mask', disabled: !chatOpen || gen, onSelect: () => clickSt('#option_impersonate') },
        { separator: true },
        { id: 'attach', label: '附加文件', icon: 'paperclip', disabled: !chatOpen || !document.getElementById('attachFile'), onSelect: () => clickSt('#attachFile') },
        { id: 'wand', label: '扩展工具', icon: 'wand-sparkles', submenu: true, keepOpen: true, disabled: !document.getElementById('extensionsMenu'), onSelect: (btn) => toggleWand(btn) },
        { separator: true },
        { id: 'new', label: '新对话', icon: 'messages-square', disabled: !chatOpen, onSelect: () => clickSt('#option_start_new_chat') },
        { id: 'select', label: '管理聊天文件', icon: 'history', disabled: !chatOpen, onSelect: () => clickSt('#option_select_chat') },
        { id: 'delete', label: '删除消息…', icon: 'trash-2', danger: true, disabled: !chatOpen || gen, onSelect: () => clickSt('#option_delete_mes') },
    ], {
        id: 'ag2-plus-menu',
        className: 'ag2-menu-plus',
        ignore: () => [document.getElementById('extensionsMenu'), document.getElementById('sd_dropdown')],
        onClose: () => {
            closeWand();
            if (plus) { plus.classList.remove('ag2-open'); plus.setAttribute('aria-label', '更多操作'); }
        },
    });
}

// “扩展工具 ›”: ST's own #extensionsMenu, shown next to the + menu. Nothing is cloned or
// moved; body.ag2-wand-open overrides its display + position (CSS §5.4c).
function toggleWand(btn) {
    if (wandOpen) { closeWand(); return; }
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    const r = (btn || document.querySelector('#ag2-plus-menu [data-item="wand"]'))?.getBoundingClientRect();
    if (!r) return;
    wandOpen = true;
    btn?.classList.add('ag2-sub-open');
    const b = document.body;
    b.classList.add('ag2-wand-open');
    b.style.setProperty('--ag2-wand-left', Math.round(r.right + 10) + 'px');
    // bottom-anchored: grows upwards from the item's bottom edge, kept on screen by CSS max-height
    b.style.setProperty('--ag2-wand-bottom', Math.max(10, Math.round(innerHeight - r.bottom - 5)) + 'px');
    const onClick = e => {
        if (WAND_KEEP.some(s => e.target.closest(s))) return;
        if (e.target.closest('.list-group-item, .extension_container > *')) setTimeout(() => closeMenu(), 0);
    };
    menu.addEventListener('click', onClick);
    wandCleanup = () => menu.removeEventListener('click', onClick);
}

let wandCleanup = null;
function closeWand() {
    if (!wandOpen) return;
    wandOpen = false;
    wandCleanup?.();
    wandCleanup = null;
    document.body.classList.remove('ag2-wand-open');
    document.body.style.removeProperty('--ag2-wand-left');
    document.body.style.removeProperty('--ag2-wand-bottom');
    document.querySelector('#ag2-plus-menu .ag2-sub-open')?.classList.remove('ag2-sub-open');
}

export const isWandOpen = () => wandOpen;

// ------------------------------------------------------------------ model capsule (§5.4)

const SELECT_ALIAS = { makersuite: 'google' };

function modelSelect() {
    const c = ctx();
    if (c.mainApi !== 'openai') return null;
    const src = c.chatCompletionSettings?.chat_completion_source;
    if (!src) return null;
    return document.getElementById(`model_${SELECT_ALIAS[src] || src}_select`)
        || document.querySelector(`form[data-source~="${src}"] select[id^="model_"][id$="_select"]`);
}

function profileName() {
    try {
        const cm = ctx().extensionSettings?.connectionManager;
        const p = cm?.selectedProfile && (cm.profiles || []).find(x => x.id === cm.selectedProfile);
        return p?.name || '';
    } catch { return ''; }
}

function currentModel() {
    const c = ctx();
    if (c.mainApi === 'openai') {
        try { return c.getChatCompletionModel?.() || ''; } catch { return ''; }
    }
    return '';
}

export function updateModel() {
    if (!model) return;
    const st = onlineStatus();
    const ok = !!st && st !== 'no_connection';
    const name = currentModel();
    const profile = profileName();
    // Chat Completion → the model id; other APIs → ST's own connection text (§5.4).
    // A connection profile name wins when one is selected (§9.3 Connection Manager).
    const label = profile || name || (ok ? String(st) : '未连接');
    model.querySelector('.ag2-model-name').textContent = label;
    model.classList.toggle('ag2-off', !ok);
    model.title = [profile && `连接配置：${profile}`, name && `模型：${name}`, ok ? '' : '未连接'].filter(Boolean).join(' · ') || label;
    model.setAttribute('aria-label', `模型：${label}`);
}

function modelMenu() {
    const sel = modelSelect();
    const cur = currentModel();
    const items = [];
    const opts = sel ? [...sel.options].filter(o => o.value && !o.disabled) : [];
    if (opts.length) {
        items.push({ header: '模型' });
        for (const o of opts) {
            items.push({
                id: 'm:' + o.value, label: o.textContent.trim() || o.value, icon: o.value === sel.value ? 'check' : null,
                onSelect: () => { $(sel).val(o.value).trigger('change'); updateModel(); },
            });
        }
    } else {
        items.push({ header: '当前模型' });
        items.push({ id: 'cur', label: cur || model.querySelector('.ag2-model-name').textContent, icon: 'check', disabled: true });
    }
    items.push({ separator: true });
    items.push({ id: 'conn', label: '连接设置…', icon: 'plug', onSelect: () => openSettings('api') });
    model.classList.add('ag2-open');
    openMenu(model, items, {
        id: 'ag2-model-menu', className: 'ag2-menu-models', align: 'end', focusFirst: false,
        onClose: () => model?.classList.remove('ag2-open'),
    });
}

// ------------------------------------------------------------------ QR ghost

async function openQrSettings() {
    await openSettings('ext');
    setTimeout(() => {
        const t = document.getElementById('qr--settings') || document.getElementById('qr_container');
        const head = t?.closest('.inline-drawer')?.querySelector('.inline-drawer-toggle');
        const body = t?.closest('.inline-drawer')?.querySelector('.inline-drawer-content');
        if (head && body && getComputedStyle(body).display === 'none') $(head).trigger('click');
        t?.scrollIntoView({ block: 'start', behavior: 'auto' });
    }, 350);
}
