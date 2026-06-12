# 嵌入式分层架构规范（避免屎山）

> 本文是 riper5 主协议生成代码的**结构标尺**。RIPER-5 的 PLAN / EXECUTE / REVIEW 阶段必须按本文约束。违反任何一条 = 屎山预警，立即停下回 PLAN。
>
> 来源：综合 ARM CMSIS、AUTOSAR MCAL、ESP-IDF、Zephyr、STM32 HAL、Hexagonal / Ports & Adapters / Clean Architecture，以及 [Hubble Network 嵌入式可维护性指南](https://hubble.com/community/guides/how-to-structure-embedded-firmware-for-maintainability/)、[RapidSEA 分层架构](https://www.rapidseasuite.com/blog/layered-embedded-architecture-application-middleware-&-hal)、[BugProve 固件架构](https://bugprove.com/firmware-architecture/)、[Beningo HAL vs API](https://www.beningo.com/embedded-basics-apis-vs-hals/)、[Embedded Designer BSP](https://embeddeddesigner.com/blog/embedded-software-bsp/)、[OARJ 架构论文](https://oarjpublication.com/journals/oarjet/sites/default/files/OARJET-2025-0058.pdf)。

---

## 0. 一句话铁律

> **应用层不准 `#include "stm32f4xx_hal.h"` / `"gd32f4xx.h"` / `"esp_system.h"`。违反 = 立即重构。**

如果未来要换芯片，应用层一行不改 — 这是"不屎"的唯一标准。

---

## 1. 标准层级（自下而上）

| 层级 | 命名前缀 | 内容 | 允许调用 | 严禁 |
|---|---|---|---|---|
| **L0 vendor HAL/LL** | `HAL_` / `LL_` / `xxx_` | 厂商提供 | 寄存器、CMSIS | — |
| **L1 HAL（项目级）** | `hal_` | 项目自封装薄层，对厂商 HAL 做语义统一 | L0 | 上层 |
| **L2 BSP（板级支持）** | `bsp_` | 板载引脚 / 时钟树 / 板载外设初始化 | L1, L0 | L3+ |
| **L3 Driver（设备驱动）** | `drv_<device>_` | 传感器/Flash/OLED/电机 等设备协议 | L1, L2 | L4+ |
| **L4 Middleware** | `mid_` 或具体名 | RTOS / 协议栈 / 文件系统 / 加解密 | L1, L2, L3 | L5 |
| **L5 Service** | `svc_` | 业务无关的服务编排（OTA、日志路由、参数管理） | L1~L4 | L6 |
| **L6 Application** | `app_` | 业务逻辑、状态机、调度 | L1~L5（**通过接口**） | 直接 #include 厂商头 |

**依赖方向硬约束**（精确描述，避免"通过 Port 调下层"和"禁止跨层"互相打架）：

- ✅ **允许**：上层通过 **Port 抽象接口（仅 `.h`，无具体实现）** 调用任意下层。例：L6 `app_pid.c` `#include "hal_uart.h"` 然后 `hal_uart_write(...)` — 合规
- ❌ **禁止 1（跨层穿透实现）**：上层直接 `#include` 下层的**实现头**（如 `stm32f4xx_hal.h`、`hal/ports/stm32f4/*.h`）。L6 → L0 vendor HAL 直连 = 违规
- ❌ **禁止 2（反向依赖）**：下层 `#include` 上层任何头。L3 driver 不能 include L6 app
- ❌ **禁止 3（同层耦合内部）**：同层模块之间直接访问内部 static / extern 状态。要走对方公开 API

**判定规则（REVIEW 用）**：检查每个 `.c` / `.h` 的 `#include` 列表 — 只允许指向"接口（`.h`）"，不允许指向"实现（厂商 `*_hal.h` / 适配器具体 `.c` 对应的内部头）"。

---

## 2. 推荐目录骨架（适配大多数 MCU 项目）

```
<project_root>/
├── app/                        # L6 应用层（纯业务逻辑，无硬件依赖）
│   ├── inc/
│   └── src/
├── service/                    # L5 服务层
├── middleware/                 # L4 中间件（RTOS、协议栈、文件系统）
├── drivers/                    # L3 设备驱动
│   ├── inc/
│   └── src/
├── bsp/                        # L2 板级支持
│   ├── board_<name>.h          # 板载引脚/时钟宏
│   ├── board_<name>.c
│   └── bsp_init.c              # 统一上电初始化
├── hal/                        # L1 项目级 HAL
│   ├── inc/                    # 接口（端口定义）
│   │   ├── hal_gpio.h
│   │   ├── hal_uart.h
│   │   ├── hal_spi.h
│   │   ├── hal_i2c.h
│   │   ├── hal_timer.h
│   │   └── hal_time.h
│   └── ports/                  # 端口的具体实现（按芯片切换）
│       ├── stm32f4/
│       ├── gd32f4/
│       ├── esp32/
│       └── host_mock/          # 主机测试用 mock
├── vendor/                     # L0 厂商 SDK（不动）
│   ├── CMSIS/
│   ├── stm32f4xx_hal/
│   └── gd32f4xx_std/
├── config/                     # 编译期配置（feature flag）
│   └── project_config.h
├── tests/                      # Off-target 单元测试
│   ├── unit/
│   └── mocks/
└── main.c                      # 只做编排：bsp_init() → mid_init() → svc_init() → app_run()
```

> 不必死扣目录名。**核心是层级 + 命名前缀 + 依赖方向**。`src/include` 模式或 Zephyr `west` 工作区也行。

---

## 3. 端口与适配器（Ports & Adapters 模式）— 解耦核心

> 这是让 skill 生成的代码**真正可移植、可测试、不屎山**的关键。每个跨层访问点都要走端口。

### 3.1 端口（Port）= 抽象接口

放在被依赖一侧的 `inc/`。**只有接口，没有实现**。

```c
/* hal/inc/hal_uart.h — 一个端口示例 */
#ifndef HAL_UART_H
#define HAL_UART_H

#include <stdint.h>
#include <stddef.h>

typedef struct hal_uart_s hal_uart_t;     /* 不透明句柄 */

typedef enum {
    HAL_OK = 0,
    HAL_ERR_BUSY,
    HAL_ERR_TIMEOUT,
    HAL_ERR_PARAM,
    HAL_ERR_HW,
} hal_status_t;

typedef struct {
    uint32_t baud;
    uint8_t  data_bits;        /* 7 / 8 / 9 */
    uint8_t  stop_bits;        /* 1 / 2 */
    uint8_t  parity;           /* 0=none / 1=odd / 2=even */
} hal_uart_cfg_t;

/**
 * @brief   打开 UART
 * @param[in,out] u    UART 句柄（非 NULL）
 * @param[in]     cfg  配置（非 NULL）
 * @retval HAL_OK / HAL_ERR_PARAM / HAL_ERR_HW
 * @pre   时钟/引脚已由 BSP 初始化
 * @context  task / bare（禁止在 ISR 调用）
 * @blocking yes (timeout-bounded by `cfg->open_timeout_ms`)
 * @reentrant no
 * @isr_safe no
 * @locking  acquires `u->mutex`
 */
hal_status_t hal_uart_open(hal_uart_t *u, const hal_uart_cfg_t *cfg);
hal_status_t hal_uart_close(hal_uart_t *u);
hal_status_t hal_uart_write(hal_uart_t *u, const uint8_t *buf, size_t len, uint32_t timeout_ms);
hal_status_t hal_uart_read (hal_uart_t *u, uint8_t       *buf, size_t len, uint32_t timeout_ms);

#endif
```

> Doxygen 标签集完整列表见 `.auto-embedded/refs/coding-standards.md §9.1`。Port `.h` 的所有公开 API **Required** 含 5 个固定注解：`@context` / `@blocking` / `@reentrant` / `@isr_safe` / `@locking`。

### 3.2 适配器（Adapter）= 端口的具体实现

每个芯片家族一份实现。运行时只**链接**一份，应用层无感。

```c
/* hal/ports/stm32f4/hal_uart_stm32f4.c */
#include "hal_uart.h"
#include "stm32f4xx_hal.h"           /* 仅本文件可 include 厂商头！ */

struct hal_uart_s { UART_HandleTypeDef vendor; /* … */ };

hal_status_t hal_uart_open(hal_uart_t *u, const hal_uart_cfg_t *cfg) {
    u->vendor.Init.BaudRate = cfg->baud;
    /* … 翻译参数、调 HAL_UART_Init … */
    return (HAL_UART_Init(&u->vendor) == HAL_OK) ? HAL_OK : HAL_ERR_HW;
}
/* 其他函数同理 */
```

```c
/* hal/ports/gd32f4/hal_uart_gd32f4.c — 另一份实现 */
#include "hal_uart.h"
#include "gd32f4xx.h"

struct hal_uart_s { uint32_t periph; /* USART0~USART5 */ };

hal_status_t hal_uart_open(hal_uart_t *u, const hal_uart_cfg_t *cfg) {
    rcu_periph_clock_enable(RCU_USART0);
    usart_baudrate_set(u->periph, cfg->baud);
    /* … */
    return HAL_OK;
}
```

```c
/* hal/ports/host_mock/hal_uart_mock.c — 主机测试 mock */
#include "hal_uart.h"
#include <string.h>

#define MOCK_TX_CAP  1024U
static uint8_t mock_tx_buf[MOCK_TX_CAP];
static size_t  mock_tx_len = 0;

hal_status_t hal_uart_write(hal_uart_t *u, const uint8_t *buf, size_t len, uint32_t to) {
    (void)u; (void)to;
    if (buf == NULL && len > 0)         return HAL_ERR_PARAM;
    if (mock_tx_len + len > MOCK_TX_CAP) return HAL_ERR_BUSY;  /* 容量检查，避免规范示例自身越界 */
    memcpy(mock_tx_buf + mock_tx_len, buf, len);
    mock_tx_len += len;
    return HAL_OK;
}
/* tests 可读 mock_tx_buf 验证应用层写入内容；越界时 `HAL_ERR_BUSY` 反映"测试缓冲已满" */
```

> 规范示例必须自洽 §13.3 buffer-with-capacity 模式：所有 buffer API 都接受容量上界并显式返回错误。**禁止**在规范示例里写 `memcpy(dst+off, src, len)` 而不校验 `off+len <= cap`。

### 3.3 切换实现 = 改 CMakeLists / Keil 工程，不改一行业务代码

```cmake
# CMakeLists.txt 片段
if(TARGET_STM32F4)
    target_sources(hal PRIVATE hal/ports/stm32f4/hal_uart_stm32f4.c)
elseif(TARGET_GD32F4)
    target_sources(hal PRIVATE hal/ports/gd32f4/hal_uart_gd32f4.c)
elseif(TARGET_HOST_TEST)
    target_sources(hal PRIVATE hal/ports/host_mock/hal_uart_mock.c)
endif()
```

---

## 4. 命名硬规则

| 类型 | 模式 | 示例 |
|---|---|---|
| 文件名 | `<layer_prefix>_<module>.[ch]` | `hal_uart.h`、`drv_ssd1306.c`、`app_pid.c` |
| 公开函数 | `<layer_prefix>_<module>_<verb>` | `hal_uart_open()`、`drv_ssd1306_clear()`、`app_pid_step()` |
| 内部静态函数 | 同上 + `static` + 文件本地 | `static void uart_isr_rx(void);` |
| 类型 | `<layer_prefix>_<name>_t` | `hal_uart_cfg_t`、`app_pid_state_t` |
| 枚举 | `<layer_prefix>_<name>_e` 或 SCREAMING | `HAL_OK`、`HAL_ERR_TIMEOUT` |
| 宏 | SCREAMING_WITH_PREFIX | `BSP_LED_PORT`、`APP_PID_KP_MAX` |
| 文件级私有 | `static` | 见上 |
| 跨模块共享但非公开 API | 严禁。改成显式 API 或回到上层 | — |

> **禁止驼峰、禁止匈牙利、禁止无前缀的全局函数**。

---

## 5. 模块组织硬规则（每个 `.c` 必须满足）

1. **公开 API 在 `.h`，私有助手 `static`**
2. **不透明句柄 / opaque struct**（`typedef struct foo_s foo_t;`），调用方拿指针不拿成员
3. **配置走结构体**：参数 > 3 个时收敛为 `<module>_cfg_t`
4. **单一职责函数**：超过 50 行考虑拆；嵌套层级 ≤ 2
5. **错误用统一 enum 返回**（如 `hal_status_t`），禁止用 magic number；输出参数走指针
6. **`volatile` 用在**：寄存器、ISR 共享变量、被中断读取的状态
7. **临界区**：用统一宏（`bsp_critical_enter()` / `bsp_critical_exit()`）封装，禁止裸 `__disable_irq()` 散落代码
8. **没有动态分配**（默认）：静态池 / 栈 / 链接期分配；如必须 `malloc`，集中在 RTOS 启动后并明确文档

### 5.X 反屎山扩展硬规则（2026-05 新增，对应 `scripts/arch-check.sh`）

> 以下 6 条由静态扫描脚本 `scripts/arch-check.sh` 机械化执行。违反任一项 → REVIEW 阶段直接 FAIL，回 EXECUTE 修。

9. **`app_run()` 必须挂调度器或状态机**：禁止在 `app_run()` 内直接展开业务流程（while 大循环 + 顺序条件分支 = 屎山预警）。允许形态：
   - `osKernelStart()` / `scheduler_start()` / `vTaskStartScheduler()`
   - 状态机注册表 `state_machine_register(&state_table, ...)`
   - 事件循环 `event_loop_run(&dispatcher)`
   - 主循环 + 显式 task slot 表（每个 task 是独立函数）

10. **禁 header 内非 trivial `static inline` 实现**：`.h` 内 `static inline` 函数体**只能**是 1-3 行简单 getter / accessor / 位操作；超过 3 行**必须**移到 `.c`。**严禁**在 Port 接口 `.h`（如 `hal_uart.h`）内塞含寄存器操作的 inline — 违反 Port/Adapter 解耦核心

11. **ISR / 弱回调函数体 ≤ 20 行（非空非注释）**：`*_IRQHandler` / `*_Handler` / `HAL_*_Callback` / `*_callback` / `*Cb` 命名的函数体必须最小化。业务逻辑必须发送到任务 / 事件队列 / 标志位由主循环处理

12. **单文件量化阈值**：
    - 单 `.c` 文件 ≤ **800 行**（含注释空行）— 超出 → 按职责拆分
    - 单 `.h` 公共 API ≤ **20 个**函数声明 — 超出 → 拆模块
    - 单函数圈复杂度 CCN ≤ **10**（lizard 检测）— 超出 → 拆或表驱动

13. **禁 mega-header**：任何 `.h` 文件 `#include` 数 ≥ **10** 即视为违规（`project.h` / `all.h` / `globals.h` 等 catch-all 写法）。每个使用者必须**最小化** include。SDK 配置头如 `ti_msp_dl_config.h` / `stm32f4xx_conf.h` 例外（厂商生成）

14. **应用层 `extern` 全局变量数 = 0**：`app/` / `application/` / `project/code/app/` 下严禁 `extern <type> <name>;` 形式的变量声明。跨模块共享状态必须走 getter/setter API。`extern` 函数声明（含 `(...)`）允许但建议改为头文件声明

---

## 6. `main.c` 硬约束（应用层入口）

`main.c` **只允许**做四件事：

```c
int main(void) {
    bsp_init();                   /* 1. 板级上电（时钟、电源、看门狗、Debug UART） */
    mid_init();                   /* 2. 中间件（FreeRTOS / lwIP / FatFs） */
    svc_init();                   /* 3. 服务（OTA、日志、参数） */
    app_run();                    /* 4. 应用启动（创建任务 / 进主循环） */

    while (1) { /* 不可达；或调度器之外的兜底 */ }
}
```

**严禁**在 `main()` 内：
- 寄存器写
- `HAL_*` / 厂商 API 直接调用
- 业务逻辑、协议解析、状态机
- 超过 10 行连续业务代码

违反 → 立即拆出 `app_xxx.c`。

---

## 7. 依赖方向检查表（REVIEW 阶段必跑）

**机械化执行**：在工程根目录跑 `bash .auto-embedded/scripts/arch-check.sh`，exit 0 才允许 REVIEW 通过。脚本覆盖以下 7 项 + 本节其余手工核对项。

| 检查项 | 通过标准 | 失败处置 | 自动化 |
|---|---|---|---|
| **ARCH-1** 应用层 `#include` 列表 | 只含 `hal_*.h` / `drv_*.h` / `mid_*.h` / `svc_*.h` / `<stdint.h>` 等标准 C | 出现 `stm32f4xx_hal.h` / `gd32f4xx.h` / `ti_msp_dl_config.h` 等 → 强制下沉到 HAL/BSP 层 | ✅ `arch-check.sh` |
| **ARCH-2** `main()` 顶层调用数 | ≤ 6 | 超出 → 拆出 `app_xxx.c` | ✅ `arch-check.sh` + `pre-write-check.py` |
| **ARCH-3** ISR / 弱回调函数体行数 | ≤ 20 行非空非注释 | 超出 → 业务移到任务 / 标志位 | ✅ `arch-check.sh` + `pre-write-check.py` |
| **ARCH-4** 应用层 `extern` 变量数 | = 0 | 改 getter/setter API | ✅ `arch-check.sh` + `pre-write-check.py` |
| **ARCH-5** 单 `.c` 文件行数 | ≤ 800 | 按职责拆分 | ✅ `arch-check.sh` |
| **ARCH-6** 单 `.h` 公共 API 数 | ≤ 20 | 拆模块 | ✅ `arch-check.sh` |
| **ARCH-7** mega-header 检测 | `#include` 数 ≤ 10 | 拆 / 最小化 include | ✅ `arch-check.sh` |
| 驱动层 `#include` 列表 | 只含 `hal_*.h` / `bsp_*.h` / 标准 C | 厂商头 → 移到 HAL 端口实现 | 手工 |
| HAL 端口实现 `#include` | 可以含厂商头 | — | 手工 |
| 业务函数长度 | ≤ 50 行 / 嵌套 ≤ 2 / 参数 ≤ 3 / CCN ≤ 10 | 拆 | ✅ `lizard`（见 `.auto-embedded/refs/static-analysis-pipeline.md`） |
| 跨层调用（app → bsp 或 vendor API） | 不存在 | 走 HAL 端口 | 手工（含 PreToolUse hook 部分覆盖） |
| 动态分配 | 默认禁用 | 例外需文档说明 | 手工 |
| Header 内非 trivial `static inline` | 函数体 ≤ 3 行 | 移到 `.c` | 手工 |
| `app_run()` 必须挂调度器 / 状态机 | 含 `scheduler_start()` / `osKernelStart()` / `state_machine_register()` 之一 | 改为编排式 | 手工 |

---

## 8. 屎山预警信号（任一出现 → 触发紧急重构）

- 一个 `.c` 文件超过 1000 行
- `main()` 超过 100 行
- 函数 `static` 关键字使用率 < 50%
- 存在 `extern xxx` 变量声明（说明跨模块直接访问内部状态）
- 同一寄存器在 3+ 个文件被直接写入
- 同一硬件功能（如"读温度"）在多处用不同接口实现
- 多个 `if defined(STM32F4)` / `#ifdef ESP32` 散落业务代码
- 函数名无前缀 / 用驼峰 / 单字母变量名
- `TODO` / `FIXME` 数量 > 文件数 × 0.5

---

## 9. RIPER-5 集成钩子

| RIPER 阶段 | 本文规则的应用 |
|---|---|
| **RESEARCH** | 识别现有项目的分层结构；若结构混乱，记入 `研究发现.md` 作为后续重构候选 |
| **INNOVATE** | 评估方案时，**优先选有现成端口/适配器的实现**；从零写时按本文规划层级 |
| **PLAN** | 实施清单**必须**给出每个新文件的层级归属与命名；标注 `#include` 白名单 |
| **EXECUTE** | 写每个 `.c` / `.h` 前先确认在哪一层；写完按第 5、6 节自检 |
| **REVIEW** | 跑第 7 节"依赖方向检查表"；任一不通过 → 标记未验证，回 EXECUTE |

---

## 10. 例外条款（什么时候可以不分层）

- **代码量 < 500 行的玩具 demo**：可以单文件
- **资源极端紧张的 8bit MCU**（< 4KB Flash）：可以省 L1 HAL，但其他层级仍需保留
- **厂商示例工程**做 quick reference：原样保留即可，不强行重构
- **生产产品**：必须严格分层，无例外

---

## 11. Traceability（追溯，Required）

> 让"需求 → 设计 → 实现 → 测试 → 缺陷 → 偏差"形成可机械追溯的链条。每条链由统一 ID 形态绑定。

### 11.1 ID 规则

| 前缀 | 含义 | 形态 | 写入位置 |
|---|---|---|---|
| `REQ-` | 需求 | `REQ-<MODULE>-<NNN>` | `研究发现.md` / 用户需求清单 / Doxygen `@req` |
| `DES-` | 设计决策 | `DES-<MODULE>-<NNN>` | `项目规划清单.md` 轮次计划 / 模块文件头 |
| `IMPL-` | 实现条目 | `IMPL-<NNN>` | `编辑清单.md` 行项 / commit 消息 |
| `TEST-` | 测试用例 | `TEST-<MODULE>-<NNN>` | `tests/` 文件名 + 用例注释 |
| `RISK-` | 风险登记 | `RISK-<NNN>` | `研究发现.md` 风险表 |
| `DEFECT-` | 缺陷记录 | `DEFECT-<NNN>` | issue tracker + commit + changelog |
| `WAIVER-` | 偏差/豁免 | `WAIVER-<NNN>` | deviation record（见 `static-analysis-pipeline.md §4.5.4`） |

### 11.2 RIPER-5 阶段强制写入项

| 阶段 | 必须新增的 ID 类型 |
|---|---|
| RESEARCH | `REQ-` / `RISK-`（写入 `研究发现.md`） |
| INNOVATE | `DES-`（写入 `项目规划清单.md` 轮次决策段） |
| PLAN | `IMPL-` / `TEST-`（写入 `编辑清单.md` 与 `tests/` 占位） |
| EXECUTE | `DEFECT-`（如修旧缺陷）/ `WAIVER-`（如新增偏差） |
| REVIEW | 必须核对 REQ ↔ TEST 双向覆盖率 100% |

### 11.3 双向追溯硬约束

- 每个 `REQ-` 至少对应 1 个 `TEST-`（前向追溯）
- 每个 `TEST-` 必须引用 ≥ 1 个 `REQ-` 或 `DEFECT-`（反向追溯）
- 每个 `DEFECT-` 必须配 `TEST-` 复现并通过（防回归）
- 每个 `WAIVER-` 必须有 `RISK-` 评估 + 到期日

> 工具可选 doorstop / OpenFastTrace / Sphinx-Needs。最小实现：用 `grep -rnE '(REQ|TEST|DEFECT)-[A-Z0-9_]+-?[0-9]+'` 做覆盖率脚本即可。

---

## 12. 进一步阅读

- **Hexagonal / Ports & Adapters**：Alistair Cockburn 2005 [原始定义](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))
- **Clean Architecture in Embedded**：[serodriguez68/clean-architecture](https://github.com/serodriguez68/clean-architecture) — 依赖单向流入
- **CMSIS / AUTOSAR MCAL** — 工业级 HAL 标准化参考
- **Zephyr Device Model**：devicetree + driver API，最成熟的 vendor-neutral 实践
- **MISRA C 2012 Rule 21** — 模块化与禁止上层直接寄存器操作
- **Beningo "Embedded Basics: APIs vs HALs"** — API/HAL 边界清晰描述
- **STM32_Embedded_CPP**：[MootSeeker/STM32_Embedded_CPP](https://github.com/MootSeeker/STM32_Embedded_CPP) — 适配器层切换芯片家族的 C++ 范例
- **Throwtheswitch Unity + CMock** — Off-target 单元测试事实标准
