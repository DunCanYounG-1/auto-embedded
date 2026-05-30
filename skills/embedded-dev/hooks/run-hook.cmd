#!/usr/bin/env bash
# Hook dispatcher for the embedded-dev skill.
#
# Always invoked as:  bash "<path>/run-hook.cmd" <script-name> [args...]
# settings.json and SKILL.md frontmatter prefix every hook command with `bash`,
# so this file is executed BY bash regardless of the host shell — cmd.exe,
# PowerShell and bash all end up running `bash run-hook.cmd ...`. The file is
# therefore a plain bash script (kept under the .cmd name only because existing
# configs reference that path). It is intentionally NOT a cmd/bash polyglot:
# the file is LF-locked via .gitattributes (required for bash), and LF-only
# .cmd files cannot be executed reliably by cmd.exe anyway (goto/label parsing
# breaks and an interactive prompt can hang the hook).
#
# Dispatch by script extension:
#   <name>.py  -> python / python3  (probe for a REAL interpreter first; the
#                 Windows Store ships a python3 stub that exits 0 with no
#                 output and is useless for headless hooks)
#   <name>     -> bash              (Git Bash on Windows, native bash elsewhere)
#
# Fail-open contract: every exit path returns 0. Hooks are enhancements, not
# blockers — the protocol is still enforced by Claude itself. The only
# exception is the script the dispatcher exec's into (e.g. pre-write-check.py),
# which owns its own exit code.

set +e  # never abort on error — fail open

SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
SCRIPT_NAME="$1"

if [ -z "$SCRIPT_NAME" ]; then
    # Missing script name — emit a diagnostic for logs but do not block.
    echo "run-hook.cmd: missing script name" >&2
    exit 0
fi
shift

case "$SCRIPT_NAME" in
    *.py)
        # Python script. Verify it exists first — exec'ing python on a missing
        # file exits non-zero, and a non-zero PreToolUse hook BLOCKS the tool
        # call. Fail open instead.
        [ -f "${SCRIPT_DIR}/${SCRIPT_NAME}" ] || exit 0      # missing — fail open
        # Probe for a real Python 3 — 'python' first (most common on Windows,
        # also works on Linux), then 'python3'.
        if python  -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; then
            exec python  "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
        elif python3 -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; then
            exec python3 "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
        fi
        exit 0  # no real Python — fail open
        ;;
    *)
        # Bash script (extensionless). Verify it exists, then run it.
        [ -f "${SCRIPT_DIR}/${SCRIPT_NAME}" ] || exit 0      # missing — fail open
        command -v bash >/dev/null 2>&1 || exit 0            # no bash — fail open
        exec bash "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
        ;;
esac
