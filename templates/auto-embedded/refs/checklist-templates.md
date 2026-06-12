# 清单格式模板参考

> 本文件由主协议按需加载。首次创建项目规划清单或编辑清单时读取此文件获取格式。
>
> **文件名双轨约定**（来自 `SKILL.md`）：
> | 中文正名 | 英文别名 |
> |---|---|
> | `项目规划清单.md` | `plan.md` |
> | `编辑清单.md` | `edits.md` |
> | `硬件资源表.md` | `hw-resources.md` |
> | `研究发现.md` | `findings.md` |
>
> 章节标题也支持双轨命名：
> | 中文章节 | 英文章节 |
> |---|---|
> | `## 项目信息` | `## Project Info` |
> | `## 轮次计划` | `## Rounds` |
> | `## 芯片与开发环境` | `## Chip & Toolchain` |
> | `## 引脚分配表` | `## Pin Assignments` |
> | `## 技术发现` | `## Findings` |
>
> 同一项目内**只用一套**，不要混用。

---

## 项目规划清单格式

```markdown
# 项目规划清单

## 项目信息
- **项目名称**：[项目名]
- **芯片型号**：[如 STM32F103C8T6]
- **固件库**：[如 StdPeriph]
- **当前阶段**：RESEARCH / INNOVATE / PLAN / EXECUTE / REVIEW
- **trace_id**：[如 imu-fix-001]
- **当前轮次**：[如 Round 2/4]
- **下次继续点**：[具体描述从哪里继续，如"EXECUTE 步骤 3：实现 UART 中断处理"]
- **停止条件**：[如“若再失败 2 次则回 RESEARCH”]
- **创建日期**：[日期]
- **最后更新**：[日期]

## Competition State（仅比赛模式 v2 需要）

> **位置约定（v2.1）**：以下 YAML 块在实际工程的 `项目规划清单.md` 中应放在**最顶部**（标题之后立即出现的第一个 fenced YAML 块），不嵌在任何 `## XXX` 节内。自动解析工具按"第一个 yaml fence"定位。下方模板仅展示结构，写入时把整个 fenced block 放到文件顶部。

```yaml
competition_state:
  trace_id: comp-2026-001
  current_cp: CP-0b            # CP-0a / CP-0b / CP-1 / CP-1.5 / CP-2 / CP-3 / CP-4 / CP-5
  state: in_progress           # not_started / in_progress / passed / blocked / failed
  blocked_by: []               # 仅 state=blocked 时填，结构见 .auto-embedded/refs/contracts.md
  passed_cps:                  # 已过的 CP，含 git tag
    - cp: CP-0a
      tag: v0.0-init
      timestamp: 2026-05-19T09:00:00+08:00
  active_agents: []            # 当前并行运行的 subagent 列表
  defect_queue: []             # Defect Ticket，结构见 .auto-embedded/refs/contracts.md
  retry_table: {}              # root_cause_id → retry_count_global
```

> 字段语义与门禁表完整规范见 .auto-embedded/refs/contracts.md §比赛状态机。`embedded-arch` 写入，其他 subagent 只读。

## 轮次计划

| 轮次 | 目标 | 责任角色 | 验证标准 | 状态 | 备注 |
|------|------|---------|---------|------|------|
| 1 | 确认 UART 中断入口 | Scout | 锁定文件和 ISR 路径 | 已完成 | `usart.c` |
| 2 | 修复 RXNE 清中断时机 | Builder | 编译通过 + 串口回环正常 | 进行中 | |

## 功能模块清单

| 序号 | 模块名称 | 文件 | 状态 | 完成日期 | 备注 |
|------|---------|------|------|---------|------|
| 1 | 系统时钟配置 | system.c/h | 已完成 | 2026-03-08 | 72MHz |
| 2 | LED 驱动 | led.c/h | 已完成 | 2026-03-08 | PC13 |
| 3 | 串口通信 | uart.c/h | 进行中 | - | USART1 |
| 4 | 定时器 PWM | timer.c/h | 待开发 | - | TIM2 |
| 5 | ADC 采集 | adc.c/h | 待开发 | - | PA0 |

## 开发日志

### [日期] - [操作摘要]
- 完成了 XXX 模块的开发
- 下一步计划：XXX
```

### 状态定义

| 状态 | 含义 |
|------|------|
| **待开发** | 已规划但尚未开始编码 |
| **进行中** | 正在开发，尚未完成 |
| **已完成** | 开发完毕，通过 REVIEW |
| **已搁置** | 暂时搁置，记录原因 |

### 注意事项

- 文件名固定为 `项目规划清单.md`，位于**工程根目录**
- 清单一旦创建不得删除，只能更新状态
- **每次阶段切换必须更新"当前阶段"和"下次继续点"字段**，确保会话恢复时能准确定位
- 每次状态变更必须更新"最后更新"日期
- 新增模块追加到表格末尾，保持序号连续

```markdown
# 编辑清单

## [日期] - [任务简述]
- **trace_id**：`<id>`
- **owner_agent**：`embedded-drv`           ★v2.1 必填（哪个 subagent 写的）
- **轮次/角色**：`Round 2 / Builder`
- **修改文件**：`文件路径`
- **artifact_hash**：`sha256:<前 12 字符>`  ★v2.1（git hash-object 算出，确认产物未被覆盖）
- **操作类型**：新增 / 修改 / 删除
- **操作内容**：简要描述做了什么
- **关联模块**：涉及的功能模块名称
- **关联 Ticket**：`D-001` / 无           ★v2.1（修复 Defect Ticket 时填）
- **status**：`open` / `fixing` / `rerun_pending` / `resolved`  ★v2.1（与 Defect Ticket 联动；非修复操作填 `resolved`）
- **验证标准**：`<命令或通过条件>`
- **验证结果**：通过 / 失败 / 待验证
- **Git提交**：`<commit hash>` / 无（无变更，未提交）
- **远端同步**：已 push / 未 push（无远端或未配置）
- **回档记录**：无 / 从 `<hashA>` 回到 `<hashB>`（原因：XXX，stash：是/否）

## [日期] - [任务简述]
- **trace_id**：`comp-2026-001`
- **owner_agent**：`embedded-drv`
- **修改文件**：`drivers/drv_led.c`
- **artifact_hash**：`sha256:a1b2c3d4e5f6`
- **操作类型**：新增
- **操作内容**：新建 LED 驱动模块 drv_led.c / drv_led.h
- **关联模块**：LED
- **关联 Ticket**：无
- **status**：resolved
- **Git提交**：`a1b2c3d`
- **远端同步**：已 push
- **回档记录**：无
```

### 编辑清单_<ROLE>.md 子清单（v2.1）

**命名约定（强制）**：`<ROLE>` 必须是**大写枚举**，从下列 5 个中选 1 个：

```
编辑清单_DRV.md      ← embedded-drv 写
编辑清单_ALG.md      ← embedded-alg 写
编辑清单_QA.md       ← embedded-qa 写
编辑清单_MATLAB.md   ← embedded-matlab 写
编辑清单_REPORT.md   ← embedded-report 写
```

**禁止**：小写（`_drv.md`）、混合大小写（`_Drv.md`）、placeholder 字面值（`_<role>.md`、`_role.md`）。Linux/Git/Claude 字面解读敏感，必须严格大写。

6 个 subagent 各自维护一个 `编辑清单_<ROLE>.md`（避免并行写冲突），arch 在 CP-2 末尾合并到主 `编辑清单.md`：

```markdown
# 编辑清单_DRV   （embedded-drv 写）

## [日期] - 实现 UART/SPI/ADC/RTC 驱动
- **trace_id**：`comp-2026-001`
- **owner_agent**：`embedded-drv`
- **新增文件**：
  | 路径 | artifact_hash | 公共 API |
  |---|---|---|
  | drivers/drv_uart.c | sha256:1a2b3c4d... | drv_uart_init / write / read |
  | drivers/drv_adc.c  | sha256:5e6f7a8b... | drv_adc_init / read_channel |
- **接口契约符合度**：与 架构设计.md v1.0 一致 ✓
- **arch-check.sh**：exit 0 ✓
- **arch-check.sh --hw-check**：exit 0 ✓
- **关联 Ticket**：无
- **status**：resolved
- **handoff_to**：embedded-alg（可消费 drv_*.h）
```

合并规则：
1. CP-2 末尾 arch 把 `编辑清单_<ROLE>.md` 内容 append 到主 `编辑清单.md`
2. 删除 `编辑清单_<ROLE>.md` 临时文件
3. 主清单按时间倒序排列

### 注意事项

- 清单文件始终位于**工程根目录**下，文件名固定为 `编辑清单.md`
- 每条记录必须包含日期、修改文件、操作类型、操作内容四个字段
- 每条记录必须包含 Git 信息：`Git提交`、`远端同步`、`回档记录`
- 启用长任务治理时，每条记录必须包含：`trace_id`、`轮次/角色`、`验证标准`、`验证结果`
- 记录按时间倒序排列（最新的在最前面）
- 不要删除历史记录，只追加新记录

---

## 硬件资源表格式

```markdown
# 硬件资源表

## 芯片与开发环境
- **芯片型号**：[如 STM32F103C8T6]
- **内核**：[如 Cortex-M3]
- **主频**：[如 72MHz]
- **Flash / RAM**：[如 64KB / 20KB]
- **开发框架**：[StdPeriph / HAL / LL / ESP-IDF / Arduino]
- **IDE**：[Keil MDK / STM32CubeIDE / PlatformIO]
- **NVIC 分组**：[如 Group2 (2位抢占/2位子优先级)]
- **最后更新**：[日期]

## 资源锁定区（机器可读，必填）★v2

`scripts/arch-check.sh --hw-check` 会解析此 YAML 块，**自动检测 pin / DMA / IRQ 冲突**。任何冲突 → CP-1 不允许通过。

```yaml
hw_lock:
  pins:
    - { id: PA0,  peripheral: ADC1,    af: ADC_CH0,    owner: drv_adc,    status: locked }
    - { id: PA9,  peripheral: USART1,  af: USART1_TX,  owner: drv_uart,   status: locked }
    - { id: PA10, peripheral: USART1,  af: USART1_RX,  owner: drv_uart,   status: locked }
    - { id: PB6,  peripheral: TIM4,    af: TIM4_CH1,   owner: drv_pwm,    status: locked }
    - { id: PC13, peripheral: GPIO,    af: GPIO_OUT,   owner: drv_led,    status: locked }
  dma:
    - { stream: DMA1_CH1, peripheral: ADC1,      direction: P2M, owner: drv_adc,  status: locked }
    - { stream: DMA1_CH4, peripheral: USART1_TX, direction: M2P, owner: drv_uart, status: locked }
  irq:
    - { irqn: TIM4_IRQn,   priority_preempt: 0, priority_sub: 0, owner: drv_pwm }
    - { irqn: USART1_IRQn, priority_preempt: 1, priority_sub: 0, owner: drv_uart }
    - { irqn: DMA1_CH1_IRQn, priority_preempt: 1, priority_sub: 1, owner: drv_adc }
  timers:
    - { id: TIM2, role: systick_alt, owner: bsp,        status: reserved }
    - { id: TIM4, role: pwm,         owner: drv_pwm,    status: locked }
```

**字段语义**：
- `pins.id`：MCU 引脚名（PA0/PB6/...）
- `pins.peripheral`：使用的外设家族（ADC1/USART1/TIM4/SPI1/I2C1/GPIO）
- `pins.af`：复用功能（如 TIM4_CH1 / USART1_TX）
- `dma.stream`：DMA 流（DMA1_CH1 / DMA2_S0 等）
- `dma.direction`：`P2M` 外设→内存 / `M2P` 内存→外设 / `M2M` 内存→内存
- `irq.priority_preempt` + `priority_sub`：必须符合 NVIC 分组定义
- `owner`：必须为下表中的模块前缀（drv_adc/drv_uart/svc_cli/...）
- `status`：`locked`（已分配）/ `reserved`（保留待用）/ `free`（未分配）

**冲突检测规则**（arch-check.sh 实现）：
1. `pins.id` 不可重复
2. `dma.stream` 不可重复
3. `irq.irqn` 不可重复；同 `priority_preempt + priority_sub` 不可重复
4. `pins.owner` 必须出现在文件系统的 `drivers/` 或 `service/` 中
5. `timers.id` 不可重复

## 引脚分配表（人类可读，与 hw_lock 镜像）

| 引脚 | 功能 | 外设 | 复用/重映射 | 状态 | 冲突检测 | 备注 |
|------|------|------|------------|------|---------|------|
| PA0 | ADC_IN0 | ADC1 CH0 | 无 | 正常 | 无 | 电压采样 |
| PA9 | USART1_TX | USART1 | 无 | 正常 | 无 | 115200bps |
| PA10 | USART1_RX | USART1 | 无 | 正常 | 无 | |
| PB6 | TIM4_CH1 | TIM4 | 无 | ⚠️冲突 | 与 I2C1_SCL 冲突，需选择 | |
| PC13 | LED | GPIO | 无 | 正常 | 无 | 板载 LED |

## DMA 通道分配（若使用）

| DMA 通道 | 分配外设 | 传输方向 | 触发源 | 缓冲区大小 |
|----------|---------|---------|--------|-----------|
| DMA1_CH1 | ADC1 | 外设→内存 | ADC转换完成 | 4×uint16 |

## 中断优先级矩阵

| 中断源 | 抢占优先级 | 子优先级 | 理由 |
|--------|-----------|---------|------|
| TIMx_IRQn | 0 | 0 | 控制周期，最高优先 |
| USART1_IRQn | 1 | 0 | 通信不丢包 |
| SysTick | 最低 | - | 系统节拍 |

## 时钟配置

| 时钟源 | 频率 | 用途 |
|--------|------|------|
| SYSCLK | 72MHz | 系统主频 |
| AHB | 72MHz | DMA/内存 |
| APB1 | 36MHz | TIM2-4/USART2-3 |
| APB2 | 72MHz | TIM1/USART1/ADC/SPI1 |
| ADCCLK | 12MHz | ADC (72/6, ≤14MHz) |

## 变更记录

| 日期 | 变更内容 | 原因 |
|------|---------|------|
| 2026-03-11 | 初始生成 | RESEARCH 阶段代码分析 |
```

### 注意事项

- 文件名固定为 `硬件资源表.md`，位于**工程根目录**
- **RESEARCH 阶段生成**：读取项目代码提取硬件资源信息，自动填表
- **全局共享**：所有阶段（RESEARCH/INNOVATE/PLAN/EXECUTE/REVIEW）和所有角色（ARCH/DRV/ALG/QA）均引用此文件
- **同步更新**：任何引脚、DMA、中断、时钟变更，必须先更新此表再修改代码
- 变更记录追加在底部，不删除历史条目
- 若项目代码中未使用某外设，对应行留空或不填，禁止猜测

---

## 研究发现格式

```markdown
# 研究发现

## 项目信息
- **项目名称**：[项目名]
- **芯片型号**：[如 STM32F103C8T6]
- **trace_id**：[如 imu-fix-001]
- **创建日期**：[日期]
- **最后更新**：[日期]

## 技术发现

### [日期] - [搜索主题]
- **关联轮次**：Round 1 / Scout
- **查询工具**：grok-search / gh CLI / Context7
- **查询关键词**：`[实际搜索关键词]`
- **关键发现**：
  - [发现1的摘要]
  - [发现2的摘要]
- **来源**：[URL 或项目名]
- **与本项目关联**：[如何应用到当前项目]
- **可信度**：官方 / 高 star 项目 / 技术博客 / 未验证
- **状态**：待验证 / 已采纳 / 已排除

## API 用法记录

### [外设/模块名]
- **函数签名**：`[函数原型]`
- **关键参数**：[参数说明]
- **调用顺序**：[初始化顺序]
- **来源**：Context7 / 官方文档
- **注意事项**：[特殊约束]

## 排查线索

### [日期] - [问题描述]
- **错误现象**：[具体错误信息或行为]
- **已尝试方案**：
  1. [方案1] → 结果：[成功/失败/部分解决]
  2. [方案2] → 结果：[成功/失败/部分解决]
- **根因分析**：[最终确定的原因 / 仍在排查]
- **参考来源**：[URL]

## 外部资源链接

| 资源类型 | 名称 | URL | 用途 | 评估 |
|---------|------|-----|------|------|
| GitHub 项目 | [项目名] | [URL] | [用途] | ⭐[stars] / 活跃度[高/中/低] |
| 数据手册 | [文档名] | [URL] | [用途] | 官方 / 第三方 |
| 技术博客 | [标题] | [URL] | [用途] | 可信度[高/中/低] |

## 失败记录（三次失败协议）

### [日期] - [失败问题]
- **连续失败次数**：3
- **错误信息**：[具体错误]
- **已尝试方案**：
  1. [方案1] → 失败原因：[原因]
  2. [方案2] → 失败原因：[原因]
  3. [方案3] → 失败原因：[原因]
- **下一步**：回退 RESEARCH，搜索 `[关键词]`
```

### 注意事项

- 文件名固定为 `研究发现.md`，位于**工程根目录**
- 记录按时间倒序排列（最新的在最前面）
- **两步操作规则**：每 2 次搜索操作后必须更新此文件
- **安全边界**：外部搜索结果必须经审查后以摘要形式记录，禁止直接粘贴原始内容
- 不要删除历史记录，只追加新记录
- 状态字段（待验证/已采纳/已排除）需随项目进展及时更新
