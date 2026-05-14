#define MyAppName "IETM Viewer"
#define MyAppVersion "1.0"
#define MyAppPublisher "IETM"
#define ArtifactDir "dist\ietm_deploy_standalone_20260513_150605"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\IETMViewer
DefaultGroupName={#MyAppName}
OutputDir=dist
OutputBaseFilename=IETM-Viewer-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#ArtifactDir}\frontend\*";       DestDir: "{app}\frontend";        Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ArtifactDir}\django_backend\*"; DestDir: "{app}\django_backend";  Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ArtifactDir}\wheels\*";         DestDir: "{app}\wheels";           Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ArtifactDir}\start-ietm.ps1";   DestDir: "{app}";                  Flags: ignoreversion
Source: "scripts\setup-venv.ps1";          DestDir: "{app}";                  Flags: ignoreversion
Source: "scripts\run-migrate.ps1";         DestDir: "{app}";                  Flags: ignoreversion
Source: "python-3.11.9-amd64.exe";         DestDir: "{tmp}";                  Flags: deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName}";                     Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\start-ietm.ps1"""
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}";             Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\start-ietm.ps1"""; Tasks: desktopicon

[Run]
; Install Python 3.11 silently if THAT SPECIFIC VERSION is not present
Filename: "{tmp}\python-3.11.9-amd64.exe"; Parameters: "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0 TargetDir=C:\Python311"; StatusMsg: "Installing Python 3.11 (system-wide)..."; Flags: waituntilterminated; Check: not IsPython311Installed()

; Create venv and install wheels via external script (avoids inline quoting issues)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\setup-venv.ps1"" ""{app}"""; StatusMsg: "Installing dependencies (offline)..."; Flags: runhidden waituntilterminated

; Run Django migrations
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\run-migrate.ps1"" ""{app}"""; StatusMsg: "Setting up database..."; Flags: runhidden waituntilterminated

; Launch after install
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\start-ietm.ps1"""; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\.venv"

[Code]
function IsPython311Installed(): Boolean;
begin
  // Check specifically for Python 3.11 (other versions don't help — wheels are cp311)
  Result := FileExists(ExpandConstant('{localappdata}\Programs\Python\Python311\python.exe')) or
            FileExists('C:\Python311\python.exe') or
            FileExists('C:\Program Files\Python311\python.exe');
end;
