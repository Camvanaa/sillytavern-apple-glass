// Compact phone preset actions; dispatch to the existing controls without moving them.
import { openMenu, closeMenu } from './menu.js?v=20261114VF05';

let cleanup = null;
export function mount() {
    unmount();
    const native = document.querySelector('#settings_preset_openai + .flex-container');
    if (!native) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ag2-preset-more menu_button';
    button.textContent = '更多操作';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    let layer = null;
    const show = () => {
        layer = document.getElementById('ag2-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'ag2-layer';
            document.body.append(layer);
        }
        const actions = [
            ['#bind_preset_to_connection', '绑定到连接', 'plug'],
            ['#import_oai_preset', '导入预设', 'download'],
            ['#export_oai_preset', '导出预设', 'upload'],
            ['[data-preset-manager-rename="openai"]', '重命名', 'pencil'],
            ['#delete_oai_preset', '删除预设', 'trash-2'],
        ];
        openMenu(button, actions.map(([selector, label, icon]) => {
            const target = document.querySelector(selector);
            return { label, icon, danger: selector === '#delete_oai_preset',
                hint: selector === '#bind_preset_to_connection' ? (target?.checked ? '已开启' : '已关闭') : '',
                disabled: !target || target.disabled || target.classList.contains('disabled'),
                onSelect: () => target.click() };
        }), { align: 'end', host: layer, id: 'ag2-preset-menu' });
    };
    button.addEventListener('click', show);
    native.append(button);
    native.closest('#openai_api-presets').classList.add('ag2-preset-enhanced');
    cleanup = () => {
        if (document.getElementById('ag2-preset-menu')) closeMenu();
        button.removeEventListener('click', show);
        button.remove();
        native.closest('#openai_api-presets')?.classList.remove('ag2-preset-enhanced');
        if (layer && !layer.childElementCount) layer.remove();
    };
}

export function unmount() { cleanup?.(); cleanup = null; }
