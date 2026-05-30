---
name: static-analysis
description: 当需要对嵌入式 C/C++ 代码运行 cppcheck、clang-tidy 或 GCC analyzer 静态分析，或进行 MISRA-C 合规检查时使用。
---

# 静态分析

## 适用场景

- 提交前需要对代码进行静态分析，发现潜在缺陷。
- 汽车、医疗等行业需要 MISRA-C 2012 合规检查。
- 需要使用 cppcheck、clang-tidy 或 GCC `-fanalyzer` 进行代码质量审查。
- 需要对静态分析结果按严重级别分组查看摘要。

## 必要输入

- 源码目录路径。
- 至少一个可用的静态分析工具（cppcheck、clang-tidy 或 GCC 12+）。
- 可选的 `compile_commands.json` 路径（提升 clang-tidy 准确性）。
- 可选的严重级别过滤和 MISRA 检查开关。

## 自动探测

- `--detect` 模式检测 cppcheck、clang-tidy 和 arm-none-eabi-gcc 的可用性和版本。
- GCC `-fanalyzer` 需要 GCC 12+，脚本会检查版本号。
- 自动搜索工作区中的 `compile_commands.json`。

## 执行步骤

1. 先阅读 [references/usage.md](references/usage.md)，确认本次使用哪个分析工具。
2. 若不确定工具是否可用，先运行 [scripts/static_analyzer.py](scripts/static_analyzer.py) 的 `--detect` 模式。
3. 使用 `--cppcheck --source <dir>` 运行 cppcheck 分析。
4. 使用 `--clang-tidy --source <dir>` 运行 clang-tidy 分析。
5. 使用 `--gcc-analyzer --source <files>` 运行 GCC analyzer 分析。
6. 需要 MISRA 合规时，添加 `--misra` 参数启用 cppcheck MISRA addon。
7. 阅读 [references/misra-quick-ref.md](references/misra-quick-ref.md) 了解常见 MISRA 违规。

## 失败分流

- 当所有分析工具都不可用时，返回 `environment-missing`。
- 当指定的源码目录不存在时，返回 `artifact-missing`。
- 当 `compile_commands.json` 指定但无效时，返回 `project-config-error`。
- 当分析工具运行异常退出时，返回 `target-response-abnormal`。

## 平台说明

- cppcheck 和 clang-tidy 在三大平台均可用，通过包管理器安装。
- GCC `-fanalyzer` 需要 GCC 12+，嵌入式交叉编译器版本可能较低。
- 自带脚本使用 Python 标准库和 subprocess，跨平台兼容。

## 输出约定

- 按严重级别（error、warning、style、information）分组输出发现。
- 每条发现包含文件路径、行号、规则 ID 和描述。
- `--summary` 模式只输出统计数字。
- MISRA 模式额外输出违反的规则编号。

## 交接关系

- 当发现严重缺陷需要修复后重新构建时，交给对应的 `build-*` skill。
- 当需要了解代码内存影响时，交给 `memory-analysis`。
