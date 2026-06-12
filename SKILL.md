---
name: auto-embedded
description: "全平台嵌入式 AI 开发框架（对标 Trellis）：把 RIPER-5 五阶段协议 + 四文件记忆 + 分层架构门禁 + Scout/Builder/Verifier 多 Agent + 21 个工具调用技能（build/flash/debug/serial/can/modbus/visa/static/memory/rtos），做成『装进工程、项目级 hook 必然运行、按角色自动注入相关 spec、REVIEW 学习回流』的闭环，并一次写、全平台交付（Claude/Cursor/Codex/OpenCode/Copilot/Gemini/Windsurf）。用 `aemb init` 在固件工程里安装运行时与各平台注入接线。当用户要为 STM32/ESP32/GD32/MSPM0/RISC-V/国产 MCU 工程搭建可复用开发规范基座、让约定自动注入、跨会话可恢复、编译/烧录/调试一体化，或问到 auto-embedded/aemb/spec 注入/项目级 hook/全平台时使用。不适用于纯 Web/移动/桌面软件或与硬件无关的通用 C/C++。"
keywords: "auto-embedded, aemb, 全平台嵌入式框架, 多平台, spec 注入, 项目级 hook, RIPER-5, 四文件记忆, 分层架构门禁, Scout Builder Verifier, hw-lock, promote 回流, 工具技能, build flash debug, STM32, ESP32, GD32, MSPM0, Claude Cursor Codex OpenCode Copilot Gemini Windsurf"
---

# auto-embedded —— 装进工程、跨 7 个 AI 平台的 RIPER-5 + spec 注入 + 工具链框架

## 它是什么（与 embedded-dev 的区别）

`embedded-dev` 是**全局单 skill 插件**：refs 全局只读、靠模型自觉、frontmatter hook 对 user-skill 不生效、且只在 Claude 可用。
`auto-embedded` 对标 Trellis，把同一套能力做成**装进每个固件工程、跨多个 AI 编码平台的基座**：

- **项目级 hook 必然运行**：`aemb init` 把注入接线写进工程的各平台配置（Claude `settings.json`、Cursor/Codex/Copilot `hooks.json`、Gemini `settings.json`、OpenCode JS 插件…），AI 工具必然执行（不依赖 skill frontmatter hook）。
- **项目级 spec 库**：`.auto-embedded/spec/`（分层、可版本化、可覆盖），而非全局只读 refs。
- **相关性自动注入**：会话起始注入阶段+spec 索引；派 Scout/Builder/Verifier 时按 per-task `*.jsonl` 只 push 该角色相关的 spec。
- **学习回流**：REVIEW 用 `task.py promote` 把决策/约定/坑沉淀回 spec，跨会话/跨任务复利。
- **工具链一体化**：21 个工具调用技能（编译/烧录/调试/串口/CAN/Modbus/VISA/静态分析/内存分析/RTOS），脚本随框架装进 `.auto-embedded/tools/`，全平台都能调。
- **一次写、全平台交付**：同一套 common 命令/技能/Agent 经占位符渲染成各平台正确语法，由各平台 configurator 写对应注入接线。

## 支持平台

**已打通（7）**：`claude` `cursor` `codex` `opencode` `copilot` `gemini` `windsurf`
**预留位（7，注册表就绪、configurator 待实现）**：`kilo` `kiro` `antigravity` `qoder` `codebuddy` `droid` `pi`

## 第一步：判断工程是否已安装

主交付物是固件且在某个工程目录时，**先查该工程根有没有 `.auto-embedded/`**：

- **没有** → 新接入，跑一次 init：
  ```bash
  aemb init <工程根> -u <开发者名> --platforms claude,cursor,codex   # 或 --claude --cursor …，或 --all
  ```
  会脚手架 `.auto-embedded/`（运行时内核 + spec + 21 工具脚本）+ 写各平台注入接线/agents/skills/commands + 智能合并配置文件（settings.json/hooks.json/config.toml/package.json，只增删 aemb 片段）。
  安装后在该工程**新开一个会话**，注入 hook 就会自动带出现场。
- **已有** → 接线已在注入现场。读注入的 `<auto-embedded-session>` 块 + `.auto-embedded/workflow.md`，按 RIPER-5 推进。

日常驱动用 **slash 命令 / 技能**（init 已写进工程）：
`/aemb:start <标题>` · `/aemb:continue` · `/aemb:finish-work` · `/aemb:status`（Cursor 等为 `/aemb-…`，Codex 为 `$aemb-…`）。

## 命令速查

**脚手架**（`aemb` = npm 全局安装出的命令；或 `node dist/cli/index.js`）：
```
aemb init   <工程> -u <名> [--platforms a,b | --<平台> … | --all]   # 安装运行时 + 选定平台接线
aemb update <工程>            # 升级 managed（脚本/hooks/agents/commands/工具），保留 spec/tasks/用户改动
aemb doctor <工程>            # 体检 7 平台接线
aemb check  <工程> [--arch|--hw|--spec|--json]   # 机械门禁
aemb backup <工程>            # 备份 .auto-embedded/
aemb uninstall <工程>         # 按 manifest 剥除 aemb 片段 + 删 .auto-embedded（先备份）
```
**底层脚本**（slash 命令内部调它，也可直接用）：
```
python .auto-embedded/scripts/task.py start "<标题>" | phase PLAN | select builder spec/architecture/index.md "原因" | promote conventions "<学习>" | list | journal "<摘要>" | archive
```

## 工作流（RIPER-5，权威在工程的 workflow.md）

每条回复开头声明 `[MODE: 阶段]`。默认 RESEARCH 起；含写代码的清单项进 EXECUTE 前必须过 PLAN 审查门并获用户确认。

| 阶段 | 干什么 | 角色 |
|---|---|---|
| RESEARCH | 查芯片/库、读 spec、引脚规划写 hw-lock.yaml、证据写 research.md | Scout(只读) |
| INNOVATE | 评候选方案 | — |
| PLAN | 出实施清单（路径+签名+寄存器+验证标准+review+层级）；零占位符 | — |
| EXECUTE | 按轮次最小实现，每轮带 trace_id+验证标准+证据；本地 git 快照 | Builder(单写者) |
| REVIEW | 验证门→硬件合规(对照 hw-lock)→分层门禁→**promote 回流** | Verifier(只审) |

多文件/长任务按 Scout→Builder→Verifier 分权，同一时刻只一个 Builder 写。
派 Agent：`aemb-scout|aemb-builder|aemb-verifier`，hook（push 平台）或 prelude（pull 平台 Codex/Copilot/Gemini 子 Agent）会按角色注入相关 spec。

## 工具调用技能（22，全平台交付）

脚本随框架装进 `.auto-embedded/tools/<skill>/scripts/`，按需用 `python` 调；SKILL 描述自动触发：
- 编译：`build-cmake` `build-iar` `build-idf` `build-keil` `build-makefile` `build-platformio`
- 烧录：`flash-idf` `flash-jlink` `flash-keil` `flash-openocd` `flash-platformio`
- 调试：`debug-gdb-openocd` `debug-jlink` `debug-platformio`
- 观测/分析：`serial-monitor` `static-analysis` `memory-analysis` `rtos-debug`
- 总线/仪器：`can-debug` `modbus-debug` `visa-debug`
- 驱动：`peripheral-driver`（开源驱动搜索→评估→适配/骨架；方法论见 `.auto-embedded/refs/stm32-hal/`）

## 知识库与专项流程（自上一代 embedded-dev 全量吸收，按需加载）

上一代 `embedded-dev` 的离线知识库与专项流程已 bundle 进运行时，随 `aemb init` 装入工程，**按需读取**（不自动全量注入，防撑爆上下文）：

- `.auto-embedded/refs/`（55+ 篇）—— STM32/GD32 API、引脚规划、IMU、故障分类、编码规范、驱动移植、竞赛清单/契约…总览见 `refs/index.md`；`refs/stm32-hal/` 为 STM32 HAL 方法论 + BSP 模板领域包。
- `.auto-embedded/modes/`（12 篇）—— RIPER-5 主干外的专项工作流：`competition`（比赛 6-Agent + CP 门禁）、`datasheet-lookup`、`netlist-lookup`、`gd32-board`、`mspm0-board`、`seekfree-lib`、`matlab-*`、`industrial-data-acquisition`、`mcp-healthcheck`、`workflow-orchestration`。总览见 `modes/index.md`。

**比赛模式**：用户说"启用比赛模式"时进入 `.auto-embedded/modes/competition.md`，由 6 个专职 subagent 并行推进：
`embedded-arch`（唯一决策者/路由/集成）· `embedded-drv`（驱动）· `embedded-alg`（算法）· `embedded-matlab`（MATLAB 仿真）· `embedded-qa`（验证门）· `embedded-report`（报告），配合 CP-0~CP-5 决策门与 Defect Ticket 回派协议。 并行编排完整支持 Claude；其余平台装入 agent 定义但派发受限（Codex 禁 spawn、Copilot 无 Task 映射），降级为单代理按 modes/competition.md 顺序走 CP 门禁。日常 RIPER-5 仍用 `aemb-scout/builder/verifier` 三角色。

## spec 库（项目级，可演进）

`.auto-embedded/spec/` 五层（见各 `index.md`）：`architecture`（六层模型+ARCH-1~8）、`conventions`（证据优先/复用优先/ISR/临界区/Git 快照）、`hardware`（事实基线 + 机器可读 `hw-lock.yaml`）、`guides`（思维清单）、`governance`（记忆边界）。
新增/改约定就改对应 `index.md`；REVIEW 用 `promote` 沉淀，下次自动注入。

## 架构（开发者向）

`src/types/ai-tools.ts`（平台注册表数据）→ `src/configurators/*`（每平台行为 + `shared.ts` 占位符渲染 + `merge.ts` 配置合并 + `hooks.ts` 共享 hook 分发）→ `templates/`（`common/` 共享 body、`shared-hooks/` 三个 Python hook、`<平台>/` 私有模板、`auto-embedded/` 运行时内核 + 工具脚本）。新增平台：加注册表条目 + 写 `configurators/<平台>.ts` + 在 `configurators/index.ts` 注册。

## 自测

```
bash tests/test-auto-embedded.sh
```
临时工程里 `init --all` 并断言整条闭环（7 平台脚手架/doctor/幂等/内核/工具脚本 shared 导入/SessionStart+面包屑+子 Agent 注入/卸载全清）。
