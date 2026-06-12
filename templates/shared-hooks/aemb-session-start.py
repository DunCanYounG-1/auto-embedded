#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto-embedded SessionStart hook —— 会话启动/clear/compact 时注入 RIPER-5 现场。

平台无关：通过 .auto-embedded 标记定位项目根（多平台 env 兜底 + CWD 上溯），再 import 运行时核心。
被多个 push 类平台共用（Claude/Cursor/Gemini…），各平台只是接线方式不同（settings.json / hooks.json）。

注入内容：
  - 当前 RIPER 阶段 + active task
  - 项目 spec 索引（分层 + 各层标题）
  - 硬件资源锁摘要 + 冲突预警
  - 最近几条 journal（跨会话叙事）
  - 五问重启提示
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT_MARKER = ".auto-embedded"
# 各平台传项目根的 env（按序尝试），最后兜底 CWD。
_ROOT_ENVS = (
    "AEMB_PROJECT_DIR",
    "CLAUDE_PROJECT_DIR",
    "CURSOR_PROJECT_DIR",
    "PROJECT_ROOT",
    "PROJECT_DIR",
)


def _norm(p: str) -> str:
    """Git-Bash/MSYS/Cygwin/WSL 风格 /c/... → C:\\...（仅 Windows），防 resolve 误判。"""
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
        return 0  # 非 auto-embedded 工程，静默
    if not _runtime_safe(root):
        return 0  # scripts/aemb_core 越界 symlink/junction → 静默拒绝，不导入工程外代码
    sys.path.insert(0, str(root / ROOT_MARKER / "scripts"))
    try:
        import aemb_core as C
    except Exception:
        return 0
    if C.should_skip():
        return 0

    task_dir = C.resolve_active_task(root)
    task = C.read_task(task_dir)
    phase = task.get("phase", "RESEARCH")
    tid = task.get("id", "(无 active task)")
    title = task.get("title", "")
    trace = task.get("trace_id", "")

    lines = []
    lines.append("<auto-embedded-session>")
    lines.append("auto-embedded 已注入现场。本工程由 RIPER-5 协议 + 项目级 spec 驱动。")
    lines.append(f"当前阶段: [MODE: {phase}]  active task: {tid}" + (f" — {title}" if title else "") +
                 (f"  trace_id={trace}" if trace else ""))
    dev = C.developer(root)
    if dev:
        lines.append(f"开发者: {dev}")

    idx = C.spec_index(root)
    if idx:
        lines.append("")
        lines.append("项目 spec 库（按需读取对应 index.md，勿凭记忆）:")
        for s in idx:
            mark = "" if s["exists"] else "（缺失）"
            t = f" — {s['title']}" if s["title"] else ""
            lines.append(f"  · {s['name']}: .auto-embedded/{s['path']}/index.md{mark}{t}")

    hw = C.hw_lock_summary(root)
    if hw:
        lines.append("")
        lines.append(f"硬件资源锁 (.auto-embedded/spec/hardware/hw-lock.yaml): {hw}")
    try:
        conflicts = C.hw_lock_conflicts(root)
    except Exception:
        conflicts = []
    if conflicts:
        lines.append("⚠ 硬件资源冲突（必须先解决，详见 hw-lock.yaml）:")
        for c in conflicts:
            lines.append(f"    {c}")

    try:
        entries = C.read_journal_entries(root, n=3)
    except Exception:
        entries = []
    if entries:
        lines.append("")
        lines.append("最近会话记忆 (workspace/journal.md，新→旧):")
        for e in entries:
            for el in e.splitlines():
                lines.append(f"  {el}")

    lines.append("")
    lines.append("五问重启（上下文恢复协议，先回答再动手）:")
    lines.append("  1) 当前在哪个 RIPER 阶段  2) 最近改了什么  3) 硬件资源现状")
    lines.append("  4) 之前 RESEARCH 发现了什么  5) 现在该以哪个角色(Scout/Builder/Verifier)继续")
    lines.append("详情: 读 .auto-embedded/workflow.md 与 active task 下的 prd.md / research.md / edits.md。")
    lines.append("</auto-embedded-session>")

    text = "\n".join(lines)
    if not text.strip():
        return 0
    # 多格式 JSON 信封（与 Trellis 一致，覆盖 Claude/Cursor/Gemini/Codex/Copilot 等）：
    #   hookSpecificOutput.additionalContext —— Claude/Qoder/CodeBuddy/Droid/Gemini/Copilot
    #   additional_context（顶层 snake_case）—— Cursor sessionStart
    result = {
        "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": text},
        "additional_context": text,
    }
    C.force_utf8_stdout()
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
