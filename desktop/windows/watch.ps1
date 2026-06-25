<#
  watch.ps1 - auto-reapply the claude-rtl patch after a Claude (Squirrel) update. (P7.3)

  Squirrel updates Claude by creating a NEW app-<ver> folder under %LOCALAPPDATA%\AnthropicClaude
  and pointing the launcher at it; that fresh folder has none of our patch, so RTL vanishes until
  it is re-applied. This watcher (the launchd watch.sh analogue, docs/WINDOWS.md sec 7) detects the
  new / unpatched install, waits for the update to SETTLE, then runs patch.ps1.

  SAFE TO LEAVE RUNNING: the "is it patched?" test is a READ-ONLY marker scan of app.asar, so the
  watcher NEVER stops Claude when the install is already patched - no thrashing on every logon.

  Hosted by a per-user logon entry (install with: patch.ps1 -Watch). Resident + event-driven:
  a FileSystemWatcher wakes it promptly when a new app-* folder appears; a periodic re-check
  (every -PollSeconds) is the backstop in case an event is missed.

    powershell -NoProfile -ExecutionPolicy Bypass -File watch.ps1           # resident (logon)
    powershell ... -File watch.ps1 -Once      # one settle+patch-if-needed cycle, then exit
    powershell ... -File watch.ps1 -DryRun    # detect + log "would patch", never patches

  ASCII-only (the diagnose.ps1 lesson).
#>
param(
  [switch]$Once,
  [switch]$DryRun,
  [int]$PollSeconds  = 60,
  [int]$SettleSleep  = 2,
  [int]$SettleStable = 3
)
$ErrorActionPreference = 'Continue'   # a transient failure must NOT crash the resident watcher

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PatchPs1  = Join-Path $ScriptDir 'patch.ps1'
$Base      = Join-Path $env:LOCALAPPDATA 'AnthropicClaude'
$Marker    = 'claude-rtl-payload-v1'
$LogFile   = Join-Path $env:LOCALAPPDATA 'claude-rtl\watch.log'

New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null
function Log($m){
  $line = "[{0}] watch: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Write-Host $line
  try { Add-Content -Path $LogFile -Value $line -Encoding ASCII } catch {}
}

function Get-HighestApp {
  if (-not (Test-Path $Base)) { return $null }
  Get-ChildItem $Base -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.Name -replace '^app-','') } -Descending | Select-Object -First 1
}

# Read-only "is it patched?" check: scan the (binary) app.asar for our ASCII marker. No npx, no
# extraction, and crucially no Stop-Claude. Mirrors the byte scan in diagnose.ps1.
function Test-Patched($appDir){
  $asar = Join-Path $appDir.FullName 'resources\app.asar'
  if (-not (Test-Path $asar)) { return $false }
  try { $fs = [IO.File]::OpenRead($asar) } catch { return $false }
  try {
    $enc = [Text.Encoding]::GetEncoding('ISO-8859-1')
    $buf = New-Object byte[] (4MB); $tail = ''
    while (($n = $fs.Read($buf,0,$buf.Length)) -gt 0) {
      $s = $tail + $enc.GetString($buf,0,$n)
      if ($s.IndexOf($Marker) -ge 0) { return $true }
      if ($s.Length -ge $Marker.Length) { $tail = $s.Substring($s.Length - $Marker.Length) }
    }
  } finally { $fs.Close() }
  return $false
}

# Wait until the update finishes: Squirrel's Update.exe not running AND app.asar mtime stable
# across $SettleStable polls. Mirrors watch.sh's settle().
function Wait-Settle($appDir){
  $asar = Join-Path $appDir.FullName 'resources\app.asar'
  $stable = 0; $last = ''; $tries = 0
  while ($tries -lt 150) {
    $tries++
    $upd = Get-CimInstance Win32_Process -Filter "Name='Update.exe'" -ErrorAction SilentlyContinue |
           Where-Object { $_.ExecutablePath -like "$Base\*" }
    if ($upd) { $stable = 0; Start-Sleep -Seconds $SettleSleep; continue }
    if (Test-Path $asar) {
      $now = (Get-Item $asar).LastWriteTime.Ticks.ToString()
      if ($now -eq $last -and $now -ne '') { $stable++; if ($stable -ge $SettleStable) { return $true } }
      else { $stable = 0; $last = $now }
    } else { $stable = 0 }
    Start-Sleep -Seconds $SettleSleep
  }
  return $false
}

function Invoke-CheckAndPatch {
  $app = Get-HighestApp
  if (-not $app) { Log "no Claude install found under $Base."; return }
  if (Test-Patched $app) { return }   # already patched -> do nothing (never stops Claude)
  Log "unpatched install detected: $($app.Name) - waiting for the update to settle..."
  if (-not (Wait-Settle $app)) { Log "update did not settle in time; will retry on the next check."; return }
  if ($DryRun) { Log "[DryRun] settled - would run patch.ps1 for $($app.Name)."; return }
  Log "settled. running patch.ps1..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File $PatchPs1 -Force | ForEach-Object { Log "  $_" }
  if (Test-Patched (Get-HighestApp)) { Log "re-patched OK ($($app.Name)). RTL restored." }
  else { Log "re-patch FAILED - run patch.ps1 manually." }
}

# --- startup catch-up (covers: watcher started after an update happened while it was off) ---
Log "watcher starting (base=$Base, poll=${PollSeconds}s, once=$Once, dryrun=$DryRun)."
Invoke-CheckAndPatch
if ($Once) { Log "done (-Once)."; return }

# --- resident: FileSystemWatcher wakes on a new app-* folder; the timeout is the periodic backstop ---
if (-not (Test-Path $Base)) { Log "base $Base missing - exiting."; return }
$fsw = New-Object IO.FileSystemWatcher
$fsw.Path = $Base
$fsw.Filter = 'app-*'
$fsw.NotifyFilter = [IO.NotifyFilters]::DirectoryName
$fsw.IncludeSubdirectories = $false
Log "watching for new app-* folders..."
while ($true) {
  $r = $fsw.WaitForChanged([IO.WatcherChangeTypes]::Created, ($PollSeconds * 1000))
  if (-not $r.TimedOut) { Log "filesystem event: $($r.Name) ($($r.ChangeType))." }
  Invoke-CheckAndPatch
}
