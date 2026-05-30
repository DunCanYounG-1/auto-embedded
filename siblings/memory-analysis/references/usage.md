# 固件内存分析 Skill 用法

这个 skill 自带了一个可执行脚本 [scripts/memory_analyzer.py](../scripts/memory_analyzer.py)，适合在需要分析固件内存使用、查找大符号或对比版本变化时直接调用。

## 能力概览

- 解析 GCC/ARM .map 文件提取 section 和符号信息
- 通过 arm-none-eabi-size 解析 ELF section
- 解析链接脚本获取 FLASH/RAM 总容量
- 内存使用率告警
- 两个 .map 文件的对比分析
- 自动扫描构建目录

## 基础用法

```bash
# 探测分析工具
python3 skills/memory-analysis/scripts/memory_analyzer.py --detect

# 扫描构建目录
python3 skills/memory-analysis/scripts/memory_analyzer.py --scan build/

# 分析 .map 文件
python3 skills/memory-analysis/scripts/memory_analyzer.py --map-file build/app.map

# 分析 .map 文件并计算使用率
python3 skills/memory-analysis/scripts/memory_analyzer.py \
  --map-file build/app.map \
  --linker-script STM32F407VGTx_FLASH.ld

# 分析 ELF 文件
python3 skills/memory-analysis/scripts/memory_analyzer.py --elf build/app.elf

# 对比两个 .map 文件
python3 skills/memory-analysis/scripts/memory_analyzer.py \
  --compare build_old/app.map build_new/app.map
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--detect` | 探测分析工具可用性 |
| `--map-file` | .map 文件路径 |
| `--elf` | ELF 文件路径 |
| `--linker-script` | 链接脚本路径（用于获取总容量） |
| `--threshold` | 使用率告警阈值百分比（默认 85） |
| `--top` | 按大小排序显示前 N 个符号（默认 20） |
| `--compare` | 对比两个 .map 文件 |
| `--scan` | 扫描构建目录中的 .map 和 ELF 文件 |
| `-v`, `--verbose` | 详细输出 |

## 典型场景

### 1. 开发迭代 — 检查内存是否够用

```bash
python3 skills/memory-analysis/scripts/memory_analyzer.py \
  --map-file build/app.map \
  --linker-script STM32F103C8_FLASH.ld \
  --threshold 90
```

STM32F103C8 只有 64KB Flash + 20KB RAM，需要密切关注使用率。

### 2. 代码审查 — 对比 PR 前后内存变化

```bash
python3 skills/memory-analysis/scripts/memory_analyzer.py \
  --compare build_main/app.map build_pr/app.map
```

### 3. 优化 — 找出最大的符号

```bash
python3 skills/memory-analysis/scripts/memory_analyzer.py \
  --map-file build/app.map --top 50
```

## 返回码

- `0`：分析成功
- `1`：参数非法、文件缺失、解析失败
