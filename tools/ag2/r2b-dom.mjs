// tools/ag2/r2b-dom.mjs — R2b dump: exact DOM of ST popups, toast, #movingDivs children.
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };

async function enter(T) {
    const page = await T.newPage({});
    await T.prepare(page, { theme: 'ag2' });
    await T.boot(page, { ag2: true, settle: 2000 });
    await T.openChat(page, await T.longChat(page), 2);
    await T.sleep(600);
    return page;
}

export default async function (T) {
    const page = await enter(T);
    const out = {};
    await page.click('#ag2-tools [data-act="insp"]'); await T.sleep(700);
    await page.click('#ag2-insp-links [data-ag2-act="persona"]'); await T.sleep(800);
    out.popup = await page.evaluate(() => {
        const d = document.querySelector('dialog.popup[open]');
        if (!d) return null;
        const clone = d.cloneNode(true);
        return { outer: d.outerHTML.slice(0, 60), classes: d.className, inner: clone.innerHTML.replace(/<img[^>]*>/g, '<img>').slice(0, 1400) };
    });
    await page.keyboard.press('Escape'); await T.sleep(500);
    await page.click('#ag2-insp-links [data-ag2-act="adv"]'); await T.sleep(700);
    out.charPopup = await page.evaluate(() => {
        const c = document.getElementById('character_popup');
        const kids = [...c.children].map(e => ({ tag: e.tagName, id: e.id, cls: (e.className || '').slice(0, 60), text: (e.textContent || '').trim().slice(0, 40) }));
        return { kids, headerHTML: c.querySelector('#character_popup_text')?.outerHTML.slice(0, 300), crossHTML: c.querySelector('#character_cross')?.outerHTML.slice(0, 200) };
    });
    await page.keyboard.press('Escape'); await T.sleep(500);
    // toast
    await page.evaluate(() => { toastr.success('设置已保存', '成功'); });
    await T.sleep(400);
    out.toast = await page.evaluate(() => {
        const c = document.getElementById('toast-container');
        const t = c.querySelector('.toast');
        return { containerCls: c.className, containerStyle: c.getAttribute('style'), toastCls: t?.className, toastHTML: t?.outerHTML.replace(/data:image[^)]*/g, 'DATA').slice(0, 600) };
    });
    out.movingDivs = await page.evaluate(() => {
        const m = document.getElementById('movingDivs');
        return [...m.children].map(e => ({ tag: e.tagName, id: e.id, cls: (e.className || '').slice(0, 70), vis: e.getClientRects().length > 0 }));
    });
    out.errors = T.errors(page);
    return out;
}
