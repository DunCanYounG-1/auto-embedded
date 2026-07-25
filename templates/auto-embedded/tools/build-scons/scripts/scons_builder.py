#!/usr/bin/env python
"""RT-Thread scons 构建工具。

为 `build-scons` skill 提供可重复调用的执行入口，支持：

- 探测构建环境（scons、交叉编译器）
- 识别 RT-Thread scons 工程（SConstruct + rtconfig.py）
- 解析 rtconfig.py 变量（CROSS_TOOL、EXEC_PATH、PREFIX 等）
- 执行 scons 构建并定位固件产物（rtthread.elf / rtthread.bin）
- 在工程根搜索 ELF、BIN、HEX 产物并按优先级排序
- 输出结构化的构建结果和分析报告

交互式命令（scons --menuconfig / pkgs --update / scons --target=...）不由本脚本
自动执行，需用户手动运行；本脚本只做非交互的探测、构建、清理与产物扫描。
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
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


ARTIFACT_PRIORITY = {"elf": 1, "bin": 2, "hex": 3}
ARTIFACT_EXTENSIONS = {".elf": "elf", ".bin": "bin", ".hex": "hex", ".axf": "elf"}
SCONS_NAMES = ["scons"]
# RT-Thread 工程根的标志文件（两者齐全才算 scons BSP 工程）
PROJECT_MARKERS = ["SConstruct", "rtconfig.py"]
# rtconfig.py 的 CROSS_TOOL → 工具链家族
CROSS_TOOL_MAP = {
    "gcc": "gnu",
    "keil": "armcc",
    "iar": "iar",
}
# 编译器前缀 → 架构家族
PREFIX_MAP = {
    "arm-none-eabi-": "gnu-arm",
    "arm-linux-gnueabihf-": "gnu-arm-linux",
    "riscv32-unknown-elf-": "gnu-riscv",
    "riscv64-unknown-elf-": "gnu-riscv",
    "riscv-none-embed-": "gnu-riscv",
    "riscv-none-elf-": "gnu-riscv",
    "xtensa-esp32-elf-": "gnu-esp",
    "aarch64-none-elf-": "gnu-aarch64",
}


@dataclass
class ToolInfo:
    name: str
    path: str | None
    version: str | None


@dataclass
class RtconfigInfo:
    path: Path
    variables: dict[str, str] = field(default_factory=dict)
    cross_tool: str | None = None
    exec_path: str | None = None
    prefix: str | None = None
    toolchain_family: str | None = None


@dataclass
class Artifact:
    path: Path
    kind: str
    size: int


@dataclass
class BuildResult:
    status: str  # success, failure, blocked
    summary: str
    build_cmd: str | None = None
    build_dir: str | None = None
    artifacts: list[Artifact] = field(default_factory=list)
    primary_artifact: Artifact | None = None
    failure_category: str | None = None
    evidence: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 工具探测
# ---------------------------------------------------------------------------

def _get_version(executable: str, args: list[str] | None = None) -> str | None:
    try:
        result = subprocess.run(
            [executable] + (args or ["--version"]),
            capture_output=True, text=True, timeout=10,
        )
        first_line = (result.stdout or result.stderr).strip().split("\n")[0]
        return first_line if first_line else None
    except Exception:
        return None


def find_tool(name: str, alt_names: list[str] | None = None) -> ToolInfo:
    configured = get_tool_path(name)
    if configured:
        configured_path = shutil.which(configured) or configured
        if Path(configured_path).exists():
            version = _get_version(configured_path)
            return ToolInfo(name=name, path=configured_path, version=version)

    candidates = [name] + (alt_names or [])
    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            version = _get_version(path)
            return ToolInfo(name=candidate, path=path, version=version)
    return ToolInfo(name=name, path=None, version=None)


def find_scons() -> ToolInfo:
    configured = get_tool_path("scons")
    if configured:
        configured_path = shutil.which(configured) or configured
        if Path(configured_path).exists():
            version = _get_version(configured_path, ["--version"])
            return ToolInfo(name="scons", path=configured_path, version=version)

    for name in SCONS_NAMES:
        path = shutil.which(name)
        if path:
            version = _get_version(path, ["--version"])
            return ToolInfo(name=name, path=path, version=version)
    return ToolInfo(name="scons", path=None, version=None)


def detect_environment() -> dict[str, Any]:
    scons = find_scons()
    arm_gcc = find_tool("arm-none-eabi-gcc")
    riscv_gcc = find_tool("riscv64-unknown-elf-gcc", ["riscv-none-embed-gcc", "riscv-none-elf-gcc"])

    return {
        "scons": {"available": scons.path is not None, "path": scons.path, "version": scons.version},
        "arm_gcc": {"available": arm_gcc.path is not None, "path": arm_gcc.path, "version": arm_gcc.version},
        "riscv_gcc": {"available": riscv_gcc.path is not None, "path": riscv_gcc.path, "version": riscv_gcc.version},
    }


# ---------------------------------------------------------------------------
# RT-Thread 工程发现与 rtconfig.py 解析
# ---------------------------------------------------------------------------

def is_rtt_project(directory: Path) -> bool:
    return all((directory / marker).exists() for marker in PROJECT_MARKERS)


def find_projects(workspace: Path, max_depth: int = 2) -> list[Path]:
    """在 workspace 下按深度搜索含 SConstruct + rtconfig.py 的工程根。"""
    results: list[tuple[int, Path]] = []
    for root, _dirs, files in os.walk(workspace):
        depth = str(root).replace(str(workspace), "").count(os.sep)
        if depth > max_depth:
            continue
        if "SConstruct" in files and "rtconfig.py" in files:
            results.append((depth, Path(root)))
    results.sort(key=lambda x: x[0])
    return [p for _, p in results]


def parse_rtconfig(rtconfig_path: Path) -> RtconfigInfo:
    info = RtconfigInfo(path=rtconfig_path)

    try:
        text = rtconfig_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return info

    # 提取形如 VAR = '...' / VAR = "..." / VAR = r'...' 的赋值（rtconfig.py 是 Python 脚本；
    # EXEC_PATH 常写成 raw string r'C:\...' 以容纳 Windows 反斜杠路径，故允许可选 r/b 前缀）
    var_pattern = re.compile(r"^\s*(\w+)\s*=\s*[rRbB]?['\"]([^'\"]*)['\"]", re.MULTILINE)
    for m in var_pattern.finditer(text):
        info.variables[m.group(1)] = m.group(2).strip()

    info.cross_tool = info.variables.get("CROSS_TOOL")
    info.exec_path = info.variables.get("EXEC_PATH")
    info.prefix = info.variables.get("PREFIX")

    # 推断工具链家族：优先看编译器前缀，其次看 CROSS_TOOL
    prefix = info.prefix or ""
    if prefix:
        for known_prefix, family in PREFIX_MAP.items():
            if prefix.startswith(known_prefix) or prefix == known_prefix:
                info.toolchain_family = family
                break
    if not info.toolchain_family and info.cross_tool:
        info.toolchain_family = CROSS_TOOL_MAP.get(info.cross_tool.lower())

    return info


# ---------------------------------------------------------------------------
# 产物扫描
# ---------------------------------------------------------------------------

def scan_artifacts(search_dir: Path) -> list[Artifact]:
    if not search_dir.exists():
        return []

    artifacts: list[Artifact] = []
    seen: set[str] = set()
    for root, _dirs, files in os.walk(search_dir):
        for fname in files:
            ext = Path(fname).suffix.lower()
            kind = ARTIFACT_EXTENSIONS.get(ext)
            if not kind:
                continue
            fpath = Path(root) / fname
            real = str(fpath.resolve())
            if real in seen:
                continue
            seen.add(real)
            try:
                size = fpath.stat().st_size
            except OSError:
                size = 0
            if size < 256:
                continue
            artifacts.append(Artifact(path=fpath, kind=kind, size=size))

    # RT-Thread 默认产物名 rtthread.* 优先靠前
    def _rank(a: Artifact) -> tuple[int, int, int]:
        name_bonus = 0 if a.path.stem.lower() == "rtthread" else 1
        return (ARTIFACT_PRIORITY.get(a.kind, 9), name_bonus, -a.size)

    artifacts.sort(key=_rank)
    return artifacts


def pick_primary_artifact(artifacts: list[Artifact]) -> Artifact | None:
    if not artifacts:
        return None
    return artifacts[0]


# ---------------------------------------------------------------------------
# 构建执行
# ---------------------------------------------------------------------------

def run_scons_build(
    source_dir: Path,
    scons_cmd: str,
    jobs: int | None = None,
    verbose: bool = False,
    extra_args: list[str] | None = None,
) -> tuple[bool, str, list[str]]:
    cmd: list[str] = [scons_cmd, "-C", str(source_dir)]

    if jobs:
        cmd.extend(["-j", str(jobs)])
    if verbose:
        cmd.append("verbose=1")
    if extra_args:
        cmd.extend(extra_args)

    cmd_str = " ".join(cmd)
    print(f"🔨 构建命令: {cmd_str}")

    start = time.time()
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=1200,
        )
    except subprocess.TimeoutExpired:
        return False, cmd_str, ["❌ 构建超时（1200 秒）"]
    except FileNotFoundError:
        return False, cmd_str, [f"❌ 未找到 {scons_cmd} 命令"]

    elapsed = time.time() - start
    evidence: list[str] = []
    output = (result.stdout + "\n" + result.stderr).strip()

    if result.returncode != 0:
        last_lines = output.split("\n")[-30:]
        evidence.append("构建失败输出（末尾）:")
        evidence.extend(last_lines)
        return False, cmd_str, evidence

    print(f"✅ 构建成功（耗时 {elapsed:.1f} 秒）")
    evidence.append(f"构建耗时: {elapsed:.1f} 秒")
    return True, cmd_str, evidence


def run_scons_clean(source_dir: Path, scons_cmd: str) -> tuple[bool, str]:
    cmd = [scons_cmd, "-C", str(source_dir), "-c"]
    cmd_str = " ".join(cmd)
    print(f"🗑️ 清理命令: {cmd_str}")
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return True, cmd_str
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("  ⚠️ scons -c 失败（可忽略）")
        return False, cmd_str


# ---------------------------------------------------------------------------
# 报告输出
# ---------------------------------------------------------------------------

def print_detect_report(env: dict[str, Any], project: Path | None, rtconfig: RtconfigInfo | None) -> None:
    print("\n📊 构建环境探测结果：")
    for tool_name in ["scons", "arm_gcc", "riscv_gcc"]:
        info = env[tool_name]
        status = "✅" if info["available"] else "❌"
        ver = f" ({info['version']})" if info.get("version") else ""
        path = f" @ {info['path']}" if info.get("path") else ""
        print(f"  {status} {tool_name}{ver}{path}")

    if project is not None:
        print(f"\n📁 RT-Thread 工程根: {project}")
    if rtconfig is not None:
        print(f"\n📄 rtconfig.py 解析结果: {rtconfig.path}")
        print(f"  CROSS_TOOL:   {rtconfig.cross_tool or '(未设置)'}")
        print(f"  PREFIX:       {rtconfig.prefix or '(未设置)'}")
        print(f"  EXEC_PATH:    {rtconfig.exec_path or '(未设置)'}")
        print(f"  工具链家族:   {rtconfig.toolchain_family or '(未知)'}")
        rtt_root = os.environ.get("RTT_ROOT")
        print(f"  RTT_ROOT(env):{rtt_root or '(未设置，rtconfig.py 内可能有默认值)'}")


def print_build_report(result: BuildResult) -> None:
    status_icon = {"success": "✅", "failure": "❌", "blocked": "⚠️"}.get(result.status, "❓")
    print(f"\n📊 构建结果: {status_icon} {result.summary}")

    if result.build_cmd:
        print(f"\n  构建命令: {result.build_cmd}")
    if result.build_dir:
        print(f"  工程根: {result.build_dir}")

    if result.artifacts:
        print(f"\n📦 找到 {len(result.artifacts)} 个固件产物：")
        for i, a in enumerate(result.artifacts):
            size_kb = a.size / 1024
            primary = " ⭐ 首选" if a == result.primary_artifact else ""
            print(f"  {i + 1}. [{a.kind.upper()}] {a.path} ({size_kb:.1f} KB){primary}")
    elif result.status == "success":
        print("\n  ⚠️ 构建成功但未找到固件产物")

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
        description="RT-Thread scons 构建工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --detect --source /repo/rtt-bsp
  %(prog)s --parse-rtconfig --source /repo/rtt-bsp
  %(prog)s --source /repo/rtt-bsp
  %(prog)s --source /repo/rtt-bsp --clean -j 8
  %(prog)s --scan-artifacts /repo/rtt-bsp

注意: scons --menuconfig / pkgs --update / scons --target=mdk5 等交互式命令
      不由本脚本执行，请用户手动运行。
        """,
    )
    parser.add_argument("--detect", action="store_true", help="探测构建环境 + 识别工程")
    parser.add_argument("--source", help="RT-Thread 工程根（含 SConstruct + rtconfig.py），或待搜索的工作区")
    parser.add_argument("--parse-rtconfig", action="store_true", help="解析并显示 rtconfig.py 变量（不构建）")
    parser.add_argument("--scan-artifacts", help="仅扫描指定目录中的产物")
    parser.add_argument("--clean", action="store_true", help="构建前执行 scons -c")
    parser.add_argument("--extra-args", action="append", default=[], help="传递给 scons 的额外参数（可重复）")
    parser.add_argument("--save-config", action="store_true", help="探测成功后保存工具路径到配置")
    parser.add_argument("-v", "--verbose", action="store_true", help="详细构建输出（verbose=1）")
    parser.add_argument("-j", "--jobs", type=int, help="并行构建任务数")
    return parser


def _resolve_project_root(source_dir: Path) -> tuple[Path | None, list[Path]]:
    """返回 (选定工程根, 全部候选)。source_dir 本身是工程根时直接用它。"""
    if is_rtt_project(source_dir):
        return source_dir, [source_dir]
    candidates = find_projects(source_dir, max_depth=2)
    if not candidates:
        return None, []
    return candidates[0], candidates


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    # 环境探测模式
    if args.detect:
        env = detect_environment()
        project: Path | None = None
        rtconfig: RtconfigInfo | None = None
        if args.source:
            src = Path(args.source).resolve()
            project, _ = _resolve_project_root(src)
            if project is not None:
                rtconfig = parse_rtconfig(project / "rtconfig.py")
        print_detect_report(env, project, rtconfig)
        if args.save_config and env["scons"]["available"]:
            cfg_path = set_tool_path("scons", env["scons"]["path"])
            print(f"  💾 scons 已保存到 {cfg_path}")
        return 0 if env["scons"]["available"] else 1

    # 仅扫描产物模式
    if args.scan_artifacts:
        scan_dir = Path(args.scan_artifacts).resolve()
        artifacts = scan_artifacts(scan_dir)
        if not artifacts:
            print(f"❌ 在 {scan_dir} 中未找到固件产物")
            return 1
        primary = pick_primary_artifact(artifacts)
        result = BuildResult(
            status="success",
            summary=f"找到 {len(artifacts)} 个产物",
            build_dir=str(scan_dir),
            artifacts=artifacts,
            primary_artifact=primary,
        )
        print_build_report(result)
        return 0

    # 需要源码目录
    if not args.source:
        print("❌ 请提供 --source（RT-Thread 工程根或工作区）。")
        return 1

    source_dir = Path(args.source).resolve()
    if not source_dir.exists():
        print(f"❌ 源目录不存在: {source_dir}")
        return 1

    project_root, candidates = _resolve_project_root(source_dir)
    if project_root is None:
        print(f"❌ 在 {source_dir} 中未找到 RT-Thread scons 工程（需 SConstruct + rtconfig.py）")
        return 1
    if len(candidates) > 1:
        print(f"⚠️ 找到多个候选工程根，使用: {project_root}")
        for c in candidates:
            print(f"   - {c}")

    # 解析 rtconfig.py 模式
    if args.parse_rtconfig:
        rtconfig = parse_rtconfig(project_root / "rtconfig.py")
        print(f"\n📄 rtconfig.py 解析结果: {rtconfig.path}")
        print(f"  CROSS_TOOL:   {rtconfig.cross_tool or '(未设置)'}")
        print(f"  PREFIX:       {rtconfig.prefix or '(未设置)'}")
        print(f"  EXEC_PATH:    {rtconfig.exec_path or '(未设置)'}")
        print(f"  工具链家族:   {rtconfig.toolchain_family or '(未知)'}")
        return 0

    # 检查 scons 是否可用
    scons_info = find_scons()
    if not scons_info.path:
        print("❌ 未找到 scons，请先安装 scons / RT-Thread env 工具。")
        return 1

    # 构建模式
    if args.clean:
        run_scons_clean(project_root, scons_info.path)

    ok, bld_cmd, evidence = run_scons_build(
        source_dir=project_root,
        scons_cmd=scons_info.path,
        jobs=args.jobs,
        verbose=args.verbose,
        extra_args=args.extra_args,
    )

    if not ok:
        result = BuildResult(
            status="failure",
            summary="scons 构建失败",
            build_cmd=bld_cmd,
            build_dir=str(project_root),
            failure_category="project-config-error",
            evidence=evidence,
        )
        print_build_report(result)
        return 1

    # 扫描产物（RT-Thread 默认输出在工程根）
    artifacts = scan_artifacts(project_root)
    primary = pick_primary_artifact(artifacts)

    if not artifacts:
        result = BuildResult(
            status="success",
            summary="构建成功但未找到固件产物",
            build_cmd=bld_cmd,
            build_dir=str(project_root),
            artifacts=[],
            failure_category="artifact-missing",
            evidence=evidence,
        )
        print_build_report(result)
        return 1

    result = BuildResult(
        status="success",
        summary=f"构建成功，找到 {len(artifacts)} 个产物",
        build_cmd=bld_cmd,
        build_dir=str(project_root),
        artifacts=artifacts,
        primary_artifact=primary,
        evidence=evidence,
    )
    print_build_report(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
