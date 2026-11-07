// adhoc: boot + open the test chat (unless CFG.noChat), then run CFG.code — the body
// of an async function that sees page, H, CFG and sleep. For one-off probes.
await H.setup();
await page.route('**/api/backends/**', r => r.abort());
CFG.settle = CFG.settle ?? 2000; CFG.settleChat = CFG.settleChat ?? 3500;
await H.boot();
if (!CFG.noChat) await H.openChar();
const AFn = (async () => {}).constructor;
return await new AFn('page', 'H', 'CFG', 'sleep', CFG.code)(page, H, CFG, sleep);
