@echo off
:: Launch silent installer in completely hidden mode
:: Double-click this file to install the agent silently

powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0silent-install.ps1"
