// 通用 labels read as iOS row titles: drop the trailing colon. Restored on teardown.
let cleanup = null;
export function mount() {
    unmount();
    const root = document.getElementById('user-settings-block');
    if (!root) return;
    const changed = [];
    // These fixed row wrappers used to be found with :has(> #id). With `> *`
    // below that selector, mutations in the drawer invalidated every div.
    const rows = [];
    for (const [id, name] of [['chat_width_slider', 'data-ag2-width-row'], ['movingUIModeCheckBlock', 'data-ag2-moving-row']]) {
        const row = root.querySelector('#' + id)?.parentElement;
        if (row?.tagName === 'DIV' && !row.hasAttribute(name)) {
            row.setAttribute(name, '');
            rows.push([row, name]);
        }
    }
    const labels = root.querySelectorAll('[name="AvatarAndChatDisplay"] > .flex-container > span:first-child, [name="CharacterHandlingToggles"] > .flex-container > label small, [name="ChatMessageHandlingToggles"] > div > label > small');
    for (const node of labels) {
        if (node.childElementCount) continue;
        const original = node.textContent;
        const text = original.replace(/\s*[:：]\s*$/, '');
        if (text === original) continue;
        node.textContent = text;
        changed.push([node, original, text]);
    }
    cleanup = () => {
        for (const [node, original, text] of changed) if (node.textContent === text) node.textContent = original;
        for (const [row, name] of rows) row.removeAttribute(name);
    };
}
export function unmount() { cleanup?.(); cleanup = null; }
