// Named states are legible without an emoji font. Preserve values and restore on teardown.
import { openMenu, closeMenu } from './menu.js?v=20261115TT01';
import { icon } from './icons.js?v=20261115TT01';
let cleanup = null;
export function mount() {
    unmount();
    const list = document.getElementById('world_popup_entries_list');
    if (!list) return;
    const originals = new Map();
    const summaries = new Map();
    const captions = new Map();
    const relabel = [
        [document.querySelector('#wiTopBlock .inline-drawer-header [data-i18n="Click to expand"]'), '激活设置'],
    ].filter(([node]) => node).map(([node, text]) => ({ node, text, original: node.textContent }));
    for (const { node, text } of relabel) node.textContent = text;
    const host = () => {
        let layer = document.getElementById('ag2-layer');
        if (!layer) { layer = document.createElement('div'); layer.id = 'ag2-layer'; document.body.append(layer); }
        return layer;
    };
    const toolbar = document.getElementById('world_editor_select')?.parentElement;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ag2-worldbook-more';
    more.textContent = '操作';
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    const show = () => {
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
            ['world_refresh', '刷新条目', 'refresh-cw', true],
            ['help', '使用说明', 'info', false],
            ['world_popup_delete', '删除世界书', 'trash-2', true],
        ];
        openMenu(more, actions.map(([id, label, glyph, requiresSelection]) => ({
            label, icon: glyph, danger: id === 'world_popup_delete', disabled: requiresSelection && !selected,
            onSelect: () => (id === 'help' ? document.querySelector('#WorldInfo h3 a.notes-link') : document.getElementById(id))?.click(),
        })), { align: 'end', host: host(), id: 'ag2-worldbook-menu' });
    };
    more.addEventListener('click', show);
    toolbar?.append(more);
    document.getElementById('WorldInfo')?.classList.add('ag2-worldbook-enhanced');
    const names = { constant: '常驻', normal: '关键词', vectorized: '向量' };
    const selector = document.getElementById('WIMultiSelector');
    const books = document.getElementById('world_info');
    let active = null;
    if (selector && books) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ag2-wi-active';
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'world_info');
        button.innerHTML = '<span class="ag2-wi-active-label">启用的世界书</span><span class="ag2-wi-active-value"><span class="ag2-wi-active-name"></span><span class="ag2-wi-active-count"></span></span>';
        const nameNode = button.querySelector('.ag2-wi-active-name');
        const countNode = button.querySelector('.ag2-wi-active-count');
        const update = () => {
            const chosen = [...books.selectedOptions].filter(option => option.value !== '').map(option => option.textContent.trim());
            const available = [...books.options].some(option => option.value !== '');
            const name = chosen[0] || (available ? '未启用' : '暂无世界书');
            const count = chosen.length > 1 ? `等 ${chosen.length} 本` : '';
            if (nameNode.textContent !== name) nameNode.textContent = name;
            if (countNode.textContent !== count) countNode.textContent = count;
            button.classList.toggle('is-empty', !chosen.length);
            button.setAttribute('aria-label', `启用的世界书：${chosen.length ? chosen.join('、') : name}`);
        };
        const toggle = () => {
            const open = !selector.classList.contains('ag2-wi-active-open');
            selector.classList.toggle('ag2-wi-active-open', open);
            button.setAttribute('aria-expanded', String(open));
        };
        button.addEventListener('click', toggle);
        selector.prepend(button);
        // ST updates the selection with jQuery .trigger('change') and by rebuilding options.
        const $ = window.jQuery;
        if ($) $(books).on('change.ag2wb input.ag2wb', update);
        else { books.addEventListener('change', update); books.addEventListener('input', update); }
        const watch = new MutationObserver(update);
        watch.observe(books, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected'] });
        update();
        active = { button, toggle, update, watch, $ };
    }
    const entryActions = [
        ['.move_entry_button', '移动或复制到…', 'arrow-right'],
        ['.duplicate_entry_button', '复制条目', 'copy'],
        ['.delete_entry_button', '删除条目', 'trash-2'],
    ];
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    const render = () => {
        for (const [option] of originals) if (!list.contains(option)) originals.delete(option);
        for (const [entry] of summaries) if (!list.contains(entry)) summaries.delete(entry);
        for (const [caption] of captions) if (!list.contains(caption)) captions.delete(caption);
        for (const caption of list.querySelectorAll('.WIEntryHeaderTitleMobile')) {
            if (captions.has(caption) || caption.childElementCount) continue;
            const text = caption.textContent.replace(/\s*[:：]\s*$/, '');
            if (text === caption.textContent) continue;
            captions.set(caption, { original: caption.textContent, text });
            caption.textContent = text;
        }
        for (const option of list.querySelectorAll('select[name="entryStateSelector"] > option')) {
            if (originals.has(option) || !names[option.value]) continue;
            originals.set(option, option.textContent);
            option.textContent = names[option.value];
        }
        for (const entry of list.querySelectorAll(':scope > .world_entry')) {
            const header = entry.querySelector('.wi-card-entry > .inline-drawer > .inline-drawer-header');
            const toggle = header?.querySelector('.inline-drawer-toggle');
            const controls = header?.querySelector('.world_entry_thin_controls');
            if (!toggle || !controls) continue;
            let summary = summaries.get(entry);
            if (!summary) {
                const button = make('button', 'ag2-wi-summary');
                button.type = 'button';
                const title = make('span', 'ag2-wi-summary-title');
                const status = make('span', 'ag2-wi-summary-status');
                button.append(title, status);
                const open = event => { event.stopPropagation(); toggle.click(); };
                button.addEventListener('click', open);
                const actions = make('button', 'ag2-wi-entry-more');
                actions.type = 'button';
                actions.setAttribute('aria-label', '条目操作');
                actions.setAttribute('aria-haspopup', 'menu');
                actions.innerHTML = icon('ellipsis', 20);
                const menu = event => {
                    event.stopPropagation();
                    openMenu(actions, entryActions.map(([selector, label, glyph]) => ({
                        label, icon: glyph, danger: selector === '.delete_entry_button',
                        onSelect: () => header.querySelector(selector)?.click(),
                    })), { align: 'end', host: host(), id: 'ag2-wi-entry-menu' });
                };
                actions.addEventListener('click', menu);
                const labels = [make('span', 'ag2-wi-label ag2-wi-label-on', '启用'), make('span', 'ag2-wi-label ag2-wi-label-type', '类型')];
                controls.append(actions, ...labels);
                header.append(button);
                summary = { button, title, status, open, actions, menu, labels };
                summaries.set(entry, summary);
            }
            const name = entry.querySelector('textarea[name="comment"]')?.value.trim() || '未命名条目';
            const disabled = !!entry.querySelector('[name="entryKillSwitch"].fa-toggle-off');
            const state = disabled ? '已停用' : names[entry.querySelector('[name="entryStateSelector"]')?.value] || '';
            if (summary.title.textContent !== name) summary.title.textContent = name;
            if (summary.status.textContent !== state) summary.status.textContent = state;
            summary.button.classList.toggle('is-off', disabled);
            summary.button.setAttribute('aria-label', `${name}，${state}，展开编辑`);
        }
    };
    const observer = new MutationObserver(render);
    observer.observe(list, { childList: true, subtree: true });
    list.addEventListener('input', render);
    list.addEventListener('change', render);
    const onClick = () => queueMicrotask(render);
    list.addEventListener('click', onClick);
    render();
    cleanup = () => {
        observer.disconnect();
        if (active) {
            active.watch.disconnect();
            if (active.$) active.$(books).off('.ag2wb');
            else { books.removeEventListener('change', active.update); books.removeEventListener('input', active.update); }
            active.button.removeEventListener('click', active.toggle);
            active.button.remove();
            selector.classList.remove('ag2-wi-active-open');
        }
        list.removeEventListener('input', render);
        list.removeEventListener('change', render);
        list.removeEventListener('click', onClick);
        if (document.getElementById('ag2-worldbook-menu') || document.getElementById('ag2-wi-entry-menu')) closeMenu();
        for (const { button, open, actions, menu, labels } of summaries.values()) {
            button.removeEventListener('click', open);
            actions.removeEventListener('click', menu);
            button.remove();
            actions.remove();
            for (const label of labels) label.remove();
        }
        summaries.clear();
        for (const { node, text, original } of relabel) if (node.textContent === text) node.textContent = original;
        more.removeEventListener('click', show);
        more.remove();
        document.getElementById('WorldInfo')?.classList.remove('ag2-worldbook-enhanced');
        for (const [caption, { original, text }] of captions) if (caption.textContent === text) caption.textContent = original;
        captions.clear();
        for (const [option, text] of originals) if (option.textContent === names[option.value]) option.textContent = text;
        originals.clear();
    };
}
export function unmount() { cleanup?.(); cleanup = null; }
