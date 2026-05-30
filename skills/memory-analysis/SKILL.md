---
name: memory-analysis
description: 当需要解析 .map 文件或 ELF 获取固件内存使用报告、符号大小排名或版本对比时使用。
---

# 固件内存分析

## 适用场景

- 构建完成后需要了解固件的 Flash/RAM 使用情况。
- 需要找出占用空间最大的函数或变量。
- 需要对比两次构建的内存变化，追踪代码膨胀。
- 需要确认固件是否即将超出芯片内存限制。
- 需要解析链接脚本获取芯片 Flash/RAM 总容量。

## 必要输入

- `.map` 文件路径（GCC/ARM 链接器生成），或 ELF 文件路径。
- 可选的链接脚本路径（用于计算使用率百分比）。
- 可选的告警阈值和 Top-N 符号数量。

## 自动探测

- `--scan` 模式自动搜索构建目录中的 `.map` 和 ELF 文件。
- 解析 `.map` 文件中的 `Memory Configuration` 块获取 FLASH/RAM 总容量。
- 若提供链接脚本，从 `MEMORY {}` 块解析容量信息。
- 自动检测 `arm-none-eabi-size` 和 `arm-none-eabi-readelf` 可用性。

## 执行步骤

1. 先阅读 [references/usage.md](references/usage.md)，确认本次是环境探测、构建目录扫描，还是执行分析。
2. 若不确定工具是否可用，先运行 [scripts/memory_analyzer.py](scripts/memory_analyzer.py) 的 `--detect` 模式确认。
3. 使用 `--scan <build_dir>` 自动查找可分析的文件。
4. 使用 `--map-file` 或 `--elf` 执行内存分析。
5. 可选使用 `--linker-script` 获取总容量并计算使用率。
6. 使用 `--top <N>` 查看占用最大的符号。
7. 使用 `--compare` 对比两个 `.map` 文件的差异。

## 失败分流

- 当 `arm-none-eabi-size` 或 `arm-none-eabi-readelf` 不可用且需要 ELF 分析时，返回 `environment-missing`。
- 当指定的 `.map` 或 ELF 文件不存在时，返回 `artifact-missing`。
- 当 `.map` 文件格式无法识别或解析失败时，返回 `project-config-error`。
- 当内存使用率超过告警阈值时，在成功结果中附带告警信息。

## 平台说明

- `.map` 文件解析使用纯正则，无需外部工具，全平台可用。
- ELF 分析需要 `arm-none-eabi-size`，通常随交叉编译工具链安装。
- 链接脚本解析使用纯正则，支持 GCC LD 格式。

## 输出约定

- 输出各 section（.text, .rodata, .data, .bss）的大小和地址。
- 输出 Flash 使用量（.text + .rodata + .data）和 RAM 使用量（.data + .bss）。
- 若有总容量信息，输出使用率百分比和告警状态。
- 输出按大小排序的 Top-N 符号列表。
- 对比模式输出各 section 和符号的增减变化。

## 交接关系

- 当内存即将溢出需要优化时，建议用户审查 Top-N 大符号。
- 当需要定位具体函数在代码中的位置时，可配合 IDE 或 `grep` 使用。
