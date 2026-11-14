// Apple Glass 2 shell — reading area (DESIGN §5.3, §9.2 #7/#8).
//
// 1. Message template: `.mes_copy` and `.mes_create_branch` move out of ST's hidden
//    “…” group (`.extraMesButtons`) into `.mes_buttons`, right before the “…” hint, so
//    every message rendered afterwards has copy / edit / branch / more in its action
//    row. The buttons keep their classes, and ST binds them by document-level
//    delegation, so they work wherever they sit. Teardown puts them back.
// 2. Decoration (classes + data attributes only — nothing is inserted into #chat):
//    - `ag2-day` + data-ag2-day="11月14日 星期二" on the first message of each day
//      (CSS draws the label with ::before)
//    - `ag2-cont` on a message whose previous message has the same speaker on the
//      same day (CSS hides the repeated avatar + name)
//    - data-ag2-model on AI messages (model name for the meta line, CSS ::after)
//    - data-ag2-time="HH:MM" on `.timestamp` (header shows the short time)

import { ctx, toDate } from './util.js?v=20261114VF01';

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const pad = n => String(n).padStart(2, '0');

let moved = [];

/** Moves copy + branch in #message_template; returns true if the template changed. */
export function patchTemplate() {
    const buttons = document.querySelector('#message_template .mes_buttons');
    const hint = buttons?.querySelector(':scope > .extraMesButtonsHint');
    if (!buttons || !hint || moved.length) return false;
    for (const sel of ['.mes_copy', '.mes_create_branch']) {
        const node = buttons.querySelector(`.extraMesButtons > ${sel}`);
        if (!node) continue;
        moved.push({ node, parent: node.parentElement, next: node.nextSibling });
        buttons.insertBefore(node, hint);
    }
    return moved.length > 0;
}

/** Puts the template buttons back where ST had them. */
export function restoreTemplate() {
    for (const m of moved.reverse()) {
        const next = m.next && m.next.parentNode === m.parent ? m.next : null;
        m.parent.insertBefore(m.node, next);
    }
    const changed = moved.length > 0;
    moved = [];
    return changed;
}

export function dayLabel(d, now = new Date()) {
    const md = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`;
    return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

function setAttr(el, name, value) {
    if (value == null || value === '') {
        if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) {
        el.setAttribute(name, value);
    }
}

function speaker(m) {
    if (!m) return null;
    return `${m.is_user ? 'u' : 'c'}:${m.is_system ? 's' : ''}:${m.name ?? ''}:${m.force_avatar ?? ''}`;
}

/** Re-derives ag2-day / ag2-cont / model / short time for every rendered message. */
export function decorate() {
    const chatEl = document.getElementById('chat');
    if (!chatEl) return;
    const chat = ctx().chat || [];
    const now = new Date();
    let prevKey = null, prevSpeaker = null;
    for (const el of chatEl.children) {
        if (!el.classList.contains('mes')) continue;
        const m = chat[Number(el.getAttribute('mesid'))];
        const d = toDate(m?.send_date);
        const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : prevKey;
        const newDay = !!d && key !== prevKey;
        el.classList.toggle('ag2-day', newDay);
        setAttr(el, 'data-ag2-day', newDay ? dayLabel(d, now) : null);
        const who = speaker(m);
        el.classList.toggle('ag2-cont', !newDay && who !== null && who === prevSpeaker && !m.is_system);
        setAttr(el, 'data-ag2-model', !m?.is_user && m?.extra?.model ? String(m.extra.model) : null);
        const ts = el.querySelector('.ch_name .timestamp');
        if (ts) setAttr(ts, 'data-ag2-time', d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : null);
        // one-line receipts: mark whether the text really truncates, so the “展开” hint
        // only shows on the ones that do (data-ag2-clamp on .mes_text; CSS draws the hint).
        // Re-measured on every decorate pass (resize, font-size change, new messages).
        const txt = el.querySelector('.mes_text');
        if (txt && el.classList.contains('smallSysMes') && !el.querySelector('.edit_textarea')) {
            const expanded = el.classList.contains('ag2-ssb-open');
            const over = expanded || txt.scrollHeight > txt.clientHeight + 1 || txt.scrollWidth > txt.clientWidth + 1;
            const v = over ? '1' : '0';
            if (txt.dataset.ag2Clamp !== v) txt.dataset.ag2Clamp = v;
            setAttr(el, 'data-ag2-clamp', v);
            txt.setAttribute('tabindex', '0');
            txt.setAttribute('role', 'button');
            txt.setAttribute('aria-expanded', String(expanded));
            txt.title = expanded ? '收起全文' : '点击展开全文';
        }
        prevKey = key;
        prevSpeaker = who;
    }
}

// ------------------------------------------------------------------ small system messages (§5.3c-C)
// A compact receipt (…/sys/comment compact=true) truncates its option text to one line.
// Click / tap the divider text (or Enter / Space when focused) to expand the full text,
// click again to collapse. Delegated on #chat: nothing is bound per message, nothing is
// inserted — only an `ag2-ssb-open` class toggles, so ST's own click handlers (edit, copy)
// are untouched and the chat file is never written.
let ssbBound = null;
let ssbDown = null;
let ssbKey = null;
let ssbResize = null;
let ssbFrame = 0;

export function bindReceipts() {
    const chat = document.getElementById('chat');
    if (!chat || ssbBound) return;
    // One handler, two jobs on a small-system receipt:
    //  1. touch: the tap pins the action bar open (ag2-ssb-bar) — :hover alone would hide
    //     it the moment the tap lands on a bar button, and ST's “更多” popup would close at
    //     once. A later tap on another receipt / outside / on the bar's own buttons moves on.
    //  2. expand: a tap on the (truncated) text toggles the full text (ag2-ssb-open). Double-
    //     click (selection) never toggles: selecting is not a tap.
    ssbBound = e => {
        if (e.detail > 1) return;
        const t = e.target instanceof Element ? e.target : null;
        const mes = t?.closest?.('#chat > .mes.smallSysMes');
        if (!mes || mes.querySelector('.edit_textarea')) return;
        const inBar = !!t.closest('.mes_buttons, .mes_edit_buttons, .extraMesButtons');
        if (inBar) return; // the bar's own buttons do their own thing
        if (t.closest('a, button, input, select, textarea, summary, details, pre, code, iframe, [contenteditable="true"]')) return;
        if (String(getSelection?.() || '') !== '') return;
        const touch = document.body.classList.contains('ag2-phone'); // width ≤1000px (§5.9): touch layout
        if (touch) {
            const open = mes.classList.toggle('ag2-ssb-bar');
            for (const other of chat.querySelectorAll('.mes.smallSysMes.ag2-ssb-bar')) if (other !== mes) other.classList.remove('ag2-ssb-bar');
            if (!open) mes.classList.remove('ag2-ssb-bar');
        }
        if (!t.closest('.mes_text')) return;
        const expanded = mes.classList.toggle('ag2-ssb-open');
        decorate();
        if (expanded) requestAnimationFrame(() => {
            // The composer overlays #chat: native scrollIntoView cannot see that occlusion.
            // Reveal the end of a short receipt; for very long prose keep its beginning visible.
            if (!mes.isConnected || !mes.classList.contains('ag2-ssb-open')) return;
            const box = mes.querySelector('.mes_block').getBoundingClientRect();
            const bounds = chat.getBoundingClientRect();
            const dock = document.getElementById('form_sheld')?.getBoundingClientRect();
            const top = bounds.top + 70;
            const bottom = Math.min(bounds.bottom, dock?.top || innerHeight) - 36;
            if (box.bottom > bottom) chat.scrollTop += Math.min(box.bottom - bottom, Math.max(0, box.top - top));
        });
    };
    // any pointer-down outside the receipts drops the pinned bars (touch)
    ssbDown = e => {
        if (!(e.target instanceof Element) || e.target.closest('#chat .mes.smallSysMes')) return;
        chat.querySelectorAll('.mes.smallSysMes.ag2-ssb-bar').forEach(m => m.classList.remove('ag2-ssb-bar'));
    };
    chat.addEventListener('click', ssbBound);
    ssbKey = e => {
        if (!['Enter', ' '].includes(e.key) || !e.target.matches?.('.smallSysMes .mes_text[role="button"]')) return;
        e.preventDefault();
        e.stopPropagation();
        e.target.click();
    };
    chat.addEventListener('keydown', ssbKey);
    document.addEventListener('pointerdown', ssbDown, true);
    ssbResize = new ResizeObserver(() => {
        cancelAnimationFrame(ssbFrame);
        ssbFrame = requestAnimationFrame(decorate);
    });
    ssbResize.observe(chat);
}

export function unbindReceipts() {
    if (ssbBound) document.getElementById('chat')?.removeEventListener('click', ssbBound);
    if (ssbKey) document.getElementById('chat')?.removeEventListener('keydown', ssbKey);
    if (ssbDown) document.removeEventListener('pointerdown', ssbDown, true);
    ssbResize?.disconnect();
    ssbResize = null;
    cancelAnimationFrame(ssbFrame);
    ssbBound = ssbDown = ssbKey = null;
    document.querySelectorAll('#chat > .mes.smallSysMes.ag2-ssb-open').forEach(m => m.classList.remove('ag2-ssb-open'));
}

/** Removes every class / attribute decorate() added (teardown without a reload). */
export function undecorate() {
    unbindReceipts();
    document.querySelectorAll('#chat > .mes').forEach(el => {
        el.classList.remove('ag2-day', 'ag2-cont', 'ag2-ssb-open', 'ag2-ssb-bar');
        el.removeAttribute('data-ag2-day');
        el.removeAttribute('data-ag2-model');
        el.removeAttribute('data-ag2-clamp');
        const txt = el.querySelector('.mes_text[data-ag2-clamp]');
        if (txt) for (const a of ['data-ag2-clamp', 'role', 'tabindex', 'aria-expanded', 'title']) txt.removeAttribute(a);
        el.querySelector('.timestamp')?.removeAttribute('data-ag2-time');
    });
}
