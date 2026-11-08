// Apple Glass 2 shell — enable / teardown / routing (DESIGN §9.1, §9.2).
//
// Loaded by ../index.js only while the UI theme is "Apple Glass 2" and the URL has
// no `classic`. enable() runs while the splash still covers the page: it adds
// body.ag2 and an empty frame (#ag2-shell, a child of <body>, outside #sheld);
// data is filled after APP_READY / CHAT_CHANGED. disable() removes every node,
// class and listener it added and reloads the current chat.
// Any exception during enable → automatic teardown + one toastr.

export const BUILD = '202611081914';

import { local, importStPinsOnce } from './store.js?v=202611081914';
import { ctx, h, toggleDrawer } from './util.js?v=202611081914';
import { closeMenu } from './menu.js?v=202611081914';
import * as sidebar from './sidebar.js?v=202611081914';
import * as chrome from './chrome.js?v=202611081914';

const BODY_CLASSES = ['ag2', 'ag2-welcome', 'ag2-side-collapsed', 'ag2-ready'];
let on = false;
let shell = null;
let listeners = [];
let observers = [];
let timers = [];
let failed = false;

export const isOn = () => on;

function listen(type, fn) {
    const { eventSource } = ctx();
    eventSource.on(type, fn);
    listeners.push([type, fn]);
}

function later(fn, ms) {
    const t = setTimeout(() => { timers = timers.filter(x => x !== t); safe(fn)(); }, ms);
    timers.push(t);
}

const debounced = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(safe(fn), ms); }; };

/** Wraps shell work so a runtime error tears the shell down instead of leaving a half UI. */
function safe(fn) {
    return (...a) => {
        if (!on) return;
        try {
            const r = fn(...a);
            if (r && typeof r.catch === 'function') r.catch(fail);
        } catch (e) { fail(e); }
    };
}

function fail(e) {
    console.error('[AG2] shell failed, falling back to the classic layout', e);
    disable();
    if (!failed) {
        failed = true;
        try { window.toastr?.error?.('Apple Glass 2 外壳出错，已回到原生布局。可在用户设置里切换主题。', 'Apple Glass 2', { timeOut: 8000 }); } catch { /* */ }
    }
}

const api = {
    setCollapsed(v) {
        document.body.classList.toggle('ag2-side-collapsed', !!v);
        local.set('sidebar', v ? 'collapsed' : 'open');
        (v ? document.querySelector('#ag2-title .ag2-expand') : document.querySelector('#ag2-sidebar [data-act="collapse"]'))?.focus?.({ preventScroll: true });
    },
};

let readyHint = false;
function appIsReady() {
    // ../index.js tracks APP_READY; the preloader check covers a missing hint.
    return readyHint || !document.getElementById('preloader');
}

export function enable({ appReady = false } = {}) {
    if (on) return;
    readyHint = !!appReady;
    on = true;
    try {
        document.body.classList.add('ag2');
        if (local.get('sidebar') === 'collapsed') document.body.classList.add('ag2-side-collapsed');
        shell = h('div');
        shell.id = 'ag2-shell';
        shell.dataset.build = BUILD;
        document.body.append(shell);
        sidebar.mount(shell, api);
        chrome.mount(shell, api);
        updateWelcome();

        const { eventTypes: E } = ctx();
        const refreshRecent = debounced(() => sidebar.refresh(), 250);
        const refreshSoon = debounced(() => sidebar.refresh(), 1500);
        listen(E.APP_READY, safe(onReady));
        listen(E.CHAT_CHANGED, safe(() => { chrome.updateTitle(); updateWelcome(); sidebar.render(); refreshRecent(); }));
        for (const t of [E.CHAT_CREATED, E.CHAT_DELETED, E.CHAT_RENAMED, E.GROUP_CHAT_CREATED, E.GROUP_CHAT_DELETED,
            E.CHARACTER_DELETED, E.CHARACTER_EDITED, E.CHARACTER_RENAMED, E.GROUP_UPDATED]) if (t) listen(t, refreshRecent);
        for (const t of [E.MESSAGE_SENT, E.MESSAGE_RECEIVED, E.MESSAGE_DELETED, E.MESSAGE_SWIPED]) if (t) listen(t, safe(() => { chrome.updateTitle(); refreshSoon(); }));
        listen(E.ONLINE_STATUS_CHANGED, safe(() => sidebar.updateFooter()));
        listen(E.PERSONA_CHANGED, safe(() => { sidebar.updateFooter(); chrome.renderWelcome(); }));
        if (E.SETTINGS_UPDATED) listen(E.SETTINGS_UPDATED, safe(() => sidebar.updateFooter()));
        if (E.CHATCOMPLETION_SOURCE_CHANGED) listen(E.CHATCOMPLETION_SOURCE_CHANGED, safe(() => sidebar.updateFooter()));
        // GENERATION_STARTED also fires for dry runs (token counting, prompt previews) and quiet
        // background prompts, which never emit ENDED — only real replies drive “正在回复…”.
        listen(E.GENERATION_STARTED, safe((type, _opts, dryRun) => { if (!dryRun && type !== 'quiet') chrome.setGenerating(true); }));
        for (const t of [E.GENERATION_ENDED, E.GENERATION_STOPPED, E.MESSAGE_RECEIVED, E.CHAT_CHANGED]) listen(t, safe(() => chrome.setGenerating(false)));

        // Welcome state follows what ST renders into #chat (welcomePanel ⇢ no chat open).
        const chat = document.getElementById('chat');
        if (chat) {
            const mo = new MutationObserver(debounced(updateWelcome, 30));
            mo.observe(chat, { childList: true });
            observers.push(mo);
        }
        // Sidebar dispatches (non-bubbling) `ag2-recent` after each load; capture it here.
        shell.addEventListener('ag2-recent', safe(() => chrome.renderWelcome()), true);

        if (appIsReady()) onReady();
    } catch (e) {
        fail(e);
    }
}

let readyRun = 0;
async function onReady() {
    readyHint = true;
    // APP_READY may arrive twice (live event + late-enable check): fill once per enable.
    if (document.body.classList.contains('ag2-ready') && Date.now() - readyRun < 2000) return;
    readyRun = Date.now();
    document.body.classList.add('ag2-ready');
    await importStPinsOnce();
    sidebar.updateFooter();
    chrome.updateTitle();
    updateWelcome();
    await sidebar.refresh();
    // ST re-opens pinned drawers ~300ms after start (RossAscends-mods); align once after it.
    later(alignPanels, 700);
}

/**
 * Startup alignment (§9.2 #4): close every panel ST opened by itself. The inspector
 * (ST's right panel) stays closed until P3 wires `ag2.inspector`. Storage untouched.
 */
async function alignPanels() {
    for (const el of document.querySelectorAll('.drawer-content.openDrawer')) {
        if (el.id) await toggleDrawer(el.id, false);
    }
}

function updateWelcome() {
    if (!on) return;
    const c = ctx();
    const welcome = c.characterId === undefined && !c.groupId && !!document.querySelector('#chat .welcomePanel');
    const was = document.body.classList.contains('ag2-welcome');
    document.body.classList.toggle('ag2-welcome', welcome);
    if (welcome && !was) chrome.renderWelcome();
}

export function disable({ reload = true } = {}) {
    if (!on) return;
    on = false;
    const { eventSource } = ctx();
    for (const [t, fn] of listeners) {
        try { eventSource.removeListener(t, fn); } catch { /* */ }
    }
    listeners = [];
    observers.forEach(o => o.disconnect());
    observers = [];
    timers.forEach(clearTimeout);
    timers = [];
    try { closeMenu(); } catch { /* */ }
    try { sidebar.unmount(); } catch { /* */ }
    try { chrome.unmount(); } catch { /* */ }
    shell?.remove();
    shell = null;
    document.querySelectorAll('[id^="ag2-"]').forEach(n => n.remove());
    document.body.classList.remove(...BODY_CLASSES);
    // Messages get shell-specific structure from P1b on; reload so they re-render natively.
    if (reload) {
        const c = ctx();
        if (c.characterId !== undefined || c.groupId) c.reloadCurrentChat?.().catch?.(() => {});
    }
}
