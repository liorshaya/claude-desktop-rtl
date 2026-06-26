<#
  patch-msix.ps1 - apply (or restore) the claude-rtl patch on the MSIX (Store-style) Claude
  install (under C:\Program Files\WindowsApps), KEEPING Cowork working.

  The RTL payload + injection are identical to the Squirrel path (same inject.mjs, same fuse-off).
  The MSIX-specific work is the DELIVERY: the package dir is owned by TrustedInstaller and read-only
  to users, so we run ELEVATED and take ownership; and Cowork's cowork-svc.exe pins Anthropic's
  certificate on Claude.exe, so modifying Claude.exe breaks Cowork unless we also do the "cert-dance":
  re-sign Claude.exe with our own self-signed cert AND swap the cert cowork-svc.exe expects, so the
  service trusts the re-signed Claude.exe again.

  The cert-dance technique (cowork-svc binary cert-swap + Trusted-Root install) follows
  shraga100/claude-desktop-rtl-patch (MIT).

  REQUIRES: an elevated PowerShell (Run as administrator) + Node.

  > Invasive (by necessity): this re-signs Anthropic binaries and adds a self-signed code-signing
  > cert to the machine Trusted Root store (private key is wiped after signing). -Restore reverts
  > everything (files + cert). Worst case: reinstall the MSIX from claude.ai/download.

  ASCII-only by design (PS 5.1 reads a BOM-less .ps1 as Windows-1252).

    powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch-msix.ps1            # apply
    powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch-msix.ps1 -Status    # report
    powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch-msix.ps1 -Restore   # undo
#>
param(
  [switch]$Restore,
  [switch]$Status,
  [switch]$Verify,    # read-only: confirm the full RTL + cert-dance patch is in place
  [switch]$Watch,     # install the auto-updater (re-applies RTL after each Claude update)
  [switch]$Unwatch,   # remove the auto-updater
  [switch]$AutoPatch, # internal (scheduled task): re-apply only if an update reverted the patch
  [switch]$Force      # stop a running Claude / cowork-svc without an extra notice
)
$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path

# Offline bundled runtime: the installer ships scripts\ next to runtime\ (node.exe + node_modules
# with @electron/asar + @electron/fuses) and a prebuilt payload.js beside this script. In the repo
# there is no runtime\, so fall back to a system 'node'/'npx' and the built dist\payload.js. This is
# what lets a packaged end user patch with zero prerequisites (no Node install, no network).
$RuntimeDir     = Join-Path $ScriptDir '..\runtime'
$BundledNode    = Join-Path $RuntimeDir 'node.exe'
$BundledModules = Join-Path $RuntimeDir 'node_modules'
$NodeExe     = if (Test-Path $BundledNode)    { (Resolve-Path $BundledNode).Path }    else { 'node' }
$NodeModules = if (Test-Path $BundledModules) { (Resolve-Path $BundledModules).Path } else { $null }

$BundledPayload = Join-Path $ScriptDir 'payload.js'
$Payload    = if (Test-Path $BundledPayload) { (Resolve-Path $BundledPayload).Path } else { Join-Path $RepoRoot 'dist\payload.js' }
$BuildJs    = Join-Path $RepoRoot 'build\build-payload.js'
$Inject     = Join-Path $ScriptDir 'inject.mjs'
$Marker     = 'claude-rtl-payload-v1'
$UnpackGlob = '{**/*.node,**/*.dll}'
$CertFriendly = 'Claude_RTL_SelfSigned'

function Log($m){ Write-Host "patch-msix: $m" }
function Die($m){ throw $m }

# Run @electron/asar / @electron/fuses via the bundled runtime when present (offline, no npx),
# else fall back to npx (dev machines with Node installed). Bin path is read from each package.json.
function Resolve-Bin($pkgRel) {
  $pkgDir = Join-Path $NodeModules $pkgRel
  $bin = (Get-Content (Join-Path $pkgDir 'package.json') -Raw | ConvertFrom-Json).bin
  $rel = if ($bin -is [string]) { $bin } else { ($bin.PSObject.Properties | Select-Object -First 1).Value }
  return (Join-Path $pkgDir $rel)
}
function Invoke-Asar  { if ($NodeModules) { & $NodeExe (Resolve-Bin '@electron\asar')  @args } else { npx --yes @electron/asar  @args } }
function Invoke-Fuses { if ($NodeModules) { & $NodeExe (Resolve-Bin '@electron\fuses') @args } else { npx --yes @electron/fuses @args } }

function Assert-Admin {
  $admin = (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
  if (-not $admin) { Die "this needs an ELEVATED PowerShell. Close this, right-click PowerShell -> 'Run as administrator', cd to the repo, and re-run." }
}

# --- locate the MSIX Claude package ---
function Get-Msix {
  $pkg = Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'Claude' } | Select-Object -First 1
  if (-not $pkg) { Die "no MSIX Claude package found (Get-AppxPackage). Is Claude installed as MSIX?" }
  $app  = Join-Path $pkg.InstallLocation 'app'
  $exe  = Join-Path $app 'Claude.exe'
  $asar = Join-Path $app 'resources\app.asar'
  if (-not (Test-Path $exe))  { Die "Claude.exe not found at $exe (unexpected MSIX layout)." }
  if (-not (Test-Path $asar)) { Die "app.asar not found at $asar (unexpected MSIX layout)." }
  return [pscustomobject]@{
    Pkg = $pkg.PackageFullName
    Ver = $pkg.Version
    App = $app
    Exe = $exe
    Asar = $asar
    Unpacked  = (Join-Path $app 'resources\app.asar.unpacked')
    CoworkSvc = (Join-Path $app 'resources\cowork-svc.exe')
  }
}

# read-only: is the RTL payload present in app.asar? (marker byte-scan, no extraction)
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

# --- take ownership + grant Administrators write on the package app dir (the invasive step) ---
function Grant-Write($dir) {
  Log "taking ownership of $dir (admin; this is the invasive part)..."
  & takeown /f $dir /r /d y | Out-Null
  & icacls $dir /grant "*S-1-5-32-544:(OI)(CI)F" /t /c /q | Out-Null
}

function Get-DesktopClaude {
  # ONLY the MSIX Claude Desktop (exe under WindowsApps\Claude_*). NEVER the Claude Code editor
  # extension, whose process is ALSO named Claude.exe (e.g. under .cursor/.vscode extensions) -
  # killing that would crash the user's Claude Code session.
  @(Get-CimInstance Win32_Process -Filter "Name='Claude.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like '*\WindowsApps\Claude_*' })
}

function Stop-Claude {
  $procs = Get-DesktopClaude
  if ($procs.Count -eq 0) { return }
  if (-not $Force) { Log "Claude Desktop is running; stopping it so the package can be modified (reopen it afterwards)." }
  $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  for ($i = 0; $i -lt 20 -and (Get-DesktopClaude).Count -gt 0; $i++) { Start-Sleep -Milliseconds 250 }
}

# cowork-svc is a service (CoworkVMService) + process; it must be stopped to modify cowork-svc.exe.
# Its name is unambiguous (no collision with the editor extension).
function Stop-Cowork {
  $svc = Get-Service -Name 'CoworkVMService' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne 'Stopped') { Stop-Service -Name 'CoworkVMService' -Force -ErrorAction SilentlyContinue }
  Get-Process -Name 'cowork-svc' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 20 -and (Get-Process -Name 'cowork-svc' -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 250 }
}

# Claude does NOT reliably start the (Automatic) CoworkVMService on its own (known Anthropic bug:
# "VM service not running. The service failed to start."). We stopped it to edit the binary, so we
# must start it back ourselves after patching.
function Start-Cowork {
  $svc = Get-Service -Name 'CoworkVMService' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne 'Running') {
    try { Start-Service -Name 'CoworkVMService' -ErrorAction Stop; Log "CoworkVMService started." }
    catch { Log "note: could not start CoworkVMService now ($($_.Exception.Message)) - start it with: Start-Service CoworkVMService" }
  }
}

# --- byte search via ISO-8859-1 string IndexOf (native, fast) - follows shraga100 ---
function Find-Bytes([byte[]]$Haystack, [byte[]]$Needle, [int]$StartIndex = 0) {
  if (-not $Needle -or $Needle.Length -eq 0 -or -not $Haystack -or $Haystack.Length -lt $Needle.Length) { return -1 }
  if ($StartIndex -lt 0) { $StartIndex = 0 }
  if ($StartIndex -gt ($Haystack.Length - $Needle.Length)) { return -1 }
  $enc = [System.Text.Encoding]::GetEncoding(28591)   # ISO-8859-1, byte-preserving
  return $enc.GetString($Haystack).IndexOf($enc.GetString($Needle), $StartIndex, [System.StringComparison]::Ordinal)
}

# Locate the embedded Anthropic cert in cowork-svc.exe: find the "Anthropic, PBC" anchor, then scan
# backwards for the DER SEQUENCE start (0x30 0x82 <len-hi> <len-lo>) that encloses it.
function Find-CertHole([byte[]]$SvcBytes) {
  $anchor = [System.Text.Encoding]::ASCII.GetBytes('Anthropic, PBC')
  $offset = 0
  while ($true) {
    $anchorPos = Find-Bytes -Haystack $SvcBytes -Needle $anchor -StartIndex $offset
    if ($anchorPos -eq -1) { return $null }
    $limit = [Math]::Max(0, $anchorPos - 2000)
    for ($i = $anchorPos; $i -ge $limit; $i--) {
      if ($SvcBytes[$i] -eq 0x30 -and $SvcBytes[$i+1] -eq 0x82) {
        $size = 4 + (([int]$SvcBytes[$i+2] -shl 8) -bor [int]$SvcBytes[$i+3])
        if ($size -gt 500 -and $size -lt 4000 -and $i -lt $anchorPos -and ($i + $size) -gt $anchorPos) {
          return [pscustomobject]@{ Start = $i; Size = $size }
        }
      }
    }
    $offset = $anchorPos + 1
  }
}

# Generate a self-signed code-signing cert whose DER fits within $MaxSize, add it to Trusted Root,
# and return it (private key still in LocalMachine\My, wiped later).
function New-FittingCert([int]$MaxSize) {
  $subject = 'CN=Anthropic PBC, O=Anthropic PBC, L=San Francisco, S=California, C=US'
  $configs = @(
    @{ Label = 'RSA 1024';    KeyParams = @{ KeyAlgorithm = 'RSA'; KeyLength = 1024 } },
    @{ Label = 'ECDSA P-256'; KeyParams = @{ KeyAlgorithm = 'ECDSA_P256' } },
    @{ Label = 'RSA 2048';    KeyParams = @{ KeyAlgorithm = 'RSA'; KeyLength = 2048 } }
  )
  $root = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
  $root.Open('ReadWrite')
  try {
    foreach ($c in $configs) {
      $kp = $c.KeyParams
      $cert = New-SelfSignedCertificate -Subject $subject -Type CodeSigningCert -CertStoreLocation 'Cert:\LocalMachine\My' -FriendlyName $CertFriendly @kp
      if ($cert.RawData.Length -le $MaxSize) {
        $root.Add($cert)
        Log "self-signed cert fits ($($c.Label): $($cert.RawData.Length) <= $MaxSize bytes); added to Trusted Root."
        return $cert
      }
      Log "cert too large ($($c.Label): $($cert.RawData.Length) > $MaxSize) - trying a smaller key..."
      Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Thumbprint -eq $cert.Thumbprint } | Remove-Item -ErrorAction SilentlyContinue
    }
  } finally { $root.Close() }
  Die "could not generate a self-signed cert small enough for the $MaxSize-byte hole in cowork-svc.exe."
}

# Wipe the private key from LocalMachine\My (keep the public cert in Root for verification).
function Remove-CertPrivateKey($cert) {
  try {
    $my = New-Object System.Security.Cryptography.X509Certificates.X509Store('My','LocalMachine')
    $my.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $found = $my.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
    if ($found) {
      if ($found.HasPrivateKey) {
        try {
          $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($found)
          if ($rsa -is [System.Security.Cryptography.RSACng]) { $rsa.Key.Delete() }
          elseif ($rsa -is [System.Security.Cryptography.RSACryptoServiceProvider]) { $rsa.PersistKeyInCsp = $false; $rsa.Clear() }
        } catch { Log "note: could not delete key material: $($_.Exception.Message)" }
      }
      $my.Remove($found)
    }
    $my.Close()
    Log "private signing key wiped (public cert retained in Trusted Root)."
  } catch { Log "note: key-wipe issue: $($_.Exception.Message)" }
}

# Remove our self-signed certs from My + Root (for restore/uninstall).
function Remove-RtlCerts {
  foreach ($s in 'My','Root') {
    Get-ChildItem "Cert:\LocalMachine\$s" -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -eq $CertFriendly } | Remove-Item -Force -ErrorAction SilentlyContinue
  }
  Log "removed any $CertFriendly certs from My + Root."
}

# The cert-dance: make cowork-svc trust our re-signed Claude.exe again.
function Invoke-CertDance($exe, $coworkSvc) {
  if (-not (Test-Path $coworkSvc)) { Log "cowork-svc.exe absent - no Cowork gate to satisfy; skipping cert-dance."; return }
  Stop-Cowork
  # Restore cowork-svc.exe to pristine from its backup so the original Anthropic cert is present to
  # locate (a previous run may already have swapped in ours). Then clear certs from a prior run.
  $svcBak = "$coworkSvc.crtl-bak"
  if (Test-Path $svcBak) { Copy-Item $svcBak $coworkSvc -Force }
  Remove-RtlCerts
  Log "cert-dance: locating the Anthropic cert inside cowork-svc.exe..."
  $svcBytes = [System.IO.File]::ReadAllBytes($coworkSvc)
  $hole = Find-CertHole $svcBytes
  if (-not $hole) { Die "Anthropic certificate pattern not found in cowork-svc.exe - cannot keep Cowork working. Run -Restore and report." }
  Log ("cert hole at offset 0x{0:X}, size {1} bytes." -f $hole.Start, $hole.Size)

  $cert = New-FittingCert $hole.Size
  try {
    Log "re-signing Claude.exe with the self-signed cert (can take a few seconds)..."
    # Claude may relaunch during the (slow) cert generation and lock its own exe. Re-kill it and
    # retry the signing a few times so a transient relaunch can't fail the whole patch.
    $r1 = $null
    for ($attempt = 1; $attempt -le 6; $attempt++) {
      Stop-Claude
      try { $r1 = Set-AuthenticodeSignature -FilePath $exe -Certificate $cert -HashAlgorithm SHA256; break }
      catch {
        if ($attempt -eq 6) { throw }
        Log "  Claude.exe is locked (attempt $attempt/6) - re-killing Claude and retrying..."
        Start-Sleep -Milliseconds 800
      }
    }
    if ($r1.Status -ne 'Valid') { Die "re-signing Claude.exe failed: $($r1.Status)" }

    Log "swapping the cert inside cowork-svc.exe (padded with 0x00 to keep size)..."
    $padded = New-Object byte[] $hole.Size
    [Array]::Copy($cert.RawData, 0, $padded, 0, $cert.RawData.Length)
    [Array]::Copy($padded, 0, $svcBytes, $hole.Start, $hole.Size)
    Stop-Cowork   # in case the (Automatic) service restarted during cert generation
    [System.IO.File]::WriteAllBytes($coworkSvc, $svcBytes)

    Log "re-signing cowork-svc.exe..."
    $r2 = Set-AuthenticodeSignature -FilePath $coworkSvc -Certificate $cert -HashAlgorithm SHA256
    if ($r2.Status -ne 'Valid') { Die "re-signing cowork-svc.exe failed: $($r2.Status)" }
  }
  finally { Remove-CertPrivateKey $cert }
  Start-Cowork
  Log "cert-dance complete - cowork-svc now trusts the re-signed Claude.exe."
}

try {
  $ins = Get-Msix

  if ($Status) {
    Log "package : $($ins.Pkg)"
    Log "app dir : $($ins.App)"
    $patched = (Test-Path "$($ins.Exe).crtl-bak") -and (Test-Path "$($ins.Asar).crtl-bak")
    Log "patched : $patched  (.crtl-bak backups present)"
    $rootCert = Get-ChildItem Cert:\LocalMachine\Root -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -eq $CertFriendly }
    Log "rtl cert in Trusted Root : $([bool]$rootCert)"
    $svc = Get-Service -Name 'CoworkVMService' -ErrorAction SilentlyContinue
    Log "CoworkVMService : $(if($svc){$svc.Status}else{'not registered'})"
    exit 0
  }

  if ($Verify) {
    $rtl = Test-AsarPatched $ins.Asar
    $rootCert = Get-ChildItem Cert:\LocalMachine\Root -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -eq $CertFriendly } | Select-Object -First 1
    $csig = Get-AuthenticodeSignature $ins.Exe
    $ssig = if (Test-Path $ins.CoworkSvc) { Get-AuthenticodeSignature $ins.CoworkSvc } else { $null }
    $claudeOurs = ($csig.Status -eq 'Valid') -and $rootCert -and $csig.SignerCertificate -and ($csig.SignerCertificate.Thumbprint -eq $rootCert.Thumbprint)
    $svcOurs    = (-not $ssig) -or (($ssig.Status -eq 'Valid') -and $rootCert -and $ssig.SignerCertificate -and ($ssig.SignerCertificate.Thumbprint -eq $rootCert.Thumbprint))
    $svc = Get-Service -Name 'CoworkVMService' -ErrorAction SilentlyContinue
    Log "RTL injected (asar marker)   : $rtl"
    Log "Claude.exe signed by our cert: $claudeOurs"
    Log "cowork-svc signed by our cert: $svcOurs"
    Log "self-signed cert in Root     : $([bool]$rootCert)"
    Log "CoworkVMService              : $(if($svc){$svc.Status}else{'absent'})"
    if ($rtl -and $claudeOurs -and $svcOurs -and $rootCert) {
      Log "==> OK - RTL + Cowork patch fully in place."
      if ($svc -and $svc.Status -ne 'Running') { Log "    note: CoworkVMService is stopped; start it with: Start-Service CoworkVMService" }
      exit 0
    } else {
      Log "==> INCOMPLETE / pristine - a Claude update likely reverted the patch. Re-apply: patch-msix.ps1"
      exit 1
    }
  }

  if ($Watch) {
    Assert-Admin
    $taskName = 'ClaudeRtlMsixWatcher'
    $arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -AutoPatch' -f $PSCommandPath
    $action    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
    $t1        = New-ScheduledTaskTrigger -AtLogOn
    $t2        = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(3)) -RepetitionInterval (New-TimeSpan -Hours 1)
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $t1,$t2 -Principal $principal -Settings $settings -Force | Out-Null
    Log "auto-updater installed (task '$taskName') - re-applies RTL after each Claude update (logon + hourly, elevated, no UAC)."
    exit 0
  }

  if ($Unwatch) {
    Assert-Admin
    Unregister-ScheduledTask -TaskName 'ClaudeRtlMsixWatcher' -Confirm:$false -ErrorAction SilentlyContinue
    Log "auto-updater removed."
    exit 0
  }

  if ($AutoPatch) {
    Assert-Admin
    if (Test-AsarPatched $ins.Asar) { exit 0 }   # already patched - nothing to do
    Log "AutoPatch: install is unpatched (an update reverted it) - re-applying RTL + cert-dance..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
    exit $LASTEXITCODE
  }

  if ($Restore) {
    Assert-Admin
    $exeBak = "$($ins.Exe).crtl-bak"; $asarBak = "$($ins.Asar).crtl-bak"; $svcBak = "$($ins.CoworkSvc).crtl-bak"
    if (-not (Test-Path $exeBak) -and -not (Test-Path $asarBak) -and -not (Test-Path $svcBak)) { Die "no .crtl-bak backups under $($ins.App) - nothing to restore." }
    Stop-Claude
    Stop-Cowork
    Grant-Write $ins.App
    if (Test-Path $asarBak) { Copy-Item $asarBak $ins.Asar -Force; Log "restored app.asar." }
    if (Test-Path $exeBak)  { Copy-Item $exeBak  $ins.Exe  -Force; Log "restored Claude.exe (original signature + fuse)." }
    if (Test-Path $svcBak)  { Copy-Item $svcBak  $ins.CoworkSvc -Force; Log "restored cowork-svc.exe (original Anthropic cert)." }
    Remove-RtlCerts
    Start-Cowork
    Log "DONE - original restored. Open Claude; confirm it launches and Cowork works."
    exit 0
  }

  # --- APPLY ---
  Assert-Admin

  if (-not (Test-Path $Payload)) {
    Log "building payload..."
    & $NodeExe $BuildJs | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "build-payload.js failed (exit $LASTEXITCODE)." }
  }
  if (-not (Select-String -Path $Payload -Pattern $Marker -SimpleMatch -Quiet)) { Die "payload missing marker $Marker - build looks wrong." }

  Stop-Claude
  Grant-Write $ins.App

  # back up the three files we may touch (never overwrite a pristine backup)
  $exeBak = "$($ins.Exe).crtl-bak"; $asarBak = "$($ins.Asar).crtl-bak"; $svcBak = "$($ins.CoworkSvc).crtl-bak"
  if (-not (Test-Path $exeBak))  { Copy-Item $ins.Exe  $exeBak  -Force; Log "backed up Claude.exe" } else { Log "Claude.exe backup already present." }
  if (-not (Test-Path $asarBak)) { Copy-Item $ins.Asar $asarBak -Force; Log "backed up app.asar" } else { Log "app.asar backup already present." }
  if ((Test-Path $ins.CoworkSvc) -and -not (Test-Path $svcBak)) { Copy-Item $ins.CoworkSvc $svcBak -Force; Log "backed up cowork-svc.exe" } elseif (Test-Path $svcBak) { Log "cowork-svc.exe backup already present." }

  # Always patch from a pristine baseline so re-apply is idempotent and the cert-dance can find the
  # original Anthropic cert again. Claude is stopped, so Claude.exe + app.asar are free to overwrite.
  if (Test-Path $exeBak)  { Copy-Item $exeBak  $ins.Exe  -Force }
  if (Test-Path $asarBak) { Copy-Item $asarBak $ins.Asar -Force }
  Log "reset Claude.exe + app.asar to pristine; patching fresh."

  $origUnpacked = @()
  if (Test-Path $ins.Unpacked) {
    $origUnpacked = Get-ChildItem $ins.Unpacked -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($ins.Unpacked.Length + 1) }
  }

  $work = Join-Path $env:TEMP ("crtlmsix-{0}" -f $PID)
  $appExtract = Join-Path $work 'app'
  try {
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
    if ($LASTEXITCODE -ne 0) { Die "asar pack failed (exit $LASTEXITCODE) - restore with: patch-msix.ps1 -Restore" }

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

  # --- cert-dance: keep Cowork working with the modified Claude.exe ---
  Invoke-CertDance $ins.Exe $ins.CoworkSvc

  Log "DONE -> $($ins.App)  (v$($ins.Ver))"
  Log "NOW VERIFY: (1) open Claude - RTL on Hebrew? (2) does Cowork still work?"
  Log "Undo anytime: patch-msix.ps1 -Restore   (worst case: reinstall MSIX from claude.ai/download)."
}
catch {
  Write-Host "patch-msix: ERROR - $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
