# 安装与依赖

本 skill 以 **Claude Code 插件（plugin）** 形式分发。**在已装好 Claude Code 的前提下**，一条 `/plugin install` 即可装齐 26 个 skill（riper5 主协议 + 25 个执行层 skill）的内置内容并**自动注册 hooks**，无需手动改 settings.json。

> **诚实边界（不是"白板机器零依赖"）**：和所有带 hook 的插件一样，本插件**无法代劳 Claude Code 本身就需要的运行时**——Python / Bash / Git（Windows 还需 Git Bash 在 PATH）是**安装前置**，见 §2；缺它们时 hooks 静默失效（fail open），协议主流程仍由 Claude 手动遵守。`grok-search`（联网检索，§3.1）、各烧录/调试工具链等是**可选/可降级**项，需另配。

依赖按**必装 / 推荐 / 可选**三级列出，每项缺失都有降级方案；缺什么 hooks 都 fail open，协议主流程不卡死。

---

## 1. 安装（plugin，推荐）★

### 1.1 一条命令

在 Claude Code 里：

```text
/plugin marketplace add DunCanYounG-1/embedded-dev
/plugin install embedded-dev@embedded-dev
```

或用 CLI：

```bash
claude plugin marketplace add DunCanYounG-1/embedded-dev
claude plugin install embedded-dev@embedded-dev
```

装完即获得：

- **26 个 skill 全部就位**：riper5 主协议 + `build-*` / `flash-*` / `debug-*` / `serial-monitor` / `modbus-debug` / `can-debug` / `visa-debug` / `memory-analysis` / `rtos-debug` / `static-analysis` / `peripheral-driver` / `stm32-hal-development` / `workflow` / `codex` + `shared/` 契约层。
- **hooks 自动注册**：SessionStart 引导注入、PreToolUse 写前分层拦截、UserPromptSubmit/PostToolUse 四文件提醒——全部随插件生效，**不用再跑 `register-hooks.py`、不用手改 settings.json**。
- **6 个比赛模式 subagent**：`embedded-arch/drv/alg/matlab/qa/report`。

### 1.2 验证

```text
/plugin            # Installed 标签页应看到 embedded-dev 及其组件
/help              # 技能以 /embedded-dev:<name> 形式出现
/hooks             # 应列出本插件的 4 个事件 hook
```

功能性自检：①新会话首条响应应自动出现 SessionStart 引导文本；②故意让 Claude 往 app 层写一个 `#include "stm32f4xx.h"`，应被 `pre-write-check.py` 以 exit 2 拦截。两者都发生 = hooks 已生效。

---

## 2. 必装依赖（缺了核心 hook 不工作）

| 依赖 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| **Python 3.8+** | `hooks/session-start.py` 注入协议引导；`shared/project_detect.py` 工程画像探测 | Windows: <https://www.python.org/downloads/> 或 `winget install Python.Python.3`；macOS: `brew install python@3.12`；Linux: 系统包管理器 | SessionStart hook 静默失效；协议主流程仍由 Claude 手动遵守 |
| **Bash** | 4 个 bash hook（`check-memory-files` / `inject-context` / `remind-update` / `run-hook.cmd` 分发器） | Linux/macOS 原生；Windows 装 **Git for Windows** <https://git-scm.com/download/win>（自带 Git Bash） | 对应 bash hook 静默失效；`run-hook.cmd` 自动 `exit 0`，协议主流程仍生效 |
| **Git** | 插件市场拉取 / 自动存档 | <https://git-scm.com/downloads> | 插件安装与 Git 快照回档失效 |

**Windows 用户特别注意**：装 Git for Windows 时勾选"Add Git to PATH"。Claude Code 在 Windows 下的 hook command 经 `bash` 执行，需要 Git Bash 在 PATH。

> hook 命令统一用 `${CLAUDE_PLUGIN_ROOT}` 解析插件根（Claude Code 安装插件时自动设置），无需手工配置路径。

---

## 3. 推荐依赖（缺了关键功能降级，但能用）

### 3.1 grok-search（联网检索，第三方）

| 依赖 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| `~/.claude/skills/grok-search/` | 所有联网检索（驱动/报错/数据手册入口）首选工具 | 第三方 skill，单独 clone：`git clone https://github.com/Frankieli123/grok-skill ~/.claude/skills/grok-search`，再在 `config.json` 填 API key + base_url（如 `https://www.micuapi.ai/v1`） | 自动 fallback 到 Claude 内置 WebSearch / WebFetch |

> grok-search 因许可与 API key 配置原因**未并入本插件**，需单独安装。

### 3.2 Context7 MCP（库 API 即时文档）

| 依赖 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| Context7 MCP 服务器 | STM32/ESP-IDF/HAL 等库 API 即时文档；超出离线 refs 覆盖时使用 | `claude mcp add --transport http context7 https://mcp.context7.com/mcp` | 离线 refs 覆盖不到时降级到 grok-search 联网检索 |

### 3.3 gh CLI（GitHub 检索）

| 依赖 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| GitHub CLI `gh` | 检索 EmbedSummary 等开源驱动库 | <https://cli.github.com/> 后 `gh auth login` | grok-search + WebSearch site:github.com |

---

## 4. 可选依赖（特定场景才需要）

| 依赖 | 触发场景 | 安装方法 |
|---|---|---|
| **Sequential Thinking MCP** | 引脚冲突 / DMA 分配复杂推理 | `claude mcp add` 加入 |
| **Document Skills**（`pdf` / `docx` / `xlsx` / `pptx`） | 解析数据手册 PDF / 原理图 / 报告 | Anthropic 官方插件市场提供 |
| **agent-browser** | 在线数据手册页面交互、厂商 Web 配置器、截图留档 | 由 skill 提供方安装 |
| **MATLAB MCP** | LQR/Kalman/滤波器仿真 → 导出 `.h` 上板（MIL/SIL） | 视厂商而定 |
| **Mermaid CLI** | 文档生成里的流程图渲染 | `npm i -g @mermaid-js/mermaid-cli` |

---

## 5. 平台特定注意事项

### Windows
- **Git Bash 必装**：所有 bash hook 通过它执行（`run-hook.cmd` 是纯 bash 脚本）。
- **路径分隔符**：Python hook 已自动处理 `/c/Users/` / `/cygdrive/c/` / `/mnt/c/` → `C:\` 规范化。
- **Python 3 命令名**：建议用 `python`（Windows 标准）。`python3` 在 Windows 上常指向 Store stub（无实际 Python）——`run-hook.cmd` 会自动探测真解释器并绕过 stub。
- **行尾符**：仓库已通过 `.gitattributes` 锁 `*.sh` / hook 脚本为 LF；不要本地改 git autocrlf。

### macOS
- macOS 自带 `python3` 通常够用，建议装 `python@3.12` 保证版本一致。

### Linux
- Python / Bash / Git 通常预装；串口权限：`sudo usermod -a -G dialout $USER`（Debian/Ubuntu）。

---

## 6. legacy：传统 user-skill 安装（不推荐，仅在不用 plugin 时）

如果你不想用插件机制，可走传统 user-skill 安装，但要手动两步、且 hooks 不自动注册：

```bash
# 1) clone 仓库（任意位置）
git clone https://github.com/DunCanYounG-1/embedded-dev /tmp/embedded-dev-src

# 2) 把打包的全部 skill 复制到 ~/.claude/skills/
bash /tmp/embedded-dev-src/skills/embedded-dev/scripts/install-siblings.sh
#    Windows(PowerShell): pwsh /tmp/embedded-dev-src/skills/embedded-dev/scripts/install-siblings.ps1

# 3) 手动注册 hooks（user-skill 不自动注册 frontmatter/插件 hooks）
python ~/.claude/skills/embedded-dev/tools/register-hooks.py --write --target ./.claude/settings.json
```

- 第 2 步把 `skills/` 下 26 个 skill（含 riper5 主协议本体 `skills/embedded-dev/` + shared）复制到 `~/.claude/skills/`；`--dry-run` 预览、`--force` 覆盖更新。
- 第 3 步是 legacy 专用：插件安装会自动注册 hooks，user-skill 安装则必须显式注册（幂等、自动备份 `.bak`、可 `--remove` 撤销）。注册后**重启会话**生效。
- **不注册也能用（degraded）**：协议主流程、四文件记忆、分层规范全部由 Claude 按规则手动遵守，只是失去 hook 的"机械提醒 + 写前预拦截"。此时唯一机械门禁是 REVIEW/CP 阶段主动跑 `scripts/arch-check.sh` + `tools/include-graph.py`。

---

## 7. 最小可用集 / 完全 minimal

clone + Python + Git Bash（Windows）即可启动**纯协议/知识库**部分（不依赖任何 hook 或兄弟 skill）：

✅ 立即可用：
- RIPER-5 五阶段协议（RESEARCH / INNOVATE / PLAN / EXECUTE / REVIEW）
- 四文件磁盘记忆、PLAN/EXECUTE 三件套、6 层架构规范
- 所有 `refs/*.md` 离线知识库（API 速查、引脚规划、IMU、Mahony AHRS、故障排查…）
- 6 个扩展模式（competition / datasheet-lookup / gd32-board / netlist-lookup / seekfree-lib / mcp-healthcheck）

⚠ 装插件（或 legacy 注册 hook）后自动生效：SessionStart 引导、pre-write-check 写前拦截、四文件提醒。
⚠ 插件自带 / legacy 装齐兄弟 skill 后可用：真正执行编译/烧录/调试/串口/总线/分析，工程画像自动探测（`shared/project_detect.py`）。
⚠ 装对应 MCP/CLI 后可用：Context7 即时库文档、gh 仓库检索、grok-search 联网搜索。

RESEARCH/INNOVATE/PLAN/REVIEW 四阶段对外部依赖近乎为零；只有 EXECUTE 真正跑命令时才需要执行层 skill。
