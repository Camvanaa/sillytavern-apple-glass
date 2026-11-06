// Apple Glass Chat Styles
// Adds extra entries to User Settings → Chat Style and toggles a body class.
// All visuals are in the "Apple Glass Dark" UI theme CSS (section 16), so the
// styles only take effect while that theme is active.

const STYLES = [
    { value: 3, cls: 'ap-chat-echo', label: '回声 Echo' },
    { value: 4, cls: 'ap-chat-whisper', label: '低语 Whisper' },
    { value: 5, cls: 'ap-chat-ripple', label: '涟漪 Ripple' },
    { value: 6, cls: 'ap-chat-hush', label: '轻声 Hush' },
];
const ALL_CLASSES = STYLES.map(s => s.cls);
const NATIVE_CLASSES = ['bubblechat', 'documentstyle'];

function powerUser() {
    return SillyTavern.getContext().powerUserSettings;
}

function ensureOptions() {
    const select = document.getElementById('chat_display');
    if (!select) return null;
    for (const s of STYLES) {
        if (!select.querySelector(`option[value="${s.value}"]`)) {
            const opt = document.createElement('option');
            opt.value = String(s.value);
            opt.textContent = s.label;
            select.appendChild(opt);
        }
    }
    return select;
}

function applyStyle() {
    const value = Number(powerUser()?.chat_display ?? 0);
    const style = STYLES.find(s => s.value === value);
    document.body.classList.remove(...ALL_CLASSES);
    if (style) {
        // SillyTavern's applyChatDisplay() ignores unknown values and may leave
        // bubble/document classes behind — clear them for our styles.
        document.body.classList.remove(...NATIVE_CLASSES);
        document.body.classList.add(style.cls);
    }
    const select = document.getElementById('chat_display');
    if (select && select.value !== String(value)) select.value = String(value);
    updateAvatars();
}

// Full-size portrait for the avatar-backdrop styles (thumbnail → original file)
function originalUrl(src) {
    try {
        const u = new URL(src, location.origin);
        if (u.pathname.endsWith('/thumbnail')) {
            const type = u.searchParams.get('type');
            const file = u.searchParams.get('file');
            if (file && type === 'avatar') return `/characters/${encodeURIComponent(file)}`;
            if (file && type === 'persona') return `/User Avatars/${encodeURIComponent(file)}`;
        }
        return u.pathname + u.search;
    } catch {
        return src;
    }
}

function updateAvatars() {
    if (!ALL_CLASSES.some(c => document.body.classList.contains(c))) return;
    document.querySelectorAll('#chat .mes').forEach(mes => {
        const img = mes.querySelector('.avatar img');
        const src = img?.getAttribute('src');
        if (!src) return;
        const url = `url("${originalUrl(src).replace(/"/g, '%22')}")`;
        if (mes.style.getPropertyValue('--ap-mes-avatar') !== url) {
            mes.style.setProperty('--ap-mes-avatar', url);
        }
    });
}

let timer;
function scheduleAvatars() {
    clearTimeout(timer);
    timer = setTimeout(updateAvatars, 80);
}

jQuery(() => {
    ensureOptions();
    applyStyle();

    // Runs after SillyTavern's own handler (registered earlier), which already
    // stored the Number value into power_user.chat_display and saved settings.
    $(document).on('change', '#chat_display', () => setTimeout(applyStyle, 0));

    // Theme switches call applyChatDisplay(); re-sync our class afterwards.
    $(document).on('change', '#themes', () => setTimeout(() => { ensureOptions(); applyStyle(); }, 50));

    const chat = document.getElementById('chat');
    if (chat) new MutationObserver(scheduleAvatars).observe(chat, { childList: true, subtree: true });

    const { eventSource, eventTypes } = SillyTavern.getContext();
    eventSource?.on?.(eventTypes.SETTINGS_LOADED, () => { ensureOptions(); applyStyle(); });
    eventSource?.on?.(eventTypes.CHAT_CHANGED, scheduleAvatars);
});
