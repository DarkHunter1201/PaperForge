@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1"
set "paperforge_code=%errorlevel%"
if not "%paperforge_code%"=="0" echo PaperForge: запуск не выполнен.
if not "%paperforge_code%"=="0" if not defined PAPERFORGE_AUTOMATED pause
exit /b %paperforge_code%
