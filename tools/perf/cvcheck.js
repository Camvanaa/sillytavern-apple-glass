// cvcheck: does content-visibility:auto break scroll geometry, iframes or paint? (no timing here)
await H.setup();
CFG.settle = 1500; CFG.settleChat = 2500;
await H.boot();
await H.openChar();
const O = OVERRIDE;
const CV = `${O} #chat .mes{content-visibility:auto!important;contain-intrinsic-size:auto ${CFG.cis || 500}px!important}`;
const geo = () => H.ev(() => { const c = document.querySelector('#chat'); return { top: Math.round(c.scrollTop), sh: c.scrollHeight, ch: c.clientHeight, fromEnd: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight), winY: window.scrollY, ifr: [...document.querySelectorAll('#chat .TH-render iframe')].map(f => Math.round(f.getBoundingClientRect().height)) }; });
const out = {};
await H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; });
await sleep(500);
out.noCv = await geo();
await H.shot('cv-off-bottom');
await H.ev(() => { document.querySelector('#chat').scrollTop = 1500; });
await sleep(500);
await H.shot('cv-off-mid');
await H.setCss(CV);
await sleep(600);
out.cvAfterApplyMid = await geo();
await H.shot('cv-on-mid');
await H.ev(() => { document.querySelector('#chat').scrollTop = 1e6; });
await sleep(700);
out.cvJumpEnd1 = await geo();
await sleep(700);
out.cvJumpEnd2 = await geo();
await H.shot('cv-on-bottom');
// scroll position jitter: walk up in steps, record how far the anchored message moved on screen
out.walk = await H.ev(async () => {
    const c = document.querySelector('#chat'), r = [];
    for (let i = 0; i < 12; i++) {
        const before = c.scrollHeight;
        c.scrollTop -= 1400;
        await new Promise(x => requestAnimationFrame(() => requestAnimationFrame(x)));
        r.push(c.scrollHeight - before);
    }
    return r;
});
await H.save('cvcheck', out);
return out;
