// tools/ag2/r1-flash.mjs — R1 probe: “ST's native drawer flashes while a panel closes / switches”.
//
//   node tools/ag2/run.mjs tools/ag2/r1-flash.mjs --phase R1 --part desk  [--st-reduced] [--snap pre|post] [--mem]
//   node tools/ag2/run.mjs tools/ag2/r1-flash.mjs --phase R1 --part phone --phone [--st-reduced] [--snap pre|post] [--mem]
//   --st-reduced  ST's own “减少动态” (power_user.reduced_motion → animation_duration 0)
//   --reduced     (run.mjs) the OS preference instead
//   --snap TAG    also take screenshots in the middle of the animations → real/R1/<TAG>-…png
//                 (screenshots stall frames, so the numbers of a --snap run are not the reference)
//   --mem         inject the worktree CSS in memory (debug); acceptance runs use the published theme
//
// How it measures: a requestAnimationFrame sampler (installed before any page script) looks at the
// eight settings drawers and #right-nav-panel on EVERY frame while an operation runs (≥ 900ms):
//   out     a visible drawer that is not inside its AG2 container
//           (settings drawers: the #ag2-settings frame, which must itself be shown;
//            inspector: the box it has when it is open and at rest — it may slide in from the
//            right / from below, never sit elsewhere or have another size)
//   native  a visible drawer wearing ST's own look (settings drawers: background / border /
//           backdrop-filter of their own; inspector: not the shell's background + radius)
//   blur    a visible layer (drawers, <body> children, #sheld, #chat, shell layers) with
//           backdrop-filter blur covering > 60% of the viewport that is
//           neither the settings sheet nor the inspector in its AG2 form (frames under ST's
//           opaque start-up splash #preloader are counted apart as blurUnderSplash)
// “visible” = display ≠ none, visibility ≠ hidden, opacity > 0.02, box ≥ 2×2 inside the viewport.
// Frames without body.ag2 (classic theme during the theme round trip, before the shell boots) are
// not judged: ST's own interface is what must show there.
// Exit code 1 when any operation has a bad frame.

const argv = process.argv;
const part = (() => { const i = argv.indexOf('--part'); return i > 0 ? argv[i + 1] : 'desk'; })();
const MEM = argv.includes('--mem');
const FRAMES = argv.includes('--frames'); // retain every sampled frame, not just anomaly summaries
const ST_REDUCED = argv.includes('--st-reduced');
const SHOTS = (() => { const i = argv.indexOf('--snap'); return i > 0 ? argv[i + 1] : ''; })();
const PAGES = ['api', 'ai', 'fmt', 'wi', 'persona', 'bg', 'look', 'user', 'ext', 'about'];

/** Runs in the page before everything else. */
function sampler(recordAll = false) {
    if (window.__r1) return;
    const SET = ['rm_api_block', 'left-nav-panel', 'AdvancedFormatting', 'WorldInfo', 'PersonaManagement', 'Backgrounds', 'user-settings-block', 'rm_extensions_block'];
    const INSP = 'right-nav-panel';
    let frames = [], on = false, t0 = 0, last = 0, maxGap = 0, n = 0, nm = 0, ref = null, marks = [];
    const R = r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    const shown = (cs, r) => cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.02
        && r.width >= 2 && r.height >= 2 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    const alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 0; const p = m[1].split(/[,/ ]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
    const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    const inspLook = (cs, r) => ({ bg: cs.backgroundColor, rad: cs.borderTopLeftRadius, pos: cs.position, rect: R(r) });
    function tick(now) {
        if (!on) return;
        requestAnimationFrame(tick);
        if (!document.body) return;
        n++;
        if (last) maxGap = Math.max(maxGap, now - last);
        last = now;
        judge(now);
    }
    // Also judged right after every class change of a drawer / of <body> (MutationObserver
    // microtask + the next macrotask): the result no longer depends on the frame rate.
    let moOn = false;
    function watch() {
        if (moOn || !document.body) return;
        moOn = true;
        const mo = new MutationObserver(() => { if (!on) return; nm++; judge(performance.now()); setTimeout(() => { if (on) { nm++; judge(performance.now()); } }, 0); });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        for (const id of [...SET, INSP]) { const e = document.getElementById(id); if (e) mo.observe(e, { attributes: true, attributeFilter: ['class'] }); else moOn = false; }
    }
    function judge(now) {
        const b = document.body;
        watch();
        // classic theme on screen (theme round trip): ST's own interface is what must show
        if (!b.classList.contains('ag2') || !getComputedStyle(b).getPropertyValue('--ag2-insp-w').trim()) return;
        const t = Math.round(now - t0);
        const rec = [];
        const win = document.getElementById('ag2-settings');
        let wr = null;
        if (win && !win.hidden) { const wc = getComputedStyle(win); const r = win.getBoundingClientRect(); if (shown(wc, r)) wr = r; }
        let nset = 0;
        for (const id of SET) {
            const e = document.getElementById(id);
            if (!e) continue;
            const cs = getComputedStyle(e);
            if (cs.display === 'none') continue;
            const r = e.getBoundingClientRect();
            if (!shown(cs, r)) continue;
            nset++;
            const out = !wr || r.left < wr.left - 2 || r.top < wr.top - 2 || r.right > wr.right + 2 || r.bottom > wr.bottom + 2;
            const nat = alpha(cs.backgroundColor) > 0.01 || (cs.backdropFilter && cs.backdropFilter !== 'none') || parseFloat(cs.borderTopWidth) > 0;
            if (out || nat) rec.push({ t, id, k: (out ? 'out' : '') + (out && nat ? '+' : '') + (nat ? 'native' : ''), rect: R(r), win: wr ? R(wr) : null, cls: e.className.replace(/\s+/g, ' ').trim(), bg: cs.backgroundColor, bf: cs.backdropFilter, op: cs.opacity });
        }
        if (nset > 1) rec.push({ t, id: '(settings)', k: 'overlap', n: nset });
        const ie = document.getElementById(INSP);
        let inspRaw = null;
        if (ie) {
            const cs = getComputedStyle(ie);
            if (cs.display !== 'none') {
                const r = ie.getBoundingClientRect();
                if (shown(cs, r)) inspRaw = { t, id: INSP, ...inspLook(cs, r), cls: ie.className.replace(/\s+/g, ' ').trim(), body: (b.classList.contains('ag2-insp-open') ? 'insp-open ' : '') + (b.classList.contains('ag2-set-open') ? 'set-open' : ''), op: cs.opacity, bf: cs.backdropFilter };
            }
        }
        // full-page blur: large boxes first (cheap), computed style only for those
        const need = innerWidth * innerHeight * 0.6;
        const blur = [];
        // candidates only (a whole-DOM walk per frame overloads the 2-core test host): the drawers,
        // the top-level layers and the shell's own layers
        for (const e of b.querySelectorAll(':scope > *, #top-settings-holder .drawer-content, #sheld, #chat, #form_sheld, #ag2-shell > *, #ag2-layer > *, dialog[open]')) {
            if (e.id === 'ag2-settings' || e.id === INSP) continue; // judged above (sheet / inspector form)
            const r = e.getBoundingClientRect();
            const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0), h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
            if (w <= 0 || h <= 0 || w * h < need) continue;
            const cs = getComputedStyle(e);
            if (!cs.backdropFilter || !/blur\(/.test(cs.backdropFilter) || /blur\(0(px)?\)/.test(cs.backdropFilter)) continue;
            if (!shown(cs, r)) continue;
            blur.push({ t, id: name(e), k: 'blur', rect: R(r), bf: cs.backdropFilter, op: cs.opacity, pre: (() => { const p = document.getElementById('preloader'); if (!p) return null; const c = getComputedStyle(p); const q = p.getBoundingClientRect(); return [c.display, c.opacity, c.backgroundColor, c.zIndex, Math.round(q.width) + 'x' + Math.round(q.height)].join(' '); })(), chatRule: getComputedStyle(document.getElementById('chat')).paddingTop + ' ' + getComputedStyle(b).getPropertyValue('--ag2-read-width'), body: b.className.replace(/\s+/g, ' ').slice(0, 160), sheets: document.styleSheets.length, cls: typeof e.className === 'string' ? e.className.replace(/\s+/g, ' ').trim().slice(0, 80) : '' });
        }
        if (recordAll || rec.length || inspRaw || blur.length) frames.push({ t, rec, insp: inspRaw, blur });
    }
    window.__r1 = {
        start() { frames = []; marks = []; n = 0; nm = 0; maxGap = 0; last = 0; t0 = performance.now(); if (!on) { on = true; requestAnimationFrame(tick); } },
        mark(l) { marks.push([l, Math.round(performance.now() - t0)]); },
        /** The inspector's box and look while it is open and at rest. */
        async setRef() {
            const e = document.getElementById(INSP);
            // at rest: the entry animation must be over (frames are sparse on a loaded host)
            await Promise.race([Promise.all(e.getAnimations().map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 3000))]);
            const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); ref = inspLook(cs, r); return ref;
        },
        getRef: () => ref,
        useRef(r) { ref = r; },
        stop() {
            on = false;
            const res = { frames: n, muts: nm, ms: Math.round(performance.now() - t0), maxGap: Math.round(maxGap), out: 0, native: 0, blur: 0, blurUnderSplash: 0, overlap: 0, inspFrames: 0, bad: [], marks };
            const seen = new Set();
            const push = (x, key) => { if (seen.has(key) || res.bad.length >= 8) return; seen.add(key); res.bad.push(x); };
            for (const f of frames) {
                let o = false, na = false, ov = false;
                for (const x of f.rec) {
                    if (x.k === 'overlap') { ov = true; continue; }
                    if (x.k.includes('out')) o = true;
                    if (x.k.includes('native')) na = true;
                    push(x, x.id + x.k + x.cls);
                }
                if (f.insp) {
                    res.inspFrames++;
                    const i = f.insp;
                    let k = '';
                    if (!ref) k = 'noref';
                    else {
                        const [l, tp, w, h] = i.rect, [rl, rt, rw, rh] = ref.rect;
                        // may slide in from the right (desktop) or from below (phone sheet)
                        const outB = Math.abs(w - rw) > 1 || l < rl - 1 || l > rl + 40 || tp < rt - 1 || (Math.abs(h - rh) > 1 && tp === rt);
                        const natB = i.bg !== ref.bg || i.rad !== ref.rad || i.pos !== ref.pos;
                        k = (outB ? 'out' : '') + (outB && natB ? '+' : '') + (natB ? 'native' : '');
                        if (outB) o = true;
                        if (natB) na = true;
                    }
                    if (k) push({ ...i, k, ref: ref ? ref.rect : null }, i.id + k + i.cls + i.body);
                }
                // under ST's opaque start-up splash (#preloader) nothing of the page is seen: counted apart
                const seenBlur = f.blur.filter(x => !x.pre);
                if (seenBlur.length) { res.blur++; for (const x of seenBlur) push(x, x.id + 'blur'); }
                else if (f.blur.length) { res.blurUnderSplash++; if (!res.splashNote) res.splashNote = f.blur[0]; }
                if (o) res.out++;
                if (na) res.native++;
                if (ov) res.overlap++;
            }
            if (recordAll) res.raw = frames;
            frames = [];
            return res;
        },
    };
    // the first operation is the boot itself (APP_READY alignment)
    window.__r1.start();
}

const state = page => page.evaluate(() => {
    const b = document.body;
    return {
        set: b.classList.contains('ag2-set-open'), page: b.dataset.ag2Set || null, level: document.getElementById('ag2-settings')?.dataset.level || null,
        insp: b.classList.contains('ag2-insp-open'), open: [...document.querySelectorAll('.drawer-content.openDrawer')].map(e => e.id).join(','),
        ag2: b.classList.contains('ag2'), chat: SillyTavern.getContext().getCurrentChatId?.() || null,
        dur: getComputedStyle(document.documentElement).getPropertyValue('--animation-duration').trim(),
    };
});

async function make(T, { phone }) {
    const page = await T.newPage({ phone });
    await page.addInitScript(sampler, FRAMES);
    await T.prepare(page, { ...(MEM ? { theme: 'ag2' } : {}), ...(ST_REDUCED ? { powerUser: { reduced_motion: true } } : {}) });
    const out = { ops: {}, total: { ops: 0, frames: 0, out: 0, native: 0, blur: 0, overlap: 0, badOps: [] } };
    const tagPrefix = (SHOTS ? SHOTS + '-' : '') + (phone ? 'ph-' : 'dk-') + (ST_REDUCED ? 'red-' : '');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const dir = `${T.cfg.shotRoot}/${T.cfg.phase}`;
    mkdirSync(dir, { recursive: true });
    const finish = async (name, extra = {}) => {
        const r = await page.evaluate(() => window.__r1.stop());
        if (FRAMES) writeFileSync(`${dir}/${tagPrefix}${name}-frames.json`, JSON.stringify({ raw: r.raw, marks: r.marks, maxGap: r.maxGap }));
        const s = await state(page);
        out.ops[name] = { frames: r.frames, muts: r.muts, ms: r.ms, maxGap: r.maxGap, out: r.out, native: r.native, blur: r.blur, overlap: r.overlap, insp: r.inspFrames, ...(r.blurUnderSplash ? { blurUnderSplash: r.blurUnderSplash, splashNote: r.splashNote } : {}), after: `${s.set ? 'set:' + s.page + (s.level ? '/' + s.level : '') : '-'} insp:${s.insp ? 1 : 0} open:[${s.open}]`, ...extra, ...(r.bad.length ? { bad: r.bad } : {}) };
        const t = out.total;
        t.ops++; t.frames += r.frames; t.muts = (t.muts || 0) + r.muts; t.out += r.out; t.native += r.native; t.blur += r.blur; t.overlap += r.overlap;
        if (r.out || r.native || r.blur) t.badOps.push(`${name} out=${r.out} native=${r.native} blur=${r.blur}`);
        return r;
    };
    /** One measured operation. shots: delays (ms after the action started) of mid-animation screenshots. */
    const op = async (name, fn, { ms = 900, shots = null } = {}) => {
        await page.evaluate(() => window.__r1.start());
        const pend = [];
        if (SHOTS && shots) for (const d of shots) pend.push(T.sleep(d).then(() => page.screenshot({ path: `${dir}/${tagPrefix}${name}-${d}ms.png`, caret: 'hide' }).catch(() => {})));
        await fn();
        await T.sleep(ms);
        await Promise.all(pend);
        return finish(name);
    };
    return { page, out, op, finish };
}

// ---------------------------------------------------------------- desktop
async function desk(T, keep) {
    const { page, out, op, finish } = await make(T, { phone: false });
    keep.out = out;
    const boot = await T.boot(page, { ag2: true, settle: 2500 });
    out.boot = boot;
    // the first boot is not judged here (no inspector reference yet): boot-insp-open / -closed below are
    await page.evaluate(() => window.__r1.stop());
    // real mouse events at the element's centre; page.click() sometimes hangs in “waiting for
    // scheduled navigations” right after a chat switch
    const click = async sel => {
        const h = await page.waitForSelector(sel, { state: 'visible', timeout: 15000 });
        const r = await h.boundingBox();
        await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    };
    const key = k => page.keyboard.press(k);
    await T.openChat(page, await T.longChat(page), 2);
    out.dur = (await state(page)).dur;
    await click('#ag2-tools [data-act="insp"]'); await T.sleep(900);
    out.inspRef = await page.evaluate(() => window.__r1.setRef());
    await click('#ag2-tools [data-act="insp"]'); await T.sleep(700);

    // --- settings window
    await op('set-open-gear', () => click('#ag2-sidebar [data-act="settings"]'), { shots: [60, 160] });
    for (const p of PAGES) await op('set-go-' + p, () => click(`#ag2-settings .ag2-set-item[data-page="${p}"]`), { shots: ['bg', 'look', 'persona'].includes(p) ? [50, 120, 200] : null });
    for (const p of ['ext', 'user', 'persona', 'wi', 'api']) await op('set-go2-' + p, () => click(`#ag2-settings .ag2-set-item[data-page="${p}"]`));
    await op('set-rapid', async () => { for (const p of ['wi', 'persona', 'look', 'user', 'bg', 'api', 'about', 'persona']) await click(`#ag2-settings .ag2-set-item[data-page="${p}"]`); }, { ms: 3200, shots: [150, 400, 800] });
    await op('set-close-x', () => click('#ag2-settings .ag2-set-close'), { shots: [50, 120, 200] });
    await op('set-open-persona', () => click('#ag2-sidebar [data-act="persona"]'), { shots: [60, 160] });
    await op('set-close-esc', () => key('Escape'), { shots: [50, 120, 200] });
    await op('set-open-conn', () => click('#ag2-sidebar [data-act="conn"]'));
    await op('set-close-dim', () => page.mouse.click(12, 450), { shots: [50, 120] });
    await op('set-open-tools-wi', () => click('#ag2-tools [data-act="wi"]'));
    await op('set-close-x2', () => click('#ag2-settings .ag2-set-close'));
    // open → close before ST's own animation is over
    await op('set-open-close-fast', async () => { await click('#ag2-sidebar [data-act="persona"]'); await T.sleep(60); await key('Escape'); }, { ms: 1200 });
    await op('set-close-open-fast', async () => { await click('#ag2-sidebar [data-act="conn"]'); await T.sleep(500); await key('Escape'); await T.sleep(40); await click('#ag2-sidebar [data-act="persona"]'); }, { ms: 1500 });
    await op('set-close-esc2', () => key('Escape'));

    // --- command palette: “打开 X 设置”
    const pal = async q => { await key('Control+K'); await T.sleep(350); await page.keyboard.type(q); await T.sleep(350); };
    await pal('打开人设设置');
    await op('pal-open-persona', () => key('Enter'), { ms: 1100 });
    await page.evaluate(() => window.__r1.start());
    await pal('打开世界书设置');
    await key('Enter'); await T.sleep(1100);
    await finish('pal-switch-wi-while-open');
    // inspector shortcut while the window is open
    await op('insp-key-while-set', () => key('Control+Period'), { ms: 900 });
    await op('insp-key-while-set-2', () => key('Control+Period'), { ms: 900 });
    await op('set-close-esc3', () => key('Escape'));
    if ((await state(page)).set) await op('set-close-esc3b', () => key('Escape'));
    if ((await state(page)).insp) { await click('#ag2-tools [data-act="insp"]'); await T.sleep(700); }

    // --- inspector
    await op('insp-open-btn', () => click('#ag2-tools [data-act="insp"]'), { shots: [60, 160] });
    await op('insp-close-btn', () => click('#ag2-tools [data-act="insp"]'), { shots: [50, 120, 200] });
    await op('insp-open-key', () => key('Control+Period'));
    await op('insp-close-esc', () => key('Escape'), { shots: [50, 120] });
    await op('insp-open-btn2', () => click('#ag2-tools [data-act="insp"]'));
    await op('insp-close-x', () => click('#right-nav-panel [data-ag2-act="close"]'), { shots: [50, 120] });
    await op('insp-open-key2', () => key('Control+Period'));
    await op('insp-close-key', () => key('Control+Period'));
    await op('insp-toggle-fast', async () => { for (let i = 0; i < 5; i++) { await key('Control+Period'); await T.sleep(50); } }, { ms: 1500 });
    if (!(await state(page)).insp) { await click('#ag2-tools [data-act="insp"]'); await T.sleep(800); }
    // inspector open: other chat, group, welcome, chat again
    const row = text => page.locator('#ag2-sidebar .ag2-chat-row', { hasText: text }).first().click();
    await op('insp-chat-switch', () => row('Mira'), { ms: 2200, shots: [80, 250, 600] });
    const grp = (await T.recent(page)).find(x => x.group);
    await op('insp-to-group', () => page.evaluate(g => { SillyTavern.getContext().openGroupChat(g.group, g.file); }, grp), { ms: 3000, shots: [80, 250, 600] });
    await op('insp-close-chat', () => page.evaluate(() => document.getElementById('option_close_chat').click()), { ms: 2200, shots: [80, 250, 600] });
    await op('insp-from-welcome', () => row('Aldric'), { ms: 2500 });
    // settings over the open inspector, and back
    await op('insp-set-open', () => click('#ag2-sidebar [data-act="settings"]'), { shots: [60, 160] });
    await op('insp-set-go-persona', () => click('#ag2-settings .ag2-set-item[data-page="persona"]'));
    await op('insp-set-close', () => key('Escape'), { shots: [50, 120, 200] });
    await op('insp-close-final', () => click('#ag2-tools [data-act="insp"]'));

    // --- 通用 › 主题: to the classic theme and back (frames without body.ag2 are not judged)
    await op('theme-open-user', async () => { await click('#ag2-sidebar [data-act="settings"]'); await T.sleep(500); await click('#ag2-settings .ag2-set-item[data-page="user"]'); }, { ms: 1200 });
    await op('theme-to-dark', () => page.evaluate(() => { $('#themes').val('Apple Glass Dark').trigger('change'); }), { ms: 3000, shots: [60, 200] });
    out.themeDark = await state(page);
    await op('theme-back-ag2', () => page.evaluate(() => { $('#themes').val('Apple Glass 2').trigger('change'); }), { ms: 4000, shots: [100, 400, 900] });
    out.themeBack = await state(page);
    await op('theme-close', () => key('Escape'));
    if ((await state(page)).set) await op('theme-close-b', () => click('#ag2-settings .ag2-set-close'));

    // --- still works afterwards: every drawer opens again in the window, Esc order unchanged
    const fn = {};
    await click('#ag2-sidebar [data-act="settings"]'); await T.sleep(600);
    for (const p of PAGES) {
        await click(`#ag2-settings .ag2-set-item[data-page="${p}"]`); await T.sleep(600);
        fn[p] = await page.evaluate(async () => {
            const w = document.getElementById('ag2-settings').getBoundingClientRect();
            const d = [...document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer')].filter(e => e.id !== 'right-nav-panel');
            if (!d.length) return 'shell:' + document.body.dataset.ag2Set;
            // headless frames are sparse: let the fade-in end before reading the opacity
            await Promise.race([Promise.all(d[0].getAnimations().map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 3000))]);
            const r = d[0].getBoundingClientRect(); const cs = getComputedStyle(d[0]);
            return `${d[0].id} n=${d.length} in=${r.left >= w.left - 1 && r.right <= w.right + 1 && r.top >= w.top - 1 && r.bottom <= w.bottom + 1 && r.height > 200} vis=${cs.visibility}/${cs.display}/${cs.opacity}`;
        });
    }
    // a click on a control inside the drawer keeps it open
    await click('#ag2-settings .ag2-set-item[data-page="user"]'); await T.sleep(600);
    await page.evaluate(() => { const e = document.querySelector('#user-settings-block input[type="checkbox"]'); e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); e.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
    const box = await page.evaluate(() => { const r = document.getElementById('user-settings-block').getBoundingClientRect(); return [r.left + 60, r.top + 12]; });
    await page.mouse.click(box[0], box[1]); await T.sleep(600);
    fn.clickInside = (await state(page)).open;
    await key('Escape'); await T.sleep(700);
    fn.esc1 = await state(page);
    await click('#ag2-tools [data-act="insp"]'); await T.sleep(800);
    await click('#ag2-sidebar [data-act="settings"]'); await T.sleep(700);
    const seq = [];
    for (let i = 0; i < 3; i++) { await key('Escape'); await T.sleep(700); const s = await state(page); seq.push(`set:${s.set ? 1 : 0} insp:${s.insp ? 1 : 0}`); }
    fn.escOrder = seq;
    out.func = fn;

    // --- boot with the inspector left open (ag2.inspector = open): alignment re-opens it
    await page.evaluate(() => localStorage.setItem('ag2.inspector', '"open"'));
    const ref = await page.evaluate(() => window.__r1.getRef());
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('preloader') && document.body.classList.contains('ag2'), null, { timeout: 120000, polling: 100 });
    await T.sleep(4000);
    await page.evaluate(r => window.__r1.useRef(r), ref);
    await finish('boot-insp-open');
    await page.evaluate(() => localStorage.setItem('ag2.inspector', '"closed"'));
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('preloader') && document.body.classList.contains('ag2'), null, { timeout: 120000, polling: 100 });
    await T.sleep(4000);
    await page.evaluate(r => window.__r1.useRef(r), ref);
    await finish('boot-insp-closed');
    out.errors = T.errors(page).filter(e => !/favicon|ERR_ABORTED|net::ERR_FAILED/.test(e)).slice(0, 8);
    return out;
}

// ---------------------------------------------------------------- phone
async function phone(T, keep) {
    const { page, out, op, finish } = await make(T, { phone: true });
    keep.out = out;
    const boot = await T.boot(page, { ag2: true, settle: 2500 });
    out.boot = boot;
    await finish('boot');
    out.dur = (await state(page)).dur;
    const tap = sel => page.tap(sel);
    const cdp = await page.context().newCDPSession(page);
    const drag = async (x, y, dy, ms = 220) => {
        const pt = yy => [{ x, y: yy, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y) });
        const n = 10;
        for (let i = 1; i <= n; i++) { await T.sleep(ms / n); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y + dy * i / n) }); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const spec = await T.longChat(page);
    const rowSel = `#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`;

    // inspector sheet needs its reference box: open once from a chat
    await tap(rowSel); await T.sleep(2500);
    await tap('#ag2-title .ag2-title-btn'); await T.sleep(1200);
    out.inspRef = await page.evaluate(() => window.__r1.setRef());
    await tap('#right-nav-panel [data-ag2-act="close"]'); await T.sleep(800);

    // --- inspector sheet
    await op('insp-open', () => tap('#ag2-title .ag2-title-btn'), { ms: 1100, shots: [60, 160] });
    await op('insp-close-x', () => tap('#right-nav-panel [data-ag2-act="close"]'), { shots: [50, 120, 200] });
    await op('insp-open2', () => tap('#ag2-title .ag2-title-btn'), { ms: 1100 });
    await op('insp-close-esc', () => page.keyboard.press('Escape'), { shots: [50, 120] });
    await op('insp-open3', () => tap('#ag2-title .ag2-title-btn'), { ms: 1100 });
    // closed again before the sheet's entry animation is over
    await page.keyboard.press('Escape'); await T.sleep(700);
    await op('insp-open-close-fast', async () => { await tap('#ag2-title .ag2-title-btn'); await T.sleep(90); await page.keyboard.press('Escape'); }, { ms: 1100 });
    if ((await state(page)).insp) { await page.keyboard.press('Escape'); await T.sleep(700); }
    out.afterInsp = await state(page);
    if (await page.evaluate(() => document.body.dataset.ag2Ph !== 'list')) { await tap('#ag2-ph-back').catch(() => {}); await T.sleep(900); }

    // --- settings sheet: list → page → list for all ten pages
    await op('set-open', () => tap('#ag2-tabbar [data-tab="settings"]'), { ms: 1000, shots: [60, 160] });
    for (const p of PAGES) {
        const sh = ['api', 'persona', 'user'].includes(p);
        await op('set-in-' + p, () => tap(`#ag2-settings .ag2-set-item[data-page="${p}"]`), { shots: sh ? [60, 160] : null });
        await op('set-back-' + p, () => tap('#ag2-settings .ag2-set-back'), { shots: sh ? [40, 100, 180, 260] : null });
    }
    // fast: into a page and back before ST's animation is over, then into another one
    await op('set-in-back-fast', async () => { await tap('#ag2-settings .ag2-set-item[data-page="wi"]'); await T.sleep(80); await tap('#ag2-settings .ag2-set-back'); await T.sleep(60); await tap('#ag2-settings .ag2-set-item[data-page="persona"]'); }, { ms: 1800 });
    out.afterFast = await state(page);
    if ((await state(page)).level === 'page') await op('set-back-after-fast', () => tap('#ag2-settings .ag2-set-back'));
    // 完成 (list level), Esc from a page, drag down from a page / from the list
    await op('set-done', () => tap('#ag2-settings .ag2-set-done'), { shots: [50, 120, 200] });
    await op('set-open2', () => tap('#ag2-tabbar [data-tab="settings"]'), { ms: 1000 });
    await op('set-in-api2', () => tap('#ag2-settings .ag2-set-item[data-page="api"]'));
    await op('set-esc-page', () => page.keyboard.press('Escape'), { shots: [50, 120, 200] });
    if ((await state(page)).set) await op('set-esc-list', () => page.keyboard.press('Escape'));
    await op('set-open3', () => tap('#ag2-tabbar [data-tab="settings"]'), { ms: 1000 });
    await op('set-in-persona3', () => tap('#ag2-settings .ag2-set-item[data-page="persona"]'));
    const head = await page.evaluate(() => { const r = document.querySelector('#ag2-settings .ag2-set-grab').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; });
    out.grab = head;
    await op('set-drag-page', () => drag(head[0], head[1], 320), { ms: 1200, shots: [120, 260, 340, 420] });
    out.afterDragPage = await state(page);
    if ((await state(page)).set) { await page.keyboard.press('Escape'); await T.sleep(600); await page.keyboard.press('Escape'); await T.sleep(600); }
    await op('set-open4', () => tap('#ag2-tabbar [data-tab="settings"]'), { ms: 1000 });
    await op('set-drag-list', () => drag(head[0], head[1], 320), { ms: 1200, shots: [260, 340] });
    out.afterDragList = await state(page);
    if ((await state(page)).set) { await page.keyboard.press('Escape'); await T.sleep(600); }
    // a short drag that does not dismiss
    await op('set-open5', () => tap('#ag2-tabbar [data-tab="settings"]'), { ms: 1000 });
    await op('set-in-user5', () => tap('#ag2-settings .ag2-set-item[data-page="user"]'));
    await op('set-drag-short', () => drag(head[0], head[1], 30, 400), { ms: 900 });
    out.afterDragShort = await state(page);
    // 通用 › 主题 round trip on the phone
    await op('theme-to-dark', () => page.evaluate(() => { $('#themes').val('Apple Glass Dark').trigger('change'); }), { ms: 3000 });
    await op('theme-back-ag2', () => page.evaluate(() => { $('#themes').val('Apple Glass 2').trigger('change'); }), { ms: 4000, shots: [100, 400, 900] });
    out.themeBack = await state(page);
    for (let i = 0; i < 2 && (await state(page)).set; i++) await op('theme-close-' + i, () => page.keyboard.press('Escape'));

    // --- still works: each page opens again inside the sheet
    const fn = {};
    if (await page.evaluate(() => document.body.dataset.ag2Ph !== 'list')) { await tap('#ag2-ph-back').catch(() => {}); await T.sleep(900); }
    await tap('#ag2-tabbar [data-tab="settings"]'); await T.sleep(900);
    for (const p of PAGES) {
        await tap(`#ag2-settings .ag2-set-item[data-page="${p}"]`); await T.sleep(700);
        fn[p] = await page.evaluate(async () => {
            const w = document.getElementById('ag2-settings').getBoundingClientRect();
            const d = [...document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer')].filter(e => e.id !== 'right-nav-panel');
            if (!d.length) return 'shell:' + document.body.dataset.ag2Set;
            // headless frames are sparse: let the fade-in end before reading the opacity
            await Promise.race([Promise.all(d[0].getAnimations().map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 3000))]);
            const r = d[0].getBoundingClientRect(); const cs = getComputedStyle(d[0]);
            return `${d[0].id} n=${d.length} in=${r.left >= w.left - 1 && r.right <= w.right + 1 && r.top >= w.top - 1 && r.bottom <= w.bottom + 1 && r.height > 200} vis=${cs.visibility}/${cs.display}/${cs.opacity}`;
        });
        await tap('#ag2-settings .ag2-set-back'); await T.sleep(600);
    }
    await tap('#ag2-settings .ag2-set-done'); await T.sleep(700);
    fn.end = await state(page);
    out.func = fn;
    out.errors = T.errors(page).filter(e => !/favicon|ERR_ABORTED|net::ERR_FAILED/.test(e)).slice(0, 8);
    return out;
}

// ---------------------------------------------------------------- boot only (start-up alignment)
async function bootOnly(T, keep) {
    const { page, out, finish } = await make(T, { phone: !!T.cfg.phone });
    keep.out = out;
    out.boot = await T.boot(page, { ag2: true, settle: 3500 });
    await finish('boot');
    return out;
}

// ---------------------------------------------------------------- cycle: ST's drawer state machine still works
// Every drawer is opened / closed ROUNDS times through the shell (→ doNavbarIconClick); each time
// it must be shown inside the window when open and be display:none when closed. Then the same
// drawers are driven with ST's own toggles under the classic theme (?classic and after switching
// to Apple Glass Dark): the R1 rules must not apply there (ST's closing transition is back).
async function cycle(T, keep) {
    const phoneMode = !!T.cfg.phone;
    const { page, out } = await make(T, { phone: phoneMode });
    keep.out = out;
    await T.boot(page, { ag2: true, settle: 2500 });
    const ST_PAGES = ['api', 'ai', 'fmt', 'wi', 'persona', 'bg', 'user', 'ext'];
    const ROUNDS = 4;
    const act = sel => (phoneMode ? page.tap(sel) : page.click(sel));
    const snap = () => page.evaluate(async () => {
        const ids = ['rm_api_block', 'left-nav-panel', 'AdvancedFormatting', 'WorldInfo', 'PersonaManagement', 'Backgrounds', 'user-settings-block', 'rm_extensions_block', 'right-nav-panel'];
        const win = document.getElementById('ag2-settings');
        const w = win && !win.hidden ? win.getBoundingClientRect() : null;
        const open = [], leak = [];
        for (const id of ids) {
            const e = document.getElementById(id); const cs = getComputedStyle(e);
            if (e.classList.contains('openDrawer')) {
                await Promise.race([Promise.all(e.getAnimations().map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 2000))]);
                const r = e.getBoundingClientRect(); const c2 = getComputedStyle(e);
                const inside = !!w && r.left >= w.left - 1 && r.right <= w.right + 1 && r.top >= w.top - 1 && r.bottom <= w.bottom + 1 && r.height > 200;
                open.push(`${id}:${id === 'right-nav-panel' ? 'insp' : inside ? 'in' : 'OUT'}:${c2.display}/${c2.visibility}/${c2.opacity}`);
            } else if (cs.display !== 'none') leak.push(`${id}:${cs.display}`);
        }
        return { open, leak, icons: document.querySelectorAll('#top-settings-holder .openIcon').length };
    });
    const bad = [];
    let n = 0;
    await act(phoneMode ? '#ag2-tabbar [data-tab="settings"]' : '#ag2-sidebar [data-act="settings"]'); await T.sleep(700);
    for (let r = 0; r < ROUNDS; r++) {
        for (const p of ST_PAGES) {
            await act(`#ag2-settings .ag2-set-item[data-page="${p}"]`); await T.sleep(r % 2 ? 120 : 420); // odd rounds: before ST's wait is over
            if (r % 2) await T.sleep(500);
            const a = await snap(); n++;
            if (a.open.length !== 1 || !a.open[0].includes(':in:') || !/\/visible\/1$/.test(a.open[0]) || a.leak.length || a.icons !== 1) bad.push({ r, p, at: 'open', ...a });
            if (phoneMode) {
                await act('#ag2-settings .ag2-set-back'); await T.sleep(450);
                const c = await snap(); n++;
                if (c.open.length || c.leak.length || c.icons) bad.push({ r, p, at: 'back', ...c });
            }
        }
        // close the window from a drawer page and open it again
        if (phoneMode) await act('#ag2-settings .ag2-set-item[data-page="api"]'), await T.sleep(450);
        await page.keyboard.press('Escape'); await T.sleep(450);
        if (phoneMode && await page.evaluate(() => document.body.classList.contains('ag2-set-open'))) { await page.keyboard.press('Escape'); await T.sleep(450); }
        const c = await snap(); n++;
        if (c.open.length || c.leak.length || c.icons) bad.push({ r, at: 'closed', ...c });
        await act(phoneMode ? '#ag2-tabbar [data-tab="settings"]' : '#ag2-sidebar [data-act="settings"]'); await T.sleep(600);
    }
    await page.keyboard.press('Escape'); await T.sleep(500);
    if (await page.evaluate(() => document.body.classList.contains('ag2-set-open'))) { await page.keyboard.press('Escape'); await T.sleep(500); }
    out.cycle = { rounds: ROUNDS, checks: n, bad: bad.slice(0, 6), badCount: bad.length };
    // inspector: toggled through the shell API path (ST's handler), desktop only
    if (!phoneMode) {
        await T.openChat(page, await T.longChat(page), 2);
        const ib = [];
        for (let i = 0; i < 8; i++) {
            await page.click('#ag2-tools [data-act="insp"]'); await T.sleep(i % 2 ? 150 : 500); if (i % 2) await T.sleep(450);
            const a = await snap();
            const want = i % 2 === 0;
            if ((a.open.length === 1) !== want || a.leak.length) ib.push({ i, ...a });
        }
        out.cycle.inspBad = ib;
    }
    // classic theme: ST's own drawers, ST's own closing transition (the R1 rules must not apply)
    const classic = async label => {
        const res = await page.evaluate(async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms));
            const d = document.getElementById('PersonaManagement');
            const t = d.closest('.drawer').querySelector(':scope > .drawer-toggle');
            const o = {};
            t.click(); await wait(700);
            let cs = getComputedStyle(d);
            o.open = `${d.classList.contains('openDrawer')} ${cs.display}/${cs.visibility} h=${Math.round(d.getBoundingClientRect().height)}`;
            t.click(); await wait(30);
            cs = getComputedStyle(d);
            o.closing = `${d.classList.contains('closedDrawer')} display=${cs.display} transition=${cs.transitionProperty}`;
            await wait(900);
            o.closed = getComputedStyle(d).display;
            t.click(); await wait(700);
            o.reopen = `${d.classList.contains('openDrawer')} ${getComputedStyle(d).display}`;
            t.click(); await wait(700);
            o.body = [...document.body.classList].filter(c => c.startsWith('ag2')).join(' ') || '-';
            o.shell = !!document.getElementById('ag2-shell');
            return o;
        });
        out[label] = res;
    };
    await page.evaluate(() => { $('#themes').val('Apple Glass Dark').trigger('change'); }); await T.sleep(3000);
    await classic('darkTheme');
    await page.evaluate(() => { $('#themes').val('Apple Glass 2').trigger('change'); }); await T.sleep(3500);
    out.backAg2 = await page.evaluate(() => ({ ag2: document.body.classList.contains('ag2'), set: document.body.classList.contains('ag2-set-open'), open: [...document.querySelectorAll('.drawer-content.openDrawer')].map(e => e.id).join(',') }));
    // ?classic boot
    const p2 = await T.newPage({ phone: phoneMode });
    await T.prepare(p2, {});
    await T.boot(p2, { query: '?classic', settle: 3000 });
    const keepPage = page;
    // With a query string ST's start-up can stall behind #preloader in this harness (run.mjs boot
    // note; same on Apple Glass Dark), so its click handlers are not relied on here: the classes
    // are flipped by hand, which is all the CSS sees. The AG2 theme CSS IS loaded (active theme),
    // only body.ag2 is missing — the R1 rules must not match.
    out.classicBoot = await p2.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const d = document.getElementById('PersonaManagement');
        const o = { body: [...document.body.classList].filter(c => c.startsWith('ag2')).join(' ') || '-', shell: !!document.getElementById('ag2-shell'), theme: SillyTavern.getContext().powerUserSettings.theme };
        // direct: nothing matches the R1 selectors without body.ag2
        const ids = '#rm_api_block, #left-nav-panel, #AdvancedFormatting, #WorldInfo, #PersonaManagement, #Backgrounds, #user-settings-block, #rm_extensions_block';
        o.r1Matches = document.querySelectorAll(`html body.ag2 :is(${ids}, #right-nav-panel):not(.openDrawer), html body.ag2:not(.ag2-set-open) :is(${ids}).openDrawer, html body.ag2:not(.ag2-insp-open) #right-nav-panel`).length;
        o.preloader = !!document.getElementById('preloader');
        d.classList.replace('closedDrawer', 'openDrawer'); await wait(700);
        let cs = getComputedStyle(d); const r = d.getBoundingClientRect();
        o.open = `${cs.display}/${cs.visibility} pos=${cs.position} top=${Math.round(r.top)} h=${Math.round(r.height)}`;
        d.classList.replace('openDrawer', 'closedDrawer'); await wait(30);
        cs = getComputedStyle(d);
        o.closing = `display=${cs.display} transition=${cs.transitionProperty}`; // ST's own closing transition still runs
        await wait(900);
        o.closed = getComputedStyle(d).display;
        return o;
    });
    void keepPage;
    if (out.cycle.badCount || (out.cycle.inspBad || []).length) process.exitCode = 1;
    return out;
}

export default async function (T) {
    const box = {};
    let out;
    try { out = await (part === 'cycle' ? cycle(T, box) : part === 'boot' ? bootOnly(T, box) : part === 'phone' ? phone(T, box) : desk(T, box)); }
    catch (e) { out = box.out || { ops: {}, total: { out: 0, native: 0, blur: 0 } }; out.error = String(e && e.message || e).slice(0, 1600); process.exitCode = 1; }
    out.variant = { part, stReduced: ST_REDUCED, osReduced: !!T.cfg.reduced, shots: SHOTS || null, mem: MEM };
    const bad = out.total.out + out.total.native + out.total.blur;
    out.verdict = bad || out.error || process.exitCode ? 'FAIL' : 'PASS';
    if (bad) process.exitCode = 1;
    return out;
}
