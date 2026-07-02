const { ipcRenderer } = require('electron');
const BASE_DIR = ipcRenderer.sendSync('get-base-dir');
let isCommandMode = false;
let autoSend = true;
const processedText = new WeakMap();
let streamTimer;
let lastPasted = '';

function resolvePath(name) {
    if (/^[A-Za-z]:\\/.test(name)) return name;
    return `${BASE_DIR}\\${name}`;
}

function processText(text) {
    const writeMatches = text.matchAll(/write:([^|]+?)\|([\s\S]+?)(?=write:|read:|$)/g);
    for (const m of writeMatches) {
        const filename = m[1].trim();
        let content = m[2].trim();
        content = content.replace(/^\.{4,}/gm, m => ' '.repeat(m.length));
        const commentMatch = content.match(/\n\n[A-Z][a-z]+?\s+(?:the|a|an|i|we|you|would|here|this|that|there|it|to)\b/);
        if (commentMatch) content = content.slice(0, commentMatch.index);
        if (filename && content) {
            ipcRenderer.invoke('write-file', resolvePath(filename), content);
        }
    }

    const readMatches = text.matchAll(/read:([^\n|]+?)(?=\s*write:|\s*read:|$)/g);
    const readFiles = [];
    for (const m of readMatches) {
        const filename = m[1].trim();
        if (filename && (/[\\/]|\.\w+/.test(filename) || (filename.length < 40 && !/\s/.test(filename))) && filename.length < 200) {
            readFiles.push(filename);
        }
    }
    if (readFiles.length > 0) {
        Promise.all(readFiles.map(f =>
            ipcRenderer.invoke('read-file', resolvePath(f))
                .then(content => `${f} | ${content}`)
                .catch(() => null)
        )).then(results => {
            const full = results.filter(Boolean).join('\n');
            if (!full || full === lastPasted) return;
            lastPasted = full;
            const input = document.querySelector('[contenteditable]');
            if (input) {
                input.focus();
                input.innerText = full.replace(/^  +/gm, m => '\xA0'.repeat(m.length));
                input.dispatchEvent(new InputEvent('input', { bubbles: true }));
                if (autoSend) {
                    setTimeout(() => {
                        const sendBtn = document.querySelector('[aria-label="Send message"], [aria-label="Send"], button[class*="send"], button[data-testid*="send"]');
                        if (sendBtn) { sendBtn.click(); return; }
                        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    }, 300);
                }
            }
        });
    }
}

function handleNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    const text = node.textContent || '';
    if (lastPasted && text.trim() === lastPasted) return;
    if (processedText.get(node) === text) return;
    processedText.set(node, text);
    processText(text);
}

window.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        if (!isCommandMode) return;

        mutations.forEach(m => {
            if (m.type === 'childList') {
                m.addedNodes.forEach(n => handleNode(n));
            }
        });

        if (mutations.some(m => m.type === 'characterData')) {
            clearTimeout(streamTimer);
            streamTimer = setTimeout(() => {
                mutations.forEach(m => {
                    if (m.type === 'characterData' && m.target.parentElement) {
                        handleNode(m.target.parentElement);
                    }
                });
            }, 1500);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
});

ipcRenderer.on('toggle-command-mode', () => {
    isCommandMode = !isCommandMode;
    alert(`Command Mode: ${isCommandMode ? 'ENABLED' : 'DISABLED'}`);
});
ipcRenderer.on('toggle-auto-send', () => {
    autoSend = !autoSend;
    alert(`Auto-send: ${autoSend ? 'ON' : 'OFF'}`);
});
