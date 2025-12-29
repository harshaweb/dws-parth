@echo off
:: Silent Agent Installer - Runs as Admin, Installs Silently, Adds to Startup
:: This script will request admin privileges and run everything in background

:: Check for admin privileges
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    :: Request admin privileges and restart script
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WindowStyle Hidden"
    exit /b
)

:: Set paths
set "INSTALL_DIR=%ProgramFiles%\Remote Admin Agent"
set "AGENT_EXE=dws-agent.exe"
set "AGENT_PATH=%INSTALL_DIR%\%AGENT_EXE%"

:: Create installation directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy agent executable (assumes agent exe is in same folder as this script)
if exist "%~dp0%AGENT_EXE%" (
    copy /Y "%~dp0%AGENT_EXE%" "%AGENT_PATH%" >nul 2>&1
) else if exist "%~dp0..\agent\%AGENT_EXE%" (
    copy /Y "%~dp0..\agent\%AGENT_EXE%" "%AGENT_PATH%" >nul 2>&1
)

:: Add to Windows Startup via Registry (runs at user login)
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "RemoteAdminAgent" /t REG_SZ /d "\"%AGENT_PATH%\"" /f >nul 2>&1

:: Kill any existing agent process
taskkill /F /IM %AGENT_EXE% >nul 2>&1

:: Start the agent in background
start "" /B "%AGENT_PATH%"

exit /b 0
