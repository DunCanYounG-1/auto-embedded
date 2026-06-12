# auto-embedded

> 让 AI 编码助手**可靠地**写嵌入式固件。
> 一条命令装进你的固件工程，Claude / Cursor / Codex 等 7 个 AI 平台即获得：强制的开发流程、冻结的硬件资源表、断点续作的记忆、编译烧录调试的工具脚本，和 55+ 篇离线嵌入式知识库。

[![npm](https://img.shields.io/npm/v/auto-embedded?label=npm)](https://www.npmjs.com/package/auto-embedded)
[![platforms](https://img.shields.io/badge/AI%20平台-Claude%20%7C%20Cursor%20%7C%20Codex%20%7C%20OpenCode%20%7C%20Copilot%20%7C%20Gemini%20%7C%20Windsurf-1f6feb)](#支持的-ai-平台)
[![MCU](https://img.shields.io/badge/MCU-STM32%20%7C%20ESP32%20%7C%20GD32%20%7C%20MSPM0%20%7C%20RISC--V-1f6feb)](#支持的芯片)
[![e2e](https://img.shields.io/badge/端到端自测-passing-brightgreen)](tests/test-auto-embedded.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`by` [DuncanY](https://github.com/DunCanYounG-1) · 安装见 [`INSTALL.md`](INSTALL.md) · AI 协议入口见 [`SKILL.md`](SKILL.md)

---

## 它解决什么问题

直接让 AI 写嵌入式代码，翻车通常是这三种：

| 三宗罪 | 现场 |
|---|---|
| 😤 **乱猜硬件** | 引脚随手编、DMA 通道撞车、中断优先级拍脑袋，"我记得 F103 的 USART1 是 PA9" |
| 😤 **上下文断档** | 聊到一半上下文满了/新开会话，AI 把改了一半的工程忘得一干二净 |
| 😤 **空口宣称修好** | 编译都没跑就说"问题已解决"，"理论上应该可以" |

auto-embedded 把这三点变成**流程上做不到**：

- ✅ **先冻结再动手** —— 引脚 / DMA / 中断写进 `hw-lock.yaml` 才能写代码，机械脚本查冲突
- ✅ **现场落盘** —— 任务进度、硬件表、研究发现写在磁盘上，新会话自动注入恢复，AI 先回答"五问"再接着干
- ✅ **证据才算完成** —— 必须出示编译输出 / 串口日志 / 手册页码，"应该没问题"会被流程拦下

## 30 秒看它怎么干活

装好后在工程里开 AI 会话，直接说需求：

| 你说 | 它做什么 |
|---|---|
| `帮我给 STM32F103 移植一个 SSD1306 驱动` | 先搜本地知识库 → 找开源驱动评估 → 移植适配（复用优先，不重新造轮子） |
| `查手册，确认 F103 ADC 时钟上限` | 进入查手册流程：搜 PDF → 提取参数 → 写回代码注释并带页码 |
| `USART1 中断为什么不触发` | 按流程先查证据（寄存器配置/NVIC/网表），不瞎改碰运气 |
| `启用比赛模式，做一个平衡车控制系统` | 6 个专职 AI 角色并行：先冻结引脚和接口契约 → MATLAB 仿真过门 → 驱动+算法分头推进 |

每条回复都会声明自己处在哪个阶段（如 `[MODE: RESEARCH]`），要写代码必须先给出计划清单并经你确认。

## 快速开始

**前置**：Node ≥ 18、Python ≥ 3.9，以及任意一个支持的 AI 编码工具（如 Claude Code、Cursor）。

```bash
# 1) 全局安装 aemb 命令行
npm install -g auto-embedded

# 2) 装进你的固件工程（--platforms 选你在用的 AI 工具，或 --all 全装）
aemb init /path/to/your-firmware-project -u 你的名字 --platforms claude,cursor

# 3) 在该工程里用对应 AI 工具新开一个会话 —— 完成
#    会话开头会自动出现项目现场（当前阶段/硬件表/上次进度），直接说需求即可
```

装完后每个平台都有一套日常命令（init 结束时会按你装的平台打印对应语法）：

```
/aemb:start <标题>     开一个新任务
/aemb:continue         断点续作（恢复现场）
/aemb:check            机械检查：架构分层 + 硬件资源冲突
/aemb:finish-work      收尾：验证 → 沉淀经验 → 归档
/aemb:status           看当前状态
```
（以上是 Claude 语法；Cursor/Windsurf 为 `/aemb-…`，Codex 为 `$aemb-…`。）

维护：`aemb doctor <工程>` 体检 · `aemb update <工程>` 升级 · `aemb uninstall <工程>` 干净卸载。

## 核心概念（5 分钟）

### ① RIPER-5：AI 必须走的五个阶段

```
 RESEARCH ─► INNOVATE ─► PLAN ─[写代码？需你确认]─► EXECUTE ─► REVIEW
   研究        创新       计划                       执行        审查
  查证据      评方案    清单+函数签名               按轮次实现   验证门
    │                                                            │
    └──────── 关键资料缺失 / 高风险 → 暂停问你，绝不硬编 ◄────────┘
```

| 阶段 | 干什么 | 严禁 |
|---|---|---|
| RESEARCH | 查芯片手册、找现成驱动、规划引脚写入 `hw-lock.yaml` | 改代码、下结论 |
| INNOVATE | 对比方案（中断还是 DMA？自己写还是移植？） | 写代码 |
| PLAN | 出实施清单：文件路径 + 函数签名 + 验证标准，零占位符 | 含糊其辞 |
| EXECUTE | 按清单逐项实现，每项给证据，每项确认后本地 git 快照 | 计划外"顺手优化" |
| REVIEW | 跑机械检查 + 实测验证，把经验沉淀回项目规范 | "应该/理论上" |

### ② 硬件资源先冻结

写代码之前，引脚分配、DMA 通道、中断优先级、时钟先写进 `.auto-embedded/spec/hardware/hw-lock.yaml`。之后 AI 用任何资源都要对照这张表，`aemb check` 会机械地查冲突（pin/dma/irq/timer）——不是靠 AI 自觉，是脚本 exit code 说了算。

### ③ 断了也能接着干

任务进度、改过的文件、研究发现都落盘在 `.auto-embedded/` 里。每次开新会话，**hook 自动注入**当前现场（这不依赖 AI 记性，是各平台的钩子机制保证注入必然发生）；AI 要先回答"五问"（在哪个阶段？改了什么？硬件现状？发现了什么？该谁继续？）才能动手。

### ④ 项目会越用越懂你

每个任务收尾时，AI 把这次学到的（设计决策、踩过的坑、约定）写回项目的 `spec/` 规范库，下个任务自动注入——知识在**你的工程里**积累，不是在对话里蒸发。

### ⑤ 自带工具和知识库

- **22 个工具技能**：编译（CMake/Keil/IAR/ESP-IDF/Makefile/PlatformIO）、烧录（J-Link/OpenOCD/Keil/PIO）、调试（GDB/J-Link）、串口监视、CAN/Modbus/VISA 总线、静态分析（MISRA）、内存分析、RTOS 调试、外设驱动移植——脚本随框架装进工程，AI 按需调用
- **55+ 篇离线知识库**（`.auto-embedded/refs/`）：STM32/GD32 API 速查、引脚规划、IMU 调试清单、故障排查、驱动移植方法论……AI 命中主题时自动查阅，不靠它的记忆瞎答
- **12 个专项流程**（`.auto-embedded/modes/`）：查数据手册、读网表、比赛模式、MATLAB→固件流水线、GD32/MSPM0 板级模板……

### ⑥ 比赛模式（电赛 / 智能车 / 西门子杯）

说一句"启用比赛模式"，6 个专职 AI 角色上场：**arch**（总架构，唯一决策者）、**drv**（驱动）、**alg**（算法）、**matlab**（仿真）、**qa**（验证门）、**report**（报告）。流程带 CP-0~CP-5 决策门：接口契约不冻结不开工、MATLAB 仿真不过不写固件、QA 不绿灯不集成。

> 6 角色**并行**编排目前完整支持 Claude；其他平台会装入角色定义，但降级为单代理按相同门禁顺序执行。

## 支持的 AI 平台

| 已打通（7） | 预留位（7） |
|---|---|
| Claude Code · Cursor · Codex · OpenCode · GitHub Copilot · Gemini CLI · Windsurf | Kilo · Kiro · Antigravity · Qoder · CodeBuddy · Droid · Pi |

同一套规则写一次，`aemb init` 时按平台各自的语法和钩子机制接线——不需要每个工具重复配置。

## 支持的芯片

STM32（StdPeriph / HAL） · ESP32（ESP-IDF / Arduino） · Arduino（AVR） · RISC-V（GD32VF / CH32V） · NXP（MCUXpresso） · TI MSP430 / **MSPM0**（SDK + 逐飞库） · 国产 MCU（GD32 / CH32 / AT32 / APM32）。

深度本地化（专属 API 速查 + 主板模板）：**STM32 · GD32F470 · MSPM0G3507**；其余走通用方法论 + 联网检索。

## 能力边界（诚实说明）

覆盖的是**固件软件全链路**，不是"整个嵌入式项目"：

| 能闭环（工具链 + 硬件在位） | 必须人来 | 完全不覆盖 |
|---|---|---|
| 架构设计 · 算法仿真 · 驱动 · 应用层 · 编译 · 烧录 · 调试 · 验证 · 报告 | 焊接 · 示波器实测 · PCB 打样 · 硬件在环 · 答辩 | 原理图/PCB 设计 · 器件选型 · 量产/EMC 认证 |

硬件设计与物理实测注定靠人——本框架不替代它们，也不假装能。

---

## 进阶

<details>
<summary><b>工作原理（注入闭环）</b></summary>

```
aemb init ─► 工程内写入 .auto-embedded/（spec/tasks/scripts/tools/refs/modes/workflow）
             + 各 AI 平台的钩子接线（settings.json / hooks.json / config.toml / JS 插件…）

会话开始   ─ SessionStart hook ──► 注入：当前阶段 + 任务 + 规范索引 + 硬件表摘要 + 上次进度
每轮对话   ─ 每轮提交 hook ─────► 注入：当前阶段的行为约束（从 workflow.md 取）
派子 Agent ─ 派发 hook ─────────► 注入：按角色（研究/实现/审查）只给相关的规范文件

任务收尾   ─► task.py promote ──► 经验写回 spec/（下次自动注入，知识复利）
```

注入有字符预算控制（默认单文件 6000 / 总量 16000），知识库变大不会撑爆上下文。

</details>

<details>
<summary><b>仓库结构（开发者向）</b></summary>

| 路径 | 内容 |
|---|---|
| `src/` | aemb CLI（TypeScript，零运行时依赖）：`commands/` 子命令 · `configurators/` 每个 AI 平台的接线器 · `types/ai-tools.ts` 平台注册表 |
| `templates/auto-embedded/` | 装进工程的运行时：`scripts/`（流程引擎）`spec/`（规范种子）`tools/`（22 工具脚本）`refs/`（知识库）`modes/`（专项流程）`workflow.md` |
| `templates/common/` | 跨平台共享的命令/技能/Agent 模板（占位符渲染成各平台语法） |
| `templates/shared-hooks/` | 平台无关的 3 个 Python 注入钩子 |
| [`tests/test-auto-embedded.sh`](tests/test-auto-embedded.sh) | 端到端自测：7 平台安装/体检/幂等/注入/卸载全链路断言 |

新增平台：注册表加条目 + 写一个 configurator。新增知识：md 文件放进 `refs/` 或 `modes/` 并在 index.md 登记即可。

</details>

<details>
<summary><b>与上一代 embedded-dev 的关系</b></summary>

本仓库原是 `embedded-dev`——一个只支持 Claude Code 的单插件协议。auto-embedded 是它的新一代继任者：协议（RIPER-5）、知识库、比赛模式全部继承，但从"全局插件、靠 AI 自觉"升级为"装进工程、钩子强制注入、7 平台通用"（架构对标 [Trellis](https://github.com/mindfold-ai/Trellis) 的工程内基座方案）。两代合并在本仓库（已更名 auto-embedded，旧地址自动重定向）：老版本在 git 历史 `1c984e5` 之前，原独立旧仓归档于 [auto-embedded-legacy](https://github.com/DunCanYounG-1/auto-embedded-legacy)。

</details>

---

## 许可与致谢

[MIT 许可证](LICENSE)，自由使用、修改、分发。

- 基座架构（装进工程 / hook 注入 / 规范回流 / 多平台接线）对标 **[Trellis](https://github.com/mindfold-ai/Trellis)**（mindfold-ai）。
- 长任务治理思路借鉴 `how-to-vibecoding`；感谢 **[LinuxDo](https://linux.do/)** 社区支持。
- 问题反馈：[GitHub Issues](https://github.com/DunCanYounG-1/auto-embedded/issues)。

<sub>本 README 是面向人类的介绍，不是规范。AI 遵循的权威规则见 [`SKILL.md`](SKILL.md) 与工程内 `.auto-embedded/workflow.md`；两者与本文冲突时以前者为准。</sub>
