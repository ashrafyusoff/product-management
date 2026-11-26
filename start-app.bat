@echo off
cd /d "%~dp0"
echo [Product Management] Starting server on http://localhost:3001 ...
start "" http://localhost:3001
"C:\Users\nxg02917\nodejs\node-v22.12.0-win-x64\node.exe" server.mjs
