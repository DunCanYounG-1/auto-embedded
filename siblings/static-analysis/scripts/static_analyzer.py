#!/usr/bin/env python3
"""嵌入式 C/C++ 静态分析工具。

为 `static-analysis` skill 提供可重复调用的执行入口，支持：

- 探测 cppcheck、clang-tidy、GCC analyzer 可用性
- 运行 cppcheck 分析并解析 XML 输出
- 运行 clang-tidy 分析并解析输出
- 运行 GCC -fanalyzer 路径敏感分析
- MISRA-C 2012 合规检查（通过 cppcheck addon）
- 按严重级别分组输出结果
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

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

SEVERITY_ORDER = ["error", "warning", "style", "performance", "portability", "information"]


@dataclass
class Finding:
    file: str
    line: int
    column: int
    severity: str
    message: str
    rule_id: str = ""
    tool: str = ""


@dataclass
class AnalysisResult:
    tool: str
    findings: list[Finding] = field(default_factory=list)
    summary: dict[str, int] = field(default_factory=dict)
    command: str = ""


# ---------------------------------------------------------------------------
# 工具探测
# ---------------------------------------------------------------------------

def detect_tools() -> dict[str, Any]:
    tools: dict[str, Any] = {}

    # cppcheck
    cppcheck = shutil.which("cppcheck") or get_tool_path("cppcheck")
    if cppcheck:
        try:
            r = subprocess.run(
                [cppcheck, "--version"], capture_output=True, text=True, timeout=5,
            )
            ver = r.stdout.strip()
            tools["cppcheck"] = {"available": True, "path": cppcheck, "version": ver}
        except Exception:
            tools["cppcheck"] = {"available": True, "path": cppcheck, "version": None}
    else:
        tools["cppcheck"] = {"available": False}

    # clang-tidy
    clang_tidy = shutil.which("clang-tidy") or get_tool_path("clang-tidy")
    if clang_tidy:
        try:
            r = subprocess.run(
                [clang_tidy, "--version"], capture_output=True, text=True, timeout=5,
            )
            ver = r.stdout.strip().split("\n")[0]
            tools["clang-tidy"] = {"available": True, "path": clang_tidy, "version": ver}
        except Exception:
            tools["clang-tidy"] = {"available": True, "path": clang_tidy, "version": None}
    else:
        tools["clang-tidy"] = {"available": False}

    # GCC analyzer
    gcc = shutil.which("arm-none-eabi-gcc") or shutil.which("gcc") or get_tool_path("arm-none-eabi-gcc")
    if gcc:
        try:
            r = subprocess.run(
                [gcc, "--version"], capture_output=True, text=True, timeout=5,
            )
            ver_line = r.stdout.strip().split("\n")[0]
            ver_match = re.search(r"(\d+)\.\d+\.\d+", ver_line)
            major = int(ver_match.group(1)) if ver_match else 0
            tools["gcc-analyzer"] = {
                "available": major >= 12,
                "path": gcc,
                "version": ver_line,
                "major": major,
            }
        except Exception:
            tools["gcc-analyzer"] = {"available": False}
    else:
        tools["gcc-analyzer"] = {"available": False}

    return tools


# ---------------------------------------------------------------------------
# cppcheck
# ---------------------------------------------------------------------------

def run_cppcheck(
    source_dir: str,
    misra: bool = False,
    compile_db: str | None = None,
    severity: str = "style",
) -> AnalysisResult:
    cppcheck = shutil.which("cppcheck") or get_tool_path("cppcheck") or "cppcheck"

    cmd = [cppcheck, "--xml", "--xml-version=2", f"--enable={severity}"]

    if compile_db:
        cmd.extend([f"--project={compile_db}"])
    else:
        cmd.append(source_dir)

    if misra:
        cmd.append("--addon=misra")

    cmd_str = " ".join(cmd)
    print(f"🔍 运行 cppcheck: {cmd_str}")

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300,
        )
    except subprocess.TimeoutExpired:
        return AnalysisResult(tool="cppcheck", command=cmd_str)
    except FileNotFoundError:
        return AnalysisResult(tool="cppcheck", command=cmd_str)

    # cppcheck XML 输出在 stderr
    xml_output = result.stderr
    findings = _parse_cppcheck_xml(xml_output)

    summary: dict[str, int] = {}
    for f in findings:
        summary[f.severity] = summary.get(f.severity, 0) + 1

    return AnalysisResult(
        tool="cppcheck",
        findings=findings,
        summary=summary,
        command=cmd_str,
    )


def _parse_cppcheck_xml(xml_text: str) -> list[Finding]:
    findings: list[Finding] = []
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        # 尝试提取 <results> 部分
        m = re.search(r"(<results.*?</results>)", xml_text, re.DOTALL)
        if not m:
            return findings
        try:
            root = ElementTree.fromstring(m.group(1))
        except ElementTree.ParseError:
            return findings

    for error in root.iter("error"):
        severity = error.get("severity", "")
        msg = error.get("msg", "")
        rule_id = error.get("id", "")

        location = error.find("location")
        if location is not None:
            findings.append(Finding(
                file=location.get("file", ""),
                line=int(location.get("line", 0)),
                column=int(location.get("column", 0)),
                severity=severity,
                message=msg,
                rule_id=rule_id,
                tool="cppcheck",
            ))

    return findings


# ---------------------------------------------------------------------------
# clang-tidy
# ---------------------------------------------------------------------------

def run_clang_tidy(
    source_dir: str,
    compile_db: str | None = None,
) -> AnalysisResult:
    clang_tidy = shutil.which("clang-tidy") or get_tool_path("clang-tidy") or "clang-tidy"

    # 收集源文件
    source_files = []
    for root, _dirs, files in os.walk(source_dir):
        for fname in files:
            if fname.endswith((".c", ".cpp", ".cc", ".cxx")):
                source_files.append(str(Path(root) / fname))

    if not source_files:
        return AnalysisResult(tool="clang-tidy")

    cmd = [clang_tidy]
    if compile_db:
        cmd.extend(["-p", compile_db])
    cmd.extend(source_files[:50])

    cmd_str = " ".join(cmd[:5]) + (f" ... ({len(source_files)} files)" if len(source_files) > 5 else "")
    print(f"🔍 运行 clang-tidy: {cmd_str}")

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300,
        )
    except subprocess.TimeoutExpired:
        return AnalysisResult(tool="clang-tidy", command=cmd_str)
    except FileNotFoundError:
        return AnalysisResult(tool="clang-tidy", command=cmd_str)

    findings = _parse_clang_tidy_output(result.stdout + "\n" + result.stderr)

    summary: dict[str, int] = {}
    for f in findings:
        summary[f.severity] = summary.get(f.severity, 0) + 1

    return AnalysisResult(
        tool="clang-tidy",
        findings=findings,
        summary=summary,
        command=cmd_str,
    )


def _parse_clang_tidy_output(output: str) -> list[Finding]:
    findings: list[Finding] = []
    pattern = re.compile(
        r"^(.+?):(\d+):(\d+):\s+(warning|error|note):\s+(.+?)(?:\s+\[(.+?)\])?$",
        re.MULTILINE,
    )
    for m in pattern.finditer(output):
        findings.append(Finding(
            file=m.group(1),
            line=int(m.group(2)),
            column=int(m.group(3)),
            severity=m.group(4),
            message=m.group(5),
            rule_id=m.group(6) or "",
            tool="clang-tidy",
        ))
    return findings


# ---------------------------------------------------------------------------
# GCC analyzer
# ---------------------------------------------------------------------------

def run_gcc_analyzer(source_files: list[str]) -> AnalysisResult:
    gcc = shutil.which("arm-none-eabi-gcc") or shutil.which("gcc") or "gcc"

    if not source_files:
        return AnalysisResult(tool="gcc-analyzer")

    cmd = [gcc, "-fanalyzer", "-fsyntax-only"] + source_files
    cmd_str = " ".join(cmd[:5]) + (f" ... ({len(source_files)} files)" if len(source_files) > 5 else "")
    print(f"🔍 运行 GCC analyzer: {cmd_str}")

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300,
        )
    except subprocess.TimeoutExpired:
        return AnalysisResult(tool="gcc-analyzer", command=cmd_str)
    except FileNotFoundError:
        return AnalysisResult(tool="gcc-analyzer", command=cmd_str)

    findings = _parse_gcc_output(result.stderr)

    summary: dict[str, int] = {}
    for f in findings:
        summary[f.severity] = summary.get(f.severity, 0) + 1

    return AnalysisResult(
        tool="gcc-analyzer",
        findings=findings,
        summary=summary,
        command=cmd_str,
    )


def _parse_gcc_output(output: str) -> list[Finding]:
    findings: list[Finding] = []
    pattern = re.compile(
        r"^(.+?):(\d+):(\d+):\s+(warning|error|note):\s+(.+?)(?:\s+\[(.+?)\])?$",
        re.MULTILINE,
    )
    for m in pattern.finditer(output):
        findings.append(Finding(
            file=m.group(1),
            line=int(m.group(2)),
            column=int(m.group(3)),
            severity=m.group(4),
            message=m.group(5),
            rule_id=m.group(6) or "",
            tool="gcc-analyzer",
        ))
    return findings


# ---------------------------------------------------------------------------
# 报告输出
# ---------------------------------------------------------------------------

def print_detect_report(tools: dict[str, Any]) -> None:
    print("\n📊 静态分析工具探测结果：")
    for name, info in tools.items():
        status = "✅" if info.get("available") else "❌"
        ver = f" ({info['version']})" if info.get("version") else ""
        path = f" @ {info['path']}" if info.get("path") else ""
        extra = ""
        if name == "gcc-analyzer" and info.get("major") and info["major"] < 12:
            extra = f" (需要 GCC 12+，当前 {info['major']})"
        print(f"  {status} {name}{ver}{path}{extra}")


def print_analysis_report(result: AnalysisResult, summary_only: bool = False) -> None:
    total = len(result.findings)
    print(f"\n📊 {result.tool} 分析结果（共 {total} 条发现）：")

    if result.command:
        print(f"  命令: {result.command}")

    if result.summary:
        print("\n  按严重级别统计:")
        for sev in SEVERITY_ORDER:
            count = result.summary.get(sev, 0)
            if count > 0:
                icon = "🔴" if sev == "error" else "🟡" if sev == "warning" else "🔵"
                print(f"    {icon} {sev}: {count}")

    if summary_only or not result.findings:
        return

    # 按严重级别分组输出
    by_severity: dict[str, list[Finding]] = {}
    for f in result.findings:
        by_severity.setdefault(f.severity, []).append(f)

    for sev in SEVERITY_ORDER:
        items = by_severity.get(sev, [])
        if not items:
            continue
        print(f"\n  [{sev.upper()}] ({len(items)} 条):")
        for item in items[:20]:
            rule = f" [{item.rule_id}]" if item.rule_id else ""
            print(f"    {item.file}:{item.line}:{item.column}: {item.message}{rule}")
        if len(items) > 20:
            print(f"    ... 还有 {len(items) - 20} 条")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="嵌入式 C/C++ 静态分析工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --detect
  %(prog)s --cppcheck --source src/
  %(prog)s --cppcheck --source src/ --misra
  %(prog)s --clang-tidy --source src/ --compile-db build/compile_commands.json
  %(prog)s --gcc-analyzer --source src/main.c src/uart.c
        """,
    )
    parser.add_argument("--detect", action="store_true", help="探测静态分析工具可用性")
    parser.add_argument("--cppcheck", action="store_true", help="运行 cppcheck")
    parser.add_argument("--clang-tidy", action="store_true", help="运行 clang-tidy")
    parser.add_argument("--gcc-analyzer", action="store_true", help="运行 GCC -fanalyzer")
    parser.add_argument("--source", nargs="+", help="源码目录或文件列表")
    parser.add_argument("--misra", action="store_true", help="启用 MISRA-C 2012 检查（需要 cppcheck）")
    parser.add_argument("--compile-db", help="compile_commands.json 路径")
    parser.add_argument("--severity", default="style",
                       choices=["error", "warning", "style", "information"],
                       help="最低过滤级别（默认 style）")
    parser.add_argument("--summary", action="store_true", help="只输出统计摘要")
    parser.add_argument("-v", "--verbose", action="store_true", help="详细输出")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.detect:
        tools = detect_tools()
        print_detect_report(tools)
        has_any = any(t.get("available") for t in tools.values())
        return 0 if has_any else 1

    if not args.source:
        print("❌ 请提供 --source（源码目录或文件列表）。")
        return 1

    exit_code = 0

    if args.cppcheck:
        source_dir = args.source[0]
        if not Path(source_dir).exists():
            print(f"❌ 源码目录不存在: {source_dir}")
            return 1
        result = run_cppcheck(source_dir, args.misra, args.compile_db, args.severity)
        print_analysis_report(result, args.summary)
        if result.summary.get("error", 0) > 0:
            exit_code = 1

    if args.clang_tidy:
        source_dir = args.source[0]
        if not Path(source_dir).exists():
            print(f"❌ 源码目录不存在: {source_dir}")
            return 1
        result = run_clang_tidy(source_dir, args.compile_db)
        print_analysis_report(result, args.summary)
        if result.summary.get("error", 0) > 0:
            exit_code = 1

    if args.gcc_analyzer:
        files = []
        for s in args.source:
            p = Path(s)
            if p.is_file():
                files.append(str(p))
            elif p.is_dir():
                for root, _dirs, fnames in os.walk(p):
                    for fname in fnames:
                        if fname.endswith((".c", ".cpp")):
                            files.append(str(Path(root) / fname))
        if not files:
            print("❌ 未找到可分析的源文件。")
            return 1
        result = run_gcc_analyzer(files)
        print_analysis_report(result, args.summary)
        if result.summary.get("error", 0) > 0:
            exit_code = 1

    if not args.cppcheck and not args.clang_tidy and not args.gcc_analyzer:
        print("❌ 请指定分析工具：--cppcheck、--clang-tidy 或 --gcc-analyzer。")
        return 1

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
