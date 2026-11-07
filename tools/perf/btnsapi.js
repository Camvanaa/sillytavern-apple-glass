// btnsapi: API Connections panel, every main API and Chat Completion source.
// Only <select> changes (settings saves are stubbed, backend status calls aborted).
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = 2000; CFG.settleChat = 3500;
await H.boot();
await H.openChar();
const src = await (await fetch('http://127.0.0.1:8799/btnscan.js?' + Date.now())).text();
const tag = (CFG.v || 'x') + '-' + (CFG.w || 1440);
await H.ev(() => document.querySelector('#sys-settings-button > .drawer-toggle').click());
await sleep(900);
const scan = async () => JSON.parse(await page.evaluate(`(${src})('#rm_api_block')`));
const ovf = () => H.ev(() => { const b = document.querySelector('#rm_api_block'); return b.scrollWidth - b.clientWidth; });
const out = { main: {}, cc: {} };
const mains = await H.ev(() => [...document.querySelectorAll('#main_api option')].map(o => o.value));
const orig = await H.ev(() => [$('#main_api').val(), $('#chat_completion_source').val()]);
const seen = new Set();
const shotBad = async (label, j) => {
    for (const b of j.bad) {
        if (seen.has(b.sel + b.txt)) continue;
        seen.add(b.sel + b.txt);
        const box = await H.ev(({ s, t }) => {
            const es = s.slice(s.indexOf('>') + 1);
            let list = []; try { list = [...document.querySelectorAll(es)]; } catch { return null; }
            const c = list.find(e => e.offsetParent && (e.innerText || '').replace(/\s+/g, ' ').trim().startsWith(t));
            if (!c) return null;
            c.scrollIntoView({ block: 'center' });
            const r = c.getBoundingClientRect(), x = Math.max(0, r.x - 160), y = Math.max(0, r.y - 30);
            return { x, y, width: Math.min(innerWidth - x, r.width + 220), height: Math.min(innerHeight - y, r.height + 60) };
        }, { s: b.sel, t: b.txt });
        if (box && box.width > 4) { await sleep(120); await page.screenshot({ path: `/opt/server-agent/workspace/st-testdata/fix-shots/p2-${tag}-api-${label}.png`, clip: box, animations: 'disabled', caret: 'hide' }); }
    }
};
for (const m of mains) {
    await H.ev(v => $('#main_api').val(v).trigger('change'), m);
    await sleep(700);
    const j = await scan();
    out.main[m] = { n: j.n, ovf: await ovf(), bad: j.bad.map(b => `${b.sel} "${b.txt}" ${b.w}x${b.h} ${b.why}`) };
    await shotBad(m, j);
}
await H.ev(() => $('#main_api').val('openai').trigger('change'));
await sleep(600);
const srcs = await H.ev(() => [...document.querySelectorAll('#chat_completion_source option')].map(o => o.value));
for (const s of srcs.slice(0, CFG.maxSrc || 99)) {
    await H.ev(v => $('#chat_completion_source').val(v).trigger('change'), s);
    await sleep(450);
    const j = await scan();
    if (j.bad.length) out.cc[s] = { n: j.n, bad: j.bad.map(b => `${b.sel} "${b.txt}" ${b.w}x${b.h} ${b.why}`) };
    out.ccOvf = Math.max(out.ccOvf || 0, await ovf());
    await shotBad('cc-' + s, j);
}
out.ccScanned = srcs.length;
// Text Completion backends (koboldcpp, llamacpp, ollama, …) show different rows
await H.ev(() => $('#main_api').val('textgenerationwebui').trigger('change'));
await sleep(600);
const tgs = await H.ev(() => [...document.querySelectorAll('#textgen_type option')].map(o => o.value));
const tgOrig = await H.ev(() => $('#textgen_type').val());
out.tg = {};
for (const t of tgs) {
    await H.ev(v => $('#textgen_type').val(v).trigger('change'), t);
    await sleep(400);
    const j = await scan();
    if (j.bad.length) out.tg[t] = { n: j.n, bad: j.bad.map(b => `${b.sel} "${b.txt}" ${b.w}x${b.h} ${b.why}`) };
    out.tgOvf = Math.max(out.tgOvf || 0, await ovf());
    await shotBad('tg-' + t, j);
}
out.tgScanned = tgs.length;
await H.ev(v => $('#textgen_type').val(v).trigger('change'), tgOrig);
await H.ev(o => { $('#main_api').val(o[0]).trigger('change'); $('#chat_completion_source').val(o[1]).trigger('change'); }, orig);
await H.save('btnsapi', out);
return out;
