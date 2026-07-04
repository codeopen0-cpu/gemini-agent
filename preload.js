const { ipcRenderer } = require('electron');
let isCommandMode = false;
let autoSend = true;
let lastPasted = '';

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
            const uploadResult = await ipcRenderer.invoke('upload-file', result.filePath);
            if (uploadResult.success) {
                uploadedAny = true;
            } else {
                const c = result.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
                textParts.push(`read:${f}\n\`\`\`\n${c}\n\`\`\``);
            }
        }
    }

    if (textParts.length > 0) {
        const full = textParts.join('\n\n');
        if (full !== lastPasted) {
            lastPasted = full;
            input.innerText = full.replace(/^  +/gm, m => '\xA0'.repeat(m.length));
            input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        }
    }

    if (autoSend) {
        setTimeout(() => {
            const btn = document.querySelector('[aria-label="Send message"], [aria-label="Send"]');
            if (btn) btn.click();
        }, uploadedAny ? 5000 : 500);
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
