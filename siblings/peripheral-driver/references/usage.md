# 外设驱动适配工具用法

这个 skill 自带了一个可执行脚本 [scripts/bsp_adapter.py](../scripts/bsp_adapter.py)，适合在需要分析开源驱动代码、适配到 BSP 规范、或生成 BSP 骨架文件时直接调用。

## 能力概览

- 扫描开源驱动代码，分析函数签名、HAL 调用模式、命名风格
- 将开源驱动代码适配到项目 BSP 命名规范
- 生成符合 BSP 模板的骨架文件（支持 I2C、SPI、UART、GPIO）
- 列出已记录的常见设备和推荐开源库

## 基础用法

```bash
# 扫描开源驱动代码
python3 skills/peripheral-driver/scripts/bsp_adapter.py --scan ./downloaded_driver/

# 适配开源驱动到 BSP 规范
python3 skills/peripheral-driver/scripts/bsp_adapter.py \
  --adapt ./downloaded_driver/ \
  --device at24c02 --handle hi2c1 \
  --output ./Hardware/bsp_at24c02/

# 生成 BSP 骨架文件
python3 skills/peripheral-driver/scripts/bsp_adapter.py \
  --scaffold --device sht30 --bus i2c \
  --handle hi2c1 --addr 0x44 \
  --output ./Hardware/bsp_sht30/

# 列出已记录的设备
python3 skills/peripheral-driver/scripts/bsp_adapter.py --list-devices
```

## 常见模式

### 1. 扫描分析

```bash
python3 skills/peripheral-driver/scripts/bsp_adapter.py --scan ./mpu6050_lib/
```

输出适配建议报告：检测到的函数签名、HAL 调用模式、命名风格、include 依赖和适配难度评估。

### 2. 适配开源库

```bash
python3 skills/peripheral-driver/scripts/bsp_adapter.py \
  --adapt ./mpu6050_lib/ \
  --device mpu6050 --handle hi2c1 \
  --output ./Hardware/bsp_mpu6050/
```

自动执行：文件重命名、函数前缀替换、HAL handle 注入、include 整理、extern C 包装、include guard 添加。输出 main.c 集成指南。

### 3. 生成 BSP 骨架

```bash
python3 skills/peripheral-driver/scripts/bsp_adapter.py \
  --scaffold --device my_sensor --bus i2c \
  --handle hi2c1 --addr 0x44 \
  --output ./Hardware/bsp_my_sensor/
```

当没有合适的开源库时，生成空的 BSP 骨架文件，包含 Init（含设备检测）、ReadData、WriteData 函数和总线特定的辅助函数。

### 4. 查看已记录设备

```bash
python3 skills/peripheral-driver/scripts/bsp_adapter.py --list-devices
```

列出 `device-adaptation.md` 中记录的设备、总线类型、推荐方案和适配难度。

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--scan` | 扫描指定目录中的开源驱动代码 |
| `--adapt` | 将指定目录中的代码适配到 BSP 规范 |
| `--scaffold` | 生成空的 BSP 骨架文件 |
| `--list-devices` | 列出已记录的常见设备 |
| `--device` | 设备名称（用于文件和函数命名） |
| `--bus` | 总线类型：`i2c`、`spi`、`uart`、`gpio` |
| `--handle` | HAL handle 名称，如 `hi2c1`、`hspi2` |
| `--addr` | I2C 设备地址（十六进制，如 `0x44`） |
| `--output` | 输出目录路径 |

## 返回码

- `0`：操作成功
- `1`：参数非法、输入目录不存在、或操作失败

## 与 Skill 的配合方式

在 `peripheral-driver` skill 中，推荐工作流是：

1. 先确认目标设备，用 `--list-devices` 检查是否有已记录的推荐库
2. 按 `search-and-evaluate.md` 搜索和评估开源库
3. 下载候选库后用 `--scan` 分析适配难度
4. 用 `--adapt` 或 `--scaffold` 生成 BSP 文件
5. 按输出的集成指南将代码加入 `main.c` 的 USER CODE 区域
6. 交给 `build-*` skill 编译验证
