// Run through run.mjs. Native save/reopen and presentation lifecycle regressions.
import assert from 'node:assert/strict';

export default async function(T) {
    const page = await T.newPage();
    await T.prepare(page);
    await T.boot(page, { ag2: true });
    await page.click(T.cfg.phone ? '#ag2-tabbar [data-tab="settings"]' : '#ag2-sidebar [data-act="settings"]');
    await T.sleep(500);
    const nav = page.locator('#ag2-settings [data-page="ai"]');
    await nav.scrollIntoViewIfNeeded(); await nav.click(); await T.sleep(900);
    if (T.cfg.phone) {
        await page.click('.ag2-preset-more');
        assert.equal(await page.locator('#ag2-preset-menu .ag2-menu-item').count(), 5);
        const old = await page.locator('#bind_preset_to_connection').isChecked();
        await page.locator('#ag2-preset-menu .ag2-menu-item').first().click();
        assert.equal(await page.locator('#bind_preset_to_connection').isChecked(), !old);
    }
    const edit = async () => {
        await page.evaluate(() => document.querySelector('#completion_prompt_manager_list .prompt-manager-edit-action').click());
        await T.sleep(400);
    };
    await edit();
    const triggers = page.locator('.ag2-prompt-triggers input');
    await triggers.nth(0).check(); await triggers.nth(1).check();
    const position = page.locator('#completion_prompt_manager_popup_entry_form_injection_position');
    await position.selectOption('1');
    const depth = page.locator('#completion_prompt_manager_popup_entry_form_injection_depth');
    await depth.fill('7');
    await position.selectOption('0');
    assert.equal(await page.locator('#completion_prompt_manager_depth_block').isVisible(), false);
    await position.selectOption('1');
    assert.equal(await depth.inputValue(), '7');
    const save = page.locator('#completion_prompt_manager_popup_entry_form_save');
    await save.focus(); await page.keyboard.press('Enter'); await T.sleep(400);
    assert.equal(await page.locator('#completion_prompt_manager_popup').isVisible(), false);
    await edit();
    assert.equal(await depth.inputValue(), '7');
    assert.equal(await triggers.nth(0).isChecked(), true);
    assert.equal(await triggers.nth(1).isChecked(), true);
    const box = await save.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height);
    await T.shot(page, 'ui-detail-prompt', { animations: 'allow' });
    const lifecycle = await page.evaluate(async () => {
        const build = document.querySelector('#ag2-shell').dataset.build;
        const m = await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/prompt.js?v=${build}`);
        const select = document.getElementById('completion_prompt_manager_popup_entry_form_injection_trigger');
        const values = () => [...select.selectedOptions].map(o => o.value);
        const before = values(); m.unmount();
        const cleaned = !document.querySelector('.ag2-prompt-triggers') && !select.classList.contains('ag2-prompt-native');
        m.mount(); m.mount();
        return { before, after: values(), cleaned, groups: document.querySelectorAll('.ag2-prompt-triggers').length };
    });
    assert.deepEqual(lifecycle.before, lifecycle.after);
    assert.ok(lifecycle.cleaned); assert.equal(lifecycle.groups, 1);
    return { ok: true, lifecycle, errors: T.errors(page) };
}
