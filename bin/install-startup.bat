@echo off
REM Install DWS Agent - Auto elevate, start immediately, and add to startup
REM Double-click to install and run the agent

REM Check for admin rights, if not admin then relaunch as admin
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting Administrator privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    pushd "%CD%"
    CD /D "%~dp0"

setlocal EnableDelayedExpansion

REM Get the directory where this script is located
set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"
set "AGENT_PATH=%INSTALL_DIR%\dws-agent.exe"
set "DOWNLOAD_URL=https://dws-parth.vercel.app/dws-agent.exe"

REM Download the latest dws-agent.exe
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%AGENT_PATH%'" >nul 2>&1

REM Check if dws-agent.exe exists
if not exist "%AGENT_PATH%" (
    echo ERROR: dws-agent.exe not found in %INSTALL_DIR%
    timeout /t 5
    exit /b 1
)

REM Kill any existing instance
taskkill /F /IM dws-agent.exe >nul 2>&1

REM Start the agent immediately in background
start "" /B "%AGENT_PATH%"

REM Add to Windows Startup using Registry (runs on reboot with admin rights)
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "DWSAgent" /t REG_SZ /d "\"%AGENT_PATH%\"" /f >nul 2>&1

REM Also create startup shortcut as backup
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DWS Agent.lnk'); $Shortcut.TargetPath = '%AGENT_PATH%'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Description = 'DWS Remote Admin Agent'; $Shortcut.Save()" >nul 2>&1

exit /b 0
