# Hooks 设计文档

> SKILL.md frontmatter 注册了 4 个 hook 事件；它们的实现细节、跨平台兼容性、fail-open 哲学全部下沉到本文。

---

## 入口与分流

所有 hook command 都**显式以 `bash` 前缀**调用入口 `hooks/run-hook.cmd`：

```
bash "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/embedded-dev}/hooks/run-hook.cmd" <script-name>
```

`bash` 前缀是关键：无论宿主 shell 是 bash / cmd.exe / PowerShell，执行的程序都是 `bash`，`.cmd` 只作为参数传给 bash 读取——cmd.exe 永远不会直接解析文件内容。因此 `run-hook.cmd` 是一个**纯 bash 脚本**（沿用 `.cmd` 文件名仅因现有配置引用该路径），**不是** cmd/bash polyglot。

> 为什么不做 polyglot：文件被 `.gitattributes` 锁 LF（bash/shebang 必需），而 LF-only 的 `.cmd` 无法被 cmd.exe 可靠执行（goto/label 解析失效，甚至会启动交互式 cmd 卡死 hook）。两者根本冲突，故弃 polyglot、统一走 bash 前缀。

`run-hook.cmd` 按脚本扩展名分流：

| 脚本扩展名 | 调用 | fail-open |
|---|---|---|
| `.py` | python / python3（先 python 避开 Windows Store stub） | 文件不存在 / 无真实解释器 → exit 0 |
| 无扩展名 | bash（Linux/macOS 原生 / Windows 用 Git Bash） | 文件不存在 / 无 bash → exit 0 |

> **`.py` 分支的文件存在性检查至关重要**：`exec python <缺失文件>` 会 exit 非零，而 PreToolUse hook 的非零退出会**阻断工具调用**（如 `pre-write-check.py` 一旦缺失就会卡住所有 Write）。dispatcher 在 exec 前先 `[ -f ]` 检查，缺失即 fail-open。

> **注册方式**：本 skill 作为 user-level skill（`~/.claude/skills/`）安装时，SKILL.md frontmatter 的 hooks **不会被 Claude Code 自动加载**（只有 plugin 的 frontmatter hooks 才会）。必须把这 6 条 hook 手动写入 `~/.claude/settings.json` 的 `hooks` 块才能生效。作为 plugin 安装时则自动注册。

---

## 注册的 hook（4 个事件 / 6 条实现）

| Hook 事件 | 脚本 | 语言 | 作用 |
|---|---|---|---|
| `SessionStart` (matcher: startup\|clear\|compact) | `session-start.py` | Python | 注入协议引导（索引模式）：要求 Claude 首条响应前读 SKILL.md + 跑环境自检 + 检测四文件 |
| `UserPromptSubmit` | `check-memory-files` | Bash | 检测中英双轨四文件存在性，存在则提醒 Claude 读取 |
| `PreToolUse` (matcher: Write\|Edit\|MultiEdit) | `pre-write-check.py` | Python | 分层合规拦截（应用层 #include 厂商 HAL 等违规 → exit 2 阻断写入）|
| `PreToolUse` (matcher: Write\|Edit\|MultiEdit) | `inject-context` | Bash | 注入 plan / hw-resources / findings 关键段片段（与 pre-write-check 同事件叠加）|
| `PreToolUse` (matcher: Bash) | `inject-context` | Bash | Bash 工具调用前仅注入上下文，不做合规拦截 |
| `PostToolUse` (matcher: Write\|Edit\|Bash) | `remind-update` | Bash | 提醒 Claude 改完后更新 edits.md / hw-resources.md / findings.md |

---

## 路径自适应（plugin / 自定义安装）

hook command 中的 `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/embedded-dev}`：

- **默认**：user-level skill 路径 `~/.claude/skills/embedded-dev/`
- **Plugin 安装**：Claude Code 自动设置 `CLAUDE_PLUGIN_ROOT`，无需手工配置
- **企业 / 自定义路径**：在 shell 启动文件 export 即可：
  ```bash
  # Linux / macOS / Git Bash
  export CLAUDE_PLUGIN_ROOT=/your/custom/path/embedded-dev
  ```
  ```powershell
  # PowerShell
  $env:CLAUDE_PLUGIN_ROOT = "D:\custom\embedded-dev"
  ```
- 路径不解析时 hooks 静默失效（fail open），协议主流程仍由 Claude 手动遵守

---

## Fail-Open 哲学

任何 hook 失败都**不能阻塞协议主流程**。具体表现：

| 失败场景 | 行为 |
|---|---|
| Python / bash 都不可用 | `run-hook.cmd` 静默 `exit 0` |
| 脚本文件不存在 | 入口前 `[ -f ]` 检查，缺则 `exit 0` |
| 脚本执行抛异常 | Python 用 `try/except`、bash 用 `set +e`，最终都 `exit 0` |
| hook command 字符串解析错（cmd 不展开 `${...}`） | 路径变字面量，bash 找不到文件，最终 `exit 0` |
| `run-hook.cmd` 缺脚本名参数 | 错误诊断写 stderr，但 `exit 0` 不阻塞 |

**任何阻塞用户的 hook 行为都是 bug，应该立即修复**。

---

## 启动自检指令

Claude 在收到首个用户消息后，**RESEARCH 阶段首条响应里**通过 Bash 工具运行一次：

```bash
test -e /dev/null && echo "[embedded-dev] hooks env: ok" \
                  || echo "[embedded-dev] hooks env: degraded"
```

- 输出 `ok`：hooks 链可用，按协议运行
- 输出 `degraded`（PowerShell/cmd 无 POSIX 工具或 Python/bash 都缺）：向用户报告，hooks 不工作但**协议规则仍由 Claude 手动遵守**
- 同一会话只跑一次，不要每轮重复
- **不要**在收到用户消息之前主动执行命令；SessionStart hook 注入的引导只是规则告知，不是执行触发

---

## 验证脚本

`hooks/verify-deps` 一键自检全部依赖：

```bash
bash ~/.claude/skills/embedded-dev/hooks/verify-deps
```

输出必装/推荐/可选三级状态，不在乎缺失项不影响其他功能。详见 INSTALL.md §0。

---

## 扩展规则

新增 hook 时遵守：
1. **新脚本放 `hooks/` 目录**，扩展名 `.py`（复杂逻辑）或无扩展（简单 bash）
2. **command 始终以 `bash run-hook.cmd <script>` 调用**（带 bash 前缀），不要直接调脚本——由 dispatcher 统一处理解释器探测与 fail-open
3. **fail-open 必须遵守**：脚本顶部 `set +e`（bash）或顶层 `try/except: pass`（Python），任何路径退出码必须是 0
4. **`.gitattributes` 锁 LF** 防止 Windows 上 CRLF 让 shebang `+ \r` 失败
5. **`git update-index --chmod=+x`** 让 git 索引记录可执行位
6. **更新 `hooks/verify-deps`** 添加新 hook 的自检
