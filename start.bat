@echo off
title Assistenz Manager
cd /d "%~dp0"

echo Starting Assistenz Manager...
echo.

:: Start the dev server in the background and open browser after a short delay
start "" /B cmd /c "npm run dev"

:: Wait 3 seconds for the server to start, then open the browser
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

echo Server is running at http://localhost:5173
echo Close this window to stop the server.
echo.

:: Keep window open so server keeps running
npm run dev

