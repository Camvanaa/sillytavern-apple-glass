// Apple Glass 2 shell — ST bridge + small helpers shared by the shell modules.
// Every action goes through ST's own entry points (§9.2): exported functions from
// script.js / group-chats.js, getContext(), or a .trigger('click') on ST's buttons.

import {
    doNavbarIconClick, selectCharacterById, openCharacterChat, getCurrentChatId,
    renameGroupOrCharacterChat, deleteCharacterChatByName, newAssistantChat,
    is_send_press, isChatSaving, getThumbnailUrl, user_avatar, online_status,
} from '../../../../../script.js';
import { openGroupById, openGroupChat, deleteGroupChatByName, is_group_generating } from '../../../../group-chats.js';
import { local } from './store.js?v=202611091428';

export { doNavbarIconClick, getCurrentChatId, newAssistantChat };

export const ctx = () => SillyTavern.getContext();

export function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

export function toast(kind, msg) {
    try { window.toastr?.[kind]?.(msg, '', { timeOut: 2600 }); } catch { /* toastr missing */ }
}

/** Shell rule 4: pointer-downs in shell UI never reach ST's “clicked outside” logic. */
export function guard(el) {
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    return el;
}

// ---------------------------------------------------------------- time / text
const pad = n => String(n).padStart(2, '0');
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function toDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return new Date(v);
    const d = new Date(v);
    if (!isNaN(d)) return d;
    // ST humanized dates: "2026-11-08@13h30m00s" / "November 8, 2026 1:30pm"
    const m = String(v).match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*@(\d{1,2})h\s*(\d{1,2})m/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    const t = Date.parse(String(v).replace(/(\d)(am|pm)/i, '$1 $2'));
    return isNaN(t) ? null : new Date(t);
}

const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 今天 → 时刻 · 昨天 · 7 天内 → 周几 · 今年 → 月/日 · 更早 → 年/月/日 (§5.1) */
export function fmtTime(v, now = new Date()) {
    const d = toDate(v);
    if (!d) return '';
    const days = Math.round((dayStart(now) - dayStart(d)) / 864e5);
    if (days <= 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (days === 1) return '昨天';
    if (days < 7) return WEEK[d.getDay()];
    if (d.getFullYear() === now.getFullYear()) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function ageDays(v, now = new Date()) {
    const d = toDate(v);
    return d ? Math.round((dayStart(now) - dayStart(d)) / 864e5) : Infinity;
}

/** Plain one-line summary: drop HTML comments, tags, code fences, markdown marks. */
export function summary(text, max = 120) {
    let s = String(text ?? '');
    s = s.replace(/<!--[\s\S]*?(-->|$)/g, ' ')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/```[\s\S]*?(```|$)/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/[*_~`#>|]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
}

export const stem = f => String(f ?? '').replace(/\.jsonl$/i, '');

// ---------------------------------------------------------------- ST state
export function busy() {
    return !!(is_send_press || isChatSaving || is_group_generating);
}

export function thumb(type, file) {
    try { return getThumbnailUrl(type, file); } catch { return ''; }
}

export const personaAvatar = () => user_avatar;
export const onlineStatus = () => online_status;

export function charIndex(avatar) {
    return ctx().characters.findIndex(c => c.avatar === avatar);
}

/** Opens a drawer by its id through ST's own handler (never .drawer-icon click: that writes NavOpened). */
export async function toggleDrawer(contentId, want) {
    const content = document.getElementById(contentId);
    const toggle = content?.closest('.drawer')?.querySelector(':scope > .drawer-toggle');
    if (!toggle) return false;
    const open = content.classList.contains('openDrawer');
    if (want === undefined || want !== open) await doNavbarIconClick.call(toggle);
    return true;
}

// ---------------------------------------------------------------- settings window (§5.5)
/** Settings page → the ST drawer it shows (nodes never move; CSS places them, §9.2 #1). */
export const SET_PANELS = {
    api: 'rm_api_block', ai: 'left-nav-panel', fmt: 'AdvancedFormatting',
    wi: 'WorldInfo', persona: 'PersonaManagement', bg: 'Backgrounds',
    user: 'user-settings-block', ext: 'rm_extensions_block',
};
export const pageOfPanel = id => Object.keys(SET_PANELS).find(k => SET_PANELS[k] === id) || null;
/** The desktop layout (and so the settings window) applies at ≥1001px; phones keep ST drawers until P5. */
export const isDesktop = () => window.matchMedia('(min-width: 1001px)').matches;

let setMod = null;
let setLoading = null;
/** The settings module once it has been loaded (it is never loaded at boot). */
export const settingsModule = () => setMod;

/**
 * Opens the settings window on `page` (null → the open ST panel / last page). The window
 * module is imported on first use only, so it costs nothing at cold start.
 */
export async function openSettings(page = null, opt = {}) {
    if (!isDesktop()) return toggleDrawer(SET_PANELS[page] || 'user-settings-block', true);
    if (!setMod) {
        setLoading ||= import('./settings.js?v=202611091428');
        try { setMod = await setLoading; } finally { setLoading = null; }
    }
    if (!document.body.classList.contains('ag2')) return false; // shell torn down meanwhile
    return setMod.open(page, opt);
}

// ---------------------------------------------------------------- inspector (§5.6, §9.2 #3)
// The inspector IS ST's #right-nav-panel (never moved). Open/close goes through ST's own
// drawer handler; while open on desktop it carries `pinnedOpen` so ST's “clicked outside”
// logic leaves it alone. ST's own lock (#rm_button_panel_pin / NavLockOn) is never written:
// the class is put back to the checkbox state when the inspector closes or the shell goes.
export const INSP_ID = 'right-nav-panel';
let inspMod = null;
let inspLoading = null;
/** The inspector module once loaded (loaded on first open, never at boot unless it was left open). */
export const inspectorModule = () => inspMod;
export async function loadInspector() {
    if (!inspMod) {
        inspLoading ||= import('./inspector.js?v=202611091428');
        try { inspMod = await inspLoading; } finally { inspLoading = null; }
    }
    if (document.body.classList.contains('ag2')) inspMod.mount();
    return inspMod;
}
export const isInspectorOpen = () => !!document.getElementById(INSP_ID)?.classList.contains('openDrawer');

/** Puts `pinnedOpen` back to what ST's own lock checkbox says. */
export function restoreInspectorPin() {
    const p = document.getElementById(INSP_ID);
    if (!p) return;
    const locked = !!document.getElementById('rm_button_panel_pin')?.checked;
    p.classList.toggle('pinnedOpen', locked);
}

/** Opens / closes / toggles (want undefined) the inspector. persist → `ag2.inspector`. */
export async function setInspector(want, { persist = true } = {}) {
    const p = document.getElementById(INSP_ID);
    if (!p) return false;
    if (isDesktop()) await loadInspector();
    if (!document.body.classList.contains('ag2')) return false; // shell torn down meanwhile
    if (want === undefined) want = !p.classList.contains('openDrawer');
    if (persist) local.set('inspector', want ? 'open' : 'closed');
    if (want && isDesktop()) p.classList.add('pinnedOpen');
    await toggleDrawer(INSP_ID, want);
    if (!want) restoreInspectorPin();
    return true;
}

export function clickSt(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    $(el).trigger('click');
    return true;
}

/**
 * Opens a recent-chat entry — DESIGN §9.2 #5:
 *   character → selectCharacterById → (verify characterId) → openCharacterChat
 *   group     → openGroupById → openGroupChat
 * While generating/saving, ST's selectCharacterById silently returns; tell the user instead.
 */
export async function openEntry(e) {
    if (busy()) { toast('info', '正在生成，稍后再切换'); return false; }
    const file = stem(e.file_name);
    if (e.group) {
        if (String(ctx().groupId) !== String(e.group)) await openGroupById(e.group);
        if (String(ctx().groupId) !== String(e.group)) { toast('info', '正在生成，稍后再切换'); return false; }
        if (file && getCurrentChatId() !== file) await openGroupChat(e.group, file);
        return true;
    }
    const id = charIndex(e.avatar);
    if (id < 0) { toast('warning', '找不到这个角色'); return false; }
    if (String(ctx().characterId) !== String(id) || ctx().groupId) await selectCharacterById(id);
    if (String(ctx().characterId) !== String(id)) { toast('info', '正在生成，稍后再切换'); return false; }
    if (file && getCurrentChatId() !== file) await openCharacterChat(file);
    return true;
}

export async function openCharacter(id) {
    if (busy()) { toast('info', '正在生成，稍后再切换'); return; }
    await selectCharacterById(id);
}

export async function openGroup(id) {
    if (busy()) { toast('info', '正在生成，稍后再切换'); return; }
    await openGroupById(id);
}

export async function renameEntry(e, newName) {
    const characterId = e.group ? undefined : charIndex(e.avatar);
    await renameGroupOrCharacterChat({ characterId, groupId: e.group, oldFileName: stem(e.file_name), newFileName: newName });
}

export async function deleteEntry(e) {
    if (e.group) await deleteGroupChatByName(e.group, stem(e.file_name));
    else await deleteCharacterChatByName(charIndex(e.avatar), stem(e.file_name));
}
