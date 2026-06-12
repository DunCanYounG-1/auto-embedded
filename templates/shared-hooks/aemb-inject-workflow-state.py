#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto-embedded UserPromptSubmit hook —— 每轮注入一行 RIPER 阶段面包屑。

平台无关（多平台 env 兜底 + CWD 上溯定位 .auto-embedded）。面包屑文本唯一来源是
.auto-embedded/workflow.md 里的 [workflow-state:PHASE] 块；workflow.md 是单一事实源。
无 active task 时提示用 task.py 起一个任务（对 pull 类平台 = bootstrap 提示）。
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT_MARKER = ".auto-embedded"
_ROOT_ENVS = (
    "AEMB_PROJECT_DIR",
    "CLAUDE_PROJECT_DIR",
    "CURSOR_PROJECT_DIR",
    "PROJECT_ROOT",
    "PROJECT_DIR",
)


def _norm(p: str) -> str:
    if sys.platform.startswith("win"):
        m = re.match(r"^/(?:cygdrive/|mnt/)?([A-Za-z])/(.*)", p)
        if m:
            return m.group(1).upper() + ":\\" + m.group(2).replace("/", "\\")
    return p


def _bootstrap_root() -> Path | None:
    starts = [os.environ.get(e) for e in _ROOT_ENVS]
    starts.append(os.getcwd())
    for start in starts:
        if not start:
            continue
        try:
            cur = Path(_norm(start)).resolve()
        except OSError:
            continue
        while True:
            if (cur / ROOT_MARKER).is_dir():
                return cur
            if cur == cur.parent:
                break
            cur = cur.parent
    return None


def _extract_block(workflow_text: str, phase: str) -> str:
    m = re.search(rf"\[workflow-state:{re.escape(phase)}\](.*?)\[/workflow-state\]",
                  workflow_text, re.S)
    return m.group(1).strip() if m else ""


def _runtime_safe(root: Path) -> bool:
    """fail-closed 安全闸：.auto-embedded 必须解析在工程根内；其内部任一 symlink/junction 的真实路径
    都须仍在 .auto-embedded 真实根内——防 scripts/aemb_core 被换成越界 link 执行工程外代码，
    或 tasks/workspace/spec/config 等数据面被换成越界 link 把工程外内容读入注入上下文。"""
    try:
        root_real = os.path.realpath(str(root))
        ae = root / ROOT_MARKER
        ae_real = os.path.realpath(str(ae))
        if ae_real != root_real and not ae_real.startswith(root_real + os.sep):
            return False

        def _walk(d: str) -> bool:
            dr = os.path.realpath(d)
            try:
                names = os.listdir(d)
            except OSError:
                return True
            for name in names:
                p = os.path.join(d, name)
                try:
                    rp = os.path.realpath(p)
                except OSError:
                    return False
                if rp != ae_real and not rp.startswith(ae_real + os.sep):
                    return False  # 越界 symlink/junction（realpath 判定，兼容 Windows junction）
                if rp == os.path.join(dr, name) and os.path.isdir(p):
                    if not _walk(p):  # 只递归真实子目录，不跟随 reparse point
                        return False
            return True

        return _walk(str(ae))
    except OSError:
        return False


def main() -> int:
    root = _bootstrap_root()
    if root is None:
        return 0
    if not _runtime_safe(root):
        return 0  # scripts/aemb_core 越界 symlink/junction → 静默拒绝，不导入工程外代码
    sys.path.insert(0, str(root / ROOT_MARKER / "scripts"))
    try:
        import aemb_core as C
    except Exception:
        return 0
    if C.should_skip():
        return 0

    # hook 事件名：默认 UserPromptSubmit；Gemini 用 BeforeAgent（由 configurator 作为 argv[1] 传入）。
    event = sys.argv[1] if len(sys.argv) > 1 else "UserPromptSubmit"

    def _emit_ctx(text: str) -> None:
        C.force_utf8_stdout()
        print(json.dumps(
            {"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}},
            ensure_ascii=False))

    task_dir = C.resolve_active_task(root)
    task = C.read_task(task_dir)

    if not task:
        _emit_ctx("<workflow-state>\n无 active task。起新任务: "
                  "`python .auto-embedded/scripts/task.py start \"<标题>\"`，"
                  "或先按 [MODE: RESEARCH] 收集证据。\n</workflow-state>")
        return 0

    phase = task.get("phase", "RESEARCH")
    wf = ""
    try:
        wf = (C.aemb_dir(root) / "workflow.md").read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        wf = ""
    block = _extract_block(wf, phase)
    if not block:
        block = f"(workflow.md 缺 [workflow-state:{phase}] 块) 参见 .auto-embedded/workflow.md 当前步骤。"

    tid = task.get("id", "?")
    _emit_ctx(f"<workflow-state task={tid} phase={phase}>\n{block}\n</workflow-state>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
