// Same native extension/theme APIs on ST and TauriTavern. No settings snapshot sync.
import { ensureUpdateStyles } from './update-style.js?v=20261117TT12';
export const INSTALL_URL = 'https://github.com/Camvanaa/SillyTavern-AppleGlassStyles';
// GitHub is the only update source: the release.json of the branch that the native
// update pulls, so a check never announces a build that “更新” cannot fetch.
export const RELEASE_URL = 'https://raw.githubusercontent.com/Camvanaa/SillyTavern-AppleGlassStyles/main/release.json';
const ROOT = new URL('../', import.meta.url);
const FOLDER = decodeURIComponent(ROOT.pathname.split('/').filter(Boolean).at(-1));
const KEY = 'ag2.release.notifications';
let running = false;

function context() { return SillyTavern.getContext(); }
async function request(url, options = {}) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
    return response;
}
async function json(url, options = {}) {
    const response = await request(url, options);
    try { return await response.json(); }
    catch { throw new Error(`接口未返回有效 JSON：${new URL(url, location.href).pathname}`); }
}
async function post(path, body, acknowledgement = false) {
    const options = { method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify(body) };
    // ST themes/save returns plain "OK"; TT may return JSON. These commands
    // promise success by HTTP status, unlike the data-reading endpoints.
    return acknowledgement ? request(path, options) : json(path, options);
}
function validateRelease(data) {
    if (data?.schema !== 1 || typeof data.build !== 'string' || !/^[A-Za-z0-9-]{1,48}$/.test(data.build)
        || data.installUrl !== INSTALL_URL || !/^[a-f0-9]{64}$/.test(data.themeSha256 || '')) throw new Error('发布信息格式不正确');
    return data;
}
export async function checkRelease() {
    return validateRelease(await json(`${RELEASE_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit' }));
}
async function bundle() {
    const release = validateRelease(await json(new URL('release.json', ROOT), { cache: 'no-store' }));
    const response = await fetch(new URL('apple-glass-2.json', ROOT), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('此副本不含主题发布包，请从安装 URL 获取完整版');
    const bytes = await response.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== release.themeSha256) throw new Error('主题与扩展版本不一致，请重试更新');
    const theme = JSON.parse(new TextDecoder().decode(bytes));
    if (theme.name !== 'Apple Glass 2' || typeof theme.custom_css !== 'string') throw new Error('主题包格式不正确');
    const code = await fetch(new URL('shell/index.js', ROOT), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!code.ok || !(await code.text()).includes(`export const BUILD = '${release.build}';`)) throw new Error('扩展与主题构建号不一致，请重试更新');
    return { release, theme };
}
export async function importBundledTheme() {
    const { release, theme } = await bundle();
    // Read only the theme library. Existing appearance choices are preserved.
    const data = await post('/api/settings/get', {});
    const old = (data.themes || []).find(t => t.name === theme.name);
    await post('/api/themes/save', old ? { ...old, custom_css: theme.custom_css } : theme, true);
    const pu = context().powerUserSettings;
    if (pu?.theme === theme.name) {
        const before = pu.custom_css;
        pu.custom_css = theme.custom_css;
        try {
            const { saveSettings } = await import('/script.js');
            await saveSettings();
        } catch (error) { pu.custom_css = before; throw error; }
    }
    return release;
}
async function installation() {
    const list = await json('/api/extensions/discover', { headers: context().getRequestHeaders() });
    const item = list.find(x => x.name === `third-party/${FOLDER}` || x.name === FOLDER);
    if (!item || !['global', 'local'].includes(item.type)) throw new Error('无法确认扩展安装位置');
    return { extensionName: FOLDER, global: item.type === 'global' };
}
export async function updateInstalled() {
    if (running) throw new Error('更新正在进行');
    running = true;
    try {
        const location = await installation();
        const version = await post('/api/extensions/version', location);
        if (String(version.remoteUrl || '').replace(/\.git$/, '').replace(/\/$/, '') !== INSTALL_URL) {
            throw new Error('此副本由服务器或迁移包管理。请先在扩展管理中用安装 URL 安装本地副本，再使用在线更新。');
        }
        await post('/api/extensions/update', location, true);
        // Fetch and validate the theme shipped by the updated repository, never a
        // separately moving "latest" theme URL. A failure leaves a retryable state.
        return await importBundledTheme();
    } finally { running = false; }
}
function button(text, action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ag2-set-btn'; b.textContent = text;
    b.addEventListener('click', action); return b;
}
export function renderUpdates(container) {
    ensureUpdateStyles();
    const panel = document.createElement('section'); panel.className = 'ag2-update-panel';
    const group = document.createElement('div'); group.className = 'ag2-set-group';
    const title = document.createElement('div'); title.className = 'ag2-set-gtitle'; title.textContent = '主题与扩展更新';
    const status = document.createElement('p'); status.className = 'ag2-set-note'; status.setAttribute('role', 'status');
    status.textContent = '通过安装 URL 获取扩展；主题随同版本发布。更新完成后重载生效。';
    const row = document.createElement('div'); row.className = 'ag2-set-row ag2-update-actions';
    const execute = async (work, done) => {
        const buttons = [...row.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true); status.textContent = '正在处理…';
        try { status.textContent = done(await work()); }
        catch (error) { status.textContent = error.message; }
        finally { buttons.forEach(b => b.disabled = false); }
    };
    row.append(button('检查更新', () => execute(checkRelease, r => {
        const current = document.querySelector('#ag2-shell')?.dataset.build;
        return r.build === current ? `当前为最新版本：${r.build}` : `发现版本 ${r.build}，可点击“更新”。`;
    })), button('更新', () => execute(updateInstalled, r => `已安装 ${r.build}。请完成当前编辑后重载。`)),
    button('导入配套主题', () => execute(importBundledTheme, r => `主题 ${r.build} 已导入。重载后可在通用中选用 Apple Glass 2。`)),
    button('重载', () => location.reload()));
    const linkRow = document.createElement('div'); linkRow.className = 'ag2-set-row';
    const link = document.createElement('a'); link.href = INSTALL_URL; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '扩展安装 URL';
    linkRow.append(link, button('复制 URL', () => execute(() => navigator.clipboard.writeText(INSTALL_URL), () => '安装 URL 已复制')));
    const notify = document.createElement('div'); notify.className = 'ag2-set-row';
    const lab = document.createElement('span'); lab.className = 'ag2-set-lab'; lab.textContent = '应用内更新通知';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'ag2-switch';
    toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', '应用内更新通知');
    toggle.setAttribute('aria-checked', String(localStorage.getItem(KEY) !== 'false'));
    toggle.addEventListener('click', () => {
        const enabled = toggle.getAttribute('aria-checked') !== 'true';
        toggle.setAttribute('aria-checked', String(enabled)); localStorage.setItem(KEY, String(enabled));
        if (enabled) void checkAndNotify();
    });
    notify.append(lab, toggle); group.append(row, linkRow, notify); panel.append(title, group, status); container.append(panel);
}
async function checkAndNotify() {
    try {
        const release = await checkRelease();
        const current = document.querySelector('#ag2-shell')?.dataset.build;
        if (current && release.build !== current && sessionStorage.getItem('ag2.release.notified') !== release.build) {
            sessionStorage.setItem('ag2.release.notified', release.build);
            window.toastr?.info(`发现 Apple Glass 2 ${release.build}，请在“关于”中更新。`, 'Apple Glass 2');
        }
    } catch { /* Optional background notification. Explicit checks show errors. */ }
}
export function startUpdateNotifications() {
    const check = () => { if (document.visibilityState === 'visible' && localStorage.getItem(KEY) !== 'false') void checkAndNotify(); };
    check();
    setInterval(check, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
}

// URL installation works even before the user imports/activates the AG2 theme.
export function mountInstaller() {
    const host = document.getElementById('extensions_settings');
    if (!host || document.getElementById('ag2-install-tools')) return;
    const section = document.createElement('div'); section.id = 'ag2-install-tools'; section.className = 'inline-drawer';
    const head = document.createElement('div'); head.className = 'inline-drawer-toggle inline-drawer-header';
    head.innerHTML = '<b>Apple Glass 2</b><span class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></span>';
    const content = document.createElement('div'); content.className = 'inline-drawer-content'; content.style.display = 'none';
    renderUpdates(content); section.append(head, content); host.append(section);
}
