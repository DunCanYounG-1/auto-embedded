# 跨平台迁移指南

> 在 STM32 / ESP32 / Arduino / RISC-V / NXP / TI / 国产芯片之间迁移嵌入式代码的策略。**API 表格不在这里**（去 `.auto-embedded/refs/stm32-stdperiph-api.md` / `.auto-embedded/refs/stm32-hal-api.md` / `.auto-embedded/refs/gd32f4xx-api.md` 查），本文只讲迁移策略。

---

## 0. 第一原则

**通过 HAL Port 隔离平台差异**（见 `.auto-embedded/refs/embedded-architecture.md` §3）。应用层不该感知平台。如果你在迁移时发现 `app_*` 文件大量改动 → 说明原架构未做端口隔离，本质是重写而不是迁移。

---

## 1. 迁移检查清单

开始迁移前**逐项核对**：

- [ ] 目标芯片架构和资源（Flash / RAM / 主频 / 外设数量）已确认
- [ ] 列出源代码中使用的芯片特定外设和寄存器
- [ ] 识别哪些 `app_*` / `mid_*` 直接 include 了厂商头（这些必须先重构）
- [ ] 记录编译器差异（GCC / Clang / Keil ARMCC / IAR）
- [ ] 目标平台开发环境（IDE / SDK / 调试探针）就绪

---

## 2. 必须重算的 3 件事

迁移时**永远不能直接复用**的：

1. **时钟**：主频、APB 分频、定时器输入时钟、波特率寄存器值。任何 `SystemCoreClock` / `HCLK` / `PCLK` 假设都要重新查
2. **IRQ 优先级**：STM32 NVIC 分组 → ESP32 Level 0-31 → RISC-V PLIC → AVR 固定优先级。优先级映射必须重新设计
3. **DMA request 编号**：每个芯片的 DMA 触发源、通道、子映射都不同（如 GD32 的 SUB0~SUB7）。完整通道表查对应的 `refs/<chip>-api.md`

---

## 3. 编译器差异封装

| 关注点 | 差异 | 封装方式 |
|---|---|---|
| 中断声明 | `void X_IRQHandler(void)` (ARM Cortex-M) vs `ISR(X_vect)` (AVR) vs `IRAM_ATTR void x(void *)` (ESP32) | 用 `bsp_irq.h` 宏统一 |
| 对齐 | `__attribute__((aligned(N)))` (GCC) vs `__align(N)` (ARMCC) | 用 `ATTR_ALIGN(N)` 宏统一 |
| 平台宏 | `STM32F4` / `ESP_PLATFORM` / `ARDUINO_ARCH_AVR` 等散落 | 集中在 `bsp_platform.h` |
| 内联汇编 | 完全不同 | 走 HAL Port，业务层不直接写 |

---

## 4. 典型迁移场景的注意点

### STM32 ↔ ESP32

- **时钟**：STM32 固定时钟树，ESP32 CPU 频率可调（80/160/240MHz）会改 APB → 所有定时器/波特率必须重算或用动态获取 API
- **中断**：STM32 NVIC 分组 → ESP32 Level；优先级语义不同，无法 1:1 映射
- **DMA**：STM32 DMAx_Streamy + SUB → ESP32 GDMA 描述符链 (lldesc)；编程模型完全重写
- **GPIO**：STM32 `GPIO_InitTypeDef` 结构体 → ESP32 `gpio_config_t`；复用配置 STM32 `GPIO_PinAFConfig`→ ESP32 矩阵 `gpio_matrix_in/out`
- **UART**：STM32 寄存器/HAL → ESP32 `uart_driver_install` + 事件队列，模型差异大
- **重要**：ESP32 必须保留 WiFi/BT 任务相关的中断、内存优先级；这部分代码无法删

### Arduino → 任何 32-bit MCU

- 删除所有 `digitalWrite/digitalRead/analogRead/pinMode/Serial.print` 高层 API
- `F_CPU` 宏依赖 → 改用平台的 `SystemCoreClock` 或 `clock_get_hz()` 类函数
- 中断 `attachInterrupt` → 平台特定 NVIC + handler 注册

### GD32 ↔ STM32

- **API 命名差异**：详见 `.auto-embedded/refs/gd32f4xx-api.md` 顶部"与 STM32 StdPeriph 差异"段（USART 编号差 1、DMA 用 SUB 映射、`rcu_*` vs `RCC_*`）
- 多数情况能 1:1 平移；DMA / USART 编号映射处易踩坑

### STM32 不同系列（F1 → F4 → H7）

- 不算"跨平台"，但 RCC 时钟树、Flash 等待周期、DMA stream/channel 数量、Cache 行为差异大；用 HAL 比 StdPeriph 平滑

---

## 5. 迁移后验证清单

迁移完成后**一次过**：

- [ ] 时钟实测正确（用 MCO 输出 + 示波器，或 `SystemCoreClockUpdate()` 后打印）
- [ ] 所有定时器周期 / PWM 频率 / UART 波特率实测正确
- [ ] 所有中断都能触发（GPIO 翻转 / 串口计数 / 断点命中）
- [ ] DMA 传输完整 + 无溢出
- [ ] 编译警告清零
- [ ] 资源占用（Flash / RAM）在目标芯片约束内
- [ ] 单元测试（如有）全部 pass
- [ ] 长时间运行无 hang / 异常复位（看门狗日志）

---

## 6. 何时该重写而不是迁移

满足任一即建议重写：

- 应用层耦合厂商 HAL > 80%
- 目标平台是异构（如 STM32 → ESP32 双核 + RTOS）
- 内存模型差异大（无 OS 裸机 → FreeRTOS / Linux）
- 工具链生态差异大（Keil → ESP-IDF + CMake）

重写时按 `.auto-embedded/refs/embedded-architecture.md` 重新设计端口层，让下次迁移轻松。
