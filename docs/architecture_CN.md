# 架构原理

[English](./architecture.md) | **简体中文**

> 面向想理解机制或参与开发的读者：注入闭环、managed/seed 二分、仓库结构、扩展方式。

## 注入闭环（为什么"不靠 AI 自觉"）

```
aemb init ─► 工程内写入 .auto-embedded/（spec/tasks/workspace/scripts/tools/refs/modes/config/workflow）
             + 各平台钩子接线（settings.json / hooks.json / config.toml / JS 插件…）
                                   │
   会话开始 ─ SessionStart ────────┼─► 注入：RIPER 阶段 + active task + 规范索引（含 refs/modes）
   │                               │        + hw-lock 摘要与冲突预警 + 最近 journal + 五问重启
   每轮     ─ UserPromptSubmit ────┼─► 注入：当前阶段的行为约束面包屑（从 workflow.md 的
   │                               │        [workflow-state:阶段] 块取一行）
   派子代理 ─ PreToolUse(Task) ────┴─► 注入：按角色读 research/implement/verify.jsonl，
                                           只 push 该角色相关的规范文件（updatedInput 改写提示）
   
   REVIEW ─► task.py promote ─► 写回 spec/ ─► 下次自动注入（知识复利）
```

关键设计：

- **注入由平台钩子机制保证**，不依赖模型读没读规则文件。三个平台无关的 Python 钩子（session-start / inject-workflow-state / inject-subagent-context）被各平台 configurator 用各自的方式接线。
- **平台注入分级**：class-1 push（Claude/Cursor/Gemini——钩子能改主会话和子代理提示）、class-2 pull（Codex/Copilot——子代理靠 prelude 自取）、class-3 command（Windsurf——纯命令/技能）。共享模板用 `{{#AGENT_CAPABLE}}` / `{{#HAS_HOOKS}}` 条件块按平台能力渲染。
- **注入预算**：单文件默认 6000 字符、子代理总量 16000（`config.yaml` 可调），知识库变大不会撑爆上下文；超预算的文件只给路径懒加载。
- **角色相关性**：派 Scout/Builder/Verifier（或比赛 6 角色）时按 per-task `*.jsonl` 选择器只注入该角色相关的规范——对标 Trellis 的 per-task jsonl 机制。

## managed / seed 二分（升级不丢你的内容）

| 类别 | 内容 | `aemb update` 行为 |
|---|---|---|
| **managed** | `scripts/`（流程引擎）、`tools/`（22 工具）、`refs/`、`modes/`、`workflow.md`、各平台接线文件 | hash 比对升级：模板更新→覆盖；你改过→新版写 `.new` 不覆盖 |
| **seed** | `config.yaml`、`spec/**`（你的项目规范）、`tasks/`、`workspace/` | 永不触碰（仅缺失时补种） |

知识演进的正确姿势：上游知识（refs/modes）随框架升级；**项目级**学习走 `promote` 进 spec 层——两者互不污染。

## 安全防护

所有命令入口统一检查 symlink/junction 越界（防把 `.auto-embedded` 或其子树换成指向工程外的链接导致写穿/读穿/执行工程外代码）；卸载按 manifest 记账剥离、先备份；配置合并只增删自己的片段，解析失败先备份原文件。

## 仓库结构

```
src/                        aemb CLI（TypeScript，零运行时依赖）
├─ cli/                     入口与参数解析（手写，无依赖）
├─ commands/                init / update / doctor / check / backup / uninstall
├─ configurators/           每平台一个接线器 + shared.ts(占位符渲染) + merge.ts(配置合并)
│                           + hooks.ts(共享钩子分发) + workflow.ts(运行时内核装入)
└─ types/ai-tools.ts        平台注册表（单一事实源：7 已打通 + 7 预留）

templates/
├─ auto-embedded/           装进工程的运行时内核
│  ├─ scripts/              RIPER 引擎（aemb_core/task/check/get_context + arch-check）
│  ├─ spec/                 规范种子（五层，seed）
│  ├─ tools/                22 工具技能脚本 + shared/ 公共件 + companion 工具
│  ├─ refs/                 55+ 篇离线知识库（managed）
│  ├─ modes/                12 个专项流程（managed）
│  └─ workflow.md           流程单一事实源（钩子从中取面包屑）
├─ common/                  跨平台共享 body（占位符渲染成各平台语法）
│  ├─ commands/ skills/     用户仪式命令 + 自动触发技能
│  ├─ tool-skills/          22 个工具技能 SKILL body
│  └─ agents/               aemb-scout/builder/verifier + 6 比赛角色
├─ shared-hooks/            3 个平台无关 Python 注入钩子
└─ <平台>/                  平台私有模板（config.toml / JS 插件等）

tests/test-auto-embedded.sh 端到端自测（7 平台装机/体检/幂等/注入/卸载全链路断言）
```

## 怎么扩展

| 想做 | 步骤 |
|---|---|
| **新增 AI 平台** | `types/ai-tools.ts` 注册表加条目 → 写 `configurators/<平台>.ts` → 在 `configurators/index.ts` 注册。预留位平台已占好注册表坑位。 |
| **新增知识** | md 文件放进 `templates/auto-embedded/refs/` 或 `modes/`（`workflow.ts` 按前缀自动装入）→ 在对应 `index.md` 登记 |
| **新增工具技能** | `templates/common/tool-skills/` 加带 frontmatter 的 `.md` + `templates/auto-embedded/tools/<名>/` 放脚本 → 更新自测计数断言 |
| **改流程** | 改 `templates/auto-embedded/workflow.md`（面包屑随之变化），勿在多处复制流程定义 |

改完跑回归：`npm run build && bash tests/test-auto-embedded.sh`。

## 与上一代 embedded-dev 的关系

本仓库原是 `embedded-dev`——只支持 Claude Code 的全局单插件协议（refs 全局只读、靠模型自觉、无法跨平台）。auto-embedded 继承其全部协议资产（RIPER-5 / 知识库 / 比赛模式），把交付方式升级为"装进工程、钩子强制注入、7 平台通用"（对标 [Trellis](https://github.com/mindfold-ai/Trellis) 的工程内基座方案），并原地更名。

- 老版本：git 历史 `1c984e5` 之前
- 原独立旧仓：归档于 [auto-embedded-legacy](https://github.com/DunCanYounG-1/auto-embedded-legacy)
- 知识库中 `refs/riper5-protocol.md`、`refs/hooks-design.md` 保留为上一代历史参考（已加标注）
