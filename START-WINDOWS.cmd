@echo off
cd /d "%~dp0dist"
where py >nul 2>nul || (echo Installeer Python 3 om de lokale 3D-preview te starten. & pause & exit /b 1)
start "" http://localhost:8000/
py -m http.server 8000 --bind 127.0.0.1
pause
