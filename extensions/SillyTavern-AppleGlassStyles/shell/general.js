// 通用 labels read as iOS row titles: drop the trailing colon. Restored on teardown.
let cleanup = null;
export function mount() {
    unmount();
    const root = document.getElementById('user-settings-block');
    if (!root) return;
    const changed = [];
    const labels = root.querySelectorAll('[name="AvatarAndChatDisplay"] > .flex-container > span:first-child, [name="CharacterHandlingToggles"] > .flex-container > label small, [name="ChatMessageHandlingToggles"] > div > label > small');
    for (const node of labels) {
        if (node.childElementCount) continue;
        const original = node.textContent;
        const text = original.replace(/\s*[:：]\s*$/, '');
        if (text === original) continue;
        node.textContent = text;
        changed.push([node, original, text]);
    }
    cleanup = () => { for (const [node, original, text] of changed) if (node.textContent === text) node.textContent = original; };
}
export function unmount() { cleanup?.(); cleanup = null; }
