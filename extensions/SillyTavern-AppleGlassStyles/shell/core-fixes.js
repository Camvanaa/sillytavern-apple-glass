// Apple Glass 2 shell — stylesheet rules that make every page change expensive, replaced by
// observers (performance).
//
// 1. SillyTavern's style.css lifts #top-settings-holder above ST's popups with
//      body:has(.drawer-content.maximized | .drawer-content.open | #character_popup.open)
//        #top-settings-holder:has(.drawer-content.openDrawer:not(.fillLeft):not(.fillRight)) { z-index: 4005 }
//    The first time a centred drawer opens (every settings page except 连接 / 生成参数), matching
//    that rule marks <body> as depending on :has(). From then on, and until a reload, Blink
//    restyles the whole document for every node inserted anywhere: each streamed token cost
//    ~6× as much. The rule is taken out of its stylesheet here and its z-index is applied
//    from class observers instead.
//
// 2. An extension rule anchored on <body> by one class, `body:has(.CLASS)`: JS-Slash-Runner
//    (酒馆助手) dims the page with `body:has(.TH-popup)::before`. ST's own `[style*=…]`
//    :has() arguments make every inline-style write relevant to :has(); with <body> as an
//    anchor, each one re-matched the whole document and laid it out again, 15–35ms per frame
//    of every sidebar, inspector and settings animation. The rule is rewritten in place (same
//    sheet, position, specificity and declarations) to `body[data-ag2-has-CLASS]`, and the
//    attribute follows the class's presence. Sheets that load later are handled on arrival.
//
// unmount() puts every original rule back.

const SUBJECT = '#top-settings-holder:has(.drawer-content.openDrawer:not(.fillLeft):not(.fillRight))';
const LIFTED = '.drawer-content.maximized, .drawer-content.open, #character_popup.open';
const CENTRED = '.drawer-content.openDrawer:not(.fillLeft):not(.fillRight)';
const BODY_HAS = /^body:has\(\.(-?[_a-zA-Z][\w-]*)\)((?:::?[a-z-]+)?)$/;

let mounted = false;
let removed = [];   // [{ owner, index, text }]
let zIndex = null;  // [value, priority] of the removed rule
let watchClass = null;
let watchList = null;
let rewritten = []; // [{ owner, rule, text }]: rule = the replacement, text = the original
let present = new Map(); // class → { attr, list (live), on }
let watchHas = null;
let watchHead = null;
let pending = [];   // [link, onLoad]

const isOwn = sheet => sheet?.ownerNode?.id === 'custom-style';

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

function rewriteRules(owner) {
    let rules;
    try { rules = owner.cssRules; } catch { return; }
    for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        const sel = r.selectorText;
        const m = sel && !r.cssRules?.length && BODY_HAS.exec(sel);
        if (m) {
            const attr = 'data-ag2-has-' + m[1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
            const text = r.cssText;
            const body = r.style.cssText;
            owner.deleteRule(i);
            owner.insertRule(`body[${attr}]${m[2]} { ${body} }`, i);
            rewritten.push({ owner, rule: owner.cssRules[i], text });
            if (!present.has(m[1])) present.set(m[1], { attr, list: document.getElementsByClassName(m[1]), on: null });
        } else if (r.cssRules?.length && !sel) rewriteRules(r);
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

// The class can only appear with an inserted node and disappear with a removed one; the
// live collection is counted only then (a full walk), not for every streamed token.
function addsClass(records, cls) {
    for (const r of records) {
        for (const n of r.addedNodes) {
            if (n.nodeType === 1 && (n.classList.contains(cls) || n.getElementsByClassName(cls).length)) return true;
        }
    }
    return false;
}

function syncHas(records = null) {
    for (const [cls, s] of present) {
        if (records && s.on !== null && !(s.on ? records.some(r => r.removedNodes.length) : addsClass(records, cls))) continue;
        const on = s.list.length > 0;
        if (on !== s.on) {
            s.on = on;
            document.body.toggleAttribute(s.attr, on);
        }
    }
}

function adopt(sheet) {
    if (!sheet || isOwn(sheet)) return;
    rewriteRules(sheet);
    if (!present.size) return;
    if (!watchHas) {
        watchHas = new MutationObserver(records => { try { syncHas(records); } catch (e) { console.error('[AG2] core-fixes', e); } });
        watchHas.observe(document.body, { childList: true, subtree: true });
    }
    syncHas();
}

function adoptNode(node) {
    if (node instanceof HTMLStyleElement) { adopt(node.sheet); return; }
    if (!(node instanceof HTMLLinkElement) || !/\bstylesheet\b/i.test(node.rel)) return;
    if (node.sheet) { adopt(node.sheet); return; }
    const onLoad = () => {
        pending = pending.filter(([l]) => l !== node);
        if (mounted) adopt(node.sheet);
    };
    pending.push([node, onLoad]);
    node.addEventListener('load', onLoad, { once: true });
}

export function mount() {
    if (mounted) return;
    mounted = true;
    for (const sheet of document.styleSheets) {
        if (!isOwn(sheet)) takeRules(sheet);
    }
    if (removed.length) {
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
    for (const sheet of document.styleSheets) adopt(sheet);
    // extension stylesheets still loading, or added later
    for (const link of document.querySelectorAll('link')) if (!link.sheet) adoptNode(link);
    watchHead = new MutationObserver(records => {
        for (const r of records) for (const n of r.addedNodes) adoptNode(n);
    });
    watchHead.observe(document.head, { childList: true });
}

export function unmount() {
    if (!mounted) return;
    mounted = false;
    watchClass?.disconnect();
    watchList?.disconnect();
    watchHas?.disconnect();
    watchHead?.disconnect();
    watchClass = watchList = watchHas = watchHead = null;
    for (const [link, onLoad] of pending) link.removeEventListener('load', onLoad);
    pending = [];
    document.getElementById('top-settings-holder')?.style.removeProperty('z-index');
    // deleted from the end of each list, so re-inserting in reverse restores the order
    for (const { owner, index, text } of removed.reverse()) {
        try { owner.insertRule(text, Math.min(index, owner.cssRules.length)); } catch { /* sheet gone */ }
    }
    removed = [];
    zIndex = null;
    for (const { owner, rule, text } of rewritten.reverse()) {
        try {
            const i = Array.prototype.indexOf.call(owner.cssRules, rule);
            if (i < 0) continue;
            owner.deleteRule(i);
            owner.insertRule(text, i);
        } catch { /* sheet gone */ }
    }
    rewritten = [];
    for (const { attr } of present.values()) document.body.removeAttribute(attr);
    present = new Map();
}
