#!/usr/bin/env python3
"""固件内存分析工具。

为 `memory-analysis` skill 提供可重复调用的执行入口，支持：

- 解析 GCC/ARM .map 文件提取 section 和符号信息
- 通过 arm-none-eabi-size 解析 ELF section
- 解析链接脚本获取 FLASH/RAM 总容量
- 内存使用率告警
- 两个 .map 文件的对比分析
- 自动扫描构建目录
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

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


@dataclass
class SectionInfo:
    name: str
    address: int
    size: int


@dataclass
class SymbolInfo:
    name: str
    address: int
    size: int
    section: str


@dataclass
class MemoryRegion:
    name: str
    origin: int
    length: int


@dataclass
class AnalysisResult:
    sections: list[SectionInfo] = field(default_factory=list)
    symbols: list[SymbolInfo] = field(default_factory=list)
    regions: list[MemoryRegion] = field(default_factory=list)
    flash_used: int = 0
    ram_used: int = 0
    flash_total: int = 0
    ram_total: int = 0


# ---------------------------------------------------------------------------
# .map 文件解析
# ---------------------------------------------------------------------------

def parse_map_file(map_path: str) -> AnalysisResult:
    text = Path(map_path).read_text(encoding="utf-8", errors="ignore")
    result = AnalysisResult()

    # 解析 Memory Configuration
    mem_config = re.search(
        r"Memory Configuration\s*\n\s*Name\s+Origin\s+Length.*?\n(.*?)(?:\n\n|\nLinker)",
        text, re.DOTALL,
    )
    if mem_config:
        for line in mem_config.group(1).split("\n"):
            m = re.match(r"\s*(\S+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)", line)
            if m:
                name = m.group(1)
                if name.startswith("*"):
                    continue
                origin = int(m.group(2), 16)
                length = int(m.group(3), 16)
                result.regions.append(MemoryRegion(name=name, origin=origin, length=length))
                name_lower = name.lower()
                if "flash" in name_lower or "rom" in name_lower:
                    result.flash_total += length
                elif "ram" in name_lower or "sram" in name_lower:
                    result.ram_total += length

    # 解析 section 汇总
    section_pattern = re.compile(
        r"^(\.[\w.]+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)",
        re.MULTILINE,
    )
    seen_sections: set[str] = set()
    for m in section_pattern.finditer(text):
        name = m.group(1)
        if name in seen_sections:
            continue
        seen_sections.add(name)
        address = int(m.group(2), 16)
        size = int(m.group(3), 16)
        if size > 0:
            result.sections.append(SectionInfo(name=name, address=address, size=size))

    # 解析符号表
    symbol_pattern = re.compile(
        r"^\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)\s+(\S+.*?)\n\s+0x[0-9a-fA-F]+\s+(\S+)",
        re.MULTILINE,
    )
    for m in symbol_pattern.finditer(text):
        address = int(m.group(1), 16)
        size = int(m.group(2), 16)
        obj_file = m.group(3).strip()
        sym_name = m.group(4).strip()
        if size > 0 and not sym_name.startswith("."):
            section = ""
            for sec in result.sections:
                if sec.address <= address < sec.address + sec.size:
                    section = sec.name
                    break
            result.symbols.append(SymbolInfo(
                name=sym_name, address=address, size=size, section=section,
            ))

    # 补充：使用更宽松的符号匹配
    loose_pattern = re.compile(
        r"^\s+0x([0-9a-fA-F]{8,})\s+(\S+)",
        re.MULTILINE,
    )
    known_syms = {s.name for s in result.symbols}
    prev_addr = 0
    prev_name = ""
    for m in loose_pattern.finditer(text):
        addr = int(m.group(1), 16)
        name = m.group(2)
        if name.startswith("0x") or name.startswith("."):
            continue
        if prev_name and prev_name not in known_syms and prev_addr > 0:
            size_est = addr - prev_addr
            if 0 < size_est < 1_000_000:
                section = ""
                for sec in result.sections:
                    if sec.address <= prev_addr < sec.address + sec.size:
                        section = sec.name
                        break
                result.symbols.append(SymbolInfo(
                    name=prev_name, address=prev_addr, size=size_est, section=section,
                ))
                known_syms.add(prev_name)
        prev_addr = addr
        prev_name = name

    # 计算 Flash/RAM 使用量
    for sec in result.sections:
        name = sec.name.lower()
        if name in (".text", ".rodata", ".ARM.exidx", ".ARM.extab"):
            result.flash_used += sec.size
        elif name == ".data":
            result.flash_used += sec.size
            result.ram_used += sec.size
        elif name == ".bss":
            result.ram_used += sec.size

    return result


# ---------------------------------------------------------------------------
# ELF 解析（通过 arm-none-eabi-size）
# ---------------------------------------------------------------------------

def parse_elf(elf_path: str) -> AnalysisResult | None:
    size_tool = shutil.which("arm-none-eabi-size") or get_tool_path("arm-none-eabi-size")
    if not size_tool:
        return None

    try:
        result = subprocess.run(
            [size_tool, "-A", elf_path],
            capture_output=True, text=True, timeout=10,
        )
    except Exception:
        return None

    if result.returncode != 0:
        return None

    analysis = AnalysisResult()
    for line in result.stdout.split("\n"):
        m = re.match(r"^(\.[\w.]+)\s+(\d+)\s+(\d+)", line)
        if m:
            name = m.group(1)
            size = int(m.group(2))
            address = int(m.group(3))
            if size > 0:
                analysis.sections.append(SectionInfo(name=name, address=address, size=size))

    for sec in analysis.sections:
        name = sec.name.lower()
        if name in (".text", ".rodata", ".ARM.exidx", ".ARM.extab"):
            analysis.flash_used += sec.size
        elif name == ".data":
            analysis.flash_used += sec.size
            analysis.ram_used += sec.size
        elif name == ".bss":
            analysis.ram_used += sec.size

    return analysis


# ---------------------------------------------------------------------------
# 链接脚本解析
# ---------------------------------------------------------------------------

def parse_linker_script(ld_path: str) -> tuple[int, int]:
    text = Path(ld_path).read_text(encoding="utf-8", errors="ignore")
    flash_total = 0
    ram_total = 0

    memory_block = re.search(r"MEMORY\s*\{(.*?)\}", text, re.DOTALL)
    if not memory_block:
        return 0, 0

    for line in memory_block.group(1).split("\n"):
        m = re.match(
            r"\s*(\w+)\s*.*?ORIGIN\s*=\s*0x([0-9a-fA-F]+)\s*,\s*LENGTH\s*=\s*(\d+[KkMm]?)",
            line,
        )
        if not m:
            continue
        name = m.group(1).lower()
        length_str = m.group(3)
        length = _parse_size(length_str)

        if "flash" in name or "rom" in name:
            flash_total += length
        elif "ram" in name or "sram" in name:
            ram_total += length

    return flash_total, ram_total


def _parse_size(s: str) -> int:
    s = s.strip()
    if s.upper().endswith("K"):
        return int(s[:-1]) * 1024
    if s.upper().endswith("M"):
        return int(s[:-1]) * 1024 * 1024
    return int(s)


# ---------------------------------------------------------------------------
# 对比分析
# ---------------------------------------------------------------------------

def compare_maps(map1_path: str, map2_path: str) -> dict:
    r1 = parse_map_file(map1_path)
    r2 = parse_map_file(map2_path)

    sec_diff: list[dict] = []
    s1 = {s.name: s.size for s in r1.sections}
    s2 = {s.name: s.size for s in r2.sections}
    all_sections = sorted(set(s1) | set(s2))
    for name in all_sections:
        old = s1.get(name, 0)
        new = s2.get(name, 0)
        if old != new:
            sec_diff.append({"name": name, "old": old, "new": new, "delta": new - old})

    sym_diff: list[dict] = []
    sym1 = {s.name: s.size for s in r1.symbols}
    sym2 = {s.name: s.size for s in r2.symbols}
    all_syms = sorted(set(sym1) | set(sym2))
    for name in all_syms:
        old = sym1.get(name, 0)
        new = sym2.get(name, 0)
        if old != new:
            sym_diff.append({"name": name, "old": old, "new": new, "delta": new - old})

    return {
        "flash_delta": r2.flash_used - r1.flash_used,
        "ram_delta": r2.ram_used - r1.ram_used,
        "section_changes": sorted(sec_diff, key=lambda x: abs(x["delta"]), reverse=True),
        "symbol_changes": sorted(sym_diff, key=lambda x: abs(x["delta"]), reverse=True),
    }


# ---------------------------------------------------------------------------
# 扫描构建目录
# ---------------------------------------------------------------------------

def scan_build_dir(build_dir: str) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    bd = Path(build_dir)
    if not bd.is_dir():
        return results

    for root, _dirs, files in os.walk(bd):
        for fname in files:
            fpath = Path(root) / fname
            ext = fpath.suffix.lower()
            if ext == ".map":
                results.append({"type": "map", "path": str(fpath)})
            elif ext in (".elf", ".axf"):
                results.append({"type": "elf", "path": str(fpath)})
    return results


# ---------------------------------------------------------------------------
# 报告输出
# ---------------------------------------------------------------------------

def _fmt_size(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.2f} MB"
    if size >= 1024:
        return f"{size / 1024:.2f} KB"
    return f"{size} B"


def print_analysis_report(result: AnalysisResult, threshold: int, top_n: int, source: str) -> None:
    print(f"\n📊 内存分析报告（来源: {source}）：")

    if result.sections:
        print("\n  Section 概览:")
        for sec in sorted(result.sections, key=lambda s: s.size, reverse=True):
            print(f"    {sec.name:<20} {_fmt_size(sec.size):>12}  @ 0x{sec.address:08X}")

    print(f"\n  Flash 使用: {_fmt_size(result.flash_used)}", end="")
    if result.flash_total > 0:
        pct = result.flash_used * 100 / result.flash_total
        alert = " ⚠️ 告警!" if pct >= threshold else ""
        print(f" / {_fmt_size(result.flash_total)} ({pct:.1f}%){alert}")
    else:
        print()

    print(f"  RAM   使用: {_fmt_size(result.ram_used)}", end="")
    if result.ram_total > 0:
        pct = result.ram_used * 100 / result.ram_total
        alert = " ⚠️ 告警!" if pct >= threshold else ""
        print(f" / {_fmt_size(result.ram_total)} ({pct:.1f}%){alert}")
    else:
        print()

    if result.symbols and top_n > 0:
        sorted_syms = sorted(result.symbols, key=lambda s: s.size, reverse=True)[:top_n]
        print(f"\n  Top {min(top_n, len(sorted_syms))} 符号:")
        for sym in sorted_syms:
            sec = f" [{sym.section}]" if sym.section else ""
            print(f"    {sym.name:<40} {_fmt_size(sym.size):>12}{sec}")

    if result.regions:
        print("\n  内存区域:")
        for reg in result.regions:
            print(f"    {reg.name:<12} origin=0x{reg.origin:08X}  length={_fmt_size(reg.length)}")


def print_compare_report(diff: dict, map1: str, map2: str) -> None:
    print(f"\n📊 .map 文件对比:")
    print(f"  旧: {map1}")
    print(f"  新: {map2}")

    flash_delta = diff["flash_delta"]
    ram_delta = diff["ram_delta"]
    flash_sign = "+" if flash_delta >= 0 else ""
    ram_sign = "+" if ram_delta >= 0 else ""
    print(f"\n  Flash 变化: {flash_sign}{_fmt_size(flash_delta)}")
    print(f"  RAM   变化: {ram_sign}{_fmt_size(ram_delta)}")

    sec_changes = diff["section_changes"]
    if sec_changes:
        print(f"\n  Section 变化（共 {len(sec_changes)} 项）:")
        for sc in sec_changes[:10]:
            sign = "+" if sc["delta"] >= 0 else ""
            print(f"    {sc['name']:<20} {_fmt_size(sc['old'])} → {_fmt_size(sc['new'])} ({sign}{_fmt_size(sc['delta'])})")

    sym_changes = diff["symbol_changes"]
    if sym_changes:
        print(f"\n  符号变化 Top 20（共 {len(sym_changes)} 项）:")
        for sc in sym_changes[:20]:
            sign = "+" if sc["delta"] >= 0 else ""
            old_str = _fmt_size(sc["old"]) if sc["old"] > 0 else "(新增)"
            new_str = _fmt_size(sc["new"]) if sc["new"] > 0 else "(移除)"
            print(f"    {sc['name']:<40} {old_str} → {new_str} ({sign}{_fmt_size(sc['delta'])})")


def print_detect_report() -> None:
    print("\n📊 内存分析工具探测结果：")
    for tool in ["arm-none-eabi-size", "arm-none-eabi-readelf"]:
        path = shutil.which(tool)
        status = "✅" if path else "❌"
        loc = f" @ {path}" if path else ""
        print(f"  {status} {tool}{loc}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="固件内存分析工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --detect
  %(prog)s --scan build/
  %(prog)s --map-file build/app.map
  %(prog)s --map-file build/app.map --linker-script STM32F407VGTx_FLASH.ld
  %(prog)s --elf build/app.elf
  %(prog)s --compare build_old/app.map build_new/app.map
        """,
    )
    parser.add_argument("--detect", action="store_true", help="探测分析工具可用性")
    parser.add_argument("--map-file", help=".map 文件路径")
    parser.add_argument("--elf", help="ELF 文件路径")
    parser.add_argument("--linker-script", help="链接脚本路径（用于获取总容量）")
    parser.add_argument("--threshold", type=int, default=85, help="使用率告警阈值百分比（默认 85）")
    parser.add_argument("--top", type=int, default=20, help="按大小排序显示前 N 个符号（默认 20）")
    parser.add_argument("--compare", nargs=2, metavar=("MAP1", "MAP2"), help="对比两个 .map 文件")
    parser.add_argument("--scan", help="扫描构建目录中的 .map 和 ELF 文件")
    parser.add_argument("-v", "--verbose", action="store_true", help="详细输出")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.detect:
        print_detect_report()
        has_any = shutil.which("arm-none-eabi-size") is not None
        print("\n  ℹ️ .map 文件解析使用纯正则，无需外部工具。")
        return 0

    if args.scan:
        files = scan_build_dir(args.scan)
        if not files:
            print(f"❌ 未在 {args.scan} 中找到 .map 或 ELF 文件")
            return 1
        print(f"\n📋 找到 {len(files)} 个可分析文件：")
        for f in files:
            print(f"  [{f['type'].upper()}] {f['path']}")
        return 0

    if args.compare:
        map1, map2 = args.compare
        if not Path(map1).is_file():
            print(f"❌ 文件不存在: {map1}")
            return 1
        if not Path(map2).is_file():
            print(f"❌ 文件不存在: {map2}")
            return 1
        diff = compare_maps(map1, map2)
        print_compare_report(diff, map1, map2)
        return 0

    if args.map_file:
        if not Path(args.map_file).is_file():
            print(f"❌ .map 文件不存在: {args.map_file}")
            return 1
        result = parse_map_file(args.map_file)
        if args.linker_script and Path(args.linker_script).is_file():
            flash_total, ram_total = parse_linker_script(args.linker_script)
            if flash_total > 0:
                result.flash_total = flash_total
            if ram_total > 0:
                result.ram_total = ram_total
        print_analysis_report(result, args.threshold, args.top, args.map_file)
        return 0

    if args.elf:
        if not Path(args.elf).is_file():
            print(f"❌ ELF 文件不存在: {args.elf}")
            return 1
        result = parse_elf(args.elf)
        if result is None:
            print("❌ 需要 arm-none-eabi-size 来分析 ELF 文件。")
            return 1
        if args.linker_script and Path(args.linker_script).is_file():
            flash_total, ram_total = parse_linker_script(args.linker_script)
            if flash_total > 0:
                result.flash_total = flash_total
            if ram_total > 0:
                result.ram_total = ram_total
        print_analysis_report(result, args.threshold, args.top, args.elf)
        return 0

    print("❌ 请提供 --map-file、--elf、--compare 或 --scan 参数。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
