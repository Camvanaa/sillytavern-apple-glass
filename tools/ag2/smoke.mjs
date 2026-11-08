// tools/ag2/smoke.mjs — boot st-test, open the long neutral chat, report what loaded.
export default async function (T) {
    const page = await T.newPage();
    await T.prepare(page);
    const b = await T.boot(page);
    const theme = await page.evaluate(() => SillyTavern.getContext().powerUserSettings.theme);
    const spec = await T.longChat(page);
    await T.openChat(page, spec, 20);
    const info = await page.evaluate(() => ({ chat: SillyTavern.getContext().getCurrentChatId(), mes: document.querySelectorAll('#chat .mes').length, th: document.querySelectorAll('.TH-render, iframe').length }));
    return { ...b, theme, spec, info, errors: T.errors(page).slice(0, 10) };
}
