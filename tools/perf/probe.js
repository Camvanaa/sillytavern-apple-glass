// probe: boot + open the 13-message chat, then describe what animates.
await H.setup();
const out = {};
out.boot = await H.boot();
const tOpen = Date.now();
await H.openChar();
out.openMs = Date.now() - tOpen;
out.mes = await H.ev(() => document.querySelectorAll('#chat .mes').length);
out.iframes = await H.ev(() => [...document.querySelectorAll('#chat .TH-render iframe')].map(f => Math.round(f.getBoundingClientRect().height)));
out.logsAfterOpen = await H.logs();
out.inventory = await H.inventory();
out.blur = await H.blurStats();
// user-settings drawer open/close, sampled per frame
await H.resetLogs();
out.drawerOpen = H.compact(await H.sampleFrames('#user-settings-block', () => H.ev(() => document.querySelector('#user-settings-button > .drawer-toggle').click()), 700), ['d', 'op', 'tf', 'h']);
out.drawerOpenLogs = await H.logs();
await H.resetLogs();
out.drawerClose = H.compact(await H.sampleFrames('#user-settings-block', () => H.ev(() => document.querySelector('#user-settings-button > .drawer-toggle').click()), 700), ['d', 'op', 'tf', 'h']);
out.drawerCloseLogs = await H.logs();
// right rail
await H.resetLogs();
out.railOpen = H.compact(await H.sampleFrames('#right-nav-panel', () => H.ev(() => document.querySelector('#rightNavHolder > .drawer-toggle').click()), 700), ['d', 'op', 'tf', 'x', 'h']);
out.railOpenLogs = await H.logs();
await H.resetLogs();
out.railClose = H.compact(await H.sampleFrames('#right-nav-panel', () => H.ev(() => document.querySelector('#rightNavHolder > .drawer-toggle').click()), 700), ['d', 'op', 'tf', 'x', 'h']);
out.railCloseLogs = await H.logs();
return out;
