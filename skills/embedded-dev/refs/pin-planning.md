# 引脚规划指南

> 引脚规划是 RESEARCH 阶段必跑的硬步骤。本文给方法论 + 冲突检测字段；具体芯片的复用表必须查 datasheet / `refs/<chip>-api.md`，**不要从本文复制粘贴**。

---

## 1. 规划三步

### Step 1 — 收集外设需求

模板：

```
外设类型 | 功能              | 数量 | 特殊要求
---------|------------------|------|------------------
USART    | 调试串口         | 1    | TX/RX，建议 DMA
PWM      | 电机控制         | 3    | 互补输出 + 死区
SPI      | 外部 Flash       | 1    | 全双工，DMA
I2C      | 传感器           | 1    | 400kHz
ADC      | 电压采样         | 4    | 通道互不冲突
GPIO     | LED/按键/STRAP   | N    | 上拉/下拉
```

### Step 2 — 查芯片引脚约束（强制）

**禁止**凭经验或"默认引脚"分配。必须查：

| 资料 | 何处 |
|---|---|
| 官方 pinout / datasheet | `modes/datasheet-lookup.md` 流程；grok-search 找 PDF；用 `/pdf` 读 |
| 已有原理图 / 网表 | `modes/netlist-lookup.md` 优先提取 |
| 厂商配置工具 | STM32CubeMX / ESP-IDF menuconfig / GD32 工具 |
| 本仓库速查 | `refs/stm32-stdperiph-api.md`、`refs/stm32-hal-api.md`、`refs/gd32f4xx-api.md` 含引脚映射段 |

**阻塞条件**：以上资料**全部不可得** → 暂停规划，向用户索取。**禁止**进入 PLAN/EXECUTE。

### Step 3 — 冲突检测 + 输出分配表

按"冲突检测字段"逐项检查，无冲突再输出。

---

## 2. 冲突检测字段（每个引脚必查）

| 字段 | 含义 | 冲突表现 |
|---|---|---|
| `pin` | 物理引脚号 | 同一引脚分配给两个外设 |
| `alt` | 复用功能编号 | AFx 冲突（如 USART1 和 SPI1 都要 PA9） |
| `debug` | 是否调试口 | 占用 SWDIO/SWCLK/JTAG → 烧录失败 |
| `strap` | 是否启动配置引脚 | 占用 STRAP → 启动行为异常（ESP32 GPIO0/2/12 等） |
| `DMA` | 关联 DMA 通道 | 两个外设抢同一 DMA 流/通道 |
| `EXTI` | 外部中断线 | EXTI 线冲突（如 PA0、PB0、PC0 共享 EXTI0） |
| `power` | 电源域 | VDD 域 vs VBAT 域不兼容 |
| `PCB` | 物理位置 | 高速信号穿过敏感区域 / 走线困难 |

---

## 3. 危险引脚速查（最容易踩雷的几类）

**用之前必须看 datasheet 当前章节，本表只是提醒**：

| 类别 | 典型引脚（仅举例，必须查 datasheet） | 后果 |
|---|---|---|
| 调试口 SWDIO/SWCLK | STM32: PA13/PA14；GD32: 同 STM32 | 占用后无法 SWD 烧录 |
| JTAG（如启用） | STM32: PB3/PB4/PA15 | 同上 |
| STRAP 启动配置 | ESP32: GPIO0/2/12/15；某些 STM32 BOOT0/BOOT1 | 上电启动模式异常 |
| Input-only | ESP32: GPIO34/35/36/39 无输出 | 配输出 = 不工作 |
| Flash 内部接口 | ESP32: GPIO6-11 接片内 Flash | 占用 = brick |
| 振荡器 | STM32: PD0/PD1 用了 HSE 外晶振时 | 占用 = 时钟挂掉 |
| USB D+/D- | STM32F103: PA11/PA12 | 用 USB 时不能作 GPIO |
| 5V 容忍 vs 3.3V | 大多 STM32 引脚 5V tolerant；ESP32 仅 3.3V | 接 5V 信号烧 |

---

## 4. 优先选择"默认/官方推荐"引脚

厂商已验证过的引脚组合问题最少。**只有冲突时才用 remap / alternate function**。

例外：被调试口占用 → 用 remap，但先烧录后切。

---

## 5. 输出分配表模板

写进 `硬件资源表.md` / `hw-resources.md`：

```markdown
## 引脚分配表

| 引脚 | 外设/功能       | 复用    | DMA          | 中断   | 备注              |
|------|----------------|---------|--------------|--------|------------------|
| PA9  | USART1_TX      | AF7     | DMA1_CH4     | -      | 调试串口         |
| PA10 | USART1_RX      | AF7     | DMA1_CH5     | -      | -                |
| PB6  | I2C1_SCL       | AF4     | -            | -      | 上拉 4.7kΩ       |
| PB7  | I2C1_SDA       | AF4     | -            | -      | 上拉 4.7kΩ       |
| PA0  | ADC1_IN0       | -       | DMA1_CH1     | -      | 电压采样         |
| PC13 | LED            | GPIO_OUT| -            | -      | 低电平点亮       |

## 冲突警告
- 无 / 或列出冲突原因 + 替代方案
```

---

## 6. 实战示例索引

| 场景 | 案例位置 |
|---|---|
| 平衡车（STM32F103，10 个外设并存） | 项目内 `硬件资源表.md` |
| GD32F470 主板 V2 全引脚 | `refs/gd32f4xx-api.md` 第 9 节 |

> 案例可以照搬冲突检测**方法**，**不能**照搬引脚分配（不同板子布局完全不同）。
