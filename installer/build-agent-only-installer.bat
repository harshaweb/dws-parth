@echo off
REM Build Agent-Only Installer
REM This script builds the simplified installer that only includes the agent executable

echo ============================================
echo Building Agent-Only Installer
echo ============================================

REM Check if Inno Setup is installed
set ISCC_PATH=
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set "ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe"
) else (
    echo ERROR: Inno Setup 6 not found!
    echo Please install Inno Setup 6 from https://jrsoftware.org/isinfo.php
    pause
    exit /b 1
)

echo Found Inno Setup at: %ISCC_PATH%

REM Check if agent executable exists
if not exist "..\agent\dws-agent.exe" (
    echo ERROR: Agent executable not found at ..\agent\dws-agent.exe
    echo Please build the agent first using: cd ..\agent ^&^& go build -o dws-agent.exe
    pause
    exit /b 1
)

echo Agent executable found.

REM Create bin directory if it doesn't exist
if not exist "..\bin" mkdir "..\bin"

REM Build the installer
echo.
echo Building installer...
"%ISCC_PATH%" setup-agent-only.iss

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo SUCCESS: Installer created at ..\bin\RemoteAdminAgent-AgentOnly-Setup.exe
    echo ============================================
) else (
    echo.
    echo ERROR: Failed to build installer
    pause
    exit /b 1
)

pause
