@echo off
title Dochazka - START

REM 1) Next server
start "Next.js" cmd /k "cd /d C:\Users\lukas\dochazka-pwa && npm start"

REM 2) Tunnel přes HTTP2 (stabilnější)
start "Cloudflared Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000 --protocol http2"

echo Spusteno: Next.js + Tunnel
pause
