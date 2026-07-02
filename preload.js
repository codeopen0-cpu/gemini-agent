const { ipcRenderer } = require('electron');
const BASE_DIR = ipcRenderer.sendSync('get-base-dir');
let isCommandMode = false;
let autoSend = true;
const processed = new WeakSet();
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
        const content = m[2].trim();
        if (filename && content) {
            ipcRenderer.invoke('write-file', resolvePath(filename), content);
        }
    }

    const readMatch = text.match(/read:([^\n|]+)/);
    if (readMatch) {
        const filename = readMatch[1].trim();
        if (filename) {
            ipcRenderer.invoke('read-file', resolvePath(filename)).then(content => {
                const full = `${filename} | ${content}`;
                if (full === lastPasted) return;
                lastPasted = full;
                const input = document.querySelector('[contenteditable]');
                if (input) {
                    input.focus();
                    input.innerText = full;
                    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    if (autoSend) {
                        setTimeout(() => {
                            const sendBtn = document.querySelector('[aria-label="Send message"], [aria-label="Send"], button[class*="send"], button[data-testid*="send"]');
                            if (sendBtn) { sendBtn.click(); return; }
                            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                        }, 300);
                    }
                }
            }).catch(() => {});
        }
    }
}

function handleNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    if (processed.has(node)) return;
    const text = node.textContent || '';
    if (lastPasted && text.trim() === lastPasted) return;
    processed.add(node);
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
            }, 800);
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
