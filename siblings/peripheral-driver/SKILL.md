---
name: peripheral-driver
description: 当需要为外部设备（传感器、存储器、显示屏等）开发 BSP 驱动时使用。提供开源驱动搜索策略、质量评估、代码适配工具和常见设备适配要点。
---

# 外设驱动开发（基于开源库适配）

## 适用场景

- 需要为外部设备（AT24C02、MPU6050、SSD1306 等）开发 BSP 驱动。
- 想找到成熟的开源驱动库并适配到项目的 BSP 架构中。
- 已有开源驱动代码，需要重命名、整理、注入 HAL handle 以符合项目规范。
- 设备较简单，不需要开源库，需要生成 BSP 骨架文件快速起步。

## 必要输入

- 目标设备名称（如 `AT24C02`、`MPU6050`）。
- 通信总线类型（I2C / SPI / UART / 1-Wire / GPIO）。
- HAL handle 名称（如 `hi2c1`、`hspi2`），通常来自 CubeMX 生成的代码。
- 可选：设备 I2C 地址、已下载的开源驱动目录路径。

## 自动探测

- 脚本 `--scan` 模式自动分析输入目录中的 C/H 文件，识别函数签名、HAL 调用模式、命名风格和 include 依赖。
- `--list-devices` 模式列出 `device-adaptation.md` 中已记录的设备和推荐库。
- 如果目标设备在 `device-adaptation.md` 中有记录，直接提供推荐库和适配要点。

## 执行步骤

1. 确认目标设备和总线类型。如果设备在 [references/device-adaptation.md](references/device-adaptation.md) 中有记录，直接参考推荐库和适配要点。
2. 阅读 [references/search-and-evaluate.md](references/search-and-evaluate.md)，按搜索策略在 GitHub/Gitee 上寻找候选开源驱动库。
3. 按评估清单对候选库打分，选择最合适的库。如果没有合适的库，跳到步骤 6。
4. 下载选定的开源库代码到本地临时目录。
5. 运行 `--scan` 分析开源代码，查看适配建议报告：
   ```bash
   python3 scripts/bsp_adapter.py --scan ./downloaded_driver/
   ```
6. 执行适配（二选一）：
   - **有开源库**：运行 `--adapt` 将代码适配到 BSP 规范：
     ```bash
     python3 scripts/bsp_adapter.py \
       --adapt ./downloaded_driver/ \
       --device <device_name> --handle <hal_handle> \
       --output ./Hardware/bsp_<device>/
     ```
   - **无合适库**：运行 `--scaffold` 生成 BSP 骨架文件：
     ```bash
     python3 scripts/bsp_adapter.py \
       --scaffold --device <device_name> --bus <bus_type> \
       --handle <hal_handle> --addr <i2c_addr> \
       --output ./Hardware/bsp_<device>/
     ```
7. 将生成的 BSP 文件集成到 `main.c` 的 USER CODE 区域，参考脚本输出的集成指南。
8. 编译验证，交给 `build-*` skill。

驱动架构设计和实现最佳实践参考 [stm32-hal-development/references/peripheral-driver-guide.md](/home/leo/work/open-git/em_skill/skills/stm32-hal-development/references/peripheral-driver-guide.md)。

## 失败分流

- 当搜索不到任何可用的开源驱动库时，使用 `--scaffold` 生成骨架并提示用户参考规格书手动实现。
- 当开源库使用裸寄存器操作或非 STM32 平台 API 时，返回 `project-config-error`，建议手动适配通信层。
- 当开源库许可证为 GPL 或无许可证时，提醒用户许可证风险，建议寻找替代库或自行实现。
- 当适配后编译失败时，交给 `build-*` skill 处理构建错误。

## 平台说明

- 自带脚本使用 Python 标准库（`os`、`re`、`pathlib`、`argparse`），无额外依赖。
- 生成的 C 代码遵循 STM32 HAL BSP 规范，兼容 GCC、IAR、Keil 工具链。
- 路径格式遵循 [platform-compatibility.md](/home/leo/work/open-git/em_skill/shared/platform-compatibility.md)。

## 输出约定

- `--scan` 输出适配建议报告：检测到的函数、HAL 调用、命名风格、适配难度评估。
- `--adapt` 输出适配后的 BSP 文件和 `main.c` 集成指南。
- `--scaffold` 输出符合 BSP 模板规范的骨架文件。
- `--list-devices` 输出已记录设备的推荐库和适配难度。
- 所有模式的详细用法见 [references/usage.md](references/usage.md)。

## 交接关系

- 上游：`stm32-hal-development`（提供方法论和 BSP 模板）。
- 下游：`build-cmake`、`build-iar`、`build-keil`（编译验证）。
