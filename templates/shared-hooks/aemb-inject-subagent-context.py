#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto-embedded PreToolUse(Task|Agent) hook —— 派子 Agent 时按角色注入相关 spec（push 类平台）。

平台无关（多平台 env 兜底 + CWD 上溯定位 .auto-embedded）。
相关性 scoping（对标 Trellis 的 per-task jsonl）：active task 目录下三份选择器，
一行一条 {"file": "spec/...","reason": "..."}：
    research.jsonl  → Scout 角色加载
    implement.jsonl → Builder 角色加载
    verify.jsonl    → Verifier 角色加载
角色由 Task 工具的 subagent_type / prompt 关键字判定，默认按 Builder。
（pull 类平台 Codex/Copilot hook 改不了子 Agent 提示，改由 Agent 定义里的 prelude 自取，不装本 hook。）
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


def _read_stdin_json() -> dict:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}


# 比赛模式 6 角色（embedded-*）→ RIPER 注入角色的显式映射（先于关键字猜测）：
# arch 只做决策/路由（要 hardware/guides）→ research；qa 是验证门 → verify；其余写代码/文档 → implement。
_AGENT_ROLE_MAP = {
    "embedded-arch": "research",
    "embedded-qa": "verify",
    "embedded-drv": "implement",
    "embedded-alg": "implement",
    "embedded-matlab": "implement",
    "embedded-report": "implement",
    "aemb-scout": "research",
    "aemb-builder": "implement",
    "aemb-verifier": "verify",
}


def _role_for(input_data: dict) -> str:
    ti = input_data.get("tool_input", input_data) or {}
    sub = str(ti.get("subagent_type", "")).strip().lower()
    if sub in _AGENT_ROLE_MAP:
        return _AGENT_ROLE_MAP[sub]
    blob = " ".join(str(ti.get(k, "")) for k in ("subagent_type", "description", "prompt")).lower()
    if "scout" in blob or "research" in blob:
        return "research"
    if "verifier" in blob or "verify" in blob or "review" in blob or "check" in blob:
        return "verify"
    return "implement"  # 默认 Builder


def _load_selector(task_dir: Path, role: str) -> list:
    sel = task_dir / f"{role}.jsonl"
    out = []
    try:
        for line in sel.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and row.get("file"):
                out.append(row)
    except (OSError, UnicodeDecodeError):
        pass
    return out


_DEFAULT_SPEC = {
    "research":  ["hardware", "guides"],
    "implement": ["architecture", "conventions"],
    "verify":    ["architecture", "conventions"],
}


def _default_spec_for(root, role: str) -> list:
    import aemb_core as C
    rows = []
    for layer in _DEFAULT_SPEC.get(role, []):
        rel = f"spec/{layer}/index.md"
        if (C.aemb_dir(root) / rel).is_file():
            rows.append({"file": rel, "reason": f"默认相关（{role} 角色，未人工 select）"})
    return rows


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

    input_data = _read_stdin_json()
    role = _role_for(input_data)
    task_dir = C.resolve_active_task(root)
    if task_dir is None:
        return 0

    rows = _load_selector(task_dir, role)
    auto = False
    if not rows:
        rows = _default_spec_for(root, role)
        auto = bool(rows)
        if not rows:
            return 0

    per_file_cap = C.inject_budget(root, "per_file")
    total_cap = C.inject_budget(root, "subagent_total")

    role_cn = {"research": "Scout", "implement": "Builder", "verify": "Verifier"}.get(role, role)
    srcdesc = f"{role} 角色默认相关 spec（未人工 select，自动选取；可用 task.py select 覆盖）" if auto \
        else f"来自 {role}.jsonl 的人工预选"
    parts = [f"<auto-embedded-subagent role={role_cn}>",
             f"以下是本任务为 {role_cn} 角色提供的相关 spec/证据（{srcdesc}），请据此工作:"]
    base = C.aemb_dir(root)
    base_r = base.resolve()
    used = 0
    omitted = []
    for r in rows:
        rel = str(r.get("file", "")).lstrip("/")
        reason = r.get("reason", "")
        try:
            fp = (base / rel).resolve()
        except Exception:
            continue
        if fp != base_r and base_r not in fp.parents:
            parts.append("")
            parts.append(f"### {rel}  — 已拒绝：路径越界（不在 .auto-embedded/ 内），跳过")
            continue
        if used >= total_cap:
            omitted.append(rel)
            continue
        content = ""
        try:
            content = fp.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            content = "(文件缺失或不可读)"
        if len(content) > per_file_cap:
            content = content[:per_file_cap] + "\n…(单文件超预算已截断，完整见该文件)"
        remaining = total_cap - used
        if len(content) > remaining:
            content = content[:remaining] + "\n…(达总注入预算已截断)"
        used += len(content)
        parts.append("")
        parts.append(f"### .auto-embedded/{rel}" + (f"  — {reason}" if reason else ""))
        parts.append(content)
    if omitted:
        parts.append("")
        parts.append(f"（达注入预算 {total_cap} 字符，以下 {len(omitted)} 个文件未注入正文，"
                     f"需要时自行读取：{', '.join('.auto-embedded/' + o for o in omitted)}）")
    parts.append("</auto-embedded-subagent>")
    context = "\n".join(parts)

    # 注入机制（与 Trellis 一致）：PreToolUse 改写 Task 工具的 prompt 入参（updatedInput），
    # 把相关 spec 前置进子 Agent 的提示；纯文本 stdout 到不了子 Agent。多格式覆盖各平台。
    tool_input = input_data.get("tool_input", input_data) or {}
    if not isinstance(tool_input, dict):
        tool_input = {}
    orig = str(tool_input.get("prompt", ""))
    new_prompt = f"{context}\n\n{orig}" if orig else context
    updated = dict(tool_input)
    updated["prompt"] = new_prompt

    C.force_utf8_stdout()
    print(json.dumps({
        # Claude / Qoder / CodeBuddy / Droid
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": updated,
        },
        # Cursor
        "permission": "allow",
        "updated_input": updated,
        # Gemini
        "updatedInput": updated,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
