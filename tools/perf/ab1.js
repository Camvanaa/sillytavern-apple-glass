// ab1: is the bubble blur visible? + scroll cost of blur / mask / shadow (in-page A/B)
await H.setup();
const out = {};
await H.boot();
await H.openChar();
if (CFG.cpuLate) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CFG.cpuLate });
const O = OVERRIDE;
const ALL = {
    base: '',
    noBubbleBlur: `${O} #chat .mes .mes_block{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}`,
    noMask: `${O} #chat{mask-image:none!important;-webkit-mask-image:none!important}`,
    noBlurNoMask: `${O} #chat .mes .mes_block{backdrop-filter:none!important;-webkit-backdrop-filter:none!important} ${O} #chat{mask-image:none!important;-webkit-mask-image:none!important}`,
    noShadow: `${O} #chat .mes .mes_block, ${O} #chat .mes .avatar{box-shadow:none!important}`,
    noSaturate: `${O} #chat .mes .mes_block{backdrop-filter:blur(26px)!important;-webkit-backdrop-filter:blur(26px)!important}`,
};
ALL.nbbNoMask = ALL.noBubbleBlur + ALL.noMask;
ALL.nbbCV = ALL.noBubbleBlur + `${O} #chat .mes{content-visibility:auto!important;contain-intrinsic-size:auto 500px!important}`;
ALL.nbbNoShadow = ALL.noBubbleBlur + ALL.noShadow;
const V = Object.fromEntries((CFG.variants || Object.keys(ALL)).map(k => [k, ALL[k]]));
if (CFG.shots) {
    await H.ev(() => { document.querySelector('#chat').scrollTop = 1200; });
    await sleep(500);
    out.shots = {};
    for (const n of Object.keys(V)) {
        await H.setCss(V[n]);
        await sleep(300);
        out.shots[n] = await H.shot((CFG.run || 'ab1') + '-' + n);
    }
    await H.setCss('');
    return out;
}
out.sup = await H.ev(() => ({ app: CSS.supports('-webkit-app-region', 'drag'), appleFont: CSS.supports('font', '-apple-system-body'), rule: CSS.supports('(-webkit-app-region: drag) and (not (font: -apple-system-body))') }));
out.chatH = await H.ev(() => [document.querySelector('#chat').scrollHeight, document.querySelector('#chat').clientHeight]);
out.raf = await H.save('raf', await H.abScroll(V, { rounds: CFG.rounds || 3, mode: 'raf', px: CFG.px || 40, frames: CFG.frames || 90 }));
return out;
