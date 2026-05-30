# PlatformIO 烧录 Skill 用法

## 基础用法

```bash
# 探测环境和设备
python scripts/pio_flasher.py --detect

# 列出已连接设备
python scripts/pio_flasher.py --list-devices

# 烧录默认环境
python scripts/pio_flasher.py --flash --project-dir /path/to/project

# 烧录指定环境
python scripts/pio_flasher.py --flash --project-dir /path/to/project --env esp32dev

# 指定上传端口
python scripts/pio_flasher.py --flash --project-dir /path/to/project --env esp32dev --upload-port COM3
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--detect` | 探测 PlatformIO 环境和已连接设备 |
| `--flash` | 执行烧录 |
| `--project-dir` | PlatformIO 工程目录（包含 `platformio.ini`） |
| `--env` | 构建环境名称 |
| `--upload-port` | 上传端口（如 COM3、/dev/ttyUSB0） |
| `--list-devices` | 列出已连接设备 |
| `--save-config` | 保存工具路径到配置 |
| `-v`, `--verbose` | 详细输出 |

## 返回码

- `0`：烧录成功或探测/列表操作成功
- `1`：烧录失败、PlatformIO 未安装或参数错误

## 与 build-platformio 的配合

```bash
# 1. 构建
python skills/build-platformio/scripts/platformio_builder.py --project-dir /path/to/project --env esp32dev

# 2. 烧录
python skills/flash-platformio/scripts/pio_flasher.py --flash --project-dir /path/to/project --env esp32dev
```
