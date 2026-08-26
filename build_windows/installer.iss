; Inno Setup script - produces a proper Setup.exe installer.
;
; Requires Inno Setup (free): https://jrsoftware.org/isdl.php
; After installing it, either:
;   - Right-click this file and choose "Compile", or
;   - Open Inno Setup, open this file, click Build > Compile
;
; Run build_windows\build.bat FIRST to produce FocusTracker.exe -
; this script packages that output into an installer.

#define MyAppName "Focus Tracker"
#define MyAppVersion "0.1.0"
#define MyAppExeName "FocusTracker.exe"

[Setup]
AppId={{A1B2C3D4-1234-4567-8901-FOCUSTRACKER1}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
; No admin rights required - installs to the current user only.
; Appropriate for a small beta test group, not just a technical
; nicety: it avoids UAC prompts that could scare off non-technical
; testers, and matches the fact that this only ever touches the
; current user's own data.
PrivilegesRequired=lowest
OutputDir=dist_installer
OutputBaseFilename=FocusTracker-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "startupicon"; Description: "Start Focus Tracker automatically when I log in"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "dist\FocusTracker.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Deliberately does NOT delete %APPDATA%\FocusTracker - that's the
; user's tracked activity data, and uninstalling the app shouldn't
; silently destroy months of tracking history. If they explicitly
; want that gone too, they can delete the folder themselves.
