# PlatformIO 调试 Skill 用法

## 基础用法

```bash
# 探测调试环境
python scripts/pio_debugger.py --detect --project-dir /path/to/project --env esp32dev

# 下载固件并暂停调试
python scripts/pio_debugger.py --project-dir /path/to/project --env esp32dev --mode download-and-halt

# 附加到运行中的目标
python scripts/pio_debugger.py --project-dir /path/to/project --env esp32dev --mode attach-only

# 崩溃现场分析
python scripts/pio_debugger.py --project-dir /path/to/project --env esp32dev --mode crash-context
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--detect` | 探测 PlatformIO 调试环境 |
| `--project-dir` | PlatformIO 工程目录（包含 `platformio.ini`） |
| `--env` | 构建环境名称 |
| `--mode` | 调试模式：download-and-halt、attach-only、crash-context |
| `-v`, `--verbose` | 详细输出 |

## 调试模式说明

- `download-and-halt`：下载固件 → 复位暂停 → 输出寄存器和回溯
- `attach-only`：附加到目标 → 输出寄存器、回溯和线程信息
- `crash-context`：暂停目标 → 输出寄存器、完整回溯、Fault 寄存器

## 返回码

- `0`：调试会话成功完成
- `1`：调试失败、PlatformIO 未安装或参数错误

## 与 build-platformio 的配合

```bash
# 1. 构建
python skills/build-platformio/scripts/platformio_builder.py --project-dir /path/to/project --env esp32dev

# 2. 调试
python skills/debug-platformio/scripts/pio_debugger.py --project-dir /path/to/project --env esp32dev --mode download-and-halt
```
