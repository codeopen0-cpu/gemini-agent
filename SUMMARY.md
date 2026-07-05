# Gemini Agent - Session Summary

## Goal
Electron app that lets Gemini read/write local files through chat commands via DOM observation

## Architecture
- `main.js` — Electron main process: IPC handlers, CF_HDROP clipboard writes, retry logic
- `preload.js` — Renderer preload: DOM observer, command processing, sequential upload orchestration
- `run_gemini.bat` — Launcher with auto npm install

## Features Implemented
### Command Processing
- `write:filename|content` — Creates/overwrites files (auto-creates parent dirs)
  - `....` indentation converted to spaces
  - AI commentary after content auto-stripped
- `read:filename` — Reads file content (multiple files supported per message)
  - Folders → paste listing as text via native clipboard IPC
  - Files → **native file drop upload** via CF_HDROP clipboard + `webContents.paste()`
    - Code-block paste fallback if upload fails
  - `processedReads` Set dedup per session (cleared on command mode toggle)
- Multiple `write:`/`read:` commands per message supported
- Line ending normalization: `\r\n` → `\n`, collapses 3+ newlines to 2

### DOM Observation
- Watches `<model-response>` custom elements (skips `<user-query>`)
- Streaming support: 1500ms debounce via `Map<Element, Timer>` per-response timer
- Dedup via `processedTexts` hash Set (first 200 chars)

### Upload Method: CF_HDROP Clipboard + Paste
1. Write file path to OS clipboard as native `CF_HDROP` via PowerShell `System.Windows.Forms.Clipboard::SetFileDropList`
   - Temp `.ps1` script file (avoids PowerShell quoting issues), cleaned up after execution
2. Focus chat input via `executeJavaScript` (try-catch wrapped)
3. Dispatch trusted paste via `webContents.paste()`
4. Retry loop: 3 attempts, ~1.1s each
5. **Sequential upload**: renderer-side focus before each upload + 1200ms inter-upload delay

### Toggleable Features
- **Command Mode** (`Ctrl+Shift+\`): Enables/disables DOM observer processing
  - `processedReads.clear()` on toggle to prevent stale dedup
- **Auto-Send** (`Ctrl+Shift+A`): Auto-clicks send button after processing (default ON)

### API Capture (exploratory)
- `__captureUploadApi()` exposed via `contextBridge.exposeInMainWorld`
- Monitors CDP `Network.requestWillBeSent` for 30s to capture Gemini's upload endpoint

### Tried & Rejected Approaches
- Synthetic `ClipboardEvent`/`DragEvent` with `DataTransfer` — blocked by `isTrusted` security
- `execCommand('insertText')` — fails in `<rich-textarea>` shadow DOM
- CDP `DOM.setFileInputFiles` + `DOM.dispatchEvent` — Gemini doesn't detect the change
- CDP `Input.dispatchDragEvent` — cannot create File objects without internal `fileSystemId`
- `navigator.clipboard.write(new ClipboardItem(...))` — blocked by CSP
- Button click + MutationObserver for file input — timing race with native dialog

## Key Decisions
- `<model-response>` custom element selector for AI response detection (stable)
- `clipboard.writeText + webContents.paste()` for pasting folder listings (trusted paste, works in shadow DOM)
- `contextBridge.exposeInMainWorld` for exposing functions to page console (isolated world requirement)
- PowerShell `System.Windows.Forms.Clipboard::SetFileDropList` for native `CF_HDROP` clipboard writes
- Temp PowerShell script file instead of inline `-Command` to avoid quoting issues
- Sequential upload reliability: renderer-side focus before each upload + 1200ms inter-upload delay + main-process retry loop with try-catch per step

## Known Working
- `read:README.txt` and `read:main.js` in same message → both upload as native file drops successfully
- Console confirms both uploads return `{"success":true,"method":"clipboard-file-drop+paste"}`

## Next Steps
1. **Test 3+ files** in one batch to stress sequential upload pipeline
2. **Test larger files** (multi-MB) to check CF_HDROP + paste timing
3. **If edge cases remain**: implement CDP `Input.dispatchMouseEvent` to click `xapfileselectortrigger` button at exact coordinates
4. **If all approaches fail**: implement API-based upload via captured endpoint using `fetch()` from renderer
