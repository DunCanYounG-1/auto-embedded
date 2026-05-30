# 安装与依赖

依赖按**必装 / 推荐 / 可选**三级列出 + 每项缺失时的降级方案。缺什么 hooks 都 fail open，协议主流程不卡死。

---

## 0. 快速验证

clone 之后想确认哪些功能可用，跑这一条：

```bash
bash ~/.claude/skills/embedded-dev/hooks/verify-deps
```

它会逐项探测 Python / Git Bash / 兄弟 skill / shared 工具 / 网络可达性，输出"必装/推荐/可选"三级状态报告。**不在乎缺失的项不影响其他功能**。

---

## 1. 安装本 skill

### Linux / macOS

```bash
git clone https://github.com/DunCanYounG-1/embedded-dev ~/.claude/skills/embedded-dev
```

### Windows (PowerShell)

```powershell
git clone https://github.com/DunCanYounG-1/embedded-dev "$env:USERPROFILE\.claude\skills\embedded-dev"
```

### Windows (Git Bash)

```bash
git clone https://github.com/DunCanYounG-1/embedded-dev ~/.claude/skills/embedded-dev
```

### 紧接着：一键就位执行层兄弟 skill（推荐）

本仓库已把 25 个执行层兄弟 skill（编译/烧录/调试/串口/总线/分析）+ `shared/` 契约层 **vendor 进 `siblings/` 目录**。clone 完跑一次安装脚本即可全部就位（详见 §3.1）：

```powershell
pwsh "$env:USERPROFILE\.claude\skills\embedded-dev\scripts\install-siblings.ps1"   # Windows
```
```bash
bash ~/.claude/skills/embedded-dev/scripts/install-siblings.sh                      # Linux/macOS/Git Bash
```

装完重启 Claude Code 会话即可。`grok-search`（第三方）见 §3.3 单独装。

---

## 2. 必装依赖（缺了核心 hook 不工作）

| 依赖 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| **Python 3.8+** | `hooks/session-start.py` 注入协议引导；`shared/project_detect.py` 工程画像探测 | Windows: <https://www.python.org/downloads/> 或 `winget install Python.Python.3`；macOS: `brew install python@3.12`；Linux: 系统包管理器 | SessionStart hook 静默失效；协议主流程仍由 Claude 手动遵守 |
| **Bash** | 4 个 bash hook (`check-memory-files` / `inject-context` / `remind-update` / `run-hook.cmd` polyglot) | Linux/macOS 原生；Windows 装 **Git for Windows** <https://git-scm.com/download/win>（自带 Git Bash） | 4 个 bash hook 静默失效；polyglot 自动 `exit 0`，协议主流程仍生效 |
| **Git** | clone / commit / 自动存档 | <https://git-scm.com/downloads> | Git 快照与回档机制失效；其他不受影响 |

**Windows 用户特别注意**：装 Git for Windows 时勾选"Git Bash Here"和"Add Git to PATH"。Claude Code 在 Windows 下的 hook command 默认通过 Git Bash 执行。

> **注意（user-skill 安装的关键前提）**：装好 Python/Bash 只是 hook 能"跑"的前提；**user-skill 安装下 frontmatter hooks 还不会被 Claude Code 自动注册**，必须按 §8 用 `tools/register-hooks.py` 显式注册（或装成 plugin）。不注册则全部 hook 不生效、降级为 Claude 手动遵守协议。本表"缺了核心 hook 不工作"指的是**注册之后**缺 Python/Bash 的情形。

---

## 3. 推荐依赖（缺了关键功能降级，但能用）

### 3.1 兄弟 skill（操作执行层）

EXECUTE 阶段的"操作执行层兄弟 skill 路由"表（见 `SKILL.md` 第 4 阶段）依赖这些 skill 真正执行编译/烧录/调试/通信。缺失时 Claude 只能给出"操作建议"，无法直接执行。

| 类别 | skill 列表 | 缺失时降级 |
|---|---|---|
| **构建** | `build-cmake` `build-keil` `build-iar` `build-platformio` `build-idf` `build-makefile` | Claude 给出命令但需用户手动跑 |
| **烧录** | `flash-openocd` `flash-keil` `flash-platformio` `flash-idf` `flash-jlink` | 同上 |
| **GDB 调试** | `debug-gdb-openocd` `debug-jlink` `debug-platformio` | 同上 |
| **串口/总线** | `serial-monitor` `modbus-debug` `can-debug` `visa-debug` | 同上 |
| **分析** | `memory-analysis` `rtos-debug` `static-analysis` | 同上 |
| **驱动适配** | `peripheral-driver` `stm32-hal-development` | 退回 Claude 手动按 `refs/driver-porting.md` 流程 |
| **流水线** | `workflow` | 用户分步调用各 skill |
| **代码质量** | `simplify`（Claude Code **内置 `/simplify` 命令**，无需安装，不在打包内） | REVIEW 阶段质量检查由 Claude 手动 |
| **外部协作** | `codex` | 失去 GPT 视角的"双模型擂台"能力 |

> **数量基准**：以 `hooks/verify-deps` 实际探测为准（避免数量在多个文档间漂移）。`bash hooks/verify-deps` 会输出"已装 N 个 / 未装 M 个"。打包随仓库的可安装 skill 为 **25 个**（上表去掉内置的 `simplify`）。

**安装方法（已随仓库打包，一条命令就位）**：这 25 个执行层 skill 现已 **vendor 进本仓库 `siblings/` 目录**。clone 完本仓库后跑一次安装脚本，即可把它们就位到 `~/.claude/skills/`——

> ⚠ **为什么必须跑脚本**：Claude Code 只在 `~/.claude/skills/<名字>/` 这一层发现 skill；嵌套在 `embedded-dev/siblings/` 里的副本不会被自动识别。安装脚本就是把它们从 `siblings/` 复制到发现层。

```powershell
# Windows (PowerShell)：预览加 -DryRun，更新已装的加 -Force
pwsh "$env:USERPROFILE\.claude\skills\embedded-dev\scripts\install-siblings.ps1"
```

```bash
# Linux / macOS / Git Bash：预览加 --dry-run，更新已装的加 --force
bash ~/.claude/skills/embedded-dev/scripts/install-siblings.sh
```

- 默认**跳过已存在**的同名 skill（不覆盖你本地可能更新的版本），`-Force` / `--force` 才覆盖。
- 装完**重启 Claude Code 会话**，这些 skill 才会被发现、并可被 EXECUTE 阶段路由调用。
- `grok-search` 是第三方 skill，**不在打包内**，见 §3.3 用真实仓库地址单独装。

> ⚠ 不跑安装脚本也能用：协议主流程、四文件记忆、分层规范全部正常，只是 EXECUTE 阶段的执行环节降级为"Claude 给命令、你手动跑"。研究/创新/计划/审查四阶段不受影响。

### 3.2 shared/ 工具（工程画像 + 工具路径管理）

| 文件 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| `~/.claude/skills/shared/project_detect.py` | RESEARCH 阶段自动探测构建系统/芯片/产物 | **已随仓库打包**，由 §3.1 的 `install-siblings` 脚本一并就位 | Claude 手动按文件包含/API 调用/项目结构识别（见 RESEARCH 步骤 2） |
| `~/.claude/skills/shared/tool_config.py` | OpenOCD/Keil UV4/arm-gcc/J-Link 工具路径登记 | 同上 | 兄弟 skill 自己探测工具路径，可能需要用户指定 |

> 这两个脚本是各操作执行层兄弟 skill 共享的契约层。`shared/` 已 vendor 进 `siblings/shared/`，跑 §3.1 安装脚本时会一起就位，无需单独操作。

### 3.3 grok-search（联网检索）

| 依赖 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| `~/.claude/skills/grok-search/` | 所有联网检索（驱动/报错/数据手册入口）首选工具 | 第三方 skill，单独 clone：`git clone https://github.com/Frankieli123/grok-skill ~/.claude/skills/grok-search`，再在 `config.json` 填 API key + base_url（如 `https://www.micuapi.ai/v1`） | 自动 fallback 到 Claude 内置 WebSearch / WebFetch |

### 3.4 Context7 MCP（库 API 即时文档）

| 依赖 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| Context7 MCP 服务器 | STM32/ESP-IDF/HAL 等库 API 即时文档；超出离线 refs 覆盖时使用 | `claude mcp add --transport http context7 https://mcp.context7.com/mcp` | 离线 refs 覆盖不到时降级到 grok-search 联网检索 |

### 3.5 gh CLI（GitHub 检索）

| 依赖 | 用途 | 安装方法 | 缺失时降级 |
|---|---|---|---|
| GitHub CLI `gh` | 检索 EmbedSummary 等开源驱动库 | <https://cli.github.com/> 后 `gh auth login` | grok-search + WebSearch site:github.com |

---

## 4. 可选依赖（特定场景才需要）

| 依赖 | 触发场景 | 安装方法 |
|---|---|---|
| **Sequential Thinking MCP** | 引脚冲突 / DMA 分配复杂推理 | `claude mcp add` 加入 |
| **Document Skills** (`pdf` / `docx` / `xlsx` / `pptx`) | 解析数据手册 PDF / 原理图 / 报告 | Anthropic 官方 plugin marketplace 提供；或单独安装 Office 类 skill |
| **agent-browser** | 在线数据手册页面交互、厂商 Web 配置器、截图留档 | 由 skill 提供方安装 |
| **Embedded Debugger MCP** | 硬件实时联调 / 烧录 / 串口交互的 MCP 接口 | 视厂商而定 |
| **Mermaid CLI** | 文档生成里的流程图渲染 | `npm i -g @mermaid-js/mermaid-cli` |

---

## 5. 平台特定注意事项

### Windows

- **Git Bash 必装**：所有 bash hook 通过它执行（`run-hook.cmd` polyglot 自动找）
- **路径分隔符**：Python hook 已自动处理 `/c/Users/` / `/cygdrive/c/` / `/mnt/c/` → `C:\` 规范化
- **Python 3 命令名**：建议用 `python`（Windows 标准）。`python3` 在 Windows 上经常指向 Windows Store stub（无实际 Python）— polyglot 会自动绕过
- **行尾符**：仓库已通过 `.gitattributes` 锁 LF；不要本地改 git autocrlf 配置

### 自定义安装路径（plugin / 企业目录）

默认 hook command 用 `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/embedded-dev}` 解析：
- **Plugin 安装**：Claude Code 自动设置 `CLAUDE_PLUGIN_ROOT`，无需手工配置
- **企业 / 自定义路径**（不在 `~/.claude/skills/`）：在 shell 启动文件加：
  ```bash
  export CLAUDE_PLUGIN_ROOT=/your/custom/path/embedded-dev   # Linux/macOS/Git Bash
  ```
  ```powershell
  $env:CLAUDE_PLUGIN_ROOT = "D:\custom\embedded-dev"          # PowerShell
  ```
- **路径不解析时 hooks 静默失效**（fail open），协议主流程仍由 Claude 手动遵守

### macOS

- **Python 3**：macOS 自带的 `python3` 通常够用，但建议装 `python@3.12` 保证版本一致
- **Bash 版本**：macOS 自带 bash 3.2（很旧），但 hook 脚本兼容；如需 bash 4+ 用 `brew install bash`

### Linux

- Python / Bash / Git 通常预装。重点是装 27 个兄弟 skill 和 grok-search
- 串口权限：`sudo usermod -a -G dialout $USER`（Debian/Ubuntu）

---

## 6. 验证最小可用集

clone 完成 + 装好 Python + Git Bash（Windows）即可启动以下功能：

✅ 立即可用（纯协议/知识库，不依赖 hook）：
- RIPER-5 五阶段协议（RESEARCH / INNOVATE / PLAN / EXECUTE / REVIEW 决策框架）
- 四文件磁盘记忆（项目规划清单/编辑清单/硬件资源表/研究发现）— Claude 按协议手动维护
- PLAN/EXECUTE 三件套（Iron Law + Red Flags + Rationalization Table）
- 嵌入式分层架构规范（HAL/BSP/Driver/Middleware/Service/App）
- 所有 `refs/*.md` 离线知识库（API 速查、引脚规划、IMU 检查、Mahony AHRS、故障排查等）
- 6 个扩展模式：1 个替代型（`competition`，启用比赛模式后替代 RIPER-5 流程）+ 5 个辅助型（`datasheet-lookup` / `gd32-board` / `netlist-lookup` / `seekfree-lib` / `mcp-healthcheck`）

⚠ 需先注册 hooks 才【自动】生效（**user-skill 安装默认不加载** frontmatter hooks，见 §8）：
- SessionStart 引导注入（首条响应前读 SKILL.md + 环境自检 + 四文件检测）
- PreToolUse `pre-write-check.py` 写前分层拦截（应用层 include 厂商头等违规即 exit 2 阻断）
- UserPromptSubmit 四文件提醒 / PostToolUse 改后更新提醒
- **不注册 = degraded**：以上自动化失效，但协议规则仍由 Claude 手动遵守，主流程不受影响

⚠ 跑过 `scripts/install-siblings.ps1`/`.sh`（把打包的执行层 skill 就位）后可用：
- 真正执行编译/烧录/调试/串口/总线/分析等操作
- 工程画像自动探测（`project_detect.py`，随 `shared/` 一并就位）

⚠ 装了对应 MCP/CLI 后可用：
- Context7 即时库文档
- gh CLI 仓库检索
- grok-search 联网搜索

---

## 7. 完全 minimal install（只用核心协议）

如果你只想用本 skill 的"研究方法论 + 分层架构规范 + 引脚规划检查 + 反自欺协议"，**只需要装 Python + Git Bash（Windows）+ clone 本仓库**。其他全部可以不装（连 `install-siblings` 都不用跑）。RESEARCH/INNOVATE/PLAN/REVIEW 四个阶段对外部依赖近乎为零；只有 EXECUTE 真正跑命令时才需要跑 `install-siblings` 就位执行层 skill。

---

## 8. 启用 hooks（user-skill 安装必读）★

**关键事实**：作为 user-level skill（`~/.claude/skills/embedded-dev`）安装时，SKILL.md frontmatter 里声明的 hooks **不会被 Claude Code 自动加载**——只有作为 **plugin** 安装时 frontmatter hooks 才会自动注册（见 `refs/hooks-design.md §注册方式`）。因此 §6 标注的"⚠ 需先注册"那组（SessionStart 引导、`pre-write-check` 写前拦截、四文件提醒）在默认 user-skill 安装下**不会自动生效**。这是 user-skill 安装方式的限制，不是 bug。

三种处理方式，任选其一：

**A. 显式注册到 settings.json（想要机械护栏就选这个）**

```bash
# 看会注册什么（安全，不写盘）
python ~/.claude/skills/embedded-dev/tools/register-hooks.py

# 项目级（推荐）：只对当前工程生效，侵入性最小
python ~/.claude/skills/embedded-dev/tools/register-hooks.py --write --target ./.claude/settings.json

# 或全局：所有会话都加载（注意 SessionStart 会给【所有】项目注入嵌入式引导）
python ~/.claude/skills/embedded-dev/tools/register-hooks.py --write
```

幂等（重复写不会重复）、自动备份 `.bak`、可 `--remove` 撤销。注册后**重启 Claude Code 会话**才生效。

**B. 作为 plugin 安装** —— frontmatter hooks 自动注册，无需手动；Claude Code 自动设置 `CLAUDE_PLUGIN_ROOT`。

**C. 接受 degraded 模式** —— 不注册也能用：协议主流程、四文件记忆、分层规范全部由 Claude 按规则手动遵守，只是失去 hook 的"机械提醒 + 写前预拦截"。此时**唯一的机械门禁**是 REVIEW/CP 阶段主动跑 `scripts/arch-check.sh` + `tools/include-graph.py`（需 Claude 自觉调用）。

> **验证 hooks 是否真生效**（注册并重启后）：① 新会话首条响应应自动出现 SessionStart 引导文本；② 故意让 Claude 往 app 层写一个 `#include "stm32f4xx.h"` 的文件，应被 `pre-write-check.py` 以 exit 2 拦截。两者都不发生 = hooks 未注册成功，回到方式 C。
