@echo off
:: Configura el puerto de tu localhost
set PUERTO=8080

:: Verifica si el puerto 8080 ya está en uso
netstat -ano | findstr :%PUERTO% >nul
if %errorlevel% equ 0 (
    echo El servidor ya esta iniciado en el puerto %PUERTO%.
    goto :abrir_chrome
)

echo El servidor no esta iniciado. Iniciando servidor...
:: Navega a la carpeta del proyecto
cd /d "C:\Users\talle\Music\INVESTILLO\investillo"  

:: Ejecuta el servidor en segundo plano usando 'start' para que el script pueda continuar
start /b pnpm run start:prod

:: Pausa de 4 segundos para dar tiempo a que inicie el servidor local
timeout /t 4 /nobreak > nul

:abrir_chrome
echo Abriendo Chrome en http://localhost:%PUERTO%...
start chrome http://localhost:%PUERTO%
