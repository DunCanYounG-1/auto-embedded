#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PreToolUse hook: 嵌入式分层合规拦截（Write/Edit only）

读取 Claude Code 通过 stdin 传入的工具调用 JSON，对 C 源文件做机械化检查：
- 应用层禁 #include 厂商 HAL 头
- main.c 顶层函数调用 ≤ 6 个
- ISR / callback 函数体 ≤ 20 行
- 应用层禁 `extern` 跨模块变量

命中违规 → stdout 输出 JSON `{decision:"block", reason:...}` + exit 2
未命中 / 不适用 → exit 0（沉默放行）
异常 / 解析失败 → exit 0（fail-open，不阻断 Claude 工作流）

设计原则：宁错放也不错杀。路径不确定 = 跳过。
"""

from __future__ import annotations

import io
import json
import os
import re
import sys


# ===== 配置 =====

# 应用层路径标识（命中任一即视为 app 层文件）
APP_LAYER_PATTERNS = [
    r"[/\\]app[/\\]",
    r"[/\\]application[/\\]",
    r"[/\\]project[/\\]code[/\\]app[/\\]",
    r"[/\\]code[/\\]app[/\\]",
    r"^app[/\\]",
    r"^application[/\\]",
]

# 厂商 HAL / SDK 头禁用清单（应用层 include 即违规）
# 不用 VERBOSE 模式（# 会被当成注释），手写完整字符类
_VENDOR_PATTERNS = "|".join([
    r"stm32[a-z0-9_]*_hal[a-z0-9_]*\.h",   # STM32 HAL
    r"stm32[a-z0-9]+\.h",                   # STM32 厂商头
    r"stm32[a-z0-9_]*ll[a-z0-9_]*\.h",      # STM32 LL
    r"gd32[a-z0-9_]*\.h",                   # GD32 系列
    r"esp_system\.h",                       # ESP-IDF
    r"esp_[a-z0-9_]+\.h",
    r"driver/gpio\.h",                      # ESP-IDF driver
    r"ti_msp_dl_config\.h",                 # TI MSPM0
    r"ti/devices/[a-z0-9_/]+\.h",
    r"nrf\.h",                              # Nordic
    r"nrfx[a-z0-9_]*\.h",
    r"hal/nrf_[a-z0-9_]+\.h",
    r"DA[A-Z0-9]+\.h",                      # Dialog
    # Infineon TC2xx / Aurix（TC264 / TC387）
    r"Ifx[A-Za-z0-9_]+\.h",                 # IfxCcu6_Timer.h / IfxScuEru.h
    r"ifx[a-z0-9_]+_reg\.h",                # ifxAsclin_reg.h
    r"SysSe/[A-Za-z0-9_/]+\.h",             # SysSe/Bsp/Bsp.h
])
VENDOR_HEADER_BLOCKLIST = re.compile(
    r'#\s*include\s+[<"](' + _VENDOR_PATTERNS + r')[>"]',
    re.IGNORECASE,
)

# Catch-all mega-header（间接拉入厂商头，等同违规）
_CATCH_ALL_PATTERNS = "|".join([
    r"[a-z_]*_?common_?headfile\.h",
    r"[a-z_]*_headfile\.h",
    r"headfile\.h",
    r"all\.h",
    r"globals?\.h",
    r"project\.h",
])
CATCH_ALL_BLOCKLIST = re.compile(
    r'#\s*include\s+[<"](' + _CATCH_ALL_PATTERNS + r')[>"]',
    re.IGNORECASE,
)

# main.c 路径标识（含 TC264 双核 / RTOS 常见入口文件名）
MAIN_C_PATTERNS = [
    r"[/\\]main\.c$",
    r"^main\.c$",
    r"[/\\]user[/\\]main\.c$",
    r"cpu[0-9]_main\.c$",        # TC264 / TC397 双核 / 多核
    r"core[0-9]_main\.c$",
    r".*_main\.c$",               # firmware_main.c / app_main.c 等
    r"firmware.*\.c$",
]

# main.c 内允许的顶层调用名前缀（编排函数）
MAIN_C_ALLOWED_CALLS = {"bsp_init", "mid_init", "svc_init", "app_run",
                        "hal_init", "system_init", "board_init",
                        "scheduler_start", "osKernelStart"}

# main.c 顶层调用数上限（容许少量灵活性）
MAIN_C_MAX_TOP_CALLS = 6

# ISR / 弱回调函数命名模式（命中即按 ISR 检查）
_ISR_NAME_PATTERNS = "|".join([
    r"[A-Za-z0-9_]+_IRQHandler",            # STM32/GD32 风格 ISR
    r"[A-Za-z0-9_]+_Handler",               # Cortex-M 通用 ISR
    r"HAL_[A-Za-z0-9_]+_Callback",          # STM32 HAL 弱回调
    r"DL_[A-Za-z0-9_]+_IRQHandler",         # TI MSPM0
    r"[A-Za-z0-9_]+_callback",              # Seekfree 风格
    r"[A-Za-z0-9_]+Cb",
])
ISR_FUNC_PATTERN = re.compile(
    r"(?:^|\n)\s*(?:void\s+|__attribute__\([^)]*\)\s*void\s+|static\s+void\s+|inline\s+void\s+)("
    + _ISR_NAME_PATTERNS + r")\s*\([^)]*\)\s*\{",
    re.MULTILINE,
)

# 单个 ISR / callback 函数体行数上限
ISR_BODY_MAX_LINES = 20

# 应用层 extern 变量声明检测（extern 函数声明排除）
APP_LAYER_EXTERN = re.compile(
    r"^\s*extern\s+(?:const\s+|volatile\s+)?[a-zA-Z_][a-zA-Z0-9_\s\*]+\s+"
    r"([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\[[^\]]*\])?\s*;",
    re.MULTILINE,
)


# ===== 工具函数 =====

def is_app_layer(path: str) -> bool:
    if not path:
        return False
    norm = path.replace("\\", "/").lower()
    return any(re.search(p.lower(), norm) for p in APP_LAYER_PATTERNS)


def is_main_c(path: str) -> bool:
    if not path:
        return False
    return any(re.search(p, path) for p in MAIN_C_PATTERNS)


def is_c_source(path: str) -> bool:
    return path.endswith(".c") or path.endswith(".h")


def check_vendor_includes(content: str) -> str | None:
    m = VENDOR_HEADER_BLOCKLIST.search(content)
    if m:
        return ("应用层禁止 include 厂商 HAL 头（命中 `%s`）。" % m.group(1) +
                "正确做法：把硬件访问下沉到 L1 HAL Port (hal_*.h) 或 L3 Driver (drv_*.h)，"
                "由 Port adapter 文件 include 厂商头。"
                "详见 refs/embedded-architecture.md §0 + §3。")
    m = CATCH_ALL_BLOCKLIST.search(content)
    if m:
        return ("应用层禁止 include catch-all mega-header（命中 `%s`，间接拉入厂商头）。" %
                m.group(1) +
                "正确做法：精确 include 用到的 `zf_driver_xxx.h` / `zf_device_xxx.h`，"
                "或下沉到 driver / hal 层包装。"
                "详见 refs/embedded-architecture.md §5.X 第 13 条（禁 mega-header）。")
    return None


def check_main_c_calls(content: str) -> str | None:
    """检查 main() 函数体内的顶层调用数。

    兼容多种嵌入式入口命名：
      - 单核：main / app_main / firmware_main
      - TC264 双核：core0_main / core1_main / cpu0_main / cpu1_main
      - RTOS：Main_Task / vMainTask
    """
    main_match = re.search(
        r"(?:^|[ \t\n])(?:int|void)\s+"
        r"(main|core[0-9]+_main|cpu[0-9]+_main|Main_Task|vMainTask|"
        r"app_main|firmware_main|core_main)"
        r"\s*\([^)]*\)\s*\{",
        content,
    )
    if not main_match:
        return None
    main_name = main_match.group(1)

    body_start = main_match.end()
    # 简易花括号配对（找到 main 函数结束）
    depth = 1
    i = body_start
    while i < len(content) and depth > 0:
        c = content[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    body = content[body_start:i - 1] if depth == 0 else content[body_start:]

    # 剥离 { ... } 内嵌作用域，避免 while/for/if 块内的调用算进顶层
    def strip_nested_blocks(s: str) -> str:
        out = []
        depth = 0
        for ch in s:
            if ch == "{":
                depth += 1
                continue
            if ch == "}":
                depth = max(0, depth - 1)
                continue
            if depth == 0:
                out.append(ch)
        return "".join(out)

    flat = strip_nested_blocks(body)

    # 按 ; 分割顶层语句，每段提取第一个函数调用名
    call_lines = []
    keywords = {"if", "while", "for", "switch", "return", "sizeof", "do", "else"}
    for stmt in flat.split(";"):
        stripped = stmt.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("/*"):
            continue
        m = re.match(r"([a-zA-Z_][a-zA-Z0-9_]*)\s*\(", stripped)
        if m:
            name = m.group(1)
            if name in keywords:
                continue
            call_lines.append(name)

    if len(call_lines) > MAIN_C_MAX_TOP_CALLS:
        return ("%s() 顶层调用数 = %d，超出限额 %d。" %
                (main_name, len(call_lines), MAIN_C_MAX_TOP_CALLS) +
                "main 入口函数只允许编排（典型：bsp_init → mid_init → svc_init → app_run），"
                "业务流程必须拆到 app_*.c。命中调用：%s。"
                "详见 refs/embedded-architecture.md §6。" % ", ".join(call_lines))
    return None


def check_isr_body_length(content: str) -> str | None:
    """检查 ISR / 弱回调函数体行数。"""
    violations = []
    for match in ISR_FUNC_PATTERN.finditer(content):
        func_name = match.group(1)
        body_start = match.end()
        depth = 1
        i = body_start
        while i < len(content) and depth > 0:
            c = content[i]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            i += 1
        body = content[body_start:i - 1]
        # 统计非空非注释行数
        effective_lines = sum(
            1
            for line in body.split("\n")
            if line.strip() and not line.strip().startswith("//")
            and not line.strip().startswith("/*") and not line.strip().startswith("*")
        )
        if effective_lines > ISR_BODY_MAX_LINES:
            violations.append("%s (%d 行)" % (func_name, effective_lines))

    if violations:
        return ("ISR / 弱回调函数体超过 %d 行限额：%s。" %
                (ISR_BODY_MAX_LINES, ", ".join(violations)) +
                "ISR 必须最小化执行时间，业务逻辑必须移到主循环或任务中。"
                "详见 refs/embedded-architecture.md §5。")
    return None


def check_app_extern(content: str) -> str | None:
    """检查应用层 extern 变量声明（extern 函数声明排除）。"""
    violations = []
    for m in APP_LAYER_EXTERN.finditer(content):
        name = m.group(1)
        # 排除函数声明：检查 ; 前是否有 )
        snippet = m.group(0)
        if ")" in snippet:
            continue
        # 排除常见允许的（中断向量表等）
        if name.upper() == name:  # 全大写宏式跳过
            continue
        violations.append(name)
    if violations:
        return ("应用层禁用 extern 跨模块变量：%s。" % ", ".join(violations) +
                "跨模块状态必须走 getter/setter API。"
                "详见 refs/embedded-architecture.md §1 禁止 3（同层耦合内部）。")
    return None


# ===== 主流程 =====

def main() -> int:
    # 读 stdin JSON（Claude Code PreToolUse 输入格式）
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return 0  # 没数据，沉默放行
        payload = json.loads(raw)
    except (json.JSONDecodeError, OSError):
        return 0  # 解析失败 fail-open

    tool_name = payload.get("tool_name", "")
    if tool_name not in ("Write", "Edit", "MultiEdit"):
        return 0  # 非写入工具，跳过

    tool_input = payload.get("tool_input", {}) or {}
    file_path = tool_input.get("file_path", "") or ""
    if not is_c_source(file_path):
        return 0

    # 提取要写入的内容
    if tool_name == "Write":
        content = tool_input.get("content", "") or ""
    elif tool_name == "Edit":
        content = tool_input.get("new_string", "") or ""
    elif tool_name == "MultiEdit":
        edits = tool_input.get("edits", []) or []
        content = "\n".join(e.get("new_string", "") for e in edits)
    else:
        return 0

    if not content:
        return 0

    # 触发检查
    reasons: list[str] = []

    # 1. 厂商头检查（仅 app 层）
    if is_app_layer(file_path):
        r = check_vendor_includes(content)
        if r:
            reasons.append(r)
        r = check_app_extern(content)
        if r:
            reasons.append(r)

    # 2. main.c 检查（Write 才有完整 main 函数）
    if is_main_c(file_path) and tool_name == "Write":
        r = check_main_c_calls(content)
        if r:
            reasons.append(r)

    # 3. ISR 长度检查（任何 .c 文件，Write 时有完整函数体）
    if file_path.endswith(".c") and tool_name == "Write":
        r = check_isr_body_length(content)
        if r:
            reasons.append(r)

    if not reasons:
        return 0

    # 输出阻止 JSON（Claude Code 兼容格式）
    output = {
        "decision": "block",
        "reason": "[embedded-dev pre-write-check] 拦截到 %d 项违规：\n- %s" % (
            len(reasons), "\n- ".join(reasons)
        ),
    }
    try:
        sys.stdout.write(json.dumps(output, ensure_ascii=False))
        sys.stdout.flush()
    except (OSError, UnicodeEncodeError):
        pass
    # 同步写 stderr（兼容旧版 Claude Code）
    try:
        sys.stderr.write(output["reason"] + "\n")
        sys.stderr.flush()
    except (OSError, UnicodeEncodeError):
        pass
    return 2


if __name__ == "__main__":
    # Windows: 强制 UTF-8
    if sys.platform == "win32":
        sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    sys.exit(main())
