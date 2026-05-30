#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""include-graph.py — 嵌入式分层依赖检查（include DAG 扫描）

用 grep + 路径模式推断每个 .c/.h 的层级，扫描所有 #include 边，
检测违反依赖方向的边。比 grep 强：能识别反向依赖 / 跨层穿透实现头。

用法：
    python tools/include-graph.py [project_root]

退出码：
    0 = 无违规
    1 = 有违规（违规边输出到 stdout）
    2 = 内部错误（路径不存在等）

输出格式：
    [LAYER-VIOL] src=L<N>:<file> -> dst=L<M>:<file>  reason=<text>

层级判定规则（路径优先级从高到低）：
    L0  vendor/* 或 sdk/* 或 厂商头文件名（stm32*.h / gd32*.h / ti_msp_dl_*.h ...）
    L1  hal/inc/* 或 hal_*.h          （接口）
    L1a hal/ports/*/                  （适配器，唯一允许 include L0）
    L2  bsp/* 或 bsp_*
    L3  drivers/* 或 drv_*
    L4  middleware/* 或 mid_*
    L5  service/* 或 svc_*
    L6  app/* / application/* / project/code/app/*

依赖规则：
    允许：上层 → 下层接口（.h）
    禁止 1：上层 → 厂商头（L0）— 除非自己是 L1a 适配器
    禁止 2：下层 → 上层（反向依赖）
    禁止 3：app 层 → bsp 层（应通过 hal/drv 中转）
"""

from __future__ import annotations

import io
import os
import re
import sys
from collections import defaultdict

# Windows: 强制 UTF-8
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


# 层级编号（数字越大层级越高）
L_VENDOR = 0
L_HAL = 1
L_HAL_ADAPTER = 1.5  # 适配器：允许 include L0
L_BSP = 2
L_DRV = 3
L_MID = 4
L_SVC = 5
L_APP = 6
L_UNKNOWN = -1

LAYER_NAMES = {
    L_VENDOR: "L0(vendor)",
    L_HAL: "L1(hal)",
    L_HAL_ADAPTER: "L1a(hal-adapter)",
    L_BSP: "L2(bsp)",
    L_DRV: "L3(driver)",
    L_MID: "L4(middleware)",
    L_SVC: "L5(service)",
    L_APP: "L6(app)",
    L_UNKNOWN: "L?(unknown)",
}

# 厂商头文件名模式（按 basename 匹配）
VENDOR_HEADER_PATTERNS = [
    re.compile(r"^stm32[a-z0-9_]*\.h$", re.IGNORECASE),
    re.compile(r"^gd32[a-z0-9_]*\.h$", re.IGNORECASE),
    re.compile(r"^esp_[a-z0-9_]+\.h$", re.IGNORECASE),
    re.compile(r"^ti_msp_dl[a-z0-9_]*\.h$", re.IGNORECASE),
    re.compile(r"^nrfx?[a-z0-9_]*\.h$", re.IGNORECASE),
    re.compile(r"^DA[A-Z0-9]+\.h$", re.IGNORECASE),
    # Infineon TC2xx / Aurix（TC264 / TC387）
    re.compile(r"^Ifx[A-Za-z0-9_]+\.h$"),                    # IfxCcu6_Timer.h / IfxScuEru.h
    re.compile(r"^ifx[a-z0-9_]+_reg\.h$", re.IGNORECASE),    # ifxAsclin_reg.h
    re.compile(r"^Bsp\.h$"),                                  # SysSe/Bsp/Bsp.h 基底名
]

# 厂商路径片段（路径包含即视为 L0）
VENDOR_PATH_FRAGMENTS = [
    "/sysse/",         # Infineon Aurix SDK 系统服务（SysSe/Bsp 等）
    "/aurix/",
    "/infineon_libraries/",
    "/cmsis/",
]

# Seekfree 库模式（→ L3 driver 层，因为它们就是设备/外设驱动）
SEEKFREE_DRIVER_PATTERNS = [
    re.compile(r"^zf_driver_[a-z0-9_]+\.h$", re.IGNORECASE),
    re.compile(r"^zf_device_[a-z0-9_]+\.h$", re.IGNORECASE),
]
# Seekfree 公共基础设施细分：
# - L1 HAL 接口（允许 app 层直接 include，类似 stdint.h 角色）：
#   类型 / 函数库 / 调试 / FIFO / 字体 — 不直接调用厂商寄存器
# - L0 vendor（仍视为底层）：clock_init / interrupt / 含厂商代码
SEEKFREE_COMMON_L1_PATTERNS = [
    re.compile(r"^zf_common_typedef\.h$", re.IGNORECASE),    # 类型基础 (uint8/PID_T)
    re.compile(r"^zf_common_function\.h$", re.IGNORECASE),   # 数学/PID/限幅工具
    re.compile(r"^zf_common_debug\.h$", re.IGNORECASE),      # 调试断言/printf 接口
    re.compile(r"^zf_common_fifo\.h$", re.IGNORECASE),       # 通用 FIFO 数据结构
    re.compile(r"^zf_common_font\.h$", re.IGNORECASE),       # 字体数据
]
SEEKFREE_COMMON_L0_PATTERNS = [
    re.compile(r"^zf_common_clock\.h$", re.IGNORECASE),      # 时钟初始化，含厂商代码
    re.compile(r"^zf_common_interrupt\.h$", re.IGNORECASE),  # 中断框架，含厂商代码
]
# Seekfree 高层组件（菜单 / 摄像头处理 / 编排）→ L4 middleware
SEEKFREE_COMPONENT_PATTERNS = [
    re.compile(r"^zf_components?_[a-z0-9_]+\.h$", re.IGNORECASE),
]

# Catch-all mega-header（间接拉入厂商头，等同 L0）
CATCH_ALL_PATTERNS = [
    re.compile(r"^[a-z_]*_?common_?headfile\.h$", re.IGNORECASE),
    re.compile(r"^[a-z_]*_headfile\.h$", re.IGNORECASE),
    re.compile(r"^headfile\.h$", re.IGNORECASE),
    re.compile(r"^all\.h$", re.IGNORECASE),
    re.compile(r"^globals?\.h$", re.IGNORECASE),
    re.compile(r"^project\.h$", re.IGNORECASE),
]

# 逐飞开源库标准 mega-header — 白名单放行（与 pre-write-check.py 同步）
CATCH_ALL_WHITELIST = {"zf_common_headfile.h"}

# 仅跳过构建产物 / git / 编辑器临时（不再跳 libraries/）
SKIP_DIRS = {"build", ".git", "node_modules", "__pycache__", ".vscode", ".idea",
             "Debug", "Release", "out"}

# include 提取正则（仅 "xxx.h"，跳过 <xxx.h> 系统头）
INCLUDE_RE = re.compile(r'#\s*include\s+"([^"]+)"')


def classify_file(path: str) -> float:
    """根据路径与文件名推断层级（basename 优先 → 路径片段次之）。"""
    norm = path.replace("\\", "/").lower()
    # 修复：relpath 的顶层目录无前导斜杠（app/x.c），补一个，使 "/app/" 等片段对顶层目录也命中
    nslash = "/" + norm.lstrip("/")
    basename_keep_case = os.path.basename(path)
    basename = os.path.basename(norm)

    # ===== L0 vendor（最高优先级）=====
    for pat in VENDOR_HEADER_PATTERNS:
        if pat.match(basename_keep_case) or pat.match(basename):
            return L_VENDOR
    for frag in VENDOR_PATH_FRAGMENTS:
        if frag in nslash:
            return L_VENDOR
    # Catch-all mega-header 视为 L0（间接拉厂商头），白名单排除
    for pat in CATCH_ALL_PATTERNS:
        if pat.match(basename) and basename not in CATCH_ALL_WHITELIST:
            return L_VENDOR

    # ===== L1a HAL adapter（特殊：允许 include L0）=====
    if re.search(r"(^|/)hal/ports/[^/]+/", norm):
        return L_HAL_ADAPTER

    # ===== Seekfree 公共基础设施分级（必须在 L3 driver 检查之前）=====
    # 类型 / 函数 / 调试 / FIFO / 字体 → L1（允许 app 层 include）
    for pat in SEEKFREE_COMMON_L1_PATTERNS:
        if pat.match(basename):
            return L_HAL
    # 时钟 / 中断（含厂商代码）→ L0
    for pat in SEEKFREE_COMMON_L0_PATTERNS:
        if pat.match(basename):
            return L_VENDOR

    # ===== L3 Seekfree drivers（zf_driver_* / zf_device_*）=====
    for pat in SEEKFREE_DRIVER_PATTERNS:
        if pat.match(basename):
            return L_DRV

    # ===== L4 Seekfree components（zf_components_*）=====
    for pat in SEEKFREE_COMPONENT_PATTERNS:
        if pat.match(basename):
            return L_MID

    # ===== L0~L6 路径标记 =====
    if "/vendor/" in nslash or "/sdk/" in nslash:
        return L_VENDOR

    if "/hal/inc/" in nslash or basename.startswith("hal_"):
        return L_HAL

    if "/bsp/" in nslash or basename.startswith("bsp_") or basename.startswith("board_"):
        return L_BSP

    if "/drivers/" in nslash or "/driver/" in nslash or "/drv/" in nslash \
            or basename.startswith("drv_"):
        return L_DRV

    if "/middleware/" in nslash or "/mid/" in nslash or basename.startswith("mid_"):
        return L_MID

    if "/service/" in nslash or "/services/" in nslash or "/svc/" in nslash \
            or basename.startswith("svc_"):
        return L_SVC

    if "/app/" in nslash or "/application/" in nslash \
            or "/project/code/app/" in nslash or "/code/app/" in nslash \
            or basename.startswith("app_") or basename.endswith("_app.h") \
            or basename.endswith("_app.c"):
        return L_APP

    return L_UNKNOWN


def extract_includes(path: str) -> list[str]:
    """提取一个文件的所有 #include "xxx.h" 项。"""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (OSError, UnicodeDecodeError):
        return []
    return INCLUDE_RE.findall(content)


def scan_project(root: str):
    """扫描工程，返回 (file_layers, edges, basename_index, direct_includes)。

    - file_layers: {rel_path: layer}
    - edges: [(src_path, src_layer, dst_basename, dst_layer)]
    - basename_index: {basename: rel_path}（用于传递 include 解析）
    - direct_includes: {rel_path: [include_basename]}
    """
    file_layers = {}
    basename_index = {}
    direct_includes = {}
    edges = []

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not (fn.endswith(".c") or fn.endswith(".h")):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace("\\", "/")
            layer = classify_file(rel)
            file_layers[rel] = layer
            # 同 basename 多个文件时保留任一（按发现顺序）
            basename_index.setdefault(os.path.basename(rel), rel)

    for rel, src_layer in file_layers.items():
        full = os.path.join(root, rel)
        includes = extract_includes(full)
        direct_includes[rel] = [os.path.basename(i.replace("\\", "/")) for i in includes]
        for inc in includes:
            inc_norm = inc.replace("\\", "/")
            dst_layer = classify_file(inc_norm)
            edges.append((rel, src_layer, inc_norm, dst_layer))

    return file_layers, edges, basename_index, direct_includes


def compute_transitive_layers(rel: str, basename_index: dict,
                              direct_includes: dict, file_layers: dict,
                              max_depth: int = 3) -> set:
    """BFS 计算 rel 的传递 include 闭包内出现过的所有层级。

    L1 HAL 接口对上层是黑盒 —— 不穿透其内部 include 看下层（接口黑盒原则）。

    返回经过的层级集合（不含 rel 自身）。
    """
    seen = set()
    queue = [(rel, 0)]
    layers_seen = set()
    while queue:
        cur, depth = queue.pop(0)
        if cur in seen or depth > max_depth:
            continue
        seen.add(cur)
        # L1 HAL 接口：进入即可，不继续穿透（接口黑盒）
        cur_layer = file_layers.get(cur, classify_file(cur))
        if cur != rel and cur_layer == L_HAL:
            layers_seen.add(L_HAL)
            continue
        for inc_base in direct_includes.get(cur, []):
            # 基于 basename 推断目标层级（即使工程内没有这个文件）
            guess_layer = classify_file(inc_base)
            if guess_layer != L_UNKNOWN:
                layers_seen.add(guess_layer)
            # 工程内有的文件继续递归
            target = basename_index.get(inc_base)
            if target and target not in seen:
                queue.append((target, depth + 1))
    return layers_seen


def check_transitive_violations(file_layers: dict, basename_index: dict,
                                 direct_includes: dict) -> list:
    """检查传递 include 违规：app 层文件间接拉入厂商头。"""
    violations = []
    for rel, layer in file_layers.items():
        if layer != L_APP:
            continue
        transitive = compute_transitive_layers(rel, basename_index,
                                               direct_includes, file_layers)
        if L_VENDOR in transitive:
            # 找到第一条传递路径作为证据
            path = trace_path_to_vendor(rel, basename_index, direct_includes,
                                       max_depth=3, file_layers=file_layers)
            path_str = " -> ".join(path) if path else "(unknown)"
            violations.append((
                rel, layer, "L0 vendor", L_VENDOR,
                "传递 include 违规：app 层经过 %s 间接拉入厂商头" % path_str,
            ))
    return violations


def trace_path_to_vendor(start: str, basename_index: dict,
                          direct_includes: dict, max_depth: int = 3,
                          file_layers: dict = None) -> list:
    """BFS 找到最短一条从 start 到任意厂商头的 include 路径。

    L1 HAL 接口黑盒：不穿透 L1 看其内部依赖（与 compute_transitive_layers 一致）。
    """
    queue = [(start, [start])]
    seen = set()
    while queue:
        cur, path = queue.pop(0)
        if cur in seen or len(path) > max_depth + 1:
            continue
        seen.add(cur)
        # L1 HAL 接口黑盒
        if file_layers is not None and cur != start:
            cur_layer = file_layers.get(cur, classify_file(cur))
            if cur_layer == L_HAL:
                continue
        for inc_base in direct_includes.get(cur, []):
            if classify_file(inc_base) == L_VENDOR:
                return path + [inc_base]
            target = basename_index.get(inc_base)
            if target and target not in seen:
                queue.append((target, path + [inc_base]))
    return []


def check_violations(edges: list) -> list:
    """检查所有违规边。"""
    violations = []
    for src, src_l, dst, dst_l in edges:
        # 跳过未分类（避免误报）
        if src_l == L_UNKNOWN:
            continue

        # 禁止 1: 上层 (L2+) include 厂商头
        if dst_l == L_VENDOR and src_l != L_HAL_ADAPTER:
            # L0/L1 adapter 是唯一可 include L0 的层
            if src_l > L_VENDOR:
                violations.append((
                    src, src_l, dst, dst_l,
                    "厂商头穿透：%s 不能 include L0 厂商头（只有 L1a hal-adapter 可以）" %
                    LAYER_NAMES[src_l],
                ))
                continue

        # 禁止 2: 反向依赖（下层 include 上层）
        if dst_l != L_UNKNOWN and dst_l < src_l and dst_l > L_VENDOR:
            # dst_l < src_l 在我们的编号体系里意味着 dst 是更高层
            # 不对，编号 L_APP=6 > L_HAL=1，src_l=APP，include L_HAL=1，dst_l(1) < src_l(6)
            # 这是正常的（上层依赖下层）。
            # 反向依赖应该是：src 是低层（小数字），dst 是高层（大数字）
            pass

        # 禁止 2 修正：src_l < dst_l 即为反向依赖
        if dst_l != L_UNKNOWN and dst_l != L_HAL_ADAPTER and src_l != L_HAL_ADAPTER \
                and src_l > L_VENDOR and dst_l > src_l:
            violations.append((
                src, src_l, dst, dst_l,
                "反向依赖：%s 不能 include %s（下层不得依赖上层）" %
                (LAYER_NAMES[src_l], LAYER_NAMES[dst_l]),
            ))
            continue

        # 禁止 3: app 层 (L6) 跨过 hal/drv 直接 include bsp (L2)
        if src_l == L_APP and dst_l == L_BSP:
            violations.append((
                src, src_l, dst, dst_l,
                "跨层跳跃：app 层不得直接 include bsp 层，应通过 hal 或 drv 中转",
            ))
            continue

    return violations


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    if not os.path.isdir(root):
        print("ERROR: not a directory: %s" % root, file=sys.stderr)
        sys.exit(2)

    print("==> include-graph scan: %s" % os.path.abspath(root), file=sys.stderr)

    file_layers, edges, basename_index, direct_includes = scan_project(root)

    # 汇总层级分布到 stderr
    layer_counts = defaultdict(int)
    for layer in file_layers.values():
        layer_counts[layer] += 1
    print("    files by layer:", file=sys.stderr)
    for layer in sorted(layer_counts.keys(), key=lambda x: (x if x >= 0 else -100)):
        print("      %s = %d" % (LAYER_NAMES[layer], layer_counts[layer]), file=sys.stderr)
    print("    total edges: %d" % len(edges), file=sys.stderr)

    # 第三方库内部违规视为 hint（用户不需修，外部代码已有结构）
    def is_library_internal(p: str) -> bool:
        norm = p.replace("\\", "/").lower()
        return any(frag in norm for frag in (
            "/libraries/", "/sdk/", "/vendor/", "/third_party/", "/drivers/",
            "/middlewares/", "/infineon_libraries/", "libraries/", "sdk/",
        ))

    direct_violations = check_violations(edges)
    user_direct = 0
    lib_direct = 0
    for v in direct_violations:
        src, src_l, dst, dst_l, reason = v
        src_l_name = LAYER_NAMES.get(src_l, str(src_l))
        dst_l_name = LAYER_NAMES.get(dst_l, str(dst_l))
        if is_library_internal(src):
            print("[LAYER-HINT] src=%s:%s -> dst=%s:%s  reason=%s（库内部债务，仅提示）" %
                  (src_l_name, src, dst_l_name, dst, reason), file=sys.stderr)
            lib_direct += 1
        else:
            print("[LAYER-VIOL] src=%s:%s -> dst=%s:%s  reason=%s" %
                  (src_l_name, src, dst_l_name, dst, reason))
            user_direct += 1

    trans_violations = check_transitive_violations(
        file_layers, basename_index, direct_includes
    )
    user_trans = 0
    for v in trans_violations:
        src, src_l, dst, dst_l, reason = v
        if is_library_internal(src):
            continue   # 传递违规已是间接，库内部不再额外报
        print("[LAYER-VIOL-TRANSITIVE] src=%s:%s  reason=%s" %
              (LAYER_NAMES[src_l], src, reason))
        user_trans += 1

    total = user_direct + user_trans
    print("", file=sys.stderr)
    print("    user violations: %d direct + %d transitive" % (user_direct, user_trans), file=sys.stderr)
    print("    library hints:   %d (informational)" % lib_direct, file=sys.stderr)
    if total:
        print("==> FAIL: %d user violations" % total, file=sys.stderr)
        sys.exit(1)
    else:
        print("==> PASS: 0 user violations (%d library hints)" % lib_direct, file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
