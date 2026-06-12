# 快速开始

[English](./quick-start.md) | **简体中文**

> 从零到第一个任务：安装 CLI → 装进工程 → 开会话干活。

## 前置要求

| 依赖 | 版本 | 用途 |
|---|---|---|
| Node.js | ≥ 18 | aemb CLI 本体（零运行时依赖） |
| Python | ≥ 3.9 | 注入钩子与运行时脚本（与 Trellis 同栈） |
| 任一 AI 编码工具 | — | Claude Code / Cursor / Codex / OpenCode / Copilot / Gemini CLI / Windsurf |

Windows 用户注意事项（Git Bash、路径风格等）见 [INSTALL.md](../INSTALL.md)。

## 安装

```bash
# 全局安装 CLI
npm install -g auto-embedded

# 或从源码
git clone https://github.com/DunCanYounG-1/auto-embedded
cd auto-embedded && npm install -g .
```

## 装进固件工程

```bash
# 按需选平台（逗号分隔）
aemb init /path/to/firmware-project -u 你的名字 --platforms claude,cursor

# 等价的开关写法
aemb init /path/to/firmware-project -u 你的名字 --claude --cursor

# 或全部已打通平台一次装齐
aemb init /path/to/firmware-project -u 你的名字 --all
```

init 做三件事：

1. **写入运行时** `.auto-embedded/`：流程引擎脚本、规范种子（spec/）、22 个工具脚本（tools/）、55+ 篇知识库（refs/）、12 个专项流程（modes/）、流程定义（workflow.md）
2. **接线各平台**：按平台原生机制写入钩子与技能（Claude `settings.json`、Cursor/Codex `hooks.json`、Gemini `settings.json`、OpenCode JS 插件……），智能合并已有配置、只增删自己的片段
3. **探测芯片**：识别工程里的芯片/框架/构建系统，生成硬件草案待你确认

> 已有工程再加平台：重复跑 `aemb init --<新平台>` 即可，增量安装、不动已有内容。

## 各平台命令语法

同一套命令，各平台触发语法不同（init 结束时会按你装的平台打印对应入口）：

| 平台 | 触发形式 | 示例 |
|---|---|---|
| Claude Code / OpenCode / Gemini CLI | 斜杠命令 | `/aemb:start` `/aemb:continue` |
| Cursor / Windsurf / Copilot | 斜杠命令 / 工作流 / 提示 | `/aemb-start` `/aemb-continue` |
| Codex | 技能 | `$aemb-start` `$aemb-continue` |

## 日常命令

| 命令 | 干什么 | 何时用 |
|---|---|---|
| `start <标题>` | 建任务，进 RESEARCH 阶段 | 开始一件新事 |
| `continue` | 恢复现场 + 五问重启 + 按阶段路由 | 断点续作 / 新会话 |
| `brainstorm <标题>` | 一问一答收敛需求 → PRD | 需求还不清楚时 |
| `check` | 机械门禁：分层架构 + 硬件冲突 + 规范完整性 | REVIEW 前、提交前 |
| `break-loop` | bug 根因复盘，沉淀防复发机制 | 修完 bug（尤其反复出现的） |
| `finish-work` | 验证门 → 经验回流 → 写日志 → 归档 | 任务收尾 |
| `journal <摘要>` | 写一条跨会话记忆 | 重要决策后、会话结束前 |
| `status` | 打印当前现场 | 随时 |

## 第一个任务（典型流程）

```text
你:  /aemb:start 给主板加 SHT30 温湿度读取
AI:  [MODE: RESEARCH] 查知识库/手册，确认 I2C 引脚并写入 hw-lock.yaml …
AI:  [MODE: PLAN] 实施清单（3 项，含 review 标记）—— 请确认
你:  确认
AI:  [MODE: EXECUTE] 第 1 轮：bsp_sht30.c … 编译通过（证据：…）
你:  /aemb:finish-work
AI:  [MODE: REVIEW] check 通过 → 实测验证 → promote 2 条经验进 spec → 归档
```

## 维护

```bash
aemb doctor <工程>      # 体检：7 平台接线是否完好
aemb update <工程>      # 升级 managed 内容（脚本/工具/知识库），保留你的 spec/任务/改动
aemb check  <工程>      # 手动跑机械门禁（--arch / --hw / --spec / --json）
aemb backup <工程>      # 备份 .auto-embedded/
aemb uninstall <工程>   # 按 manifest 干净剥离（先自动备份）
```

## 下一步

- 理解流程与机制 → [核心概念](./concepts_CN.md)
- 理解注入原理与扩展方式 → [架构原理](./architecture_CN.md)
