@echo off
echo Building installer...
echo.

cd /d "%~dp0"

REM Build the installer
go build -ldflags="-s -w -H windowsgui" -o installer.exe installer.go

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Installer built successfully
    echo ========================================
    echo.
    echo File: installer.exe
    echo.
    echo Right-click installer.exe and select "Run as Administrator"
    echo.
) else (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

pause
