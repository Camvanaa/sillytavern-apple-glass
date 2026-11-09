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

import { ctx, toDate } from './util.js?v=202611091515';

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
        prevKey = key;
        prevSpeaker = who;
    }
}

/** Removes every class / attribute decorate() added (teardown without a reload). */
export function undecorate() {
    document.querySelectorAll('#chat > .mes').forEach(el => {
        el.classList.remove('ag2-day', 'ag2-cont');
        el.removeAttribute('data-ag2-day');
        el.removeAttribute('data-ag2-model');
        el.querySelector('.timestamp')?.removeAttribute('data-ag2-time');
    });
}
