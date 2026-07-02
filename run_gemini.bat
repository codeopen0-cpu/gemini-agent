@echo off
cd /d "%~dp0"
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)
if exist "node_modules\.bin\electron.cmd" (
    node_modules\.bin\electron.cmd .
) else (
    npx electron .
)
pause