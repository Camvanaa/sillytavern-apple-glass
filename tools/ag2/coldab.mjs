// tools/ag2/coldab.mjs — cold-start A/B helper: n boots with the AG2 CSS injected in memory from
// $CSS_FILE (default: worktree apple-glass-2.css), so two builds can be compared back to back
// without republishing (st-test keeps running). JS comes from whatever the worktree holds.
//   [THEME=dark] CSS_FILE=/tmp/old.css N=3 node tools/ag2/run.mjs tools/ag2/coldab.mjs --phase P2a-dev
import { readFileSync } from 'node:fs';

export default async function (T) {
    // THEME=dark: AG Dark (apple-theme.css) as the reference P0 measured against
    const dark = process.env.THEME === 'dark';
    const css = readFileSync(process.env.CSS_FILE || new URL(dark ? '../../apple-theme.css' : '../../apple-glass-2.css', import.meta.url), 'utf8');
    const name = dark ? 'Apple Glass Dark' : 'Apple Glass 2';
    const n = Number(process.env.N || 3);
    const runs = [];
    for (let i = 0; i < n; i++) {
        const page = await T.newPage();
        await T.prepare(page, {
            mutate: (s, j) => {
                s.power_user.theme = name;
                s.power_user.custom_css = css;
                for (const t of j.themes || []) if (t.name === name) t.custom_css = css;
            },
        });
        const b = await T.boot(page, { ag2: !dark, settle: 200 });
        runs.push(b.readyMs);
        await page.context().close();
    }
    return { css: css.length, readyMs: runs, median: T.median(runs) };
}
