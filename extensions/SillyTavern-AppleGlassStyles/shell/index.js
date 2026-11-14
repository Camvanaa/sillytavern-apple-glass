// Apple Glass 2 shell — enable / teardown / routing (DESIGN §9.1, §9.2).
//
// Loaded by ../index.js only while the UI theme is "Apple Glass 2" and the URL has
// no `classic`. enable() runs while the splash still covers the page: it adds
// body.ag2 and an empty frame (#ag2-shell, a child of <body>, outside #sheld);
// data is filled after APP_READY / CHAT_CHANGED. disable() removes every node,
// class and listener it added and reloads the current chat.
// Any exception during enable → automatic teardown + one toastr.

export const BUILD = '20261114VF05';

import { local, importStPinsOnce, applyAppearance, clearAppearance } from './store.js?v=20261114VF05';
import { ctx, h, toggleDrawer, SET_PANELS, settingsModule, openSettings, isDesktop, INSP_ID, inspectorModule, loadInspector, setInspector, setShellApi, paletteModule, PHONE_MQ, loadPhone, phoneModule, isFloatingOpen, closeOtherFloating, paintOneRange, paintRanges } from './util.js?v=20261114VF05';
import { closeMenu } from './menu.js?v=20261114VF05';
import * as sidebar from './sidebar.js?v=20261114VF05';
import * as chrome from './chrome.js?v=20261114VF05';
import * as reading from './reading.js?v=20261114VF05';
import * as composer from './composer.js?v=20261114VF05';
import * as keys from './keys.js?v=20261114VF05';
import * as prompt from './prompt.js?v=20261114VF05';
import * as presets from './presets.js?v=20261114VF05';

const BODY_CLASSES = ['ag2', 'ag2-welcome', 'ag2-side-collapsed', 'ag2-ready', 'ag2-wand-open', 'ag2-set-open', 'ag2-insp-open', 'ag2-phone', 'ag2-kb'];
let on = false;
let lateEnable = false;
let shell = null;
let listeners = [];
let observers = [];
let timers = [];
let failed = false;
let phoneMq = null;

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

/** For lazily loaded modules (inspector): same teardown-on-error wrapper as the shell's own handlers. */
export const guarded = fn => safe(fn);

function fail(e) {
    console.error('[AG2] shell failed, falling back to the classic layout', e);
    disable();
    if (!failed) {
        failed = true;
        try { window.toastr?.error?.('Apple Glass 2 外壳出错，已回到原生布局。可在用户设置里切换主题。', 'Apple Glass 2', { timeOut: 8000 }); } catch { /* */ }
    }
}

const api = {
    /** focus: move focus to the counterpart button (clicks); the ⌘\ shortcut keeps it. */
    setCollapsed(v, { focus = true } = {}) {
        document.body.classList.toggle('ag2-side-collapsed', !!v);
        local.set('sidebar', v ? 'collapsed' : 'open');
        if (focus) (v ? document.querySelector('#ag2-title .ag2-expand') : document.querySelector('#ag2-sidebar [data-act="collapse"]'))?.focus?.({ preventScroll: true });
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
        setShellApi(api);
        keys.mount(); // ⌘K / ⌘\ / ⌘. / Esc layers (§8); the palette module loads on first use
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
        reading.bindReceipts();
        updateWelcome();
        // Phone layout (§5.9): width only. body.ag2-phone is set synchronously (the CSS needs
        // nothing else to lay the page out under the splash); phone.js (tab bar, back / ⋯,
        // keyboard) is imported only at phone widths.
        phoneMq = window.matchMedia(PHONE_MQ);
        phoneMq.addEventListener('change', onPhoneMq);
        onPhoneMq();

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
        watchFloating();
        prompt.mount();
        presets.mount();

        if (appIsReady()) onReady();
    } catch (e) {
        fail(e);
    }
}

/** Desktop ⇄ phone (rotation, window resize): phone.js mounts / unmounts its own nodes. */
const onPhoneMq = safe(() => {
    const phone = !!phoneMq?.matches;
    document.body.classList.toggle('ag2-phone', phone);
    if (phone) return loadPhone().then(m => { if (on && phoneMq?.matches) m.mount(shell, api); });
    phoneModule()?.unmount();
});

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
 * Startup alignment (§9.2 #4): close every panel ST opened by itself (NavLockOn re-opens
 * the right panel ~300ms after start). The inspector (ST's right panel) then follows
 * `ag2.inspector` instead — on desktop only; its module is loaded only when it is open.
 * ST's stored lock state is untouched.
 * After a mid-session theme switch the user is working in a drawer (通用 › 主题): the
 * settings window adopts it instead. Then the drawer observer starts.
 */
async function alignPanels() {
    const setIds = Object.values(SET_PANELS);
    let adopt = false;
    const wantInsp = isDesktop() && local.get('inspector') === 'open';
    for (const el of document.querySelectorAll('.drawer-content.openDrawer')) {
        if (lateEnable && setIds.includes(el.id)) { adopt = true; continue; }
        if (el.id === INSP_ID && wantInsp) continue;
        if (el.id) await toggleDrawer(el.id, false);
    }
    if (wantInsp) await setInspector(true, { persist: false });
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
            if (m?.isNavigating()) continue; // stale ST completions are drained by settings
            if (m?.isOpen()) m.sync(el.id, open);
            else if (open) openSettings(null); // desktop window / phone sheet (§5.9)
        }
    }));
    for (const id of Object.values(SET_PANELS)) {
        const el = document.getElementById(id);
        if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    }
    observers.push(mo);
    // Inspector = ST's right panel: whoever opens / closes it (shell toggle, 新建角色, ST code),
    // the inspector module follows `.openDrawer` (loaded on the first open).
    const insp = document.getElementById(INSP_ID);
    if (insp) {
        const mi = new MutationObserver(safe(recs => {
            const open = insp.classList.contains('openDrawer');
            if (!recs.some(r => /\bopenDrawer\b/.test(r.oldValue || '') !== open)) return;
            if (open) loadInspector().then(m => m?.sync()).catch(fail);
            else inspectorModule()?.sync();
        }));
        mi.observe(insp, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        observers.push(mi);
        inspectorModule()?.sync();
    }
}

let floatCleanups = [];
function watchFloating() {
    const mov = document.getElementById('movingDivs');
    if (!mov) return;
    let openSet = new Set();
    const syncAll = () => {
        const curOpen = [];
        for (const el of mov.querySelectorAll(':scope > .drawer-content')) {
            if (isFloatingOpen(el)) curOpen.push(el);
        }
        const newlyOpened = curOpen.findLast(el => !openSet.has(el)) || (curOpen.length > 1 ? curOpen[curOpen.length - 1] : null);
        if (newlyOpened && curOpen.length > 1) {
            closeOtherFloating(newlyOpened);
            openSet = new Set([newlyOpened]);
            paintRanges(newlyOpened);
        } else {
            openSet = new Set(curOpen);
            if (newlyOpened) paintRanges(newlyOpened);
        }
        if (newlyOpened?.id === 'logprobsViewer') {
            const content = newlyOpened.querySelector('.logprobs_panel_content');
            if (content && getComputedStyle(content).display === 'none') $('#logprovsViewerBlockToggle').trigger('click');
        }
        chrome.syncFloating();
        inspectorModule()?.syncFloating?.();
    };
    const mf = new MutationObserver(safe(() => syncAll()));
    const observeChildren = () => {
        mf.disconnect(); // release observers on plugin panels removed from the DOM
        for (const el of mov.querySelectorAll(':scope > .drawer-content')) {
            mf.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
        }
    };
    observeChildren();
    const mc = new MutationObserver(safe(() => { observeChildren(); syncAll(); }));
    mc.observe(mov, { childList: true });
    observers.push(mf, mc);
    const onInput = safe(e => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.type === 'range') paintOneRange(t);
        else if (t.type === 'number') {
            const box = t.closest('.drawer-content, #character_popup');
            if (box) queueMicrotask(safe(() => paintRanges(box)));
        }
    });
    mov.addEventListener('input', onInput, true);
    mov.addEventListener('change', onInput, true);
    const cp = document.getElementById('character_popup');
    if (cp) {
        cp.addEventListener('input', onInput, true);
        cp.addEventListener('change', onInput, true);
        const mcp = new MutationObserver(safe(() => {
            if (getComputedStyle(cp).display !== 'none') {
                closeOtherFloating(null);
                paintRanges(cp);
            }
        }));
        mcp.observe(cp, { attributes: true, attributeFilter: ['style', 'class'] });
        observers.push(mcp);
    }
    const pm = document.getElementById('completion_prompt_manager_popup');
    if (pm) {
        const mp = new MutationObserver(safe(() => {
            if (getComputedStyle(pm).display !== 'none') closeOtherFloating(null);
        }));
        mp.observe(pm, { attributes: true, attributeFilter: ['style', 'class'] });
        observers.push(mp);
    }
    floatCleanups.push(() => {
        mov.removeEventListener('input', onInput, true);
        mov.removeEventListener('change', onInput, true);
        cp?.removeEventListener('input', onInput, true);
        cp?.removeEventListener('change', onInput, true);
    });
    syncAll();
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
    floatCleanups.forEach(f => { try { f(); } catch { /* */ } });
    floatCleanups = [];
    watching = false;
    timers.forEach(clearTimeout);
    timers = [];
    if (decorateRaf) cancelAnimationFrame(decorateRaf);
    decorateRaf = 0;
    phoneMq?.removeEventListener('change', onPhoneMq);
    phoneMq = null;
    try { phoneModule()?.unmount(); } catch { /* */ }
    try { keys.unmount(); } catch { /* */ }
    try { prompt.unmount(); } catch { /* */ }
    try { presets.unmount(); } catch { /* */ }
    try { paletteModule()?.unmount(); } catch { /* */ }
    setShellApi(null);
    try { closeMenu(); } catch { /* */ }
    try { settingsModule()?.unmount(); } catch { /* */ }
    try { inspectorModule()?.unmount(); } catch { /* */ }
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
