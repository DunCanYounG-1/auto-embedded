# 分层架构 spec（architecture）

> index.md 是本层入口：开发前清单（Pre-Development Checklist）+ 质量门（Quality Check）。
> RESEARCH/PLAN 必读；派 Builder/Verifier 时按 implement/verify.jsonl 自动注入。

## 六层模型与依赖方向

| 层 | 前缀 | 职责 | 只能依赖 |
|---|---|---|---|
| L1 HAL Port | `halport_` | 厂商 HAL/寄存器的薄封装，隔离硬件差异 | 厂商头 |
| L2 BSP | `bsp_` | 板级：时钟/引脚/外设实例 | L1 |
| L3 Driver | `drv_` | 设备驱动（传感器/屏/存储） | L1/L2 |
| L4 Middleware | `mw_` | 协议/算法/文件系统 | L1~L3 |
| L5 Service | `svc_` | 业务服务（采集/控制/CLI） | L1~L4 |
| L6 App | `app_` | 编排与主循环 | L2~L5（**禁** L1 厂商头） |

依赖只能自上而下；跨硬件一律走 L1 HAL Port。

## 开发前清单（Pre-Development Checklist）

- [ ] 每个新文件标明层级 L1~L6 与命名前缀
- [ ] 应用层（app/）**不** `#include` 厂商 HAL 头（stm32*/gd32*/esp_*/ti_msp_dl_* 等）
- [ ] 应用层**不**直接裸写寄存器（`*(volatile..*)0x..`）——封装到 HAL/BSP
- [ ] 不引入 catch-all mega-header（`*_headfile.h`/`all.h`）间接拉厂商头
- [ ] `main.c` 只做启动编排与主循环调度，顶层调用 ≤ 6

## 质量门（Quality Check，REVIEW 必跑）

机械门禁（与 embedded-dev 同源思路，可外接 arch-check）：

| 编号 | 规则 |
|---|---|
| ARCH-1/1B/1C | 应用层禁厂商头 / 禁 catch-all mega-header / 禁裸 MMIO |
| ARCH-2 | main.c 顶层调用 ≤ 6 |
| ARCH-3 | ISR/回调函数体 ≤ 20 行 |
| ARCH-4 | 应用层 extern 变量 = 0 |
| ARCH-5/6 | 单 .c ≤ 800 行；单 .h 公共 API ≤ 20 |
| ARCH-7/7B | mega-header 检测 / app 层引用 mega-header |
| ARCH-8 | hw-lock.yaml pin/dma/irq/timer 冲突检测 |

> 若工程已装 embedded-dev 的 `scripts/arch-check.sh`/`.ps1`，REVIEW 阶段直接跑它做门禁。
