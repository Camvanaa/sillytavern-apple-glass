// Apple Glass 2 shell — state storage (DESIGN §9.1 “状态存储”).
//   localStorage `ag2.*`            per device: sidebar collapsed, sidebar segment, inspector, phone page
//   extension_settings.appleGlass2  per account: pins, accent, reading size/width, meta display
// Never touches ST's NavLockOn / NavOpened / LNavLockOn keys.

const LS_PREFIX = 'ag2.';

export const local = {
    get(key, fallback = null) {
        try {
            const v = localStorage.getItem(LS_PREFIX + key);
            return v === null ? fallback : JSON.parse(v);
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* quota / private mode */ }
    },
};

export function ctx() {
    return SillyTavern.getContext();
}

/** extension_settings.appleGlass2, created on first use. */
export function account() {
    const es = ctx().extensionSettings;
    if (!es.appleGlass2 || typeof es.appleGlass2 !== 'object') es.appleGlass2 = {};
    const s = es.appleGlass2;
    if (!s.pins || typeof s.pins !== 'object' || Array.isArray(s.pins)) s.pins = {};
    return s;
}

export function saveAccount() {
    ctx().saveSettingsDebounced();
}

// ---------------------------------------------------------------- pins
// Key rule is the same as ST's PinnedChatsManager.getKey (welcome-screen.js), so
// pins imported from ST keep their identity: `group_<id>` | `char_<avatar>` + `_<file_name>`.
export function pinKey(chat) {
    return `${chat.group ? 'group_' + chat.group : ''}${chat.avatar ? 'char_' + chat.avatar : ''}_${chat.file_name}`;
}

export function isPinned(chat) {
    return !!account().pins[pinKey(chat)];
}

export function setPinned(chat, pinned) {
    const pins = account().pins;
    const key = pinKey(chat);
    if (pinned) pins[key] = { file_name: chat.file_name, ...(chat.group ? { group: chat.group } : { avatar: chat.avatar }), at: Date.now() };
    else delete pins[key];
    saveAccount();
}

export function renamePin(chat, newFileName) {
    if (!isPinned(chat)) return;
    setPinned(chat, false);
    setPinned({ ...chat, file_name: newFileName }, true);
}

/** [{ avatar|group, file_name }] for POST /api/chats/recent `pinned`. */
export function pinList() {
    return Object.values(account().pins).map(p => ({ file_name: p.file_name, ...(p.group ? { group: p.group } : { avatar: p.avatar }) }));
}

/**
 * First enable: import ST's own welcome-screen pins (accountStorage `pinnedChats`) once.
 * ST keeps them cached in PinnedChatsManager, so we only read, never write them back.
 */
export async function importStPinsOnce() {
    const s = account();
    if (s.pinsImported) return 0;
    let n = 0;
    try {
        const mod = await import('../../../../util/AccountStorage.js');
        const raw = mod.accountStorage?.getItem?.('pinnedChats');
        const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (state && typeof state === 'object') {
            for (const [key, p] of Object.entries(state)) {
                if (!p || !p.file_name || s.pins[key]) continue;
                s.pins[key] = { file_name: p.file_name, ...(p.group ? { group: p.group } : { avatar: p.avatar }), at: Number(p.pinnedAt || p.at || Date.now()) };
                n++;
            }
        }
    } catch (e) {
        console.warn('[AG2] pin import skipped', e);
    }
    s.pinsImported = true;
    saveAccount();
    return n;
}
