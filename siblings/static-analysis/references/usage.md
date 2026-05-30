# 静态分析 Skill 用法

这个 skill 自带了一个可执行脚本 [scripts/static_analyzer.py](../scripts/static_analyzer.py)，适合在需要对嵌入式 C/C++ 代码进行静态分析或 MISRA 合规检查时直接调用。

## 能力概览

- 探测 cppcheck、clang-tidy、GCC analyzer 可用性
- 运行 cppcheck 分析并解析 XML 输出
- 运行 clang-tidy 分析并解析输出
- 运行 GCC `-fanalyzer` 路径敏感分析
- MISRA-C 2012 合规检查
- 按严重级别分组输出结果

## 基础用法

```bash
# 探测工具
python3 skills/static-analysis/scripts/static_analyzer.py --detect

# cppcheck 分析
python3 skills/static-analysis/scripts/static_analyzer.py \
  --cppcheck --source src/

# cppcheck + MISRA 合规
python3 skills/static-analysis/scripts/static_analyzer.py \
  --cppcheck --source src/ --misra

# clang-tidy 分析
python3 skills/static-analysis/scripts/static_analyzer.py \
  --clang-tidy --source src/ --compile-db build/compile_commands.json

# GCC analyzer
python3 skills/static-analysis/scripts/static_analyzer.py \
  --gcc-analyzer --source src/main.c src/uart.c

# 只看摘要
python3 skills/static-analysis/scripts/static_analyzer.py \
  --cppcheck --source src/ --summary
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--detect` | 探测静态分析工具可用性 |
| `--cppcheck` | 运行 cppcheck |
| `--clang-tidy` | 运行 clang-tidy |
| `--gcc-analyzer` | 运行 GCC `-fanalyzer` |
| `--source` | 源码目录或文件列表 |
| `--misra` | 启用 MISRA-C 2012 检查 |
| `--compile-db` | compile_commands.json 路径 |
| `--severity` | 最低过滤级别（默认 style） |
| `--summary` | 只输出统计摘要 |
| `-v`, `--verbose` | 详细输出 |

## 工具对比

| 工具 | 优势 | 缺点 | 推荐场景 |
|------|------|------|----------|
| cppcheck | 嵌入式友好，MISRA 支持 | 误报率中等 | 日常检查、MISRA 合规 |
| clang-tidy | 准确性高，现代 C++ | 需要编译数据库 | 精确分析 |
| GCC -fanalyzer | 路径敏感，无需额外安装 | 需要 GCC 12+ | 深度缺陷检测 |

## 生成 compile_commands.json

clang-tidy 需要编译数据库才能准确分析。生成方法：

```bash
# CMake
cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON -B build

# Bear（适用于 Makefile）
bear -- make

# PlatformIO
pio run -t compiledb
```

## 返回码

- `0`：分析完成（可能有发现但无 error 级别）
- `1`：参数非法、工具缺失、或有 error 级别发现
