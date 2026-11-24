@echo off
setlocal
set "EDUCOLOGIA_EXE=%~dp0Educologia-Windows-x64\Educologia.exe"

if not exist "%EDUCOLOGIA_EXE%" (
    echo Extrae todo el ZIP con "Extraer todo" y abre este archivo desde la carpeta extraida.
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; $exe = $env:EDUCOLOGIA_EXE; $desktop = [Environment]::GetFolderPath('DesktopDirectory'); if (-not $desktop) { throw 'No se encontro el Escritorio.' }; $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut((Join-Path $desktop 'Educologia.lnk')); $shortcut.TargetPath = $exe; $shortcut.WorkingDirectory = [IO.Path]::GetDirectoryName($exe); $shortcut.IconLocation = $exe + ',0'; $shortcut.Description = 'Inventario de Educologia'; $shortcut.Save()"
if errorlevel 1 echo No se pudo crear el acceso directo. La aplicacion se abrira de todos modos.

start "" "%EDUCOLOGIA_EXE%"
if errorlevel 1 (
    echo Windows no pudo abrir Educologia.exe.
    pause
    exit /b 1
)
