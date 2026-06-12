# RTOS 调试 Skill 用法

这个 skill 自带了一个可执行脚本 [scripts/rtos_debugger.py](../scripts/rtos_debugger.py)，适合在需要进行 RTOS 线程感知调试时直接调用。

## 能力概览

- 通过 ELF 符号自动检测 RTOS 类型（FreeRTOS、RT-Thread、Zephyr）
- 通过 GDB batch 模式读取任务列表和状态
- 检查各任务栈水位
- 死锁检测
- 队列/信号量状态查看

## 前置条件

- GDB Server 必须已在运行（OpenOCD 或 JLinkGDBServer）
- 带符号的 ELF 文件
- arm-none-eabi-gdb 或 gdb-multiarch

## 基础用法

```bash
# 探测 RTOS 类型和工具
python3 skills/rtos-debug/scripts/rtos_debugger.py --detect --elf build/app.elf

# 读取任务列表（需要 GDB Server 已运行）
python3 skills/rtos-debug/scripts/rtos_debugger.py \
  --tasks --elf build/app.elf --port 3333

# 检查栈水位
python3 skills/rtos-debug/scripts/rtos_debugger.py \
  --stack-check --elf build/app.elf --port 3333

# 死锁检测
python3 skills/rtos-debug/scripts/rtos_debugger.py \
  --deadlock --elf build/app.elf --port 3333

# 查看队列状态
python3 skills/rtos-debug/scripts/rtos_debugger.py \
  --queues --elf build/app.elf --port 3333
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--detect` | 检测 RTOS 类型和调试工具 |
| `--tasks` | 读取任务列表 |
| `--stack-check` | 检查各任务栈水位 |
| `--deadlock` | 检测死锁 |
| `--queues` | 列出队列/信号量状态 |
| `--elf` | ELF 文件路径 |
| `--rtos` | 显式指定 RTOS 类型 |
| `--gdb` | GDB 可执行文件路径 |
| `--port` | GDB 服务端口（默认 3333） |
| `-v`, `--verbose` | 详细输出 |

## RTOS 支持级别

| RTOS | 任务列表 | 栈水位 | 死锁检测 | 队列状态 |
|------|---------|--------|---------|---------|
| FreeRTOS | ✅ 完整 | ✅ 完整 | ✅ 基本 | ✅ 基本 |
| RT-Thread | ⚠️ 基本 | ⚠️ 基本 | ❌ | ❌ |
| Zephyr | ⚠️ 基本 | ⚠️ 基本 | ❌ | ❌ |

## 典型工作流

```bash
# 1. 启动 OpenOCD（或 JLinkGDBServer）
openocd -f interface/stlink.cfg -f target/stm32f4x.cfg &

# 2. 检测 RTOS 类型
python3 skills/rtos-debug/scripts/rtos_debugger.py --detect --elf build/app.elf

# 3. 查看任务状态
python3 skills/rtos-debug/scripts/rtos_debugger.py --tasks --elf build/app.elf

# 4. 检查栈水位
python3 skills/rtos-debug/scripts/rtos_debugger.py --stack-check --elf build/app.elf
```

## 返回码

- `0`：操作成功
- `1`：参数非法、依赖缺失、连接失败、读取失败
