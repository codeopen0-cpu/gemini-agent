const { ipcRenderer, contextBridge } = require('electron');
let isCommandMode = false;
let autoSend = true;
let lastPasted = '';

function isAiResponse(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.tagName === 'MODEL-RESPONSE') return true;
    if (node.closest('user-query')) return false;
    if (node.closest('model-response')) return true;
    return false;
}

function getModelResponse(node) {
    if (node.tagName === 'MODEL-RESPONSE') return node;
    return node.closest('model-response');
}

function getResponseText(root) {
    let result = '';
    for (const node of root.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (tag === 'BR') {
                result += '\n';
            } else {
                const inner = getResponseText(node);
                result += inner;
                if (['DIV', 'P', 'PRE', 'TR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HR', 'UL', 'OL'].includes(tag) && !inner.endsWith('\n')) {
                    result += '\n';
                }
            }
        }
    }
    return result;
}

async function processText(text) {
    const writeMatches = text.matchAll(/write:([^|]+?)\|([\s\S]+?)(?=write:|read:|$)/g);
    for (const m of writeMatches) {
        let content = m[2].trim();
        content = content.replace(/^\.{4,}/gm, m => ' '.repeat(m.length));
        const commentMatch = content.match(/\n\n[A-Z][a-z]+?\s+(?:the|a|an|i|we|you|would|here|this|that|there|it|to)\b|\n(?:Here|This|That|There|It|We|You|Your|Would|Are|Is|The|In|To|For|Note)\b/);
        if (commentMatch) content = content.slice(0, commentMatch.index);
        if (content) {
            await ipcRenderer.invoke('write-file', m[1].trim(), content);
            await new Promise(r => setTimeout(r, 500));
        }
    }

    const readMatches = text.matchAll(/read:([^\n|]+?)(?=\s*write:|\s*read:|\n|$)/g);
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
            let mr = null;
            if (m.type === 'childList') {
                for (const n of m.addedNodes) {
                    if (n.nodeType === Node.ELEMENT_NODE && isAiResponse(n)) {
                        mr = getModelResponse(n);
                    }
                }
            }
            if (m.type === 'characterData') {
                const p = m.target.parentElement;
                if (p) mr = getModelResponse(p);
            }
            if (!mr) continue;
            if (responseTimers.has(mr)) clearTimeout(responseTimers.get(mr));
            responseTimers.set(mr, setTimeout(() => {
                responseTimers.delete(mr);
                const text = getResponseText(mr);
                const hash = text;
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
