const { ipcRenderer } = require('electron');
let isCommandMode = false;
let autoSend = true;
let lastPasted = '';

function resolvePath(name) {
    if (/^[A-Za-z]:\\/.test(name)) return name;
    return null;
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
    if (readFiles.length > 0) {
        const input = document.querySelector('[contenteditable]');
        if (!input) return;
        input.focus();

        const results = [];
        for (const f of readFiles) {
            const content = (await ipcRenderer.invoke('read-file', f)).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
            if (!content || content === 'File not found') continue;
            if (content.includes(', ') && !content.includes('\n')) {
                results.push(`read:${f}\n${content}`);
            } else {
                results.push(`read:${f}\n\`\`\`\n${content}\n\`\`\``);
            }
        }
        const full = results.join('\n\n');
        if (!full || full === lastPasted) return;
        lastPasted = full;
        input.innerText = full.replace(/^  +/gm, m => '\xA0'.repeat(m.length));
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        if (autoSend) {
            setTimeout(() => {
                const btn = document.querySelector('[aria-label="Send message"], [aria-label="Send"]');
                if (btn) btn.click();
            }, 500);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        if (!isCommandMode) return;
        for (const m of mutations) {
            m.addedNodes.forEach(n => {
                if (n.nodeType === Node.ELEMENT_NODE) processText(n.textContent);
            });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});

ipcRenderer.on('toggle-command-mode', () => {
    isCommandMode = !isCommandMode;
    alert(`Command Mode: ${isCommandMode ? 'ON' : 'OFF'}`);
});
ipcRenderer.on('toggle-auto-send', () => {
    autoSend = !autoSend;
    alert(`Auto-send: ${autoSend ? 'ON' : 'OFF'}`);
});
