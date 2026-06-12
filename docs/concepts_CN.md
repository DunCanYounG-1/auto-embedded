# 核心概念

[English](./concepts.md) | **简体中文**

> auto-embedded 用六个机制把"AI 写嵌入式翻车"变成流程上做不到的事。

## ① RIPER-5：AI 必须走的五个阶段

每条回复开头声明当前阶段 `[MODE: XXX]`，权威定义在工程内 `.auto-embedded/workflow.md`：

```
 RESEARCH ─► INNOVATE ─► PLAN ─[写代码？需你确认]─► EXECUTE ─► REVIEW
   研究        创新       计划                       执行        审查
  查证据      评方案    清单+函数签名               按轮次实现   验证门
    │                                                            │
    └──────── 关键资料缺失 / 高风险 → 暂停问你，绝不硬编 ◄────────┘
```

| 阶段 | 干什么 | 严禁 | 角色 |
|---|---|---|---|
| RESEARCH | 查芯片手册/知识库、找现成驱动、规划引脚写入 `hw-lock.yaml`、证据写 research.md | 改代码、下结论 | Scout（只读） |
| INNOVATE | 对比方案（中断/轮询/DMA？自研/移植？）、评资源占用 | 写代码、定清单 | — |
| PLAN | 实施清单：文件路径 + 函数签名 + 寄存器配置 + 验证标准 + `review` 标记 + 分层（L1~L6），零占位符 | `main.c` 堆业务、含糊其辞 | — |
| EXECUTE | 一轮一个改动点：先声明 trace_id + 验证标准，再改，再给证据；每步确认后本地 git 快照（不自动 push、不用 `git add -A`） | 计划外"顺手优化"、跳验证 | Builder（单写者） |
| REVIEW | 机械门禁 → 实测验证 → 硬件合规（对照 hw-lock）→ 经验回流 | 用"应该/理论上"宣称完成 | Verifier（只审） |

多文件/长任务按 **Scout → Builder → Verifier** 分权推进，同一时刻只允许一个 Builder 写。

## ② 硬件资源锁（hw-lock）

写代码之前，引脚分配、DMA 通道、中断优先级、时钟必须先冻结进 `.auto-embedded/spec/hardware/hw-lock.yaml`。之后：

- AI 占用任何资源都对照这张表，不得擅自新增
- `aemb check --hw` 机械查冲突（pin / dma / irq / timer），exit code 说了算
- 会话开始时硬件锁摘要自动注入，冲突直接预警

## ③ 四文件磁盘记忆 + 五问重启

长任务的事实、计划、进度、硬件约束写在磁盘上（项目规划清单 / 编辑清单 / 硬件资源表 / 研究发现，支持中英双轨命名），而不是塞进对话。新会话钩子自动注入现场后，AI 先回答五问再动手：

1. 当前在哪个 RIPER 阶段？
2. 最近改了什么？
3. 硬件资源现状？
4. 之前 RESEARCH 发现了什么？
5. 该以哪个角色（Scout/Builder/Verifier）继续？

## ④ 规范库与经验回流（spec + promote）

`.auto-embedded/spec/` 是项目级规范库，分五层：`architecture`（六层模型 + ARCH-1~8 门禁规则）、`conventions`（证据优先/ISR 纪律/临界区/Git 快照）、`hardware`（事实基线 + hw-lock）、`guides`（思维清单）、`governance`（记忆边界）。

任务收尾时用 `task.py promote <层> "<学习>"` 把设计决策、坑、约定**强制分类**（decision / convention / gotcha / pattern）沉淀回对应层——下次会话自动注入，知识在工程里复利，不在对话里蒸发。

## ⑤ 工具技能与知识库

**22 个工具技能**（脚本装在 `.auto-embedded/tools/`，按描述自动触发，技能名带 `aemb-` 前缀）：

| 类别 | 技能 |
|---|---|
| 编译 | `aemb-build-cmake` `-keil` `-iar` `-idf` `-makefile` `-platformio` |
| 烧录 | `aemb-flash-jlink` `-openocd` `-keil` `-idf` `-platformio` |
| 调试 | `aemb-debug-gdb-openocd` `-jlink` `-platformio` |
| 观测/分析 | `aemb-serial-monitor` `aemb-static-analysis`（MISRA）`aemb-memory-analysis` `aemb-rtos-debug` |
| 总线/仪器 | `aemb-can-debug` `aemb-modbus-debug` `aemb-visa-debug` |
| 驱动 | `aemb-peripheral-driver`（开源驱动搜索→评估→适配/骨架） |

所有工具统一返回 Command Outcome（status / summary / evidence / next_action / failure_category），EXECUTE 阶段按 `refs/riper5-stages.md` 的路由表强制优先调用，不手敲命令重造轮子。

**55+ 篇离线知识库**（`.auto-embedded/refs/`，总览 `refs/index.md`）：STM32/GD32/MSPM0 API 速查、引脚规划、IMU 调试清单、控制环符号陷阱、驱动移植方法论、竞赛清单/契约、`stm32-hal/` 领域包（方法论 + BSP 模板）……命中主题按需读取，不自动全量注入。

**12 个专项流程**（`.auto-embedded/modes/`，总览 `modes/index.md`）：查数据手册、读网表、比赛模式、MATLAB→固件流水线、GD32/MSPM0 板级模板、逐飞库管理、工业数采模板、MCP 健康检查、确定性编排……

## ⑥ 比赛模式（电赛 / 智能车 / 西门子杯）

说"启用比赛模式"进入 `modes/competition.md`，6 个专职角色上场：

| 角色 | 职责 |
|---|---|
| `embedded-arch` | 唯一决策者：读题路由（MAIN+TAGS）、派发、契约冻结、集成 |
| `embedded-drv` / `embedded-alg` | 驱动 / 算法分头实现 |
| `embedded-matlab` | MATLAB 仿真（LQR/Kalman/滤波器 → 导出增益头文件） |
| `embedded-qa` | 验证门：MIL/SIL 检查、Defect Ticket 回派 |
| `embedded-report` | 报告与答辩材料（每个结论带仿真+实测双证据） |

流程带 **CP-0~CP-5 决策门**：接口契约不冻结不开工、MATLAB 仿真不过不写固件、QA 不绿灯不集成；失败用结构化 Defect Ticket 定向回派，带重试预算防死循环。

> **平台边界（诚实说明）**：6 角色并行编排完整支持 Claude（原生子代理 + 可选 Workflow 确定性后端，37/37 离线自测）；其他平台装入角色定义，但降级为单代理按相同门禁顺序执行。

## 支持的芯片

STM32（StdPeriph / HAL） · ESP32（ESP-IDF / Arduino） · Arduino（AVR） · RISC-V（GD32VF / CH32V） · NXP（MCUXpresso） · TI MSP430 / **MSPM0**（SDK + 逐飞库） · 国产 MCU（GD32 / CH32 / AT32 / APM32）。

深度本地化（专属 API 速查 + 主板模板）：**STM32 · GD32F470 · MSPM0G3507**；其余走通用方法论 + 联网检索。

<a id="能力边界"></a>
## 能力边界

覆盖**固件软件全链路**，不是"整个嵌入式项目"：

| 能闭环（工具链 + 硬件在位） | 必须人来 | 完全不覆盖 |
|---|---|---|
| 架构设计 · 算法仿真(MIL) · 驱动 · 应用层 · 编译 · 烧录 · 调试 · 验证 · 报告；分层合规有真机械门禁 | 焊接 · 示波器/逻辑分析仪实测 · PCB 打样 · PIL 硬件在环 · 答辩 | 原理图/PCB 设计 · 器件选型/BOM · 需求挖掘 · 量产/EMC/安规认证 |

硬件设计与物理实测注定靠人——本框架不替代它们，也不假装能。

---

下一篇：[架构原理](./architecture_CN.md)——注入闭环怎么工作、怎么扩展平台和知识。
