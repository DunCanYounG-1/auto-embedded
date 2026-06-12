#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto-embedded 统一检查入口（机械门禁，脱离 Claude hook 也能跑——CI / 本地 / REVIEW 复用）。

跑三类检查，任一失败 exit!=0：
  1) 分层架构门禁 ARCH-1~8：调用同目录 arch-check.sh（有 bash）或 arch-check.ps1（纯 PowerShell）
  2) 硬件资源锁冲突 HW-CONFLICT：hw-lock.yaml 的 pin/dma/irq/timer 重复 + irq 优先级冲突
  3) spec 完整性 SPEC：config.yaml 声明的每个 spec 层 index.md 必须存在

用法（工程根执行）：
  python .auto-embedded/scripts/check.py            # 全部
  python .auto-embedded/scripts/check.py --arch      # 仅分层门禁
  python .auto-embedded/scripts/check.py --hw        # 仅硬件冲突
  python .auto-embedded/scripts/check.py --spec      # 仅 spec 完整性
  python .auto-embedded/scripts/check.py --json      # 机器可读结果
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aemb_core as C  # noqa: E402

C.force_utf8_stdout()
SCRIPTS = Path(__file__).resolve().parent


def run_arch(root: Path) -> tuple[int, list]:
    """跑 arch-check.ps1 / .sh，回 (exit, [违规行])。无可用解释器则 skip(返回 0,[])。
    Windows 优先 pwsh/powershell + .ps1（bash/MSYS 收到 D:\\ 路径会报 No such file，故不优先）；
    其它平台优先 bash + .sh。两脚本行为/输出协议一致（见 arch-check.ps1 头注）。"""
    sh = SCRIPTS / "arch-check.sh"
    ps = SCRIPTS / "arch-check.ps1"
    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    bash = shutil.which("bash")
    order = []
    if sys.platform.startswith("win"):
        if ps.exists() and pwsh:
            order.append([pwsh, "-NoProfile", "-File", str(ps), "--all"])
        if sh.exists() and bash:
            order.append([bash, str(sh), "--all"])
    else:
        if sh.exists() and bash:
            order.append([bash, str(sh), "--all"])
        if ps.exists() and pwsh:
            order.append([pwsh, "-NoProfile", "-File", str(ps), "--all"])
    if not order:
        return 0, ["[SKIP] 未找到 PowerShell/bash，跳过分层门禁（装 PowerShell 或 bash 后可用）"]
    try:
        r = subprocess.run(order[0], cwd=str(root), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=120)
    except Exception as e:  # noqa: BLE001
        return 1, [f"[ARCH-ERR] arch-check 执行失败: {e}"]
    lines = [ln for ln in (r.stdout or "").splitlines() if ln.strip()]
    # rc≠0 且 stdout 为空 → 把 stderr 纳入 findings，避免"FAIL 但无任何信息"
    if r.returncode != 0 and not lines:
        for ln in (r.stderr or "").splitlines():
            if ln.strip():
                lines.append(f"[ARCH-ERR] {ln}")
    return r.returncode, lines


def run_hw(root: Path) -> tuple[int, list]:
    conflicts = C.hw_lock_conflicts(root)
    return (1 if conflicts else 0), conflicts


def run_spec(root: Path) -> tuple[int, list]:
    out = []
    for s in C.spec_index(root):
        if not s["exists"]:
            out.append(f"[SPEC] 层 {s['name']} 的 index.md 缺失: .auto-embedded/{s['path']}/index.md")
    return (1 if out else 0), out


def main(argv: list) -> int:
    root = C.find_project_root()
    if root is None:
        print("✗ 未找到 .auto-embedded/（请在已 init 的工程根运行）", file=sys.stderr)
        return 2
    want_all = not any(f in argv for f in ("--arch", "--hw", "--spec"))
    as_json = "--json" in argv

    results = {}
    rc_total = 0
    if want_all or "--arch" in argv:
        rc, lines = run_arch(root); results["arch"] = {"rc": rc, "findings": lines}; rc_total |= (1 if rc else 0)
    if want_all or "--hw" in argv:
        rc, lines = run_hw(root); results["hw"] = {"rc": rc, "findings": lines}; rc_total |= rc
    if want_all or "--spec" in argv:
        rc, lines = run_spec(root); results["spec"] = {"rc": rc, "findings": lines}; rc_total |= rc

    if as_json:
        print(json.dumps({"ok": rc_total == 0, "results": results}, ensure_ascii=False, indent=2))
        return rc_total

    for name, r in results.items():
        head = "PASS" if r["rc"] == 0 else "FAIL"
        print(f"== {name.upper()} : {head} ==")
        for ln in r["findings"]:
            print(f"  {ln}")
    print()
    print("==> ALL PASS" if rc_total == 0 else "==> FAIL（见上）")
    return rc_total


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
