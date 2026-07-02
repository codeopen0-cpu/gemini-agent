Gemini Local File Agent
========================

An Electron app that lets Gemini read/write files on your local machine
through chat commands.

SETUP
-----
1. Run run_gemini.bat (auto-installs dependencies if needed)
2. Gemini will open in the Electron window
3. Press Ctrl+Shift+\ to enable command mode (an alert will confirm)

COMMANDS (type these in Gemini chat while command mode is on)
--------
Write a file:  write:filename.txt|Your content here
Read a file:   read:filename.txt
List a folder: read:D:\Path\To\Folder

Paths can be absolute (D:\...) or relative (just a filename).

HOW IT WORKS
------------
When Gemini's response contains "write:filename|content" or
"read:path", the app intercepts the message and performs the
file operation automatically.

- write: saves the content to a file in the app's folder
- read: reads a file and pastes the content into the chat input,
        then auto-submits it so Gemini can see it
- Multiple write: commands in one message are all processed

MEMORY / CUSTOM INSTRUCTIONS PROMPT
-------------------------------------
Copy this into Gemini's memory or custom instructions:

I have a local file tool connected. Include these prefixes in
your reply to trigger actions:

read:[path]          -- reads a file or lists a folder's contents
write:[filename]|[content]  -- writes content to a file

Examples:
write:test.txt|This is a test.
read:D:\GeminiAgent
dont put extra spacing when writing code and also dont put large font comments, only // comments are allowed depending on file type
Paths can be absolute (D:\...) or relative filenames (saved to
the project folder). Folders return a listing like:
D:\path\file1, D:\path\file2, D:\path\subfolder\

FILES
-----
main.js        -- Electron main process
preload.js     -- Handles DOM observation and commands
run_gemini.bat -- Launcher script
package.json   -- Dependencies (Electron)
