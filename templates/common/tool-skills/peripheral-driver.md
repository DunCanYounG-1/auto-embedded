---
name: aemb-peripheral-driver
description: 当需要为外部设备（传感器、存储器、显示屏等，如 MPU6050/SSD1306/AT24C02）开发或移植 BSP 驱动时使用：开源驱动搜索→质量评估→代码适配/骨架生成，遵循复用优先与分层架构。
---

> **auto-embedded 工具技能**：脚本随框架装在 `.auto-embedded/tools/peripheral-driver/`，用 `{{PYTHON_CMD}}` 运行 `.auto-embedded/tools/peripheral-driver/scripts/bsp_adapter.py`；详细用法见 `.auto-embedded/tools/peripheral-driver/references/usage.md`。设计方法论与 BSP 模板见 `.auto-embedded/refs/stm32-hal/`。

# 外设驱动开发（基于开源库适配）

## 适用场景

- 需要为外部设备（AT24C02、MPU6050、SSD1306 等）开发 BSP 驱动。
- 想找到成熟的开源驱动库并适配到项目的 BSP 架构中（复用优先于造轮子）。
- 已有开源驱动代码，需要重命名、整理、注入 HAL handle 以符合项目规范。
- 设备较简单，不需要开源库，需要生成 BSP 骨架文件快速起步。

## 必要输入

- 目标设备名称（如 `AT24C02`、`MPU6050`）。
- 通信总线类型（I2C / SPI / UART / 1-Wire / GPIO）。
- HAL handle 名称（如 `hi2c1`、`hspi2`），通常来自 CubeMX 生成的代码。
- 可选：设备 I2C 地址、已下载的开源驱动目录路径。

## 执行步骤

1. 确认目标设备和总线类型。若设备在 [references/device-adaptation.md](.auto-embedded/tools/peripheral-driver/references/device-adaptation.md) 中有记录，直接参考推荐库和适配要点。
2. 阅读 [references/search-and-evaluate.md](.auto-embedded/tools/peripheral-driver/references/search-and-evaluate.md)，按搜索策略在 GitHub/Gitee 上寻找候选开源驱动库并打分。
3. 选定库后下载到本地临时目录，运行 `--scan` 分析并查看适配建议：
   ```bash
   {{PYTHON_CMD}} .auto-embedded/tools/peripheral-driver/scripts/bsp_adapter.py --scan ./downloaded_driver/
   ```
4. 执行适配（二选一）：
   - **有开源库** — `--adapt` 适配到 BSP 规范：
     ```bash
     {{PYTHON_CMD}} .auto-embedded/tools/peripheral-driver/scripts/bsp_adapter.py \
       --adapt ./downloaded_driver/ --device <device> --handle <hal_handle> \
       --output ./Hardware/bsp_<device>/
     ```
   - **无合适库** — `--scaffold` 生成 BSP 骨架：
     ```bash
     {{PYTHON_CMD}} .auto-embedded/tools/peripheral-driver/scripts/bsp_adapter.py \
       --scaffold --device <device> --bus <bus> --handle <hal_handle> --addr <i2c_addr> \
       --output ./Hardware/bsp_<device>/
     ```
5. 将生成的 BSP 文件集成到 `main.c` 的 USER CODE 区域，参考脚本输出的集成指南。
6. 编译验证，交给 `aemb-build-*` 工具技能。

驱动架构设计与实现最佳实践参考 [.auto-embedded/refs/stm32-hal/references/peripheral-driver-guide.md](.auto-embedded/refs/stm32-hal/references/peripheral-driver-guide.md)。

## 失败分流

- 搜索不到可用开源库 → `--scaffold` 生成骨架并提示按规格书手动实现。
- 开源库用裸寄存器/非目标平台 API → 返回 `project-config-error`，建议手动适配通信层。
- 开源库许可证为 GPL 或无许可证 → 提醒许可证风险，建议替代库或自行实现。
- 适配后编译失败 → 交给 `aemb-build-*` 处理构建错误。

## 平台说明

- 自带脚本仅用 Python 标准库（`os`、`re`、`pathlib`、`argparse`），无额外依赖，三大平台兼容。
- 生成的 C 代码遵循 STM32 HAL BSP 规范，兼容 GCC / IAR / Keil。

## 交接关系

- 上游方法论与 BSP 模板：`.auto-embedded/refs/stm32-hal/`。
- 下游编译验证：`aemb-build-cmake` / `aemb-build-iar` / `aemb-build-keil`。
