# package.ps1 - assemble the offline Windows product and (optionally) build the installer.
#
# Produces a self-contained ClaudeRtl.exe (no .NET prerequisite) bundled with the patch scripts,
# a prebuilt RTL payload, and a portable Node runtime (node.exe + @electron/asar + @electron/fuses)
# so an end user can patch with ZERO prerequisites - no Node, no internet. Then runs Inno Setup
# (iscc) to produce ClaudeRTL-Setup-<version>.exe.
#
#   pwsh -File gui\windows\package.ps1                 # full build + installer
#   pwsh -File gui\windows\package.ps1 -SkipInstaller  # stage only (no iscc)
#
# Used locally and by .github/workflows/release.yml. Needs: .NET 8 SDK, Node (build-time, for npm
# + payload), and Inno Setup 6 (iscc) on PATH for the installer step.
param(
    [string]$Configuration = 'Release',
    [string]$NodeVersion   = '22.12.0',   # >= 22.12.0: required by current @electron/asar
    [switch]$SkipInstaller
)
$ErrorActionPreference = 'Stop'

function Step($m){ Write-Host "`n==> $m" -ForegroundColor Cyan }
function Warn($m){ Write-Host "    [warn] $m" -ForegroundColor Yellow }

$Here     = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $Here '..\..')).Path
$Version  = (Get-Content (Join-Path $RepoRoot 'VERSION') -Raw).Trim()
$Csproj   = Join-Path $Here 'ClaudeRtl.csproj'
$Out      = Join-Path $Here 'dist'
$Stage    = Join-Path $Out 'stage'
$Publish  = Join-Path $Out 'publish'

Write-Host "Claude RTL packager - version $Version ($Configuration), node $NodeVersion"

# --- clean ---
Step "cleaning $Out"
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Stage, $Publish, (Join-Path $Stage 'scripts'), (Join-Path $Stage 'runtime') | Out-Null

# --- 1. publish the self-contained single-file exe (no trimming; WPF single-file + trim crashes) ---
Step "dotnet publish (self-contained, single-file, win-x64)"
& dotnet publish $Csproj -c $Configuration -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:PublishTrimmed=false -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:Version=$Version -p:AssemblyVersion=$Version -p:FileVersion=$Version `
    -o $Publish | Out-Null
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed ($LASTEXITCODE)" }
Copy-Item (Join-Path $Publish 'ClaudeRtl.exe') $Stage -Force
Write-Host ("    ClaudeRtl.exe: {0:N1} MB" -f ((Get-Item (Join-Path $Stage 'ClaudeRtl.exe')).Length/1MB))

# --- 2. patch scripts ---
Step "copying patch scripts"
$scriptsDst = Join-Path $Stage 'scripts'
foreach ($f in 'patch-msix.ps1','patch.ps1','preflight.ps1','diagnose.ps1','watch.ps1','inject.mjs') {
    Copy-Item (Join-Path $RepoRoot "desktop\windows\$f") $scriptsDst -Force
}

# --- 3. prebuilt RTL payload (so no build step is needed at patch time) ---
Step "building RTL payload"
& node (Join-Path $RepoRoot 'build\build-payload.js') | Out-Null
if ($LASTEXITCODE -ne 0) { throw "build-payload.js failed ($LASTEXITCODE)" }
Copy-Item (Join-Path $RepoRoot 'dist\payload.js') (Join-Path $scriptsDst 'payload.js') -Force
Write-Host ("    payload.js: {0:N0} KB" -f ((Get-Item (Join-Path $scriptsDst 'payload.js')).Length/1KB))

# --- 4. portable Node runtime (node.exe + @electron/asar + @electron/fuses) ---
Step "fetching portable Node $NodeVersion"
$runtimeDst = Join-Path $Stage 'runtime'
$nodeZip = Join-Path $Out 'node.zip'
$nodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
# Extract ONLY node.exe directly from the zip - unzipping the whole archive blows past MAX_PATH on
# node's bundled npm tree (deep node_modules), and we ship just the runtime anyway.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipArchive = [System.IO.Compression.ZipFile]::OpenRead($nodeZip)
try {
    $entry = $zipArchive.Entries | Where-Object { $_.FullName -match '(^|/)node\.exe$' -and $_.FullName -notmatch 'node_modules' } | Select-Object -First 1
    if (-not $entry) { throw "node.exe not found in $nodeUrl" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $runtimeDst 'node.exe'), $true)
} finally { $zipArchive.Dispose() }
Write-Host ("    node.exe: {0:N1} MB" -f ((Get-Item (Join-Path $runtimeDst 'node.exe')).Length/1MB))

Step "installing @electron/asar + @electron/fuses into runtime"
Set-Content -Path (Join-Path $runtimeDst 'package.json') -Value '{ "name": "claude-rtl-runtime", "private": true }' -Encoding ascii
Push-Location $runtimeDst
try {
    & npm install '@electron/asar' '@electron/fuses' --omit=dev --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
} finally { Pop-Location }
Remove-Item (Join-Path $runtimeDst 'package.json'), (Join-Path $runtimeDst 'package-lock.json') -Force -ErrorAction SilentlyContinue
Write-Host ("    node_modules: {0:N1} MB" -f ((Get-ChildItem (Join-Path $runtimeDst 'node_modules') -Recurse -File | Measure-Object Length -Sum).Sum/1MB))

# --- 5. installer ---
$total = (Get-ChildItem $Stage -Recurse -File | Measure-Object Length -Sum).Sum/1MB
Write-Host ("`nstaged payload: {0:N1} MB at {1}" -f $total, $Stage)

if ($SkipInstaller) { Step "done (staged; -SkipInstaller set)"; return }

$iscc = Get-Command iscc -ErrorAction SilentlyContinue
if (-not $iscc) {
    Warn "Inno Setup 'iscc' not on PATH - skipping installer. Install Inno Setup 6, or re-run with -SkipInstaller."
    return
}
Step "building installer with Inno Setup"
& iscc /DAppVersion=$Version /DStageDir=$Stage /DOutDir=$Out (Join-Path $Here 'installer.iss')
if ($LASTEXITCODE -ne 0) { throw "iscc failed ($LASTEXITCODE)" }
$setup = Get-ChildItem $Out -Filter 'ClaudeRTL-Setup-*.exe' | Select-Object -First 1
if ($setup) { Write-Host ("`nINSTALLER: {0} ({1:N1} MB)" -f $setup.FullName, ($setup.Length/1MB)) -ForegroundColor Green }
