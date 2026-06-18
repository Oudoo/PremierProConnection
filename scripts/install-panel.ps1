<#
  Install the "Claude for Premiere" CEP panel on Windows.

    powershell -ExecutionPolicy Bypass -File scripts\install-panel.ps1
    powershell -ExecutionPolicy Bypass -File scripts\install-panel.ps1 -Symlink

  -Symlink requires Developer Mode or an elevated shell; default is a copy.
  After running: restart Premiere -> Window -> Extensions -> Claude for Premiere.
#>
param([switch]$Symlink)

$ErrorActionPreference = "Stop"
$ExtId    = "com.claudeforpremiere.panel"
$Here     = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PanelSrc = Join-Path $Here "panel"

if (-not (Test-Path $PanelSrc)) {
  Write-Error "panel\ not found at $PanelSrc"; exit 1
}

Write-Host "-> Enabling unsigned CEP extensions (PlayerDebugMode) for CSXS 6-12..."
foreach ($v in 6..12) {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  New-Item -Path $key -Force | Out-Null
  New-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
}

$ExtDir = Join-Path $env:APPDATA "Adobe\CEP\extensions"
New-Item -ItemType Directory -Force -Path $ExtDir | Out-Null
$Dest = Join-Path $ExtDir $ExtId

Write-Host "-> Installing panel into: $Dest"
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }

if ($Symlink) {
  New-Item -ItemType SymbolicLink -Path $Dest -Target $PanelSrc | Out-Null
} else {
  Copy-Item -Recurse -Force $PanelSrc $Dest
}

Write-Host ""
Write-Host "Panel installed."
Write-Host "  1. Start the bridge:   cd bridge; npm install; npm run dev"
Write-Host "  2. Restart Premiere Pro."
Write-Host "  3. Window -> Extensions -> Claude for Premiere."
Write-Host ""
Write-Host "  (Debug the panel UI at http://localhost:8088 in Chrome.)"
