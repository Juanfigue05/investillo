@echo off
cd /d "%~dp0"
start "" http://localhost:8080
pnpm run start:prod