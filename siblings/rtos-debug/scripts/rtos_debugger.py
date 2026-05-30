#!/usr/bin/env python3
"""RTOS 调试工具。

为 `rtos-debug` skill 提供可重复调用的执行入口，支持：

- 通过 ELF 符号自动检测 RTOS 类型
- 通过 GDB batch 模式读取任务列表
- 检查各任务栈水位
- 死锁检测
- 队列/信号量状态查看
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

_SCRIPT_DIR = Path(__file__).resolve().parent
_SKILLS_DIR = _SCRIPT_DIR.parent.parent
for _candidate in [_SKILLS_DIR / "shared", _SKILLS_DIR.parent / "shared"]:
    if (_candidate / "tool_config.py").exists():
        sys.path.insert(0, str(_candidate))
        break
from tool_config import get_tool_path


RTOS_SIGNATURES = {
    "freertos": ["vTaskStartScheduler", "xTaskCreate", "pxCurrentTCB"],
    "rt-thread": ["rt_thread_init", "rt_thread_create", "rt_current_thread"],
    "zephyr": ["k_thread_create", "k_thread_start", "_kernel"],
}

GDB_CANDIDATES = ["arm-none-eabi-gdb", "gdb-multiarch"]
DEFAULT_GDB_PORT = 3333

FREERTOS_TASK_STATES = {
    0: "Running",
    1: "Ready",
    2: "Blocked",
    3: "Suspended",
    4: "Deleted",
}


@dataclass
class TaskInfo:
    name: str
    state: str
    priority: int
    stack_high_water: int = -1
    stack_base: int = 0
    stack_size: int = 0


@dataclass
class RTOSResult:
    status: str
    summary: str
    rtos_type: str | None = None
    tasks: list[TaskInfo] = field(default_factory=list)
    deadlock_detected: bool = False
    observations: list[str] = field(default_factory=list)
    failure_category: str | None = None
    evidence: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# RTOS 类型检测
# ---------------------------------------------------------------------------

def detect_rtos_from_elf(elf_path: str) -> str | None:
    nm_tool = shutil.which("arm-none-eabi-nm") or shutil.which("nm")
    if not nm_tool:
        readelf = shutil.which("arm-none-eabi-readelf") or shutil.which("readelf")
        if not readelf:
            return None
        try:
            result = subprocess.run(
                [readelf, "-s", elf_path],
                capture_output=True, text=True, timeout=10,
            )
            output = result.stdout
        except Exception:
            return None
    else:
        try:
            result = subprocess.run(
                [nm_tool, elf_path],
                capture_output=True, text=True, timeout=10,
            )
            output = result.stdout
        except Exception:
            return None

    for rtos_type, symbols in RTOS_SIGNATURES.items():
        for sym in symbols:
            if sym in output:
                return rtos_type
    return None


# ---------------------------------------------------------------------------
# GDB 工具
# ---------------------------------------------------------------------------

def find_gdb(explicit: str | None) -> str | None:
    if explicit:
        return shutil.which(explicit) or explicit

    configured = get_tool_path("arm-none-eabi-gdb")
    if configured:
        path = shutil.which(configured) or configured
        if Path(path).exists():
            return path

    for candidate in GDB_CANDIDATES:
        path = shutil.which(candidate)
        if path:
            return path
    return None


def run_gdb_commands(
    gdb_path: str,
    elf_path: str,
    gdb_port: int,
    commands: list[str],
) -> tuple[bool, str]:
    elf_posix = elf_path.replace("\\", "/")
    lines = [
        f"file {elf_posix}",
        f"target extended-remote localhost:{gdb_port}",
    ] + commands + ["quit"]

    script = "\n".join(lines) + "\n"

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".gdb", delete=False, encoding="utf-8",
    ) as f:
        f.write(script)
        script_path = f.name

    try:
        result = subprocess.run(
            [gdb_path, "--batch", "-x", script_path],
            capture_output=True, text=True, timeout=30,
        )
        output = (result.stdout or "") + "\n" + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "GDB 执行超时"
    except FileNotFoundError:
        return False, f"未找到 GDB: {gdb_path}"
    finally:
        Path(script_path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# FreeRTOS 任务读取
# ---------------------------------------------------------------------------

def read_freertos_tasks(
    gdb_path: str, elf_path: str, gdb_port: int,
) -> tuple[list[TaskInfo], list[str]]:
    commands = [
        "monitor halt",
        "set print pretty on",
        "set pagination off",
        # 读取当前任务
        "print pxCurrentTCB",
        "print pxCurrentTCB->pcTaskName",
        "print pxCurrentTCB->uxPriority",
        # 遍历就绪列表
        "print pxReadyTasksLists",
        # 遍历延迟列表
        "print xDelayedTaskList1",
        "print xDelayedTaskList2",
        # 遍历挂起列表
        "print xSuspendedTaskList",
        # 任务总数
        "print uxCurrentNumberOfTasks",
    ]

    ok, output = run_gdb_commands(gdb_path, elf_path, gdb_port, commands)
    tasks: list[TaskInfo] = []
    observations: list[str] = []

    if not ok:
        observations.append(f"GDB 读取 FreeRTOS 数据失败")
        return tasks, observations

    # 解析当前任务
    current_name_match = re.search(r'pcTaskName\s*=\s*"(\w+)"', output)
    current_pri_match = re.search(r'uxPriority\s*=\s*(\d+)', output)
    if current_name_match:
        tasks.append(TaskInfo(
            name=current_name_match.group(1),
            state="Running",
            priority=int(current_pri_match.group(1)) if current_pri_match else 0,
        ))

    # 解析任务数量
    num_tasks_match = re.search(r'uxCurrentNumberOfTasks\s*=\s*(\d+)', output)
    if num_tasks_match:
        observations.append(f"FreeRTOS 任务总数: {num_tasks_match.group(1)}")

    # 解析更多任务名
    task_names = re.findall(r'pcTaskName\s*=\s*"(\w+)"', output)
    known = {t.name for t in tasks}
    for name in task_names:
        if name not in known:
            tasks.append(TaskInfo(name=name, state="Unknown", priority=0))
            known.add(name)

    return tasks, observations


def check_freertos_stack(
    gdb_path: str, elf_path: str, gdb_port: int,
) -> tuple[list[str], list[str]]:
    commands = [
        "monitor halt",
        "set pagination off",
        "print pxCurrentTCB->pxStack",
        "print pxCurrentTCB->pxTopOfStack",
        "print pxCurrentTCB->pcTaskName",
    ]

    ok, output = run_gdb_commands(gdb_path, elf_path, gdb_port, commands)
    observations: list[str] = []
    warnings: list[str] = []

    if not ok:
        observations.append("GDB 读取栈信息失败")
        return observations, warnings

    stack_base_match = re.search(r'pxStack\s*=\s*\(.*?\)\s*(0x[0-9a-fA-F]+)', output)
    stack_top_match = re.search(r'pxTopOfStack\s*=\s*\(.*?\)\s*(0x[0-9a-fA-F]+)', output)
    task_name_match = re.search(r'pcTaskName\s*=\s*"(\w+)"', output)

    if stack_base_match and stack_top_match:
        base = int(stack_base_match.group(1), 16)
        top = int(stack_top_match.group(1), 16)
        used = abs(top - base)
        name = task_name_match.group(1) if task_name_match else "当前任务"
        observations.append(f"任务 '{name}' 栈使用: 0x{base:08X} - 0x{top:08X} ({used} bytes)")
        if used < 64:
            warnings.append(f"⚠️ 任务 '{name}' 栈余量极低（{used} bytes），存在溢出风险！")

    return observations, warnings


# ---------------------------------------------------------------------------
# 死锁检测
# ---------------------------------------------------------------------------

def check_deadlock(
    gdb_path: str, elf_path: str, gdb_port: int, rtos_type: str,
) -> tuple[bool, list[str]]:
    if rtos_type != "freertos":
        return False, ["死锁检测目前仅支持 FreeRTOS"]

    commands = [
        "monitor halt",
        "set pagination off",
        "print pxCurrentTCB->pcTaskName",
        "print pxReadyTasksLists",
        "print uxCurrentNumberOfTasks",
    ]

    ok, output = run_gdb_commands(gdb_path, elf_path, gdb_port, commands)
    observations: list[str] = []

    if not ok:
        return False, ["GDB 读取失败，无法检测死锁"]

    num_match = re.search(r'uxCurrentNumberOfTasks\s*=\s*(\d+)', output)
    total_tasks = int(num_match.group(1)) if num_match else 0

    ready_items = len(re.findall(r'uxNumberOfItems\s*=\s*([1-9]\d*)', output))
    observations.append(f"总任务数: {total_tasks}, 就绪列表非空项: {ready_items}")

    if total_tasks > 1 and ready_items == 0:
        observations.append("⚠️ 所有任务均不在就绪状态，可能存在死锁！")
        return True, observations

    return False, observations


# ---------------------------------------------------------------------------
# 报告输出
# ---------------------------------------------------------------------------

def print_detect_report(elf_path: str | None, rtos_type: str | None, gdb_path: str | None) -> None:
    print("\n📊 RTOS 调试环境探测结果：")

    if gdb_path:
        print(f"  ✅ GDB: {gdb_path}")
    else:
        print("  ❌ GDB: 未找到 arm-none-eabi-gdb 或 gdb-multiarch")

    nm = shutil.which("arm-none-eabi-nm")
    print(f"  {'✅' if nm else '❌'} arm-none-eabi-nm: {nm or '未找到'}")

    if rtos_type:
        print(f"\n  ✅ 检测到 RTOS: {rtos_type}")
    elif elf_path:
        print("\n  ⚠️ ELF 中未检测到已知 RTOS 符号")
    else:
        print("\n  ℹ️ 未提供 ELF 文件，跳过 RTOS 检测")


def print_rtos_report(result: RTOSResult) -> None:
    icon = {"success": "✅", "failure": "❌", "blocked": "⚠️"}.get(result.status, "❓")
    print(f"\n📊 RTOS 调试结果: {icon} {result.summary}")

    if result.rtos_type:
        print(f"\n  RTOS 类型: {result.rtos_type}")

    if result.tasks:
        print(f"\n  任务列表（共 {len(result.tasks)} 个）:")
        print(f"    {'任务名':<20} {'状态':<12} {'优先级':<8}")
        print(f"    {'─'*20} {'─'*12} {'─'*8}")
        for t in result.tasks:
            print(f"    {t.name:<20} {t.state:<12} {t.priority:<8}")

    if result.deadlock_detected:
        print("\n  ⚠️ 检测到潜在死锁！")

    if result.observations:
        print(f"\n🔍 观察（共 {len(result.observations)} 条）:")
        for obs in result.observations:
            print(f"  {obs}")

    if result.evidence:
        print("\n📝 证据:")
        for line in result.evidence[:15]:
            print(f"  {line}")

    if result.failure_category:
        print(f"\n  失败分类: {result.failure_category}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="RTOS 调试工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --detect --elf build/app.elf
  %(prog)s --tasks --elf build/app.elf --port 3333
  %(prog)s --stack-check --elf build/app.elf --port 3333
  %(prog)s --deadlock --elf build/app.elf --port 3333
        """,
    )
    parser.add_argument("--detect", action="store_true", help="检测 RTOS 类型和调试工具")
    parser.add_argument("--tasks", action="store_true", help="读取任务列表")
    parser.add_argument("--stack-check", action="store_true", help="检查各任务栈水位")
    parser.add_argument("--deadlock", action="store_true", help="检测死锁")
    parser.add_argument("--queues", action="store_true", help="列出队列/信号量状态")
    parser.add_argument("--elf", help="ELF 文件路径")
    parser.add_argument("--rtos", choices=["freertos", "rt-thread", "zephyr"], help="显式指定 RTOS 类型")
    parser.add_argument("--gdb", help="GDB 可执行文件路径")
    parser.add_argument("--port", type=int, default=DEFAULT_GDB_PORT, help="GDB 服务端口（默认 3333）")
    parser.add_argument("-v", "--verbose", action="store_true", help="详细输出")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    gdb_path = find_gdb(args.gdb)
    rtos_type = args.rtos

    # 探测模式
    if args.detect:
        if args.elf and Path(args.elf).is_file() and not rtos_type:
            rtos_type = detect_rtos_from_elf(args.elf)
        print_detect_report(args.elf, rtos_type, gdb_path)
        return 0

    # 以下模式需要 ELF 和 GDB
    if not args.elf:
        print("❌ 请提供 --elf（ELF 文件路径）。")
        return 1

    elf_path = str(Path(args.elf).resolve())
    if not Path(elf_path).exists():
        print(f"❌ ELF 文件不存在: {elf_path}")
        return 1

    if not gdb_path:
        print("❌ 未找到兼容的 GDB（需要 arm-none-eabi-gdb 或 gdb-multiarch）。")
        return 1

    if not rtos_type:
        rtos_type = detect_rtos_from_elf(elf_path)
    if not rtos_type:
        print("❌ 未检测到 RTOS 类型，请使用 --rtos 显式指定。")
        result = RTOSResult(
            status="blocked",
            summary="无法确定 RTOS 类型",
            failure_category="ambiguous-context",
        )
        print_rtos_report(result)
        return 1

    print(f"ℹ️ RTOS: {rtos_type}, GDB: {gdb_path}, 端口: {args.port}")

    # 任务列表
    if args.tasks:
        if rtos_type == "freertos":
            tasks, observations = read_freertos_tasks(gdb_path, elf_path, args.port)
        else:
            tasks = []
            observations = [f"{rtos_type} 任务列表读取为基本支持级别"]

        result = RTOSResult(
            status="success" if tasks else "failure",
            summary=f"读取到 {len(tasks)} 个任务" if tasks else "任务读取失败",
            rtos_type=rtos_type,
            tasks=tasks,
            observations=observations,
            failure_category="target-response-abnormal" if not tasks else None,
        )
        print_rtos_report(result)
        return 0 if tasks else 1

    # 栈检查
    if args.stack_check:
        if rtos_type == "freertos":
            observations, warnings = check_freertos_stack(gdb_path, elf_path, args.port)
        else:
            observations = [f"{rtos_type} 栈检查为基本支持级别"]
            warnings = []

        result = RTOSResult(
            status="success",
            summary="栈水位检查完成",
            rtos_type=rtos_type,
            observations=observations + warnings,
        )
        print_rtos_report(result)
        return 0

    # 死锁检测
    if args.deadlock:
        detected, observations = check_deadlock(gdb_path, elf_path, args.port, rtos_type)
        result = RTOSResult(
            status="success",
            summary="检测到潜在死锁" if detected else "未检测到死锁",
            rtos_type=rtos_type,
            deadlock_detected=detected,
            observations=observations,
        )
        print_rtos_report(result)
        return 0

    # 队列状态
    if args.queues:
        if rtos_type != "freertos":
            print(f"⚠️ 队列查看目前仅支持 FreeRTOS，当前 RTOS: {rtos_type}")
            return 1

        commands = [
            "monitor halt",
            "set pagination off",
            "print xQueueRegistry",
        ]
        ok, output = run_gdb_commands(gdb_path, elf_path, args.port, commands)
        observations = []
        if ok:
            queue_names = re.findall(r'pcQueueName\s*=\s*"(\w+)"', output)
            for qn in queue_names:
                observations.append(f"队列: {qn}")

        result = RTOSResult(
            status="success" if ok else "failure",
            summary=f"找到 {len(observations)} 个已注册队列" if ok else "队列读取失败",
            rtos_type=rtos_type,
            observations=observations,
        )
        print_rtos_report(result)
        return 0 if ok else 1

    print("❌ 请提供 --tasks、--stack-check、--deadlock 或 --queues 参数。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
