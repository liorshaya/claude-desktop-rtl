<#
  preflight.ps1 - check this machine is ready for patch.ps1 (Squirrel path). READ-ONLY.

  Mirrors desktop/preflight.sh: Squirrel install present + writable, claude.exe/app.asar
  found, Node + npx available, Claude not blocking. Prints PASS/WARN/FAIL lines and exits
  non-zero on a hard blocker (patch.ps1 calls this and aborts on a non-zero exit).

  ASCII-only (same reason as patch.ps1 / diagnose.ps1).
#>
$ErrorActionPreference = 'Continue'
$script:ok = $true
function Pass($m){ Write-Host "  [ ok ] $m"  -ForegroundColor Green }
function Warn($m){ Write-Host "  [warn] $m"  -ForegroundColor Yellow }
function Fail($m){ Write-Host "  [FAIL] $m"  -ForegroundColor Red; $script:ok = $false }

Write-Host "preflight: claude-rtl Windows (Squirrel path)"

# --- Squirrel install ---
$base = Join-Path $env:LOCALAPPDATA 'AnthropicClaude'
$appDir = $null
if (Test-Path $base) {
  $appDir = Get-ChildItem $base -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
            Sort-Object { [version]($_.Name -replace '^app-','') } -Descending | Select-Object -First 1
}
if ($appDir) { Pass "Squirrel install: $($appDir.FullName)" }
else { Fail "no Squirrel install under $base (MSIX is not supported yet)" }

if ($appDir) {
  $exe  = Join-Path $appDir.FullName 'claude.exe'
  $asar = Join-Path $appDir.FullName 'resources\app.asar'
  if (Test-Path $exe)  { Pass "claude.exe found" } else { Fail "claude.exe missing at $exe" }
  if (Test-Path $asar) { Pass ("app.asar found ({0} MB)" -f [math]::Round((Get-Item $asar).Length/1MB,1)) } else { Fail "app.asar missing at $asar" }

  # writability (the MSIX dir would be ACL-locked here)
  $probe = Join-Path $appDir.FullName ('.crtl-pf-{0}.tmp' -f $PID)
  try { [IO.File]::WriteAllText($probe,'x'); Remove-Item $probe -Force; Pass "app dir is user-writable" }
  catch { Fail "app dir is NOT writable (must be the install owner; an MSIX dir is locked)" }
}

# --- Node + npx (needed for inject.mjs, asar, fuses) ---
$node = Get-Command node -ErrorAction SilentlyContinue
$npx  = Get-Command npx  -ErrorAction SilentlyContinue
if ($node) { Pass "node $(node -v)" } else { Fail "node not found - install Node 18+ (https://nodejs.org)" }
if ($npx)  { Pass "npx present" }      else { Fail "npx not found (it ships with Node)" }

# --- Claude running? (patch.ps1 will stop it) ---
$base = Join-Path $env:LOCALAPPDATA 'AnthropicClaude'
$proc = @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($base, [StringComparison]::OrdinalIgnoreCase) })
if ($proc.Count -gt 0) { Warn "Claude Desktop is running ($($proc.Count) process[es]) - patch.ps1 will stop it (the Claude Code editor extension is NOT affected)" }
else { Pass "Claude Desktop not running" }

# --- long paths (informational; the extracted tree is shallow, ~127 chars) ---
try {
  $lp = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction Stop).LongPathsEnabled
  if ($lp -eq 1) { Pass "Win32 long paths enabled" }
  else { Warn "Win32 long paths off (fine: extracted asar tree stays under MAX_PATH)" }
} catch { Warn "could not read LongPathsEnabled (non-fatal)" }

Write-Host ""
if ($script:ok) { Write-Host "preflight: OK - ready to patch." -ForegroundColor Green; exit 0 }
else { Write-Host "preflight: BLOCKED - fix the [FAIL] item(s) above." -ForegroundColor Red; exit 1 }
