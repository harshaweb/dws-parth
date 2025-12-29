# Silent Agent Installer - PowerShell Version
# Runs as Admin, Installs Silently, Adds to Startup, Everything in Background

# Self-elevate to admin if not already
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`"" -Verb RunAs -WindowStyle Hidden
    exit
}

# Configuration
$InstallDir = "$env:ProgramFiles\Remote Admin Agent"
$AgentExe = "dws-agent.exe"
$AgentPath = Join-Path $InstallDir $AgentExe
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Create installation directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Find and copy agent executable
$SourcePaths = @(
    (Join-Path $ScriptDir $AgentExe),
    (Join-Path $ScriptDir "..\agent\$AgentExe")
)

foreach ($Source in $SourcePaths) {
    if (Test-Path $Source) {
        Copy-Item -Path $Source -Destination $AgentPath -Force
        break
    }
}

# Add to Windows Startup via Registry (HKLM - runs for all users)
$RegPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $RegPath -Name "RemoteAdminAgent" -Value "`"$AgentPath`"" -Force

# Also add to Task Scheduler for more reliable startup (runs at system startup, before login)
$TaskName = "RemoteAdminAgent"
$TaskExists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($TaskExists) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute $AgentPath
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null

# Stop any existing agent process
Get-Process -Name "dws-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Start the agent in background
Start-Process -FilePath $AgentPath -WindowStyle Hidden

exit 0
