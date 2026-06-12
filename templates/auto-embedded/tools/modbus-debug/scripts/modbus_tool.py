#!/usr/bin/env python
"""Modbus RTU/TCP 调试工具。

为 `modbus-debug` skill 提供可重复调用的执行入口，支持：

- 探测 pymodbus 环境和串口设备
- 读写保持寄存器、输入寄存器、线圈、离散输入
- 扫描从站地址
- 持续监控寄存器变化
- RTU（串口）和 TCP（网络）两种连接模式
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
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

try:
    from pymodbus.client import ModbusSerialClient, ModbusTcpClient
    from pymodbus import __version__ as PYMODBUS_VERSION
    HAS_PYMODBUS = True
except ImportError:
    HAS_PYMODBUS = False
    PYMODBUS_VERSION = None

try:
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

REGISTER_TYPES = ["holding", "input", "coil", "discrete"]
PARITY_MAP = {"N": "N", "E": "E", "O": "O"}


@dataclass
class ModbusResult:
    status: str  # success, failure, timeout
    summary: str
    mode: str | None = None
    connection: str | None = None
    slave_id: int | None = None
    register_type: str | None = None
    address: int | None = None
    count: int | None = None
    values: list[int] = field(default_factory=list)
    failure_category: str | None = None
    evidence: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 连接管理
# ---------------------------------------------------------------------------

def create_client(args) -> Any:
    if args.tcp:
        host = args.host or "127.0.0.1"
        port = args.tcp_port or 502
        client = ModbusTcpClient(host=host, port=port, timeout=args.timeout)
        conn_str = f"TCP {host}:{port}"
    else:
        if not args.port:
            print("❌ RTU 模式需要 --port 参数。")
            return None, None
        client = ModbusSerialClient(
            port=args.port,
            baudrate=args.baudrate,
            parity=PARITY_MAP.get(args.parity, "N"),
            stopbits=args.stopbits,
            bytesize=8,
            timeout=args.timeout,
        )
        conn_str = f"RTU {args.port} {args.baudrate} 8{args.parity}{args.stopbits}"
    return client, conn_str


def list_ports() -> list[str]:
    if not HAS_SERIAL:
        return []
    lines = []
    for p in serial.tools.list_ports.comports():
        lines.append(f"  {p.device}: {p.description}")
    return lines


# ---------------------------------------------------------------------------
# 寄存器读写
# ---------------------------------------------------------------------------

def read_registers(client, slave: int, address: int, count: int, reg_type: str) -> ModbusResult:
    try:
        if reg_type == "holding":
            rr = client.read_holding_registers(address, count=count, device_id=slave)
        elif reg_type == "input":
            rr = client.read_input_registers(address, count=count, device_id=slave)
        elif reg_type == "coil":
            rr = client.read_coils(address, count=count, device_id=slave)
        elif reg_type == "discrete":
            rr = client.read_discrete_inputs(address, count=count, device_id=slave)
        else:
            return ModbusResult(status="failure", summary=f"未知寄存器类型: {reg_type}", failure_category="illegal-function")
    except Exception as e:
        return ModbusResult(status="failure", summary=str(e), failure_category="connection-failure", evidence=[str(e)])

    if rr.isError():
        cat = classify_modbus_error(rr)
        return ModbusResult(status="failure", summary=f"读取失败: {rr}", failure_category=cat, evidence=[str(rr)])

    vals = rr.bits[:count] if reg_type in ("coil", "discrete") else rr.registers
    return ModbusResult(
        status="success", summary=f"读取 {len(vals)} 个{'位' if reg_type in ('coil', 'discrete') else '寄存器'}",
        mode="read", slave_id=slave, register_type=reg_type,
        address=address, count=len(vals), values=[int(v) for v in vals],
    )


def write_registers(client, slave: int, address: int, values: list[int], reg_type: str) -> ModbusResult:
    try:
        if reg_type == "holding":
            if len(values) == 1:
                rr = client.write_register(address, values[0], device_id=slave)
            else:
                rr = client.write_registers(address, values, device_id=slave)
        elif reg_type == "coil":
            if len(values) == 1:
                rr = client.write_coil(address, bool(values[0]), device_id=slave)
            else:
                rr = client.write_coils(address, [bool(v) for v in values], device_id=slave)
        else:
            return ModbusResult(status="failure", summary=f"不支持写入 {reg_type} 类型", failure_category="illegal-function")
    except Exception as e:
        return ModbusResult(status="failure", summary=str(e), failure_category="connection-failure", evidence=[str(e)])

    if rr.isError():
        cat = classify_modbus_error(rr)
        return ModbusResult(status="failure", summary=f"写入失败: {rr}", failure_category=cat, evidence=[str(rr)])

    return ModbusResult(
        status="success", summary=f"写入 {len(values)} 个值到地址 {address}",
        mode="write", slave_id=slave, register_type=reg_type,
        address=address, count=len(values), values=values,
    )


def classify_modbus_error(rr) -> str:
    s = str(rr).lower()
    if "slave" in s or "gateway" in s or "no response" in s:
        return "slave-no-response"
    if "illegal function" in s:
        return "illegal-function"
    if "illegal data address" in s or "illegal address" in s:
        return "illegal-address"
    return "connection-failure"


# ---------------------------------------------------------------------------
# 扫描从站
# ---------------------------------------------------------------------------

def scan_slaves(client, scan_range: str) -> ModbusResult:
    parts = scan_range.split("-")
    start = int(parts[0])
    end = int(parts[1]) if len(parts) > 1 else start
    start, end = max(1, start), min(247, end)

    found: list[int] = []
    print(f"🔍 扫描从站地址 {start}-{end}...")
    for addr in range(start, end + 1):
        try:
            rr = client.read_holding_registers(0, count=1, device_id=addr)
            if not rr.isError():
                found.append(addr)
                print(f"  ✅ 从站 {addr} 在线")
        except Exception:
            pass

    if found:
        return ModbusResult(status="success", summary=f"找到 {len(found)} 个从站", mode="scan", values=found)
    return ModbusResult(status="failure", summary="未找到在线从站", mode="scan", failure_category="slave-no-response")


# ---------------------------------------------------------------------------
# 监控模式
# ---------------------------------------------------------------------------

def monitor_registers(client, slave: int, address: int, count: int, reg_type: str, interval: float, duration: float) -> ModbusResult:
    print(f"📊 监控从站 {slave} 地址 {address}-{address + count - 1}（间隔 {interval}s）")
    prev_values: list[int] | None = None
    deadline = time.time() + duration if duration > 0 else float("inf")
    reads = 0

    try:
        while time.time() < deadline:
            result = read_registers(client, slave, address, count, reg_type)
            if result.status != "success":
                print(f"  ❌ 读取失败: {result.summary}")
                time.sleep(interval)
                continue

            reads += 1
            if prev_values is None or result.values != prev_values:
                ts = time.strftime("%H:%M:%S")
                vals_str = " ".join(str(v) for v in result.values)
                print(f"  [{ts}] {vals_str}")
                prev_values = result.values[:]

            time.sleep(interval)
    except KeyboardInterrupt:
        pass

    return ModbusResult(status="success", summary=f"监控完成，共读取 {reads} 次", mode="monitor",
                        slave_id=slave, address=address, count=count)


# ---------------------------------------------------------------------------
# 输出格式化
# ---------------------------------------------------------------------------

def format_values(result: ModbusResult, fmt: str, reg_type: str) -> str:
    if fmt == "json":
        return json.dumps({"address": result.address, "values": result.values, "slave": result.slave_id}, indent=2)
    if fmt == "raw":
        return " ".join(str(v) for v in result.values)

    lines = []
    if reg_type in ("coil", "discrete"):
        lines.append(f"  {'地址':>6} | {'值':>5}")
        lines.append(f"  {'------':>6}-+------")
        for i, v in enumerate(result.values):
            lines.append(f"  {result.address + i:>6} | {v:>5}")
    else:
        lines.append(f"  {'地址':>6} | {'十进制':>7} | {'十六进制':>8} | {'二进制':>18}")
        lines.append(f"  {'------':>6}-+---------+----------+--------------------")
        for i, v in enumerate(result.values):
            lines.append(f"  {result.address + i:>6} | {v:>7} | {v:#06x}   | {v:016b}")
    return "\n".join(lines)


def print_report(result: ModbusResult, fmt: str = "table") -> None:
    icon = {"success": "✅", "failure": "❌", "timeout": "⏱️"}.get(result.status, "❓")
    print(f"\n📊 结果: {icon} {result.summary}")

    if result.connection:
        print(f"  连接: {result.connection}")
    if result.slave_id is not None:
        print(f"  从站: {result.slave_id}")
    if result.mode in ("read", "write") and result.values:
        print(f"\n{format_values(result, fmt, result.register_type or 'holding')}")
    if result.mode == "scan" and result.values:
        print(f"  在线从站: {', '.join(str(v) for v in result.values)}")
    if result.failure_category:
        print(f"\n  失败分类: {result.failure_category}")
    if result.evidence:
        print("\n📝 证据:")
        for line in result.evidence[:10]:
            print(f"  {line}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Modbus RTU/TCP 调试工具", formatter_class=argparse.RawDescriptionHelpFormatter)
    # 模式
    p.add_argument("--detect", action="store_true", help="探测环境和串口")
    p.add_argument("--read", action="store_true", help="读寄存器")
    p.add_argument("--write", action="store_true", help="写寄存器")
    p.add_argument("--scan", action="store_true", help="扫描从站地址")
    p.add_argument("--monitor", action="store_true", help="持续监控寄存器")
    # 连接 - RTU
    p.add_argument("--port", help="串口（如 COM42、/dev/ttyUSB0）")
    p.add_argument("--baudrate", type=int, default=9600, help="波特率（默认 9600）")
    p.add_argument("--parity", choices=["N", "E", "O"], default="N", help="校验（默认 N）")
    p.add_argument("--stopbits", type=int, choices=[1, 2], default=1, help="停止位（默认 1）")
    p.add_argument("--timeout", type=float, default=1.0, help="超时秒数（默认 1）")
    # 连接 - TCP
    p.add_argument("--tcp", action="store_true", help="使用 TCP 模式")
    p.add_argument("--host", help="TCP 主机地址")
    p.add_argument("--tcp-port", type=int, default=502, help="TCP 端口（默认 502）")
    # 寄存器
    p.add_argument("--slave", type=int, default=1, help="从站地址（默认 1）")
    p.add_argument("--address", type=int, default=0, help="起始寄存器地址（默认 0）")
    p.add_argument("--count", type=int, default=1, help="读取数量（默认 1）")
    p.add_argument("--type", choices=REGISTER_TYPES, default="holding", help="寄存器类型（默认 holding）")
    p.add_argument("--values", help="写入值，逗号分隔（如 100,200,300）")
    # 扫描
    p.add_argument("--scan-range", default="1-247", help="扫描地址范围（默认 1-247）")
    # 监控
    p.add_argument("--interval", type=float, default=1.0, help="监控间隔秒数（默认 1）")
    p.add_argument("--duration", type=float, default=0, help="监控持续秒数（0=无限，默认 0）")
    # 输出
    p.add_argument("--format", choices=["table", "raw", "json"], default="table", help="输出格式")
    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    # 探测模式
    if args.detect:
        print("\n📊 Modbus 调试环境探测：")
        if HAS_PYMODBUS:
            print(f"  ✅ pymodbus {PYMODBUS_VERSION}")
        else:
            print("  ❌ pymodbus 未安装（pip install pymodbus）")
        if HAS_SERIAL:
            ports = list_ports()
            if ports:
                print(f"\n  串口设备:")
                for line in ports:
                    print(f"  {line}")
            else:
                print("\n  未检测到串口设备")
        return 0 if HAS_PYMODBUS else 1

    if not HAS_PYMODBUS:
        print("❌ pymodbus 未安装，请运行: pip install pymodbus")
        return 1

    # 需要连接的模式
    if not (args.read or args.write or args.scan or args.monitor):
        parser.print_help()
        return 1

    client, conn_str = create_client(args)
    if client is None:
        return 1

    if not client.connect():
        print(f"❌ 连接失败: {conn_str}")
        return 1
    print(f"🔗 已连接: {conn_str}")

    try:
        if args.scan:
            result = scan_slaves(client, args.scan_range)
            result.connection = conn_str
            print_report(result, args.format)
            return 0 if result.status == "success" else 1

        if args.read:
            result = read_registers(client, args.slave, args.address, args.count, args.type)
            result.connection = conn_str
            print_report(result, args.format)
            return 0 if result.status == "success" else 1

        if args.write:
            if not args.values:
                print("❌ 写入需要 --values 参数（如 --values 100,200）")
                return 1
            vals = [int(v.strip()) for v in args.values.split(",")]
            result = write_registers(client, args.slave, args.address, vals, args.type)
            result.connection = conn_str
            print_report(result, args.format)
            return 0 if result.status == "success" else 1

        if args.monitor:
            result = monitor_registers(client, args.slave, args.address, args.count, args.type, args.interval, args.duration)
            result.connection = conn_str
            print_report(result, args.format)
            return 0

    finally:
        client.close()
        print("🔌 连接已关闭")


if __name__ == "__main__":
    sys.exit(main())
