@echo off
setlocal EnableExtensions EnableDelayedExpansion
:: Configura el puerto de tu localhost
set PUERTO=8080
goto :abrir_chrome
:: Verifica si el API de Investillo ya esta respondiendo
netstat -ano | findstr :%PUERTO% >nul
if %errorlevel% equ 0 (
    powershell -NoProfile -Command "try { if ((Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%PUERTO%/api/healthz' -TimeoutSec 2).StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
    if !errorlevel! equ 0 (
        echo Investillo ya esta iniciado en el puerto %PUERTO%.
        goto :abrir_chrome
    )
    echo El puerto %PUERTO% esta ocupado por otro programa.
    pause
    exit /b 2
)

echo El servidor no esta iniciado. Iniciando servidor...
:: Navega a la carpeta del proyecto
cd /d "C:\Users\talle\Music\INVESTILLO\investillo"  

if not exist ".env.local" (
    echo Falta .env.local. Configure la base PostgreSQL local antes de iniciar Investillo.
    pause
    exit /b 1
)

:: Ejecuta el servidor en segundo plano usando 'start' para que el script pueda continuar
if not exist "logs" mkdir "logs"
start "Investillo API local" /b cmd /c "pnpm run start:local >> logs\sistema.txt 2>&1"

:: Espera hasta 30 segundos a que el API responda
for /l %%N in (1,1,15) do (
    powershell -NoProfile -Command "try { if ((Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%PUERTO%/api/healthz' -TimeoutSec 2).StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
    if !errorlevel! equ 0 goto :abrir_chrome
    timeout /t 2 /nobreak > nul
)
echo Investillo no respondio despues de 30 segundos. Revise logs\sistema.txt.
pause
exit /b 3

:abrir_chrome
echo Abriendo Chrome en http://localhost:%PUERTO%...
start chrome http://localhost:%PUERTO%
