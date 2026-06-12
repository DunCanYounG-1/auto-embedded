#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto-embedded 上下文查询 —— 供 `aemb status` 与手工排查用，不参与 hook 注入。

  python .auto-embedded/scripts/get_context.py            # 现场摘要
  python .auto-embedded/scripts/get_context.py --packages # 列出 spec 层
  python .auto-embedded/scripts/get_context.py --json      # 机器可读
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aemb_core as C  # noqa: E402


def main(argv: list) -> int:
    C.force_utf8_stdout()
    root = C.find_project_root()
    if root is None:
        print("✗ 未找到 .auto-embedded/", file=sys.stderr)
        return 1
    td = C.resolve_active_task(root)
    task = C.read_task(td)
    idx = C.spec_index(root)
    hw = C.hw_lock_summary(root)

    if "--json" in argv:
        print(json.dumps({
            "root": str(root),
            "developer": C.developer(root),
            "active_task": task.get("id"),
            "phase": task.get("phase"),
            "trace_id": task.get("trace_id"),
            "spec_layers": idx,
            "hw_lock": hw,
        }, ensure_ascii=False, indent=2))
        return 0

    if "--packages" in argv:
        for s in idx:
            print(f"{s['name']}\t.auto-embedded/{s['path']}/index.md\t{'OK' if s['exists'] else 'MISSING'}\t{s['title']}")
        return 0

    dev = C.developer(root)
    print(f"项目根: {root}" + (f"  开发者: {dev}" if dev else ""))
    print(f"active task: {task.get('id', '(无)')}  阶段: [{task.get('phase', '-')}]  trace: {task.get('trace_id', '-')}")
    print("spec 层:")
    for s in idx:
        print(f"  · {s['name']}: .auto-embedded/{s['path']}/index.md {'' if s['exists'] else '(缺失)'} {s['title']}")
    if hw:
        print(f"硬件资源锁: {hw}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
