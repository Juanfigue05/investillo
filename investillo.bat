@echo off
cd /d "C:\Users\TuUsuario\Documents\investillo"  

:: Abre el navegador en la dirección local
start http://localhost:8080

:: Inicia el servidor en segundo plano dentro de la misma sesión
start /b pnpm run start:prod

:: Cierra la ventana actual de CMD de inmediato
exit
