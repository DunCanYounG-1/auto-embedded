# CAN 总线调试 Skill 用法

## 基础用法

```bash
# 探测环境
python scripts/can_tool.py --detect

# 监听总线（10 秒）
python scripts/can_tool.py --interface pcan --channel PCAN_USBBUS1 --listen --duration 10

# 监听并过滤 ID 范围
python scripts/can_tool.py --interface pcan --channel PCAN_USBBUS1 --listen --filter 0x100-0x1FF

# 发送单帧
python scripts/can_tool.py --interface pcan --channel PCAN_USBBUS1 --send --id 0x123 --data 01,02,03,04

# 发送并等待响应
python scripts/can_tool.py --interface pcan --channel PCAN_USBBUS1 --send --id 0x123 --data 01,02 --wait-id 0x124

# 扫描节点
python scripts/can_tool.py --interface pcan --channel PCAN_USBBUS1 --scan --scan-range 0x001-0x0FF

# 使用 virtual 接口测试（无需硬件）
python scripts/can_tool.py --interface virtual --channel test --send --id 0x123 --data AA,BB,CC

# JSON 格式监听
python scripts/can_tool.py --interface pcan --channel PCAN_USBBUS1 --listen --format json
```

## 参数说明

### 模式参数

| 参数 | 说明 |
| --- | --- |
| `--detect` | 探测 python-can 环境 |
| `--listen` | 监听 CAN 总线 |
| `--send` | 发送 CAN 帧 |
| `--scan` | 扫描 CAN 节点 |

### 连接参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--interface` | virtual | CAN 接口类型 |
| `--channel` | test | 通道名 |
| `--bitrate` | 500000 | 波特率 |
| `--timeout` | 1.0 | 接收超时秒数 |

### 发送参数

| 参数 | 说明 |
| --- | --- |
| `--id` | CAN ID（如 0x123） |
| `--data` | 数据字节，逗号分隔十六进制（如 01,02,FF） |
| `--wait-id` | 发送后等待响应的 CAN ID |
| `--extended` | 使用扩展帧（29 位 ID） |

### 监听和扫描

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--filter` | — | 监听过滤 ID 范围（如 0x100-0x1FF） |
| `--scan-range` | 0x001-0x7FF | 扫描 ID 范围 |
| `--duration` | 10 | 监听持续秒数（0=无限） |
| `--format` | table | 输出格式：table、raw、json |

## 常见接口类型

| 接口 | 通道示例 | 说明 |
| --- | --- | --- |
| pcan | PCAN_USBBUS1 | PEAK USB-CAN 适配器 |
| kvaser | 0 | Kvaser USB-CAN |
| slcan | COM3 / /dev/ttyACM0 | CANable 等串口 CAN |
| socketcan | can0 | Linux SocketCAN |
| virtual | test | 虚拟总线（测试用） |

## 返回码

- `0`：操作成功
- `1`：连接失败、无响应或参数错误
