// tools/ag2/p1b.mjs — P1b acceptance checks (reading area, input island, + menu, model capsule).
//   node tools/ag2/run.mjs tools/ag2/p1b.mjs --phase P1b --part <part> [--mem] [--w 1440]
// parts: shots gen stream model offline plus multiline styles hover
// --mem: inject the worktree CSS in memory (debug). Without it the theme must be published +
// active in ag2-data (sync-css.sh start-test … --activate "Apple Glass 2").
// All writes are stubbed (run.mjs); generation is mocked; nothing reaches a model API.
import http from 'node:http';
import { genChecks } from './baseline.mjs';

const norm = s => String(s ?? '').replace(/[\u200b\s]/g, '');
const R = 'r => r && [r.left, r.top, r.width, r.height].map(Math.round).join(",")';

async function enter(T, over = {}, prep = {}) {
    const page = await T.newPage(over);
    const mem = process.argv.includes('--mem');
    // P1B_THEME=dark: same checks under Apple Glass Dark (no shell) as a control
    const dark = process.env.P1B_THEME === 'dark';
    await T.prepare(page, { ...(dark ? { theme: 'dark' } : mem ? { theme: 'ag2' } : {}), ...prep });
    const b = await T.boot(page, { ag2: !dark, settle: 1500 });
    if (over.chat !== false) await T.openChat(page, await T.longChat(page), 20);
    page.setDefaultTimeout(10000);
    return { page, readyMs: b.readyMs };
}

const rect = (page, sel) => page.evaluate(([s, rs]) => { const f = eval(rs); const e = document.querySelector(s); return e ? f(e.getBoundingClientRect()) : null; }, [sel, R]);
const idle = page => page.waitForFunction(() => {
    const s = document.querySelector('#send_but'), st = document.querySelector('#mes_stop');
    return s && getComputedStyle(s).display !== 'none' && (!st || getComputedStyle(st).display === 'none');
}, null, { timeout: 30000, polling: 100 });
const lastText = page => page.evaluate(() => document.querySelector('#chat .mes.last_mes .mes_text')?.innerText || '');
const chatLen = page => page.evaluate(() => SillyTavern.getContext().chat.length);

// ------------------------------------------------------------------ shots (design 01 / 04a)
async function shots(T) {
    const out = {};
    const w = T.cfg.w;
    const { page } = await enter(T);
    out.geom = await page.evaluate(rs => {
        const f = eval(rs), q = s => { const e = document.querySelector(s); return e ? f(e.getBoundingClientRect()) : null; };
        const last = document.querySelector('#chat .mes.last_mes');
        return {
            sheld: q('#sheld'), chat: q('#chat'), island: q('#nonQRFormItems'), plus: q('#ag2-plus'), model: q('#ag2-model'), send: q('#send_but'),
            qr: q('#qr-bar'), qrAdd: q('#ag2-qr-add'), lastText: f(last.querySelector('.mes_text').getBoundingClientRect()),
            lastAvatar: f(last.querySelector('.avatar').getBoundingClientRect()), fadeBottom: getComputedStyle(document.body).getPropertyValue('--ag2-fade-bottom').trim(),
            radius: getComputedStyle(document.querySelector('#nonQRFormItems')).borderRadius,
            textCss: (s => [s.fontSize, s.lineHeight, s.letterSpacing, s.color].join(' '))(getComputedStyle(last.querySelector('.mes_text'))),
        };
    }, R);
    await T.shot(page, `chat-${w}`);
    // the day separator + consecutive messages: scroll to the first day boundary
    await page.evaluate(() => { const d = document.querySelector('#chat .mes.ag2-day:not([mesid="0"])') || document.querySelector('#chat .mes.ag2-day'); d?.scrollIntoView({ block: 'center' }); });
    await T.sleep(400);
    await T.shot(page, `chat-day-${w}`);
    // reasoning capsule (closed, then open) on a message that has one
    const rs = await page.evaluate(() => {
        const d = [...document.querySelectorAll('#chat .mes .mes_reasoning_details[data-has-content="true"]')].pop();
        if (!d) return null;
        d.closest('.mes').scrollIntoView({ block: 'center' });
        return { mesid: d.closest('.mes').getAttribute('mesid'), title: d.querySelector('.mes_reasoning_header_title')?.textContent.trim(), open: d.open };
    });
    out.reasoning = rs;
    if (rs) {
        await T.sleep(300);
        await T.shot(page, `reasoning-closed-${w}`);
        await page.click(`#chat .mes[mesid="${rs.mesid}"] .mes_reasoning_header`);
        await T.sleep(400);
        out.reasoning.openAfterClick = await page.evaluate(id => document.querySelector(`#chat .mes[mesid="${id}"] .mes_reasoning_details`).open, rs.mesid);
        await T.shot(page, `reasoning-open-${w}`);
    }
    // markdown sample (code block / table / quote)
    await page.evaluate(() => { const m = [...document.querySelectorAll('#chat .mes .mes_text')].find(t => t.querySelector('pre, table')); m?.closest('.mes').scrollIntoView({ block: 'center' }); });
    await T.sleep(300);
    await T.shot(page, `markdown-${w}`);
    // back to the bottom; + menu open (04a ①)
    await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
    await T.sleep(300);
    await page.click('#ag2-plus');
    await T.sleep(350);
    await T.shot(page, `plus-menu-${w}`);
    await page.click('#ag2-plus-menu [data-item="wand"]');
    await T.sleep(350);
    await T.shot(page, `plus-wand-${w}`);
    await page.keyboard.press('Escape');
    await T.sleep(250);
    await page.click('#ag2-model');
    await T.sleep(350);
    await T.shot(page, `model-menu-${w}`);
    await page.keyboard.press('Escape');
    // multi-line with text (04a ②③)
    await setText(page, Array.from({ length: 3 }, (_, i) => `第 ${i + 1} 行：我接过杯子，暖意顺着掌心慢慢漫上来。`).join('\n'));
    await T.sleep(300);
    await T.shot(page, `multiline3-${w}`);
    await setText(page, '');
    // hover a non-last message + open “更多”
    const mid = await page.evaluate(() => { const ms = [...document.querySelectorAll('#chat .mes[is_user="false"]')]; const m = ms[ms.length - 3]; m.scrollIntoView({ block: 'center' }); return m.getAttribute('mesid'); });
    await T.sleep(300);
    await page.hover(`#chat .mes[mesid="${mid}"] .mes_text`);
    await T.sleep(300);
    await T.shot(page, `hover-${w}`);
    await page.click(`#chat .mes[mesid="${mid}"] .extraMesButtonsHint`);
    await T.sleep(500);
    await T.shot(page, `more-${w}`);
    out.scan = await T.scan(page, ['#chat', '#form_sheld']);
    out.errors = T.errors(page);
    return out;
}

async function setText(page, v) {
    await page.evaluate(v => { const t = document.getElementById('send_textarea'); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); }, v);
}

// ------------------------------------------------------------------ gen: send / stop / swipe / continue / impersonate / Ctrl+Enter
async function gen(T) {
    const out = {};
    const { page } = await enter(T);
    // baseline's checks (send, swipe › new alternative + ‹, stop) — DOM clicks
    out.base = await genChecks(T, page);
    // the same through real pointer clicks on the restyled controls
    try {
        await page.fill('#send_textarea', '');
        out.sendGrey = await page.evaluate(() => !document.getElementById('send_form').classList.contains('ag2-has-text') && getComputedStyle(document.getElementById('send_but')).backgroundColor);
        await page.click('#send_textarea');
        await page.keyboard.type('你好，旅店老板。');
        out.sendAccent = await page.evaluate(() => document.getElementById('send_form').classList.contains('ag2-has-text') && getComputedStyle(document.getElementById('send_but')).backgroundColor);
        const n0 = await chatLen(page), c0 = page.__gen.calls;
        await page.click('#send_but');
        await page.waitForFunction(n => SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000 });
        await idle(page);
        out.clickSend = { calls: page.__gen.calls - c0, chat: `${n0}→${await chatLen(page)}`, text: (await lastText(page)).slice(0, 30), cleared: await page.evaluate(() => !document.getElementById('send_form').classList.contains('ag2-has-text') && document.getElementById('send_textarea').value === '') };
    } catch (e) { out.clickSend = 'FAIL ' + String(e.message).split('\n')[0]; }
    try {
        // swipe › (new alternative) and ‹ via pointer clicks on the capsule
        const c0 = page.__gen.calls;
        await page.hover('#chat .mes.last_mes .mes_text');
        await page.click('#chat .mes.last_mes .swipe_right');
        await page.waitForFunction(() => (document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent || '').replace(/[\u200b\s]/g, '') === '2/2', null, { timeout: 30000 }).catch(() => {});
        await idle(page);
        const a = norm(await page.evaluate(() => document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent));
        await page.click('#chat .mes.last_mes .swipe_left');
        await T.sleep(800);
        const b = norm(await page.evaluate(() => document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent));
        out.clickSwipe = { calls: page.__gen.calls - c0, after: a, back: b };
    } catch (e) { out.clickSwipe = 'FAIL ' + String(e.message).split('\n')[0]; }
    try {
        // + menu → 继续
        page.__gen.text = '（续写）林间的风停了。';
        const t0 = await lastText(page), c0 = page.__gen.calls;
        await page.click('#ag2-plus');
        await page.click('#ag2-plus-menu [data-item="continue"]');
        await T.sleep(600);
        await idle(page);
        const t1 = await lastText(page);
        out.continue = { calls: page.__gen.calls - c0, grew: t1.length > t0.length, tail: t1.slice(-16) };
    } catch (e) { out.continue = 'FAIL ' + String(e.message).split('\n')[0]; }
    try {
        // + menu → 代我写 (impersonate: the reply lands in the textarea)
        page.__gen.text = '（代写）我点点头，接过杯子。';
        const c0 = page.__gen.calls, n0 = await chatLen(page);
        await page.click('#ag2-plus');
        await page.click('#ag2-plus-menu [data-item="impersonate"]');
        await page.waitForFunction(() => document.getElementById('send_textarea').value.length > 0, null, { timeout: 30000 });
        await idle(page);
        await T.sleep(300);
        out.impersonate = { calls: page.__gen.calls - c0, textarea: (await page.inputValue('#send_textarea')).slice(0, 20), chatUnchanged: (await chatLen(page)) === n0, accent: await page.evaluate(() => document.getElementById('send_form').classList.contains('ag2-has-text')) };
        await page.fill('#send_textarea', '');
    } catch (e) { out.impersonate = 'FAIL ' + String(e.message).split('\n')[0]; }
    try {
        // Ctrl+Enter in the composer = regenerate (ST's own shortcut)
        page.__gen.text = '（重新生成）炉火又亮了起来。';
        const c0 = page.__gen.calls, n0 = await chatLen(page);
        await page.click('#send_textarea');
        await page.keyboard.press('Control+Enter');
        // ST asks “Regenerate Message?” first (unless “don't ask again” was stored)
        const ok = page.locator('dialog[open] .popup-button-ok');
        await ok.waitFor({ state: 'visible', timeout: 4000 }).then(() => ok.click()).catch(() => {});
        out.regenerateConfirm = await page.evaluate(() => !document.querySelector('dialog[open]'));
        await T.sleep(800);
        await idle(page);
        out.regenerate = { calls: page.__gen.calls - c0, text: (await lastText(page)).slice(0, 20), chat: `${n0}→${await chatLen(page)}` };
    } catch (e) { out.regenerate = 'FAIL ' + String(e.message).split('\n')[0]; }
    try {
        // + menu → 重新生成
        page.__gen.text = '（菜单重新生成）窗外下起了雨。';
        const c0 = page.__gen.calls;
        await page.click('#ag2-plus');
        await page.click('#ag2-plus-menu [data-item="regenerate"]');
        await T.sleep(800);
        await idle(page);
        out.menuRegenerate = { calls: page.__gen.calls - c0, text: (await lastText(page)).slice(0, 20) };
    } catch (e) { out.menuRegenerate = 'FAIL ' + String(e.message).split('\n')[0]; }
    try {
        // stop through a pointer click on the restyled stop key
        page.__gen.delayMs = 8000;
        await page.fill('#send_textarea', '测试停止（指针）');
        await page.click('#send_but');
        await page.waitForSelector('#mes_stop', { state: 'visible', timeout: 10000 });
        const sr = await rect(page, '#mes_stop');
        const t = Date.now();
        await page.click('#mes_stop');
        await idle(page);
        out.clickStop = { ms: Date.now() - t, stopRect: sr, sendBack: await rect(page, '#send_but') };
    } catch (e) { out.clickStop = 'FAIL ' + String(e.message).split('\n')[0]; }
    page.__gen.delayMs = 0;
    out.scrollY = await page.evaluate(() => [window.scrollY, document.scrollingElement.scrollTop, document.getElementById('sheld').scrollTop]);
    out.decor = await page.evaluate(() => ({ lastHasModel: document.querySelector('#chat .mes.last_mes')?.getAttribute('data-ag2-model') ?? null, days: document.querySelectorAll('#chat .mes.ag2-day').length, cont: document.querySelectorAll('#chat .mes.ag2-cont').length }));
    out.scan = await T.scan(page, ['#chat', '#form_sheld']);
    await T.shot(page, `gen-after-${T.cfg.w}`);
    out.errors = T.errors(page);
    return out;
}

// ------------------------------------------------------------------ stream: a real chunked SSE stream
// Playwright's fulfill cannot stream; route.continue() to a local SSE server can.
async function stream(T) {
    const out = {};
    const pieces = Array.from({ length: 12 }, (_, i) => `第${i + 1}段流式文字。`);
    let aborted = 0;
    const server = http.createServer((req, res) => {
        if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); return res.end(); }
        req.resume();
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' });
        let i = 0;
        const tick = setInterval(() => {
            if (res.destroyed) { clearInterval(tick); aborted++; return; }
            if (i < pieces.length) res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: pieces[i++] } }] }) + '\n\n');
            else { res.write('data: [DONE]\n\n'); res.end(); clearInterval(tick); }
        }, Number(process.env.SSE_MS || 250));
        res.on('close', () => clearInterval(tick));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    try {
        const { page } = await enter(T);
        let routed = 0;
        await page.route('**/api/backends/chat-completions/generate', r => { routed++; return r.continue({ url: `http://127.0.0.1:${port}/sse` }); });
        await page.fill('#send_textarea', '请讲一个故事。');
        await page.click('#send_but');
        const samples = [];
        const t0 = Date.now();
        while (Date.now() - t0 < 8000) {
            const s = await page.evaluate(() => ({ len: (document.querySelector('#chat .mes.last_mes[is_user="false"] .mes_text')?.innerText || '').length, stop: getComputedStyle(document.querySelector('#mes_stop')).display !== 'none', sub: document.querySelector('.ag2-title-sub')?.textContent }));
            samples.push(s);
            if (!s.stop && samples.length > 4) break;
            await T.sleep(200);
        }
        await idle(page);
        const lens = samples.map(s => s.len);
        out.stream = { routed, distinctLengths: [...new Set(lens)].length, lens: lens.slice(0, 30), stopSeen: samples.some(s => s.stop), replying: samples.some(s => s.sub === '正在回复…'), final: (await lastText(page)).slice(-12) };
        // stop mid-stream
        await page.fill('#send_textarea', '再讲一个。');
        await page.click('#send_but');
        await page.waitForFunction(() => (document.querySelector('#chat .mes.last_mes[is_user="false"] .mes_text')?.innerText || '').includes('第2段'), null, { timeout: 10000 });
        await page.click('#mes_stop');
        await idle(page);
        await T.sleep(600);
        out.stopMid = { text: (await lastText(page)).slice(0, 40), complete: (await lastText(page)).includes('第12段'), serverAborted: aborted,
            tail: await page.evaluate(() => SillyTavern.getContext().chat.slice(-2).map(m => (m.is_user ? 'U:' : 'A:') + String(m.mes).slice(0, 24))) };
        await T.shot(page, `stream-stopped-${T.cfg.w}`);
        out.errors = T.errors(page);
    } finally { server.close(); }
    return out;
}

// ------------------------------------------------------------------ model capsule
async function model(T) {
    const out = {};
    const { page } = await enter(T);
    const saves = [];
    page.on('request', r => { if (r.url().includes('/api/settings/save')) saves.push(1); });
    const state = () => page.evaluate(() => ({ select: document.getElementById('model_custom_select')?.value, ctx: SillyTavern.getContext().getChatCompletionModel(), capsule: document.querySelector('#ag2-model .ag2-model-name')?.textContent, custom: document.getElementById('custom_model_id')?.value }));
    out.before = await state();
    await page.click('#ag2-model');
    await T.sleep(300);
    out.menu = await page.evaluate(() => [...document.querySelectorAll('#ag2-model-menu .ag2-menu-item, #ag2-model-menu .ag2-menu-head')].map(b => (b.classList.contains('ag2-menu-head') ? '#' : '') + b.textContent.trim() + (b.querySelector('svg') && b.classList.contains('ag2-menu-item') && b.querySelector('.ag2-i-pad') == null ? ' ✓' : '')));
    await page.click('#ag2-model-menu [data-item="m:test-model-b"]');
    await T.sleep(1500);
    out.after = await state();
    out.settingsSaveCalls = saves.length;
    out.changed = out.after.select === 'test-model-b' && out.after.ctx === 'test-model-b' && out.after.capsule === 'test-model-b';
    // generation now reports the new model on the new message
    const n0 = await chatLen(page);
    await page.fill('#send_textarea', '换模型以后再问一次。');
    await page.click('#send_but');
    await page.waitForFunction(n => SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000 });
    await idle(page);
    await T.sleep(400);
    out.newMessageModel = await page.evaluate(() => [SillyTavern.getContext().chat.at(-1)?.extra?.model, document.querySelector('#chat .mes.last_mes')?.getAttribute('data-ag2-model')]);
    // switch back via the menu
    await page.click('#ag2-model');
    await page.click('#ag2-model-menu [data-item="m:gemini-4-argon-high"]');
    await T.sleep(800);
    out.back = await state();
    // “连接设置…” opens ST's API panel
    await page.click('#ag2-model');
    await page.click('#ag2-model-menu [data-item="conn"]');
    await T.sleep(900);
    out.connOpens = await page.evaluate(() => document.getElementById('rm_api_block')?.classList.contains('openDrawer'));
    await T.shot(page, `model-conn-${T.cfg.w}`);
    out.errors = T.errors(page);
    return out;
}

// ------------------------------------------------------------------ not connected
async function offline(T) {
    const out = {};
    const page = await T.newPage();
    const mem = process.argv.includes('--mem');
    // Custom endpoints count a failed status check as “bypassed”; with the OpenAI source a
    // failed check means “no connection” (in-memory settings only).
    await T.prepare(page, { ...(mem ? { theme: 'ag2' } : {}), mutate: st => { st.oai_settings.chat_completion_source = 'openai'; } });
    // later routes win: the status check fails → ST stays “no connection”
    await page.route('**/api/backends/chat-completions/status', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":true}' }));
    await T.boot(page, { ag2: true, settle: 2500 });
    await T.openChat(page, await T.longChat(page), 20);
    out.state = await page.evaluate(() => ({
        online: SillyTavern.getContext().onlineStatus, noConnClass: document.getElementById('send_form').classList.contains('no-connection'),
        placeholder: document.getElementById('send_textarea').placeholder, capsuleOff: document.getElementById('ag2-model').classList.contains('ag2-off'),
        capsule: document.querySelector('#ag2-model .ag2-model-name').textContent, footer: document.querySelector('.ag2-conn-text')?.textContent,
    }));
    await T.shot(page, `offline-${T.cfg.w}`);
    await page.click('#send_textarea');
    await T.sleep(900);
    out.clickOpensApi = await page.evaluate(() => document.getElementById('rm_api_block')?.classList.contains('openDrawer'));
    out.errors = T.errors(page).filter(e => !e.includes('status of 500') && !e.includes('chat-completions/status'));
    return out;
}

// ------------------------------------------------------------------ + menu / 扩展工具 / attach / delete mode
async function plus(T) {
    const out = {};
    const { page } = await enter(T);
    await page.click('#ag2-plus');
    await T.sleep(250);
    out.items = await page.evaluate(() => [...document.querySelectorAll('#ag2-plus-menu > *')].map(e => e.classList.contains('ag2-menu-sep') ? '—' : e.classList.contains('ag2-menu-head') ? '#' + e.textContent : (e.dataset.item + ':' + e.textContent.trim() + (e.disabled ? '(off)' : ''))));
    out.plusIsX = await page.evaluate(() => document.getElementById('ag2-plus').classList.contains('ag2-open') && getComputedStyle(document.querySelector('#ag2-plus .ag2-x-i')).display !== 'none');
    out.menuRect = await rect(page, '#ag2-plus-menu');
    // 扩展工具 → ST's own #extensionsMenu next to the + menu
    await page.click('#ag2-plus-menu [data-item="wand"]');
    await T.sleep(300);
    out.wand = await page.evaluate(rs => {
        const f = eval(rs), em = document.getElementById('extensionsMenu'), pm = document.getElementById('ag2-plus-menu');
        const a = em.getBoundingClientRect(), b = pm.getBoundingClientRect();
        return { body: document.body.classList.contains('ag2-wand-open'), display: getComputedStyle(em).display, rect: f(a), rightOfMenu: a.left >= b.right, onScreen: a.top >= 0 && a.bottom <= innerHeight, items: [...em.querySelectorAll('.list-group-item')].filter(i => i.offsetParent).length, parent: em.parentElement === document.body };
    }, R);
    // pointer-down inside the wand keeps both open (it is not “outside”)
    await page.hover('#extensionsMenu #token_counter, #extensionsMenu .list-group-item >> nth=0');
    out.wandHover = await page.evaluate(() => !!document.getElementById('ag2-plus-menu') && document.body.classList.contains('ag2-wand-open'));
    // Esc closes both
    await page.keyboard.press('Escape');
    await T.sleep(250);
    out.escClosed = await page.evaluate(() => !document.getElementById('ag2-plus-menu') && !document.body.classList.contains('ag2-wand-open') && getComputedStyle(document.getElementById('extensionsMenu')).display === 'none');
    // outside click closes both
    await page.click('#ag2-plus');
    await page.click('#ag2-plus-menu [data-item="wand"]');
    await T.sleep(200);
    await page.mouse.click(900, 300);
    await T.sleep(250);
    out.outsideClosed = await page.evaluate(() => !document.getElementById('ag2-plus-menu') && !document.body.classList.contains('ag2-wand-open'));
    // a wand item runs ST's handler and closes the menus (Token counter: local popup)
    await page.click('#ag2-plus');
    await page.click('#ag2-plus-menu [data-item="wand"]');
    await T.sleep(200);
    const tc = page.locator('#extensionsMenu .list-group-item', { hasText: 'Token' });
    if (await tc.count()) {
        await tc.first().click();
        await T.sleep(800);
        out.wandItem = await page.evaluate(() => ({ menusClosed: !document.getElementById('ag2-plus-menu') && !document.body.classList.contains('ag2-wand-open'), popup: [...document.querySelectorAll('dialog[open]')].length }));
        await T.shot(page, `wand-item-${T.cfg.w}`);
        await page.keyboard.press('Escape');
        await T.sleep(400);
    } else out.wandItem = 'no token counter item';
    // 附加文件 → ST's #attachFile → file chooser
    try {
        await page.click('#ag2-plus');
        const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click('#ag2-plus-menu [data-item="attach"]')]);
        out.attach = fc ? 'filechooser ok' : 'none';
    } catch (e) { out.attach = 'FAIL ' + String(e.message).split('\n')[0]; }
    // 删除消息… → ST's delete mode; cancel
    await page.click('#ag2-plus');
    await page.click('#ag2-plus-menu [data-item="delete"]');
    await T.sleep(600);
    out.deleteMode = await page.evaluate(() => ({ bar: getComputedStyle(document.getElementById('dialogue_del_mes')).display, checkboxes: [...document.querySelectorAll('#chat .del_checkbox')].filter(c => getComputedStyle(c).display !== 'none').length }));
    await T.shot(page, `delete-mode-${T.cfg.w}`);
    await page.click('#dialogue_del_mes_cancel');
    await T.sleep(500);
    out.deleteCancelled = await page.evaluate(() => getComputedStyle(document.getElementById('dialogue_del_mes')).display === 'none');
    // 管理聊天文件 → ST's select_chat popup
    await page.click('#ag2-plus');
    await page.click('#ag2-plus-menu [data-item="select"]');
    await T.sleep(1200);
    out.selectChat = await page.evaluate(() => { const p = document.getElementById('shadow_select_chat_popup'); return p && getComputedStyle(p).display !== 'none'; });
    await page.keyboard.press('Escape');
    await T.sleep(500);
    // keyboard: ↓ moves focus in the + menu
    await page.click('#ag2-plus');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    out.keyNav = await page.evaluate(() => document.activeElement?.dataset?.item);
    await page.keyboard.press('Escape');
    out.scan = await T.scan(page, ['#chat', '#form_sheld']);
    out.errors = T.errors(page);
    return out;
}

// ------------------------------------------------------------------ multi-line (§19a; fix19 numbers)
async function multiline(T) {
    const out = {};
    const { page } = await enter(T);
    const measure = () => page.evaluate(rs => {
        const f = eval(rs), isl = document.getElementById('nonQRFormItems'), ta = document.getElementById('send_textarea');
        const a = isl.getBoundingClientRect(), l = document.getElementById('leftSendForm').getBoundingClientRect(), r = document.getElementById('rightSendForm').getBoundingClientRect();
        const chat = document.getElementById('chat').getBoundingClientRect();
        return { island: f(a), radius: getComputedStyle(isl).borderRadius, ta: Math.round(ta.getBoundingClientRect().height), taScroll: ta.scrollHeight > ta.clientHeight + 2, hscroll: ta.scrollWidth > ta.clientWidth,
            leftBottomGap: Math.round(a.bottom - l.bottom), rightBottomGap: Math.round(a.bottom - r.bottom), sendBottomGap: Math.round(a.bottom - document.getElementById('send_but').getBoundingClientRect().bottom),
            textInside: ta.getBoundingClientRect().top >= a.top, chatVisibleAboveDock: Math.round(a.top - chat.top), dockVar: getComputedStyle(document.body).getPropertyValue('--ag2-dock-h') };
    }, R);
    const line = i => `第 ${i} 行：她把披风搭在椅背上，回头看了你一眼，屋外的溪水声很轻。`;
    for (const [name, v] of [['short', '你好'], ['l5', Array.from({ length: 5 }, (_, i) => line(i + 1)).join('\n')], ['l30', Array.from({ length: 30 }, (_, i) => line(i + 1)).join('\n')], ['longword', 'x'.repeat(1200)]]) {
        await page.click('#send_textarea');
        await setText(page, v);
        await T.sleep(400);
        out[name] = await measure();
        if (name === 'l30' || name === 'l5') await T.shot(page, `multiline-${name}-${T.cfg.w}`);
    }
    await setText(page, '');
    await T.sleep(300);
    out.cleared = await measure();
    out.errors = T.errors(page);
    return out;
}

// ------------------------------------------------------------------ 7 chat styles
async function styles(T) {
    const out = {};
    const { page } = await enter(T);
    const names = ['阅读', '气泡', '文档', '回声', '低语', '涟漪', '轻声'];
    for (let v = 0; v <= 6; v++) {
        const r = {};
        await page.evaluate(v => $('#chat_display').val(String(v)).trigger('change'), v);
        await T.sleep(900);
        await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
        await T.sleep(400);
        r.body = await page.evaluate(() => [...document.body.classList].filter(c => /bubblechat|documentstyle|ap-chat/.test(c)).join(' '));
        r.scan = await T.scan(page, ['#chat', '#form_sheld']);
        delete r.scan.detail;
        await T.shot(page, `style${v}-${T.cfg.w}`);
        try {
            const n0 = await chatLen(page);
            await page.fill('#send_textarea', `风格 ${v} 测试`);
            await page.click('#send_but');
            await page.waitForFunction(n => SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000 });
            await idle(page);
            r.send = 'ok';
        } catch (e) { r.send = 'FAIL ' + String(e.message).split('\n')[0]; }
        r.lastMes = await page.evaluate(rs => { const f = eval(rs); const m = document.querySelector('#chat .mes.last_mes'); return { mes: f(m.getBoundingClientRect()), text: f(m.querySelector('.mes_text').getBoundingClientRect()) }; }, R);
        out[`${v}·${names[v]}`] = r;
    }
    await page.evaluate(() => $('#chat_display').val('0').trigger('change'));
    out.errors = T.errors(page);
    return out;
}

// ------------------------------------------------------------------ hover / last message / “更多” popover
async function hover(T) {
    const out = {};
    const { page } = await enter(T);
    const op = (sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? getComputedStyle(e).opacity : null; }, sel);
    const mid = await page.evaluate(() => { const ms = [...document.querySelectorAll('#chat .mes[is_user="false"]')]; const m = ms[ms.length - 2]; m.scrollIntoView({ block: 'center' }); return m.getAttribute('mesid'); });
    await page.mouse.move(5, 5);
    await T.sleep(300);
    out.idle = { other: await op(`#chat .mes[mesid="${mid}"] .mes_buttons`), last: await op('#chat .mes.last_mes .mes_buttons') };
    await page.hover(`#chat .mes[mesid="${mid}"] .mes_text`);
    await T.sleep(300);
    out.hovered = await op(`#chat .mes[mesid="${mid}"] .mes_buttons`);
    out.order = await page.evaluate(id => [...document.querySelectorAll(`#chat .mes[mesid="${id}"] .mes_buttons > *`)].filter(e => e.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(e => [...e.classList].find(c => c.startsWith('mes_') && c !== 'mes_button' || c.startsWith('extra') || c.startsWith('xiaobaix')) || e.className), mid);
    await page.click(`#chat .mes[mesid="${mid}"] .extraMesButtonsHint`);
    await T.sleep(600);
    out.popover = await page.evaluate(([id, rs]) => {
        const f = eval(rs), m = document.querySelector(`#chat .mes[mesid="${id}"]`), p = m.querySelector('.extraMesButtons'), h = m.querySelector('.extraMesButtonsHint');
        const pr = p.getBoundingClientRect(), hr = h.getBoundingClientRect();
        const top = document.elementFromPoint(pr.left + 15, pr.top + 15);
        return { visible: p.classList.contains('visible'), rect: f(pr), above: pr.bottom <= hr.top, hintVisible: getComputedStyle(h).opacity, onTop: !!top?.closest('.extraMesButtons'), n: [...p.children].filter(c => c.getBoundingClientRect().width > 0).length };
    }, [mid, R]);
    await page.mouse.click(900, 120);
    await T.sleep(700);
    out.popoverClosed = await page.evaluate(id => !document.querySelector(`#chat .mes[mesid="${id}"] .extraMesButtons`).classList.contains('visible'), mid);
    // copy button (moved into the row) still works through ST's delegated handler
    await page.hover(`#chat .mes[mesid="${mid}"] .mes_text`);
    await page.click(`#chat .mes[mesid="${mid}"] .mes_copy`);
    await T.sleep(500);
    out.copyToast = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim().slice(0, 30)));
    // edit (pencil) → ST edit mode → cancel
    await page.hover(`#chat .mes[mesid="${mid}"] .mes_text`);
    await page.click(`#chat .mes[mesid="${mid}"] .mes_edit`);
    await T.sleep(500);
    out.edit = await page.evaluate(id => ({ textarea: !!document.querySelector(`#chat .mes[mesid="${id}"] .edit_textarea`), editButtons: getComputedStyle(document.querySelector(`#chat .mes[mesid="${id}"] .mes_edit_buttons`)).display }), mid);
    await T.shot(page, `edit-${T.cfg.w}`);
    await page.click(`#chat .mes[mesid="${mid}"] .mes_edit_cancel`);
    await T.sleep(400);
    out.editCancelled = await page.evaluate(id => !document.querySelector(`#chat .mes[mesid="${id}"] .edit_textarea`), mid);
    // ← / → keys swipe the last message (ST shortcuts) — the capsule follows
    await page.click('#send_textarea');
    const c0 = norm(await page.evaluate(() => document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent));
    await page.keyboard.press('ArrowLeft');
    await T.sleep(900);
    out.keySwipe = { before: c0, after: norm(await page.evaluate(() => document.querySelector('#chat .mes.last_mes .swipes-counter')?.textContent)) };
    out.errors = T.errors(page);
    return out;
}

// ------------------------------------------------------------------ teardown: AG Dark ⇄ AG2, ?classic
const shellState = page => page.evaluate(() => {
    const tpl = document.querySelector('#message_template .mes_buttons');
    const last = document.querySelector('#chat .mes.last_mes');
    return {
        body: [...document.body.classList].filter(c => c.startsWith('ag2')),
        bodyVars: ['--ag2-dock-h', '--ag2-wand-left'].filter(v => document.body.style.getPropertyValue(v)),
        idNodes: [...document.querySelectorAll('[id^="ag2-"]')].map(e => e.id).slice(0, 6),
        classNodes: [...document.querySelectorAll('[class*="ag2-"]')].map(e => e.id || e.className).slice(0, 6),
        dataAttrs: document.querySelectorAll('[data-ag2-day], [data-ag2-model], [data-ag2-time]').length,
        templateCopyIn: tpl.querySelector(':scope > .mes_copy') ? 'row' : tpl.querySelector('.extraMesButtons > .mes_copy') ? 'more' : '?',
        templateBranchIn: tpl.querySelector(':scope > .mes_create_branch') ? 'row' : tpl.querySelector('.extraMesButtons > .mes_create_branch') ? 'more' : '?',
        lastCopyIn: last?.querySelector('.mes_buttons > .mes_copy') ? 'row' : last?.querySelector('.extraMesButtons > .mes_copy') ? 'more' : '?',
        noConnText: document.getElementById('send_textarea').getAttribute('no_connection_text'),
        options: getComputedStyle(document.getElementById('options_button')).display,
        wand: getComputedStyle(document.getElementById('extensionsMenuButton')).display,
        mes: document.querySelectorAll('#chat .mes').length,
        mesDisplay: last ? getComputedStyle(last).display : null,
    };
});

async function themes(T) {
    const out = {};
    const { page } = await enter(T);
    out.ag2 = await shellState(page);
    await page.evaluate(() => { $('#themes').val('Apple Glass Dark').trigger('change'); });
    await T.sleep(3000);
    out.dark = await shellState(page);
    out.dark.scan = await T.scan(page, ['#chat']);
    delete out.dark.scan.detail;
    out.dark.gen = await genChecks(T, page);
    await T.shot(page, `theme-dark-${T.cfg.w}`);
    await page.evaluate(() => { $('#themes').val('Apple Glass 2').trigger('change'); });
    await T.sleep(3000);
    out.ag2Again = await shellState(page);
    out.ag2Again.scan = await T.scan(page, ['#chat']);
    delete out.ag2Again.scan.detail;
    await T.shot(page, `theme-ag2-again-${T.cfg.w}`);
    out.errors = T.errors(page);
    // ?classic: shell (and the template patch) never runs
    const p2 = await T.newPage();
    await T.prepare(p2, process.argv.includes('--mem') ? { theme: 'ag2' } : {});
    await T.boot(p2, { query: '?classic', settle: 2500 });
    await T.openChat(p2, await T.longChat(p2), 20);
    out.classic = await shellState(p2);
    out.classic.errors = T.errors(p2).filter(e => !/FilesPluginApi|LittleWhiteBox_CommonSettings|Failed to load resource/.test(e));
    return out;
}

// ------------------------------------------------------------------ slash-command run: ST's ▶ ❚❚ ■ in the island
async function script(T) {
    const out = {};
    const { page } = await enter(T);
    await page.fill('#send_textarea', '/delay 3000');
    await page.click('#send_but');
    await T.sleep(700);
    out.running = await page.evaluate(rs => {
        const f = eval(rs);
        return { executing: document.getElementById('form_sheld').classList.contains('isExecutingCommandsFromChatInput'),
            buttons: [...document.querySelectorAll('#rightSendForm .stscript_btn')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.id + '@' + f(b.getBoundingClientRect())),
            sendHidden: getComputedStyle(document.getElementById('send_but')).visibility };
    }, R);
    await T.shot(page, `script-running-${T.cfg.w}`);
    await page.click('#stscript_stop').catch(e => { out.stopClick = String(e.message).split('\n')[0]; });
    await T.sleep(800);
    out.after800 = await page.evaluate(() => document.getElementById('form_sheld').classList.contains('isExecutingCommandsFromChatInput'));
    await T.sleep(2500);
    out.after = await page.evaluate(() => ({ executing: document.getElementById('form_sheld').classList.contains('isExecutingCommandsFromChatInput'), send: getComputedStyle(document.getElementById('send_but')).visibility }));
    out.errors = T.errors(page);
    return out;
}

// ------------------------------------------------------------------ jump-to-latest pill sits above island + QR row
async function jump(T) {
    const out = {};
    const { page } = await enter(T);
    await page.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = 0; c.dispatchEvent(new Event('scroll')); });
    await T.sleep(900);
    out.up = await page.evaluate(rs => {
        const f = eval(rs), j = document.getElementById('ap-jump-latest'), q = document.getElementById('qr--bar'), s = document.getElementById('send_form');
        const jr = j?.getBoundingClientRect(), qr = q?.getBoundingClientRect(), sr = s.getBoundingClientRect();
        return { exists: !!j, visible: !!j && j.classList.contains('is-visible') && getComputedStyle(j).opacity !== '0',
            pill: jr && f(jr), qr: qr && f(qr), island: f(sr),
            aboveIsland: !!jr && jr.bottom <= sr.top, aboveQr: !!jr && (!qr || !qr.height || jr.bottom <= qr.top + 1),
            hasBlur: !!j && getComputedStyle(j).backdropFilter !== 'none' };
    }, R);
    await T.shot(page, `jump-${T.cfg.w}`);
    await page.click('#ap-jump-latest').catch(e => { out.clickErr = String(e.message).split('\n')[0]; });
    await T.sleep(3000);
    out.after = await page.evaluate(() => { const c = document.getElementById('chat'); return { atBottom: c.scrollHeight - c.scrollTop - c.clientHeight < 40, gap: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight), top: Math.round(c.scrollTop), hidden: !document.getElementById('ap-jump-latest')?.classList.contains('is-visible'), scrollY: window.scrollY }; });
    out.errors = T.errors(page);
    return out;
}

export default async function (T) {
    const parts = { shots, gen, stream, model, offline, plus, multiline, styles, hover, themes, script, jump };
    const want = String(T.cfg.part || 'shots').split(',');
    const out = {};
    for (const p of want) {
        if (!parts[p]) throw new Error('unknown part ' + p);
        try { out[p] = await parts[p](T); } catch (e) { out[p] = { ERROR: String(e.stack || e).split('\n').slice(0, 3).join(' | ') }; }
        await T.save('p1b-' + p, out[p]);
    }
    return out;
}
