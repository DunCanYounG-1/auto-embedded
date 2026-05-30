# GDB OpenOCD 调试 Skill 用法

这个 skill 自带了一个可执行脚本 [scripts/gdb_debugger.py](../scripts/gdb_debugger.py)，适合在需要探测调试环境、启动 OpenOCD 服务、连接 GDB 并执行调试操作时直接调用。

## 能力概览

- 探测 OpenOCD、GDB（arm-none-eabi-gdb / gdb-multiarch）是否可用
- 自动探测已连接的调试探针
- 验证 ELF 符号文件存在性
- 启动 OpenOCD 后台服务并等待端口就绪
- 生成 GDB 初始化脚本并执行调试命令
- 三种调试模式：download-and-halt、attach-only、crash-context
- crash-context 模式自动抓取寄存器、回溯和线程信息
- 输出结构化的调试结果报告

## 基础用法

```bash
# 探测调试环境
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py --detect

# 下载并停核（默认模式）
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py \
  --elf build/debug/app.elf \
  --interface stlink \
  --target target/stm32f4x.cfg

# 附着调试（不复位、不加载）
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py \
  --elf build/debug/app.elf \
  --config board/st_nucleo_f4.cfg \
  --mode attach-only

# 崩溃现场检查
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py \
  --elf build/debug/app.elf \
  --interface cmsis-dap \
  --target target/stm32f1x.cfg \
  --mode crash-context
```

## 常见模式

### 1. 环境探测

```bash
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py --detect
```

输出 OpenOCD 版本、GDB 版本、已连接探针。

### 2. download-and-halt（默认）

```bash
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py \
  --elf build/app.elf \
  --interface stlink \
  --target target/stm32f4x.cfg
```

复位目标、加载 ELF、停在入口点。适合开始新的调试会话。

### 3. attach-only

```bash
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py \
  --elf build/app.elf \
  --config board/st_nucleo_f4.cfg \
  --mode attach-only
```

连接到正在运行的目标，不复位、不加载。适合观察运行中的固件状态。

### 4. crash-context

```bash
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py \
  --elf build/app.elf \
  --interface stlink \
  --target target/stm32f4x.cfg \
  --mode crash-context
```

以最小干扰方式连接，自动抓取寄存器、回溯和线程信息。适合崩溃后现场分析。

### 5. 指定 GDB 可执行文件

```bash
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py \
  --elf build/app.elf \
  --config board/st_nucleo_f4.cfg \
  --gdb /opt/toolchain/bin/arm-none-eabi-gdb
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--detect` | 探测调试环境（OpenOCD、GDB、探针） |
| `--elf` | 带符号的 ELF 文件路径 |
| `--mode` | 调试模式：`download-and-halt`（默认）、`attach-only`、`crash-context` |
| `--gdb` | GDB 可执行文件路径 |
| `--interface` | 调试接口：`stlink`、`cmsis-dap`、`daplink`、`jlink` |
| `--target` | OpenOCD 目标配置，可重复 |
| `--config` | 额外 OpenOCD `-f` 配置，可重复 |
| `--no-detect` | 禁止自动探测调试接口 |
| `--port` | OpenOCD GDB 服务端口，默认 `3333` |
| `-v`, `--verbose` | 输出详细日志 |

## 返回码

- `0`：调试会话成功建立并完成指定操作
- `1`：参数非法、依赖缺失、连接失败、或调试操作失败

## 与 Skill 的配合方式

在 `debug-gdb-openocd` skill 中，推荐工作流是：

1. 先根据用户输入或 `Project Profile` 确定 ELF 路径、调试模式和 OpenOCD 配置
2. 若不确定环境是否就绪，先用 `--detect` 确认
3. 选择合适的调试模式
4. 将脚本输出的调试结果和关键观察整理成简洁摘要
5. 更新 `Project Profile`，需要时交给 `serial-monitor`
