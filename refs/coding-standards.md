# 嵌入式代码规范参考

> 本文件由主协议按需加载。EXECUTE 阶段编写代码时读取此文件。
>
> **强制前置阅读**：本文规范的根基是 `refs/embedded-architecture.md` 的分层架构（HAL/BSP/Driver/Middleware/Service/App + Ports & Adapters）。**先读分层规范，再读本文细则**。两者矛盾时以 `embedded-architecture.md` 为准。

---

## 顶层硬约束（违反 = 屎山预警）

按 `refs/embedded-architecture.md` 第 0/1/7 节：

1. **应用层（`app_*`）禁止 `#include` 厂商 HAL 头**（如 `stm32f4xx_hal.h` / `gd32f4xx.h` / `esp_system.h`）
2. **依赖方向单向向下**：App → Service → Middleware → Driver → BSP → HAL（项目级）→ Vendor HAL
3. **跨层调用必须走 Port（抽象接口）**：禁止 `app_*` 直接调 `bsp_*` 或厂商 API
4. **命名前缀强制**：`hal_` / `bsp_` / `drv_` / `mid_` / `svc_` / `app_` — 看前缀就知道在哪一层
5. **`main.c` 只允许 4 件事**：`bsp_init()` → `mid_init()` → `svc_init()` → `app_run()`，不得超过 50 行

---

## 模块化编程规则

**核心原则**：每个功能/外设模块独立为 `.c` + `.h` 文件对，`main.c` 保持整洁简单。

**文件组织结构**：
```
项目目录/
├── main.c              // 仅包含初始化调用和主循环
├── led.c / led.h       // LED 控制模块
├── uart.c / uart.h     // 串口通信模块
├── timer.c / timer.h   // 定时器模块
├── adc.c / adc.h       // ADC 采集模块
└── ...
```

**main.c 规范**：
- 仅包含：头文件引用、全局初始化调用、主循环逻辑
- 禁止在 `main.c` 中直接编写外设驱动代码或复杂业务逻辑
- 初始化统一通过调用各模块的 `XXX_Init()` 函数完成

**`main()` 硬性约束**：
- `main()` 只能做顶层编排，不得承载模块实现细节；推荐结构为 `System/Board/App_Init()` + `App_RunOnce()/Scheduler_Run()`
- 超过 10 行的连续寄存器配置、协议解析、状态机、滤波/PID、异常恢复逻辑，必须提取到独立模块 API
- `while(1)` 中只允许调度、轮询入口、事件分发、喂狗和低功耗入口；禁止塞入大段 `if/else`、`switch`、`for` 算法流程
- 当 `main.c` 需要局部静态状态、私有辅助函数或跨模块细节注释时，默认说明边界已经错误，应回退到模块内实现

**触发拆分的典型信号**：
- 同一段代码同时承担初始化、业务处理、异常恢复三个及以上职责
- 同一函数既操作硬件寄存器又处理业务决策
- 为了“方便”在 `main()` 中复制粘贴多段相似初始化序列
- 需要在 `main()` 里解释某段代码“为什么这么写”才能看懂

**模块文件规范**：
- `.h` 文件：包含头文件保护宏、函数声明、宏定义、类型定义
- `.c` 文件：包含具体实现、模块内部静态变量
- 模块间通过头文件暴露的接口通信，禁止跨模块直接访问内部变量
- 中断服务函数（ISR）放在对应模块的 `.c` 文件中，而非 `main.c`

## 解耦与可读性规则

**分层要求**：
- 推荐依赖方向：`main/app` → `service` → `driver/bsp` → `hal/register`
- 上层只能通过下层头文件暴露的 API 交互，禁止跨层直连内部实现
- 驱动层负责硬件访问，业务层负责策略和状态，禁止同一函数横跨两层职责

**接口设计要求**：
- 公共函数只做一件事，名称必须体现动作和对象，如 `Motor_Init()`、`Telemetry_RunOnce()`
- 公共 API 放头文件，模块内部辅助函数默认 `static`
- 参数超过 3 个时优先改为配置结构体；共享资源优先封装为句柄或上下文对象
- 复位值、阈值、超时等禁止裸字面量散落，必须抽成具名常量、枚举或配置项

**可读性要求**：
- 普通函数建议控制在 20 行左右；确因寄存器初始化序列较长而超出时，必须用注释分段并保持单一职责
- 条件嵌套优先控制在 2 层以内；优先用提前返回减少缩进
- 注释解释“为什么”，命名表达“做什么”；不要用注释补救糟糕的结构
- 复制粘贴的相似流程必须优先提炼公共函数或公共配置表

**命名规范**：
- 文件名使用小写，与模块功能对应（如 `gpio.c`、`spi.c`）
- 函数名以模块名为前缀（如 `LED_Init()`、`UART_SendByte()`）
- 头文件保护宏格式：`MODULE_H`（如 `LED_H`、`UART_H`），**禁止**以双下划线 `__` 开头（C 标准保留标识符）

**main.c 示例**：
```c
#include "board.h"
#include "app.h"

int main(void)
{
    System_Init();
    Board_Init();
    App_Init();

    while (1)
    {
        App_RunOnce();
    }
}
```

**禁止示例**：
```c
int main(void)
{
    SystemInit();

    /* 下面这种把初始化细节、协议解析、算法处理全部堆进 main 的写法禁止出现 */
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    GPIO_Init(GPIOA, &gpio_cfg);
    USART_Init(USART1, &uart_cfg);
    while (1)
    {
        Parse_Frame();
        RunPidController();
        Recover_When_Fault();
    }
}
```

应拆为 `Board_Init()`、`Comm_RunOnce()`、`Control_RunOnce()`、`FaultMgr_RunOnce()` 等模块 API。

---

## 代码块格式

```c
/* ... 现有代码 ... */
void Peripheral_IRQHandler(void)
{
/* {{ 修改 }} */
+  /* 检查中断标志 */
+  if(Peripheral_GetITStatus(FLAG) != RESET)
+  {
+    Peripheral_ClearITPendingBit(FLAG);
+    counter++;
+  }
  /* ... 现有代码 ... */
}
```

---

## 禁止行为

- 使用未验证的依赖
- 留下不完整功能
- ISR 中使用阻塞操作
- ISR 中过度使用栈空间
- 关键路径中动态内存分配
- 忽略硬件约束
- 混合不同库的 API 调用
- 在 `main.c` 中堆砌大段业务逻辑、寄存器配置或协议/算法实现
- 通过 `extern` 直接跨模块读写内部变量代替 API 交互
- 用注释解释耦合代码而不是拆分职责边界

---

## 嵌入式关键关注点

- **中断处理**：正确配置优先级，最小化 ISR 执行时间，避免死锁
- **DMA 操作**：正确配置，处理完成/错误回调，管理缓冲区同步
- **定时器使用**：考虑溢出、预分频器计算、精确定时
- **功耗管理**：睡眠模式、唤醒源、功耗优化
- **时钟配置**：外设时钟设置、PLL 配置、时序要求

### 通用初始化四步法

1. **使能时钟**
2. **定义配置结构体**
3. **配置结构体成员**
4. **初始化外设**

---

## 代码输出格式规范

生成或修改驱动模块时，按以下结构组织输出，确保每次输出格式统一：

```
## 文件：模块名.h

​```c:path/to/module.h
/**
 * @file    module.h
 * @brief   模块功能简述
 */

#ifndef MODULE_H
#define MODULE_H

#ifdef __cplusplus
extern "C" {
#endif

#include "平台头文件.h"

/* 宏定义 */
#define BUFFER_SIZE    256

/* 类型定义 */
typedef struct {
    uint32_t param1;
    uint8_t  param2;
} module_config_t;

/* 函数声明 */
uint8_t Module_Init(module_config_t *config);
int     Module_SendData(uint8_t *data, uint16_t len);

#ifdef __cplusplus
}
#endif

#endif /* MODULE_H */
​```

## 文件：模块名.c

​```c:path/to/module.c
/**
 * @file    module.c
 * @brief   模块功能实现
 */

#include "module.h"

/* 私有宏定义 */
/* 私有变量 */
static volatile uint8_t is_busy = 0;

/* 私有函数声明 */
static void Private_Helper(void);

/* 公共函数实现 */
uint8_t Module_Init(module_config_t *config) { ... }

/* 私有函数实现 */
static void Private_Helper(void) { ... }
​```

## 使用说明

1. 初始化流程和调用顺序
2. 典型使用场景的代码片段
3. 根据实际硬件需要调整的要点（引脚、时钟等）

## 注意事项

- 硬件连接要求和引脚对应关系
- 已知限制或资源约束
- 调试建议（如何验证模块工作正常）
```

---

## 寄存器操作双写注释

使用库函数编写驱动时，在**关键配置位置**用注释附上对应的寄存器操作方式。帮助理解底层原理，也方便需要极致性能时切换到寄存器操作。

**规则**：
- 不要求每行库函数都附注释，只在**关键配置点**（时钟使能、外设初始化、模式选择）处标注
- 注释格式统一为 `/* 寄存器方式: ... */`

**示例**：

```c
/* 使能 USART2 时钟 */
RCC_APB1PeriphClockCmd(RCC_APB1Periph_USART2, ENABLE);
/* 寄存器方式: RCC->APB1ENR |= RCC_APB1ENR_USART2EN; */

/* 配置 PA2 为复用推挽输出 */
GPIO_InitStructure.GPIO_Pin = GPIO_Pin_2;
GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
GPIO_Init(GPIOA, &GPIO_InitStructure);
/* 寄存器方式:
 * GPIOA->CRL &= ~(0xF << 8);       // 清除 PA2 配置
 * GPIOA->CRL |=  (0xB << 8);       // PA2: 复用推挽 50MHz (CNF=10, MODE=11)
 */
```

---

## 快速自检清单

每步代码生成完成后，逐项核对以下 9 条。全部通过才提交给用户审查：

- [ ] **`main.c` 编排性**：`main()` 只保留初始化 API、循环调度和顶层控制入口，没有大段实现细节
- [ ] **模块边界**：公共 API、私有函数、模块状态边界清晰，没有跨模块直接读写内部变量
- [ ] **函数职责**：函数只做一件事，长函数已拆分；参数超过 3 个时已评估是否应改为配置结构体
- [ ] **命名规范**：函数前缀与模块名一致，变量/宏/结构体命名符合本文件“命名规范”章节
- [ ] **错误处理**：公共函数有参数检查，返回值能区分成功/失败原因
- [ ] **中文注释**：关键步骤有注释说明意图，非显而易见的数值标注了来源
- [ ] **使用示例**：提供了初始化和典型调用的代码片段
- [ ] **寄存器双写**：关键配置点附注了寄存器操作方式
- [ ] **嵌入式安全**：`volatile` 用于 ISR/DMA 共享变量、无裸 `while` 轮询、临界区处理正确
