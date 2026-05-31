# embedded-dev

> 面向嵌入式固件开发的 Claude Code 技能 —— 把"AI 一次性吐代码"变成**可验证、可回退、可交接的工程流程**。

[![Claude Code Skill](https://img.shields.io/badge/Claude%20Code-Skill-8A2BE2)](https://docs.claude.com/en/docs/claude-code)
[![protocol](https://img.shields.io/badge/protocol-RIPER--5-2ea44f)](skills/embedded-dev/SKILL.md)
[![MCU](https://img.shields.io/badge/MCU-STM32%20%7C%20ESP32%20%7C%20GD32%20%7C%20MSPM0%20%7C%20RISC--V-1f6feb)](#支持的平台)
[![编排自测](https://img.shields.io/badge/编排自测-37%2F37%20passing-brightgreen)](skills/embedded-dev/tools/competition-workflow.test.js)
[![LinuxDo](https://img.shields.io/badge/LinuxDo-社区支持-blue)](https://linux.do/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`by` [DuncanY](https://github.com/DunCanYounG-1) · 协议本体见 [`SKILL.md`](skills/embedded-dev/SKILL.md) · 安装见 [`INSTALL.md`](INSTALL.md)

**embedded-dev** 是一套用于 STM32 / ESP32 / Arduino / RISC-V / GD32 / MSPM0 / 国产 MCU 的结构化固件开发协议。它以 RIPER-5 五阶段为骨架，叠加**分层架构门禁**、**四文件磁盘长任务记忆**、**Git 快照回退**与**多 Agent 分工**，重点约束传统 AI 在嵌入式上最容易翻车的环节：引脚/DMA/中断冲突、上下文断档、"理论上应该没问题"式空话。

---

## 目录

- [它解决什么问题](#它解决什么问题)
- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [怎么用](#怎么用)
- [工作原理](#工作原理)
- [仓库组成](#仓库组成)
- [能力边界（诚实说明）](#能力边界诚实说明)
- [支持的平台](#支持的平台)
- [许可](#许可)
- [致谢](#致谢)

---

## 它解决什么问题

普通 AI 写嵌入式代码常见三宗罪：**乱猜引脚/寄存器、上下文一断就忘了做到哪、编译过就说"修好了"**。embedded-dev 用一条强约束流水线针对性压制这三点（显著降低概率、并在高风险处强制暂停，而非保证杜绝）：

```
 RESEARCH ─► INNOVATE ─► PLAN ─[含写代码项→需你确认]─► EXECUTE ─► REVIEW
   研究        创新       计划                          执行        审查
  查证据      评方案    定清单+函数签名+审查标记        按轮次实现   验证门
    │                                                               │
    └────────── 关键资料缺 / 高风险 → 暂停问你，绝不硬编 ◄───────────┘
```

- **证据先于结论** —— 没有代码位置 / 编译输出 / 串口日志 / 数据手册 / 网表依据，禁止宣称"已修好"。
- **复用先于造轮子** —— 本地离线索引 → 官方文档/Context7 → 开源驱动 → 最后才自己写。
- **先规划后编码** —— 引脚、DMA、中断优先级、时钟先冻结成"硬件资源表"，再动代码。

---

## 核心特性

| 特性 | 说明 | 是机械保障还是约定 |
|---|---|---|
| **RIPER-5 五阶段** | 研究→创新→计划→执行→审查，写代码前必须过 PLAN 审查门 | 协议约定 |
| **分层架构门禁** | 应用层禁 include 厂商头、禁裸寄存器写、`main.c` 只做编排 | **硬门禁在 REVIEW/CP**：`scripts/arch-check.sh` + `tools/include-graph.py` 核查（exit≠0 阻断）；写前 hook 注册后可 best-effort 预拦截（hooks 默认 fail-open，见 INSTALL §8） |
| **四文件磁盘记忆** | `项目规划清单 / 编辑清单 / 硬件资源表 / 研究发现` 落盘，上下文断了能"五问重启" | 协议约定（可选 hook 提醒） |
| **Git 快照回退** | 每个清单项**经你确认后**由 agent 本地 commit（绝不自动 push、不用 `git add -A`） | 协议约定 |
| **多 Agent 分工** | Scout/Builder/Verifier 分权；比赛模式 6 角色并行 + CP-0~CP-5 门禁 | 协议约定，可接[原生 Workflow 确定性后端](skills/embedded-dev/modes/workflow-orchestration.md) |
| **MATLAB→固件** | LQR/Kalman/滤波器仿真 → `export_gains_to_c.py` 导出 `.h` → 上板；MIL/SIL 仿真验证（PIL 需硬件在环，见能力边界） | 工具 + MCP |
| **离线知识库** | `refs/` 专题知识库（40+ 篇，以目录为准：STM32/GD32 API、引脚规划、IMU、故障排查…），按需加载不撑爆上下文 | 知识库 |
| **兄弟 skill 生态** | 编译/烧录/调试/串口/总线/静态分析委托给 `build-*`/`flash-*`/`debug-*` 等独立 skill | 委托执行 |

---

## 快速开始

**前提**：已装好 Claude Code，并有 Python / Bash / Git（Windows 还需 Git Bash 在 PATH，见 [`INSTALL.md`](INSTALL.md) §2）。满足后，作为 **Claude Code 插件**安装——一条命令装齐 26 个 skill 并**自动注册 hooks**：

```text
/plugin marketplace add DunCanYounG-1/embedded-dev
/plugin install embedded-dev@embedded-dev
```

或用 CLI：

```bash
claude plugin marketplace add DunCanYounG-1/embedded-dev
claude plugin install embedded-dev@embedded-dev
```

然后在 Claude Code 里直接说嵌入式需求即可触发，例如：

```text
帮我看一下 STM32F103 的 USART1 中断为什么不触发
```

> **装完即得**：riper5 主协议 + 25 个执行层 skill（编译/烧录/调试/串口/总线/分析）+ `shared/` 契约层 + 6 个比赛模式 subagent，**SessionStart 引导、写前分层拦截、四文件提醒等 hook 随插件自动生效**——无需再跑 `register-hooks.py` 或手改 settings.json。
>
> `grok-search`（第三方联网检索）因许可与 API key 配置未并入，见 [`INSTALL.md`](INSTALL.md) §3.1 单独装。
>
> 不想用插件机制？见 [`INSTALL.md`](INSTALL.md) §6 的 legacy user-skill 安装（clone + `install-siblings` + `register-hooks`，手动两步）。
>
> **Windows**：hook 经 `bash` 执行，需 Git Bash 在 PATH，见 [`INSTALL.md`](INSTALL.md) §5。

---

## 怎么用

直接描述需求，主交付物落在固件即自动接管。常见入口：

| 你说 | 它做什么 |
|---|---|
| `帮我给 STM32F103 移植一个 SSD1306 驱动` | 先查本地索引 → 开源驱动 → 评估后移植（复用优先） |
| `查手册，确认 F103 ADC 时钟上限和采样时间` | 触发 `datasheet-lookup`：搜 PDF → `/pdf` 提参数 → 写回带页码注释 |
| `查网表，确认 USART1 和 MPU6050 的引脚连接` | 触发 `netlist-lookup`：解析网表 → 提引脚 → 与硬件资源表比对 |
| `启用比赛模式，做一个平衡车控制系统` | 6-Agent 并行：先冻结引脚/接口契约 → MATLAB 仿真门 → 驱动+算法分角色推进 |
| `检查所有 mcp 工具` | 触发 `mcp-healthcheck`：只测本 skill 相关工具并出报告 |

---

## 工作原理

> 下面是**速览**，权威规则一律以 [`SKILL.md`](skills/embedded-dev/SKILL.md) 为准。

**RIPER-5 五阶段**（每条回复以 `[MODE: XXX]` 声明当前阶段）：

| 阶段 | 干什么 | 严禁 |
|---|---|---|
| RESEARCH | 查芯片/库、引脚规划、搜现成方案 | 改代码、下最终结论 |
| INNOVATE | 对比候选方案 | 写代码、定具体计划 |
| PLAN | 出实施清单（文件/签名/寄存器/验证标准/`review` 标记） | 占位符、`main.c` 堆业务 |
| EXECUTE | 按轮次实现，每轮带 `trace_id`+验证标准+证据 | 计划外改进、跳验证 |
| REVIEW | 验证门（编译/实测）→ 硬件合规 → 代码质量 | 用"应该/理论上"声明完成 |

**四文件磁盘记忆**：长任务把事实/计划/进度/硬件约束写进 `项目规划清单.md`、`编辑清单.md`、`硬件资源表.md`、`研究发现.md`，而非塞进对话。新会话先"五问重启"（在哪个阶段 / 改了什么 / 硬件现状 / 已发现什么 / 该谁继续）。

**分层架构**：6 层模型（HAL/BSP/Driver/Middleware/Service/App）+ 命名前缀；应用层禁碰厂商寄存器，跨硬件走 HAL Port。REVIEW 阶段由 `arch-check.sh` + `include-graph.py` 机械核查依赖方向。

**比赛模式 / 原生 Workflow 后端**：`启用比赛模式` 进入 6-Agent + CP 门禁流程；可进一步用 [`modes/workflow-orchestration.md`](skills/embedded-dev/modes/workflow-orchestration.md) 把 CP-1.5→CP-4 接到 Opus 原生 Workflow 工具上做**确定性编排**（指编排流程确定、可复现，非模型结果确定；门禁/重试/回派写死成代码，附 37/37 离线自测）。

---

## 仓库组成

本仓库即一个 Claude Code 插件（市场与插件同仓）：

| 路径 | 内容 |
|---|---|
| `.claude-plugin/plugin.json` | **插件清单**：声明 skills（`skills/`）、hooks、agents；安装即自动注册 |
| `.claude-plugin/marketplace.json` | 市场清单：`/plugin marketplace add` 的入口，指向本仓库 |
| `skills/embedded-dev/` | **协议本体**（权威）：[`SKILL.md`](skills/embedded-dev/SKILL.md) + `refs/`(40+) 知识库 + `modes/`(12) 专项流程 + `tools/`（arch-check 配套）+ `scripts/`（`arch-check.sh` 门禁、`install-siblings` legacy 安装器）+ `hooks/`（4 事件 + `hooks.json` + `run-hook.cmd` 分流，全链路 fail-open）|
| `skills/build-*` `flash-*` `debug-*` … (25) | **执行层 skill**：编译/烧录/调试/串口/总线/分析/驱动 + `skills/shared/` 契约层，随插件安装一并就位（grok-search 第三方除外）|
| `agents/` (6 角色) | 比赛模式 subagent：`embedded-arch/drv/alg/qa/matlab/report`（另含 README）|
| [`INSTALL.md`](INSTALL.md) | 安装（plugin §1 / legacy §6）、三级依赖、平台注意 |

---

<a id="能力边界诚实说明"></a>
## 能力边界（诚实说明）

这套协议覆盖的是**固件软件全链路**，不是"整个嵌入式项目"。如实分桶：

| 可编排/委托闭环（依赖兄弟 skill + 工具链 + 硬件在位） | 必须人在环 / 真实硬件 | 完全不覆盖 |
|---|---|---|
| 架构设计 · 算法仿真(MIL) · 驱动 · 应用层 · 编译 · 烧录 · 调试 · 验证 · 报告；分层合规有真机械门禁 | 焊接 · 示波器/逻辑分析仪实测 · PCB 打样 · PIL 处理器在环 · 答辩 | 原理图/PCB 设计 · 器件选型/BOM 生成 · 需求挖掘 · 量产/EMC/安规认证 |

> 准确定位：**嵌入式固件软件全链路工程执行协议**——硬件设计与物理在环注定靠人，本 skill 不替代它们，也不假装能。

---

## 支持的平台

STM32（StdPeriph / HAL） · ESP32（ESP-IDF / Arduino） · Arduino（AVR） · RISC-V（GD32VF / CH32V） · NXP（MCUXpresso） · TI MSP430 / **MSPM0**（SDK + 逐飞 Seekfree 库） · 国产 MCU（GD32 / CH32 / AT32 / APM32）。

深度本地化（含专属 API 速查 + 主板模板）：**STM32 · GD32F470 · MSPM0G3507**；其余平台走通用方法论 + 联网检索。

---

## 许可

本项目采用 [MIT 许可证](LICENSE)，可自由使用、修改、分发，保留版权与许可声明即可。

## 致谢

- 长任务治理与分权协作思路借鉴 `how-to-vibecoding`；视觉任务由独立 `auto-vision` skill 承担。
- 问题反馈 / 建议：[GitHub Issues](https://github.com/DunCanYounG-1/embedded-dev/issues)。
- 感谢 **[LinuxDo](https://linux.do/)** 社区的支持。

---

<sub>本 README 面向人类读者，是介绍而非规范。协议规则、触发条件、refs/modes 清单一律**以 [`SKILL.md`](skills/embedded-dev/SKILL.md) 为准**；两者冲突时以 `SKILL.md` 为准，发现漂移欢迎提 [issue](https://github.com/DunCanYounG-1/embedded-dev/issues)。四文件支持中英双轨命名（`项目规划清单.md` / `plan.md` 等），详见 `SKILL.md` 顶部说明。</sub>
