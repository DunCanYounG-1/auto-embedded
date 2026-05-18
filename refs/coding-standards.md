# 嵌入式代码规范（风格细则）

> 架构 / 分层 / 端口 / 命名前缀的硬约束在 `refs/embedded-architecture.md`，**先读那个**。本文只补**风格层面**的细则（命名、格式、注释、自检）。两个文件不重复。

---

## 1. 一图速览（5 条硬约束）

复述 `refs/embedded-architecture.md` 的核心，方便单文件查阅：

1. 应用层（`app_*`）**禁止** `#include` 厂商 HAL 头
2. 依赖单向向下：App → Service → Middleware → Driver → BSP → HAL(项目级) → Vendor HAL
3. 跨层调用必须走 **Port（抽象接口）**
4. 命名前缀强制：`hal_` / `bsp_` / `drv_` / `mid_` / `svc_` / `app_`
5. `main.c` 只允许 `bsp_init() → mid_init() → svc_init() → app_run()`

矛盾时以 `refs/embedded-architecture.md` 为准。

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

## 10. 快速自检清单（提交前过一遍）

- [ ] 应用层 `.c` 文件 `#include` 列表无厂商 HAL 头
- [ ] 命名前缀符合规则
- [ ] `main.c` ≤ 50 行
- [ ] 函数 ≤ 50 行、嵌套 ≤ 2、参数 ≤ 3
- [ ] 寄存器 / ISR 共享变量带 `volatile`
- [ ] 临界区用统一封装，没有散落 `__disable_irq`
- [ ] 没有 `extern <内部变量>` 跨模块直读
- [ ] 关键路径没有 `malloc` / `new`
- [ ] 退出前编译 warning 清零

清单全部 √ 才算"已验证"。
