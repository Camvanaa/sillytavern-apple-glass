// Update/install UI must also work before the AG2 theme is imported. Keep this
// small shared surface independent of #ag2-settings and body.ag2.
export function ensureUpdateStyles() {
    if (document.getElementById('ag2-update-style')) return;
    const style = document.createElement('style');
    style.id = 'ag2-update-style';
    style.textContent = `
html body .ag2-update-panel:not(#_):not(#__):not(#___) {
    color: var(--ag2-l1, var(--SmartThemeBodyColor, #eee));
    font: 400 14px/1.5 var(--ag2-font, system-ui, sans-serif);
    width: 100%; min-width: 0; text-align: left;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-gtitle {
    margin: 18px 14px 8px; color: var(--ag2-l2, #aaa); font-size: 13px;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-group {
    border-radius: 18px; background: var(--ag2-grouped-surface, rgba(128,128,128,.12));
    box-shadow: none; overflow: hidden;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-row {
    display: flex; position: relative; align-items: center; gap: 12px;
    box-sizing: border-box; min-height: 48px; padding: 8px 14px; margin: 0;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-row + .ag2-set-row {
    border-top: .5px solid var(--ag2-sep, rgba(128,128,128,.2));
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-row::before { content: none; }
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-update-actions {
    display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 12px;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-btn {
    appearance: none; border: 0 !important; background: none !important; box-shadow: none !important;
    color: var(--ag2-accent, #0a84ff) !important; min-width: 0; min-height: 44px;
    padding: 6px 0 !important; margin: 0; border-radius: 8px;
    font: 500 15px/1.4 var(--ag2-font, system-ui, sans-serif); cursor: pointer;
    text-align: left; white-space: normal; text-shadow: none;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-btn:disabled { opacity: .45; cursor: wait; }
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-lab { flex: 1; font-size: 16px; margin: 0; }
html body .ag2-update-panel:not(#_):not(#__):not(#___) a { color: var(--ag2-accent, #0a84ff); }
html body .ag2-update-panel:not(#_):not(#__):not(#___) .ag2-set-note {
    margin: 10px 14px; font-size: 13px; color: var(--ag2-l2, #aaa); overflow-wrap: anywhere;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) button.ag2-switch {
    appearance: none; position: relative; display: block !important; flex: 0 0 42px;
    width: 42px !important; min-width: 42px; max-width: 42px;
    height: 26px !important; min-height: 26px; padding: 0 !important; margin: 0 !important;
    border: 0 !important; border-radius: 13px !important; box-shadow: none !important;
    background: var(--ag2-f2, #525257) !important; cursor: pointer;
    font-size: 0; opacity: 1; filter: none;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) button.ag2-switch::before { content: none !important; }
html body .ag2-update-panel:not(#_):not(#__):not(#___) button.ag2-switch::after {
    content: '' !important; position: absolute; top: 2px; left: 2px;
    width: 22px !important; height: 22px !important; border-radius: 50%;
    background: #fff !important; transform: none !important; box-shadow: 0 1px 3px #0003;
}
html body .ag2-update-panel:not(#_):not(#__):not(#___) button.ag2-switch[aria-checked=true] { background: var(--ag2-green, #30d158) !important; }
html body .ag2-update-panel:not(#_):not(#__):not(#___) button.ag2-switch[aria-checked=true]::after { transform: translateX(16px) !important; }
html body .ag2-update-panel:not(#_):not(#__):not(#___) button:focus-visible { outline: 2px solid var(--ag2-accent, #0a84ff); outline-offset: 2px; }
`;
    document.head.append(style);
}
