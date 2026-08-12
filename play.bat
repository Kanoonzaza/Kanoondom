@echo off
title Kingdom Sim v2
cd /d "%~dp0"
start "" http://localhost:8778/
node server.js 8778
pause
