// Extra S1 lifecycle/geometry checks: rapid switching, OS/ST motion, opaque fallback.
import assert from 'node:assert/strict';
import { checks } from './r2a.mjs';

export default async function(T) {
    const out = [];
    for (const width of [1440, 1280, 1000, 360]) {
        const page = await T.newPage({ phone: width === 360, w: width, h: 900 });
        if (width === 360) await page.setViewportSize({ width, height: 844 });
        await T.prepare(page, {}); await T.boot(page, { ag2: true });
        await T.openChat(page, await T.longChat(page));
        await page.evaluate(async () => {
            const b = document.getElementById('ag2-shell').dataset.build;
            window.s123Bridge = await import(`/scripts/extensions/third-party/SillyTavern-AppleGlassStyles/shell/util.js?v=${b}`);
            if (innerWidth > 1000) await s123Bridge.setInspector(true);
        });
        const switched = await page.evaluate(async () => {
            const seen = [];
            const ids = ['floatingPrompt', 'cfgConfig', 'logprobsViewer'];
            const selectors = ['#option_toggle_AN', '#option_toggle_CFG', '#option_toggle_logprobs'];
            for (let i = 0; i < 18; i++) {
                s123Bridge.clickSt(selectors[i % 3]);
                await new Promise(resolve => requestAnimationFrame(resolve));
                const open = ids.filter(id => s123Bridge.isFloatingOpen(id));
                seen.push({ expected: ids[i % 3], open });
            }
            return seen;
        });
        assert.ok(switched.every(s => s.open.length === 1 && s.open[0] === s.expected), JSON.stringify(switched));
        await page.evaluate(() => s123Bridge.clickSt('#option_toggle_AN'));
        await T.sleep(300);
        const bounds = await page.locator('#floatingPrompt').evaluate(e => {
            const r = e.getBoundingClientRect();
            const insp = document.getElementById('right-nav-panel').getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, leftOfInspector: innerWidth <= 1000 || r.right <= insp.left };
        });
        assert.ok(bounds.inView && bounds.leftOfInspector, JSON.stringify(bounds));
        const c = await checks(page, ['#floatingPrompt']);
        assert.deepEqual([c.clip, c.over, c.native], [[], [], []]);
        await T.shot(page, `edge-${width}-an`);
        const normal = await page.locator('#floatingPrompt').evaluate(e => getComputedStyle(e).animationDuration);
        assert.equal(normal, '0.18s');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const os = await page.locator('#floatingPrompt').evaluate(e => getComputedStyle(e).animationDuration);
        assert.ok(parseFloat(os) <= 0.00001);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => document.body.classList.add('reduced-motion', 'no-blur'));
        const fallback = await page.locator('#floatingPrompt').evaluate(e => ({ motion: getComputedStyle(e).animationDuration, blur: getComputedStyle(e).backdropFilter, background: getComputedStyle(e).backgroundColor }));
        assert.ok(parseFloat(fallback.motion) <= 0.00001);
        assert.equal(fallback.blur, 'none');
        assert.ok(fallback.background.startsWith('rgb('));
        await T.shot(page, `edge-${width}-opaque-reduced`);
        // A new settings window dismisses the transient tool instead of covering it.
        await page.evaluate(() => s123Bridge.openSettings('look'));
        assert.equal(await page.locator('#floatingPrompt').isVisible(), false);
        out.push({ width, bounds, normal, os, fallback, switched, checks: c });
        await page.context().close();
    }
    return { ok: true, out };
}
