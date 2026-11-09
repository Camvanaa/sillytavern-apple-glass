// Apple Glass Chat Styles
// 1. Adds extra entries to User Settings → Chat Style and toggles a body class.
//    All visuals are in the "Apple Glass Dark" UI theme CSS (section 16), so the
//    styles only take effect while that theme is active.
// 2. Fits option-card iframes (Ny-Gemini 4-option card) to their content.
// 3. Adds a "jump to latest" pill when the chat is scrolled up (styled in §17g).
// 4. Tags the start-up splash popup so splash.css keeps it transparent while it closes.
// 5. Under the "Apple Glass 2" theme (and no ?classic) loads the AG2 shell (shell/index.js).
// Features 1–4 work under both "Apple Glass Dark" and "Apple Glass 2".

const STYLES = [
    { value: 3, cls: 'ap-chat-echo', label: '回声 Echo' },
    { value: 4, cls: 'ap-chat-whisper', label: '低语 Whisper' },
    { value: 5, cls: 'ap-chat-ripple', label: '涟漪 Ripple' },
    { value: 6, cls: 'ap-chat-hush', label: '轻声 Hush' },
];
const ALL_CLASSES = STYLES.map(s => s.cls);
const NATIVE_CLASSES = ['bubblechat', 'documentstyle'];
const THEME_NAMES = ['Apple Glass Dark', 'Apple Glass 2'];
const AG2_THEME = 'Apple Glass 2';
// Keep in sync with BUILD in shell/index.js (tools/ag2/bump-build.sh updates both).
const SHELL_BUILD = '202611092120';
const STYLE_KEY = 'apGlass.chatStyle';

function themeActive() {
    // AG Dark defines --ap-blue on :root; AG2 is recognised by name (its tokens live on body.ag2).
    // Under ?classic the AG2 CSS is inert (no body.ag2), so AG2 counts only when the shell runs.
    const name = currentThemeName();
    return name === THEME_NAMES[0] || (name === AG2_THEME && shellWanted())
        || getComputedStyle(document.documentElement).getPropertyValue('--ap-blue').trim() !== '';
}

function currentThemeName() {
    return powerUser()?.theme ?? document.getElementById('themes')?.value ?? '';
}

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

// ---------------------------------------------------------------------------
// Option-card iframes: the card template uses `body{min-height:100vh}`, which
// TavernHelper maps to the full window height, so every card sat in a ~900px
// frame with ~440px of empty space. Only frames whose document has the card's
// signature (.glass-card + .options-list) are touched; other iframes (e.g. the
// character home page) keep their own layout.
// ---------------------------------------------------------------------------
const FIT_STYLE_ID = 'ap-fit-card';
const FIT_CSS = 'html,body{min-height:0!important;height:auto!important}body{display:block!important;padding:2px 0!important}';

function fitCardFrame(frame) {
    let doc;
    try {
        doc = frame.contentDocument;
    } catch {
        return;
    }
    if (!doc || !doc.body || doc.getElementById(FIT_STYLE_ID)) return;
    if (!doc.querySelector('.glass-card .options-list')) return;
    const style = doc.createElement('style');
    style.id = FIT_STYLE_ID;
    style.textContent = FIT_CSS;
    (doc.head || doc.documentElement).appendChild(style);
    // TavernHelper's ResizeObserver re-measures body.scrollHeight; nudge it too.
    requestAnimationFrame(() => {
        const h = doc.body.scrollHeight;
        if (h > 0) frame.style.height = `${h}px`;
    });
}

function fitCardFrames() {
    document.querySelectorAll('#chat .TH-render iframe').forEach(frame => {
        fitCardFrame(frame);
        if (!frame.dataset.apFit) {
            frame.dataset.apFit = '1';
            frame.addEventListener('load', () => fitCardFrame(frame));
        }
    });
}

// ---------------------------------------------------------------------------
// Jump-to-latest pill
// ---------------------------------------------------------------------------
let jumpBtn = null;

function ensureJumpButton() {
    if (!themeActive()) {
        jumpBtn?.remove();
        jumpBtn = null;
        return null;
    }
    if (jumpBtn && document.body.contains(jumpBtn)) return jumpBtn;
    const host = document.getElementById('form_sheld');
    if (!host) return null;
    jumpBtn = document.createElement('button');
    jumpBtn.id = 'ap-jump-latest';
    jumpBtn.type = 'button';
    jumpBtn.title = '回到最新消息';
    jumpBtn.innerHTML = '<i class="fa-solid fa-arrow-down"></i><span>最新消息</span>';
    jumpBtn.addEventListener('click', () => {
        const chat = document.getElementById('chat');
        if (!chat) return;
        // body.reduced-motion covers both SillyTavern's switch and the OS setting.
        chat.scrollTo({ top: chat.scrollHeight, behavior: document.body.classList.contains('reduced-motion') ? 'auto' : 'smooth' });
    });
    host.prepend(jumpBtn);
    return jumpBtn;
}

let jumpRaf = 0;
function updateJumpButton() {
    jumpRaf = 0;
    const chat = document.getElementById('chat');
    const btn = ensureJumpButton();
    if (!chat || !btn) return;
    const distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    btn.classList.toggle('is-visible', distance > Math.max(600, chat.clientHeight * 0.9));
}

function scheduleJumpButton() {
    if (!jumpRaf) jumpRaf = requestAnimationFrame(updateJumpButton);
}

// ---------------------------------------------------------------------------
// New-message fade (§17l): only a single message appended at the end of a chat
// that is already on screen. Whole-chat renders, "show more" prepends and last_mes
// moving to an older message (delete) never match. Runs as a microtask, i.e. before
// the first paint of the new node, so it cannot flash.
// ---------------------------------------------------------------------------
const NEW_MES_CLASS = 'ap-mes-new';
let chatSettledAt = 0;

function markNewMessage(records) {
    if (performance.now() < chatSettledAt) return;
    const added = records.flatMap(r => [...r.addedNodes]).filter(n => n.nodeType === 1 && n.classList.contains('mes'));
    if (added.length !== 1) return;
    const mes = added[0];
    if (mes !== mes.parentElement?.lastElementChild || !mes.previousElementSibling) return;
    mes.classList.add(NEW_MES_CLASS);
    setTimeout(() => mes.classList.remove(NEW_MES_CLASS), 800);
}

// ---------------------------------------------------------------------------
// Start-up splash (splash.css → data/_css/user.css). SillyTavern removes
// #loader.splash-screen first and only then closes its popup, so for the length
// of the closing animation splash.css's :has(#loader.splash-screen) no longer
// matches and the theme's glass popup flashed as an empty card. Tag that one
// dialog so it stays transparent until it is gone; run-time loaders are new
// dialogs and never get the class.
// ---------------------------------------------------------------------------
function markSplashPopup() {
    document.querySelector('#loader.splash-screen')?.closest('dialog')?.classList.add('ap-splash');
}

markSplashPopup();

// ---------------------------------------------------------------------------
// Apple Glass 2 shell: theme "Apple Glass 2" and no `classic` in the URL
// (?classic / #classic is the emergency switch, DESIGN §9.4). Loaded lazily so
// other themes never download the shell modules.
let shellMod = null;
let shellLoadFailed = false;
// Remember APP_READY for a shell enabled later (theme switched mid-session). The preloader
// is not a reliable signal: with a URL query string ST may leave it in the DOM.
let appReady = false;
try {
    const { eventSource, eventTypes } = SillyTavern.getContext();
    eventSource?.on?.(eventTypes.APP_READY, () => { appReady = true; });
} catch { /* context not ready: the shell falls back to the preloader check */ }
function shellWanted() {
    return currentThemeName() === AG2_THEME && !/classic/i.test(location.search + location.hash);
}
async function syncShell() {
    try {
        if (shellWanted()) {
            shellMod ??= await import(`./shell/index.js?v=${SHELL_BUILD}`);
            if (shellWanted()) shellMod.enable({ appReady });
        } else {
            shellMod?.disable();
        }
    } catch (e) {
        console.error('[AG2] shell could not start', e);
        try { shellMod?.disable?.(); } catch { /* */ }
        if (!shellLoadFailed) {
            shellLoadFailed = true;
            window.toastr?.error?.('Apple Glass 2 外壳加载失败，已使用原生布局。', 'Apple Glass 2');
        }
    }
}
// Extensions run inside ST's getSettings, after power_user (theme) is loaded, while the
// splash still covers the page — so the frame is built before the old layout can show.
syncShell();

// ---------------------------------------------------------------------------

let timer;
function scheduleChatWork() {
    clearTimeout(timer);
    timer = setTimeout(() => {
        updateAvatars();
        fitCardFrames();
        scheduleJumpButton();
    }, 80);
}

jQuery(() => {
    ensureOptions();
    applyStyle();
    ensureJumpButton();

    // Runs after SillyTavern's own handler (registered earlier), which already
    // stored the Number value into power_user.chat_display and saved settings.
    $(document).on('change', '#chat_display', () => setTimeout(applyStyle, 0));

    // Remember the style picked while Apple Glass Dark is active: the theme file
    // carries chat_display=0, so switching away and back would reset it.
    $(document).on('change', '#chat_display', () => setTimeout(() => {
        if (THEME_NAMES.includes(currentThemeName())) {
            localStorage.setItem(STYLE_KEY, String(powerUser()?.chat_display ?? 0));
        }
    }, 0));

    // Theme switches call applyChatDisplay(); re-sync our class afterwards.
    $(document).on('change', '#themes', () => setTimeout(() => {
        ensureOptions();
        const saved = localStorage.getItem(STYLE_KEY);
        if (THEME_NAMES.includes(currentThemeName()) && saved !== null && Number(saved) !== Number(powerUser()?.chat_display)) {
            // Goes through SillyTavern's own handler, which stores + saves the value.
            $('#chat_display').val(saved).trigger('change');
        }
        applyStyle();
        ensureJumpButton();
        scheduleJumpButton();
        syncShell();
    }, 50));

    const chat = document.getElementById('chat');
    if (chat) {
        new MutationObserver(scheduleChatWork).observe(chat, { childList: true, subtree: true });
        new MutationObserver(markNewMessage).observe(chat, { childList: true });
        chat.addEventListener('scroll', scheduleJumpButton, { passive: true });
    }
    // Iframes report `load` without mutating the chat DOM — catch them too.
    document.addEventListener('load', e => {
        if (e.target instanceof HTMLIFrameElement && e.target.closest('#chat')) fitCardFrame(e.target);
    }, true);

    const { eventSource, eventTypes } = SillyTavern.getContext();
    eventSource?.on?.(eventTypes.SETTINGS_LOADED, () => { ensureOptions(); applyStyle(); syncShell(); });
    eventSource?.on?.(eventTypes.CHAT_CHANGED, () => {
        chatSettledAt = performance.now() + 1500;
        scheduleChatWork();
    });
    scheduleChatWork();
});
