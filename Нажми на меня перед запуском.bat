@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare.ps1"
set "paperforge_code=%errorlevel%"
if not "%paperforge_code%"=="0" echo PaperForge: ошибка подготовки. Проверьте подключение к интернету и повторите запуск.
if not defined PAPERFORGE_AUTOMATED pause
exit /b %paperforge_code%
