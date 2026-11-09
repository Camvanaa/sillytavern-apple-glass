// Apple Glass 2 shell — enable / teardown / routing (DESIGN §9.1, §9.2).
//
// Loaded by ../index.js only while the UI theme is "Apple Glass 2" and the URL has
// no `classic`. enable() runs while the splash still covers the page: it adds
// body.ag2 and an empty frame (#ag2-shell, a child of <body>, outside #sheld);
// data is filled after APP_READY / CHAT_CHANGED. disable() removes every node,
// class and listener it added and reloads the current chat.
// Any exception during enable → automatic teardown + one toastr.

export const BUILD = '202611091000';

import { local, importStPinsOnce, applyAppearance, clearAppearance } from './store.js?v=202611091000';
import { ctx, h, toggleDrawer, SET_PANELS, settingsModule, openSettings, isDesktop } from './util.js?v=202611091000';
import { closeMenu } from './menu.js?v=202611091000';
import * as sidebar from './sidebar.js?v=202611091000';
import * as chrome from './chrome.js?v=202611091000';
import * as reading from './reading.js?v=202611091000';
import * as composer from './composer.js?v=202611091000';

const BODY_CLASSES = ['ag2', 'ag2-welcome', 'ag2-side-collapsed', 'ag2-ready', 'ag2-wand-open', 'ag2-set-open'];
let on = false;
let lateEnable = false;
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
        lateEnable = appIsReady(); // theme switched mid-session (not a cold start)
        document.body.classList.add('ag2');
        applyAppearance(); // accent / reading size / width / meta (§5.5): attributes only
        if (local.get('sidebar') === 'collapsed') document.body.classList.add('ag2-side-collapsed');
        shell = h('div');
        shell.id = 'ag2-shell';
        shell.dataset.build = BUILD;
        document.body.append(shell);
        sidebar.mount(shell, api);
        chrome.mount(shell, api);
        composer.mount();
        // Message template (§9.2 #7): copy + branch join the action row. Messages already on
        // screen (theme switched mid-session) are re-rendered once so they get it too.
        if (reading.patchTemplate() && document.querySelector('#chat > .mes')) {
            const c = ctx();
            if (c.characterId !== undefined || c.groupId) c.reloadCurrentChat?.()?.catch?.(() => {});
        }
        reading.decorate();
        updateWelcome();

        const { eventTypes: E } = ctx();
        const refreshRecent = debounced(() => sidebar.refresh(), 250);
        const refreshSoon = debounced(() => sidebar.refresh(), 1500);
        listen(E.APP_READY, safe(onReady));
        listen(E.CHAT_CHANGED, safe(() => { chrome.updateTitle(); updateWelcome(); sidebar.render(); refreshRecent(); decorateSoon(); composer.syncText(); }));
        for (const t of [E.MESSAGE_SWIPED, E.MESSAGE_UPDATED, E.MESSAGE_EDITED, E.MESSAGE_RECEIVED, E.MESSAGE_DELETED,
            E.MORE_MESSAGES_LOADED, E.CHARACTER_MESSAGE_RENDERED, E.USER_MESSAGE_RENDERED]) if (t) listen(t, decorateSoon);
        for (const t of [E.ONLINE_STATUS_CHANGED, E.CHATCOMPLETION_MODEL_CHANGED, E.CHATCOMPLETION_SOURCE_CHANGED,
            E.MAIN_API_CHANGED, E.SETTINGS_UPDATED, E.CONNECTION_PROFILE_LOADED, E.SETTINGS_LOADED]) if (t) listen(t, safe(() => composer.updateModel()));
        for (const t of [E.MESSAGE_SENT, E.GENERATION_ENDED, E.GENERATION_STOPPED, E.IMPERSONATE_READY]) if (t) listen(t, safe(() => setTimeout(composer.syncText, 0)));
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
            const welcomeSoon = debounced(updateWelcome, 30);
            // Messages added / removed → re-derive ag2-day / ag2-cont (classes only, §5.3)
            const mo = new MutationObserver(() => { welcomeSoon(); decorateSoon(); });
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

let decorateRaf = 0;
function decorateSoon() {
    if (decorateRaf || !on) return;
    decorateRaf = requestAnimationFrame(safe(() => { decorateRaf = 0; reading.decorate(); }));
}

let readyRun = 0;
async function onReady() {
    readyHint = true;
    // APP_READY may arrive twice (live event + late-enable check): fill once per enable.
    if (document.body.classList.contains('ag2-ready') && Date.now() - readyRun < 2000) return;
    readyRun = Date.now();
    document.body.classList.add('ag2-ready');
    await importStPinsOnce();
    applyAppearance();
    sidebar.updateFooter();
    chrome.updateTitle();
    composer.updateModel();
    reading.decorate();
    updateWelcome();
    await sidebar.refresh();
    // ST re-opens pinned drawers ~300ms after start (RossAscends-mods); align once after it.
    later(alignPanels, 700);
}

/**
 * Startup alignment (§9.2 #4): close every panel ST opened by itself. The inspector
 * (ST's right panel) stays closed until P3 wires `ag2.inspector`. Storage untouched.
 * After a mid-session theme switch the user is working in a drawer (通用 › 主题): the
 * settings window adopts it instead. Then the drawer observer starts.
 */
async function alignPanels() {
    const setIds = Object.values(SET_PANELS);
    let adopt = false;
    for (const el of document.querySelectorAll('.drawer-content.openDrawer')) {
        if (lateEnable && setIds.includes(el.id) && isDesktop()) { adopt = true; continue; }
        if (el.id) await toggleDrawer(el.id, false);
    }
    if (adopt) await openSettings(null);
    watchPanels();
}

/**
 * The settings window follows `.openDrawer` (§9.2 #1). A settings drawer opened by any path
 * (ST code, slash commands, a leftover entry point) on desktop opens the window on its page;
 * while the window is open, changes go to settings.sync(). Observer only — the window
 * module is still loaded on first use.
 */
let watching = false;
function watchPanels() {
    if (watching) return;
    watching = true;
    const mo = new MutationObserver(safe(recs => {
        for (const r of recs) {
            const el = r.target;
            const open = el.classList.contains('openDrawer');
            if (open === /\bopenDrawer\b/.test(r.oldValue || '')) continue;
            const m = settingsModule();
            if (m?.isOpen()) m.sync(el.id, open);
            else if (open && isDesktop()) openSettings(null);
        }
    }));
    for (const id of Object.values(SET_PANELS)) {
        const el = document.getElementById(id);
        if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    }
    observers.push(mo);
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
    watching = false;
    timers.forEach(clearTimeout);
    timers = [];
    if (decorateRaf) cancelAnimationFrame(decorateRaf);
    decorateRaf = 0;
    try { closeMenu(); } catch { /* */ }
    try { settingsModule()?.unmount(); } catch { /* */ }
    try { clearAppearance(); } catch { /* */ }
    try { sidebar.unmount(); } catch { /* */ }
    try { chrome.unmount(); } catch { /* */ }
    try { composer.unmount(); } catch { /* */ }
    try { reading.restoreTemplate(); } catch { /* */ }
    try { reading.undecorate(); } catch { /* */ }
    shell?.remove();
    shell = null;
    document.querySelectorAll('[id^="ag2-"]').forEach(n => n.remove());
    document.body.classList.remove(...BODY_CLASSES);
    // Messages carry the patched template (copy / branch in the action row): reload so they
    // re-render from ST's original template.
    if (reload) {
        const c = ctx();
        if (c.characterId !== undefined || c.groupId) c.reloadCurrentChat?.().catch?.(() => {});
    }
}
