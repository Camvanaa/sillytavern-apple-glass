// Distinguish the current-chat section from the Author's Note window title.
let restore = null;
export function mount() {
    unmount();
    const title = document.querySelector('#floatingPrompt #ANBlockToggle > b');
    if (!title || title.childElementCount) return;
    const original = title.textContent;
    const label = /[\u3400-\u9fff]/.test(original) ? '本次对话' : 'This chat';
    title.textContent = label;
    restore = () => { if (title.textContent === label) title.textContent = original; };
}
export function unmount() { restore?.(); restore = null; }
