// tools/ag2/s123-verify.mjs — S1 + S2 + S3 visual & functional verification suite.
//   node tools/ag2/run.mjs tools/ag2/s123-verify.mjs --phase S123
import { checks } from './r2a.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const REPORT = '/opt/server-agent/workspace/st-testdata/redesign/s123-polish';
const panels = { an: 'floatingPrompt', cfg: 'cfgConfig', logprobs: 'logprobsViewer' };
function clean(c) {
    assert.equal(c.clip.length, 0, JSON.stringify(c.clip));
    assert.equal(c.over.length, 0, JSON.stringify(c.over));
    assert.equal(c.native.length, 0, JSON.stringify(c.native));
    assert.ok(c.n > 0, 'must inspect a visible surface');
}
function exclusive(state, act) {
    assert.deepEqual(state.openPanels, [panels[act]]);
    for (const key of Object.keys(panels)) {
        assert.equal(state.rows[key].on, key === act);
        assert.equal(state.rows[key].expanded, String(key === act));
    }
    assert.equal(state.toolAn.on, act === 'an');
    assert.equal(state.toolAn.pressed, String(act === 'an'));
}

export default async function (T) {
    const out = { s1_desktop: {}, s1_phone: {}, s2_desktop: {}, s2_phone: {} };

    // =========================================================================
    // 1. S1 + S2 on Desktop (1440×900)
    // =========================================================================
    {
        const page = await T.newPage({ phone: false, w: 1440, h: 900 });
        await T.prepare(page, {});
        await T.boot(page, { ag2: true, settle: 2000 });
        await T.openChat(page, await T.longChat(page), 10);

        // Open inspector -> 本次对话
        if (!(await page.evaluate(() => document.body.classList.contains('ag2-insp-open')))) {
            await page.click('#ag2-tools [data-act="insp"]');
            await T.sleep(700);
        }
        await page.click('#ag2-insp-head [data-seg="chat"]');
        await T.sleep(400);

        const floatState = () => page.evaluate(() => {
            const vis = id => {
                const e = document.getElementById(id);
                return !!e && getComputedStyle(e).display !== 'none';
            };
            const row = act => {
                const r = document.querySelector(`#ag2-insp-chat .ag2-insp-row[data-ag2-act="${act}"]`);
                return r ? {
                    on: r.classList.contains('ag2-on'),
                    expanded: r.getAttribute('aria-expanded'),
                    val: r.querySelector('.ag2-insp-row-v')?.textContent || '',
                } : null;
            };
            const toolAn = document.querySelector('#ag2-tools [data-act="an"]');
            return {
                openPanels: ['floatingPrompt', 'cfgConfig', 'logprobsViewer'].filter(vis),
                rows: { an: row('an'), cfg: row('cfg'), logprobs: row('logprobs') },
                toolAn: { on: toolAn?.classList.contains('ag2-on'), pressed: toolAn?.getAttribute('aria-pressed') },
            };
        });

        // Step 1a: Click AN
        await page.click('#ag2-insp-chat [data-ag2-act="an"]');
        await T.sleep(500);
        out.s1_desktop.an = await floatState();
        exclusive(out.s1_desktop.an, 'an');
        out.s1_desktop.anDetails = await page.evaluate(() => {
            const fp = document.getElementById('floatingPrompt');
            const bar = fp.querySelector('.panelControlBar');
            const close = document.getElementById('ANClose');
            const icon = fp.querySelector('.inline-drawer-icon');
            const sw = fp.querySelector('label.checkbox_label > input[type="checkbox"]');
            const rad = fp.querySelector('input[type="radio"]');
            return {
                headerTitle: getComputedStyle(bar, '::before').content,
                grabberDisp: getComputedStyle(document.getElementById('floatingPromptheader')).display,
                maxDisp: getComputedStyle(document.getElementById('floatingPromptMaximize')).display,
                closeRect: [Math.round(close.getBoundingClientRect().width), Math.round(close.getBoundingClientRect().height)],
                closeGlyph: getComputedStyle(close, '::before').content,
                drawerIconGlyph: getComputedStyle(icon, '::before').content,
                switchSize: [Math.round(sw.getBoundingClientRect().width), Math.round(sw.getBoundingClientRect().height)],
                radioSize: [Math.round(rad.getBoundingClientRect().width), Math.round(rad.getBoundingClientRect().height)],
            };
        });
        out.s1_desktop.anChecks = await checks(page, ['#floatingPrompt']);
        clean(out.s1_desktop.anChecks);
        assert.deepEqual(out.s1_desktop.anDetails.radioSize, [18, 18]);
        assert.deepEqual(out.s1_desktop.anDetails.switchSize, [42, 26]);
        assert.equal(out.s1_desktop.anDetails.closeGlyph, '"\uf00d"');
        out.s1_desktop.anScan = await T.scan(page, ['#floatingPrompt']);
        await T.shot(page, 's1-desk-an');

        // Expand 2nd drawer in AN to check Character Author's Note radios
        await page.click('#floatingPrompt #charaANBlockToggle');
        await T.sleep(400);
        await page.locator('#extension_use_floating_chara').scrollIntoViewIfNeeded();
        out.s1_desktop.characterRadios = await page.locator('input[name="extension_floating_char_position"]').evaluateAll(es => es.map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, appearance: getComputedStyle(e).appearance })));
        assert.ok(out.s1_desktop.characterRadios.every(r => r.width === 18 && r.height === 18 && r.appearance === 'none'));
        await T.shot(page, 's1-desk-an-chara');

        // Step 1b: Click CFG directly WITHOUT closing AN first -> must mutually exclude AN!
        await page.click('#ag2-insp-chat [data-ag2-act="cfg"]');
        await T.sleep(500);
        out.s1_desktop.cfg = await floatState();
        exclusive(out.s1_desktop.cfg, 'cfg');
        await page.evaluate(() => {
            const r = document.getElementById('chat_cfg_guidance_scale');
            if (r) { r.value = '2.25'; r.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        await T.sleep(200);
        await T.shot(page, 's1-desk-cfg');
        // Also open CFG Prompt Cascading drawer
        await page.evaluate(() => document.querySelector('#cfg_prompt_combine_container .inline-drawer-header')?.click());
        await T.sleep(350);
        await T.shot(page, 's1-desk-cfg-expanded');
        out.s1_desktop.cfgDetails = await page.evaluate(() => {
            const cfg = document.getElementById('cfgConfig');
            const bar = cfg.querySelector('.panelControlBar');
            const r = document.getElementById('chat_cfg_guidance_scale');
            return {
                headerTitle: getComputedStyle(bar, '::before').content,
                pct: r?.style.getPropertyValue('--ag2-pct'),
                allPercentages: [...cfg.querySelectorAll('input[type="range"]')].map(e => e.style.getPropertyValue('--ag2-pct')),
                grabberDisp: getComputedStyle(document.getElementById('cfgConfigheader')).display,
                maxDisp: getComputedStyle(document.getElementById('cfgConfigMaximize')).display,
            };
        });
        out.s1_desktop.cfgChecks = await checks(page, ['#cfgConfig']);
        clean(out.s1_desktop.cfgChecks);
        assert.equal(out.s1_desktop.cfgDetails.pct, '55.13%');
        assert.ok(out.s1_desktop.cfgDetails.allPercentages.every(s => /%$/.test(s)));
        out.s1_desktop.cfgScan = await T.scan(page, ['#cfgConfig']);

        // Step 1c: Click Logprobs directly WITHOUT closing CFG first -> must mutually exclude CFG!
        await page.click('#ag2-insp-chat [data-ag2-act="logprobs"]');
        await T.sleep(500);
        out.s1_desktop.logprobs = await floatState();
        exclusive(out.s1_desktop.logprobs, 'logprobs');
        out.s1_desktop.logprobsDetails = await page.evaluate(() => ({
            grabberDisp: getComputedStyle(document.getElementById('logprobsViewerheader')).display,
            maxDisp: getComputedStyle(document.getElementById('logprobsMaximizeToggle')).display,
            toggleDisp: getComputedStyle(document.getElementById('logprovsViewerBlockToggle')).display,
        }));
        out.s1_desktop.logprobsChecks = await checks(page, ['#logprobsViewer']);
        clean(out.s1_desktop.logprobsChecks);
        out.s1_desktop.logprobsScan = await T.scan(page, ['#logprobsViewer']);
        await T.shot(page, 's1-desk-logprobs');

        // Real ST rendering with a labelled in-memory logprobs fixture (no generation).
        await page.evaluate(async () => {
            const { saveLogprobsForActiveMessage } = await import('/scripts/logprobs.js');
            saveLogprobsForActiveMessage([
                { token: '你好', topLogprobs: [['你好', -0.2], ['欢迎', -2.1], ['您好', -3.2]] },
                { token: '，', topLogprobs: [['，', -0.1], ['。', -2.5]] },
                { token: '旅人。', topLogprobs: [['旅人。', -0.4], ['朋友。', -1.8]] },
            ], null);
        });
        await page.click('#logprobsViewerClose'); await T.sleep(300);
        await page.click('#ag2-insp-chat [data-ag2-act="logprobs"]'); await T.sleep(400);
        await page.click('#logprobs_generation_output .logprobs_output_token:first-child');
        await T.shot(page, 's1-desk-logprobs-data');

        // Close Logprobs via its × button
        await page.click('#logprobsViewerClose');
        await T.sleep(400);
        out.s1_desktop.afterClose = await floatState();
        assert.equal(out.s1_desktop.afterClose.openPanels.length, 0);

        await page.click('#ag2-tools [data-act="an"]'); await T.sleep(350);
        await page.locator('#extension_floating_prompt').fill('S123 note state fixture');
        await page.click('#ANClose'); await T.sleep(350);
        out.s1_desktop.noteClosed = await floatState();
        assert.equal(out.s1_desktop.noteClosed.rows.an.val, '有内容');
        assert.equal(out.s1_desktop.noteClosed.toolAn.on, false);

        // Observe external/native open paths and dynamically inserted plugin inspectors.
        out.s1_desktop.external = await page.evaluate(async () => {
            const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
            const visible = () => [...document.querySelectorAll('#movingDivs > .drawer-content')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id);
            $('#option_toggle_AN').trigger('click'); await frame();
            const plugin = document.createElement('div');
            plugin.id = 's123-plugin-fixture'; plugin.className = 'drawer-content';
            plugin.style.display = 'flex';
            const close = document.createElement('button'); close.className = 'floating_panel_close';
            let closed = 0; close.onclick = () => { closed++; plugin.style.display = 'none'; };
            plugin.append(close); document.getElementById('movingDivs').append(plugin);
            await frame(); const afterPlugin = visible();
            $('#option_toggle_CFG').trigger('click'); await frame(); const afterCfg = visible();
            plugin.remove(); $('#CFGClose').trigger('click');
            return { afterPlugin, afterCfg, closed };
        });
        assert.deepEqual(out.s1_desktop.external.afterPlugin, ['s123-plugin-fixture']);
        assert.deepEqual(out.s1_desktop.external.afterCfg, ['cfgConfig']);
        assert.equal(out.s1_desktop.external.closed, 1);
        await T.sleep(400);

        // Step 1d: Character popup (#character_popup, 高级定义)
        await page.click('#ag2-insp-head [data-seg="main"]');
        await T.sleep(400);
        await page.click('#ag2-insp-links [data-ag2-act="adv"]');
        await T.sleep(600);
        await page.evaluate(() => {
            for (const h of document.querySelectorAll('#character_popup .inline-drawer-header')) h.click();
        });
        await T.sleep(400);
        out.s1_desktop.charPopup = await page.evaluate(() => {
            const cp = document.getElementById('character_popup');
            const sl = document.getElementById('talkativeness_slider');
            return {
                vis: getComputedStyle(cp).display !== 'none',
                pct: sl?.style.getPropertyValue('--ag2-pct'),
            };
        });
        out.s1_desktop.charPopupChecks = await checks(page, ['#character_popup']);
        clean(out.s1_desktop.charPopupChecks);
        await T.shot(page, 's1-desk-char-popup');
        await page.click('#character_cross');
        await T.sleep(400);

        // =====================================================================
        // 2. S2 Desktop Settings Pages + #completion_prompt_manager_popup
        // =====================================================================
        await page.click('#ag2-sidebar [data-act="settings"]');
        await page.waitForSelector('#ag2-settings:not([hidden])', { timeout: 15000 });
        await T.sleep(800);

        const s2Pages = [
            ['user', '#user-settings-block'],
            ['fmt', '#AdvancedFormatting'],
            ['ai', '#left-nav-panel'],
            ['api', '#rm_api_block'],
            ['wi', '#WorldInfo'],
            ['persona', '#PersonaManagement'],
            ['ext', '#rm_extensions_block'],
        ];
        for (const [p, sel] of s2Pages) {
            await page.click(`#ag2-settings .ag2-set-item[data-page="${p}"]`);
            await T.sleep(1100);
            if (p === 'wi') {
                await page.evaluate(() => {
                    const s = document.querySelector('#world_editor_select');
                    if (s && s.options.length > 1 && !s.value) { s.selectedIndex = 1; $(s).trigger('change'); }
                });
                await T.sleep(1000);
            }
            const cTop = await checks(page, ['#ag2-settings', sel]);
            const scTop = await T.scan(page, [sel]);
            await T.shot(page, `s2-desk-${p}-01`);

            if (p === 'user') {
                await page.evaluate(() => {
                    const el = document.querySelector('#user-settings-block [name="ChatMessageHandlingToggles"]');
                    el?.scrollIntoView({ block: 'start' });
                });
                await T.sleep(400);
                await T.shot(page, 's2-desk-user-02-chat');
            }
            if (p === 'ai') {
                // Open #completion_prompt_manager_popup by clicking edit on the first prompt row
                const edited = await page.evaluate(() => {
                    const btn = document.querySelector('#completion_prompt_manager_list .prompt-manager-edit-action');
                    if (!btn) return false;
                    btn.click();
                    return true;
                });
                if (edited) {
                    await T.sleep(500);
                    out.s1_desktop.pmPopup = await page.evaluate(() => {
                        const pm = document.getElementById('completion_prompt_manager_popup');
                        const q = pm?.getBoundingClientRect();
                        return pm ? { vis: getComputedStyle(pm).display !== 'none', rect: [q.left, q.top, q.width, q.height].map(Math.round) } : null;
                    });
                    out.s1_desktop.pmPopupChecks = await checks(page, ['#completion_prompt_manager_popup']);
                    clean(out.s1_desktop.pmPopupChecks);
                    await page.locator('#completion_prompt_manager_popup_entry_form_name').focus();
                    assert.equal(await page.evaluate(() => document.activeElement.id), 'completion_prompt_manager_popup_entry_form_name');
                    await T.shot(page, 's1-desk-pm-popup');
                    await page.keyboard.press('Escape');
                    await page.locator('#completion_prompt_manager_popup').waitFor({ state: 'hidden', timeout: 3000 });
                    assert.equal(await page.locator('#completion_prompt_manager_popup').isVisible(), false);
                    assert.equal(await page.locator('#ag2-settings').isVisible(), true);
                }
            }
            out.s2_desktop[p] = {
                clip: cTop.clip, over: cTop.over, native: cTop.native, rows: cTop.rows,
                scan: { ovf: scTop.ovf, dbl: scTop.dbl, unhid: scTop.unhid, nest: scTop.nest, btn: scTop.btn },
                scanDetail: scTop.detail,
            };
            clean(cTop);
            assert.equal(scTop.ovf + scTop.dbl + scTop.unhid + scTop.nest + scTop.btn, 0, JSON.stringify(scTop.detail));
        }

        out.desktopErrors = T.errors(page);
        await page.context().close();
    }

    // =========================================================================
    // 3. S1 + S2 on Phone (390×844)
    // =========================================================================
    {
        const page = await T.newPage({ phone: true });
        await T.prepare(page, {});
        await T.boot(page, { ag2: true, settle: 2000 });
        const spec = await T.longChat(page);
        await page.tap(`#ag2-sidebar .ag2-chat-row[title*="${spec.file}"]`);
        await T.sleep(2200);

        // Open AN from ⋯ menu
        await page.tap('#ag2-ph-more');
        await T.sleep(500);
        await page.locator('.ag2-menu .ag2-menu-item', { hasText: '作者注释' }).first().tap();
        await T.sleep(800);
        out.s1_phone.an = await page.evaluate(() => {
            const e = document.getElementById('floatingPrompt');
            const q = e.getBoundingClientRect();
            return { vis: getComputedStyle(e).display !== 'none', rect: [q.left, q.top, q.width, q.height].map(Math.round) };
        });
        out.s1_phone.anChecks = await checks(page, ['#floatingPrompt']);
        clean(out.s1_phone.anChecks);
        out.s1_phone.anScan = await T.scan(page, ['#floatingPrompt']);
        await T.shot(page, 's1-phone-an');
        await page.tap('#ANClose');
        await T.sleep(500);

        await page.tap('#ag2-title .ag2-title-btn'); await T.sleep(700);
        await page.tap('#ag2-insp-head [data-seg="chat"]'); await T.sleep(300);
        for (const act of ['an', 'cfg', 'logprobs']) {
            // A phone sheet can cover the entry rows; dispatch on the real shell entry
            // to exercise replacement without first closing the previous sheet.
            await page.evaluate(act => document.querySelector(`#ag2-insp-chat [data-ag2-act="${act}"]`).click(), act);
            await T.sleep(500);
            out.s1_phone[act + 'Inspector'] = await page.evaluate(id => {
                const e = document.getElementById(id), r = e.getBoundingClientRect();
                return { visible: getComputedStyle(e).display !== 'none', inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, rect: [r.x,r.y,r.width,r.height], open: [...document.querySelectorAll('#movingDivs > .drawer-content')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.id) };
            }, panels[act]);
            assert.equal(out.s1_phone[act + 'Inspector'].visible, true);
            assert.equal(out.s1_phone[act + 'Inspector'].inView, true);
            assert.deepEqual(out.s1_phone[act + 'Inspector'].open, [panels[act]]);
            clean(await checks(page, ['#' + panels[act]]));
            await T.shot(page, 's1-phone-' + act + '-inspector');
        }
        await page.tap('#logprobsViewerClose'); await T.sleep(400);
        await page.tap('#ag2-insp-head [data-seg="main"]'); await T.sleep(300);
        await page.locator('#ag2-insp-links [data-ag2-act="adv"]').tap(); await T.sleep(500);
        out.s1_phone.charPopupChecks = await checks(page, ['#character_popup']);
        clean(out.s1_phone.charPopupChecks);
        await T.shot(page, 's1-phone-char-popup');
        await page.tap('#character_cross'); await T.sleep(300);
        await page.tap('#ag2-insp-head [data-ag2-act="close"]'); await T.sleep(400);

        // Open Settings -> 通用 on Phone
        await page.tap('#ag2-ph-back');
        await T.sleep(700);
        await page.tap('#ag2-tabbar [data-tab="settings"]');
        await T.sleep(1000);
        for (const [p, sel] of [['user', '#user-settings-block'], ['fmt', '#AdvancedFormatting'], ['ai', '#left-nav-panel'], ['api', '#rm_api_block'], ['wi', '#WorldInfo'], ['persona', '#PersonaManagement'], ['ext', '#rm_extensions_block']]) {
            await page.locator(`#ag2-settings .ag2-set-item[data-page="${p}"]`).scrollIntoViewIfNeeded();
            await page.tap(`#ag2-settings .ag2-set-item[data-page="${p}"]`);
            await T.sleep(1200);
            const c = await checks(page, ['#ag2-settings', sel]);
            const sc = await T.scan(page, [sel]);
            clean(c);
            assert.equal(sc.ovf + sc.dbl + sc.unhid + sc.nest + sc.btn, 0, JSON.stringify(sc.detail));
            await T.shot(page, `s2-phone-${p}-01`);
            if (p === 'user') {
                await page.evaluate(() => {
                    const el = document.querySelector('#user-settings-block [name="ChatMessageHandlingToggles"]');
                    el?.scrollIntoView({ block: 'start' });
                });
                await T.sleep(400);
                await T.shot(page, 's2-phone-user-02-chat');
            }
            if (p === 'ai') {
                await page.evaluate(() => document.querySelector('#completion_prompt_manager_list .prompt-manager-edit-action').click());
                await T.sleep(500);
                out.s1_phone.pmPopupChecks = await checks(page, ['#completion_prompt_manager_popup']);
                clean(out.s1_phone.pmPopupChecks);
                await T.shot(page, 's1-phone-pm-popup');
                await page.tap('#completion_prompt_manager_popup_entry_form_close'); await T.sleep(400);
            }
            out.s2_phone[p] = {
                clip: c.clip, over: c.over, native: c.native,
                scan: { ovf: sc.ovf, dbl: sc.dbl, unhid: sc.unhid, nest: sc.nest, btn: sc.btn },
            };
            await page.tap('#ag2-settings .ag2-set-back');
            await T.sleep(700);
        }

        out.phoneErrors = T.errors(page);
        await page.context().close();
    }

    out.ok = true;
    mkdirSync(REPORT, { recursive: true });
    writeFileSync(REPORT + '/s123-verify.json', JSON.stringify(out, null, 2));
    return out;
}
