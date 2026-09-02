Set WshShell = CreateObject("WScript.Shell")
' Ejecuta el bat en modo oculto (el número 0 al final lo hace invisible)
WshShell.Run "cmd /c ""C:\Users\talle\Music\INVESTILLO\investillo\investillo.bat""", 0, False
