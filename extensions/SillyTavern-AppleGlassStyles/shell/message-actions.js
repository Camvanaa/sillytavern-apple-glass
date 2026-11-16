// Phone message actions use the shared labelled menu. Original buttons stay in place:
// extensions and ST keep receiving their own delegated click events.
import { openMenu, closeMenu } from './menu.js?v=20261116TT06';

let cleanup = null;
const icons = [
    ['mes_translate', 'languages'], ['sd_message_gen', 'image'], ['mes_narrate', 'volume-2'],
    ['mes_prompt', 'file-text'], ['mes_hide', 'eye-off'], ['mes_unhide', 'eye-off'],
    ['mes_media_gallery', 'image'], ['mes_media_list', 'list-ordered'], ['mes_embed', 'paperclip'],
    ['mes_swipe_picker', 'history'], ['mes_create_bookmark', 'bookmark'],
];

export function mount() {
    unmount();
    const chat = document.getElementById('chat');
    if (!chat) return;
    const attrs = new Map();
    const click = e => {
        if (!document.body.classList.contains('ag2-phone') || document.body.classList.contains('expandMessageActions')) return;
        const anchor = e.target.closest?.('.extraMesButtonsHint');
        if (!anchor || !chat.contains(anchor)) return;
        const group = anchor.parentElement.querySelector('.extraMesButtons');
        if (!group) return;
        const message = anchor.closest('.mes');
        const items = [...group.children].filter(button => {
            // The legacy action-strip CSS uses inline-flex for all glyphs; respect
            // ST's contextual visibility even when that old rule wins the cascade.
            const excluded = message.getAttribute('is_system') === 'true';
            if (button.classList.contains('mes_hide') && excluded) return false;
            if (button.classList.contains('mes_unhide') && !excluded) return false;
            if (button.classList.contains('mes_media_gallery') && message.dataset.mediaDisplay !== 'gallery') return false;
            if (button.classList.contains('mes_media_list') && message.dataset.mediaDisplay !== 'list') return false;
            const style = getComputedStyle(button);
            return style.display !== 'none' && style.visibility !== 'hidden' && !button.hidden;
        }).map(button => ({
            label: button.classList.contains('mes_swipe_picker') ? '查看备选回复' : button.getAttribute('title') || button.getAttribute('aria-label') || button.textContent.trim() || '消息操作',
            icon: icons.find(([cls]) => button.classList.contains(cls))?.[1] || 'ellipsis',
            disabled: button.matches(':disabled, .disabled, [aria-disabled="true"]'),
            onSelect: () => { if (button.isConnected && !button.matches(':disabled, .disabled, [aria-disabled="true"]')) button.click(); },
        }));
        if (!items.length) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (document.getElementById('ag2-message-actions')) { closeMenu(); return; }
        if (!attrs.has(anchor)) attrs.set(anchor, ['aria-haspopup', 'aria-expanded'].map(name => anchor.getAttribute(name)));
        anchor.setAttribute('aria-haspopup', 'menu');
        openMenu(anchor, items, { id: 'ag2-message-actions', className: 'ag2-message-actions', align: 'end', focusFirst: e.detail === 0 });
    };
    const close = () => { if (document.getElementById('ag2-message-actions')) closeMenu(); };
    chat.addEventListener('click', click, true);
    chat.addEventListener('scroll', close, { passive: true });
    cleanup = () => {
        close();
        chat.removeEventListener('click', click, true);
        chat.removeEventListener('scroll', close);
        for (const [anchor, values] of attrs) ['aria-haspopup', 'aria-expanded'].forEach((name, i) => {
            if (values[i] === null) anchor.removeAttribute(name); else anchor.setAttribute(name, values[i]);
        });
    };
}

export function unmount() { cleanup?.(); cleanup = null; }
