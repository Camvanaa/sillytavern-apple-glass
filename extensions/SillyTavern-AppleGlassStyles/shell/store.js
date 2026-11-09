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

// ---------------------------------------------------------------- appearance (§5.5)
// Shell-owned reading settings. Applied at enable as body attributes + inline variables
// (cheap: no module load); the appearance page itself lives in settings.js (lazy).
export const ACCENTS = [
    { id: 'blue', name: '蓝色', color: '#0a84ff' },
    { id: 'purple', name: '紫色', color: '#bf5af2' },
    { id: 'pink', name: '粉色', color: '#ff375f' },
    { id: 'orange', name: '橙色', color: '#ff9f0a' },
    { id: 'green', name: '绿色', color: '#30d158' },
    { id: 'teal', name: '青色', color: '#40c8e0' },
    { id: 'graphite', name: '石墨', color: '#8e8e93' },
];
export const READ_SIZE = { min: 14, max: 20, step: 1, def: 16 };
export const READ_WIDTH = { min: 560, max: 960, step: 20, def: 720 };
export const META = ['always', 'hover', 'hide'];

const clampNum = (v, r) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, Math.round(n))) : r.def;
};

export function appearance() {
    const s = ctx().extensionSettings?.appleGlass2 || {};
    return {
        accent: ACCENTS.some(a => a.id === s.accent) ? s.accent : 'blue',
        readSize: clampNum(s.readSize, READ_SIZE),
        readWidth: clampNum(s.readWidth, READ_WIDTH),
        meta: META.includes(s.meta) ? s.meta : 'hover',
    };
}

export function applyAppearance() {
    const a = appearance();
    const b = document.body;
    b.dataset.ag2Accent = a.accent;
    b.dataset.ag2Meta = a.meta;
    b.style.setProperty('--ag2-read-size', a.readSize + 'px');
    b.style.setProperty('--ag2-read-width', a.readWidth + 'px');
    return a;
}

export function clearAppearance() {
    const b = document.body;
    delete b.dataset.ag2Accent;
    delete b.dataset.ag2Meta;
    delete b.dataset.ag2Set;
    b.style.removeProperty('--ag2-read-size');
    b.style.removeProperty('--ag2-read-width');
}

export function setAppearance(key, value) {
    account()[key] = value;
    saveAccount();
    return applyAppearance();
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
