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

[Icons]
Name: "{group}\Claude RTL"; Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall Claude RTL"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Claude RTL"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch Claude RTL now"; Flags: nowait postinstall skipifsilent

; Note: uninstalling only removes this manager app. The RTL patch is baked into Claude's own files
; and keeps working. To fully revert, click "Restore original" in the app before uninstalling.
