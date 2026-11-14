// Prompt editor presentation. Keep ST's select, values and save handlers authoritative.
let cleanup = null;

export function mount() {
    unmount();
    const popup = document.getElementById('completion_prompt_manager_popup');
    const select = document.getElementById('completion_prompt_manager_popup_entry_form_injection_trigger');
    if (!popup || !select) return;
    const group = document.createElement('div');
    group.className = 'ag2-prompt-triggers';
    group.setAttribute('role', 'group');
    const title = select.parentElement.querySelector('label');
    const titleId = title?.id;
    if (title) {
        title.id ||= 'ag2-prompt-trigger-label';
        group.setAttribute('aria-labelledby', title.id);
    }
    const inputs = [];
    for (const option of select.options) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = option.value;
        const text = document.createElement('span');
        text.textContent = option.textContent;
        label.append(input, text);
        group.append(label);
        inputs.push({ input, option, text });
    }
    const hint = document.createElement('div');
    hint.className = 'ag2-prompt-trigger-hint';
    hint.textContent = '可多选；不选时适用于所有类型。';
    select.after(group, hint);
    select.classList.add('ag2-prompt-native');
    const sync = () => {
        for (const { input, option, text } of inputs) {
            input.checked = option.selected;
            input.disabled = select.disabled || option.disabled;
            text.textContent = option.textContent;
        }
    };
    const change = event => {
        const item = inputs.find(({ input }) => input === event.target);
        if (!item) return;
        item.option.selected = item.input.checked;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    group.addEventListener('change', change);
    select.addEventListener('change', sync);
    const mo = new MutationObserver(sync);
    mo.observe(popup, { attributes: true, attributeFilter: ['style'] });
    mo.observe(select, { attributes: true, childList: true, subtree: true, characterData: true });
    const labels = [];
    const actions = [];
    for (const suffix of ['close', 'reset', 'save']) {
        const button = document.getElementById('completion_prompt_manager_popup_entry_form_' + suffix);
        if (!button) continue;
        const text = document.createElement('span');
        text.className = 'ag2-prompt-action-label';
        text.textContent = { close: '取消', reset: '重置', save: '保存' }[suffix];
        button.append(text);
        labels.push(text);
        const previous = { role: button.getAttribute('role'), tab: button.getAttribute('tabindex') };
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        const keydown = event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                // ST also synthesizes Enter clicks at document level.
                event.stopPropagation();
                button.click();
            }
        };
        button.addEventListener('keydown', keydown);
        actions.push(() => {
            button.removeEventListener('keydown', keydown);
            for (const [attribute, value] of [['role', previous.role], ['tabindex', previous.tab]]) {
                if (value === null) button.removeAttribute(attribute);
                else button.setAttribute(attribute, value);
            }
        });
    }
    sync();
    cleanup = () => {
        mo.disconnect();
        group.removeEventListener('change', change);
        select.removeEventListener('change', sync);
        select.classList.remove('ag2-prompt-native');
        group.remove(); hint.remove();
        for (const text of labels) text.remove();
        for (const restore of actions) restore();
        if (title && !titleId) title.removeAttribute('id');
    };
}

export function unmount() {
    cleanup?.();
    cleanup = null;
}
