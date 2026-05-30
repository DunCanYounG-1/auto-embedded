#!/usr/bin/env python
"""PlatformIO 调试工具。

为 `debug-platformio` skill 提供可重复调用的执行入口，支持：

- 探测 PlatformIO 调试环境和 debug_tool 配置
- 通过 pio debug 启动 GDB 调试会话
- 三种调试模式：download-and-halt、attach-only、crash-context
- 输出结构化的调试结果报告
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
import time
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
_BUILD_PIO_SCRIPTS = _SKILLS_DIR / "build-platformio" / "scripts"
if _BUILD_PIO_SCRIPTS.is_dir():
    sys.path.insert(0, str(_BUILD_PIO_SCRIPTS))
for _candidate in [_SKILLS_DIR / "shared", _SKILLS_DIR.parent / "shared"]:
    if (_candidate / "tool_config.py").exists():
        sys.path.insert(0, str(_candidate))
        break

from platformio_builder import (
    find_pio, get_pio_version, detect_environment,
    parse_platformio_ini, PIOEnvironment,
    scan_artifacts, resolve_build_dir,
)

DEBUG_MODES = ["download-and-halt", "attach-only", "crash-context"]


@dataclass
class DebugResult:
    status: str  # success, failure, blocked
    summary: str
    mode: str | None = None
    debug_cmd: str | None = None
    project_dir: str | None = None
    env_name: str | None = None
    board: str | None = None
    debug_tool: str | None = None
    elf_path: str | None = None
    observations: list[str] = field(default_factory=list)
    failure_category: str | None = None
    evidence: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# GDB 脚本生成
# ---------------------------------------------------------------------------

def generate_gdb_script(mode: str) -> str:
    lines: list[str] = []

    if mode == "download-and-halt":
        lines.extend([
            "monitor reset halt",
            "load",
            "monitor reset halt",
            "info registers",
            "backtrace",
            "quit",
        ])
    elif mode == "attach-only":
        lines.extend([
            "info registers",
            "backtrace",
            "info threads",
            "quit",
        ])
    elif mode == "crash-context":
        lines.extend([
            "monitor halt",
            "info registers",
            "backtrace full",
            "info threads",
            "print/x *((uint32_t*)0xE000ED28)",
            "print/x *((uint32_t*)0xE000ED2C)",
            "print/x *((uint32_t*)0xE000ED34)",
            "print/x *((uint32_t*)0xE000ED38)",
            "quit",
        ])

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# 调试执行
# ---------------------------------------------------------------------------

def run_pio_debug(
    pio_path: str,
    project_dir: str,
    env_name: str,
    gdb_script: str,
    verbose: bool,
) -> tuple[bool, str, list[str], list[str]]:
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".gdb", delete=False, encoding="utf-8",
    ) as f:
        f.write(gdb_script)
        script_path = f.name

    cmd = [
        pio_path, "debug",
        "--project-dir", project_dir,
        "--environment", env_name,
        "--interface", "gdb",
        "-x", script_path,
    ]
    cmd_str = " ".join(cmd)
    print(f"🔍 调试命令: {cmd_str}")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        return False, cmd_str, ["❌ 调试超时（60 秒）"], []
    except FileNotFoundError:
        return False, cmd_str, [f"❌ 未找到 pio: {pio_path}"], []
    finally:
        Path(script_path).unlink(missing_ok=True)

    output = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()
    evidence: list[str] = []
    observations: list[str] = []

    if verbose and output:
        evidence.extend(output.split("\n")[-30:])

    for line in output.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if any(reg in stripped.lower() for reg in ["sp ", "pc ", "lr ", "r0 ", "xpsr"]):
            observations.append(stripped)
        elif stripped.startswith("#"):
            observations.append(stripped)
        elif "$" in stripped and "0x" in stripped:
            observations.append(stripped)

    if result.returncode != 0:
        if stderr:
            evidence.extend(stderr.split("\n")[-10:])
        return False, cmd_str, evidence, observations

    print("✅ 调试会话完成")
    return True, cmd_str, evidence, observations


# ---------------------------------------------------------------------------
# 报告输出
# ---------------------------------------------------------------------------

def print_detect_report(env: dict[str, Any], env_info: PIOEnvironment | None) -> None:
    print("\n📊 PlatformIO 调试环境探测：")
    pio = env["pio"]
    status = "✅" if pio["available"] else "❌"
    ver = f" ({pio['version']})" if pio.get("version") else ""
    print(f"  {status} pio{ver}")
    if env_info:
        dt = env_info.debug_tool or "（未配置）"
        print(f"  调试工具: {dt}")
        print(f"  板卡: {env_info.board} | 平台: {env_info.platform}")


def print_debug_report(result: DebugResult) -> None:
    icon = {"success": "✅", "failure": "❌", "blocked": "⚠️"}.get(result.status, "❓")
    print(f"\n📊 调试结果: {icon} {result.summary}")

    if result.mode:
        print(f"\n  调试模式:   {result.mode}")
    if result.debug_cmd:
        print(f"  调试命令:   {result.debug_cmd}")
    if result.project_dir:
        print(f"  工程目录:   {result.project_dir}")
    if result.env_name:
        print(f"  环境:       {result.env_name}")
    if result.board:
        print(f"  板卡:       {result.board}")
    if result.debug_tool:
        print(f"  调试工具:   {result.debug_tool}")
    if result.elf_path:
        print(f"  ELF:        {result.elf_path}")

    if result.observations:
        print(f"\n🔍 关键观察（共 {len(result.observations)} 条）:")
        for obs in result.observations[:20]:
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
        description="PlatformIO 调试工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--detect", action="store_true", help="探测调试环境")
    parser.add_argument("--project-dir", help="PlatformIO 工程目录")
    parser.add_argument("--env", help="构建环境名称")
    parser.add_argument(
        "--mode", choices=DEBUG_MODES, default="download-and-halt",
        help="调试模式（默认 download-and-halt）",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="详细输出")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not args.project_dir and not args.detect:
        parser.print_help()
        return 1

    project_dir = Path(args.project_dir).resolve() if args.project_dir else None
    env_info: PIOEnvironment | None = None

    if project_dir and (project_dir / "platformio.ini").exists():
        envs, default_envs = parse_platformio_ini(project_dir)
        env_name = args.env or (default_envs[0] if default_envs else (envs[0].name if envs else None))
        env_info = next((e for e in envs if e.name == env_name), None)

    # 探测模式
    if args.detect:
        env = detect_environment()
        print_detect_report(env, env_info)
        return 0 if env["pio"]["available"] else 1

    # 调试模式
    if not project_dir or not (project_dir / "platformio.ini").exists():
        print("❌ 请提供有效的 --project-dir（包含 platformio.ini）。")
        return 1

    pio_path = find_pio()
    if not pio_path:
        print("❌ 未找到 pio，请先安装 PlatformIO。")
        return 1

    envs, default_envs = parse_platformio_ini(project_dir)
    if not envs:
        print("❌ platformio.ini 中未找到环境配置。")
        return 1

    env_name = args.env
    if not env_name:
        env_name = default_envs[0] if default_envs else envs[0].name
        print(f"ℹ️ 未指定环境，使用: {env_name}")

    env_info = next((e for e in envs if e.name == env_name), None)
    if not env_info:
        print(f"❌ 环境 '{env_name}' 不存在。可用: {', '.join(e.name for e in envs)}")
        return 1

    elf_path = None
    build_dir = resolve_build_dir(project_dir, env_name)
    artifacts = scan_artifacts(build_dir)
    elf_arts = [a for a in artifacts if a.kind == "elf"]
    if elf_arts:
        elf_path = str(elf_arts[0].path)

    print(f"📦 环境: {env_name} [{env_info.board}] ({env_info.platform})")
    if env_info.debug_tool:
        print(f"🔧 调试工具: {env_info.debug_tool}")

    script = generate_gdb_script(args.mode)
    ok, cmd_str, evidence, observations = run_pio_debug(
        pio_path, str(project_dir), env_name, script, args.verbose,
    )

    failure_category = None
    if not ok:
        for line in evidence:
            ll = line.lower()
            if "connection refused" in ll or "no device" in ll:
                failure_category = "connection-failure"
                break
            if "no debug" in ll or "not supported" in ll:
                failure_category = "debug-not-supported"
                break
        if not failure_category:
            failure_category = "debug-failure"

    result = DebugResult(
        status="success" if ok else "failure",
        summary=f"{args.mode} 会话{'完成' if ok else '失败'}",
        mode=args.mode,
        debug_cmd=cmd_str,
        project_dir=str(project_dir),
        env_name=env_name,
        board=env_info.board,
        debug_tool=env_info.debug_tool or None,
        elf_path=elf_path,
        observations=observations,
        failure_category=failure_category,
        evidence=evidence,
    )
    print_debug_report(result)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
