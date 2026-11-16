// Enhance only ST's disabled-feature empty state; leave live token output untouched.
import { openSettings } from './util.js?v=20261116TT08';

let cleanup = null;
export function mount() {
    unmount();
    const viewer = document.getElementById('logprobs_generation_output');
    if (!viewer) return;
    const enhanced = new Map();
    const render = () => {
        for (const [node] of enhanced) if (!viewer.contains(node)) enhanced.delete(node);
        for (const state of viewer.querySelectorAll('.logprobs_empty_state')) {
            if (enhanced.has(state) || !state.textContent.includes('Request token probabilities')) continue;
            const original = [...state.childNodes];
            const text = document.createElement('p');
            text.textContent = '开启“请求 Token 概率”后，可查看模型生成时的候选词概率。';
            const detail = document.createElement('p');
            detail.className = 'ag2-logprobs-hint';
            detail.textContent = '需所用接口支持；开启后对新生成的回复生效。';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ag2-logprobs-settings';
            button.textContent = '前往通用设置';
            const go = async () => {
                await openSettings('user');
                if (!document.body.classList.contains('ag2')) return;
                const input = document.getElementById('request_token_probabilities');
                if (!input) return;
                input.scrollIntoView({ block: 'center', behavior: 'instant' });
                input.focus({ preventScroll: true });
            };
            const click = () => go().catch(error => console.error('[AG2] token settings link failed', error));
            button.addEventListener('click', click);
            state.replaceChildren(text, detail, button);
            enhanced.set(state, { original, button, click });
        }
    };
    const observer = new MutationObserver(render);
    observer.observe(viewer, { childList: true, subtree: true });
    render();
    cleanup = () => {
        observer.disconnect();
        for (const [state, { original, button, click }] of enhanced) {
            button.removeEventListener('click', click);
            if (state.contains(button)) state.replaceChildren(...original);
        }
        enhanced.clear();
    };
}

export function unmount() { cleanup?.(); cleanup = null; }
