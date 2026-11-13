import assert from 'node:assert/strict';

export default async function(T) {
    const page = await T.newPage();
    await T.prepare(page, { powerUser: { reduced_motion: T.cfg.reduced } });
    await T.boot(page, { ag2: true });
    await page.evaluate(async () => {
        const build = document.querySelector('#ag2-shell').dataset.build;
        window.mf = await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/settings.js?v=${build}`);
    });
    const out = { ok: false, phone: T.cfg.phone, checks: {}, shots: [] };
    const stable = async (pageName, level = 'page') => {
        await page.waitForFunction(({pageName,level}) => mf.isOpen() && !mf.isNavigating()
            && mf.currentPage() === pageName && (!document.body.classList.contains('ag2-phone')
            || document.querySelector('#ag2-settings').dataset.level === level), {pageName,level}, {timeout:10000});
    };
    // The audited fresh-phone sequence; real Esc in the non-cancellable host wait.
    await page.evaluate(() => { void mf.open('api'); });
    await T.sleep(45);
    await page.evaluate(() => { void mf.go('ai'); });
    await T.sleep(45);
    await page.evaluate(() => { void mf.go('fmt'); document.querySelector('#ag2-settings').focus(); });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { void mf.close(); void mf.open('look'); });
    await stable('look');
    assert.equal(await page.locator('#ag2-read-size').count(), 1);
    assert.equal(await page.locator('.drawer-content.openDrawer').count(), 0);
    out.checks.AV01 = true;
    await page.evaluate(() => mf.close());
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#ag2-palette[open]');
    await page.locator('.ag2-pal-input').fill('api');
    await page.waitForSelector('#ag2-pal-list [role=option]');
    await T.sleep(500);
    await page.keyboard.press('ArrowDown');
    const selection = await page.locator('.ag2-pal-input').getAttribute('aria-activedescendant');
    await page.evaluate(async () => {
        const m = await import('/scripts/popup.js');
        void m.callGenericPopup('中性嵌套测试', m.POPUP_TYPE.INPUT, 'test');
    });
    await page.waitForSelector('dialog.popup[open]');
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#ag2-palette[open]').count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.popup[open]', {state:'detached'});
    assert.equal(await page.locator('#ag2-palette[open]').count(), 1);
    assert.equal(await page.locator('.ag2-pal-input').inputValue(), 'api');
    assert.equal(await page.locator('.ag2-pal-input').getAttribute('aria-activedescendant'), selection);
    out.checks.AV02 = true;
    await page.keyboard.press('Escape');
    out.ok = true;
    return out;
}
