// Guarded desktop/--phone regression: actual pointer hit-testing and native tokens.
import assert from 'node:assert/strict';

export default async function(T) {
    const page = await T.newPage();
    await T.prepare(page);
    await T.boot(page, { ag2: true });
    const spec = await T.longChat(page);
    if (T.cfg.phone) {
        await page.tap(`#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`);
        await T.sleep(1200);
        await page.tap('#ag2-title .ag2-title-btn');
    } else {
        await T.openChat(page, spec);
        if (!await page.evaluate(() => document.body.classList.contains('ag2-insp-open'))) await page.click('#ag2-tools [data-act="insp"]');
    }
    await T.sleep(400);
    await page.click('#ag2-insp-head [data-seg="chat"]');
    await page.click('#ag2-insp-chat [data-ag2-act="logprobs"]');
    await T.sleep(350);
    const hits = await page.locator('.ag2-logprobs-settings').evaluate(button => {
        const r = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    assert.ok(hits, 'close-button hit area must not cover panel body');
    const lifecycle = await page.evaluate(async () => {
        const build = document.getElementById('ag2-shell').dataset.build;
        const m = await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/logprobs.js?v=${build}`);
        m.unmount();
        const restored = document.querySelector('.logprobs_empty_state').textContent.includes('Request token probabilities');
        m.mount(); m.mount();
        return { restored, count: document.querySelectorAll('.ag2-logprobs-settings').length };
    });
    assert.ok(lifecycle.restored); assert.equal(lifecycle.count, 1);
    await page.evaluate(async () => {
        const { saveLogprobsForActiveMessage } = await import('/scripts/logprobs.js');
        saveLogprobsForActiveMessage([{ token: '你好', topLogprobs: [['你好', -0.2], ['欢迎', -2.1]] }], null);
    });
    await page.click('#logprobsViewerClose'); await T.sleep(300);
    await page.click('#ag2-insp-chat [data-ag2-act="logprobs"]'); await T.sleep(350);
    assert.equal(await page.locator('.ag2-logprobs-settings').count(), 0);
    const token = page.locator('#logprobs_generation_output .logprobs_output_token').first();
    await token.click();
    assert.ok((await token.getAttribute('class')).includes('selected'));
    await T.shot(page, 'token-selected', { animations: 'allow' });
    return { ok: true, hits, lifecycle, errors: T.errors(page) };
}
