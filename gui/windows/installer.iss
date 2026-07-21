; installer.iss - Inno Setup script for Claude RTL (Windows).
; Per-user install (no admin needed to INSTALL; the patch itself elevates on demand). Bundles the
; self-contained exe + patch scripts + prebuilt payload + portable Node runtime (fully offline).
;
; Compiled by gui\windows\package.ps1, which passes /DAppVersion, /DStageDir, /DOutDir.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef StageDir
  #define StageDir "dist\stage"
#endif
#ifndef OutDir
  #define OutDir "dist"
#endif
#define AppName "Claude RTL"
#define AppExe "ClaudeRtl.exe"
#define AppPublisher "Lior Shaya"
#define AppUrl "https://github.com/liorshaya/claude-desktop-rtl"

[Setup]
AppId={{7C9F3E2A-5B4D-4A1E-9C8F-2D6E1B0A3F45}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppUrl}
AppSupportURL={#AppUrl}
DefaultDirName={localappdata}\Programs\Claude RTL
DefaultGroupName=Claude RTL
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir={#OutDir}
OutputBaseFilename=ClaudeRTL-Setup-{#AppVersion}-win-x64
SetupIconFile=Assets\app.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Registry]
; Create our onboarding key at install so uninstall can remove it (with the runtime "Onboarded"
; value inside) as the current user, no elevation. The HKCU Run autostart VALUES (ClaudeRTL,
; ClaudeRtlWatcher) can't be handled here: uninsdeletevalue needs a value created at install with a
; real ValueType, and ValueType:none ignores ValueName — so cleanup.ps1 ([UninstallRun]) removes them.
Root: HKCU; Subkey: "Software\ClaudeRTL"; ValueType: none; Flags: uninsdeletekey

[UninstallRun]
; Runs BEFORE files are deleted (scripts still present). cleanup.ps1 removes the per-user artifacts
; as the current user, then self-elevates (one UAC) to remove the elevated watcher task + our
; Trusted-Root cert and restore the Anthropic binaries. RunAsOriginalUser keeps the HKCU pass in the
; real user's hive; the elevation happens inside the script, not via the (non-elevated) uninstaller.
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\cleanup.ps1"""; Flags: runhidden waituntilterminated runasoriginaluser; RunOnceId: "rtlcleanup"

[Icons]
Name: "{group}\Claude RTL"; Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall Claude RTL"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Claude RTL"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch Claude RTL now"; Flags: nowait postinstall skipifsilent

; Note: uninstalling now also runs cleanup.ps1 (see [UninstallRun]) - it removes the elevated
; watcher task, our Trusted-Root cert, the HKCU autostarts, and restores Claude's original files.
; The elevated teardown prompts for admin once; decline it and the RTL patch simply stays in place.
