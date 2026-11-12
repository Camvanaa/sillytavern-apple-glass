// C receipt: one-line ellipsis → click/tap/keyboard → full content, never edits the message.
// node tools/ag2/run.mjs tools/ag2/r3a-c.mjs --phase R3a [--phone]
import assert from 'node:assert/strict';

export default async function (T) {
    const page = await T.newPage();
    await T.prepare(page);
    await T.boot(page, { ag2: true });
    await T.openChat(page, await T.longChat(page));
    const text = '口'.repeat(90);
    await page.evaluate(async text => {
        await SillyTavern.getContext().executeSlashCommandsWithOptions('/sendas name="Ny规则定下的走向" compact=true ' + text);
    }, text);
    await T.sleep(700);
    const sel = '#chat .mes.last_mes';
    const txt = sel + ' .mes_text';
    const facts = () => page.evaluate(sel => {
        const m = document.querySelector(sel), t = m.querySelector('.mes_text');
        const q = t.getBoundingClientRect(), cs = getComputedStyle(t);
        const b = m.querySelector('.mes_block').getBoundingClientRect();
        return { lines: Math.round(q.height / parseFloat(cs.lineHeight)), open: m.classList.contains('ag2-ssb-open'),
            aria: t.getAttribute('aria-expanded'), clamp: t.dataset.ag2Clamp, text: t.textContent,
            inside: b.left >= 0 && b.right <= innerWidth && t.scrollWidth <= t.clientWidth + 1,
            aboveComposer: b.bottom <= document.getElementById('form_sheld').getBoundingClientRect().top,
            style: cs.display, modelText: SillyTavern.getContext().chat.at(-1).mes };
    }, sel);
    const clickText = async () => {
        await page.locator(txt).scrollIntoViewIfNeeded();
        if (T.cfg.phone) await page.tap(txt); else await page.click(txt);
        await T.sleep(300);
    };
    const view = T.cfg.phone ? 'phone' : 'desk';
    const result = { styles: {} };
    for (const style of [0, 3, 4, 5, 6]) {
        await page.evaluate(v => $('#chat_display').val(String(v)).trigger('change'), style);
        await T.sleep(400);
        await page.locator(txt).scrollIntoViewIfNeeded();
        const collapsed = await facts();
        assert.equal(collapsed.lines, 1);
        assert.equal(collapsed.aria, 'false');
        await clickText();
        const expanded = await facts();
        assert.ok(expanded.open && expanded.lines >= 2 && expanded.inside && expanded.aboveComposer, JSON.stringify(expanded));
        assert.equal(expanded.aria, 'true');
        assert.equal(expanded.text, text);
        assert.equal(expanded.modelText, text);
        await T.shot(page, `C-${view}-style${style}-expanded`);
        await clickText();
        assert.equal((await facts()).lines, 1);
        if (style === 0) await T.shot(page, `C-${view}-collapsed`);
        const sc = await T.scan(page, ['#chat']);
        for (const k of ['ovf', 'dbl', 'unhid', 'nest', 'btn']) assert.equal(sc[k], 0, k);
        result.styles[style] = { collapsed, expanded, scan: Object.fromEntries(['ovf','dbl','unhid','nest','btn'].map(k => [k, sc[k]])) };
    }
    await page.locator(txt).focus();
    await page.keyboard.press('Enter');
    assert.equal((await facts()).aria, 'true');
    await page.keyboard.press('Space');
    assert.equal((await facts()).aria, 'false');
    result.keyboard = true;
    await clickText();
    await page.locator(sel + ' .mes_edit').click();
    await page.waitForSelector(sel + ' .edit_textarea');
    assert.equal(await page.locator(sel + ' .edit_textarea').inputValue(), text);
    await T.shot(page, `C-${view}-edit`);
    await page.locator(sel + ' .mes_edit_cancel').click();
    result.edit = true;
    // Theme teardown removes every temporary receipt attribute / handler.
    await page.evaluate(() => $('#themes').val('Apple Glass Dark').trigger('change'));
    await T.sleep(1500);
    result.teardown = await page.evaluate(() => ({ ag2: document.body.classList.contains('ag2'),
        residue: document.querySelectorAll('#chat [data-ag2-clamp], #chat .ag2-ssb-open, #chat .ag2-ssb-bar').length }));
    assert.equal(result.teardown.ag2, false);
    assert.equal(result.teardown.residue, 0);
    result.ok = true;
    return result;
}
