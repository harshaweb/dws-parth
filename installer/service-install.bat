@echo off
REM Install Remote Admin Agent as Windows Service - Non-blocking version

REM Check if service already exists and remove it
sc query RemoteAdminAgent >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    sc stop RemoteAdminAgent >nul 2>&1
    sc delete RemoteAdminAgent >nul 2>&1
)

REM Install service with network dependency
sc create RemoteAdminAgent binPath= "\"%~dp0agent.exe\"" DisplayName= "Remote Admin Agent" start= delayed-auto depend= "Tcpip/Dnscache" >nul 2>&1

REM Configure service
sc description RemoteAdminAgent "Remote administration agent for monitoring and controlling Windows devices" >nul 2>&1
sc failure RemoteAdminAgent reset= 86400 actions= restart/60000/restart/60000/restart/60000 >nul 2>&1
sc config RemoteAdminAgent obj= LocalSystem >nul 2>&1

REM Start agent immediately in background (don't wait for service)
start /B "" "%~dp0agent.exe" >nul 2>&1

REM Also start the service (async)
start /B sc start RemoteAdminAgent >nul 2>&1

REM Exit immediately - agent is now running
exit /b 0

