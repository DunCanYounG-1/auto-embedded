#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SessionStart hook: inject embedded-dev iron rules into Claude's first system message.

Inspired by Trellis (shared-hooks/session-start.py): Python is more robust than
bash polyglot for cross-platform path/encoding handling, especially on Windows
where Git Bash / MSYS2 / Cygwin / WSL all leak different path formats.

Outputs a single JSON object on stdout (Claude Code reads it from hookSpecificOutput).
On error, exits silently with code 0 — hooks fail open, the protocol is enforced by
Claude itself when hooks are unavailable.
"""
from __future__ import annotations

# Suppress all warnings first so they don't pollute the JSON output channel.
import warnings
warnings.filterwarnings("ignore")

import io
import json
import os
import re
import sys
from pathlib import Path


# --------------------------------------------------------------------------- #
# UTF-8 hardening — Windows default codepage (cp936/cp1252/etc) crashes on
# non-ASCII content (Chinese iron rules, task names, etc).
# Force UTF-8 on all standard streams; equivalent to `python -X utf8` per-stream.
# --------------------------------------------------------------------------- #
def _force_utf8() -> None:
    for name in ("stdin", "stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is None:
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:
            # Fallback for older / non-standard streams: wrap in TextIOWrapper
            try:
                buf = getattr(stream, "buffer", None)
                if buf is None:
                    continue
                wrapped = io.TextIOWrapper(buf, encoding="utf-8", errors="replace")
                setattr(sys, name, wrapped)
            except Exception:
                pass


_force_utf8()


# --------------------------------------------------------------------------- #
# Windows shell path normalization — Git Bash / MSYS / Cygwin / WSL each leak
# Unix-style paths that Path.resolve() misinterprets on Windows.
# --------------------------------------------------------------------------- #
def normalize_windows_shell_path(path_str: str) -> str:
    """Convert Unix-style Windows shell paths back to native Windows form.

    Handles:
      - C:\\... or C:/...        → unchanged
      - /c/Users/...             → C:\\Users\\...     (Git Bash / MSYS2)
      - /cygdrive/c/Users/...    → C:\\Users\\...     (Cygwin)
      - /mnt/c/Users/...         → C:\\Users\\...     (WSL leaked into Win env)

    Non-Windows platforms: pass-through.
    Conservative: only rewrites unambiguous drive-letter mount patterns.
    """
    if not isinstance(path_str, str) or not path_str:
        return path_str
    if not sys.platform.startswith("win"):
        return path_str

    p = path_str.strip()

    # Already native Windows (C:\... or C:/...)
    if re.match(r"^[A-Za-z]:[\\/]", p):
        return p

    # MSYS / Git Bash: /c/Users/...
    m = re.match(r"^/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        return f"{drive}:\\" + rest.replace("/", "\\")

    # Cygwin: /cygdrive/c/Users/...
    m = re.match(r"^/cygdrive/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        return f"{drive}:\\" + rest.replace("/", "\\")

    # WSL leaked: /mnt/c/Users/...
    m = re.match(r"^/mnt/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        return f"{drive}:\\" + rest.replace("/", "\\")

    return path_str


# --------------------------------------------------------------------------- #
# Locate skill root (the directory containing SKILL.md, two levels up from this
# script). Exits silently if it can't be found — hooks fail open.
# --------------------------------------------------------------------------- #
def find_skill_root() -> Path | None:
    try:
        script_path = normalize_windows_shell_path(str(Path(__file__).resolve()))
        hooks_dir = Path(script_path).parent
        skill_root = hooks_dir.parent
        if (skill_root / "SKILL.md").is_file():
            return skill_root
    except Exception:
        pass
    return None


SKILL_ROOT = find_skill_root()
if SKILL_ROOT is None:
    # Can't locate skill — exit silently rather than block session start.
    sys.exit(0)


# --------------------------------------------------------------------------- #
# Bootstrap content — the bare-minimum iron rules Claude must know BEFORE any
# user turn. Everything else loads on demand. Keep this under ~60 lines.
# --------------------------------------------------------------------------- #
BOOTSTRAP = """# embedded-dev 协议引导（SessionStart 注入 / 仅索引，不复刻协议本体）

你正在加载 embedded-dev skill（RIPER-5 嵌入式开发协议）。**收到首个用户消息后**，在判断任务是否属于嵌入式主线之前，先做以下三件事（顺序固定，不要跳）：

1. **读取 SKILL.md**（协议本体，权威来源）— 用 Read 工具读，不要凭记忆假设
2. **环境自检（一次）**：通过 Bash 工具运行
   test -e /dev/null && echo "[embedded-dev] hooks env: ok" || echo "[embedded-dev] hooks env: degraded"
   若 degraded（Windows 缺 Git Bash 等），向用户告知 hooks 已静默失效但协议主流程仍由你手动遵守
3. **检测四文件磁盘记忆**（中英双轨）：若工程根目录存在 项目规划清单.md/plan.md、编辑清单.md/edits.md、硬件资源表.md/hw-resources.md、研究发现.md/findings.md 任一，**响应前必须读取最新内容**

任务属于嵌入式主线时，按 SKILL.md 的六条铁律执行（① 模式声明 ② 证据先于声明 ③ 四文件磁盘记忆 ④ 应用层禁 include 厂商 HAL ⑤ 环境自检 ⑥ letter = spirit），详细见 refs/riper5-stages.md。

非主线纯辅助交流（安装咨询/工具问答/纯文档查询）可豁免 [MODE:] 声明，直接答即可。

不要在收到用户消息之前主动执行任何命令。
"""


# --------------------------------------------------------------------------- #
# Single-field output. Claude Code reads BOTH hookSpecificOutput.additionalContext
# AND additional_context without deduplication — emitting both wastes tokens
# and produces duplicate iron rules in context. Select exactly one field based
# on which harness we're running under.
# --------------------------------------------------------------------------- #
def emit_payload(content: str) -> None:
    if os.environ.get("CURSOR_PLUGIN_ROOT"):
        payload = {"additional_context": content}
    elif os.environ.get("COPILOT_CLI"):
        payload = {"additional_context": content}
    else:
        # Default: Claude Code expects hookSpecificOutput.additionalContext
        payload = {
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": content,
            }
        }
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


def main() -> int:
    try:
        emit_payload(BOOTSTRAP)
    except Exception:
        # Hooks fail open — never block session start on hook errors.
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
