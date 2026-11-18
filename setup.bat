@echo off
setlocal
echo ==========================================
echo   PROJECT XERO — Windows Setup ^& Launch
echo ==========================================

where node >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js 20+ is required. Download from https://nodejs.org/
  pause
  exit /b 1
)

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo [1/4] Created .env from .env.example
  )
)

echo [2/4] Installing dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 exit /b 1

echo [3/4] Running production build...
call npm run build
if errorlevel 1 exit /b 1

echo [4/4] Launching XERO on http://localhost:3000 ...
start "" powershell -ExecutionPolicy Bypass -File scripts\launch-xero.ps1
call npm start
