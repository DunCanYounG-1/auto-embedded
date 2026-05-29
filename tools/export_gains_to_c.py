#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""export_gains_to_c.py — 控制增益矩阵 → C 头文件导出器

把 LQR / 极点配置 / Kalman 等控制器的增益矩阵从 numpy / MATLAB .mat / 命令行
内联格式导出为标准 C 头文件，含可选 CMSIS-DSP 矩阵乘代码模板。

用法（典型场景）：

    # 从 .npy 导出
    python export_gains_to_c.py --input K.npy --output lqr_gains.h --name K_BALANCE

    # 从 .mat 导出（需 scipy）
    python export_gains_to_c.py --input K.mat --mat-var K_d --output lqr_gains.h --name K

    # 命令行内联（MATLAB 风格，行用分号、列用逗号或空格）
    python export_gains_to_c.py --inline "1.2, 0.5, 0.1; 0.3, 0.8, 0.05" \
        --output lqr_gains.h --name K_LQR

    # 含 CMSIS-DSP 模板
    python export_gains_to_c.py --input K.npy --output lqr_gains.h \
        --name K_BALANCE --with-cmsis-template

    # 自测（生成 demo .h 验证导出器本身）
    python export_gains_to_c.py --demo

退出码：
    0 = 成功
    1 = 用户输入错误（缺参 / 维度不合理）
    2 = 内部错误（文件读写 / 解析失败）
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
from pathlib import Path
from typing import NoReturn


# === Windows: 强制 UTF-8 输出 ===
if sys.platform == "win32":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass


# ============================================================================
# 矩阵加载（4 种来源）
# ============================================================================

def load_npy(path: Path):
    try:
        import numpy as np
    except ImportError:
        die(2, "缺 numpy。pip install numpy")
    arr = np.load(str(path))
    return _to_list_of_list(arr)


def load_mat(path: Path, var_name: str | None):
    try:
        import scipy.io
        import numpy as np
    except ImportError:
        die(2, "缺 scipy。pip install scipy numpy")
    data = scipy.io.loadmat(str(path))
    # 过滤 scipy 注入的元数据键
    keys = [k for k in data.keys() if not k.startswith("__")]
    if not keys:
        die(2, ".mat 文件中无可用变量")
    if var_name:
        if var_name not in keys:
            die(1, f"--mat-var 指定的变量 '{var_name}' 不在文件中。可选：{keys}")
        arr = data[var_name]
    else:
        if len(keys) > 1:
            die(1, f".mat 文件含多个变量，必须用 --mat-var 指定其一。可选：{keys}")
        arr = data[keys[0]]
    return _to_list_of_list(arr)


def load_inline(text: str):
    """解析 MATLAB 风格内联：行用 ';'，列用 ',' 或空白"""
    rows_raw = [r.strip() for r in text.split(";") if r.strip()]
    if not rows_raw:
        die(1, "--inline 内容为空")
    matrix = []
    for r in rows_raw:
        # 用逗号或任意空白切
        cells = re.split(r"[,\s]+", r)
        cells = [c for c in cells if c]
        try:
            matrix.append([float(c) for c in cells])
        except ValueError as e:
            die(1, f"--inline 解析失败（非数值）：{e}")
    # 维度一致性
    width = len(matrix[0])
    for i, row in enumerate(matrix):
        if len(row) != width:
            die(1, f"--inline 行 {i+1} 列数 {len(row)} 与首行 {width} 不一致")
    return matrix


def _to_list_of_list(arr):
    """numpy ndarray → list of list；1D 视为 1xN 行向量"""
    if hasattr(arr, "ndim"):
        if arr.ndim == 1:
            return [[float(x) for x in arr]]
        if arr.ndim == 2:
            return [[float(x) for x in row] for row in arr]
        die(1, f"只支持 1D / 2D 矩阵，输入维度为 {arr.ndim}D")
    # 已是 list
    if isinstance(arr, list) and arr and isinstance(arr[0], list):
        return arr
    die(2, f"无法解析输入类型: {type(arr)}")


# ============================================================================
# 类型转换（float / fixed-point Q15 / Q31）
# ============================================================================

def to_c_value(x: float, dtype: str) -> str:
    if dtype == "float":
        return f"{x:.7e}f"
    if dtype == "double":
        return f"{x:.15e}"
    if dtype == "fixed_q15":
        # Q15: 范围 [-1, 1)，用 16 位定点
        clamped = max(min(x, 0.999969482), -1.0)
        q = int(round(clamped * 32768))
        q = max(min(q, 32767), -32768)
        return f"{q}"
    if dtype == "fixed_q31":
        clamped = max(min(x, 0.99999999953), -1.0)
        q = int(round(clamped * 2147483648))
        q = max(min(q, 2147483647), -2147483648)
        return f"{q}"
    die(1, f"--type 不支持: {dtype}")


def c_type_name(dtype: str) -> str:
    return {
        "float": "float",
        "double": "double",
        "fixed_q15": "q15_t",
        "fixed_q31": "q31_t",
    }[dtype]


# ============================================================================
# 头文件生成
# ============================================================================

def render_header(matrix, name: str, dtype: str, guard: str,
                  with_cmsis: bool, source_info: str) -> str:
    rows = len(matrix)
    cols = len(matrix[0])

    out = []
    out.append(f"/* {name.lower()}.h — 自动生成，请勿手改 */")
    out.append(f"/* 来源: {source_info} */")
    out.append(f"/* 维度: {rows} x {cols}  类型: {dtype} */")
    out.append("")
    out.append(f"#ifndef {guard}")
    out.append(f"#define {guard}")
    out.append("")

    if dtype.startswith("fixed_"):
        out.append("#include \"arm_math.h\"     /* CMSIS-DSP q15_t / q31_t */")
        out.append("")

    out.append(f"#define {name}_ROWS  {rows}")
    out.append(f"#define {name}_COLS  {cols}")
    out.append("")

    # 矩阵数据
    c_type = c_type_name(dtype)
    out.append(f"static const {c_type} {name}_DATA[{name}_ROWS][{name}_COLS] = {{")
    for row in matrix:
        cells = ", ".join(to_c_value(x, dtype) for x in row)
        out.append(f"    {{ {cells} }},")
    out.append("};")
    out.append("")

    # 也提供"扁平"初始化（CMSIS-DSP 用）
    out.append(f"/* 扁平化版本，供 CMSIS-DSP arm_matrix_instance_* 使用 */")
    out.append(f"#define {name}_FLAT_INIT \\")
    flat_cells = []
    for row in matrix:
        for x in row:
            flat_cells.append(to_c_value(x, dtype))
    # 每行 6 个
    for i in range(0, len(flat_cells), 6):
        chunk = ", ".join(flat_cells[i:i+6])
        suffix = " \\" if i + 6 < len(flat_cells) else ""
        out.append(f"    {chunk}{suffix}")
    out.append("")

    if with_cmsis:
        out.append(render_cmsis_template(name, rows, cols, dtype))
        out.append("")

    out.append(f"#endif /* {guard} */")
    out.append("")
    return "\n".join(out)


def render_cmsis_template(name: str, rows: int, cols: int, dtype: str) -> str:
    c_type = c_type_name(dtype)
    if dtype == "float":
        mat_type = "arm_matrix_instance_f32"
        mult_fn = "arm_mat_mult_f32"
    elif dtype == "fixed_q15":
        mat_type = "arm_matrix_instance_q15"
        mult_fn = "arm_mat_mult_q15"
    elif dtype == "fixed_q31":
        mat_type = "arm_matrix_instance_q31"
        mult_fn = "arm_mat_mult_q31"
    else:
        return ""

    lower = name.lower()
    template = f"""
/* ------------------------------------------------------------------
 * CMSIS-DSP 矩阵乘模板（u = -K * x）
 *
 * 在 .c 文件里写：
 *     #include "{lower}.h"
 *     #include "arm_math.h"
 *
 *     static {c_type} {lower}_data[{name}_ROWS][{name}_COLS] = {{ {name}_FLAT_INIT }};
 *     static {mat_type} {lower}_mat  = {{ {name}_ROWS, {name}_COLS, ({c_type} *){lower}_data }};
 *
 *     static {c_type} x_data[{name}_COLS] = {{0}};
 *     static {mat_type} x_mat = {{ {name}_COLS, 1, x_data }};
 *
 *     static {c_type} u_data[{name}_ROWS] = {{0}};
 *     static {mat_type} u_mat = {{ {name}_ROWS, 1, u_data }};
 *
 *     // 调用（在控制中断里）
 *     drv_get_state(x_data);
 *     {mult_fn}(&{lower}_mat, &x_mat, &u_mat);
 *     // u = -K * x
 *     for (int i = 0; i < {name}_ROWS; i++) u_data[i] = -u_data[i];
 *     // 执行器饱和保护后输出
 *     hal_actuator_set(u_data[0]);
 * ------------------------------------------------------------------ */
"""
    return template.strip("\n")


# ============================================================================
# 辅助
# ============================================================================

def die(code: int, msg: str) -> NoReturn:
    sys.stderr.write(f"[export_gains_to_c] ERROR: {msg}\n")
    sys.exit(code)


def info(msg: str):
    sys.stderr.write(f"[export_gains_to_c] {msg}\n")


def parse_args():
    p = argparse.ArgumentParser(
        description="控制增益矩阵 → C 头文件导出器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    src = p.add_mutually_exclusive_group()
    src.add_argument("--input", help="输入文件路径 (.npy / .mat / .txt)")
    src.add_argument("--inline", help="MATLAB 风格内联矩阵，如 '1,2;3,4'")
    src.add_argument("--demo", action="store_true",
                     help="自测模式：生成 _demo_gains.h 并验证")
    p.add_argument("--mat-var", help=".mat 文件中变量名（多变量时必填）")
    p.add_argument("--output", "-o", help="输出 .h 文件路径")
    p.add_argument("--name", help="C 常量名（如 K_BALANCE），默认从文件名推断")
    p.add_argument("--type", choices=["float", "double", "fixed_q15", "fixed_q31"],
                   default="float", help="C 数据类型（默认 float）")
    p.add_argument("--header-guard", help="#ifndef 守卫名（默认从 --name 派生）")
    p.add_argument("--with-cmsis-template", action="store_true",
                   help="附 CMSIS-DSP 矩阵乘代码模板")
    return p.parse_args()


# ============================================================================
# 主流程
# ============================================================================

def main() -> int:
    args = parse_args()

    # --- demo 自测分支 ---
    if args.demo:
        return run_demo()

    # --- 输入校验 ---
    if not (args.input or args.inline):
        die(1, "必须指定 --input / --inline / --demo 之一")
    if not args.output:
        die(1, "必须指定 --output")

    # --- 加载矩阵 ---
    if args.input:
        ipath = Path(args.input)
        if not ipath.is_file():
            die(1, f"输入文件不存在: {ipath}")
        ext = ipath.suffix.lower()
        if ext == ".npy":
            matrix = load_npy(ipath)
            src_info = f"npy file {ipath.name}"
        elif ext == ".mat":
            matrix = load_mat(ipath, args.mat_var)
            src_info = f"mat file {ipath.name} (var={args.mat_var or 'auto'})"
        else:
            die(1, f"不支持的输入扩展名: {ext}（支持 .npy / .mat）")
    else:
        matrix = load_inline(args.inline)
        src_info = "command-line inline"

    # --- 名字/守卫 ---
    name = args.name
    if not name:
        name = Path(args.output).stem.upper().replace("-", "_").replace(".", "_")
    if not re.match(r"^[A-Z_][A-Z0-9_]*$", name):
        die(1, f"--name '{name}' 不是合法的 C 标识符（大写+下划线）")
    guard = args.header_guard or f"{name}_H"

    # --- 维度检查 ---
    rows = len(matrix)
    cols = len(matrix[0]) if rows else 0
    if rows == 0 or cols == 0:
        die(1, "矩阵维度为 0")
    if rows > 64 or cols > 64:
        info(f"WARN: 矩阵 {rows}x{cols} 较大，注意 MCU Flash 占用")

    # --- 生成 ---
    content = render_header(matrix, name, args.type, guard,
                            args.with_cmsis_template, src_info)

    # --- 写出 ---
    opath = Path(args.output)
    opath.parent.mkdir(parents=True, exist_ok=True)
    opath.write_text(content, encoding="utf-8")
    info(f"已生成 {opath}  ({rows}x{cols}, {args.type})")
    return 0


# ============================================================================
# Demo 自测
# ============================================================================

def run_demo() -> int:
    """生成 _demo_gains.h 验证导出器自身"""
    info("=== Demo 模式 ===")

    # 模拟一个两轮平衡车 LQR K 矩阵：1x4（u = -K*x，状态 [θ ω x v]）
    matrix = [
        [-12.345, -1.876, -0.500, -0.823],
    ]

    demo_path = Path("_demo_gains.h").resolve()
    content = render_header(
        matrix=matrix,
        name="K_DEMO_BALANCE",
        dtype="float",
        guard="K_DEMO_BALANCE_H",
        with_cmsis=True,
        source_info="demo (export_gains_to_c.py --demo)",
    )
    demo_path.write_text(content, encoding="utf-8")
    info(f"已生成 {demo_path}")

    # 简单内容校验（无需 gcc）
    text = demo_path.read_text(encoding="utf-8")
    checks = [
        ("#ifndef K_DEMO_BALANCE_H", "header guard"),
        ("K_DEMO_BALANCE_DATA[K_DEMO_BALANCE_ROWS][K_DEMO_BALANCE_COLS]", "矩阵定义"),
        ("K_DEMO_BALANCE_FLAT_INIT", "扁平初始化宏"),
        ("arm_mat_mult_f32", "CMSIS-DSP 模板"),
        ("-1.2345000e+01f", "数值精度"),
    ]
    failed = []
    for needle, label in checks:
        if needle not in text:
            failed.append(f"  ✗ {label}: 未找到 '{needle}'")
        else:
            info(f"  ✓ {label}")
    if failed:
        for f in failed:
            sys.stderr.write(f + "\n")
        return 2
    info("Demo 全部检查通过")
    info(f"产物: {demo_path}（可手动 gcc -c 验证编译）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
