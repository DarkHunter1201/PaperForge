$PaperForgeProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$PaperForgeManifestPath = Join-Path $PaperForgeProjectRoot 'package.json'
if (-not (Test-Path -LiteralPath $PaperForgeManifestPath -PathType Leaf)) {
  throw 'Не найден package.json PaperForge.'
}
$PaperForgeManifest = Get-Content -Raw -LiteralPath $PaperForgeManifestPath | ConvertFrom-Json
$PaperForgeNodeVersion = [string]$PaperForgeManifest.engines.node
$PaperForgePnpmSpec = [string]$PaperForgeManifest.packageManager
$PaperForgePnpmVersion = $PaperForgePnpmSpec -replace '^pnpm@', ''
$PaperForgeNodeSha256 = [string]$PaperForgeManifest.paperForge.nodeWindowsX64Sha256
if ($PaperForgeNodeVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw 'В package.json указана некорректная версия Node.js.'
}
if ($PaperForgePnpmVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw 'В package.json указана некорректная версия pnpm.'
}
if ($PaperForgeNodeSha256 -notmatch '^[a-f0-9]{64}$') {
  throw 'В package.json отсутствует корректная контрольная сумма Node.js.'
}
$PaperForgeRuntimeRoot = Join-Path $PaperForgeProjectRoot '.paperforge\runtime'
$PaperForgeNodeRoot = Join-Path $PaperForgeRuntimeRoot "node-v$PaperForgeNodeVersion-win-x64"
$PaperForgeNodeExe = Join-Path $PaperForgeNodeRoot 'node.exe'
$PaperForgeNpmCmd = Join-Path $PaperForgeNodeRoot 'npm.cmd'
$PaperForgePnpmRoot = Join-Path $PaperForgeRuntimeRoot 'pnpm'
$PaperForgePnpmCmd = Join-Path $PaperForgePnpmRoot 'pnpm.cmd'
$PaperForgeCacheRoot = Join-Path $PaperForgeProjectRoot '.paperforge\cache'
$PaperForgeTempRoot = Join-Path $PaperForgeProjectRoot '.paperforge\temp'
$PaperForgeConfigRoot = Join-Path $PaperForgeProjectRoot '.paperforge\config'
function Set-PaperForgeEnvironment {
  $env:PATH = "$PaperForgeNodeRoot;$PaperForgePnpmRoot;$env:PATH"
  $env:npm_config_cache = Join-Path $PaperForgeCacheRoot 'npm'
  $env:PNPM_HOME = $PaperForgePnpmRoot
  $env:PNPM_STORE_DIR = Join-Path $PaperForgeCacheRoot 'pnpm-store'
  $env:ELECTRON_CACHE = Join-Path $PaperForgeCacheRoot 'electron'
  $env:ELECTRON_BUILDER_CACHE = Join-Path $PaperForgeCacheRoot 'electron-builder'
  $env:TEMP = $PaperForgeTempRoot
  $env:TMP = $PaperForgeTempRoot
  $env:PAPERFORGE_DATA_ROOT = Join-Path $PaperForgeProjectRoot '.paperforge'
}
