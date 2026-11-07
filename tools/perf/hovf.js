// hovf: phone-width horizontal overflow per drawer. For each panel: the panel's own
// scrollWidth vs clientWidth, the document's, and the worst offending descendants
// (right edge past the panel's right edge, not clipped by an inner scroller).
// CFG.panels: subset of keys; CFG.cc: also walk Chat Completion sources in the API panel.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = 2000; CFG.settleChat = 3500;
await H.boot();
await H.openChar();
const PANELS = {
    wi: ['#WI-SP-button > .drawer-toggle', '#WorldInfo'],
    ai: ['#ai-config-button > .drawer-toggle', '#left-nav-panel'],
    api: ['#sys-settings-button > .drawer-toggle', '#rm_api_block'],
    fmt: ['#advanced-formatting-button > .drawer-toggle', '#AdvancedFormatting'],
    user: ['#user-settings-button > .drawer-toggle', '#user-settings-block'],
    bg: ['#backgrounds-button > .drawer-toggle', '#Backgrounds'],
    ext: ['#extensions-settings-button > .drawer-toggle', '#rm_extensions_block'],
    persona: ['#persona-management-button > .drawer-toggle', '#PersonaManagement'],
    char: ['#rightNavHolder > .drawer-toggle', '#right-nav-panel'],
};
const tag = (CFG.v || 'x') + '-' + (CFG.w || 390);
const measure = root => H.ev(r => {
    const p = document.querySelector(r), pr = p.getBoundingClientRect(), se = document.scrollingElement;
    const vis = e => { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const sel = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    const clippedBy = e => { for (let q = e.parentElement; q && q !== p; q = q.parentElement) { const c = getComputedStyle(q); if (/(hidden|auto|scroll|clip)/.test(c.overflowX) && q.getBoundingClientRect().right <= pr.right + 1) return true; } return false; };
    const off = [];
    for (const e of p.querySelectorAll('*')) {
        if (!vis(e)) continue;
        const b = e.getBoundingClientRect();
        if (b.right > pr.right + 1 && !clippedBy(e)) off.push([b.right - pr.right, sel(e) + (e.parentElement ? ' <' + sel(e.parentElement) : '')]);
    }
    off.sort((a, b) => b[0] - a[0]);
    // keep the outermost offenders only (a child of an offender is implied)
    const top = []; for (const o of off) { if (top.length >= 8) break; if (!top.some(t => t[1] === o[1])) top.push(o); }
    // inner scrollers that scroll sideways (scrollable rows the user can drag)
    const sx = [...p.querySelectorAll('*')].filter(e => vis(e) && e.scrollWidth > e.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowX)).slice(0, 6).map(e => sel(e) + ' ' + e.scrollWidth + '/' + e.clientWidth);
    return { panel: [p.scrollWidth, p.clientWidth], panelOvfX: getComputedStyle(p).overflowX, rect: [Math.round(pr.left), Math.round(pr.right)], doc: [se.scrollWidth, se.clientWidth], body: [document.body.scrollWidth, document.body.clientWidth], scrollX: window.scrollX, worst: top.map(([d, s]) => Math.round(d) + ' ' + s), sideScrollers: sx };
}, root);
const out = {};
for (const key of CFG.panels || Object.keys(PANELS)) {
    const [toggle, root] = PANELS[key];
    try {
        const was = await H.ev(r => document.querySelector(r).classList.contains('openDrawer'), root);
        if (!was) { await H.ev(s => document.querySelector(s).click(), toggle); await sleep(900); }
        if (key === 'wi' && CFG.wiBook !== false) {
            // open the first lorebook so the entry list renders as well
            await H.ev(() => { const s = document.querySelector('#world_editor_select'); if (s && s.options.length > 1 && !s.value) { s.selectedIndex = 1; $(s).trigger('change'); } });
            await sleep(1500);
        }
        if (CFG.expand) {
            // expand every collapsed inline drawer (two passes: nested ones appear after the first)
            for (let i = 0; i < 2; i++) {
                await H.ev(r => { let k = 0; for (const t of document.querySelectorAll(r + ' .inline-drawer-toggle')) { const c = t.parentElement?.querySelector(':scope > .inline-drawer-content'); if (!c || getComputedStyle(c).display !== 'none' || !t.offsetParent) continue; if (++k > 40) break; t.click(); } }, root);
                await sleep(700);
            }
        }
        out[key] = await measure(root);
        await H.ev(r => { const e = document.querySelector(r); if (e) e.scrollTop = 0; }, root);
        if (CFG.shots !== false) await H.shot(`p3-${tag}-${key}`);
        if (key === 'api' && CFG.cc) {
            const srcs = await H.ev(() => [...document.querySelectorAll('#chat_completion_source option')].map(o => o.value));
            const orig = await H.ev(() => $('#chat_completion_source').val());
            out.apiCc = {};
            for (const s of srcs) {
                await H.ev(v => $('#chat_completion_source').val(v).trigger('change'), s);
                await sleep(350);
                const m = await measure(root);
                if (m.panel[0] > m.panel[1] || m.doc[0] > m.doc[1] || m.worst.length) out.apiCc[s] = { panel: m.panel, doc: m.doc, worst: m.worst.slice(0, 3) };
            }
            await H.ev(v => $('#chat_completion_source').val(v).trigger('change'), orig);
        }
        await H.save('hovf-' + key, out[key]);
        if (!was) { await H.ev(s => document.querySelector(s).click(), toggle); await sleep(700); }
    } catch (e) { out[key] = 'ERR ' + String(e).slice(0, 160); }
}
return out;
