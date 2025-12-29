@echo off
title Lumina PDF
cd /d "%~dp0"

IF NOT EXIST "node_modules\" (
    echo Installation des dependances...
    call npm install
)

echo Demarrage du serveur...
start /B npm run dev

echo Attente du lancement...
timeout /t 5 /nobreak >nul

echo Ouverture du navigateur...
start "" "http://localhost:3000"

echo.
echo L'application est en cours d'execution.
echo Ne fermez pas cette fenetre tant que vous l'utilisez.
pause
