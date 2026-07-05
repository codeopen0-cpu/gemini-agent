const { ipcRenderer, contextBridge } = require('electron');
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

    const textParts = [];
    let hasUploadedFiles = false;
    for (const f of readFiles) {
        if (processedReads.has(f.toLowerCase())) continue;
        processedReads.add(f.toLowerCase());
        const result = await ipcRenderer.invoke('read-file', f);
        if (!result || result.content === 'File not found') continue;

        if (result.type === 'dir') {
            textParts.push(`read:${f}\n${result.content}`);
        } else if (result.type === 'file') {
            const chatInput = document.querySelector('[contenteditable]') || document.querySelector('rich-textarea');
            if (chatInput) chatInput.focus();
            await new Promise(r => setTimeout(r, 200));

            const upload = await ipcRenderer.invoke('upload-file', result.filePath);
            console.log(`[GeminiAgent] upload-file ${result.filePath}:`, JSON.stringify(upload));
            if (upload.success) {
                hasUploadedFiles = true;
                await new Promise(r => setTimeout(r, 1200));
            } else {
                const c = result.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');
                textParts.push(`read:${f}\n\`\`\`\n${c}\n\`\`\``);
            }
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

    if (autoSend && (textParts.length > 0 || hasUploadedFiles)) {
        setTimeout(() => {
            const btn = document.querySelector('[aria-label="Send message"], [aria-label="Send"]');
            if (btn) btn.click();
        }, 500);
    }
}

const responseTimers = new Map();
const processedTexts = new Set();
const processedReads = new Set();
window.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        if (!isCommandMode) return;
        for (const m of mutations) {
            let response = null;
            if (m.type === 'childList') {
                m.addedNodes.forEach(n => {
                    if (n.nodeType === Node.ELEMENT_NODE && isAiResponse(n)) response = n;
                });
            }
            if (m.type === 'characterData') {
                const p = m.target.parentElement;
                if (p) response = p.closest('model-response');
            }
            if (!response) continue;
            if (responseTimers.has(response)) clearTimeout(responseTimers.get(response));
            responseTimers.set(response, setTimeout(() => {
                responseTimers.delete(response);
                const text = response.textContent;
                const hash = text.replace(/\s+/g, ' ').slice(0, 200);
                if (processedTexts.has(hash)) return;
                processedTexts.add(hash);
                processText(text);
            }, 1500));
        }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
});

ipcRenderer.on('toggle-command-mode', () => {
    isCommandMode = !isCommandMode;
    processedReads.clear();
    alert(`Command Mode: ${isCommandMode ? 'ON' : 'OFF'}`);
});
ipcRenderer.on('toggle-auto-send', () => {
    autoSend = !autoSend;
    alert(`Auto-send: ${autoSend ? 'ON' : 'OFF'}`);
});

contextBridge.exposeInMainWorld('__captureUploadApi', async () => {
    const result = await ipcRenderer.invoke('capture-upload-api');
    if (result.success && result.api) {
        alert(`Upload API captured: ${result.api.url}`);
    } else {
        alert('No upload API detected within 30s. Manually upload a file in Gemini.');
    }
});
console.log('Gemini Agent loaded. Ctrl+Shift+\\ toggles command mode, Ctrl+Shift+A toggles auto-send. Run __captureUploadApi() in console to capture upload endpoint.');
