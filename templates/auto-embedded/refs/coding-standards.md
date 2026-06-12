# 嵌入式代码规范（风格细则）

> 架构 / 分层 / 端口 / 命名前缀的硬约束在 `.auto-embedded/refs/embedded-architecture.md`，**先读那个**。本文只补**风格层面**的细则（命名、格式、注释、自检）。两个文件不重复。

---

## 1. 一图速览（5 条硬约束）

复述 `.auto-embedded/refs/embedded-architecture.md` 的核心，方便单文件查阅：

1. 应用层（`app_*`）**禁止** `#include` 厂商 HAL 头
2. 依赖单向向下：App → Service → Middleware → Driver → BSP → HAL(项目级) → Vendor HAL
3. 跨层调用必须走 **Port（抽象接口）**
4. 命名前缀强制：`hal_` / `bsp_` / `drv_` / `mid_` / `svc_` / `app_`
5. `main.c` 只允许 `bsp_init() → mid_init() → svc_init() → app_run()`

矛盾时以 `.auto-embedded/refs/embedded-architecture.md` 为准。

---

## 2. 文件 / 函数 / 命名

| 项 | 规则 |
|---|---|
| 文件名 | `<layer_prefix>_<module>.[ch]` 全小写（`hal_uart.c` / `drv_ssd1306.h` / `app_pid.c`） |
| 公开函数 | `<layer_prefix>_<module>_<verb>()`（`hal_uart_open` / `drv_ssd1306_clear` / `app_pid_step`） |
| 内部静态函数 | 同上 + `static` + 不在 `.h` 暴露 |
| 类型 | `<layer_prefix>_<name>_t`（`hal_uart_cfg_t`） |
| 枚举 | `<layer_prefix>_<name>_e` 或 `SCREAMING_CASE` |
| 宏 | `SCREAMING_WITH_PREFIX`（`BSP_LED_PORT`） |
| 头保护宏 | `MODULE_H`（`HAL_UART_H`）— **禁止**双下划线 `__` 开头（C 标准保留） |

**禁止**：驼峰 / 匈牙利 / 无前缀的全局函数 / 单字母变量（循环索引除外）。

### 2.1 命名词典（Mandatory，对齐 MISRA Rule 5.1-5.9 / BARR-C）

> 解决"同义不同名"的低头病：`config` vs `cfg`、`buffer` vs `buf`、`length` vs `len`。统一以下白名单，新增缩写须提交规范 PR。

**缩写白名单**：`cfg`/`ctx`/`buf`/`len`/`cap`/`idx`/`cnt`/`ptr`/`ref`/`fn`/`cb`/`hdl`/`reg`/`bit`/`msk`/`val`/`pos`/`src`/`dst`/`tmp`/`rx`/`tx`/`cmd`/`rsp`/`req`/`err`/`ack`/`nak`/`crc`/`csum`/`addr`/`offs`/`dev`/`ch`/`port`/`pin`/`irq`/`isr`/`dma`/`pwm`/`pll`/`fs`/`fp`/`gpio`/`adc`/`dac`/`spi`/`i2c`/`usart`/`uart`。

| 类别 | 规则 | 示例 |
|---|---|---|
| **单位后缀**（Mandatory） | 物理量/时间/计数必须带 SI 单位后缀 | `timeout_ms`、`period_us`、`freq_hz`、`vbat_mv`、`current_ma`、`size_bytes`、`len_words`、`angle_deg`、`temp_c`、`pressure_kpa` |
| **布尔前缀**（Required） | 布尔变量/函数用 `is_`/`has_`/`can_`/`should_`/`needs_`；不要 `flag` 单独存在 | `is_ready`、`has_data`、`can_sleep`、`drv_imu_is_calibrated()` |
| **回调后缀**（Required） | 回调函数末尾 `_cb`；ISR 末尾 `_isr` 或 `_IRQHandler` | `tx_done_cb`、`adc_eoc_isr`、`USART1_IRQHandler` |
| **错误码命名**（Required） | 错误枚举值用 `<LAYER>_ERR_<REASON>`，零值留给 OK | `HAL_ERR_TIMEOUT`、`DRV_IMU_ERR_NOT_READY` |
| **句柄类型**（Required） | 不透明句柄用 `_t`，内部 struct tag 用 `_s` | `typedef struct hal_uart_s hal_uart_t;` |
| **常量** | 编译期 `const`/`static const`/`#define` 全大写带前缀 | `BSP_LED_PIN`、`APP_PID_KP_MAX` |
| **标识符长度** | ≤ 31 字符显著（避免老工具链截断，MISRA Rule 5.1）；硬上限 63 | — |

**禁止**：`flag1`、`flag2`、`temp_var`、`my_*`、`new_*`（已被 C++ 占用）、`small_l_or_uppercase_O` 单字母（视觉混淆 1/l/I/0/O）。

### 2.2 #include 顺序（Required，对齐 ESP-IDF / Nordic）

`.c` 文件 include 必须分 4 组，组间空行：

```c
/* 1. 自身公开头 */
#include "drv_imu.h"

/* 2. C 标准库 */
#include <stdint.h>
#include <stddef.h>
#include <string.h>

/* 3. 项目级（HAL Port / BSP / 其他模块公开 API） */
#include "hal_i2c.h"
#include "hal_time.h"

/* 4. 平台/厂商头（仅 HAL Port 实现层允许） */
#include "stm32f4xx_hal.h"
```

**`.h` 文件**：只 include "自身需要的最小集"。**禁止**头文件包含本模块 `.c` 的依赖。

### 2.3 排版（Advisory，团队可改）

| 项 | 默认值 | 备注 |
|---|---|---|
| 行宽 | ≤ 100 字符 | 与 Zephyr 一致；ESP-IDF 120 / Linux 80 可改 |
| 缩进 | 4 空格，禁 Tab | 与 ESP-IDF/CMSIS 一致 |
| 大括号 | K&R（函数定义大括号另起一行可改 Allman） | 同一项目统一 |
| 空格 | `if (`、`for (`、`while (` 后接空格；二元运算符两侧空格 | — |
| 末行 | 文件末必须有换行符 | gcc 警告 |

> 排版冲突由项目根 `.clang-format` 强制（推荐用 LLVM 风格 + IndentWidth=4 + ColumnLimit=100）。

---

## 3. 函数与可读性

- 函数 ≤ 50 行（最佳 < 30）；超出多为职责未拆
- 嵌套层级 ≤ 2，优先用提前 `return` 减缩进
- 参数 > 3 个 → 收敛为 `<module>_cfg_t` 结构体
- 公共函数只做一件事；命名体现"动作 + 对象"
- 注释解释**为什么**，命名表达**做什么**；不要用注释救糟糕结构
- 重复 3 次的相似代码 → 提炼公共函数或表驱动

---

## 4. 模块组织

- 公开 API 在 `.h`，私有助手 `static`
- 不透明句柄（`typedef struct foo_s foo_t;`），调用方拿指针不拿成员
- 复位值 / 阈值 / 超时**禁止裸字面量**，必须命名常量或枚举或配置项
- 严禁 `extern` 跨模块直接读写内部变量（必须走 API）

---

## 5. ISR 与共享变量

- ISR 内**禁止**阻塞操作（无 `delay` / `printf` / 长循环 / 阻塞 IO）
- ISR 与主循环共享的变量必须 `volatile`
- 临界区用统一封装（`bsp_critical_enter() / bsp_critical_exit()`），**禁止**裸 `__disable_irq()` 散落代码
- 必要时使用原子操作

---

## 6. 关键关注点（嵌入式专项）

| 主题 | 要点 |
|---|---|
| 中断 | 优先级正确分组；ISR 最小化执行时间；避免死锁与优先级反转 |
| DMA | 配置完整 + 完成/错误回调；缓冲区同步（`volatile` / 缓存一致性） |
| 定时器 | 注意溢出；预分频计算清晰；精确定时用硬件捕获/比较 |
| 时钟 | 外设时钟使能；PLL 时序符合手册；APB 分频要重算 |
| 功耗 | 睡眠模式 / 唤醒源 / 外设关断顺序 |
| 内存 | 关键路径**不**动态分配；静态池 + 栈 + 链接期分配 |

---

## 7. 通用初始化四步法

任何外设 init 走：
1. 使能时钟（RCU/RCC）
2. 定义配置结构体
3. 配置结构体成员
4. 初始化外设

---

## 8. 寄存器双写注释

直接寄存器操作时（极少数场景，多数应走 HAL Port）：

```c
// 使能 GPIOA 时钟（RCC_APB2ENR.IOPAEN = 1）
RCC->APB2ENR |= RCC_APB2ENR_IOPAEN;
```

注释**必须**说明寄存器+位的语义，否则禁止裸 `|=` / `&= ~`。

---

## 9. 代码输出格式（生成/修改驱动模块时）

输出顺序：

1. **文件头**：版权 / 模块说明 / 一句话用途
2. **`.h` 文件**：头保护宏 + 类型 + 公开函数声明
3. **`.c` 文件**：include / 静态变量 / 公开函数实现 / 私有 static 助手
4. **使用说明**：3-5 行调用示例
5. **注意事项**：硬件约束 / ISR 安全 / 已知陷阱

---

## 9.1 Doxygen 模板（Required，对齐 BARR-C 文件头规范）

每个 `.c` / `.h` 顶部必须含**最小文件头**；公开 API 必须含 Doxygen 注释。

```c
/**
 * @file    drv_imu.c
 * @brief   ICM-20602 6 轴 IMU 驱动
 * @author  <name>            <!-- 作者 -->
 * @date    2026-05-22        <!-- 创建日期 -->
 * @version 1.2.0             <!-- 模块版本，破坏性变更主版本号 +1 -->
 * @req     REQ-IMU-001       <!-- 需求追溯 ID，可多条 -->
 * @safety  ASIL-A            <!-- 安全等级；无则写 N/A -->
 * @hw      I2C1 / PB6/PB7 / IRQ EXTI4   <!-- 硬件依赖 -->
 * @rtos    FreeRTOS 任务上下文          <!-- 调用上下文：task/isr/bare -->
 *
 * @changelog
 *   1.2.0 2026-05-22 增加 FIFO 模式
 *   1.1.0 2026-04-10 修复 Z 轴正负号 [REF DEFECT-IMU-09]
 */
```

公开 API 标准标签集（按需选用，前 5 个 Required）：

| 标签 | 用途 |
|---|---|
| `@brief` | 一句话功能 |
| `@param[in/out]` | 参数方向、单位、有效范围、NULL 是否允许 |
| `@retval` | 每个返回码语义；`@return` 用于非状态返回 |
| `@pre` | 调用前置条件（外设已初始化 / 互斥已持有等） |
| `@post` | 调用后状态变化 |
| `@context` | `task` / `isr` / `bare` / `any` |
| `@blocking` | `yes` / `no` / `timeout-bounded` |
| `@reentrant` | `yes` / `no` |
| `@isr_safe` | `yes` / `no`（与 `@context=isr` 互补） |
| `@locking` | 声明持锁顺序，避免死锁 |
| `@thread_safe` | `yes` / `no` / `with-external-lock` |

> Doxygen 检查可选启用 `clang-tidy` 的 `google-explicit-constructor` 与 `cppcheck` 的 `--enable=style`；强制门见 `.auto-embedded/refs/static-analysis-pipeline.md`。

---

## 10. 快速自检清单（提交前过一遍）

**基础（§1~§9 对应）**：

- [ ] 应用层 `.c` 文件 `#include` 列表无厂商 HAL 头
- [ ] 命名前缀符合规则 + 缩写在 §2.1 白名单内
- [ ] 物理量/时间变量带单位后缀（_ms/_us/_hz/_mv 等）
- [ ] `#include` 按 §2.2 四组排列
- [ ] `main.c` ≤ 50 行
- [ ] 函数 ≤ 50 行、嵌套 ≤ 2、参数 ≤ 3
- [ ] 寄存器 / ISR 共享变量带 `volatile`，但**不依赖** `volatile` 实现原子性
- [ ] 临界区用统一封装，没有散落 `__disable_irq`
- [ ] 没有 `extern <内部变量>` 跨模块直读
- [ ] 关键路径没有 `malloc` / `new`
- [ ] 退出前编译 warning 清零

**§11~§15 新增条目**：

- [ ] §11 类型：禁裸 `int`/`short`/`long`；浮点不在 ISR 出现；位域无符号；packed 仅协议结构 + 加注释
- [ ] §12 并发：临界区严格配对；DMA 共享 buffer 跨核/cache 一致；ISR 中无阻塞 RTOS API；锁顺序文档化
- [ ] §13 内存：链接器 `_heap_size = 0`（若全静态）；危险库函数 0 出现；buffer API 全带 capacity；栈水位有运行期报告
- [ ] §14 错误：所有可失败函数返回 `status_t`；公开 API 入口有参数 assert；HardFault/WDT/MemMgmt 有处理路径
- [ ] §15 可移植：固定 C 标准（如 C11）；编译选项含 `-Wall -Wextra -Werror -Wpedantic` 等价项；禁 `goto` / `setjmp` / `longjmp` / 递归 / VLA；所有循环可证明有限上界
- [ ] §9.1 Doxygen：文件头齐 + 公开 API 含 @brief/@param/@retval/@pre/@context

清单全部 √ 才算"已验证"。

---

## 11. 类型系统（Mandatory，对齐 MISRA Rule 10.1-10.8 / 11.x，CERT-C INT30-C/INT31-C/INT36-C）

### 11.1 固定宽度类型（Mandatory）

| 场景 | 类型 |
|---|---|
| 寄存器 / 协议字段 / 跨层 API / 存储格式 | `uint8_t` / `uint16_t` / `uint32_t` / `uint64_t` / 对应有符号 |
| 计数 / 长度 / 容量 | `size_t`（无符号） |
| 索引差 / 偏移 | `ssize_t` 或 `ptrdiff_t` |
| 布尔 | `bool`（`<stdbool.h>`），不要用 `int`/`BOOL`/`u8` 表示真假 |
| 字符 | `char`（仅文本）；二进制字节用 `uint8_t` |
| 内存地址转换 | `uintptr_t` |

**禁止**：裸 `int`/`short`/`long`/`unsigned`/`signed char` 出现在跨翻译单元接口、寄存器映射、协议结构、文件存储。

### 11.2 浮点（Required）

| 场景 | float | double | 备注 |
|---|---|---|---|
| 无 FPU MCU（Cortex-M0/M0+/M3） | 禁 | 禁 | 用 Q15/Q31 定点 |
| 单精度 FPU（M4F/M7F-SP/M33-SP） | 允许 | 禁 | 控制环、滤波器 |
| 双精度 FPU（M7F-DP/A 核） | 允许 | 允许 | 仅在精度证据充分时用 double |
| 任何 ISR 内 | **禁** | **禁** | FPU 上下文保存代价；若必须，主循环开 FPU lazy stacking + ISR 标记 |
| 协议 / 存储 / 跨层 API | 禁 | 禁 | 浮点二进制布局依赖编译器，用整数定点 |

**Mandatory**：禁止 float / int 隐式提升；显式 cast 必须加注释。**禁止** `==` / `!=` 比较浮点，用 `fabsf(a-b) < EPS`。

### 11.3 位域 / 联合 / 对齐（Required）

| 项 | 规则 |
|---|---|
| **位域** | 只用 `unsigned int` 基础类型（禁有符号位域，MISRA Rule 6.1）；不映射跨编译器寄存器（位序实现定义） |
| **联合** | 仅允许两种用途：① 协议视图（含 `static_assert(sizeof(u)==N)`）② CMSIS 厂商定义。禁止 type punning |
| **对齐** | DMA buffer：`__attribute__((aligned(4)))` 或目标芯片 cache line（M7=32B）；packed 结构必加 `__attribute__((packed))` + 注释说明原因 |
| **packed 访问** | packed 字段不可取址传给非 packed 指针参数（未对齐访问 fault） |
| **enum 大小** | enum 底层大小实现定义；跨模块/序列化时**禁用 enum 类型直接传输**，用 `uint8_t` + 显式 cast |

### 11.4 const / volatile（Required）

| 用途 | const | volatile |
|---|---|---|
| 编译期常量 | `static const xx` | — |
| 表驱动只读数据 | `const xx[]`（自动入 Flash） | — |
| 指针参数仅读 | `const T *p` | — |
| 寄存器 / 共享变量 / ISR 共享 | — | `volatile T` |
| MMIO 寄存器 | — | `volatile T * const` |
| **同时** | 寄存器只读字段 | `const volatile T *` |

**`volatile` 不是锁**：见 §12.1。

---

## 12. 并发与 ISR 加固（Mandatory，对齐 CERT-C CON43-C / SIG31-C，MISRA Rule 22.x）

### 12.1 `volatile` 边界（Mandatory）

`volatile` **只**保证：① 每次访问真去内存读写、② 抑制编译器寄存器缓存。**不**保证：

- ❌ 复合操作原子性（`x++` 不是原子的，即使 x 是 volatile）
- ❌ 不同 volatile 变量之间的读写顺序（要 `barrier()` / `DMB`）
- ❌ 跨 CPU 缓存可见性（要 `DSB` + cache 操作）

任何 ISR-task 或 task-task 共享变量，若访问跨 1 次读 + 1 次写（含读改写、多字段更新），必须走临界区或原子操作。

### 12.2 原子操作（Required）

- 单字（≤ MCU 寄存器宽度）对齐变量的纯读 / 纯写可视为原子（M0/M3/M4 上 32-bit 对齐 LDR/STR）
- 多字段 / 读改写 → C11 `<stdatomic.h>`（若工具链支持）或临界区
- ARMv7-M：可用 LDREX/STREX；ARMv6-M（Cortex-M0/M0+）**没有**独占指令，**必须**用临界区
- 标志位置位 / 清零：用 `atomic_flag` 或临界区，不要 `flag |= MASK;`

### 12.3 临界区（Mandatory）

| 规则 | 描述 |
|---|---|
| **配对** | 每个 `bsp_critical_enter()` 必须有同函数同分支 `bsp_critical_exit()`；提前 return 前补 exit |
| **嵌套** | 实现必须保存/恢复 `PRIMASK`（ARMv6-M）或 `BASEPRI`（ARMv7-M），允许嵌套不破坏外层状态 |
| **最短** | 临界区内禁止：循环 > 5 次、任何阻塞 API、任何 RTOS 调度切换 |
| **ISR 内** | 不需要再 disable IRQ（已在中断屏蔽态）；若需阻塞高优先级 ISR，用 `bsp_critical_enter_basepri(N)` |
| **不变量** | 临界区出入对应**单一不变量保护**，不要嵌套 3 层以上 |

### 12.4 内存屏障（Required）

| 屏障 | 用途 |
|---|---|
| `__DMB()` | 数据访问顺序屏障：写完 DMA buffer → 启动 DMA 前必有 |
| `__DSB()` | 等待所有访存完成：关 cache / 复位前 |
| `__ISB()` | 指令同步屏障：写 SCB / 改向量表 / 改时钟后 |
| `__COMPILER_BARRIER()` 或 `asm volatile("":::"memory")` | 仅阻止编译器重排，不动 CPU |

Cortex-M7/H7 / Cortex-A 还需配合 D-Cache 操作（`SCB_CleanDCache_by_Addr` / `InvalidateDCache_by_Addr`）保证 DMA 一致性。

### 12.5 RTOS-from-ISR API 白名单（Mandatory）

ISR 中**只允许**调用对应 RTOS 的 "FromISR" 后缀 API：

| RTOS | ISR-safe API 后缀 / 前缀 | 禁用示例 |
|---|---|---|
| **FreeRTOS** | `xQueueSendFromISR` / `xSemaphoreGiveFromISR` / `vTaskNotifyGiveFromISR` / `portYIELD_FROM_ISR` | `xQueueSend` / `xSemaphoreTake` / `vTaskDelay` |
| **Zephyr** | `k_sem_give` (irq-safe) / `k_msgq_put` (with K_NO_WAIT) | `k_sleep` / `k_mutex_lock` / 任何带阻塞超时的 API |
| **RT-Thread** | `rt_sem_release` / `rt_event_send`（ISR 上下文调度器会延后切换） | `rt_thread_delay` / `rt_mutex_take(timeout!=0)` |
| **裸机** | 只设标志位 / 推队列 / `__DSB()` 后启 DMA | `printf` / `HAL_Delay` / 任何忙等 > 5µs |

**强制 ARCH-9（见 `scripts/arch-check.sh`）**：扫描 ISR 体内禁用 API 名（regex 黑名单）。

### 12.6 Port 注解（Required）

`hal_*.h` 公开 API 必须在 Doxygen 注释里标注 `@context` / `@blocking` / `@reentrant` / `@isr_safe` / `@locking`（详见 §9.1）。

---

## 13. 内存与资源安全（Mandatory，对齐 MISRA Rule 18.x/21.x，CERT-C ARR30/MEM35/STR31，JPL Rule 3）

### 13.1 Heap 封禁（Mandatory）

默认配置：**链接器层 heap = 0**，从工具链根除 `malloc`/`free`/`new`/`delete`/`sbrk`。

GCC/ArmGCC 链接脚本：

```ld
_heap_size = 0;          /* 强制 heap 为 0；若 newlib 仍调 malloc 会链接失败 */
__heap_base = ORIGIN(RAM) + LENGTH(RAM);
__heap_limit = __heap_base;
```

例外审查模板（每次例外都要在 PLAN 阶段记入 `项目规划清单.md`）：

```yaml
heap_exception:
  reason: "lwIP 内部 mem_malloc，无法移除"
  scope: "仅在 lwIP 子系统启动时分配一次"
  max_bytes: 16384
  acquire_phase: "初始化阶段（main 之前）"
  release_phase: "无"
  approver: "<name>"
  expire: 2026-12-31
```

若必须用 heap，启用 RTOS 的固定池分配（FreeRTOS `heap_4.c` + `configSUPPORT_DYNAMIC_ALLOCATION` 控制；Zephyr `k_heap` 显式实例），**禁止**全工程共享 newlib heap。

### 13.2 危险库函数禁用（Mandatory，对齐 MISRA Rule 21.x / CERT-C STR31-C）

| 禁用 | 必用替代 |
|---|---|
| `strcpy` / `strcat` | `strncpy` + 显式 `\0`；或自写 `xstrlcpy(dst, src, cap)` |
| `sprintf` / `vsprintf` | `snprintf` / `vsnprintf` |
| `gets` | 用 `fgets` 或自定义带 capacity 函数 |
| `atoi` / `atol` / `atof` | `strtol` / `strtoul` / `strtof` + 错误检查 |
| `system` / `popen` | 嵌入式禁用 |
| `setjmp` / `longjmp` | 禁用（JPL Rule 1） |
| 递归（自身/相互） | 禁用（JPL Rule 1，栈不可证） |
| VLA `int arr[n]` | 禁用（MISRA Rule 18.8，栈不可证） |
| `assert.h` 默认 | 自定义 `EMB_ASSERT()`（见 §14） |

### 13.3 Buffer-with-Capacity 模式（Mandatory）

所有 buffer 类 API 必须**同时**接收 buffer 指针和 capacity，并返回实际写入/读取字节数：

```c
/* ❌ 不允许：调用方无法表达 capacity */
int drv_log_format(char *out, const char *fmt, ...);

/* ✅ Mandatory：capacity + 实际返回 */
size_t drv_log_format(char *out, size_t cap, const char *fmt, ...);
                   /* 返回写入字节数（不含 \0）；若截断返回 cap-1 */
```

公开 buffer API 必须开头校验：`if (!out || cap == 0) return 0;`。

### 13.4 栈水位监控（Required）

| 平台 | 监控 |
|---|---|
| **FreeRTOS** | 任务创建后周期采样 `uxTaskGetStackHighWaterMark()`；预算占用率 < 70% |
| **Zephyr** | `K_THREAD_STACK_DEFINE` + `k_thread_stack_space_get()` |
| **裸机** | 启动时 fill stack 区为 0xA5A5A5A5；运行期扫描底部连续 magic 数计算水位 |
| **中断栈** | ARMv7-M：`MSP` 栈；Cortex-M0 共享主栈；预算 ≥ 1 KB 或最深 ISR × 2 |
| **报告** | 必须在 REVIEW 阶段证据包含**每任务实测水位 / 编译期栈大小**对照表 |

### 13.5 链接段约束（Required）

| 段 | 用途 | 规则 |
|---|---|---|
| `.isr_vector` | 向量表 | 只在 startup 文件出现 |
| `.text` | 代码 | 默认 Flash |
| `.rodata` | 只读常量 | 默认 Flash；大 LUT 显式 `const` 入 Flash |
| `.data` | 已初始化 RAM | 启动时从 Flash 复制 |
| `.bss` | 零初始化 RAM | **禁止**依赖 BSS 零初始化的"未初始化关键安全状态"——必须显式 `= 0` |
| `.noinit` | 复位保留区 | 用于看门狗复位标志、Bootloader-App 通信 |
| `.dma` / `.ramfunc` / `.ccmram` / `.fastcode` / `.itcm` | 平台特定 | 在 `bsp_xxx_layout.ld` 集中声明；模块用 `__attribute__((section(".xxx")))` 标注 |

---

## 14. 错误处理与防御性编程（Required，对齐 CERT-C ERR33-C/ERR34-C/MSC11-C，JPL Rule 5）

### 14.1 三档断言（Required）

| 档 | 宏 | 触发时机 | 失败动作 |
|---|---|---|---|
| **DEV** | `EMB_ASSERT_DEV(expr)` | 开发期不变量违反 | Release 编译去除；Debug 进 HardFault breakpoint |
| **RUNTIME** | `EMB_ASSERT(expr)` | 生产期不变量违反 | 调用 `emb_panic(file, line, expr)`，进 fail-safe |
| **FAILSAFE** | `EMB_ENSURE(expr, recovery)` | 可恢复错误 | 执行 recovery 表达式 + 返回错误码 |

JPL Rule 5：**每个公开函数 ≥ 2 个 assert**（典型：入口 NULL 校验 + 状态校验 / 出口后置条件）。

### 14.2 参数校验模式（Required）

```c
hal_status_t hal_uart_write(hal_uart_t *u, const uint8_t *buf, size_t len, uint32_t to_ms) {
    EMB_ASSERT(u   != NULL);
    EMB_ASSERT(buf != NULL || len == 0);
    if (len == 0)         return HAL_OK;
    if (len > UART_MAX)   return HAL_ERR_PARAM;
    if (!u->is_open)      return HAL_ERR_NOT_READY;
    /* ... */
}
```

公开 API 入口必须：① assert 不可恢复前置条件；② 显式 return `*_ERR_PARAM` 处理可恢复错误。

### 14.3 错误码层级（Required）

| 层 | 错误码前缀 | 规则 |
|---|---|---|
| HAL  | `HAL_ERR_*`  | 5 个标准枚举值：`OK` / `BUSY` / `TIMEOUT` / `PARAM` / `HW` |
| Driver | `DRV_<device>_ERR_*` | 可映射 HAL 错误为统一 `DRV_ERR_HAL_*` |
| Middleware | `MID_<name>_ERR_*` | 同上 |
| Service / App | `SVC_*_ERR_*` / `APP_*_ERR_*` | 同上 |

**Mandatory**：下层错误**不得吞掉**。中层若映射，必须保留 `root_cause` 字段或在日志输出原始错误码。函数返回 `_ERR_*` 必须**全部分支处理**（用 `(void)` 显式忽略需 `// REASON:` 注释）。

### 14.4 Panic / Fault / Watchdog（Required）

| 异常 | 必须实现的处理 |
|---|---|
| **HardFault** | 抓取 PC/LR/PSR/SP + MSP/PSP + 栈回溯前 8 字；写 `.noinit` 区；复位前 flush UART |
| **MemManage / BusFault / UsageFault**（ARMv7-M） | 单独 handler，不与 HardFault 合并；记录 CFSR |
| **WDT 复位** | 复位原因寄存器读出 + `.noinit` 计数器自增；连续 3 次 WDT 复位进 safe-mode |
| **Stack Overflow**（FreeRTOS） | `vApplicationStackOverflowHook` 记录任务名 + 复位 |
| **assert 失败** | 默认 `emb_panic`：日志 + flush + WDT 即时触发复位（生产）；Debug 直接 `__BKPT(0)` |

### 14.5 错误路径测试门（Required）

每个公开 API 必须有至少 4 个错误路径单测：① NULL ② 长度 0 / 越界 ③ 超时 ④ HW 模拟错误（mock 返回 `HAL_ERR_HW`）。

---

## 15. 可移植 C（Required，对齐 MISRA Rule 1.1/1.2/1.3，JPL Rule 1+10）

### 15.1 C 标准固定（Required）

| 项 | 规则 |
|---|---|
| **C 标准** | 固定 `C11`（`-std=c11`），不接受 GNU 扩展默认开启 |
| **编译器扩展** | 通过 `EMB_PACKED`/`EMB_ALIGNED(N)`/`EMB_WEAK`/`EMB_UNUSED`/`EMB_NORETURN` 封装；禁止 `__attribute__` 散落业务代码 |
| **整数大小** | 不假设 `int`/`long`/`size_t` 具体宽度；跨平台代码用 `stdint.h` |
| **字节序** | 协议序列化 / 网络通信必须显式 `htons`/`htonl` 或自定义 `EMB_LE16/LE32/BE16/BE32` |
| **未对齐访问** | 禁止；packed 结构访问通过 `memcpy` 拷出 |

### 15.2 控制流约束（Mandatory，JPL Rule 1+2）

| 规则 | 描述 |
|---|---|
| **禁 `goto`** | 例外：清理路径（错误 unwind）允许，但只能向前跳到同函数末尾 `cleanup:` 标签 |
| **禁 `setjmp` / `longjmp`** | 任何场景禁用 |
| **禁递归** | 直接与相互递归均禁；表达树用迭代栈代替 |
| **循环必有可证明上界** | `while(1)` 仅允许在 ① RTOS 任务体 ② `app_run()` 主循环 ③ ISR 等待 1 个 flag。其他循环必须 `for (i=0; i<MAX; i++)` 或显式超时计数 |
| **禁 VLA** | `int arr[n]`（n 为运行期变量）禁用；用 `#define MAX_N 128; int arr[MAX_N]` |
| **禁可变参数业务函数** | `...` 仅允许在日志类函数 |

### 15.3 编译器属性封装（Required）

```c
/* common/emb_compiler.h —— 一处定义，全工程共用 */
#if defined(__GNUC__) || defined(__clang__)
  #define EMB_PACKED      __attribute__((packed))
  #define EMB_ALIGNED(N)  __attribute__((aligned(N)))
  #define EMB_WEAK        __attribute__((weak))
  #define EMB_UNUSED      __attribute__((unused))
  #define EMB_NORETURN    __attribute__((noreturn))
  #define EMB_SECTION(s)  __attribute__((section(s)))
  #define EMB_LIKELY(x)   __builtin_expect(!!(x), 1)
  #define EMB_UNLIKELY(x) __builtin_expect(!!(x), 0)
#elif defined(__ICCARM__)        /* IAR */
  /* IAR 等价定义 */
#elif defined(__CC_ARM) || defined(__ARMCC_VERSION)  /* armcc / armclang */
  /* Keil 等价定义 */
#else
  #error "Unknown compiler"
#endif
```
