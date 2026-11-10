// tools/ag2/r1-evidence.mjs — R1 before / after screenshots of the “native drawer flash”.
//   node tools/ag2/run.mjs tools/ag2/r1-evidence.mjs --phase R1 --css <file> --tag pre|post [--phone]
// --css: the theme CSS to inject (e.g. `git show 72f1092:apple-glass-2.css > /tmp/opencode/pre.css`).
// ST's closing transition (2 × --animation-duration, normally 250ms) is stretched to 6s by
// setting --animation-duration to 3000ms, so the frame that flashes by can be photographed.
// Nothing else is changed: same classes, same handlers (doNavbarIconClick's own JS delay is
// unaffected). Screens: real/R1/ev-<tag>-<dk|ph>-<name>.png
import { readFileSync } from 'node:fs';
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : ''; };

export default async function (T) {
    const phone = !!T.cfg.phone;
    const css = readFileSync(arg('css'), 'utf8');
    const tag = `ev-${arg('tag') || 'x'}-${phone ? 'ph' : 'dk'}-`;
    const page = await T.newPage({ phone });
    await T.prepare(page, { mutate: s => { s.power_user.custom_css = css; } });
    await T.boot(page, { ag2: true, settle: 2500 });
    const out = {};
    const slow = () => page.evaluate(() => document.documentElement.style.setProperty('--animation-duration', '3000ms'));
    const snap = async name => {
        await T.sleep(350);
        out[name] = await page.evaluate(() => [...document.querySelectorAll('#top-settings-holder .drawer-content')].filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').map(e => { const r = e.getBoundingClientRect(); return `${e.id}.${e.classList.contains('openDrawer') ? 'open' : 'closed'} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}]`; }));
        await page.screenshot({ path: `${T.cfg.shotRoot}/${T.cfg.phase}/${tag}${name}.png`, caret: 'hide' });
        await T.sleep(6200); // let the stretched transition end
    };
    const act = sel => (phone ? page.tap(sel) : page.click(sel));
    if (!phone) {
        await T.openChat(page, await T.longChat(page), 2);
        await slow();
        await act('#ag2-sidebar [data-act="persona"]'); await T.sleep(1200);
        await act('#ag2-settings .ag2-set-item[data-page="look"]'); await snap('persona-to-look');
        await act('#ag2-settings .ag2-set-item[data-page="persona"]'); await T.sleep(1200);
        await act('#ag2-settings .ag2-set-item[data-page="wi"]'); await snap('persona-to-wi');
        await act('#ag2-settings .ag2-set-close'); await snap('close-window');
        await act('#ag2-tools [data-act="insp"]'); await T.sleep(1200);
        await act('#right-nav-panel [data-ag2-act="close"]'); await snap('close-inspector');
    } else {
        await slow();
        await act('#ag2-tabbar [data-tab="settings"]'); await T.sleep(1000);
        await act('#ag2-settings .ag2-set-item[data-page="api"]'); await T.sleep(1200);
        await act('#ag2-settings .ag2-set-back'); await snap('back-from-api');
        await act('#ag2-settings .ag2-set-item[data-page="persona"]'); await T.sleep(1200);
        await page.keyboard.press('Escape'); await T.sleep(100); await page.keyboard.press('Escape'); await snap('close-sheet-from-persona');
        const spec = await T.longChat(page);
        await act(`#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`); await T.sleep(2500);
        await act('#ag2-title .ag2-title-btn'); await T.sleep(1200);
        await act('#right-nav-panel [data-ag2-act="close"]'); await snap('close-inspector');
    }
    return out;
}
