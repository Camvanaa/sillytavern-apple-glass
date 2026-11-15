// TT v2.4 uses a native, draft-aware settings dialog. Open its own entry rather
// than copying fields or bypassing the host save lifecycle.
export function isTauri() { return !!(window.__TAURITAVERN__ || window.__TAURI_RUNNING__); }
export async function openTauriSettings() {
    if (!isTauri()) throw new Error('此功能仅适用于 TauriTavern');
    await (window.__TAURITAVERN__?.ready ?? window.__TAURITAVERN_MAIN_READY__);
    const button = document.getElementById('tauritavern_settings_button');
    if (!button) throw new Error('未找到 TauriTavern 设置入口，请检查客户端版本');
    button.click();
}
export function renderTauriSettings(body) {
    body.innerHTML = '<div class="ag2-set-gtitle">客户端</div><div class="ag2-set-group"><div class="ag2-set-row"><div class="ag2-set-lab">TauriTavern 设置<small>性能、数据目录、同步与客户端选项，使用原生保存逻辑。</small></div><button type="button" class="ag2-set-btn">打开</button></div></div><p class="ag2-set-note" role="status"></p>';
    body.querySelector('button').addEventListener('click', async () => {
        try { await openTauriSettings(); }
        catch (error) { body.querySelector('[role="status"]').textContent = error.message; }
    });
}
