<#
  diagnose.ps1 - claude-rtl Windows spike (P7.0).

  Answers the 7 open questions in docs/WINDOWS.md section 10 about the LOCAL Claude install, so the
  Windows patch pipeline can be built from reality instead of guesses. READ-ONLY: it inspects
  files and prints a report. It does NOT modify anything.

  Run in PowerShell (Win10/11):
      powershell -ExecutionPolicy Bypass -File .\desktop\windows\diagnose.ps1
  If some probes say "access denied", re-run from an **elevated** PowerShell (Run as admin) -
  Claude's MSIX install dir is ACL-locked. Then copy the whole "REPORT" block back to the chat.
#>

$ErrorActionPreference = 'Continue'
function Hr($t){ Write-Host ""; Write-Host (("== {0} " -f $t).PadRight(78,[char]'=')) -ForegroundColor Cyan }
function KV($k,$v){ Write-Host ("  {0,-24}: {1}" -f $k,$v) }
$report = [ordered]@{}

Write-Host "claude-rtl Windows diagnostic" -ForegroundColor Green
KV "PowerShell" $PSVersionTable.PSVersion
KV "OS" ([System.Environment]::OSVersion.Version)
KV "Architecture" $env:PROCESSOR_ARCHITECTURE
KV "Elevated" ((New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator))

# --- Q1: install model ---------------------------------------------------------------------
Hr "Q1  install model (MSIX vs Squirrel)"
$base = $null; $model = 'unknown'
try {
  $pkg = Get-AppxPackage 2>$null | Where-Object { $_.Name -like '*Claude*' } | Select-Object -First 1
} catch { $pkg = $null }
if ($pkg) {
  $model = 'MSIX'
  KV "MSIX package" $pkg.Name
  KV "Version" $pkg.Version
  KV "PackageFullName" $pkg.PackageFullName
  KV "PackageFamilyName" $pkg.PackageFamilyName
  KV "InstallLocation" $pkg.InstallLocation
  $base = $pkg.InstallLocation
}
$squirrel = Join-Path $env:LOCALAPPDATA 'AnthropicClaude'
if (Test-Path $squirrel) {
  $appDirs = Get-ChildItem $squirrel -Directory -Filter 'app-*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending
  if ($appDirs) {
    KV "Squirrel dir" $appDirs[0].FullName
    if (-not $pkg) { $model = 'Squirrel'; $base = $appDirs[0].FullName }
    elseif ($pkg) { KV "NOTE" "BOTH MSIX and a leftover Squirrel dir exist" }
  }
}
if (-not $base) { KV "RESULT" "No Claude install found (neither MSIX nor Squirrel)" }
KV "==> MODEL" $model
$report['install_model'] = $model

# --- locate the key files ------------------------------------------------------------------
Hr "locate claude.exe / app.asar / cowork-svc.exe"
$exe=$null;$asar=$null;$cowork=$null;$unpacked=$null
if ($base) {
  $exe     = Get-ChildItem $base -Recurse -Filter 'claude.exe'      -ErrorAction SilentlyContinue | Select-Object -First 1
  $asar    = Get-ChildItem $base -Recurse -Filter 'app.asar'        -ErrorAction SilentlyContinue | Select-Object -First 1
  $cowork  = Get-ChildItem $base -Recurse -Filter 'cowork-svc.exe'  -ErrorAction SilentlyContinue | Select-Object -First 1
  $unpacked= Get-ChildItem $base -Recurse -Filter 'app.asar.unpacked' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
}
KV "claude.exe"  ($(if($exe){$exe.FullName}else{'NOT FOUND'}))
KV "app.asar"    ($(if($asar){"$($asar.FullName)  ($([math]::Round($asar.Length/1MB,1)) MB)"}else{'NOT FOUND'}))
KV "cowork-svc"  ($(if($cowork){$cowork.FullName}else{'absent'}))
KV "asar.unpacked" ($(if($unpacked){$unpacked.FullName}else{'absent'}))
$report['has_cowork'] = [bool]$cowork

# --- Q4: writability / ACLs ----------------------------------------------------------------
Hr "Q4  writability + ACLs of the app dir"
if ($exe) {
  $appDir = $exe.Directory.FullName
  KV "appDir" $appDir
  $probe = Join-Path $appDir ('.crtl-write-test-{0}.tmp' -f $PID)
  $writable = $false
  try { [IO.File]::WriteAllText($probe,'x'); Remove-Item $probe -Force; $writable=$true } catch { $writable=$false }
  KV "==> user-writable?" $writable
  $report['app_dir_writable'] = $writable
  try { KV "owner" ((Get-Acl $appDir).Owner) } catch {}
  Write-Host "  icacls (first lines):"
  try { (icacls $appDir) 2>$null | Select-Object -First 6 | ForEach-Object { Write-Host "    $_" } } catch {}
} else { KV "skip" "no claude.exe" }

# --- Q7: signature of claude.exe -----------------------------------------------------------
Hr "Q7  Authenticode signature of claude.exe"
if ($exe) {
  try {
    $sig = Get-AuthenticodeSignature $exe.FullName
    KV "Status" $sig.Status
    KV "Signer" ($(if($sig.SignerCertificate){$sig.SignerCertificate.Subject}else{'-'}))
    $report['exe_sig'] = "$($sig.Status)"
  } catch { KV "error" $_.Exception.Message }
}

# --- Q3: cowork-svc details ----------------------------------------------------------------
Hr "Q3  cowork-svc (Cowork integrity service)"
if ($cowork) {
  try { $csig = Get-AuthenticodeSignature $cowork.FullName; KV "svc signature" "$($csig.Status) / $($csig.SignerCertificate.Subject)" } catch {}
  $svc = Get-Service 2>$null | Where-Object { $_.Name -like '*cowork*' -or $_.DisplayName -like '*cowork*' }
  if ($svc) { foreach($s in $svc){ KV "service" "$($s.Name) [$($s.Status)]" } } else { KV "service" "none registered (may launch on demand)" }
  $proc = Get-Process 2>$null | Where-Object { $_.ProcessName -like '*cowork*' }
  KV "running proc" ($(if($proc){($proc|ForEach-Object ProcessName) -join ', '}else{'none'}))
} else { KV "result" "no cowork-svc.exe - Cowork integrity check likely N/A on this install" }

# --- Node availability ---------------------------------------------------------------------
Hr "Node / npx availability (needed for asar + fuses probes)"
$node = Get-Command node -ErrorAction SilentlyContinue
$npx  = Get-Command npx  -ErrorAction SilentlyContinue
KV "node" ($(if($node){(node -v)}else{'NOT INSTALLED'}))
KV "npx"  ($(if($npx){'yes'}else{'no'}))
$report['has_node'] = [bool]$node

# --- Q2: asar-integrity fuse ---------------------------------------------------------------
Hr "Q2  EnableEmbeddedAsarIntegrityValidation fuse"
if ($npx -and $exe) {
  Write-Host "  running: npx --yes @electron/fuses read --app <claude.exe> ..."
  try {
    $fuses = & npx --yes @electron/fuses@latest read --app $exe.FullName 2>&1 | Out-String
    Write-Host $fuses
    $report['fuses'] = ($fuses -split "`n" | Where-Object { $_ -match 'Integrity' }) -join ' | '
  } catch { KV "error" $_.Exception.Message }
} else { KV "skip" "needs Node/npx + claude.exe; otherwise inspect manually" }

# --- Q5/Q6: asar layout (main entry + renderer bundles + unpacked) --------------------------
Hr "Q5/Q6  asar layout: main entry + renderer bundles"
if ($npx -and $asar) {
  $tmp = Join-Path $env:TEMP ("crtl-asar-{0}" -f $PID); New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  Push-Location $tmp
  try {
    & npx --yes @electron/asar@latest extract-file $asar.FullName package.json 2>$null
    if (Test-Path package.json) {
      $main = (Get-Content package.json -Raw | ConvertFrom-Json).main
      KV "package.json main" $main
      $report['main_entry'] = $main
    } else { KV "package.json" "could not extract" }
    Write-Host "  renderer bundles under .vite/build (first 20):"
    $list = & npx --yes @electron/asar@latest list $asar.FullName 2>$null
    $vite = $list | Where-Object { $_ -match '\.vite[\\/]build[\\/].*\.js$' }
    KV "  .vite/build/*.js count" ($vite | Measure-Object).Count
    $vite | Select-Object -First 20 | ForEach-Object { Write-Host "    $_" }
  } catch { KV "error" $_.Exception.Message }
  finally { Pop-Location; Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
} else { KV "skip" "needs Node/npx + app.asar" }
if ($unpacked) {
  Write-Host "  app.asar.unpacked contents (first 20):"
  Get-ChildItem $unpacked.FullName -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 20 | ForEach-Object { Write-Host "    $($_.FullName.Substring($unpacked.FullName.Length+1))" }
}

# --- integrity-hash location in claude.exe (byte scan) -------------------------------------
Hr "integrity hash storage in claude.exe (byte scan)"
function Test-AsciiInFile([string]$Path,[string]$Needle){
  try { $fs=[IO.File]::OpenRead($Path) } catch { return 'access denied' }
  $enc=[Text.Encoding]::GetEncoding('ISO-8859-1'); $buf=New-Object byte[] (4MB); $tail=''; $hit=$false
  try { while(($n=$fs.Read($buf,0,$buf.Length)) -gt 0){ $s=$tail+$enc.GetString($buf,0,$n); if($s.IndexOf($Needle) -ge 0){$hit=$true;break}; if($s.Length -ge $Needle.Length){$tail=$s.Substring($s.Length-$Needle.Length)} } } finally { $fs.Close() }
  return $hit
}
if ($exe) {
  foreach($needle in @('ElectronAsar','app.asar','"alg":"sha256"','integrity')){
    KV ("contains '{0}'" -f $needle) (Test-AsciiInFile $exe.FullName $needle)
  }
} else { KV "skip" "no claude.exe" }

# --- SUMMARY (copy this whole block back) --------------------------------------------------
Hr "REPORT  (copy everything below back to the chat)"
Write-Host "claude-rtl-windows-report:" -ForegroundColor Yellow
$report.GetEnumerator() | ForEach-Object { Write-Host ("  {0} = {1}" -f $_.Key, $_.Value) }
Write-Host ""
Write-Host "Also paste the full console output above (Q1-Q7 sections), not just this summary." -ForegroundColor Yellow
