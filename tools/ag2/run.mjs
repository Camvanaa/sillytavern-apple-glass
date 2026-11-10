// tools/ag2/run.mjs — Playwright driver for the Apple Glass 2 test instance (st-test).
//
//   export PATH=/opt/server-agent/home/.local/bin:$PATH
//   node tools/ag2/run.mjs tools/ag2/baseline.mjs [--w 1440 --h 900 | --phone] [--reduced]
//        [--tag x] [--phase P0] [--base http://127.0.0.1:8123/] [--keep]
//
// A suite is an ES module: `export default async function (T) { ... return summary }`.
// T (the toolkit) gives every suite the same entry flow and helpers:
//   T.cfg                 parsed CLI flags
//   T.newPage(over)       fresh browser context + page (never reuses cache/state).
//                         over: { phone, reduced, w, h, query } — defaults from the CLI.
//   T.prepare(page, opt)  stubWrites + backend guard (+ mockGen unless opt.mock === false)
//   T.boot(page, opt)     goto st-test → preloader gone → ST context ready
//                         (→ body.ag2 when opt.ag2) ; returns { readyMs }
//   T.openChat(page, spec) spec: { avatar, file } | { group, chat }  (via getContext())
//   T.shot(page, name)    real/<phase>/<name>.png + <name>_s.jpg (≤1000px wide)
//   T.scan(page, roots)   ovf / dbl / unhid / nest (+ btn, hovf, scrollY, blur)
//   T.save(stage, obj)    append to results sink (:8798) under ag2-<phase>
// Safety: every write endpoint is stubbed, every model backend is aborted unless a
// suite mocks it (chat-completions/generate + status are mocked by default), so a
// run can never change the data copy nor reach a model API.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('/opt/server-agent/workspace/browser-tools/package.json');
const { chromium } = require('playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, '..');

// ------------------------------------------------------------------ CLI
const argv = process.argv.slice(2);
const suitePath = argv.find(a => !a.startsWith('--') && /\.m?js$/.test(a));
if (!suitePath) { console.error('usage: node run.mjs <suite.mjs> [--w 1440 --h 900 | --phone] [--reduced] [--tag x]'); process.exit(2); }
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const cfg = {
    w: Number(flag('w', 1440)), h: Number(flag('h', 900)),
    phone: !!flag('phone', false), reduced: !!flag('reduced', false),
    tag: flag('tag', ''), phase: flag('phase', 'P0'),
    base: flag('base', 'http://127.0.0.1:8123/'),
    part: flag('part', ''),
    shotRoot: flag('shots', '/opt/server-agent/workspace/st-testdata/redesign/real'),
};

export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// Write endpoints (perf-lib.js list + the ones a shell can reach). Fulfilled with {ok:true}.
export const WRITE_ROUTES = [
    '**/api/settings/save', '**/api/chats/save', '**/api/chats/group/save', '**/api/characters/edit',
    '**/api/characters/edit-attribute', '**/api/characters/merge-attributes', '**/api/themes/save',
    '**/api/groups/edit', '**/api/groups/create', '**/api/groups/delete', '**/api/chats/rename',
    '**/api/chats/delete', '**/api/chats/group/delete', '**/api/characters/create', '**/api/characters/delete',
    '**/api/characters/rename', '**/api/characters/duplicate', '**/api/worldinfo/edit', '**/api/worldinfo/delete',
    '**/api/backgrounds/delete', '**/api/backgrounds/rename', '**/api/quick-replies/save', '**/api/files/upload',
];
export const MODELS = ['gemini-4-argon-high', 'test-model-b'];

// ------------------------------------------------------------------ helpers
const read = f => readFileSync(path.join(TOOLS, f), 'utf8');
const SCAN_SRC = read('scan.js');
const BTN_SRC = read('btnscan.js');

function sseBody(text, chunks) {
    const parts = [];
    const n = Math.max(1, chunks);
    const step = Math.ceil(text.length / n);
    for (let i = 0; i < text.length; i += step) parts.push(text.slice(i, i + step));
    return parts;
}

async function main() {
    const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
    const contexts = [];
    const consoleLog = [];

    const T = {
        cfg, sleep, median, browser, IPHONE_UA, MODELS,

        async newPage(over = {}) {
            const o = { ...cfg, ...over };
            const ctx = await browser.newContext({
                viewport: o.phone ? { width: 390, height: 844 } : { width: o.w, height: o.h },
                deviceScaleFactor: o.phone ? 3 : 1,
                isMobile: !!o.phone, hasTouch: !!o.phone,
                reducedMotion: o.reduced ? 'reduce' : 'no-preference',
                locale: 'zh-CN',
                ...(o.phone ? { userAgent: IPHONE_UA } : {}),
            });
            contexts.push(ctx);
            const page = await ctx.newPage();
            page.__errors = [];
            page.on('console', m => { if (m.type() === 'error') page.__errors.push(m.text().slice(0, 240)); });
            page.on('pageerror', e => page.__errors.push('pageerror: ' + String(e.message || e).slice(0, 240)));
            page.on('response', r => { if (r.status() >= 400) page.__errors.push('http ' + r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 160)); });
            return page;
        },

        // stubWrites + backend guard + mockGen (opt.mock false to skip, opt.gen = mockGen options)
        async prepare(page, opt = {}) {
            const ok = r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
            for (const p of WRITE_ROUTES) await page.route(p, ok);
            // Stubbed /api/characters/edit would make ST re-read the card from disk, reverting the
            // card's `chat` field (= getCurrentChatId) after openCharacterChat. Emulate the write in
            // memory: remember chat per avatar and patch characters/all|get responses.
            const cardChat = page.__cardChat = {};
            await page.route('**/api/characters/edit', r => {
                const body = r.request().postData() || '';
                const field = n => { const m = body.match(new RegExp('name="' + n + '"\\r?\\n\\r?\\n([^\\r\\n]*)')); return m ? m[1] : null; };
                const av = field('avatar_url'), chat = field('chat');
                if (av && chat) cardChat[av] = chat;
                return ok(r);
            });
            const patchCard = c => { if (c && cardChat[c.avatar]) c.chat = cardChat[c.avatar]; return c; };
            await page.route('**/api/characters/all', async r => {
                if (!Object.keys(cardChat).length) return r.continue();
                const res = await r.fetch(); const j = await res.json();
                (Array.isArray(j) ? j : []).forEach(patchCard);
                await r.fulfill({ response: res, body: JSON.stringify(j) });
            });
            await page.route('**/api/characters/get', async r => {
                if (!Object.keys(cardChat).length) return r.continue();
                const res = await r.fetch(); const j = await res.json();
                patchCard(j);
                await r.fulfill({ response: res, body: JSON.stringify(j) });
            });
            // Guard first (routes registered later win in Playwright): no model backend is reachable.
            await page.route('**/api/backends/**', r => r.abort());
            await page.route('**/api/openai/**', r => r.abort());
            if (opt.mock !== false) await T.mockGen(page, opt.gen);
            // In-memory settings overrides (the response is rewritten; nothing is written to disk):
            // powerUser → power_user, extSettings → extension_settings (shallow-merged per key),
            // theme: 'ag2' → activate "Apple Glass 2" with the worktree's apple-glass-2.css (debug path;
            // acceptance shots use the real sync-css.sh publish).
            if (opt.powerUser || opt.extSettings || opt.theme || opt.mutate) {
                const themeCss = opt.theme === 'ag2' ? readFileSync(path.resolve(TOOLS, '..', 'apple-glass-2.css'), 'utf8')
                    : opt.theme === 'dark' ? readFileSync(path.resolve(TOOLS, '..', 'apple-theme.css'), 'utf8') : null;
                const themeName = opt.theme === 'ag2' ? 'Apple Glass 2' : 'Apple Glass Dark';
                await page.route('**/api/settings/get', async route => {
                    const res = await route.fetch();
                    const j = await res.json();
                    const s = JSON.parse(j.settings);
                    if (themeCss) {
                        s.power_user.theme = themeName;
                        s.power_user.custom_css = themeCss;
                        for (const t of j.themes || []) if (t.name === themeName) t.custom_css = themeCss;
                    }
                    Object.assign(s.power_user, opt.powerUser || {});
                    for (const [k, v] of Object.entries(opt.extSettings || {})) s.extension_settings[k] = { ...(s.extension_settings[k] || {}), ...v };
                    if (opt.mutate) opt.mutate(s, j);
                    j.settings = JSON.stringify(s);
                    await route.fulfill({ response: res, body: JSON.stringify(j) });
                });
            }
        },

        // SSE mock of chat-completions/generate, plus a connected status with a model list.
        // opt: { text, chunks, delayMs } — delayMs between chunks (slow it down to test Stop).
        async mockGen(page, opt = {}) {
            // page.__gen is live: a suite may change text / chunks / delayMs between steps.
            const state = page.__gen = { calls: 0, aborted: 0, text: opt.text, chunks: opt.chunks || 6, delayMs: opt.delayMs || 0 };
            await page.route('**/api/backends/chat-completions/status', r => r.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ object: 'list', data: MODELS.map(id => ({ id, object: 'model' })) }),
            }));
            await page.route('**/api/backends/chat-completions/generate', async route => {
                state.calls++;
                const text = state.text || '（mock 回复）这是测试用的生成内容，第 ' + state.calls + ' 次。\n\n- 列表项一\n- 列表项二';
                const parts = sseBody(text, state.chunks);
                let body = '';
                for (const p of parts) body += 'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: p } }] }) + '\n\n';
                body += 'data: [DONE]\n\n';
                // Playwright cannot stream a fulfilled body chunk by chunk; a slow stream is emulated
                // by holding the response, during which ST is in its generating state (Stop shown).
                if (state.delayMs) await sleep(state.delayMs);
                try { await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body }); }
                catch { state.aborted++; }
            });
        },

        async boot(page, opt = {}) {
            const url = cfg.base + (opt.query || '');
            const t0 = Date.now();
            await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
            // With a URL query string ST can leave #preloader in the DOM (seen with ?classic / ?foo=1
            // on AG Dark too), so the preloader condition only applies without a query.
            await page.waitForFunction(q => (q || !document.getElementById('preloader')) && !!window.SillyTavern?.getContext
                && SillyTavern.getContext().characters?.length > 0
                && document.querySelectorAll('#rm_print_characters_block .character_select, #rm_print_characters_block .group_select').length > 0,
            (opt.query || '').startsWith('?'), { timeout: 120000, polling: 100 });
            if (opt.ag2) await page.waitForFunction(() => document.body.classList.contains('ag2'), null, { timeout: 30000, polling: 100 });
            const readyMs = Date.now() - t0;
            await sleep(opt.settle ?? 2500);
            return { readyMs };
        },

        // { avatar: 'ag2_Aldric.png', file: '<chat file stem>' } | { group: id, chat: chatId }
        async openChat(page, spec, minMes = 2) {
            await page.evaluate(async s => {
                const c = SillyTavern.getContext();
                if (s.group) { await c.openGroupChat(s.group, s.chat); return; }
                const id = c.characters.findIndex(x => x.avatar === s.avatar);
                if (id < 0) throw new Error('no character ' + s.avatar);
                if (String(c.characterId) !== String(id)) await c.selectCharacterById(id);
                for (let i = 0; i < 50 && String(SillyTavern.getContext().characterId) !== String(id); i++) await new Promise(r => setTimeout(r, 100));
                if (s.file && SillyTavern.getContext().getCurrentChatId() !== s.file) await SillyTavern.getContext().openCharacterChat(s.file);
            }, spec);
            await page.waitForFunction(n => document.querySelectorAll('#chat .mes').length >= n, minMes, { timeout: 60000, polling: 100 });
            await sleep(1500);
        },

        // /api/chats/recent → [{ avatar|group, file, n, last }] (newest first)
        async recent(page) {
            return page.evaluate(async () => {
                const r = await fetch('/api/chats/recent', { method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(), body: JSON.stringify({ max: 100 }) });
                return (await r.json()).map(x => ({ avatar: x.avatar, group: x.group, file: x.file_name.replace(/\.jsonl$/, ''), n: x.chat_items, last: x.last_mes }));
            });
        },

        // The long neutral chat (most messages) of a character
        async longChat(page, avatar = 'ag2_Aldric.png') {
            const r = (await T.recent(page)).filter(x => x.avatar === avatar).sort((a, b) => b.n - a.n)[0];
            if (!r) throw new Error('no chat for ' + avatar);
            return { avatar, file: r.file, n: r.n };
        },

        async shot(page, name, opt = {}) {
            const dir = path.join(cfg.shotRoot, cfg.phase);
            mkdirSync(dir, { recursive: true });
            const png = path.join(dir, name + '.png');
            await page.screenshot({ path: png, animations: 'disabled', caret: 'hide', fullPage: false, ...opt });
            // ≤1000px-wide preview for reading in a model context
            execFileSync('python3', ['-c', `
from PIL import Image; import sys
im = Image.open(sys.argv[1]).convert('RGB'); w, h = im.size
if w > 1000: im = im.resize((1000, round(h * 1000 / w)), Image.LANCZOS)
im.save(sys.argv[2], 'JPEG', quality=82)`, png, png.replace(/\.png$/, '_s.jpg')]);
            return png;
        },

        // Counts used by RUNBOOK 4.6. roots: panels whose own horizontal overflow is checked.
        async scan(page, roots = []) {
            const s = JSON.parse(await page.evaluate(`(${SCAN_SRC})()`));
            const b = JSON.parse(await page.evaluate(`(${BTN_SRC})(null)`));
            const extra = await page.evaluate(rs => {
                const se = document.scrollingElement;
                const panels = {};
                for (const r of rs) {
                    const p = document.querySelector(r);
                    if (!p) { panels[r] = 'missing'; continue; }
                    panels[r] = { sw: p.scrollWidth, cw: p.clientWidth, ok: p.scrollWidth <= p.clientWidth };
                }
                let blurVis = 0; const blurBy = [];
                for (const e of document.querySelectorAll('body *')) {
                    const c = getComputedStyle(e); const f = c.backdropFilter;
                    if (!f || f === 'none' || c.visibility === 'hidden' || c.display === 'none') continue;
                    const q = e.getBoundingClientRect();
                    if (q.width > 0 && q.height > 0 && q.right > 0 && q.bottom > 0 && q.left < innerWidth && q.top < innerHeight) {
                        blurVis++;
                        if (blurBy.length < 12) blurBy.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '')) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
                    }
                }
                return { doc: { sw: se.scrollWidth, cw: se.clientWidth, ok: se.scrollWidth <= se.clientWidth }, scrollY: window.scrollY, panels, blurVis, blurBy };
            }, roots);
            return {
                ovf: s.overflowRight.length, dbl: s.doubleBorder.length, unhid: s.unhidden.length, nest: s.blurNested.length,
                btn: b.bad.length, ...extra,
                detail: { ovf: s.overflowRight.slice(0, 5), dbl: s.doubleBorder.slice(0, 5), unhid: s.unhidden.slice(0, 5), nest: s.blurNested.slice(0, 5), btn: b.bad.slice(0, 5) },
            };
        },

        async save(stage, obj) {
            const rec = { run: `${cfg.phase}:${path.basename(suitePath)}${cfg.tag ? ':' + cfg.tag : ''}`, stage, t: new Date().toISOString(), data: obj };
            try { await fetch('http://127.0.0.1:8798/ag2-' + cfg.phase, { method: 'POST', body: JSON.stringify(rec) }); } catch { /* sink down */ }
            return obj;
        },

        errors: page => page.__errors.slice(),
        consoleLog,
    };

    const t0 = Date.now();
    let code = 0;
    try {
        const mod = await import(pathToFileURL(path.resolve(suitePath)).href);
        const out = await mod.default(T);
        console.log(JSON.stringify(out, null, 1));
    } catch (e) {
        code = 1;
        console.error('ERR', e && e.stack || e);
    } finally {
        for (const c of contexts) await c.close().catch(() => {});
        await browser.close().catch(() => {});
        console.error(`done ${path.basename(suitePath)} ${Math.round((Date.now() - t0) / 1000)}s`);
    }
    process.exit(code || process.exitCode || 0); // a suite may set process.exitCode (r1-flash verdict)
}

main();
