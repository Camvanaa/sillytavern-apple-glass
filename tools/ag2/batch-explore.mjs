// Seeded, model-based UI exploration for AG2. Run through the existing guarded driver:
// node tools/ag2/run.mjs tools/ag2/batch-explore.mjs --phase batch --phone --steps 160 --seed 240513
// It intentionally uses only reversible UI actions; all writes/model calls remain stubbed by run.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = name => {
    const i = process.argv.indexOf('--' + name);
    return i < 0 ? null : process.argv[i + 1] || true;
};
const seedArg = Number(arg('seed') || 240513);
const stepsArg = Math.max(1, Math.min(2000, Number(arg('steps') || 120)));
const reportDir = String(arg('out') || '/tmp/opencode/ag2-batch');

function rng(seed) {
    let x = seed >>> 0;
    return () => {
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        return (x >>> 0) / 4294967296;
    };
}

const visible = (page, selector) => page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return false;
    const c = getComputedStyle(e), r = e.getBoundingClientRect();
    return c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > .02 && r.width > 0 && r.height > 0;
}, selector);

async function click(page, selector, { force = false } = {}) {
    const loc = page.locator(selector).first();
    if (!(await loc.count().catch(() => 0))) return false;
    if (!force && !(await loc.isVisible().catch(() => false))) return false;
    await loc.click({ timeout: 1600, force }).catch(() => {});
    return true;
}

async function bootChat(T, page) {
    await page.goto('about:blank').catch(() => {});
    await T.boot(page, { ag2: true, settle: 600 });
    await T.openChat(page, await T.longChat(page), 2);
    await T.sleep(150);
}

async function snapshot(page) {
    return page.evaluate(() => {
        const vis = e => {
            if (!e) return false;
            const s = getComputedStyle(e), r = e.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > .02 && r.width > 0 && r.height > 0;
        };
        const rect = e => {
            if (!e) return null;
            const r = e.getBoundingClientRect();
            return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
        };
        const body = document.body, de = document.documentElement;
        const modal = [...document.querySelectorAll('dialog[open]')].map(e => e.id || e.className);
        const overflow = [];
        for (const e of document.querySelectorAll('#ag2-shell, #ag2-sidebar, #ag2-settings, #ag2-palette, #right-nav-panel, #chat, #form_sheld, .ag2-menu')) {
            if (!vis(e)) continue;
            if (e.scrollWidth > e.clientWidth + 2 && !['#chat'].includes(e.id))
                overflow.push(`${e.id || e.className}:${e.scrollWidth}>${e.clientWidth}`);
            const r = e.getBoundingClientRect();
            // The phone sidebar intentionally slides left while a chat is pushed in. It is
            // not a viewport leak when it is already non-interactive; keep genuine visible
            // shell/panel escapes reportable.
            const intentionalPhoneSlide = e.id === 'ag2-sidebar' && body.classList.contains('ag2-phone')
                && body.dataset.ag2Ph === 'chat' && (getComputedStyle(e).pointerEvents === 'none' || Number(getComputedStyle(e).opacity) < .05);
            if (!intentionalPhoneSlide && (r.left < -2 || r.right > innerWidth + 2)) overflow.push(`${e.id || e.className}:x=${Math.round(r.left)}..${Math.round(r.right)}`);
        }
        const openDrawers = [...document.querySelectorAll('.drawer-content.openDrawer')].filter(vis).map(e => e.id || 'drawer');
        const settingsOpen = body.classList.contains('ag2-set-open');
        const inspectorOpen = body.classList.contains('ag2-insp-open');
        const paletteOpen = !!document.querySelector('#ag2-palette[open]');
        const menus = [...document.querySelectorAll('.ag2-menu')].filter(vis).length;
        const toasts = [...document.querySelectorAll('#toast-container > div')].filter(vis).length;
        const backdrop = [...document.querySelectorAll('dialog[open]')].map(e => getComputedStyle(e, '::backdrop').backgroundColor);
        return {
            viewport: [innerWidth, innerHeight], phone: body.classList.contains('ag2-phone'), page: body.dataset.ag2Ph || null,
            settingsOpen, settingsLevel: document.querySelector('#ag2-settings')?.dataset.level || null,
            settingsPage: body.dataset.ag2Set || null, inspectorOpen, inspectorView: document.querySelector('#right-nav-panel')?.dataset.ag2Insp || null,
            paletteOpen, openDialogs: modal, menuCount: menus, toastCount: toasts, backdrop,
            doc: [de.scrollWidth, de.clientWidth], scroll: [scrollX, scrollY], overflow, openDrawers,
            rects: { shell: rect(document.querySelector('#ag2-shell')), settings: rect(document.querySelector('#ag2-settings')),
                palette: rect(document.querySelector('#ag2-palette')), inspector: rect(document.querySelector('#right-nav-panel')) },
        };
    });
}

async function invariant(page) {
    const s = await snapshot(page);
    const failures = [];
    if (s.doc[0] > s.doc[1] + 2) failures.push('document horizontal overflow');
    if (s.menuCount > 1) failures.push(`multiple AG2 menus (${s.menuCount})`);
    if (s.settingsOpen && !await visible(page, '#ag2-settings')) failures.push('settings flag open but window hidden');
    if (s.paletteOpen && !s.openDialogs.includes('ag2-palette')) failures.push('palette state mismatch');
    if (s.overflow.length) failures.push(...s.overflow.map(x => `overflow ${x}`));
    if (s.phone && s.page === 'chat' && !s.settingsOpen && !s.inspectorOpen && !await visible(page, '#ag2-title')) failures.push('phone chat title hidden');
    return { snapshot: s, failures };
}

function makeActions(T, page, random) {
    const choose = xs => xs[Math.floor(random() * xs.length)];
    const esc = async () => page.keyboard.press('Escape').catch(() => {});
    return [
        ['palette-open-search', async () => {
            if (!await visible(page, '#ag2-palette')) {
                await page.keyboard.press('Control+K').catch(() => {}); await T.sleep(90);
            }
            const input = page.locator('#ag2-palette .ag2-pal-input');
            if (await input.isVisible().catch(() => false)) {
                await input.fill(choose(['温度', '世界书', '角色', '设置', ''])).catch(() => {});
                await T.sleep(180);
            }
        }],
        ['escape', esc],
        ['plus-menu-toggle', async () => {
            if (await visible(page, '#ag2-plus-menu')) await esc();
            else await click(page, '#ag2-plus');
        }],
        ['plus-menu-item', async () => {
            if (!await visible(page, '#ag2-plus-menu')) await click(page, '#ag2-plus');
            const opts = await page.locator('#ag2-plus-menu [data-item]').evaluateAll(es => es.map(e => e.dataset.item));
            const safe = opts.filter(x => ['wand', 'world', 'search'].includes(x));
            if (safe.length) await click(page, `#ag2-plus-menu [data-item="${choose(safe)}"]`);
        }],
        ['phone-more-toggle', async () => {
            if (!await visible(page, '#ag2-ph-more')) return;
            await click(page, '#ag2-ph-more');
        }],
        ['inspector-toggle', async () => {
            if (await visible(page, '#right-nav-panel .ag2-insp-ib[data-ag2-act="close"]')) await click(page, '#right-nav-panel .ag2-insp-ib[data-ag2-act="close"]');
            else if (await visible(page, '#ag2-title .ag2-title-btn')) await click(page, '#ag2-title .ag2-title-btn');
        }],
        ['inspector-segment', async () => {
            if (!await visible(page, '#right-nav-panel .ag2-insp-seg')) await click(page, '#ag2-title .ag2-title-btn');
            const tabs = page.locator('#right-nav-panel .ag2-insp-seg button');
            const n = await tabs.count().catch(() => 0);
            if (n) await tabs.nth(Math.floor(random() * n)).click({ timeout: 1200 }).catch(() => {});
        }],
        ['settings-toggle', async () => {
            if (await visible(page, '#ag2-settings')) {
                if (await visible(page, '#ag2-settings .ag2-set-close')) await click(page, '#ag2-settings .ag2-set-close');
                else await esc();
            } else if (await visible(page, '#ag2-tabbar [data-tab="settings"]')) await click(page, '#ag2-tabbar [data-tab="settings"]');
            else await click(page, '#ag2-sidebar [data-act="settings"]');
        }],
        ['settings-page', async () => {
            if (!await visible(page, '#ag2-settings')) {
                if (await visible(page, '#ag2-tabbar [data-tab="settings"]')) await click(page, '#ag2-tabbar [data-tab="settings"]');
                else await click(page, '#ag2-sidebar [data-act="settings"]');
            }
            const level = await page.locator('#ag2-settings').getAttribute('data-level').catch(() => null);
            if (level === 'list') {
                const pages = ['ai', 'look', 'wi', 'persona', 'user', 'api', 'fmt', 'ext'];
                await click(page, `#ag2-settings .ag2-set-item[data-page="${choose(pages)}"]`);
            } else if (level === 'page') {
                if (random() < .55) await click(page, '#ag2-settings .ag2-set-back'); else await esc();
            }
        }],
        ['settings-scroll', async () => {
            const sel = await visible(page, '#ag2-settings .ag2-set-body') ? '#ag2-settings .ag2-set-body' : '.drawer-content.openDrawer > .scrollableInner';
            const fraction = random();
            await page.locator(sel).evaluate((e, f) => { e.scrollTop = f * Math.max(0, e.scrollHeight - e.clientHeight); }, fraction).catch(() => {});
        }],
        ['toast', async () => page.evaluate(() => window.toastr?.info?.('批量探索提示', '', { timeOut: 650 }))],
        ['resize-jitter', async () => {
            const phone = T.cfg.phone, w = phone ? choose([360, 375, 390, 414, 1000, 1001]) : choose([900, 1000, 1001, 1100, 1280, 1440]);
            await page.setViewportSize({ width: w, height: choose([740, 800, 844, 900]) }).catch(() => {});
        }],
        ['scroll-chat', async () => page.evaluate(f => {
            const e = document.querySelector('#chat'); if (e) e.scrollTop = f * Math.max(0, e.scrollHeight - e.clientHeight);
        }, random())],
        ['rapid-menu-double', async () => {
            const sel = T.cfg.phone ? '#ag2-ph-more' : '#ag2-plus';
            if (await visible(page, sel)) { await click(page, sel); await click(page, sel); }
        }],
        ['restore-chat-page', async () => {
            if (await visible(page, '#ag2-settings')) { await esc(); await esc(); }
            if (await visible(page, '#right-nav-panel .ag2-insp-ib[data-ag2-act="close"]')) await click(page, '#right-nav-panel .ag2-insp-ib[data-ag2-act="close"]');
            await esc();
        }],
    ];
}

export default async function (T) {
    const page = await T.newPage();
    await page.addInitScript(() => {
        window.__ag2BatchPerf = { longTasks: [], layoutShifts: [] };
        try { new PerformanceObserver(l => window.__ag2BatchPerf.longTasks.push(...l.getEntries().map(e => Math.round(e.duration))))
            .observe({ type: 'longtask', buffered: true }); } catch {}
        try { new PerformanceObserver(l => window.__ag2BatchPerf.layoutShifts.push(...l.getEntries().filter(e => !e.hadRecentInput).map(e => e.value)))
            .observe({ type: 'layout-shift', buffered: true }); } catch {}
    });
    await T.prepare(page);
    const boot = await T.boot(page, { ag2: true, settle: 1000 });
    await T.openChat(page, await T.longChat(page), 2);
    const seed = seedArg >>> 0;
    const random = rng(seed);
    const actions = makeActions(T, page, random);
    const trace = [], issues = [], samples = [], baselineErrors = new Set(T.errors(page));
    const t0 = Date.now();
    for (let i = 0; i < stepsArg; i++) {
        const [name, run] = actions[Math.floor(random() * actions.length)];
        const started = Date.now();
        let actionError = null;
        try { await run(); } catch (e) { actionError = String(e?.message || e).slice(0, 300); }
        await T.sleep(90);
        const check = await invariant(page);
        const entry = { i, action: name, ms: Date.now() - started, actionError, state: check.snapshot };
        trace.push(entry);
        if (check.failures.length || actionError) {
            const issue = { step: i, action: name, failures: check.failures, actionError, state: check.snapshot };
            issues.push(issue);
            if (issues.length <= 6) await T.shot(page, `issue-${String(issues.length).padStart(2, '0')}-step-${i}`).catch(() => {});
        }
        if (i % 10 === 9 || check.failures.length) {
            const scan = await T.scan(page, ['#ag2-shell', '#ag2-settings', '#right-nav-panel', '#chat']);
            samples.push({ step: i, scan: { ovf: scan.ovf, dbl: scan.dbl, unhid: scan.unhid, nest: scan.nest, btn: scan.btn,
                doc: scan.doc, panels: scan.panels }, check: check.failures });
            if ([scan.ovf, scan.dbl, scan.unhid, scan.nest, scan.btn].some(Boolean) && !issues.some(x => x.step === i && x.failures.some(y => y.startsWith('scan')))) {
                issues.push({ step: i, action: name, failures: [`scan ${JSON.stringify({ ovf: scan.ovf, dbl: scan.dbl, unhid: scan.unhid, nest: scan.nest, btn: scan.btn })}`], state: check.snapshot });
                if (issues.length <= 6) await T.shot(page, `issue-scan-step-${i}`).catch(() => {});
            }
        }
    }
    const perf = await page.evaluate(() => ({ longTasks: window.__ag2BatchPerf?.longTasks || [], layoutShifts: window.__ag2BatchPerf?.layoutShifts || [] }));
    const newErrors = T.errors(page).filter(x => !baselineErrors.has(x));
    const report = {
        seed, steps: stepsArg, viewportMode: T.cfg.phone ? 'phone' : 'desktop', boot, elapsedMs: Date.now() - t0,
        actions: Object.fromEntries(actions.map(([n]) => [n, trace.filter(x => x.action === n).length])),
        issueCount: issues.length, issues, newErrors, samples, perf: {
            longTasks: perf.longTasks, longTaskCount: perf.longTasks.length, longTaskMaxMs: Math.max(0, ...perf.longTasks),
            layoutShiftCount: perf.layoutShifts.length, layoutShiftTotal: perf.layoutShifts.reduce((a, b) => a + b, 0),
        }, trace,
    };
    mkdirSync(reportDir, { recursive: true });
    const path = `${reportDir}/batch-${report.viewportMode}-${seed}.json`;
    writeFileSync(path, JSON.stringify(report, null, 2));
    return { path, seed, steps: stepsArg, elapsedMs: report.elapsedMs, actions: report.actions, issueCount: issues.length,
        issues: issues.slice(0, 12), newErrors, perf: report.perf, fixtureGuard: 'handled by tools/ag2/run.mjs' };
}
