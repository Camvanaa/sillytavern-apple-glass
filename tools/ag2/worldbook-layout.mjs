// Guarded UI regression: collapsed hierarchy, conditional depth and shared switch edge.
import assert from 'node:assert/strict';
export default async function(T) {
    const page = await T.newPage();
    await T.prepare(page); await T.boot(page, { ag2: true });
    await page.click(T.cfg.phone ? '#ag2-tabbar [data-tab="settings"]' : '#ag2-sidebar [data-act="settings"]');
    await T.sleep(400);
    const nav = page.locator('#ag2-settings [data-page="wi"]');
    await nav.scrollIntoViewIfNeeded(); await nav.click(); await T.sleep(800);
    await page.evaluate(() => { const s = document.querySelector('#world_editor_select'); s.selectedIndex = 1; $(s).trigger('change'); });
    await T.sleep(700);
    const entry = page.locator('#world_popup_entries_list .world_entry').first();
    if (T.cfg.phone) assert.equal(await entry.locator('.WIEnteryHeaderControls').isVisible(), false);
    await entry.locator(T.cfg.phone ? '.ag2-wi-summary' : '.inline-drawer-toggle').first().click(); await T.sleep(300);
    assert.equal(await entry.locator('.WIEnteryHeaderControls').isVisible(), true);
    await entry.locator('select[name="position"]').selectOption({ value: '4' });
    assert.equal(await entry.locator('input[name="depth"]').isVisible(), true);
    await entry.locator('select[name="position"]').selectOption('0');
    if (T.cfg.phone) assert.equal(await entry.locator('input[name="depth"]').locator('..').isVisible(), false);
    await entry.locator('input[name="group"]').scrollIntoViewIfNeeded();
    const edges = await entry.locator('label[for="groupOverride"],label[for="character_exclusion"]').evaluateAll(es => es.map(e => {
        const i = e.querySelector('input').getBoundingClientRect(), t = e.querySelector('span').getBoundingClientRect(), r = e.parentElement.getBoundingClientRect();
        return { right: i.right - r.right, center: i.y + i.height / 2 - t.y - t.height / 2 };
    }));
    assert.ok(edges.every(e => Math.abs(e.right) < 2 && Math.abs(e.center) < 2));
    const content = await entry.locator('textarea[name="content"]').boundingBox();
    assert.ok(content.width > 250);
    await T.shot(page, 'worldbook-aligned', { animations: 'allow' });
    return { ok: true, edges, errors: T.errors(page) };
}
