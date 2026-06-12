# 安装与使用 auto-embedded

## 0. 依赖
- **Node ≥ 18**（必须，aemb CLI 是 TypeScript/Node 包，零运行时依赖）。
- **Python ≥ 3.9**（必须，注入 hooks 与运行时/工具脚本用）。Windows 注意：`python3` 常是 Microsoft Store 伪 stub，
  `aemb init` 会**实跑探测**真正可用的 python（py/python/python3），把正确命令写进各平台 hook 接线。
- **git**（可选，用于定位工程根；无 git 时按传入目录或 CWD）。
- 目标 AI 工具之一：Claude Code / Cursor / Codex / OpenCode / GitHub Copilot / Gemini CLI / Windsurf。

## 1. 全局安装 aemb CLI
```bash
npm install -g auto-embedded
```
或从源码（`npm install` 会触发 `prepare` 跑 tsc 编译出 `dist/`）：
```bash
git clone https://github.com/DunCanYounG-1/auto-embedded
cd auto-embedded
npm install -g .
```

## 2. 在固件工程里安装运行时 + 平台接线
```bash
aemb init /path/to/firmware-project -u your-name --platforms claude,cursor,codex
# 也可：--claude --cursor … 逐个；或 --all 装全部已打通平台；不指定则默认 claude
```
`-u` 写开发者身份到 `.auto-embedded/.developer`（注入时显示、`doctor` 可查）。会做三件事：
1. 写 `.auto-embedded/`：运行时内核（scripts: aemb_core/task/get_context/check）+ spec/ + workflow.md + config.yaml + **tools/**（21 个工具脚本 + shared）。
2. 为每个选定平台写注入接线 + agents/skills/commands（格式各平台不同：Claude `settings.json`、Cursor/Codex/Copilot `hooks.json`、Codex `config.toml`、OpenCode JS 插件、Gemini `settings.json`、Windsurf workflows）。
3. **合并**共享配置文件：只增删 aemb 自己的片段，已有配置保留、按命令去重、可重复跑不重复（幂等）。

> 已打通：`claude cursor codex opencode copilot gemini windsurf`。预留位（暂不可装）：`kilo kiro antigravity qoder codebuddy droid pi`。

## 3. 验证
```bash
aemb doctor /path/to/firmware-project
```
全 OK 后，在该工程**新开一个会话**（让注入 hook 触发），首条回复前应能看到注入的
`<auto-embedded-session>`（RIPER 阶段 + spec 索引 + 硬件锁 + 五问重启）。

> 平台开关提示：**Codex** 需在 `~/.codex/config.toml` 设 `[features].hooks = true` 并跑一次 `/hooks` 审核，hook 才生效（未生效时靠每轮面包屑的 bootstrap 提示用 `$aemb-start` 兜底）。

## 4. 日常（slash 命令 / 技能）
```
/aemb:start <标题>     建任务并进 RESEARCH
/aemb:continue         恢复现场 + 五问重启 + 按阶段路由
/aemb:finish-work      REVIEW 验证门 + promote 学习回流 + 归档
/aemb:status           现场状态
```
（Cursor/Windsurf/Copilot 为 `/aemb-…`，Codex/Qoder 为 `$aemb-…`。）这些在 `init` 时已写进工程。内部就是调脚本，也可手动：
```bash
python .auto-embedded/scripts/task.py start "<任务>" | phase PLAN | select builder spec/architecture/index.md "原因" | promote conventions "<学习>" | journal "<摘要>" | archive
```
工具技能（编译/烧录/调试/串口/总线/静态/内存/RTOS）脚本在 `.auto-embedded/tools/<skill>/scripts/`，按需 `python` 调，详见各 `references/usage.md`。

## 5. 升级与卸载
- 升级：`aemb update <工程>`（只覆盖 managed：脚本/hooks/agents/commands/工具/workflow.md；保留 spec/tasks/workspace/config 与你的改动，冲突写 `.new`）。
- 临时关闭注入：设环境变量 `AEMB_HOOKS=0`（或 `AEMB_DISABLE_HOOKS=1`）。
- 卸载：`aemb uninstall <工程>`（按 manifest 删 aemb 独占文件 + 从共享配置剥除 aemb 片段 + 删 `.auto-embedded/`；卸载前自动备份到 `.auto-embedded.bak.N`；用户固件源码不动）。

## 6. 自测
```bash
bash tests/test-auto-embedded.sh
```
在临时工程里 `init --all` 并断言整条闭环（7 平台脚手架/doctor/幂等/内核/工具脚本 shared 导入/SessionStart+面包屑+子 Agent 注入/卸载全清）。

## 7. 故障排查
- 没注入：跑 `aemb doctor`；确认对应平台的注入接线已写入、命令里的 python 能在该工具的 PATH 下运行（Windows 纯 Store stub 会失败——重跑 `init` 重新探测）。
- 子 Agent 没拿到 spec：确认 active task 的 `implement.jsonl`/`verify.jsonl`/`research.jsonl` 里有 `{"file":"spec/...","reason":"..."}`（用 `task.py select` 写），且 `_example` 行已删。pull 类平台（Codex/Copilot/Gemini 子 Agent）改由 Agent 定义里的 prelude 自取。
