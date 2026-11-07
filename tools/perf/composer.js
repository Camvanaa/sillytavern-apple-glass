// composer: #nonQRFormItems geometry with short / 5-line / 30-line / long unbroken input.
// Never sends; the textarea is cleared at the end. CFG.v names the screenshots.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = 2000; CFG.settleChat = 3500;
await H.boot();
await H.openChar();
await H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; });
const tag = (CFG.v || 'x') + '-' + (CFG.w || 1440);
const cases = {
    short: 'test',
    l5: Array(5).fill('test').join('\n'),
    l30: Array(30).fill('test').join('\n'),
    long: 'x'.repeat(40) + 'https://example.com/' + 'a1b2c3d4e5'.repeat(60),
};
const measure = () => H.ev(() => {
    const q = s => document.querySelector(s), R = e => e.getBoundingClientRect();
    const pill = q('#nonQRFormItems'), ta = q('#send_textarea'), cs = getComputedStyle(pill), ts = getComputedStyle(ta);
    const p = R(pill), t = R(ta), chat = R(q('#chat'));
    const btn = [...document.querySelectorAll('#leftSendForm > div, #rightSendForm > div')].filter(e => e.offsetParent).map(e => R(e));
    const radius = parseFloat(cs.borderTopLeftRadius);
    const r = Math.min(radius, p.height / 2, p.width / 2);
    // first text pixel (content box top-left) must sit inside the rounded corner
    const x0 = t.left - p.left + parseFloat(ts.paddingLeft), y0 = t.top - p.top + parseFloat(ts.paddingTop);
    const inCorner = !(x0 < r && y0 < r) || Math.hypot(r - x0, r - y0) <= r;
    const qr = q('#qr--bar') || q('#qr-bar');
    const qrTop = qr && qr.offsetParent ? Math.round(R(qr).top) : null;
    return {
        pill: [Math.round(p.width), Math.round(p.height)], radius: cs.borderTopLeftRadius, align: cs.alignItems,
        ta: { h: Math.round(t.height), sh: ta.scrollHeight, ch: ta.clientHeight, maxH: ts.maxHeight, ovY: ts.overflowY, inlineH: ta.style.height, sw: ta.scrollWidth, cw: ta.clientWidth },
        // button bottoms relative to the pill's bottom edge (0 = flush with the content box)
        btnBottomGap: btn.map(b => Math.round(p.bottom - b.bottom)), btnTopGap: btn.map(b => Math.round(b.top - p.top)),
        taInside: t.left >= p.left - 0.5 && t.right <= p.right + 0.5 && t.top >= p.top - 0.5 && t.bottom <= p.bottom + 0.5,
        inCorner, chatH: Math.round(chat.height), chatBottom: Math.round(chat.bottom), pillTop: Math.round(p.top), qrTop, vh: innerHeight,
        docOv: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth, scrollY: window.scrollY,
    };
});
// ST resizes on the native 'input' event (inline height: auto + field-sizing in
// Chromium, inline px height elsewhere), so fire a real one like a paste does.
const fill = x => H.ev(v => { const t = document.querySelector('#send_textarea'); t.focus(); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); t.setSelectionRange(0, 0); t.scrollTop = 0; }, x);
const out = {};
for (const [k, v] of Object.entries(cases)) {
    await fill(v);
    await sleep(700);
    out[k] = await measure();
    await H.shot(`p1-${tag}-${k}`);
}
await fill('');
await H.ev(() => document.querySelector('#send_textarea').blur());
await sleep(400);
out.cleared = await H.ev(() => ({ val: document.querySelector('#send_textarea').value.length, h: Math.round(document.querySelector('#nonQRFormItems').getBoundingClientRect().height) }));
await H.save('composer', out);
return out;
