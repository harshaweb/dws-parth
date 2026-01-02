@echo off
REM Build Pure Go Installer (No Inno Setup Required)

echo ========================================
echo Building Pure Go Installer
echo ========================================
echo.

REM Step 1: Build the agent first
echo [1/3] Building agent...
cd ..\agent
go build -ldflags="-H windowsgui" -o ..\bin\dws-agent.exe .
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build agent!
    pause
    exit /b 1
)
echo Done!
echo.

REM Step 2: Copy agent to installer directory for embedding
echo [2/3] Preparing agent for embedding...
cd ..\installer
copy ..\bin\dws-agent.exe dws-agent.exe >nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to copy agent!
    pause
    exit /b 1
)
echo Done!
echo.

REM Step 3: Build the installer with embedded agent
echo [3/3] Building installer...
go mod download
go build -o ..\bin\RemoteAdminAgent-Installer.exe build-installer.go

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS!
    echo ========================================
    echo Installer created: ..\bin\RemoteAdminAgent-Installer.exe
    echo.
    echo This is a standalone installer that:
    echo - Requires NO external tools (no Inno Setup needed)
    echo - Embeds the agent inside the installer
    echo - Installs as a Windows service
    echo - Starts automatically on boot
    echo - Includes built-in uninstaller
    echo.
    echo Usage:
    echo   To Install:   Run RemoteAdminAgent-Installer.exe as Administrator
    echo   To Uninstall: Run RemoteAdminAgent-Installer.exe uninstall as Administrator
    echo.
    
    REM Clean up
    del dws-agent.exe >nul 2>&1
) else (
    echo.
    echo ERROR: Failed to build installer!
    pause
    exit /b 1
)

pause
