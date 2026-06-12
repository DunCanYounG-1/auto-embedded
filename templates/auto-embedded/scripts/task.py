#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto-embedded 任务生命周期 —— 把 RIPER-5 + 四文件 + 相关性选择器落到磁盘。

用法（在工程根执行）:
  python .auto-embedded/scripts/task.py start "USART1 中断不触发排查"   # 建任务 + 设为 active
  python .auto-embedded/scripts/task.py phase PLAN                      # 切 RIPER 阶段
  python .auto-embedded/scripts/task.py select builder spec/architecture/index.md "分层约束"
  python .auto-embedded/scripts/task.py promote conventions "ISR 里禁止 printf：会阻塞"
  python .auto-embedded/scripts/task.py list
  python .auto-embedded/scripts/task.py archive

四文件映射：prd.md=项目规划清单/需求、research.md=研究发现、edits.md=编辑清单、
hw-lock=硬件资源表(在 spec/hardware)。选择器 research/implement/verify.jsonl 决定派
Scout/Builder/Verifier 时自动注入哪些 spec。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aemb_core as C  # noqa: E402

C.force_utf8_stdout()  # 防 Windows gbk 编码 ✓✗ 崩溃

PHASES = ["RESEARCH", "INNOVATE", "PLAN", "EXECUTE", "REVIEW"]
ROLES = {"scout": "research", "builder": "implement", "verifier": "verify",
         "research": "research", "implement": "implement", "verify": "verify"}


def _root() -> Path:
    r = C.find_project_root()
    if r is None:
        print("✗ 未找到 .auto-embedded/（请在已 init 的工程根运行）", file=sys.stderr)
        sys.exit(1)
    return r


def _slug(title: str) -> str:
    s = re.sub(r"[^\w一-鿿-]+", "-", title.strip()).strip("-").lower()
    return (s or "task")[:48]


def _write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def cmd_start(args: list) -> int:
    if not args:
        print("用法: task.py start \"<标题>\" [--id ID]", file=sys.stderr)
        return 1
    title = args[0]
    if not title.strip():
        print("✗ 任务标题不能为空", file=sys.stderr)
        return 1
    tid = None
    if "--id" in args:
        i = args.index("--id")
        if i + 1 >= len(args):
            print("✗ --id 需要一个值", file=sys.stderr)
            return 1
        tid = args[i + 1]
    root = _root()
    base = C.tasks_dir(root)
    # 始终经 _slug 净化（剥掉 / \ .. 等），防任务目录被写到 tasks/ 外
    tid = _slug(tid) if tid else _slug(title)
    d = base / tid
    n = 2
    while d.exists():
        d = base / f"{tid}-{n}"
        n += 1
    tid = d.name
    trace = f"T-{tid}"
    task = {"id": tid, "title": title, "phase": "RESEARCH", "trace_id": trace,
            "status": "active"}
    _write(d / "task.json", json.dumps(task, ensure_ascii=False, indent=2))
    _write(d / "prd.md", f"# {title}\n\n## 需求 / 验收标准\n- \n\n## 约束\n- \n")
    _write(d / "research.md", "# 研究发现\n\n| 关键词 | 来源 | 摘要 | 可信度 | 状态 |\n|---|---|---|---|---|\n")
    _write(d / "edits.md", "# 编辑清单\n\n| 文件 | 改动 | 验证标准 | 结果 | commit |\n|---|---|---|---|---|\n")
    for role in ("research", "implement", "verify"):
        _write(d / f"{role}.jsonl",
               '{"_example": {"file": "spec/architecture/index.md", "reason": "示例：删除本行"}}\n')
    # 设为 active
    rd = C.runtime_dir(root)
    rd.mkdir(parents=True, exist_ok=True)
    (rd / "active_task").write_text(tid, encoding="utf-8")
    print(f"✓ 创建任务 {tid}（active），阶段 RESEARCH，trace_id={trace}")
    print(f"  目录: .auto-embedded/tasks/{tid}/")
    return 0


def cmd_phase(args: list) -> int:
    if not args or args[0].upper() not in PHASES:
        print(f"用法: task.py phase <{'|'.join(PHASES)}>", file=sys.stderr)
        return 1
    root = _root()
    td = C.resolve_active_task(root)
    if td is None:
        print("✗ 无 active task", file=sys.stderr)
        return 1
    task = C.read_task(td)
    task["phase"] = args[0].upper()
    _write(td / "task.json", json.dumps(task, ensure_ascii=False, indent=2))
    print(f"✓ {task['id']} 阶段 → {task['phase']}")
    return 0


def cmd_select(args: list) -> int:
    if len(args) < 2 or args[0].lower() not in ROLES:
        print("用法: task.py select <scout|builder|verifier> <spec相对路径> [reason]", file=sys.stderr)
        return 1
    role = ROLES[args[0].lower()]
    raw = args[1]
    # 先在原始串上判绝对路径（POSIX / / Windows 盘符 / \），与"拒绝绝对路径"表述一致
    if raw.startswith("/") or raw.startswith("\\") or re.match(r"^[A-Za-z]:", raw):
        print("✗ spec 路径非法：不接受绝对路径", file=sys.stderr)
        return 1
    specfile = raw.replace("\\", "/").strip("/")
    segs = [p for p in specfile.split("/") if p]
    if (not specfile) or (".." in segs):
        print("✗ spec 路径非法：必须是 .auto-embedded/ 内的相对路径，且不含 ..", file=sys.stderr)
        return 1
    reason = args[2] if len(args) > 2 else ""
    root = _root()
    td = C.resolve_active_task(root)
    if td is None:
        print("✗ 无 active task", file=sys.stderr)
        return 1
    sel = td / f"{role}.jsonl"
    # 保留已有有效行（丢弃 _example），并按 file 去重防上下文膨胀
    keep, seen = [], set()
    if sel.exists():
        for line in sel.read_text(encoding="utf-8").splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and row.get("file"):
                keep.append(line)
                seen.add(row["file"])
    if specfile in seen:
        print(f"· {role}.jsonl 已含 {specfile}（去重跳过）")
        return 0
    keep.append(json.dumps({"file": specfile, "reason": reason}, ensure_ascii=False))
    sel.write_text("\n".join(keep) + "\n", encoding="utf-8")
    print(f"✓ {role}.jsonl += {specfile}")
    return 0


# I：promote 类型——强制分类，避免把临时经验固化成"伪规范"污染 spec
PROMOTE_TYPES = {
    "decision":   "设计决策",
    "convention": "约定",
    "gotcha":     "坑/gotcha",
    "pattern":    "可复用模式",
}


def cmd_promote(args: list) -> int:
    """把学习蒸馏回 spec（回流环）：分类追加到 spec/<layer>/index.md 的『沉淀』节。
    用法: task.py promote <layer> [<type>] "<内容>"
      type ∈ decision|convention|gotcha|pattern（缺省 convention）。
    强制分类是为了防止把"任务过程中的临时事实"当成可复用规范固化（边界治理见 spec/governance）。"""
    if len(args) < 2:
        print("用法: task.py promote <layer> [decision|convention|gotcha|pattern] \"<内容>\"",
              file=sys.stderr)
        return 1
    layer = args[0]
    if len(args) >= 3 and args[1] in PROMOTE_TYPES:
        ptype, note = args[1], args[2]
    else:
        ptype, note = "convention", args[1]
    root = _root()
    idx = C.aemb_dir(root) / "spec" / layer / "index.md"
    if not idx.exists():
        print(f"✗ spec 层不存在: spec/{layer}/index.md", file=sys.stderr)
        return 1
    text = idx.read_text(encoding="utf-8")
    marker = "## 沉淀（promote 回流）"
    bullet = f"- [{PROMOTE_TYPES[ptype]}] {note}"
    if marker in text:
        text = text.rstrip() + "\n" + bullet + "\n"
    else:
        text = text.rstrip() + (f"\n\n{marker}\n"
                                "> 只沉淀**可复用知识**（决策/约定/坑/模式），"
                                "任务过程性事实留在 tasks/ 不要 promote。下次会自动注入。\n"
                                f"{bullet}\n")
    idx.write_text(text, encoding="utf-8")
    print(f"✓ 已沉淀到 spec/{layer}/index.md（类型：{PROMOTE_TYPES[ptype]}）")
    return 0


def cmd_list(_args: list) -> int:
    root = _root()
    td = C.tasks_dir(root)
    active = C.resolve_active_task(root)
    active_id = active.name if active else None
    if not td.is_dir():
        print("(无任务)")
        return 0
    for d in sorted(td.iterdir()):
        if not d.is_dir():
            continue
        t = C.read_task(d)
        flag = " *active*" if d.name == active_id else ""
        print(f"  {d.name}: [{t.get('phase','?')}] {t.get('status','?')} — {t.get('title','')}{flag}")
    return 0


def cmd_archive(_args: list) -> int:
    root = _root()
    td = C.resolve_active_task(root)
    if td is None:
        print("✗ 无 active task", file=sys.stderr)
        return 1
    task = C.read_task(td)
    task["status"] = "archived"
    _write(td / "task.json", json.dumps(task, ensure_ascii=False, indent=2))
    at = C.runtime_dir(root) / "active_task"
    if at.exists():
        at.unlink()
    print(f"✓ {task['id']} 已归档，已清除 active")
    return 0


def cmd_journal(args: list) -> int:
    """跨会话叙事记忆：把一条会话记录追加到 workspace/journal.md（对标 Trellis journal）。
    用法: task.py journal "<这次做了什么/决策/下一步>"
    SessionStart 会注入最近几条，让新会话带着"故事"启动而非从零。"""
    if not args or not args[0].strip():
        print("用法: task.py journal \"<本次会话摘要：做了什么/决策/下一步>\"", file=sys.stderr)
        return 1
    note = " ".join(args).strip()
    root = _root()
    td = C.resolve_active_task(root)
    task = C.read_task(td)
    tid = task.get("id", "-")
    phase = task.get("phase", "-")
    jp = C.journal_path(root)
    jp.parent.mkdir(parents=True, exist_ok=True)
    # 标题用序号而非时间戳（运行环境禁 Date.now；序号 = 已有条目数 + 1，单调）
    seq = len(C.read_journal_entries(root, n=10**9)) + 1
    block = f"\n## #{seq}  task={tid}  phase={phase}\n{note}\n"
    with open(jp, "a", encoding="utf-8") as f:
        f.write(block)
    print(f"✓ 已写入 workspace/journal.md（#{seq}）")
    return 0


def main(argv: list) -> int:
    if not argv:
        print(__doc__)
        return 0
    cmd, args = argv[0], argv[1:]
    table = {"start": cmd_start, "phase": cmd_phase, "select": cmd_select,
             "promote": cmd_promote, "list": cmd_list, "archive": cmd_archive,
             "journal": cmd_journal}
    if cmd not in table:
        print(f"未知命令: {cmd}\n{__doc__}", file=sys.stderr)
        return 1
    return table[cmd](args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
