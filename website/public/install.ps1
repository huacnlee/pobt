# Installs POBT, or updates it:
#   irm https://huacnlee.github.io/pobt/install.ps1 | iex
# $env:POBT_BASE_URL  where the release assets are (default: the latest GitHub release)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # the progress bar slows downloads down a lot
# Windows PowerShell 5.1 may not offer TLS 1.2 by default.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($Arch -ne "AMD64") { throw "POBT: needs 64-bit Windows (x86_64)" }

$Base = if ($env:POBT_BASE_URL) { $env:POBT_BASE_URL } else { "https://github.com/huacnlee/pobt/releases/latest/download" }
$Asset = "pobt-windows-x86_64.zip"
$Dir = Join-Path $env:LOCALAPPDATA "Programs\POBT"
$Work = Join-Path ([IO.Path]::GetTempPath()) ("pobt-" + [IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $Work | Out-Null

try {
  Write-Host "Downloading $Asset"
  $Zip = Join-Path $Work $Asset
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile $Zip
  $Sums = Join-Path $Work "sha256sums"
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/sha256sums" -OutFile $Sums
  $Line = Get-Content $Sums | Where-Object { (($_ -split "\s+")[1] -replace "^\*", "") -eq $Asset } | Select-Object -First 1
  if (-not $Line -or ($Line -split "\s+")[0] -ne (Get-FileHash -Algorithm SHA256 -Path $Zip).Hash) {
    throw "POBT: the checksum of $Asset does not match; nothing was installed"
  }

  $Unpacked = Join-Path $Work "unpacked"
  Expand-Archive -Path $Zip -DestinationPath $Unpacked
  $Exe = Get-ChildItem -Path $Unpacked -Recurse -Filter "POBT.exe" | Select-Object -First 1
  if (-not $Exe) { throw "POBT: $Asset holds no POBT.exe" }

  # A running app locks its files.
  Get-Process -Name POBT -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Dir\*" } | Stop-Process -Force
  Start-Sleep -Milliseconds 500
  if (Test-Path $Dir) { Remove-Item -Recurse -Force $Dir }
  New-Item -ItemType Directory -Force -Path (Split-Path $Dir) | Out-Null
  Move-Item -Path $Exe.Directory.FullName -Destination $Dir

  $Shell = New-Object -ComObject WScript.Shell
  foreach ($Folder in @([Environment]::GetFolderPath("Programs"), [Environment]::GetFolderPath("Desktop"))) {
    $Link = $Shell.CreateShortcut((Join-Path $Folder "POBT.lnk"))
    $Link.TargetPath = Join-Path $Dir "POBT.exe"
    $Link.WorkingDirectory = $Dir
    $Link.IconLocation = "$(Join-Path $Dir 'POBT.exe'),0"
    $Link.Save()
  }

  Write-Host "Installed $Dir"
  Write-Host ""
  Write-Host "Open POBT from the Start menu or the desktop. It needs Path of Building Community installed."
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Work
}
