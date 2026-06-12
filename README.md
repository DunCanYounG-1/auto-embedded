# auto-embedded

> 对标 [Trellis](https://github.com/mindfold-ai/Trellis) 的**全平台嵌入式 AI 开发框架**——把那套
> "装进工程、项目级 hook 必然运行、按需自动注入项目 spec、学习回流、一次写、全平台交付"的基座，
> 换装成 **RIPER-5 + 四文件磁盘记忆 + 分层架构门禁 + Scout/Builder/Verifier + 22 工具技能 + 55+ 篇知识库 + 12 专项流程** 的嵌入式内核。

[![protocol](https://img.shields.io/badge/protocol-RIPER--5-2ea44f)](SKILL.md)
[![platforms](https://img.shields.io/badge/platforms-Claude%20%7C%20Cursor%20%7C%20Codex%20%7C%20OpenCode%20%7C%20Copilot%20%7C%20Gemini%20%7C%20Windsurf-1f6feb)](#支持平台)
[![MCU](https://img.shields.io/badge/MCU-STM32%20%7C%20ESP32%20%7C%20GD32%20%7C%20MSPM0%20%7C%20RISC--V-1f6feb)](#支持的芯片平台)
[![e2e](https://img.shields.io/badge/端到端自测-passing-brightgreen)](tests/test-auto-embedded.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`by` [DuncanY](https://github.com/DunCanYounG-1) · 协议入口见 [`SKILL.md`](SKILL.md) · 安装见 [`INSTALL.md`](INSTALL.md)

> **关于本仓库**：`auto-embedded` 是上一代 [`embedded-dev`](https://github.com/DunCanYounG-1/embedded-dev)（Claude Code 单插件协议）的**新一代继任者**，并就地合并在同一仓库（`github.com/DunCanYounG-1/embedded-dev`）。上一代的 RIPER-5 协议、55+ 篇离线知识库、12 个专项流程与 6 个比赛 subagent **已全量吸收**进本框架的运行时内核，随 `aemb init` 装进每个工程。

---

## 为什么有它（embedded-dev 做不到的那块）

上一代 `embedded-dev` 是**全局单 skill 插件**：知识（refs）全局只读、靠模型自觉、frontmatter hook 在 user-skill 下不自动加载、且**只在 Claude 可用**。所以它**无法**像 Trellis 那样"把项目专属约定自动注入每次会话"，也无法跨平台。

`auto-embedded` 复制 Trellis 的解法——**把基座装进工程、并抽象出平台层**：

| 能力 | Trellis | auto-embedded | embedded-dev（上一代） |
|---|---|---|---|
| 注入触发器 | 项目级平台 hook（init 写入，必然运行） | ✅ 同（7 平台各自接线） | ❌ frontmatter hook 不生效 |
| 约定存储 | `.trellis/spec/` | ✅ `.auto-embedded/spec/`（项目级、可演进） | ❌ 全局只读 refs |
| 相关性注入 | per-task jsonl 选 spec | ✅ research/implement/verify.jsonl 按角色 push | ❌ 靠模型自己 pull |
| 学习回流 | finish→update-spec | ✅ `task.py promote` 沉淀回 spec | ❌ 无 |
| 多平台 | 14 平台 configurator | ✅ **7 已打通 + 7 预留** | ❌ 仅 Claude |
| 工具链 | —（通用） | ✅ **22 工具技能** build/flash/debug/… | ✅（但仅 Claude） |
| 知识库 / 专项流程 | —（通用） | ✅ **55+ 篇 refs + 12 modes（含比赛 6-Agent）** | ✅（同源，已被吸收） |
| 工作流内核 | 通用 4 阶段 | **RIPER-5 + 分层门禁 + 四文件 + hw-lock** | RIPER-5（同源） |

**已打通平台**：`claude` `cursor` `codex` `opencode` `copilot` `gemini` `windsurf`
**预留位**：`kilo` `kiro` `antigravity` `qoder` `codebuddy` `droid` `pi`

---

## 它解决什么问题

普通 AI 写嵌入式代码常见三宗罪：**乱猜引脚/寄存器、上下文一断就忘了做到哪、编译过就说"修好了"**。auto-embedded 用一条强约束流水线针对性压制这三点（显著降低概率、并在高风险处强制暂停，而非保证杜绝）：

```
 RESEARCH ─► INNOVATE ─► PLAN ─[含写代码项→需你确认]─► EXECUTE ─► REVIEW
   研究        创新       计划                          执行        审查
  查证据      评方案    定清单+函数签名+审查标记        按轮次实现   验证门+回流
    │                                                               │
    └────────── 关键资料缺 / 高风险 → 暂停问你，绝不硬编 ◄───────────┘
```

- **证据先于结论** —— 没有代码位置 / 编译输出 / 串口日志 / 数据手册 / 网表依据，禁止宣称"已修好"。
- **复用先于造轮子** —— 本地离线索引 → 官方文档 → 开源驱动 → 最后才自己写。
- **先规划后编码** —— 引脚、DMA、中断优先级、时钟先冻结成 `hw-lock.yaml`，再动代码。

---

## 快速开始

```bash
# 0)（一次）全局安装 aemb CLI（TypeScript/Node 包，零运行时依赖）
npm install -g auto-embedded
#   或从源码：git clone https://github.com/DunCanYounG-1/embedded-dev && cd embedded-dev && npm install -g .

# 1) 在固件工程里安装运行时 + 选定平台的注入接线
aemb init /path/to/firmware-project -u your-name --platforms claude,cursor,codex
#   或 --claude --cursor …，或 --all 装全部已打通平台

# 2) 在该工程用对应 AI 工具新开会话 → 注入 hook 自动带出 RIPER 现场 + spec 索引 + 开发者
```

> 技术栈：CLI 用 **TypeScript/Node**（零运行时依赖）；注入 hooks 与运行时脚本用 **Python**（与 Trellis 一致）。需 Node ≥ 18 + Python ≥ 3.9。Windows 注意见 [`INSTALL.md`](INSTALL.md)。

之后日常用 **slash 命令 / 技能**（init 已写进工程）：

```
/aemb:brainstorm <标题>  需求不清先一问一答收敛 → prd
/aemb:start  <标题>      建任务进 RESEARCH
/aemb:continue           恢复现场 + 五问重启 + 按阶段路由
/aemb:check              机械门禁（arch-check ARCH-1~8 + 硬件冲突 + spec）
/aemb:break-loop         bug 根因复盘，防"修了又犯"，沉淀进 spec
/aemb:finish-work        REVIEW 验证门 + promote 回流 + journal + 归档
/aemb:journal <摘要>     写跨会话记忆
/aemb:status             现场状态
```
（Cursor/Windsurf 为 `/aemb-…`，Codex/Qoder 为 `$aemb-…`，Copilot 为 `/aemb-…`。）

体检 / 升级 / 卸载：`aemb doctor <工程>` · `aemb update <工程>` · `aemb uninstall <工程>`。

---

## 工作原理（注入闭环）

```
aemb init ─► .auto-embedded/(spec/tasks/workspace/scripts/tools/refs/modes/config/workflow) + 各平台接线（settings.json/hooks.json/config.toml/JS 插件…）
                                   │
   会话开始 ─ SessionStart ────────┼─► 注入：RIPER 阶段 + active task + spec 索引 + hw-lock 摘要 + journal + 五问重启
   每轮     ─ 每轮提交 hook ───────┼─► 注入：按当前阶段从 workflow.md 取面包屑
   派子Agent ─ 派发 hook/prelude ──┴─► 注入：按角色读 research/implement/verify.jsonl，只 push 相关 spec
                                   
   REVIEW ─► task.py promote <layer> "<学习>" ─► 写回 .auto-embedded/spec/（下次自动注入，知识复利）
```

工具技能脚本随框架装进 `.auto-embedded/tools/`，按需用 `python` 调；离线知识库 `.auto-embedded/refs/` 与专项流程 `.auto-embedded/modes/` 命中场景时按需读取（不自动全量注入，防撑爆上下文）。

---

## RIPER-5 五阶段

每条回复开头声明当前阶段 `[MODE: XXX]`。权威规则以工程内 `.auto-embedded/workflow.md` 与本仓 [`SKILL.md`](SKILL.md) 为准。

| 阶段 | 干什么 | 严禁 | 角色 |
|---|---|---|---|
| RESEARCH | 查芯片/库、读 spec、引脚规划写 `hw-lock.yaml`、证据写 research.md | 改代码、下最终结论 | Scout（只读） |
| INNOVATE | 对比候选方案（中断/轮询/DMA、自研/移植） | 写代码、定具体计划 | — |
| PLAN | 出实施清单（路径+签名+寄存器+验证标准+`review` 标记+层级 L1~L6）；零占位符 | `main.c` 堆业务 | — |
| EXECUTE | 按轮次最小实现，每轮带 trace_id+验证标准+证据；本地 git 快照 | 计划外改进、跳验证 | Builder（单写者） |
| REVIEW | 验证门→硬件合规（对照 hw-lock）→分层门禁→**promote 回流** | 用"应该/理论上"声明完成 | Verifier（只审） |

多文件/长任务按 Scout→Builder→Verifier 分权，同一时刻只一个 Builder 写。

---

## 工具调用技能（22，全平台交付）

脚本随框架装进 `.auto-embedded/tools/<skill>/scripts/`，按需用 `python` 调，SKILL 描述自动触发：

- **编译**：`build-cmake` `build-iar` `build-idf` `build-keil` `build-makefile` `build-platformio`
- **烧录**：`flash-idf` `flash-jlink` `flash-keil` `flash-openocd` `flash-platformio`
- **调试**：`debug-gdb-openocd` `debug-jlink` `debug-platformio`
- **观测/分析**：`serial-monitor` `static-analysis` `memory-analysis` `rtos-debug`
- **总线/仪器**：`can-debug` `modbus-debug` `visa-debug`
- **驱动**：`peripheral-driver`（开源驱动搜索→评估→适配/骨架；方法论 + BSP 模板见 `.auto-embedded/refs/stm32-hal/`）

---

## 知识库与专项流程（自上一代 embedded-dev 全量吸收）

随 `aemb init` 装入工程，**按需加载**：

- **`.auto-embedded/refs/`（55+ 篇离线知识库）** —— STM32/GD32 API 速查、引脚规划、IMU、故障分类、编码规范、驱动移植、竞赛清单/契约……总览见 `refs/index.md`；`refs/stm32-hal/` 为 STM32 HAL 方法论 + BSP 模板领域包。
- **`.auto-embedded/modes/`（12 个专项流程）** —— RIPER-5 主干外的专项工作流：`competition`（比赛）、`datasheet-lookup`、`netlist-lookup`、`gd32-board`、`mspm0-board`、`seekfree-lib`、`matlab-*`、`industrial-data-acquisition`、`mcp-healthcheck`、`workflow-orchestration`。总览见 `modes/index.md`。

**比赛模式**：用户说"启用比赛模式" → 进入 `modes/competition.md`，由 6 个专职 subagent 并行推进：
`embedded-arch`（唯一决策者/路由/集成）· `embedded-drv`（驱动）· `embedded-alg`（算法）· `embedded-matlab`（MATLAB 仿真）· `embedded-qa`（验证门）· `embedded-report`（报告），配合 CP-0~CP-5 决策门与 Defect Ticket 回派协议。

> 平台边界（诚实说明）：6-Agent **并行编排完整支持 Claude**（原生 Task 子代理 + 可选 Workflow 确定性后端）；其余平台会装入 agent 定义，但派发能力受限（如 Codex 子代理出于防死锁禁用 spawn、Copilot 无 Task 工具映射），实际降级为**单代理按 `modes/competition.md` 顺序走 CP 门禁**。

---

## 支持的芯片平台

STM32（StdPeriph / HAL） · ESP32（ESP-IDF / Arduino） · Arduino（AVR） · RISC-V（GD32VF / CH32V） · NXP（MCUXpresso） · TI MSP430 / **MSPM0**（SDK + 逐飞 Seekfree 库） · 国产 MCU（GD32 / CH32 / AT32 / APM32）。

深度本地化（含专属 API 速查 + 主板模板）：**STM32 · GD32F470 · MSPM0G3507**；其余平台走通用方法论 + 联网检索。

---

## 仓库组成

| 路径 | 内容 |
|---|---|
| [`SKILL.md`](SKILL.md) | 协议入口：何时 init、RIPER-5 + spec 注入工作流、平台/工具/知识库速查 |
| `src/cli/` `src/commands/` | aemb CLI：init/update/status/doctor/check/uninstall（零依赖、手写参数解析） |
| `src/types/ai-tools.ts` | 平台注册表（数据单一事实源：7 已打通 + 7 预留） |
| `src/configurators/` | 每平台 configurator + `shared.ts`(占位符) + `merge.ts`(配置合并) + `hooks.ts`(共享 hook 分发) + `workflow.ts`(运行时内核装入) |
| `templates/common/` | 共享 body：命令/技能/Agent（含 6 比赛 subagent）+ 22 工具技能 SKILL body（占位符渲染） |
| `templates/shared-hooks/` | 三个平台无关 Python hook：session-start / inject-workflow-state / inject-subagent-context |
| `templates/<平台>/` | 平台私有模板（config.toml / JS 插件 / copilot session-start 等） |
| `templates/auto-embedded/` | 装进工程的运行时内核：`scripts/` + `spec/` + `workflow.md` + `tools/`(22 工具脚本) + `refs/`(55+ 知识库) + `modes/`(12 专项流程) |
| [`tests/test-auto-embedded.sh`](tests/test-auto-embedded.sh) | 端到端自测：init --all → 结构/doctor/幂等/内核/工具脚本/refs+modes 装入/注入/卸载 全链路断言 |

---

## 能力边界（诚实说明）

这套框架覆盖的是**固件软件全链路**，不是"整个嵌入式项目"。如实分桶：

| 可编排/委托闭环（依赖工具链 + 硬件在位） | 必须人在环 / 真实硬件 | 完全不覆盖 |
|---|---|---|
| 架构设计 · 算法仿真(MIL) · 驱动 · 应用层 · 编译 · 烧录 · 调试 · 验证 · 报告；分层合规有真机械门禁 | 焊接 · 示波器/逻辑分析仪实测 · PCB 打样 · PIL 处理器在环 · 答辩 | 原理图/PCB 设计 · 器件选型/BOM · 需求挖掘 · 量产/EMC/安规认证 |

> 准确定位：**嵌入式固件软件全链路工程执行框架**——硬件设计与物理在环注定靠人，本框架不替代它们，也不假装能。

---

## 许可

本项目采用 [MIT 许可证](LICENSE)，可自由使用、修改、分发，保留版权与许可声明即可。

## 致谢

- 基座架构（装进工程 / hook 注入 / spec / promote 回流 / 多平台 configurator）对标 **Trellis**（mindfold-ai）。
- 工作流内核（RIPER-5 / 四文件 / 分层门禁 / 多 Agent）、22 工具技能、55+ 篇知识库与 12 专项流程沿用自上一代 **embedded-dev**，本次合并已全量吸收。
- 感谢 **[LinuxDo](https://linux.do/)** 社区的支持。问题反馈 / 建议：[GitHub Issues](https://github.com/DunCanYounG-1/embedded-dev/issues)。

---

<sub>本 README 面向人类读者，是介绍而非规范。协议规则、触发条件、refs/modes 清单一律**以 [`SKILL.md`](SKILL.md) 及工程内 `.auto-embedded/workflow.md` 为准**；两者冲突时以 `SKILL.md` 为准。</sub>
