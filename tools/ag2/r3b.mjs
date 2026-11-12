// R3b专项探针：palette 异步 active、手机 popover、手机 Esc、top-layer toastr。
// 运行：node tools/ag2/run.mjs tools/ag2/r3b.mjs --phase R3b --part palette|phone|toast

const part = (() => { const i = process.argv.indexOf('--part'); return i > 0 ? process.argv[i + 1] : 'palette'; })();

async function enter(T) {
    const page = await T.newPage();
    await T.prepare(page);
    await T.boot(page, { ag2: true, settle: 1800 });
    await T.openChat(page, await T.longChat(page), 2);
    await T.sleep(500);
    return page;
}

const pal = page => page.evaluate(() => {
    const d = document.querySelector('#ag2-palette');
    const rows = [...(d?.querySelectorAll('.ag2-pal-row') || [])].map((n, i) => ({
        i, group: n.previousElementSibling?.textContent || '', title: n.querySelector('.ag2-pal-title')?.textContent || '', selected: n.classList.contains('ag2-sel'),
    }));
    return { open: !!d?.open, rows, selected: rows.findIndex(x => x.selected), active: d?.querySelector('.ag2-pal-input')?.getAttribute('aria-activedescendant') || null };
});

async function palette(T) {
    const page = await enter(T);
    await page.keyboard.press('Control+K');
    await T.sleep(300);
    await page.keyboard.type('温度', { delay: 50 });
    await T.sleep(1200); // settings index is deliberately late
    const first = await pal(page);
    await T.shot(page, 'palette-temp-post');
    await page.keyboard.press('ArrowDown');
    const down = await pal(page);
    await page.keyboard.press('ArrowUp');
    const up = await pal(page);
    await page.keyboard.press('Enter');
    await T.sleep(700);
    const ran = await page.evaluate(() => ({ open: !!document.querySelector('#ag2-palette[open]'), set: document.body.classList.contains('ag2-set-open'), page: document.body.dataset.ag2Set || null }));
    return { first, down, up, ran, errors: T.errors(page) };
}

async function phone(T) {
    const page = await enter(T);
    const out = {};
    await page.tap('#ag2-plus');
    await T.sleep(250);
    const parent = await page.evaluate(() => {
        const el = document.querySelector('#ag2-plus-menu');
        const r = el?.getBoundingClientRect();
        return { rect: r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, items: !!el };
    });
    await page.click('#ag2-plus-menu [data-item="wand"]');
    await T.sleep(350);
    const sub = await page.evaluate(() => {
        const p = document.querySelector('#ag2-plus-menu'); const s = document.querySelector('#extensionsMenu');
        const r = s?.getBoundingClientRect(), q = p?.getBoundingClientRect();
        return { rect: r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, parent: q && { left: q.left, right: q.right, top: q.top, bottom: q.bottom }, visible: !!s && getComputedStyle(s).display !== 'none', overlap: !!r && !!q && !(r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom) };
    });
    await T.shot(page, 'menu-wand-phone-post');
    await page.keyboard.press('Escape');
    await T.sleep(200);
    out.menu = { parent, sub, closed: await page.evaluate(() => !document.querySelector('.ag2-menu') && !document.body.classList.contains('ag2-wand-open')) };

    // Title capsule opens the inspector sheet on phone; Escape must close that sheet.
    await page.click('#ag2-title .ag2-title-btn');
    await T.sleep(500);
    const before = await page.evaluate(() => document.body.classList.contains('ag2-insp-open'));
    await page.keyboard.press('Escape');
    await T.sleep(350);
    const after = await page.evaluate(() => document.body.classList.contains('ag2-insp-open'));
    await T.shot(page, 'phone-inspector-esc-post');
    out.esc = { before, after, errors: T.errors(page) };
    return out;
}

async function toast(T) {
    const page = await enter(T);
    await page.keyboard.press('Control+K');
    await T.sleep(300);
    const r = await page.evaluate(() => { toastr.info('R3b info toast', '', { timeOut: 1200 }); toastr.error('R3b error toast', '', { timeOut: 1200 }); return true; });
    await T.sleep(250);
    const state = await page.evaluate(() => {
        const d = document.querySelector('#ag2-palette'); const c = document.querySelector('#toast-container');
        const cr = c?.getBoundingClientRect();
        return { palette: !!d?.open, containerParent: c?.parentElement?.id || c?.parentElement?.tagName || null, inside: !!d && d.contains(c), visible: !!c && getComputedStyle(c).display !== 'none', rect: cr && { top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right }, count: c?.children.length || 0 };
    });
    await T.shot(page, 'palette-toast-post');
    await page.keyboard.press('Escape');
    await T.sleep(1600);
    const normal = await page.evaluate(() => ({ open: !!document.querySelector('#ag2-palette[open]'), containerParent: document.querySelector('#toast-container')?.parentElement?.tagName || null }));
    return { state, normal, errors: T.errors(page) };
}

export default async function (T) {
    if (part === 'phone') return phone(T);
    if (part === 'toast') return toast(T);
    return palette(T);
}
