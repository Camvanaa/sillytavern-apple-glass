// tools/ag2/p1a-dev.mjs — quick P1a shell check (in-memory AG2 theme unless --real).
//   node tools/ag2/run.mjs tools/ag2/p1a-dev.mjs --phase P1a-dev [--w 1440] [--real]
export default async function (T) {
    const real = process.argv.includes('--real');
    const page = await T.newPage();
    await T.prepare(page, real ? {} : { theme: 'ag2' });
    const b = await T.boot(page, { ag2: true, settle: 2500 });
    const out = { readyMs: b.readyMs };
    out.welcome = await page.evaluate(() => ({
        body: document.body.className.split(/\s+/).filter(c => c.startsWith('ag2')).join(' '),
        rows: document.querySelectorAll('#ag2-sidebar .ag2-chat-row').length,
        secs: [...document.querySelectorAll('#ag2-sidebar .ag2-sec')].map(e => e.textContent).join('|'),
        cards: document.querySelectorAll('#ag2-welcome .ag2-wel-card').length,
        conn: document.querySelector('.ag2-conn-text')?.textContent,
        persona: document.querySelector('.ag2-persona-name')?.textContent,
        openDrawers: [...document.querySelectorAll('.openDrawer')].map(e => e.id).join(' '),
        times: [...document.querySelectorAll('#ag2-sidebar .ag2-chat-row')].map(r => r.querySelector('.ag2-row-name').textContent + '@' + r.querySelector('.ag2-row-time').textContent + '/' + r.querySelector('.ag2-row-sub').textContent.slice(0, 18)),
    }));
    await T.shot(page, `welcome-${T.cfg.w}`);
    // open the long chat by clicking its sidebar row
    await page.click('#ag2-sidebar .ag2-chat-row >> nth=0');
    await page.waitForFunction(() => document.querySelectorAll('#chat .mes').length > 3, null, { timeout: 30000 });
    await T.sleep(1500);
    out.chat = await page.evaluate(() => ({
        cur: SillyTavern.getContext().getCurrentChatId(),
        title: document.querySelector('.ag2-title-name')?.textContent, sub: document.querySelector('.ag2-title-sub')?.textContent,
        active: document.querySelector('#ag2-sidebar .ag2-row.ag2-on .ag2-row-name')?.textContent,
        welcome: document.body.classList.contains('ag2-welcome'),
        sheld: (r => [r.left, r.top, r.width, r.height].map(Math.round).join(','))(document.getElementById('sheld').getBoundingClientRect()),
        mes0: (r => [r.left, r.width].map(Math.round).join(','))(document.querySelector('#chat .mes').getBoundingClientRect()),
    }));
    out.scan = await T.scan(page, ['#ag2-sidebar .ag2-side-list']);
    await T.shot(page, `chat-${T.cfg.w}`);
    out.errors = T.errors(page);
    return out;
}
