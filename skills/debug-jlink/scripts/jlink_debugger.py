#!/usr/bin/env python3
"""SEGGER J-Link GDB 调试工具。

为 `debug-jlink` skill 提供可重复调用的执行入口，支持：

- 探测 JLinkGDBServer 和 GDB 环境
- 启动 JLinkGDBServer 后台进程
- 三种调试模式：download-and-halt、attach-only、crash-context
- SWO 输出捕获
- 输出结构化的调试结果报告
"""

from __future__ import annotations

import argparse
import platform
import shutil
import socket
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
for _candidate in [_SKILLS_DIR / "shared", _SKILLS_DIR.parent / "shared"]:
    if (_candidate / "tool_config.py").exists():
        sys.path.insert(0, str(_candidate))
        break
from tool_config import get_tool_path, set_tool_path


GDB_CANDIDATES = ["arm-none-eabi-gdb", "gdb-multiarch"]
DEBUG_MODES = ["download-and-halt", "attach-only", "crash-context"]
DEFAULT_GDB_PORT = 2331


@dataclass
class DebugResult:
    status: str  # success, failure, blocked
    summary: str
    mode: str | None = None
    gdbserver_cmd: str | None = None
    gdb_cmd: str | None = None
    gdb_executable: str | None = None
    elf_path: str | None = None
    observations: list[str] = field(default_factory=list)
    failure_category: str | None = None
    evidence: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 工具探测
# ---------------------------------------------------------------------------

def _gdbserver_candidates() -> list[str]:
    candidates = []
    configured = get_tool_path("jlink-gdbserver")
    if configured:
        candidates.append(configured)

    if platform.system() == "Windows":
        candidates.append("JLinkGDBServerCL.exe")
        for prog_dir in [
            "C:\\Program Files\\SEGGER\\JLink",
            "C:\\Program Files (x86)\\SEGGER\\JLink",
        ]:
            candidates.append(str(Path(prog_dir) / "JLinkGDBServerCL.exe"))
    else:
        candidates.append("JLinkGDBServerCLExe")
        candidates.append("/opt/SEGGER/JLink/JLinkGDBServerCLExe")

    return candidates


def find_gdbserver() -> str | None:
    for candidate in _gdbserver_candidates():
        path = shutil.which(candidate)
        if path:
            return path
        if Path(candidate).is_file():
            return candidate
    return None


def find_gdb(explicit: str | None) -> tuple[str | None, str | None]:
    if explicit:
        path = shutil.which(explicit) or explicit
        try:
            r = subprocess.run(
                [path, "--version"], capture_output=True, text=True, timeout=5,
            )
            ver = (r.stdout or r.stderr).strip().split("\n")[0]
        except Exception:
            ver = None
        return path, ver

    configured = get_tool_path("arm-none-eabi-gdb")
    if configured:
        configured_path = shutil.which(configured) or configured
        if Path(configured_path).exists():
            try:
                r = subprocess.run(
                    [configured_path, "--version"], capture_output=True, text=True, timeout=5,
                )
                ver = (r.stdout or r.stderr).strip().split("\n")[0]
            except Exception:
                ver = None
            return configured_path, ver

    for candidate in GDB_CANDIDATES:
        path = shutil.which(candidate)
        if path:
            try:
                r = subprocess.run(
                    [path, "--version"], capture_output=True, text=True, timeout=5,
                )
                ver = (r.stdout or r.stderr).strip().split("\n")[0]
            except Exception:
                ver = None
            return path, ver
    return None, None


def detect_environment(explicit_gdb: str | None) -> dict[str, Any]:
    gdbserver = find_gdbserver()
    gdb_path, gdb_ver = find_gdb(explicit_gdb)
    return {
        "jlink_gdbserver": {"available": gdbserver is not None, "path": gdbserver},
        "gdb": {"available": gdb_path is not None, "path": gdb_path, "version": gdb_ver},
    }


# ---------------------------------------------------------------------------
# JLinkGDBServer 管理
# ---------------------------------------------------------------------------

def wait_for_port(port: int, timeout: float = 10) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.2)
    return False


def start_gdbserver(
    gdbserver: str,
    device: str,
    interface: str,
    speed: int,
    port: int,
    swo: bool,
) -> tuple[subprocess.Popen | None, str]:
    cmd = [
        gdbserver,
        "-device", device,
        "-if", interface,
        "-speed", str(speed),
        "-port", str(port),
        "-nogui",
        "-singlerun",
    ]
    if swo:
        cmd.extend(["-swoport", str(port + 1)])

    cmd_str = " ".join(cmd)
    print(f"🔧 启动 JLinkGDBServer: {cmd_str}")

    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        print(f"❌ 未找到 JLinkGDBServer: {gdbserver}")
        return None, cmd_str

    if wait_for_port(port):
        print(f"✅ JLinkGDBServer 已就绪，GDB 端口: {port}")
        return proc, cmd_str

    ret = proc.poll()
    if ret is not None:
        stderr = proc.stderr.read().decode(errors="ignore") if proc.stderr else ""
        print(f"❌ JLinkGDBServer 启动失败 (exit {ret})")
        if stderr.strip():
            for line in stderr.strip().split("\n")[-10:]:
                print(f"  {line}")
    else:
        print("❌ JLinkGDBServer 启动超时，GDB 端口未就绪")
        proc.terminate()

    return None, cmd_str


# ---------------------------------------------------------------------------
# GDB 脚本生成与执行
# ---------------------------------------------------------------------------

def generate_gdb_script(mode: str, elf_path: str, gdb_port: int) -> str:
    elf_posix = elf_path.replace("\\", "/")
    lines: list[str] = [
        f"file {elf_posix}",
        f"target extended-remote localhost:{gdb_port}",
    ]

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
            "print/x *((uint32_t*)0xE000ED28)",  # CFSR
            "print/x *((uint32_t*)0xE000ED2C)",  # HFSR
            "print/x *((uint32_t*)0xE000ED34)",  # MMFAR
            "print/x *((uint32_t*)0xE000ED38)",  # BFAR
            "quit",
        ])

    return "\n".join(lines) + "\n"


def run_gdb(
    gdb_path: str,
    script_content: str,
    verbose: bool,
) -> tuple[bool, list[str], list[str]]:
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".gdb", delete=False, encoding="utf-8",
    ) as f:
        f.write(script_content)
        script_path = f.name

    cmd = [gdb_path, "--batch", "-x", script_path]
    cmd_str = " ".join(cmd)
    print(f"🔍 GDB 命令: {cmd_str}")

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30,
        )
    except subprocess.TimeoutExpired:
        return False, ["❌ GDB 执行超时（30 秒）"], []
    except FileNotFoundError:
        return False, [f"❌ 未找到 GDB: {gdb_path}"], []
    finally:
        Path(script_path).unlink(missing_ok=True)

    output = (result.stdout or "").strip()
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
        stderr = (result.stderr or "").strip()
        if stderr:
            evidence.extend(stderr.split("\n")[-10:])
        return False, evidence, observations

    print("✅ GDB 会话完成")
    return True, evidence, observations


# ---------------------------------------------------------------------------
# 报告输出
# ---------------------------------------------------------------------------

def print_detect_report(env: dict[str, Any]) -> None:
    print("\n📊 J-Link 调试环境探测结果：")
    gdbserver = env["jlink_gdbserver"]
    status = "✅" if gdbserver["available"] else "❌"
    path = f" @ {gdbserver['path']}" if gdbserver.get("path") else ""
    print(f"  {status} JLinkGDBServer{path}")

    gdb = env["gdb"]
    status = "✅" if gdb["available"] else "❌"
    ver = f" ({gdb['version']})" if gdb.get("version") else ""
    path = f" @ {gdb['path']}" if gdb.get("path") else ""
    print(f"  {status} GDB{ver}{path}")


def print_debug_report(result: DebugResult) -> None:
    icon = {"success": "✅", "failure": "❌", "blocked": "⚠️"}.get(result.status, "❓")
    print(f"\n📊 调试结果: {icon} {result.summary}")

    if result.mode:
        print(f"\n  调试模式:       {result.mode}")
    if result.gdbserver_cmd:
        print(f"  JLinkGDBServer: {result.gdbserver_cmd}")
    if result.gdb_executable:
        print(f"  GDB:            {result.gdb_executable}")
    if result.elf_path:
        print(f"  ELF:            {result.elf_path}")

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
        description="SEGGER J-Link GDB 调试工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --detect
  %(prog)s --elf build/app.elf --device STM32F407VG
  %(prog)s --elf build/app.elf --device STM32F407VG --mode attach-only
  %(prog)s --elf build/app.elf --device STM32F407VG --mode crash-context --swo
        """,
    )
    parser.add_argument("--detect", action="store_true", help="探测 J-Link 调试环境")
    parser.add_argument("--elf", help="带符号的 ELF 文件路径")
    parser.add_argument("--device", help="目标芯片型号（如 STM32F407VG）")
    parser.add_argument(
        "--mode", choices=DEBUG_MODES, default="download-and-halt",
        help="调试模式（默认 download-and-halt）",
    )
    parser.add_argument("--gdb", help="GDB 可执行文件路径")
    parser.add_argument("--interface", choices=["SWD", "JTAG"], default="SWD", help="调试接口（默认 SWD）")
    parser.add_argument("--speed", type=int, default=4000, help="通信速度 kHz（默认 4000）")
    parser.add_argument("--port", type=int, default=DEFAULT_GDB_PORT, help="GDB 服务端口（默认 2331）")
    parser.add_argument("--swo", action="store_true", help="启用 SWO 输出捕获")
    parser.add_argument("--save-config", action="store_true", help="探测成功后保存工具路径到配置")
    parser.add_argument("-v", "--verbose", action="store_true", help="详细输出")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    # 探测模式
    if args.detect:
        env = detect_environment(args.gdb)
        print_detect_report(env)
        if args.save_config:
            if env["jlink_gdbserver"]["available"]:
                cfg_path = set_tool_path("jlink-gdbserver", env["jlink_gdbserver"]["path"])
                print(f"  💾 JLinkGDBServer 已保存到 {cfg_path}")
            if env["gdb"]["available"]:
                cfg_path = set_tool_path("arm-none-eabi-gdb", env["gdb"]["path"])
                print(f"  💾 GDB 已保存到 {cfg_path}")
        ok = env["jlink_gdbserver"]["available"] and env["gdb"]["available"]
        return 0 if ok else 1

    # 调试模式
    if not args.elf:
        print("❌ 请提供 --elf（带符号的 ELF 文件路径）。")
        return 1

    if not args.device:
        print("❌ J-Link 调试需要 --device 参数（如 STM32F407VG）。")
        return 1

    elf_path = str(Path(args.elf).resolve())
    if not Path(elf_path).exists():
        print(f"❌ ELF 文件不存在: {elf_path}")
        return 1
    print(f"📦 ELF: {elf_path}")

    # 检查工具
    gdbserver = find_gdbserver()
    if not gdbserver:
        print("❌ 未找到 JLinkGDBServerCLExe，请先安装 SEGGER J-Link。")
        return 1

    gdb_path, _ = find_gdb(args.gdb)
    if not gdb_path:
        print("❌ 未找到兼容的 GDB（需要 arm-none-eabi-gdb 或 gdb-multiarch）。")
        return 1
    print(f"ℹ️ 使用 GDB: {gdb_path}")

    # 启动 JLinkGDBServer
    proc, gdbserver_cmd = start_gdbserver(
        gdbserver, args.device, args.interface, args.speed, args.port, args.swo,
    )
    if proc is None:
        result = DebugResult(
            status="failure",
            summary="JLinkGDBServer 启动失败",
            mode=args.mode,
            gdbserver_cmd=gdbserver_cmd,
            gdb_executable=gdb_path,
            elf_path=elf_path,
            failure_category="connection-failure",
        )
        print_debug_report(result)
        return 1

    # 执行 GDB
    try:
        script = generate_gdb_script(args.mode, elf_path, args.port)
        ok, evidence, observations = run_gdb(gdb_path, script, args.verbose)

        failure_category = None
        if not ok:
            for line in evidence:
                ll = line.lower()
                if "connection refused" in ll or "remote communication error" in ll:
                    failure_category = "connection-failure"
                    break
                if "no symbol" in ll or "not in executable" in ll:
                    failure_category = "project-config-error"
                    break
            if not failure_category:
                failure_category = "target-response-abnormal"

        result = DebugResult(
            status="success" if ok else "failure",
            summary=f"{args.mode} 会话{'完成' if ok else '失败'}",
            mode=args.mode,
            gdbserver_cmd=gdbserver_cmd,
            gdb_cmd=f"{gdb_path} --batch -x <script>",
            gdb_executable=gdb_path,
            elf_path=elf_path,
            observations=observations,
            failure_category=failure_category,
            evidence=evidence,
        )
        print_debug_report(result)
        return 0 if ok else 1

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("🔌 JLinkGDBServer 已关闭")


if __name__ == "__main__":
    sys.exit(main())
