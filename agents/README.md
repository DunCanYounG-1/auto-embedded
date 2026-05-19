# Embedded-Dev 6 Subagents

> 比赛模式 v2 的 6 角色，按 [VoltAgent](https://github.com/VoltAgent/awesome-claude-code-subagents) 标准格式拆成 6 个可独立调用的 Claude Code subagent。
>
> 优势：每个 subagent 在独立 context 中跑，主线 [ARCH] 收紧凑回传，可并行派多个，主上下文不爆。
>
> **范围说明**：本 skill 只覆盖 控制 / 计算 / 底层驱动。视觉相关任务（含摄像头驱动 / 图像处理 / 模型部署 to KPU/NPU）由独立 `auto-vison` skill 承担。

---

## 安装方式

### 方式 1：本机全局（推荐 — Claude Code 立即识别）

把 7 个 .md 文件复制 / 软链到 `~/.claude/agents/`：

```bash
# Windows (Git Bash)
mkdir -p "$HOME/.claude/agents"
cp "$HOME/.claude/skills/embedded-dev/agents/embedded-"*.md "$HOME/.claude/agents/"

# 或软链（推荐，源文件改动自动同步）
ln -sf "$HOME/.claude/skills/embedded-dev/agents/embedded-arch.md" "$HOME/.claude/agents/"
# 重复其他 5 个
```

### 方式 2：项目本地

```bash
# 在你的工程目录下
mkdir -p .claude/agents
cp "$HOME/.claude/skills/embedded-dev/agents/embedded-"*.md .claude/agents/
```

### 方式 3：不安装

如果不想正式注册到 Claude Code，可以直接当作"prompt 模板"用：在 Claude Code 里用 Agent 工具时 `subagent_type=general-purpose`，prompt 复制对应 .md 文件的内容。

---

## 🔍 验装：如何确认 subagent 注册成功 ★v2.1

**问题**：如果 `~/.claude/agents/` 没装好，`Task(subagent_type="embedded-arch")` 会**静默回退** `general-purpose`，看起来能跑但 Outcome/Ticket 规约失效。必须主动验证。

### 验证步骤 1：文件存在

```bash
# Git Bash / WSL
ls ~/.claude/agents/embedded-*.md
# 应看到 6 个：arch / drv / alg / qa / matlab / report
```

预期输出：
```
embedded-alg.md
embedded-arch.md
embedded-drv.md
embedded-matlab.md
embedded-qa.md
embedded-report.md
```

少任何一个 → 重跑方式 1 的 cp 命令。

### 验证步骤 2：Claude Code 识别（人工肉眼检查）

⚠️ **Claude Code 不提供"列出 subagent"的程序化命令**，本步骤是**人工交互验收**：

启动新 Claude Code 会话后，输入：

```
什么是 embedded-arch subagent？
```

观察 Claude 的回答：

- ✅ 通过：回答提到"我可以通过 Task 工具派发 subagent_type=embedded-arch"，或直接引用 `agents/embedded-arch.md` 描述
- ❌ 失败：回答说"没有这个 subagent"、"我不清楚"，或泛泛而谈嵌入式架构师
- ⚠️ 不确定：Claude 编造内容（自动假定存在但内容与 `agents/embedded-arch.md` 不符）

**注意**：这种"问 Claude"的方式**不是机器可保证的**，只能提高把握度。最终判定要看步骤 3+4 的 dry-run 实际产出。

### 验证步骤 3：dry-run 调用（强制 JSON 严格输出）

```
请用 Task(subagent_type="embedded-arch", description="identity check",
       prompt='只输出严格 JSON 三键，多余文本/markdown 即视为失败:
       {"agent_id":"<你的 subagent_type 字符串>",
        "model":"<frontmatter 的 model 字段>",
        "writes_role_file":"<true 或 false，你是否产出 编辑清单_<ROLE>.md>"}')
```

期望严格返回（精确这 3 键，不多不少，无 markdown 包装）：

```json
{"agent_id":"embedded-arch","model":"opus","writes_role_file":"false"}
```

**失败特征（静默回退 general-purpose）**：
- 返回有任何 markdown 包装 / 寒暄 / 说明文字 → 不是真正的 embedded-arch
- `agent_id` 不是 `embedded-arch`
- `model` 不是 `opus`
- `writes_role_file` 不是 `false`（ARCH 不写子清单，仅合并主清单 — 见 `refs/contracts.md §Agent 命名三层概念`）

任一特征出现 → subagent 未注册或被 general-purpose 拦截，立即排查 `~/.claude/agents/` 路径。

> 对其他 5 个 subagent（drv/alg/qa/matlab/report），`writes_role_file` 应为 `true`，`model` 视 frontmatter 而定。可批量验装。

### 验证步骤 4：Outcome schema 一致

派任意一个 subagent 跑最小任务，检查回传 Outcome 是否含 `refs/contracts.md §Command Outcome Schema` 必填字段（status / owner_agent / trace_id / summary / artifact_paths / next_action）。缺字段 = 装错或回退。

---

## 6 个 Subagent 速查

| Subagent | 用途 | 何时派 | 默认模型 |
|---|---|---|---|
| `embedded-arch` | 主控 / 路由 / 决策门 / 集成 | 任何竞赛题（必派）| opus |
| `embedded-drv` | 全部外设驱动（GPIO/UART/SPI/I2C/ADC/RTC/DMA/PWM）| 任何题（必派）| sonnet |
| `embedded-alg` | 应用层算法 / CLI / 状态机 / 编解码 | 任何题（必派）| sonnet |
| `embedded-qa` | 静态检查 / MIL/SIL/PIL / 5 元组验收 | 任何题（必派）| sonnet |
| `embedded-report` | 报告 / 答辩 why-evidence | 任何题（必派）| sonnet |
| `embedded-matlab` | 算法仿真 / `.h` 导出 | MAIN ≠ SYSTEM 或 SYSTEM 含 FFT/RF 标签 | opus |

最少 4 必派（ARCH/DRV/ALG/QA），最多 6 全派。按 `refs/competition-task-router.md` §2 决定。

**视觉任务外派**：含摄像头/赛道识别/目标追踪的题目，由独立 `auto-vison` skill 承担。通过 Skill Handoff Contract 调用，产物（`.h` / `.kmodel` / `.rknn`）由本 skill 的 `embedded-alg` 消费。

---

## 用法示例

### 示例 1：派单个 Agent

```python
# Claude Code 主线里
Task(
    subagent_type="embedded-matlab",
    description="LQR 设计 + 仿真",
    prompt="""
    硬件：STM32F407 + IMU MPU6050
    任务：为两轮平衡车设计 4 状态 LQR。
    系统：x = [θ, θ̇, x, ẋ]，控制 u = 力矩
    指标：闭环带宽 5 Hz，超调 < 15%
    交付：lqr_gains.h（用 export_gains_to_c.py 导出）
    """
)
```

### 示例 2：N-Agent 并行（同一消息派多个）

```python
# 一条消息里同时派 5 个 Agent
派 Task(subagent_type="embedded-matlab", prompt=<MATLAB任务>)
派 Task(subagent_type="embedded-drv", prompt=<DRV任务>)
派 Task(subagent_type="embedded-alg", prompt=<ALG任务>)
派 Task(subagent_type="embedded-qa", prompt=<QA任务>)
派 Task(subagent_type="embedded-report", prompt=<REPORT任务>)
```

5 个 Agent 各自独立 context 跑，主线收齐紧凑回传后做决策门。

---

## 与 SKILL.md 协作

`refs/competition-ai-max-workflow.md` 的 Agent prompt 模板**仍然有效**（描述各 Agent 该干什么）。安装本目录后，你可以**直接用 subagent_type 调用**，不用每次手贴 prompt：

| 旧方式（手贴 prompt）| 新方式（subagent_type）|
|---|---|
| `Task(subagent_type=general-purpose, prompt=贴 §2.2 模板)` | `Task(subagent_type=embedded-matlab, prompt=具体任务)` |

新方式优势：
- prompt 模板封装在 .md 文件里，调用方只传具体任务
- 独立 context = 主线压力小
- VoltAgent 标准格式 = 可复用 / 可贡献回社区

---

## 卸载

```bash
rm -f "$HOME/.claude/agents/embedded-"*.md
```

不影响 `~/.claude/skills/embedded-dev/agents/` 源文件。

---

## 关联资源

- **主流程**：`modes/competition.md`
- **快速通道**：`refs/competition-quickstart-1page.md`
- **题型路由**：`refs/competition-task-router.md`
- **完整 prompt 模板**：`refs/competition-ai-max-workflow.md`
- **5 元组验收**：`refs/competition-scoring-checklist-template.md`
- **VoltAgent 仓库**（参考标准）：https://github.com/VoltAgent/awesome-claude-code-subagents
