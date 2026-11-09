// tools/ag2/p2b-dev.mjs — P2b dev probes (not acceptance). --mem injects worktree CSS.
//   node tools/ag2/run.mjs tools/ag2/p2b-dev.mjs --phase P2b-dev --part survey [--mem] [--pages api,ai]
const PANEL = { api: '#rm_api_block', ai: '#left-nav-panel', fmt: '#AdvancedFormatting', wi: '#WorldInfo', persona: '#PersonaManagement', bg: '#Backgrounds', user: '#user-settings-block', ext: '#rm_extensions_block' };
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const part = arg('part', 'survey');
const MEM = process.argv.includes('--mem');
const PAGES = arg('pages', Object.keys(PANEL).join(',')).split(',');

async function enter(T) {
    const page = await T.newPage();
    await T.prepare(page, MEM ? { theme: 'ag2' } : {});
    await T.boot(page, { ag2: true, settle: 1500 });
    await T.openChat(page, await T.longChat(page), 20);
    await page.click('#ag2-sidebar [data-act="settings"]');
    await page.waitForSelector('#ag2-settings:not([hidden])', { timeout: 15000 });
    await T.sleep(700);
    return page;
}

async function survey(T) {
    const page = await enter(T);
    const out = {};
    for (const p of PAGES) {
        await page.click(`#ag2-settings .ag2-set-item[data-page="${p}"]`);
        await T.sleep(1000);
        out[p] = await page.evaluate(sel => {
            const root = document.querySelector(sel);
            const vis = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const cnt = s => [...root.querySelectorAll(s)].filter(vis).length;
            const d = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
            const walk = (e, depth) => depth > 2 ? [] : [...e.children].filter(vis).slice(0, 14).map(c => '  '.repeat(depth) + d(c) + (c.children.length ? '' : ' "' + (c.textContent || '').trim().slice(0, 20) + '"')).concat(...[...e.children].filter(vis).slice(0, 6).map(c => walk(c, depth + 1)));
            return {
                cb: cnt('label.checkbox_label'), range: cnt('.range-block'), select: cnt('select'), pole: cnt('.text_pole'), ta: cnt('textarea'),
                idr: cnt('.inline-drawer'), h3: cnt('h3'), h4: cnt('h4'), mb: cnt('.menu_button'), sw: root.scrollWidth, cw: root.clientWidth, sh: root.scrollHeight,
                tree: walk(root, 0).slice(0, 60),
            };
        }, PANEL[p]);
        if (process.argv.includes('--snap')) await T.shot(page, `dev-${p}`);
    }
    return out;
}

async function evalp(T) {
    const page = await enter(T);
    const p = arg('page', 'ai');
    await page.click(`#ag2-settings .ag2-set-item[data-page="${p}"]`);
    await T.sleep(1000);
    const code = arg('code', '1');
    const r = await page.evaluate(code);
    if (process.argv.includes('--snap')) await T.shot(page, `dev-${p}`);
    return r;
}

export default async function (T) {
    const parts = { survey, eval: evalp };
    return parts[part](T);
}
