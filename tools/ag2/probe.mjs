// tools/ag2/probe.mjs — ad-hoc DOM probe while developing (prints small JSON only).
//   node tools/ag2/run.mjs tools/ag2/probe.mjs --phase P1b-dev [--real] [--shot name]
// PROBE env: JS expression evaluated in the page after the long chat is open.
export default async function (T) {
    const real = process.argv.includes('--real');
    const page = await T.newPage();
    await T.prepare(page, real ? {} : { theme: 'ag2' });
    await T.boot(page, { ag2: true, settle: 1500 });
    await T.openChat(page, await T.longChat(page));
    const out = {};
    if (process.env.PROBE) out.probe = await page.evaluate(process.env.PROBE);
    const shot = T.cfg.tag || '';
    if (shot) await T.shot(page, shot);
    out.errors = T.errors(page);
    return out;
}
