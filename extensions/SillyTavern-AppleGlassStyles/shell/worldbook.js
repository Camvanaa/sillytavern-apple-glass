// Named states are legible without an emoji font. Preserve values and restore on teardown.
import { openMenu, closeMenu } from './menu.js?v=20261114VF07';
let cleanup = null;
export function mount() {
    unmount();
    const list = document.getElementById('world_popup_entries_list');
    if (!list) return;
    const originals = new Map();
    const toolbar = document.getElementById('world_editor_select')?.parentElement;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ag2-worldbook-more';
    more.textContent = '操作';
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    const show = () => {
        let layer = document.getElementById('ag2-layer');
        if (!layer) { layer = document.createElement('div'); layer.id = 'ag2-layer'; document.body.append(layer); }
        const selected = !!document.getElementById('world_editor_select')?.value;
        const actions = [
            ['world_create_button', '新建世界书', 'plus', false],
            ['world_import_button', '导入世界书', 'download', false],
            ['world_popup_export', '导出世界书', 'upload', true],
            ['world_popup_name_button', '重命名', 'pencil', true],
            ['world_duplicate', '复制世界书', 'copy', true],
            ['OpenAllWIEntries', '展开所有条目', 'chevron-down', true],
            ['CloseAllWIEntries', '收起所有条目', 'chevron-up', true],
            ['world_backfill_memos', '用关键词补全标题', 'pencil', true],
            ['world_apply_current_sorting', '应用排序为顺序', 'list-ordered', true],
            ['world_popup_delete', '删除世界书', 'trash-2', true],
        ];
        openMenu(more, actions.map(([id, label, icon, requiresSelection]) => ({
            label, icon, danger: id === 'world_popup_delete', disabled: requiresSelection && !selected,
            onSelect: () => document.getElementById(id)?.click(),
        })), { align: 'end', host: layer, id: 'ag2-worldbook-menu' });
    };
    more.addEventListener('click', show);
    toolbar?.append(more);
    document.getElementById('WorldInfo')?.classList.add('ag2-worldbook-enhanced');
    const names = { constant: '常驻', normal: '关键词', vectorized: '向量' };
    const render = () => {
        for (const [option] of originals) if (!list.contains(option)) originals.delete(option);
        for (const option of list.querySelectorAll('select[name="entryStateSelector"] > option')) {
            if (originals.has(option) || !names[option.value]) continue;
            originals.set(option, option.textContent);
            option.textContent = names[option.value];
        }
    };
    const observer = new MutationObserver(render);
    observer.observe(list, { childList: true, subtree: true });
    render();
    cleanup = () => {
        observer.disconnect();
        if (document.getElementById('ag2-worldbook-menu')) closeMenu();
        more.removeEventListener('click', show);
        more.remove();
        document.getElementById('WorldInfo')?.classList.remove('ag2-worldbook-enhanced');
        for (const [option, text] of originals) if (option.textContent === names[option.value]) option.textContent = text;
        originals.clear();
    };
}
export function unmount() { cleanup?.(); cleanup = null; }
