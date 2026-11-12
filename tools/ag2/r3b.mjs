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
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+K');
    await T.sleep(250);
    await page.keyboard.type('温度', { delay: 35 });
    await T.sleep(900);
    const repeat = await pal(page);
    if (repeat.rows.length > 1) {
        const row = page.locator('#ag2-palette .ag2-pal-row').nth(1);
        const box = await row.boundingBox();
        await page.mouse.move(box.x + 10, box.y + 10);
    }
    const mouse = await pal(page);
    await page.keyboard.press('Escape');
    return { first, down, up, ran, repeat, mouse, errors: T.errors(page) };
}

async function desktopMenu(T) {
    const page = await enter(T);
    await page.click('#ag2-plus');
    await T.sleep(200);
    await page.click('#ag2-plus-menu [data-item="wand"]');
    await T.sleep(300);
    const state = await page.evaluate(() => {
        const p = document.querySelector('#ag2-plus-menu'), s = document.querySelector('#extensionsMenu');
        const a = p?.querySelector('[data-item="wand"]'), r = s?.getBoundingClientRect(), q = p?.getBoundingClientRect(), ar = a?.getBoundingClientRect();
        return { parent: q && { left: q.left, right: q.right, top: q.top, bottom: q.bottom }, anchor: ar && { left: ar.left, right: ar.right, top: ar.top, bottom: ar.bottom }, child: r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, visible: !!s && getComputedStyle(s).display !== 'none', focused: document.activeElement?.closest('#ag2-plus-menu')?.dataset.item || null };
    });
    await T.shot(page, 'menu-wand-desk-post');
    await page.keyboard.press('Escape');
    await T.sleep(200);
    return { state, closed: await page.evaluate(() => !document.querySelector('.ag2-menu') && !document.body.classList.contains('ag2-wand-open')), errors: T.errors(page) };
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

async function compat(T) {
    const page = await enter(T);
    await page.hover('#chat .mes.last_mes');
    await T.sleep(250);
    await T.shot(page, 'compat-actionbar-post');
    const buttons = await page.evaluate(() => [...document.querySelectorAll('#chat .mes.last_mes .mes_buttons .extraMesButtons > *, #chat .mes.last_mes .mes_buttons > .mes_btn, #chat .mes.last_mes .mes_buttons > .mes_button')].map(e => ({
        cls: String(e.className || '').slice(0, 140), text: (e.innerText || e.textContent || '').trim().slice(0, 80), title: e.getAttribute('title'), aria: e.getAttribute('aria-label'),
        html: e.innerHTML.slice(0, 200), box: (() => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
        before: (() => { const s = getComputedStyle(e, '::before'); return { content: s.content, mask: s.maskImage, width: s.width, height: s.height }; })(),
    })));
    const collapse = page.locator('#chat .mes.last_mes .mes_buttons > .xiaobaix-collapse-btn').first();
    const beforeClick = await collapse.evaluate(e => ({ visible: !!(e.offsetWidth || e.offsetHeight), expanded: e.classList.contains('active') || e.getAttribute('aria-expanded') }));
    await collapse.click();
    await T.sleep(250);
    const afterClick = await collapse.evaluate(e => ({ expanded: e.classList.contains('active') || e.getAttribute('aria-expanded'), opened: [...e.classList].filter(c => /open|expand|active/i.test(c)) }));
    const scan = await T.scan(page, ['#chat']);
    return { buttons, collapse: { beforeClick, afterClick }, scan: { ovf: scan.ovf, dbl: scan.dbl, unhid: scan.unhid, nest: scan.nest, btn: scan.btn }, errors: T.errors(page) };
}

export default async function (T) {
    if (part === 'phone') return phone(T);
    if (part === 'desktop') return desktopMenu(T);
    if (part === 'toast') return toast(T);
    if (part === 'compat') return compat(T);
    return palette(T);
}
