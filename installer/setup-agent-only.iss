; Remote Admin Agent - Simple Installer (Agent EXE Only)
; Created with Inno Setup

#define MyAppName "Remote Admin Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Remote Admin"
#define MyAppURL "https://dws-parth.daucu.com"
#define MyAppExeName "dws-agent.exe"

[Setup]
AppId={{A7B8C9D0-E1F2-4A5B-9C8D-7E6F5A4B3C2D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\bin
OutputBaseFilename=RemoteAdminAgent-AgentOnly-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
AllowNoIcons=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Only include the agent executable
Source: "..\agent\dws-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; Start the agent after installation
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Remote Admin Agent"; Flags: nowait postinstall skipifsilent
