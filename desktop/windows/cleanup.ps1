<#
  cleanup.ps1 - remove every machine + per-user artifact claude-rtl created. Use it at uninstall
  time (wired from installer.iss [UninstallRun]) or to remediate a machine where the app was already
  removed but its artifacts survived (github issue #2): a failed ELEVATED scheduled task
  (ClaudeRtlMsixWatcher) firing hourly forever, HKCU Run autostarts pointing at deleted exes, and a
  self-signed CN=Anthropic PBC cert left in the machine Trusted Root store.

  What it reverses:
    - MSIX watcher scheduled task + our Trusted-Root cert + re-signed Anthropic binaries
      (delegated to patch-msix.ps1 -Cleanup when present; done directly here if the scripts are gone).
    - Squirrel logon watcher (HKCU Run\ClaudeRtlWatcher + the resident watch.ps1 process) and
      binaries (patch.ps1 -Unwatch/-Restore).
    - Our per-user keys: HKCU Run\ClaudeRTL (tray autostart) and HKCU Software\ClaudeRTL (onboarding).

  Split scope by design: the HKCU keys are per-user and MUST be removed in the ORIGINAL (possibly
  non-admin) user's hive, so we do them first, unelevated; the task + cert are machine-scope, so we
  self-elevate once (single UAC) for those. Best-effort throughout - one failure never blocks the rest.

  ASCII-only (PS 5.1 reads a BOM-less .ps1 as Windows-1252).

    powershell -ExecutionPolicy Bypass -File .\desktop\windows\cleanup.ps1
#>
param([switch]$NoElevate)   # set by the self-elevated relaunch (and by callers that already elevated)
$ErrorActionPreference = 'Continue'   # never let one failed step abort the teardown
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CertFriendly = 'Claude_RTL_SelfSigned'

function Log($m){ Write-Host "cleanup: $m" }
function Test-Admin {
  (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

# --- per-user artifacts (HKCU): must run as the original user, not an elevated admin hive ---
function Remove-UserArtifacts {
  $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  Remove-ItemProperty -Path $runKey -Name 'ClaudeRTL'        -ErrorAction SilentlyContinue  # tray autostart
  Remove-ItemProperty -Path $runKey -Name 'ClaudeRtlWatcher' -ErrorAction SilentlyContinue  # Squirrel logon watcher
  Remove-Item -Path 'HKCU:\Software\ClaudeRTL' -Recurse -ErrorAction SilentlyContinue        # onboarding flag
  # the Squirrel watcher is a resident powershell running watch.ps1 - it lives until logoff otherwise
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*watch.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Log "removed HKCU autostarts (ClaudeRTL, ClaudeRtlWatcher), Software\ClaudeRTL, and any resident watch.ps1."
}

# --- machine-scope artifacts (need admin): watcher task + Trusted-Root cert + re-signed binaries ---
function Remove-MachineArtifacts {
  $msix = Join-Path $ScriptDir 'patch-msix.ps1'
  $squ  = Join-Path $ScriptDir 'patch.ps1'
  if (Test-Path $msix) {
    Log "delegating to patch-msix.ps1 -Cleanup (task + cert + binary restore)..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File $msix -Cleanup
  } else {
    # scripts already deleted (post-uninstall remediation) - remove task + cert directly.
    Unregister-ScheduledTask -TaskName 'ClaudeRtlMsixWatcher' -Confirm:$false -ErrorAction SilentlyContinue
    foreach ($s in 'My','Root') {
      Get-ChildItem "Cert:\LocalMachine\$s" -ErrorAction SilentlyContinue |
        Where-Object { $_.FriendlyName -eq $CertFriendly } | Remove-Item -Force -ErrorAction SilentlyContinue
    }
    Log "patch scripts absent - removed watcher task + $CertFriendly cert directly."
  }
  # Squirrel restore only if a Squirrel install actually exists (patch.ps1 Dies otherwise).
  if ((Test-Path $squ) -and (Test-Path (Join-Path $env:LOCALAPPDATA 'AnthropicClaude'))) {
    Log "delegating to patch.ps1 -Unwatch + -Restore (Squirrel)..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File $squ -Unwatch
    & powershell -NoProfile -ExecutionPolicy Bypass -File $squ -Restore
  }
}

Remove-UserArtifacts

if (Test-Admin) {
  Remove-MachineArtifacts
} elseif ($NoElevate) {
  Log "WARNING: not elevated and -NoElevate set - watcher task + Trusted-Root cert were NOT removed."
} else {
  Log "elevating for the machine watcher task + Trusted-Root cert (one UAC prompt)..."
  try {
    Start-Process powershell -Verb RunAs -Wait -ArgumentList @(
      '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$MyInvocation.MyCommand.Path,'-NoElevate'
    )
  } catch {
    Log "elevation declined - the watcher task + cert remain. Re-run this script as administrator to remove them."
  }
}
Log "done."
exit 0
