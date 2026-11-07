// tools/perf-lib.js — measurement helpers for the Apple Glass theme audits.
//
// This file is a FUNCTION BODY, not a module. It is concatenated into the code
// passed to Playwright's browser_run_code_unsafe, which provides `page`:
//
//   const lib = await (await fetch('http://127.0.0.1:8799/perf-lib.js')).text();
//   const code = `async (page) => { const CFG = ${JSON.stringify(cfg)}; ${lib}\n${body} }`;
//   await tools.playwright.browser_run_code_unsafe({ code });
//
// CFG: { base, w, h, mobile, dpr, cpu, stripTheme, blockExt: [substr...], css }
// All writes (settings / chat / character saves) are stubbed, so measurements
// can never change the data copy they run against.

const BASE = CFG.base || 'http://127.0.0.1:8123/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = (n, d = 1) => (typeof n === 'number' && isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : n);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const OVERRIDE = 'html body:not(#_):not(#__):not(#___)';

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
let browserCdp = null;
try { browserCdp = await page.context().browser()?.newBrowserCDPSession(); } catch { /* persistent context */ }

const H = {
    // Persist a partial result (tools/perf/sink.py on :8798), so a long run that
    // dies half-way still leaves its finished stages behind.
    async save(stage, obj) {
        const rec = { run: CFG.run || 'adhoc', stage, t: new Date().toISOString(), cfg: { w: CFG.w, h: CFG.h, cpu: CFG.cpu, mobile: !!CFG.mobile, css: CFG.cssUrl || (CFG.stripTheme ? 'none' : 'deployed'), ext: CFG.extUrl || 'deployed' }, data: obj };
        try { await fetch('http://127.0.0.1:8798/' + (CFG.sink || 'perf'), { method: 'POST', body: JSON.stringify(rec) }); } catch { /* sink down */ }
        return obj;
    },

    async setup() {
        const w = CFG.w || 1440, h = CFG.h || 900;
        await page.setViewportSize({ width: w, height: h });
        if (CFG.mobile) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: CFG.dpr || 2, mobile: true });
            await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
            await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }).catch(() => {});
        }
        if (CFG.cpu && CFG.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CFG.cpu });
        const ok = route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        for (const p of ['**/api/settings/save', '**/api/chats/save', '**/api/chats/group/save', '**/api/characters/edit', '**/api/characters/edit-attribute', '**/api/characters/merge-attributes', '**/api/themes/save']) {
            await page.route(p, ok);
        }
        // Theme CSS variant: '' (stripTheme) or the text of CFG.cssUrl replaces the
        // Apple Glass Dark custom_css in the settings response only (nothing on disk).
        let themeCss = null;
        if (CFG.stripTheme) themeCss = '';
        else if (CFG.cssUrl) themeCss = await (await fetch(CFG.cssUrl)).text();
        const pu = CFG.powerUser || null; // e.g. { reduced_motion: true }
        if (themeCss !== null || pu) {
            await page.route('**/api/settings/get', async route => {
                const res = await route.fetch();
                const j = await res.json();
                const s = JSON.parse(j.settings);
                if (themeCss !== null) {
                    s.power_user.custom_css = themeCss;
                    for (const t of j.themes || []) if (t.name === 'Apple Glass Dark') t.custom_css = themeCss;
                }
                if (pu) Object.assign(s.power_user, pu);
                j.settings = JSON.stringify(s);
                await route.fulfill({ response: res, body: JSON.stringify(j) });
            });
        }
        // Extension variant: serve CFG.extUrl instead of the Apple Glass index.js.
        if (CFG.extUrl) {
            const js = await (await fetch(CFG.extUrl)).text();
            await page.route('**/third-party/SillyTavern-AppleGlassStyles/index.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: js }));
        }
        for (const sub of CFG.blockExt || []) {
            await page.route(`**/${sub}`, route => route.abort());
        }
        await page.addInitScript(() => {
            if (window.top !== window) return;
            const desc = el => {
                if (!el || el.nodeType !== 1) return '?';
                const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
                return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : '');
            };
            const P = window.__p = { lt: [], ls: [], tr: [], an: [], desc };
            try {
                new PerformanceObserver(l => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
                new PerformanceObserver(l => {
                    for (const e of l.getEntries()) {
                        if (e.hadRecentInput) continue;
                        P.ls.push({ t: Math.round(e.startTime), v: Math.round(e.value * 10000) / 10000, s: (e.sources || []).slice(0, 3).map(x => desc(x.node)) });
                    }
                }).observe({ type: 'layout-shift', buffered: true });
            } catch { /* unsupported */ }
            addEventListener('transitionrun', e => P.tr.push(e.propertyName + (e.pseudoElement || '') + ' @' + desc(e.target) + ' ' + Math.round(e.elapsedTime)), true);
            addEventListener('animationstart', e => P.an.push(e.animationName + (e.pseudoElement || '') + ' @' + desc(e.target)), true);
            P.frames = null;
            P.startFrames = () => {
                const f = { last: 0, gaps: [], run: true };
                P.frames = f;
                const tick = t => {
                    if (!f.run) return;
                    if (f.last) f.gaps.push(t - f.last);
                    f.last = t;
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            };
            P.stopFrames = () => {
                const f = P.frames;
                if (!f) return null;
                f.run = false;
                const g = f.gaps, n = g.length, s = [...g].sort((a, b) => a - b), sum = g.reduce((a, b) => a + b, 0);
                return { n, avg: n ? sum / n : 0, p50: n ? s[Math.floor(n * 0.5)] : 0, p95: n ? s[Math.floor(n * 0.95)] : 0, max: n ? s[n - 1] : 0, over34: g.filter(x => x > 34).length, over50: g.filter(x => x > 50).length, totalMs: sum };
            };
        });
    },

    async metrics() {
        const { metrics } = await cdp.send('Performance.getMetrics');
        const o = {}; for (const m of metrics) o[m.name] = m.value;
        return o;
    },

    diff(a, b) {
        return {
            layouts: b.LayoutCount - a.LayoutCount,
            recalcs: b.RecalcStyleCount - a.RecalcStyleCount,
            layoutMs: R((b.LayoutDuration - a.LayoutDuration) * 1000),
            recalcMs: R((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000),
            scriptMs: R((b.ScriptDuration - a.ScriptDuration) * 1000),
            taskMs: R((b.TaskDuration - a.TaskDuration) * 1000),
        };
    },

    // Whole-browser CPU time (browser + renderer + GPU/viz), which is the only
    // place software-composited blur cost shows up. Null if unavailable.
    async cpu() {
        if (!browserCdp) return null;
        const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo');
        const o = { total: 0 };
        for (const p of processInfo) { o[p.type] = (o[p.type] || 0) + p.cpuTime; o.total += p.cpuTime; }
        return o;
    },
    cpuDiff(a, b) {
        if (!a || !b) return null;
        const o = {};
        for (const k of Object.keys(b)) o[k] = R(((b[k] || 0) - (a[k] || 0)) * 1000);
        return o;
    },

    ev: (f, arg) => page.evaluate(f, arg),

    // --- booting ---------------------------------------------------------
    async boot() {
        const t0 = Date.now();
        await page.goto(BASE, { waitUntil: 'commit', timeout: 120000 });
        await page.waitForFunction(() => !document.getElementById('preloader') && document.querySelectorAll('#rm_print_characters_block .character_select').length > 0 && !!window.SillyTavern?.getContext, null, { timeout: 120000, polling: 100 });
        const ready = Date.now() - t0;
        await sleep(CFG.settle ?? 9000);
        return { readyMs: ready };
    },

    async openChar(name = 'Seraphina') {
        await H.ev(n => { [...document.querySelectorAll('#rm_print_characters_block .character_select')].find(e => e.textContent.includes(n)).click(); }, name);
        await page.waitForFunction(() => document.querySelectorAll('#chat .mes').length > 3, null, { timeout: 60000, polling: 100 });
        await sleep(CFG.settleChat ?? 5000);
        await H.closeRail();
    },

    async openLong() {
        await H.ev(() => SillyTavern.getContext().openCharacterChat('perf-long'));
        await page.waitForFunction(() => document.querySelectorAll('#chat .mes').length >= 90, null, { timeout: 60000, polling: 100 });
        await sleep(CFG.settleChat ?? 5000);
        await H.closeRail();
    },

    async closeRail() {
        await H.ev(() => { const p = document.querySelector('#right-nav-panel'); if (p.classList.contains('openDrawer')) document.querySelector('#rightNavHolder .drawer-toggle').click(); });
        await sleep(600);
    },

    async setCss(css) {
        await H.ev(c => {
            let s = document.getElementById('perf-override');
            if (!s) { s = document.createElement('style'); s.id = 'perf-override'; document.head.appendChild(s); }
            s.textContent = c || '';
        }, css);
        await sleep(350);
    },

    async setStyle(v) {
        await H.ev(x => { $('#chat_display').val(String(x)).trigger('change'); }, v);
        await sleep(500);
    },

    resetLogs: () => H.ev(() => { const P = window.__p; P.lt.length = 0; P.ls.length = 0; P.tr.length = 0; P.an.length = 0; }),
    logs: () => H.ev(() => {
        const P = window.__p, cnt = a => { const m = {}; for (const x of a) m[x] = (m[x] || 0) + 1; return Object.entries(m).sort((x, y) => y[1] - x[1]); };
        return { longtasks: P.lt.length, longMs: P.lt.reduce((s, x) => s + x[1], 0), cls: Math.round(P.ls.reduce((s, x) => s + x.v, 0) * 10000) / 10000, shifts: P.ls.slice(0, 6), transitions: cnt(P.tr.map(x => x.replace(/ \d+$/, ''))).slice(0, 30), trTotal: P.tr.length, animations: cnt(P.an).slice(0, 30), anTotal: P.an.length };
    }),

    // --- scrolling -------------------------------------------------------
    async scrollRun({ distance = 6000, speed = 1500 } = {}) {
        await H.ev(() => { document.querySelector('#chat').scrollTop = 0; });
        await sleep(500);
        const box = await H.ev(() => { const r = document.querySelector('#chat').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, sh: document.querySelector('#chat').scrollHeight, ch: document.querySelector('#chat').clientHeight }; });
        const d = Math.min(distance, box.sh - box.ch - 10);
        await H.ev(() => window.__p.startFrames());
        const m0 = await H.metrics(), c0 = await H.cpu(), t0 = Date.now();
        if (CFG.mobile) {
            // synthesizeScrollGesture(touch) does not scroll under mobile emulation;
            // drive real touch events instead (finger moves up => content scrolls down).
            const steps = Math.max(10, Math.round(d / speed * 60)), seg = 500, perSeg = Math.max(4, Math.round(steps * seg / d));
            let left = d;
            while (left > 0) {
                const dy = Math.min(seg, left);
                const y0 = Math.round(box.y + 250), n = Math.max(3, Math.round(perSeg * dy / seg));
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(box.x), y: y0 }] });
                for (let i = 1; i <= n; i++) {
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(box.x), y: Math.round(y0 - dy * i / n) }] });
                    await sleep(16);
                }
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                left -= dy;
            }
            await sleep(200);
        } else {
            await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(box.x), y: Math.round(box.y), yDistance: -Math.round(d), speed, gestureSourceType: 'mouse', preventFling: true });
        }
        const ms = Date.now() - t0, m1 = await H.metrics(), c1 = await H.cpu();
        const fr = await H.ev(() => window.__p.stopFrames());
        const pos = await H.ev(() => Math.round(document.querySelector('#chat').scrollTop));
        return { ms, reached: pos, want: Math.round(d), frames: fr.n, avg: R(fr.avg), p95: R(fr.p95), max: R(fr.max), over34: fr.over34, over50: fr.over50, ...H.diff(m0, m1), cpu: H.cpuDiff(c0, c1) };
    },

    // Deterministic scroll: an in-page rAF loop advances #chat by `px` per frame.
    // Works identically under mobile emulation; frame gaps grow when the
    // compositor (blur / masks / layers) cannot keep up.
    async rafScroll({ px = 40, frames = 90, start = 0 } = {}) {
        await H.ev(s => { document.querySelector('#chat').scrollTop = s; }, start);
        await sleep(400);
        const m0 = await H.metrics(), c0 = await H.cpu(), t0 = Date.now();
        const fr = await H.ev(({ px, frames }) => new Promise(resolve => {
            const c = document.querySelector('#chat'), gaps = [];
            let last = 0, n = 0;
            const tick = t => {
                if (last) gaps.push(t - last);
                last = t;
                c.scrollTop += px;
                if (++n < frames) requestAnimationFrame(tick);
                else {
                    const s = [...gaps].sort((a, b) => a - b), sum = gaps.reduce((a, b) => a + b, 0);
                    resolve({ n: gaps.length, avg: sum / gaps.length, p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], over34: gaps.filter(x => x > 34).length, over50: gaps.filter(x => x > 50).length, top: c.scrollTop });
                }
            };
            requestAnimationFrame(tick);
        }), { px, frames });
        const ms = Date.now() - t0, m1 = await H.metrics(), c1 = await H.cpu();
        return { ms, frames: fr.n, avg: R(fr.avg), p50: R(fr.p50), p95: R(fr.p95), max: R(fr.max), over34: fr.over34, over50: fr.over50, reached: Math.round(fr.top), want: start + px * frames, ...H.diff(m0, m1), cpu: H.cpuDiff(c0, c1) };
    },

    // A/B the same scroll across CSS variants, interleaved to cancel drift.
    async abScroll(variants, { rounds = 3, distance = 6000, speed = 1500, mode = 'gesture', px = 40, frames = 90 } = {}) {
        const names = Object.keys(variants), out = {};
        for (const n of names) out[n] = [];
        for (let r = 0; r < rounds; r++) {
            for (const n of names) {
                await H.setCss(variants[n]);
                out[n].push(mode === 'raf' ? await H.rafScroll({ px, frames }) : await H.scrollRun({ distance, speed }));
            }
        }
        await H.setCss('');
        const pick = (runs, k) => R(median(runs.map(x => x[k])));
        const sum = {};
        for (const n of names) {
            const rs = out[n];
            sum[n] = {
                ms: pick(rs, 'ms'), frames: pick(rs, 'frames'), avg: pick(rs, 'avg'), p95: pick(rs, 'p95'), max: pick(rs, 'max'), over34: pick(rs, 'over34'), over50: pick(rs, 'over50'),
                taskMs: pick(rs, 'taskMs'), recalcMs: pick(rs, 'recalcMs'), layoutMs: pick(rs, 'layoutMs'), scriptMs: pick(rs, 'scriptMs'),
                cpuTotal: rs[0].cpu ? R(median(rs.map(x => x.cpu.total))) : null,
                cpuGpu: rs[0].cpu ? R(median(rs.map(x => x.cpu.GPU ?? x.cpu.gpu ?? 0))) : null,
                cpuRenderer: rs[0].cpu ? R(median(rs.map(x => x.cpu.renderer ?? 0))) : null,
                reachedOk: rs.every(x => Math.abs(x.reached - x.want) < 120),
                cpuWall: rs[0].cpu ? R(median(rs.map(x => x.cpu.total / (x.ms || 1) * 100))) : null,
            };
        }
        return sum;
    },

    // Open + close one drawer with no sampler attached: frame gaps and layout work.
    async drawerCost(id, { openWait = 700, closeWait = 600 } = {}) {
        const click = () => H.ev(i => document.querySelector('#' + i + ' > .drawer-toggle').click(), id);
        const one = async wait => {
            await H.ev(() => window.__p.startFrames());
            const m0 = await H.metrics(), c0 = await H.cpu();
            await click();
            await sleep(wait);
            const m1 = await H.metrics(), c1 = await H.cpu();
            const f = await H.ev(() => window.__p.stopFrames());
            return { ...H.diff(m0, m1), frames: f.n, avg: R(f.avg), max: R(f.max), over50: f.over50, cpu: c0 ? H.cpuDiff(c0, c1).total : null };
        };
        const open = await one(openWait), close = await one(closeWait);
        await sleep(200);
        return { open, close };
    },

    // Simulates streaming: rewrites the last message's text at a fixed rate, the
    // way SillyTavern re-renders a streaming message (same DOM churn, no API).
    async stream({ hz = 15, seconds = 4 } = {}) {
        await H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; });
        await sleep(300);
        const m0 = await H.metrics(), c0 = await H.cpu();
        const r = await H.ev(({ hz, seconds }) => new Promise(resolve => {
            const ctx = SillyTavern.getContext();
            const msg = ctx.chat.filter(m => m.mes && m.mes.length > 800 && !m.mes.includes('<option')).at(-1) || ctx.chat.at(-1);
            const el = document.querySelector('#chat .mes.last_mes .mes_text');
            const saved = el.innerHTML, full = msg.mes.replace(/<[^>]+>/g, '');
            const total = Math.round(hz * seconds);
            const gaps = []; let last = 0, run = true;
            const tick = t => { if (!run) return; if (last) gaps.push(t - last); last = t; requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
            let i = 0;
            const iv = setInterval(() => {
                i++;
                const shown = full.slice(0, Math.round(full.length * i / total));
                el.innerHTML = shown.split('\n').filter(Boolean).map(x => '<p>' + x + '</p>').join('');
                document.querySelector('#chat').scrollTop = 1e6;
                if (i >= total) {
                    clearInterval(iv); run = false;
                    el.innerHTML = saved;
                    const n = gaps.length, sum = gaps.reduce((a, b) => a + b, 0);
                    resolve({ ticks: total, frames: n, avg: sum / n, over50: gaps.filter(x => x > 50).length, max: Math.max(...gaps) });
                }
            }, 1000 / hz);
        }), { hz, seconds });
        const m1 = await H.metrics(), c1 = await H.cpu();
        return { ...r, avg: R(r.avg), max: R(r.max), ...H.diff(m0, m1), cpu: H.cpuDiff(c0, c1) };
    },

    // CPU profile of an action, self time grouped by script. Reports each extension
    // (including third-party ones) separately, without touching their source.
    async profile(action, { interval = 500 } = {}) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval });
        await cdp.send('Profiler.start');
        await action();
        const { profile } = await cdp.send('Profiler.stop');
        await cdp.send('Profiler.disable');
        const dt = profile.timeDeltas || [], self = {};
        const byId = new Map(profile.nodes.map(n => [n.id, n]));
        (profile.samples || []).forEach((id, i) => { self[id] = (self[id] || 0) + (dt[i] || 0); });
        const groups = {}, fns = {};
        for (const [id, us] of Object.entries(self)) {
            const n = byId.get(Number(id)), cf = n.callFrame, u = cf.url || '';
            let g = cf.functionName === '(idle)' ? '(idle)' : cf.functionName === '(program)' ? '(program)' : cf.functionName === '(garbage collector)' ? '(gc)' : '';
            if (!g) {
                const m = u.match(/third-party\/([^/]+)/);
                g = m ? m[1] : u.includes('/lib/') || u.includes('lib.js') ? 'lib' : u.includes('/scripts/') || u.includes('script.js') ? 'ST-core' : u ? 'other' : '(native)';
            }
            groups[g] = (groups[g] || 0) + us;
            if (g === 'SillyTavern-AppleGlassStyles') fns[cf.functionName || 'anon'] = (fns[cf.functionName || 'anon'] || 0) + us;
        }
        const ms = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, R(v / 1000)]));
        return { groups: ms(groups), appleFns: ms(fns) };
    },

    async layers() {
        const res = await new Promise(async resolve => {
            let done = false;
            const fin = async p => {
                if (done) return; done = true;
                cdp.off('LayerTree.layerTreeDidChange', fin);
                resolve(p);
            };
            cdp.on('LayerTree.layerTreeDidChange', fin);
            await cdp.send('LayerTree.enable');
            setTimeout(() => fin({}), 3000);
        });
        await cdp.send('LayerTree.disable').catch(() => {});
        const ls = res.layers || [];
        const area = ls.reduce((s, l) => s + (l.drawsContent ? l.width * l.height : 0), 0);
        return { layers: ls.length, drawing: ls.filter(l => l.drawsContent).length, mpx: R(area / 1e6, 2) };
    },

    // Elements with a live backdrop-filter, how many are on screen and how much
    // of the viewport they cover.
    blurStats: () => H.ev(() => {
        const vw = innerWidth, vh = innerHeight;
        let all = 0, vis = 0, area = 0; const by = {};
        for (const e of document.querySelectorAll('body *')) {
            const c = getComputedStyle(e), f = c.backdropFilter;
            if (!f || f === 'none') continue;
            all++;
            const r = e.getBoundingClientRect();
            const w = Math.min(r.right, vw) - Math.max(r.left, 0), h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
            if (w > 0 && h > 0 && c.visibility !== 'hidden') {
                vis++; area += w * h;
                const k = (e.id ? '#' + e.id : (typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : e.tagName)) + ' ' + f.slice(0, 44);
                by[k] = (by[k] || 0) + Math.round(w * h);
            }
        }
        return { all, vis, areaPct: Math.round(area / (vw * vh) * 100), by };
    }),

    // Computed transitions on every live element: finds `all` and layout-driving
    // properties regardless of which stylesheet declared them.
    inventory: () => H.ev(() => {
        const LAYOUT = /^(all|width|height|min-|max-|top|left|right|bottom|margin|padding|inset|flex|grid|gap|font-size|line-height|border-width|letter-spacing)/;
        const PAINT = /^(box-shadow|filter|backdrop-filter|-webkit-backdrop-filter|background|background-color|color|border-color|outline)/;
        const groups = {};
        let total = 0;
        for (const e of document.querySelectorAll('body *')) {
            const c = getComputedStyle(e);
            const ds = c.transitionDuration.split(',').map(s => parseFloat(s));
            if (ds.every(d => d === 0)) continue;
            total++;
            const ps = c.transitionProperty.split(',').map(s => s.trim());
            const bad = ps.filter((p, i) => LAYOUT.test(p) && (ds[i % ds.length] > 0));
            const key = bad.length ? 'LAYOUT:' + bad.join('+') : (ps.some(p => PAINT.test(p)) ? 'paint' : 'compositor');
            const g = groups[key] = groups[key] || { n: 0, dur: {}, ex: {} };
            g.n++;
            g.dur[c.transitionDuration.split(',')[0]] = (g.dur[c.transitionDuration.split(',')[0]] || 0) + 1;
            const name = e.id ? '#' + e.id : (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase());
            g.ex[name] = (g.ex[name] || 0) + 1;
        }
        for (const g of Object.values(groups)) g.ex = Object.entries(g.ex).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const anim = {};
        for (const e of document.querySelectorAll('body *')) {
            const a = getComputedStyle(e).animationName;
            if (a && a !== 'none') anim[a] = (anim[a] || 0) + 1;
        }
        const running = document.getAnimations().map(a => (a.animationName || a.transitionProperty || 'waapi') + ':' + a.playState + ':' + (a.effect?.getTiming?.().iterations));
        return { total, groups, anim, running: running.slice(0, 20), runningN: running.length };
    }),

    // Per-frame sampler for one element during an interaction. Reads geometry, so
    // never run it in the same pass as timing measurements.
    async sampleFrames(selector, action, ms = 700) {
        await H.ev(({ selector, ms }) => {
            const S = window.__s = [];
            const el = () => document.querySelector(selector);
            const t0 = performance.now();
            const tick = () => {
                const e = el();
                if (e) {
                    const c = getComputedStyle(e), r = e.getBoundingClientRect();
                    S.push({ t: Math.round(performance.now() - t0), d: c.display, op: Math.round(parseFloat(c.opacity) * 1000) / 1000, tf: c.transform === 'none' ? '-' : c.transform.replace('matrix', '').slice(0, 36), tr: c.translate === 'none' ? '-' : c.translate, sc: c.scale === 'none' ? '-' : c.scale, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cw: e.clientWidth, ov: c.overflowY });
                }
                if (performance.now() - t0 < ms) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }, { selector, ms });
        await action();
        await sleep(ms + 150);
        return H.ev(() => window.__s);
    },

    // Keep only samples where something changed; easy to read in a report.
    compact(samples, keys = ['d', 'op', 'tf', 'tr', 'sc', 'x', 'y', 'w', 'h', 'cw', 'ov']) {
        const out = []; let prev = null;
        for (const s of samples) {
            if (!prev || keys.some(k => s[k] !== prev[k])) out.push(keys.reduce((o, k) => { if (!prev || s[k] !== prev[k]) o[k] = s[k]; return o; }, { t: s.t }));
            prev = s;
        }
        return out;
    },

    async shot(name, opts = {}) {
        const path = `/opt/server-agent/workspace/st-testdata/perf-shots/${name}.png`;
        await page.screenshot({ path, animations: opts.live ? 'allow' : 'disabled', caret: 'hide', fullPage: false });
        return path;
    },
};
