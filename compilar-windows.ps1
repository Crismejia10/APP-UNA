param(
    [string]$Cache = (Join-Path $env:TEMP 'educologia-build-45.3.4')
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$version = '45.3.4'
$archiveName = "electron-v$version-win32-x64.zip"
$releaseUrl = "https://github.com/electron/electron/releases/download/v$version"
New-Item -ItemType Directory -Path $Cache -Force | Out-Null
$archive = Join-Path $Cache 'electron.zip'
$checksums = Join-Path $Cache 'SHASUMS256.txt'
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -Uri "$releaseUrl/$archiveName" -OutFile $archive
}
if (-not (Test-Path -LiteralPath $checksums)) {
    Invoke-WebRequest -Uri "$releaseUrl/SHASUMS256.txt" -OutFile $checksums
}
$pattern = '^([a-f0-9]{64})\s+\*?' + [regex]::Escape($archiveName) + '$'
$checksumLine = Get-Content -LiteralPath $checksums | Where-Object { $_ -match $pattern }
if (-not $checksumLine -or $checksumLine -notmatch $pattern) {
    throw "No se encontró la suma oficial de $archiveName."
}
$expected = $Matches[1]
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {
    throw 'El archivo de Electron no coincide con la suma de la publicación oficial.'
}

$dist = Join-Path $PSScriptRoot 'dist'
$folderName = 'Educologia-Windows-x64'
$target = Join-Path $dist $folderName
New-Item -ItemType Directory -Path $target -Force | Out-Null
tar.exe -xf $archive -C $target
$electron = Join-Path $target 'electron.exe'
$application = Join-Path $target 'Educologia.exe'
Move-Item -LiteralPath $electron -Destination $application -Force
$appDir = Join-Path $target 'resources\app'
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
$sourceItems = @('package.json', 'desktop.cjs', 'index.html', 'css', 'js', 'assets')
foreach ($item in $sourceItems) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $item) -Destination $appDir -Recurse -Force
}
# Crea un archivo para distribuir la carpeta completa, incluidos los archivos del ejecutable.
$zip = Join-Path $dist "$folderName.zip"
$launcher = 'Abrir Educologia.cmd'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot $launcher) -Destination $dist -Force
$pendingZip = Join-Path $dist "$folderName.en-proceso.zip"
tar.exe -a -cf $pendingZip -C $dist $launcher $folderName
Move-Item -LiteralPath $pendingZip -Destination $zip -Force
Get-Item -LiteralPath $application, $zip | Select-Object FullName, Length
