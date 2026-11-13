// Apple Glass 2 shell — keyboard shortcuts and the Esc layer order (DESIGN §8, §5.7).
//
//   ⌘K / Ctrl+K      command palette (toggle)
//                    Ctrl+K inside a textarea with ST's Markdown hotkeys on belongs to ST
//                    (inline code) → Ctrl+Shift+K opens the palette there (and anywhere).
//                    On macOS only ⌘ counts, so ST's Ctrl-based hotkeys are never taken.
//   ⌘/Ctrl + \       show / hide the sidebar
//   ⌘/Ctrl + .       show / hide the inspector (desktop)
//   Esc              shell layers first, capture phase: palette → menu (menu.js) → settings
//                    window (settings.js) → inspector; nothing of ours open → ST's own Esc.
// Never fires while an IME is composing, on auto-repeat of the palette key, or on top of an
// ST popup. One window-capture listener, added on enable and removed on teardown.

import { isMac, openPalette, paletteModule, settingsModule, setInspector, isDesktop, getShellApi, ctx, INSP_ID, stLayerUp } from './util.js?v=20261113QA05';
import { isMenuOpen } from './menu.js?v=20261113QA05';

let mounted = false;

export function mount() {
    if (mounted) return;
    mounted = true;
    window.addEventListener('keydown', onKey, true);
}

export function unmount() {
    mounted = false;
    window.removeEventListener('keydown', onKey, true);
}

const TEXT_SEL = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable=""], [contenteditable="true"]';
const isText = el => el instanceof HTMLElement && el.matches(TEXT_SEL);

/** ST's Markdown hotkeys (input-md-formatting.js) handle Ctrl+K in `textarea.mdHotkeys`. */
const mdOwnsCtrlK = el => el instanceof HTMLElement && el.matches('textarea.mdHotkeys') && !!ctx().powerUserSettings?.enable_md_hotkeys;

/** e.key first (layout-aware); the physical key only when the layout gives a non-ASCII char. */
function is(e, ch, code) {
    const k = (e.key || '').toLowerCase();
    return k === ch || (e.code === code && !/^[\x21-\x7e]$/.test(k));
}

function onKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (!document.body.classList.contains('ag2')) return;
    if (e.key === 'Escape') { onEsc(e); return; }
    const mac = isMac();
    const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod || e.altKey) return;
    const pal = paletteModule();

    if (is(e, 'k', 'KeyK')) {
        if (pal?.isCovered()) return;
        if (!e.shiftKey && !mac && mdOwnsCtrlK(e.target)) return; // ST: insert inline code
        if (!pal?.isOpen() && stLayerUp()) return;                // not on top of an ST popup
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        if (pal?.isOpen()) pal.close(); else openPalette();
        return;
    }
    if (e.shiftKey || pal?.isOpen() || stLayerUp() || settingsModule()?.isOpen()) return;

    if (is(e, '\\', 'Backslash')) {
        if (!isDesktop()) return; // phone layout (P5) has no collapsible sidebar
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        const collapse = !document.body.classList.contains('ag2-side-collapsed');
        // keep the user's focus (typing in the input box); only focus that would vanish moves
        const inSide = !!document.activeElement?.closest?.('#ag2-sidebar');
        getShellApi()?.setCollapsed(collapse, { focus: collapse && inSide });
    } else if (is(e, '.', 'Period')) {
        if (!isDesktop()) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        toggleInspector();
    }
}

async function toggleInspector(want) {
    const panel = document.getElementById(INSP_ID);
    const open = document.body.classList.contains('ag2-insp-open');
    if (want === undefined) want = !open;
    const hadFocus = !!panel?.contains(document.activeElement);
    await setInspector(want);
    // focus inside the closed panel would fall to <body>: hand it to the toggle button
    if (!want && hadFocus) document.querySelector('#ag2-tools [data-act="insp"]')?.focus({ preventScroll: true });
}

const vis = sel => { try { return $(sel).is(':visible'); } catch { return false; } };

function onEsc(e) {
    const pal = paletteModule();
    if (pal?.isCovered() || (e.target instanceof HTMLSelectElement && e.target.matches(':open'))) return;
    if (pal?.isOpen()) { e.preventDefault(); e.stopImmediatePropagation(); pal.close(); return; }
    if (isMenuOpen()) return;                 // menu.js closes it (document capture, stops ST)
    if (settingsModule()?.isOpen()) return;   // settings.js's own window handler
    if (stLayerUp()) return;                  // ST popups / editor own Esc
    // Inspector: the last shell layer. ST's floating panels, a running generation (Esc =
    // stop) and autocomplete keep their Esc first, as in ST's own order.
    if (!document.body.classList.contains('ag2-insp-open')) return;
    if (vis('#mes_stop') || vis('.autoComplete') || vis('#floatingPrompt') || vis('#cfgConfig')
        || vis('#logprobsViewer') || vis('#WorldInfo') || vis('#movingDivs > div')) return;
    const a = document.activeElement;
    const panel = document.getElementById(INSP_ID);
    e.preventDefault();
    e.stopImmediatePropagation();
    // first Esc leaves a field being edited inside the inspector; a field elsewhere (the input
    // box) does not hold Esc — ST's own Esc would close the right panel here as well
    if (isText(a) && panel?.contains(a)) { a.blur(); return; }
    toggleInspector(false);
}
