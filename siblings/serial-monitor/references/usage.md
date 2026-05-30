# 串口监视 Skill 用法

这个 skill 自带了一个可执行脚本 [scripts/serial_monitor.py](../scripts/serial_monitor.py)，适合在需要重复抓串口日志、验证启动行为或捕获早期启动信息时直接调用。

## 能力概览

- 自动列出并识别常见串口设备
- 自动选择最可能的串口
- 定长抓取、等待关键字符串、交互式持续监视
- 保存日志到文件，并可为每行追加时间戳
- 对日志做基础状态分析，快速区分正常/警告/错误
- 支持“先监听再复位”，降低启动日志丢失概率
- 可选通过 OpenOCD 自动复位目标板

## 基础用法

```bash
# 列出串口
python3 skills/serial-monitor/scripts/serial_monitor.py --list

# 自动检测串口并读取 5 秒
python3 skills/serial-monitor/scripts/serial_monitor.py --auto --duration 5

# 指定串口和波特率
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --port /dev/ttyACM0 \
  --baud 115200 \
  --duration 3
```

## 常见模式

### 1. 等待关键字符串

```bash
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --port /dev/ttyACM0 \
  --wait "System Start"
```

适合验证系统是否完成启动，或是否输出某段断言/错误文本。

### 2. 交互式持续监视

```bash
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --port COM7 \
  --monitor \
  --timestamp
```

- 持续显示串口输出
- 使用 `Ctrl+C` 退出
- 推荐在联调阶段开启 `--timestamp`

### 3. 保存日志

```bash
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto \
  --duration 30 \
  --save logs/run.log
```

日志文件会自动创建父目录，并逐行追加写入。

### 4. 先监听，再等待复位

```bash
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto \
  --wait-reset \
  --duration 5 \
  --save logs/startup.log
```

推荐用于容易丢失早期启动日志的场景。流程为：

1. 先打开串口并开始监听
2. 提示用户复位目标板
3. 检测到新的串口数据后立即开始记录
4. 输出分析结果并保存启动日志

### 5. 使用 OpenOCD 自动复位

如果已经明确 OpenOCD 配置，可以把复位动作也交给脚本：

```bash
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto \
  --wait-reset \
  --auto-reset \
  --interface stlink \
  --openocd-target target/stm32f4x.cfg \
  --duration 5
```

也可以直接传入完整板级配置：

```bash
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --port /dev/ttyUSB0 \
  --wait-reset \
  --auto-reset \
  --openocd-config board/st_nucleo_f4.cfg \
  --duration 5
```

注意：

- `--auto-reset` 必须与 `--wait-reset` 一起使用
- 至少提供 `--openocd-config` 或 `--openocd-target`
- 如果不显式指定 `--interface`，脚本会尝试探测 `stlink`、`cmsis-dap`、`jlink`

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--list` | 列出所有可见串口 |
| `--auto` | 自动选择最可能的串口 |
| `--port` | 显式指定串口 |
| `--baud` | 波特率，默认 `115200` |
| `--duration` | 读取时长（秒） |
| `--clear` | 读取前清空缓冲区 |
| `--wait` | 等待指定字符串出现后结束 |
| `--monitor` | 持续监视，直到 `Ctrl+C` |
| `--save` | 将日志保存到文件 |
| `--timestamp` | 为每行输出加时间戳 |
| `-v`, `--verbose` | 打印更详细的统计信息 |
| `--keep` | 保留已有缓冲区内容 |
| `--wait-reset` | 先监听，再等待目标复位 |
| `--auto-reset` | 在等待复位模式下通过 OpenOCD 自动复位 |
| `--interface` | 调试接口：`stlink`、`cmsis-dap`、`daplink`、`jlink` |
| `--no-detect` | 禁止自动探测调试接口 |
| `--openocd-config` | 额外传入 OpenOCD `-f` 配置，可重复 |
| `--openocd-target` | 目标或板级 OpenOCD 配置，可重复 |
| `--openocd-command` | 自动复位时执行的 OpenOCD 命令 |

## 返回码

- `0`：串口会话成功，或虽未识别明确健康信号但没有发现硬错误
- `1`：参数非法、依赖缺失、串口无法打开、检测到错误相关日志，或用户中断

## AI 使用场景

### 场景 1：验证系统启动

```bash
# 烧录后等待启动信息
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto --wait "System Start"
# 输出: ✅ 检测到关键字符串: System Start
```

### 场景 2：检测运行错误

```bash
# 读取 10 秒，检查是否有错误
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto --duration 10 -v
# 如果有错误会显示:
# ❌ 检测到 1 条错误相关日志
# ❌ 错误样例:
#   [ERROR] I2C timeout
```

### 场景 3：一键复位并捕获完整启动日志

```bash
# 自动复位（最简单，需要 OpenOCD + 调试器）
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto --wait-reset --auto-reset \
  --interface stlink --openocd-target target/stm32f4x.cfg \
  --duration 5 -v
```

### 场景 4：保存测试日志供后续分析

```bash
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto --duration 60 --save test_log.txt --timestamp
```

## 推荐工作流

### 标准工作流（芯片已在运行）

```bash
# 1. 等待启动完成
python3 skills/serial-monitor/scripts/serial_monitor.py --auto --wait "System Start"

# 2. 检查运行状态
python3 skills/serial-monitor/scripts/serial_monitor.py --auto --duration 3 -v

# 3. 持续监控
python3 skills/serial-monitor/scripts/serial_monitor.py --auto --monitor --timestamp
```

### 捕获完整启动日志

```bash
# 方法 1：自动复位（推荐）
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto --wait-reset --auto-reset \
  --interface stlink --openocd-target target/stm32f4x.cfg \
  --duration 5 --save startup.log

# 方法 2：手动复位
python3 skills/serial-monitor/scripts/serial_monitor.py \
  --auto --wait-reset --duration 5 --save startup.log
# 看到提示后，在另一个终端烧录或按复位键

# 方法 3：读取缓冲区历史数据
python3 skills/serial-monitor/scripts/serial_monitor.py --auto --keep
```

### 场景选择参考

| 场景 | 推荐参数 |
|------|---------|
| 一键复位+监控 | `--auto --wait-reset --auto-reset --interface ... --openocd-target ...` |
| 烧录后查看日志 | `--auto --wait-reset` |
| 芯片已在运行 | `--auto --keep` |
| 长时间监控 | `--auto --monitor --timestamp` |
| 保存启动日志 | `--auto --wait-reset --auto-reset --save log.txt` |
| 验证特定功能 | `--auto --wait "OK"` |

## 故障排查

### 提示 PermissionError

串口被其他程序占用。关闭串口助手、IDE 或其他监视工具。

### 自动检测选择了错误的串口

使用 `--list` 查看所有串口，然后用 `--port` 手动指定。

### 看不到输出

1. 检查波特率是否匹配（默认 115200）
2. 检查 TX/RX 是否接反
3. 使用 `--clear` 清空缓冲区
4. 尝试复位开发板

### --wait-reset 模式超时

- 确保在 30 秒内复位芯片或烧录固件
- 检查串口连接是否正确
- 检查芯片是否正常工作

### --auto-reset 失败

1. 确认 OpenOCD 已安装：`openocd --version`
2. 确认调试器已连接且驱动正常
3. 确认 SWD 接线正确（SWDIO→PA13, SWCLK→PA14, GND→GND）
4. 尝试用 `--interface` 手动指定调试器类型

## 依赖安装

```bash
# 基础依赖（必需）
pip install pyserial

# OpenOCD（仅 --auto-reset 功能需要）
# Linux: sudo apt install openocd
# macOS: brew install openocd
# Windows: https://github.com/openocd-org/openocd/releases
```

## 与 Skill 的配合方式

在 `serial-monitor` skill 中，推荐工作流是：

1. 先根据用户输入或 `Project Profile` 决定端口和波特率
2. 选择合适的脚本模式，例如 `--wait`、`--monitor`、`--wait-reset`
3. 将脚本分析结果整理成简洁摘要，而不是原样粘贴整段日志
4. 若日志显示 Fault、断言、死循环或启动异常，交给 `debug-gdb-openocd`
