// Apple Glass 2 shell — one SillyTavern core rule, replaced by an observer (performance).
//
// style.css lifts #top-settings-holder above ST's popups with
//   body:has(.drawer-content.maximized | .drawer-content.open | #character_popup.open)
//     #top-settings-holder:has(.drawer-content.openDrawer:not(.fillLeft):not(.fillRight)) { z-index: 4005 }
// The first time a centred drawer opens (every settings page except 连接 / 生成参数), matching
// that rule marks <body> as depending on :has(). From then on, and until a reload, Blink
// restyles the whole document for every node inserted anywhere: each streamed token cost
// ~6× as much. The rule is taken out of its stylesheet here and its z-index is applied
// from class observers instead. unmount() puts the rule back.

const SUBJECT = '#top-settings-holder:has(.drawer-content.openDrawer:not(.fillLeft):not(.fillRight))';
const LIFTED = '.drawer-content.maximized, .drawer-content.open, #character_popup.open';
const CENTRED = '.drawer-content.openDrawer:not(.fillLeft):not(.fillRight)';

let removed = [];   // [{ owner, index, text }]
let zIndex = null;  // [value, priority] of the removed rule
let watchClass = null;
let watchList = null;

function takeRules(owner) {
    let rules;
    try { rules = owner.cssRules; } catch { return; } // cross-origin sheet
    for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        const sel = r.selectorText;
        if (sel && sel.startsWith('body:has(') && sel.includes(SUBJECT) && r.style?.length === 1 && r.style.getPropertyValue('z-index')) {
            zIndex ??= [r.style.getPropertyValue('z-index'), r.style.getPropertyPriority('z-index')];
            removed.push({ owner, index: i, text: r.cssText });
            owner.deleteRule(i);
        } else if (r.cssRules?.length && !sel) takeRules(r); // @media / @supports / @layer
    }
}

function apply() {
    const holder = document.getElementById('top-settings-holder');
    if (!holder || !zIndex) return;
    const lift = !!document.querySelector(LIFTED) && !!holder.querySelector(CENTRED);
    if (lift) holder.style.setProperty('z-index', zIndex[0], zIndex[1]);
    else holder.style.removeProperty('z-index');
}

function observe() {
    watchClass.disconnect();
    for (const el of document.querySelectorAll('.drawer-content, #character_popup')) {
        watchClass.observe(el, { attributes: true, attributeFilter: ['class'] });
    }
}

export function mount() {
    if (removed.length) return;
    for (const sheet of document.styleSheets) {
        if (sheet.ownerNode?.id !== 'custom-style') takeRules(sheet);
    }
    if (!removed.length) return; // this ST has no such rule: nothing to replace
    const run = () => { try { apply(); } catch (e) { console.error('[AG2] core-fixes', e); } };
    watchClass = new MutationObserver(run);
    // drawers added later (extensions add their own to the holder / the floating layer)
    watchList = new MutationObserver(() => { observe(); run(); });
    for (const id of ['top-settings-holder', 'movingDivs']) {
        const el = document.getElementById(id);
        if (el) watchList.observe(el, { childList: true });
    }
    observe();
    run();
}

export function unmount() {
    watchClass?.disconnect();
    watchList?.disconnect();
    watchClass = watchList = null;
    document.getElementById('top-settings-holder')?.style.removeProperty('z-index');
    // deleted from the end of each list, so re-inserting in reverse restores the order
    for (const { owner, index, text } of removed.reverse()) {
        try { owner.insertRule(text, Math.min(index, owner.cssRules.length)); } catch { /* sheet gone */ }
    }
    removed = [];
    zIndex = null;
}
