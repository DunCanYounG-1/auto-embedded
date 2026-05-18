: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot hook wrapper for embedded-dev skill.
REM
REM Dispatch rules:
REM   <name>.py   → run with python3 / python (Trellis-style robust hooks)
REM   <name>      → run with bash (Git Bash on Windows, native bash elsewhere)
REM
REM Failure mode: silently exit 0 (hooks fail open — they're enhancements,
REM not blockers; the protocol is still enforced by Claude itself).
REM
REM Hook scripts use extensionless filenames for bash scripts (e.g.
REM "check-memory-files" not "check-memory-files.sh") so Claude Code's
REM Windows auto-detection — which prepends "bash" to commands containing
REM .sh — doesn't double-wrap them.
REM
REM Usage: run-hook.cmd <script-name> [args...]
REM   e.g. run-hook.cmd session-start.py
REM        run-hook.cmd check-memory-files

if "%~1"=="" (
    REM Missing script name — fail open (don't block protocol) but emit a
    REM diagnostic to stderr so misconfigurations are visible in logs.
    echo run-hook.cmd: missing script name >&2
    exit /b 0
)

set "HOOK_DIR=%~dp0"
set "SCRIPT_NAME=%~1"

REM === Python dispatch (script ends in .py) ===
REM Try real Python interpreters. Windows Store may install a `python3` stub
REM in WindowsApps that returns exit 0 with no output and prompts the user to
REM install from Store — useless for headless hooks. Probe with --version first
REM and require non-empty output to confirm a real interpreter.
if /I "%~x1"==".py" (
    REM Try 'python' first (most common on Windows)
    for /f "delims=" %%V in ('python -c "import sys; print(sys.version_info[0])" 2^>nul') do (
        if "%%V"=="3" (
            python "%HOOK_DIR%%SCRIPT_NAME%" %2 %3 %4 %5 %6 %7 %8 %9
            exit /b %ERRORLEVEL%
        )
    )
    REM Try 'python3' (Linux/macOS standard, may exist on Windows too)
    for /f "delims=" %%V in ('python3 -c "import sys; print(sys.version_info[0])" 2^>nul') do (
        if "%%V"=="3" (
            python3 "%HOOK_DIR%%SCRIPT_NAME%" %2 %3 %4 %5 %6 %7 %8 %9
            exit /b %ERRORLEVEL%
        )
    )
    REM No real Python available — fail open
    exit /b 0
)

REM === Bash dispatch (extensionless scripts) ===
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%HOOK_DIR%%SCRIPT_NAME%" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    "C:\Program Files (x86)\Git\bin\bash.exe" "%HOOK_DIR%%SCRIPT_NAME%" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%HOOK_DIR%%SCRIPT_NAME%" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM No bash found either — fail open
exit /b 0
CMDBLOCK

# Unix path: dispatch by extension
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift

case "$SCRIPT_NAME" in
    *.py)
        # Python script — probe for a REAL interpreter. Windows Store may
        # install a python3 stub that exits 0 with no output, so we verify
        # version output is non-empty before trusting the binary.
        # Try 'python' first (most common on Windows, also works on Linux).
        if python -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; then
            exec python "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
        elif python3 -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; then
            exec python3 "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
        else
            # No real Python — fail open
            exit 0
        fi
        ;;
    *)
        # Bash script — verify the file exists first; fail open if missing
        if [ ! -f "${SCRIPT_DIR}/${SCRIPT_NAME}" ]; then
            exit 0
        fi
        if command -v bash >/dev/null 2>&1; then
            exec bash "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
        else
            # No bash — fail open
            exit 0
        fi
        ;;
esac
