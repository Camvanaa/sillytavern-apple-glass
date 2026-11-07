// abdrawer: which part of the drawer transition causes per-frame layout?
await H.setup();
CFG.settle = 1500; CFG.settleChat = 2500;
await H.boot();
await H.openChar();
const O = OVERRIDE + ' #top-settings-holder > .drawer > .drawer-content';
const dur = '320ms cubic-bezier(0.22,1,0.36,1)';
const ALL = {
    asIs: '',
    opacityOnly: `${O}{transition:opacity ${dur},display 320ms allow-discrete!important} ${O}.closedDrawer,${O}.fillRight.closedDrawer{transform:none!important} @starting-style{${O}.openDrawer,${O}.fillRight.openDrawer{transform:none!important}}`,
    noDisplayTr: `${O}{transition:opacity ${dur},transform ${dur}!important}`,
    noTransition: `${O}{transition:none!important}`,
    noStarting: `@starting-style{${O}.openDrawer,${O}.fillRight.openDrawer{opacity:1!important;transform:none!important}}`,
};
const V = Object.fromEntries((CFG.variants || Object.keys(ALL)).map(k => [k, ALL[k]]));
const res = {};
for (let r = 0; r < (CFG.rounds || 2); r++) for (const n of Object.keys(V)) {
    await H.setCss(V[n]);
    const a = await H.drawerCost(CFG.drawer || 'rightNavHolder', { openWait: 700, closeWait: 600 });
    (res[n] = res[n] || []).push({ o: [a.open.layouts, a.open.layoutMs, a.open.taskMs, a.open.frames], c: [a.close.layouts, a.close.layoutMs, a.close.taskMs, a.close.frames] });
}
await H.save('abdrawer', res);
return res;
