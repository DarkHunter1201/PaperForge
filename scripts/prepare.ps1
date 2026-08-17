$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
. (Join-Path $PSScriptRoot 'runtime-env.ps1')
Write-Host 'PaperForge: проверка окружения...'
foreach ($directory in @(
  $PaperForgeRuntimeRoot,
  $PaperForgePnpmRoot,
  $PaperForgeCacheRoot,
  $PaperForgeTempRoot,
  $PaperForgeConfigRoot
)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
Set-PaperForgeEnvironment
if (-not (Test-Path -LiteralPath $PaperForgeNodeExe -PathType Leaf)) {
  Write-Host "PaperForge: загрузка Node.js $PaperForgeNodeVersion..."
  $archiveName = "node-v$PaperForgeNodeVersion-win-x64.zip"
  $archivePath = Join-Path $PaperForgeTempRoot $archiveName
  $downloadUrl = "https://nodejs.org/dist/v$PaperForgeNodeVersion/$archiveName"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -UseBasicParsing
  $hashStream = [System.IO.File]::OpenRead($archivePath)
  try {
    $hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $hashAlgorithm.ComputeHash($hashStream)
    $actualHash = [System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $hashStream.Dispose()
    if ($hashAlgorithm) {
      $hashAlgorithm.Dispose()
    }
  }
  if ($actualHash -ne $PaperForgeNodeSha256) {
    throw 'Контрольная сумма загруженного Node.js не совпала.'
  }
  Expand-Archive -LiteralPath $archivePath -DestinationPath $PaperForgeRuntimeRoot -Force
  Remove-Item -LiteralPath $archivePath -Force
}
if (-not (Test-Path -LiteralPath $PaperForgeNodeExe -PathType Leaf)) {
  throw 'Node.js не удалось подготовить внутри проекта.'
}
$installedNodeVersion = (& $PaperForgeNodeExe --version).TrimStart('v')
if ($installedNodeVersion -ne $PaperForgeNodeVersion) {
  throw "Обнаружена неподходящая версия Node.js: $installedNodeVersion."
}
$installedPnpmVersion = ''
if (Test-Path -LiteralPath $PaperForgePnpmCmd -PathType Leaf) {
  $installedPnpmVersion = (& $PaperForgePnpmCmd --version).Trim()
}
if ($installedPnpmVersion -ne $PaperForgePnpmVersion) {
  Write-Host "PaperForge: установка pnpm $PaperForgePnpmVersion..."
  & $PaperForgeNpmCmd install --global "pnpm@$PaperForgePnpmVersion" --prefix $PaperForgePnpmRoot --no-audit --no-fund --loglevel=error
  if ($LASTEXITCODE -ne 0) {
    throw 'Не удалось установить pnpm.'
  }
}
Write-Host 'PaperForge: проверка и установка зависимостей...'
Push-Location $PaperForgeProjectRoot
try {
  & $PaperForgePnpmCmd install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) {
    throw 'Не удалось установить зависимости PaperForge.'
  }
  $electronExecutable = Join-Path $PaperForgeProjectRoot 'node_modules\electron\dist\electron.exe'
  if (-not (Test-Path -LiteralPath $electronExecutable -PathType Leaf)) {
    Write-Host 'PaperForge: подготовка Electron...'
    & $PaperForgePnpmCmd exec install-electron
    if ($LASTEXITCODE -ne 0) {
      throw 'Не удалось подготовить Electron.'
    }
  }
  if (-not (Test-Path -LiteralPath $electronExecutable -PathType Leaf)) {
    throw 'Исполняемый файл Electron не найден после подготовки.'
  }
  & $PaperForgePnpmCmd exec electron-vite --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Проверка готовности PaperForge завершилась ошибкой.'
  }
}
finally {
  Pop-Location
}
$preparedState = [ordered]@{
  version = [string]$PaperForgeManifest.version
  node = $PaperForgeNodeVersion
  pnpm = $PaperForgePnpmVersion
  preparedAt = [DateTime]::UtcNow.ToString('o')
}
$preparedState | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PaperForgeConfigRoot 'prepared.json') -Encoding UTF8
Write-Host 'PaperForge: подготовка завершена. Теперь запустите «Запустить PaperForge.bat».'
