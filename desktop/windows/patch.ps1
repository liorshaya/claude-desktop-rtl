<#
  patch.ps1 - apply (or restore) the claude-rtl patch on a Squirrel Claude install, IN PLACE.

  Mirrors desktop/patch.sh for the Squirrel path (docs/WINDOWS.md sec 10.1):
    extract app.asar -> inject payload + force-ui-direction switch (Node, byte-exact)
    -> repack (keep native modules unpacked) -> flip the asar-integrity fuse OFF.
  Dropped vs macOS: re-sign (Windows does not re-verify at launch) and all Cowork handling
  (cowork-svc.exe is absent on Squirrel). claude.exe + app.asar are backed up to *.crtl-bak
  first, so -Restore brings the pristine originals back.

  ASCII-ONLY by design: PS 5.1 reads a BOM-less .ps1 as Windows-1252 and corrupts non-ASCII
  (that is the bug that broke diagnose.ps1). Keep every character in this file ASCII.

    powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1            # apply
    powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1 -Status    # report
    powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1 -Restore   # undo
#>
param(
  [switch]$Restore,
  [switch]$Status,
  [switch]$Watch,    # install the per-user logon watcher (auto-reapply after a Claude update)
  [switch]$Unwatch,  # remove the logon watcher
  [switch]$NoStop,   # do NOT stop a running Claude (watcher use): patch the new version in place;
                     # RTL applies on next launch - never force-kills the user's session
  [switch]$Force     # stop a running Claude without an extra notice
)
$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path

# Offline bundled runtime (installer ships scripts\ + runtime\ + payload.js); dev falls back to a
# system node/npx and the built dist\payload.js. Lets a packaged user patch with zero prerequisites.
$RuntimeDir     = Join-Path $ScriptDir '..\runtime'
$BundledNode    = Join-Path $RuntimeDir 'node.exe'
$BundledModules = Join-Path $RuntimeDir 'node_modules'
$NodeExe     = if (Test-Path $BundledNode)    { (Resolve-Path $BundledNode).Path }    else { 'node' }
$NodeModules = if (Test-Path $BundledModules) { (Resolve-Path $BundledModules).Path } else { $null }
$BundledPayload = Join-Path $ScriptDir 'payload.js'
$Payload    = if (Test-Path $BundledPayload) { (Resolve-Path $BundledPayload).Path } else { Join-Path $RepoRoot 'dist\payload.js' }
$BuildJs    = Join-Path $RepoRoot 'build\build-payload.js'
$Inject     = Join-Path $ScriptDir 'inject.mjs'
$Preflight  = Join-Path $ScriptDir 'preflight.ps1'
$Marker     = 'claude-rtl-payload-v1'
$UnpackGlob = '{**/*.node,**/*.dll}'
$WatchPs1   = Join-Path $ScriptDir 'watch.ps1'
$RunKey     = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$RunName    = 'ClaudeRtlWatcher'

# Run @electron/asar / @electron/fuses via the bundled runtime when present (offline), else npx.
function Resolve-Bin($pkgRel) {
  $pkgDir = Join-Path $NodeModules $pkgRel
  $bin = (Get-Content (Join-Path $pkgDir 'package.json') -Raw | ConvertFrom-Json).bin
  $rel = if ($bin -is [string]) { $bin } else { ($bin.PSObject.Properties | Select-Object -First 1).Value }
  return (Join-Path $pkgDir $rel)
}
function Invoke-Asar  { if ($NodeModules) { & $NodeExe (Resolve-Bin '@electron\asar')  @args } else { npx --yes @electron/asar  @args } }
function Invoke-Fuses { if ($NodeModules) { & $NodeExe (Resolve-Bin '@electron\fuses') @args } else { npx --yes @electron/fuses @args } }

function Log($m){ Write-Host "patch: $m" }

# Read-only: is the RTL payload actually inside app.asar? (Chunked marker scan, same as
# watch.ps1's Test-Patched / patch-msix.ps1's Test-AsarPatched.) -Status must report THIS,
# not backup presence: -Restore keeps the *.crtl-bak files, so "backups exist" says nothing
# about whether the install is currently patched.
function Test-AsarPatched($asar) {
  if (-not (Test-Path $asar)) { return $false }
  try { $fs = [IO.File]::OpenRead($asar) } catch { return $false }
  try {
    $enc = [Text.Encoding]::GetEncoding('ISO-8859-1'); $buf = New-Object byte[] (4MB); $tail = ''
    while (($n = $fs.Read($buf,0,$buf.Length)) -gt 0) {
      $s = $tail + $enc.GetString($buf,0,$n)
      if ($s.IndexOf($Marker) -ge 0) { return $true }
      if ($s.Length -ge $Marker.Length) { $tail = $s.Substring($s.Length - $Marker.Length) }
    }
  } finally { $fs.Close() }
  return $false
}
function Die($m){ throw $m }

# --- locate the Squirrel install (highest app-* version) ---
function Get-Install {
  $base = Join-Path $env:LOCALAPPDATA 'AnthropicClaude'
  if (-not (Test-Path $base)) { Die "no Squirrel install at $base (MSIX is not supported yet - see docs/WINDOWS.md sec 3)." }
  $appDir = Get-ChildItem $base -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
            Sort-Object { [version]($_.Name -replace '^app-','') } -Descending |
            Select-Object -First 1
  if (-not $appDir) { Die "no app-* folder under $base." }
  $exe  = Join-Path $appDir.FullName 'claude.exe'
  $asar = Join-Path $appDir.FullName 'resources\app.asar'
  if (-not (Test-Path $exe))  { Die "claude.exe not found at $exe." }
  if (-not (Test-Path $asar)) { Die "app.asar not found at $asar." }
  return [pscustomobject]@{
    Dir = $appDir.FullName
    Ver = ($appDir.Name -replace '^app-','')
    Exe = $exe
    Asar = $asar
    Unpacked = (Join-Path $appDir.FullName 'resources\app.asar.unpacked')
  }
}

# --- stop a running Claude (cannot replace a locked exe/asar) ---
function Get-DesktopClaude {
  # ONLY Claude Desktop (processes whose exe lives under the install dir). NEVER the Claude Code
  # editor extension, whose process is ALSO named claude.exe (e.g. under .cursor/.vscode
  # extensions) - killing that would crash the user's Claude Code session.
  $base = Join-Path $env:LOCALAPPDATA 'AnthropicClaude'
  @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($base, [StringComparison]::OrdinalIgnoreCase) })
}

function Stop-Claude {
  $procs = Get-DesktopClaude
  if ($procs.Count -eq 0) { return }
  if (-not $Force) { Log "Claude Desktop is running; stopping it so the install can be patched (reopen it afterwards)." }
  $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  for ($i = 0; $i -lt 20 -and (Get-DesktopClaude).Count -gt 0; $i++) { Start-Sleep -Milliseconds 250 }
}

# --- logon watcher (auto-reapply after Claude updates): the launchd cmd_watch analogue ---
function Install-Watcher {
  if (-not (Test-Path $WatchPs1)) { Die "watch.ps1 not found at $WatchPs1." }
  $cmd = 'powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $WatchPs1
  New-Item -Path $RunKey -Force | Out-Null
  Set-ItemProperty -Path $RunKey -Name $RunName -Value $cmd
  Start-Process -FilePath 'powershell' -WindowStyle Hidden -ArgumentList @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$WatchPs1) | Out-Null
  Log "watcher installed (logon) and started - re-applies RTL after a Claude update."
  Log "log: $env:LOCALAPPDATA\claude-rtl\watch.log   (remove with: patch.ps1 -Unwatch)"
}

function Remove-Watcher {
  Remove-ItemProperty -Path $RunKey -Name $RunName -ErrorAction SilentlyContinue
  $stopped = 0
  # Match ONLY the resident watcher: a powershell whose command line carries watch.ps1's full
  # path. Exclude our own PID. (A broad '*watch.ps1*' match could hit unrelated shells that merely
  # mention the path - including the one running this script.)
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($WatchPs1) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $stopped++ }
  Log "watcher removed (logon entry deleted, $stopped running watcher(s) stopped)."
}

try {
  if ($Watch)   { Install-Watcher; exit 0 }
  if ($Unwatch) { Remove-Watcher;  exit 0 }
  $ins = Get-Install

  # --- STATUS ---
  if ($Status) {
    Log "install : $($ins.Dir)  (v$($ins.Ver))"
    $patched = Test-AsarPatched $ins.Asar
    Log "patched : $patched  (payload marker in app.asar)"
    $fuse = (Invoke-Fuses read --app $ins.Exe) | Out-String
    $line = ($fuse -split "`n" | Where-Object { $_ -match 'EnableEmbeddedAsarIntegrityValidation' }) -join ''
    Log "fuse    : $($line.Trim())"
    $running = Get-DesktopClaude
    Log "running : $($running.Count -gt 0)"
    $runVal = (Get-ItemProperty -Path $RunKey -Name $RunName -ErrorAction SilentlyContinue).$RunName
    Log "watcher : $([bool]$runVal)  (logon auto-reapply)"
    exit 0
  }

  # --- RESTORE ---
  if ($Restore) {
    $exeBak = "$($ins.Exe).crtl-bak"; $asarBak = "$($ins.Asar).crtl-bak"
    if (-not (Test-Path $exeBak) -and -not (Test-Path $asarBak)) { Die "no .crtl-bak backups under $($ins.Dir) - nothing to restore." }
    Stop-Claude
    if (Test-Path $asarBak) { Copy-Item $asarBak $ins.Asar -Force; Log "restored app.asar from backup." }
    if (Test-Path $exeBak)  { Copy-Item $exeBak  $ins.Exe  -Force; Log "restored claude.exe from backup (original fuse state + signature)." }
    Log "DONE - pristine original restored. (Backups kept; delete the *.crtl-bak files to remove them.)"
    exit 0
  }

  # --- APPLY ---
  if (-not $NoStop -and (Test-Path $Preflight)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Preflight
    if ($LASTEXITCODE -ne 0) { Die "preflight reported a blocker - aborting (see [FAIL] lines above)." }
  }

  if (-not (Test-Path $Payload)) {
    Log "building payload (dist/payload.js)..."
    & $NodeExe $BuildJs | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "build-payload.js failed (exit $LASTEXITCODE)." }
  }
  if (-not (Test-Path $Payload)) { Die "payload not found at $Payload." }
  if (-not (Select-String -Path $Payload -Pattern $Marker -SimpleMatch -Quiet)) { Die "payload missing marker $Marker - build looks wrong." }

  if (-not $NoStop) { Stop-Claude }

  # backup (never overwrite a pristine backup with an already-patched file)
  $exeBak = "$($ins.Exe).crtl-bak"; $asarBak = "$($ins.Asar).crtl-bak"
  if (-not (Test-Path $exeBak))  { Copy-Item $ins.Exe  $exeBak  -Force; Log "backed up claude.exe -> claude.exe.crtl-bak" } else { Log "claude.exe backup already present (kept pristine)." }
  if (-not (Test-Path $asarBak)) { Copy-Item $ins.Asar $asarBak -Force; Log "backed up app.asar -> app.asar.crtl-bak" } else { Log "app.asar backup already present (kept pristine)." }

  # snapshot the pristine unpacked set (safety net after repack)
  $origUnpacked = @()
  if (Test-Path $ins.Unpacked) {
    $origUnpacked = Get-ChildItem $ins.Unpacked -Recurse -File -ErrorAction SilentlyContinue |
                    ForEach-Object { $_.FullName.Substring($ins.Unpacked.Length + 1) }
  }

  # work dir (spike: extracted tree maxes ~127 chars, so no \\?\ long-path handling needed)
  $work = Join-Path $env:TEMP ("crtl-{0}" -f $PID)
  $appExtract = Join-Path $work 'app'
  try {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $work | Out-Null

    Log "extracting app.asar..."
    Invoke-Asar extract $ins.Asar $appExtract
    if ($LASTEXITCODE -ne 0) { Die "asar extract failed (exit $LASTEXITCODE)." }

    Log "injecting payload + force-ui-direction switch (Node, byte-exact)..."
    & $NodeExe $Inject $appExtract $Payload
    if ($LASTEXITCODE -ne 0) { Die "inject.mjs failed (exit $LASTEXITCODE)." }

    Log "repacking app.asar (keeping native modules unpacked)..."
    Remove-Item $ins.Asar -Force
    Invoke-Asar pack $appExtract $ins.Asar --unpack $UnpackGlob
    if ($LASTEXITCODE -ne 0) { Die "asar pack failed (exit $LASTEXITCODE) - restore with: patch.ps1 -Restore" }

    # safety net: every originally-unpacked native file must still be unpacked
    if ($origUnpacked.Count -gt 0) {
      $missing = $origUnpacked | Where-Object { -not (Test-Path (Join-Path $ins.Unpacked $_)) }
      if ($missing) { Die ("repack dropped unpacked binaries:`n  " + ($missing -join "`n  ")) }
    }

    Log "writing fuses (EnableEmbeddedAsarIntegrityValidation=off)..."
    Invoke-Fuses write --app $ins.Exe EnableEmbeddedAsarIntegrityValidation=off | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "fuses write failed (exit $LASTEXITCODE)." }
  }
  finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
  }

  Log "DONE -> $($ins.Dir)  (v$($ins.Ver))"
  Log "Open Claude and confirm Hebrew/Arabic render RTL. To undo: patch.ps1 -Restore"
}
catch {
  Write-Host "patch: ERROR - $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
