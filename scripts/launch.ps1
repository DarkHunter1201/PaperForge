$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
. (Join-Path $PSScriptRoot 'runtime-env.ps1')
$preparedPath = Join-Path $PaperForgeConfigRoot 'prepared.json'
if (
  -not (Test-Path -LiteralPath $PaperForgeNodeExe -PathType Leaf) -or
  -not (Test-Path -LiteralPath $PaperForgePnpmCmd -PathType Leaf) -or
  -not (Test-Path -LiteralPath $preparedPath -PathType Leaf) -or
  -not (Test-Path -LiteralPath (Join-Path $PaperForgeProjectRoot 'node_modules') -PathType Container)
) {
  throw 'PaperForge ещё не подготовлен. Сначала запустите «Нажми на меня перед запуском.bat».'
}
$prepared = Get-Content -Raw -LiteralPath $preparedPath | ConvertFrom-Json
if (
  [string]$prepared.version -ne [string]$PaperForgeManifest.version -or
  [string]$prepared.node -ne $PaperForgeNodeVersion -or
  [string]$prepared.pnpm -ne $PaperForgePnpmVersion
) {
  throw 'Окружение устарело. Снова запустите «Нажми на меня перед запуском.bat».'
}
Set-PaperForgeEnvironment
Write-Host 'PaperForge: запуск приложения...'
$process = Start-Process -FilePath $PaperForgePnpmCmd -ArgumentList 'dev' -WorkingDirectory $PaperForgeProjectRoot -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 3
if ($process.HasExited -and $process.ExitCode -ne 0) {
  throw "PaperForge не запустился. Код ошибки: $($process.ExitCode)."
}
Write-Host 'PaperForge запущен.'
