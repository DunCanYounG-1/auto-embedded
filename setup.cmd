@echo off
chcp 65001 >nul
REM ====================================================================
REM  auto-embedded 一条龙安装：双击我，一次装齐
REM    · aemb CLI（全局）
REM    · 全局技能 multisim-spice（电路/SPICE/Multisim）+ simubridge（Simulink）
REM    · 打印 MCP / Multisim 后续步骤
REM  传参: setup.cmd -SkillsOnly  /  -List  /  -Mcp
REM ====================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\install.ps1" %*
echo.
pause
