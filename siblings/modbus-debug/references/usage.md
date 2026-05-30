# Modbus 调试 Skill 用法

## 基础用法

```bash
# 探测环境
python scripts/modbus_tool.py --detect

# 读保持寄存器（RTU）
python scripts/modbus_tool.py --port COM42 --slave 1 --read --address 0 --count 10

# 读输入寄存器
python scripts/modbus_tool.py --port COM42 --slave 1 --read --address 0 --count 5 --type input

# 读线圈
python scripts/modbus_tool.py --port COM42 --slave 1 --read --address 0 --count 8 --type coil

# 写保持寄存器
python scripts/modbus_tool.py --port COM42 --slave 1 --write --address 0 --values 100,200,300

# 写线圈
python scripts/modbus_tool.py --port COM42 --slave 1 --write --address 0 --values 1,0,1 --type coil

# 扫描从站
python scripts/modbus_tool.py --port COM42 --scan --scan-range 1-10

# TCP 模式读取
python scripts/modbus_tool.py --tcp --host 192.168.1.100 --slave 1 --read --address 0 --count 10

# 监控寄存器变化
python scripts/modbus_tool.py --port COM42 --slave 1 --monitor --address 0 --count 5 --interval 1

# JSON 格式输出
python scripts/modbus_tool.py --port COM42 --slave 1 --read --address 0 --count 5 --format json
```

## 参数说明

### 模式参数

| 参数 | 说明 |
| --- | --- |
| `--detect` | 探测 pymodbus 环境和串口设备 |
| `--read` | 读寄存器 |
| `--write` | 写寄存器 |
| `--scan` | 扫描从站地址 |
| `--monitor` | 持续监控寄存器变化 |

### 连接参数（RTU）

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--port` | — | 串口号（如 COM42、/dev/ttyUSB0） |
| `--baudrate` | 9600 | 波特率 |
| `--parity` | N | 校验：N（无）、E（偶）、O（奇） |
| `--stopbits` | 1 | 停止位：1 或 2 |
| `--timeout` | 1.0 | 超时秒数 |

### 连接参数（TCP）

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--tcp` | — | 启用 TCP 模式 |
| `--host` | 127.0.0.1 | TCP 主机地址 |
| `--tcp-port` | 502 | TCP 端口 |

### 寄存器参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--slave` | 1 | 从站地址 |
| `--address` | 0 | 起始寄存器地址 |
| `--count` | 1 | 读取数量 |
| `--type` | holding | 寄存器类型：holding、input、coil、discrete |
| `--values` | — | 写入值，逗号分隔 |

### 扫描和监控

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--scan-range` | 1-247 | 扫描地址范围 |
| `--interval` | 1.0 | 监控间隔秒数 |
| `--duration` | 0 | 监控持续秒数（0=无限） |
| `--format` | table | 输出格式：table、raw、json |

## 返回码

- `0`：操作成功
- `1`：连接失败、从站无响应或参数错误

## 寄存器类型与功能码

| 类型 | 读功能码 | 写功能码 | 说明 |
| --- | --- | --- | --- |
| holding | FC03 | FC06/FC16 | 保持寄存器（可读写） |
| input | FC04 | — | 输入寄存器（只读） |
| coil | FC01 | FC05/FC15 | 线圈（可读写，布尔） |
| discrete | FC02 | — | 离散输入（只读，布尔） |
