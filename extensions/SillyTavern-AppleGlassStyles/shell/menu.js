// Apple Glass 2 shell — generic popover menu (DESIGN §5.8).
// openMenu(anchor, items, opt) → close()
//   anchor: Element (menu below/aligned to it) or { x, y } (context menu at a point)
//   items:  { label, icon, onSelect(btn), danger, disabled, hint, submenu, keepOpen }
//           | { separator: true } | { header: 'text' }
//           submenu → trailing chevron; keepOpen → the menu stays open after the click
//   opt:    { align: 'start'|'end', id, className, onClose, focusFirst, host,
//             ignore: () => [Element] — pointer-downs inside these count as “inside” }
//           host: container for the menu (default #ag2-shell, z 40). Menus anchored in the
//           inspector (ST's right panel, inside the z-3005 #top-settings-holder) use
//           #ag2-layer (z 3006) so they are not drawn under the panel.
// Closes on outside pointer-down (capture phase, so it still works although shell
// nodes stop mousedown propagation), Esc (capture, stopped so ST's own Esc logic
// doesn't also run — §8 order), resize and blur. Arrow keys move focus.

import { icon } from './icons.js?v=202611130023';

let current = null;

/** Position a fixed popover around an anchor, preferring the requested side and
 * falling back to the opposite side before clamping both axes to the viewport. */
export function positionPopover(el, anchor, { side = 'bottom', gap = 6 } = {}) {
    if (!el || !(anchor instanceof Element)) return null;
    const r = anchor.getBoundingClientRect();
    let mw = el.offsetWidth, mh = el.offsetHeight;
    let x = r.left, y = r.bottom + gap;
    if (side === 'right' && document.body.classList.contains('ag2-phone')) {
        // A 390px viewport cannot fit two 236px menus side by side. The caller anchors
        // to the whole parent menu; constrain the child to a free region above/below it.
        const above = r.top - gap - 8;
        const below = innerHeight - r.bottom - gap - 8;
        const available = Math.max(120, Math.max(above, below));
        el.style.setProperty('max-height', Math.round(available) + 'px', 'important');
        mw = el.offsetWidth;
        mh = el.offsetHeight;
        x = r.left;
        y = above >= below ? r.top - mh - gap : r.bottom + gap;
    } else if (side === 'top') {
        const above = r.top - gap - 8;
        const below = innerHeight - r.bottom - gap - 8;
        const useAbove = above >= below;
        el.style.setProperty('max-height', Math.round(Math.max(120, Math.max(above, below))) + 'px', 'important');
        mh = el.offsetHeight;
        y = useAbove ? r.top - mh - gap : r.bottom + gap;
    } else if (side === 'right') {
        x = r.right + gap;
        y = r.top;
        if (x + mw > innerWidth - 8) x = r.left - mw - gap;
        if (y + mh > innerHeight - 8) y = innerHeight - mh - 8;
    } else if (side === 'left') {
        x = r.left - mw - gap;
        y = r.top;
        if (x < 8) x = r.right + gap;
        if (y + mh > innerHeight - 8) y = innerHeight - mh - 8;
    } else {
        x = side === 'bottom-end' ? r.right - mw : r.left;
        if (y + mh > innerHeight - 8) y = r.top - mh - gap;
    }
    x = Math.min(Math.max(8, x), Math.max(8, innerWidth - mw - 8));
    y = Math.min(Math.max(8, y), Math.max(8, innerHeight - mh - 8));
    el.style.setProperty('left', Math.round(x) + 'px', 'important');
    el.style.setProperty('top', Math.round(y) + 'px', 'important');
    return { x, y, width: mw, height: mh };
}

export function closeMenu() {
    if (!current) return false;
    const c = current;
    current = null;
    c.el.remove();
    document.removeEventListener('pointerdown', c.onDown, true);
    document.removeEventListener('keydown', c.onKey, true);
    window.removeEventListener('resize', c.onClose);
    window.removeEventListener('blur', c.onClose);
    c.anchor?.setAttribute?.('aria-expanded', 'false');
    try { c.opt.onClose?.(); } catch { /* ignore */ }
    if (c.restoreFocus && document.activeElement?.closest?.('.ag2-menu') == null) c.restoreFocus.focus?.({ preventScroll: true });
    return true;
}

export function isMenuOpen() {
    return !!current;
}

export function openMenu(anchor, items, opt = {}) {
    closeMenu();
    const host = opt.host || document.getElementById('ag2-shell') || document.body;
    const el = document.createElement('div');
    el.className = 'ag2-menu' + (opt.className ? ' ' + opt.className : '');
    if (opt.id) el.id = opt.id;
    el.setAttribute('role', 'menu');
    for (const it of items) {
        if (!it) continue;
        if (it.separator) { el.append(Object.assign(document.createElement('div'), { className: 'ag2-menu-sep', role: 'separator' })); continue; }
        if (it.header) { el.append(Object.assign(document.createElement('div'), { className: 'ag2-menu-head', textContent: it.header })); continue; }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ag2-menu-item' + (it.danger ? ' ag2-danger' : '');
        b.setAttribute('role', 'menuitem');
        b.disabled = !!it.disabled;
        b.innerHTML = (it.icon ? icon(it.icon, 16) : '<span class="ag2-i-pad"></span>') + '<span class="ag2-menu-label"></span>'
            + (it.hint ? '<span class="ag2-menu-hint"></span>' : '') + (it.submenu ? icon('chevron-right', 14, 'ag2-menu-sub') : '');
        if (it.submenu) b.setAttribute('aria-haspopup', 'menu');
        b.querySelector('.ag2-menu-label').textContent = it.label;
        if (it.hint) b.querySelector('.ag2-menu-hint').textContent = it.hint;
        if (it.id) b.dataset.item = it.id;
        b.addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            if (!it.keepOpen) closeMenu();
            try { await it.onSelect?.(b); } catch (err) { console.error('[AG2] menu action failed', err); }
        });
        el.append(b);
    }
    // Shell rule: pointer-downs inside shell UI must not reach ST's “click outside” handlers.
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    host.append(el);

    // Position (fixed): below the anchor or at the pointer, kept 8px inside the viewport.
    const mw = el.offsetWidth, mh = el.offsetHeight;
    let x, y;
    if (anchor instanceof Element) {
        const r = anchor.getBoundingClientRect();
        x = opt.align === 'end' ? r.right - mw : r.left;
        y = r.bottom + 6;
        if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
        anchor.setAttribute('aria-expanded', 'true');
    } else {
        x = anchor.x; y = anchor.y;
        if (y + mh > innerHeight - 8) y = Math.max(8, y - mh);
    }
    x = Math.min(Math.max(8, x), innerWidth - mw - 8);
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';

    const c = {
        el, opt,
        anchor: anchor instanceof Element ? anchor : null,
        restoreFocus: anchor instanceof Element ? anchor : document.activeElement,
        onDown: e => {
            if (el.contains(e.target) || (c.anchor && c.anchor.contains(e.target))) return;
            const extra = opt.ignore ? opt.ignore().filter(Boolean) : [];
            if (extra.some(x => x.contains(e.target))) return;
            closeMenu();
        },
        onClose: () => closeMenu(),
        onKey: e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeMenu(); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault(); e.stopPropagation();
                const list = [...el.querySelectorAll('.ag2-menu-item:not(:disabled)')];
                if (!list.length) return;
                const i = list.indexOf(document.activeElement);
                const n = e.key === 'ArrowDown' ? (i + 1) % list.length : (i <= 0 ? list.length - 1 : i - 1);
                list[n].focus();
            }
        },
    };
    current = c;
    document.addEventListener('pointerdown', c.onDown, true);
    document.addEventListener('keydown', c.onKey, true);
    window.addEventListener('resize', c.onClose);
    window.addEventListener('blur', c.onClose);
    if (opt.focusFirst) el.querySelector('.ag2-menu-item:not(:disabled)')?.focus();
    return closeMenu;
}
