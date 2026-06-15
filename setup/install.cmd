@echo off
chcp 65001 >nul
REM 双击我 = 一条龙安装/更新（aemb CLI + 全局技能）。传参同样有效: install.cmd -List / -Mcp / -SkillsOnly
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
