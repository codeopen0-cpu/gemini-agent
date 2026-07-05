const { ipcRenderer } = require('electron');
let isCommandMode = false;
let autoSend = true;
let lastPasted = '';

function isAiResponse(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.tagName === 'MODEL-RESPONSE') return true;
    if (node.closest('model-response')) return true;
    if (node.closest('user-query')) return false;
    return false;
}

function pasteText(input, text) {
    input.focus();
    try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(input);
        sel.addRange(range);
        document.execCommand('delete');
        document.execCommand('insertText', false, text);
    } catch (_) {
        input.innerText = text;
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function normalizeLineEndings(s) {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n|\n$/g, '');
}

async function processText(text) {
    const writeMatches = text.matchAll(/write:([^|]+?)\|([\s\S]+?)(?=write:|read:|$)/g);
    for (const m of writeMatches) {
        let content = m[2].trim();
        content = content.replace(/^\.{4,}/gm, m => ' '.repeat(m.length));
        const commentMatch = content.match(/\n\n[A-Z][a-z]+?\s+(?:the|a|an|i|we|you|would|here|this|that|there|it|to)\b/);
        if (commentMatch) content = content.slice(0, commentMatch.index);
        if (content) {
            await ipcRenderer.invoke('write-file', m[1].trim(), content);
        }
    }

    const readMatches = text.matchAll(/read:([^\n|]+?)(?=\s*write:|\s*read:|$)/g);
    const readFiles = Array.from(readMatches).map(m => m[1].trim()).filter(f => f && f.length < 200);
    if (readFiles.length === 0) return;

    const input = document.querySelector('[contenteditable]');
    if (!input) return;
    input.focus();

    let uploadedAny = false;
    const textParts = [];
    for (const f of readFiles) {
        const result = await ipcRenderer.invoke('read-file', f);
        if (!result || result.content === 'File not found') continue;

        if (result.type === 'dir') {
            textParts.push(`read:${f}\n${result.content}`);
        } else if (result.type === 'file') {
            await ipcRenderer.invoke('upload-file', result.filePath);
        }
    }

    if (textParts.length > 0) {
        const full = textParts.join('\n\n');
        if (full !== lastPasted) {
            input.focus();
            await ipcRenderer.invoke('paste-text', full);
            lastPasted = full;
        }
    }

    if (autoSend) {
        setTimeout(() => {
            const btn = document.querySelector('[aria-label="Send message"], [aria-label="Send"]');
            if (btn) btn.click();
        }, uploadedAny ? 5000 : 500);
    }
}

let streamTimer;
window.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        if (!isCommandMode) return;
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach(n => {
                    if (n.nodeType === Node.ELEMENT_NODE && isAiResponse(n)) {
                        processText(n.textContent);
                    }
                });
            }
            if (m.type === 'characterData') {
                const parent = m.target.parentElement;
                if (parent && (parent.closest('model-response') || parent.closest('user-query'))) {
                    clearTimeout(streamTimer);
                    streamTimer = setTimeout(() => {
                        const response = parent.closest('model-response');
                        if (response) processText(response.textContent);
                    }, 1500);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
});

ipcRenderer.on('toggle-command-mode', () => {
    isCommandMode = !isCommandMode;
    alert(`Command Mode: ${isCommandMode ? 'ON' : 'OFF'}`);
});
ipcRenderer.on('toggle-auto-send', () => {
    autoSend = !autoSend;
    alert(`Auto-send: ${autoSend ? 'ON' : 'OFF'}`);
});
