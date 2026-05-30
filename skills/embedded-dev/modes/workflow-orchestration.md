# 原生 Workflow 编排模式（确定性骨架 + 自驱叶子）

> 触发词：`Workflow 编排` / `原生工作流` / `确定性编排` / `workflow 接管` / `用 Workflow 跑比赛模式`
>
> 定位：把本 skill **已有的多 Agent 流程**（比赛模式 v2 的 CP 门禁 / 长任务 Scout-Builder-Verifier）从「靠主线 Claude 每轮自觉遵守」升级为「用 Opus 原生 `Workflow` 工具确定性执行」。**不替代 RIPER-5，也不替代 `modes/competition.md`**——它是这两者的**执行后端（execution backend）**，可选启用。
>
> 这是一个 **辅助型扩展模式**：在 EXECUTE / 比赛模式的执行段随时可切到 Workflow 编排，跑完把结果交回主线继续。

---

## 0. 一句话：两个功能在本 skill 里各管什么

Anthropic《Building Effective Agents》把 agentic 系统分两类，本 skill 同时用上：

| 概念 | 是什么 | 在本 skill 的落点 |
|---|---|---|
| **Workflow（确定性编排）** | 控制流**预先用代码写死**（循环 / 条件 / fan-out / 门禁），每次跑法一致、可预测、可复现 | CP 门禁推进、CP 内并行派发、Outcome 收齐、重试预算、缺陷回派环 —— 即 `tools/competition-workflow.js` |
| **Goal / Agent（自主目标自驱）** | 给一个**高层目标**，模型**自己**决定步骤、动态调用工具，灵活但不可预测 | ① 主线 ARCH（读题/路由/裁决/集成）；② 每个叶子 subagent（DRV/ALG/QA…）内部「怎么实现」；③ 所有 `blocked` 人工裁决点 |

**配合心法（一句话）**：
> **Workflow 管「骨架与门禁」，Goal/Agent 管「判断与实现」。** 能写死的控制流交给 Workflow（消除漂移），需要判断/交互/创造的留给 Agent（保留灵活）。

```
        ┌─────────────────────── 主线 ARCH = Goal/Agent（自驱，全程在线，可问用户）────────────────────────┐
        │  CP-0a 建目录+git init   CP-0b 读题路由   CP-1 三表+接口契约      [人工裁决]      git tag/push   │
        │         │                    │                │                     ▲                  ▲        │
        │         └────────────────────┴────────────────┴──── 发起 ──┐        │ blocked 回主线   │        │
        └──────────────────────────────────────────────────────────│────────┼──────────────────┼────────┘
                                                                     ▼        │                  │
                  ┌─────────────── Workflow（确定性骨架）tools/competition-workflow.js ───────────┐
                  │  CP-1.5 仿真门 ──gate──▶ CP-2 并行实现 ──barrier──▶ CP-3 QA+回派环 ──▶ CP-4 集成 │
                  │     │ MATLAB(自驱)          │ DRV/ALG/REPORT          │ QA→fix→QA(自驱叶子)      │
                  └─────┴───────────────────────┴─────────────────────────┴──────── return result ──┘
```

---

## 1. 能力映射表（原生 Workflow 原语 ↔ 本 skill 既有构造）

这是「为什么 Workflow 几乎是为本 skill 量身定做」的逐条对照：

| 原生 Workflow 原语 | 本 skill 既有构造 | 收益 |
|---|---|---|
| `phase('CP-1.5')` | CP-0a…CP-5 检查点 | 进度分组与门禁阶段一一对应 |
| `pipeline(items, s1, s2)` | CP 之间「每题独立流水」（无屏障） | 多题/多模块场景吞吐拉满 |
| `parallel([...])`（屏障） | 「同一条消息派 N 个 subagent」+ ARCH 收齐才过门 | **保证**收齐，不再靠模型记得等 |
| `agent(p, {agentType:'embedded-drv'})` | `Task(subagent_type="embedded-drv")` | 直接复用已装的 6 个 subagent |
| `agent(p, {schema: OUTCOME_SCHEMA})` | Command Outcome Schema（refs/contracts.md） | **工具层强制**结构化，消灭「漏字段/忘返回 YAML」 |
| `while(used < budget)` + `Map` | `root_cause_id` 全局重试预算 `min(category,severity)` | 计数**确定性**，不靠模型心算、不会跨 Agent 漂移重置 |
| 缺陷修复 `while` 循环 + 排序 | Defect Ticket 回派 + 多 Ticket 排序规则 | 排序/回派规则写死，ARCH 不再手工调度 |
| 对抗式 verify（多 skeptic 投票） | QA 门 + C/D 类红线 | QA 可升级为多视角投票（correctness/realtime/safety） |
| `isolation:'worktree'` | 「同一时刻只允许一个 Builder 写入」单写者规则 | 需要真并行写时用 worktree 隔离（默认靠文件归属互斥免开） |
| 门禁谓词（纯 JS `if`） | CP 门禁表通过条件 | 通过条件代码化，杜绝「差不多就过」 |
| `budget`（token 目标） | retry/时间预算 | 可按 `+Nk` 目标动态决定派几个 finder |
| `return {blocked}` + `resumeFromRunId` | `status=blocked` → 人工裁决 | 见下方 §3 的硬边界 |

> **说明**：本表是「原生 Workflow 原语 ↔ 本 skill 概念」的对应。`tools/competition-workflow.js` 现已用上 `agent` / `parallel` / `pipeline` / `phase` / `log` / `args` / `budget` 七个原语——`pipeline()` 落在 CP-2 的「子系统流水」模式（`cp2_mode:"pipeline"`），`budget` 落在 CP-3「QA 视角数按 token 目标伸缩」（详见 §2.3）。⚠️ `budget`（token 预算）与脚本里的 `retry_budget`（重试**次数**预算 `min(category,severity)`）是两码事，勿混淆。

---

## 2. 直接落地：怎么用

### 2.1 比赛模式接 Workflow（主线 ARCH 视角）

前置（仍是 Goal/Agent 自驱，**不进 Workflow**）：ARCH 跑完 CP-0a（建目录 + git init）、CP-0b（`refs/competition-task-router.md` 路由出 MAIN+TAGS+派哪些 Agent）、CP-1（三表 + 接口契约冻结 + `arch-check.sh --hw-check` 过）。

然后把执行段交给 Workflow：

```js
Workflow({
  scriptPath: "C:\\Users\\A\\.claude\\skills\\embedded-dev\\tools\\competition-workflow.js",
  args: {
    trace_id: "comp-2026-001",
    current_time: "2026-05-29T09:00:00+08:00",   // 脚本内无 Date()，主线传入
    workspace_root: "C:\\path\\to\\2022F-am-meter",
    routing: {
      main: "CONTROL", tags: ["MOTOR","IMU","OLED"],
      agents: ["DRV","ALG","QA","REPORT","MATLAB"],
      run_cp15: true, run_cp4: true, skip_pil: false, isolate_writes: false
    },
    interface_contract: "<架构设计.md 冻结的接口契约文本>",
    hw_resource_path: "硬件资源表.md",
    indicators: [ { key:"THD", op:"<=", target:-50, unit:"dB" },
                  { key:"测量精度", op:"<=", target:1, unit:"%" } ],
    human_decisions: {}   // 首跑留空；续跑时回填，如 {"CP-1.5":"接受降级为 PID"}（见 §3）
  }
})
```

脚本返回后，**主线 ARCH 据 `result` 决策 + 回盘四文件**（Workflow 只产代码/数据文件与结构化 `result`，记忆与副作用一律由 ARCH 落盘）：

1. `result.retry_table` → 合并进 `项目规划清单.md` 的 `competition_state.retry_table`（按 `root_cause_id` 对齐、取累计值）。
2. `result.passed_cps` → 写 `competition_state.passed_cps`，并按 `refs/contracts.md` 的 git tag 表逐个打 tag（CP-1.5→`v0.15-sim`、CP-2→`v0.2-dev` …）。
3. `result.defects` → 写 `competition_state.defect_queue` + 把各 `编辑清单_<ROLE>.md` 合并进主 `编辑清单.md`（删临时子清单）。
4. `result.blocked !== null` → 进入 §3 人工裁决 + 续跑；若 reason 是「预算用尽」类，按契约把根因写入 `研究发现.md`。
5. `result.cp4_qa.hardware_steps_pending` → 编译/烧录/PIL 由人工 + `build-*`/`flash-*`/`serial-monitor` 兄弟 skill 完成。

**SYSTEM / 工业集成题（跳 CP-1.5、不派 MATLAB）的 routing**——别照抄上面的 CONTROL 示例，否则会给集成题派 MATLAB 空转（踩 `competition.md` §工业系统集成题分支红线）：

```js
routing: {
  main: "SYSTEM", tags: ["CLI","FATFS","OLED"],
  agents: ["DRV","ALG","QA","REPORT"],          // 不含 MATLAB
  run_cp15: false, run_cp4: true, skip_pil: true, isolate_writes: false
}
// 规则：MAIN=SYSTEM 且 TAGS 无算法 → run_cp15:false 且 agents 不含 MATLAB（脚本会正确跳过 CP-1.5）。
// 若误填 run_cp15:true 却不派 MATLAB，脚本会 return blocked 报「路由不一致」，而非静默空转。
```

### 2.2 调用约定

- **subagent 必须已装**：`agentType:'embedded-drv'` 等从 `~/.claude/agents/` 解析（`agents/README.md` §安装）。未装则 `agent()` 回退默认 workflow subagent——此时 `schema` 仍强制结构化输出，但角色专属行为丢失，**建议先验装**（`agents/README.md` §验装步骤 3）。
- **同一条消息只发一次 Workflow**：脚本内部用 `parallel()` 完成 CP 内 fan-out，不要在主线再手工并行派 Task。
- **迭代脚本**：改 `tools/competition-workflow.js` 后，`Workflow({scriptPath, resumeFromRunId})` 会命中最长未改前缀缓存，只重跑改动点及之后。

### 2.3 两个进阶原语（pipeline 子系统流水 / budget 多视角 QA）

**① `cp2_mode:"pipeline"` — CP-2 按子系统独立流水**（适合工业 SYSTEM 题的多个相对独立子系统，如 DAQ 的采集/CLI/存储/OLED…）：

```js
routing: {
  main: "SYSTEM", tags: ["DAQ","CLI","FATFS"],
  agents: ["DRV","ALG","QA","REPORT"], run_cp15: false, run_cp4: true,
  cp2_mode: "pipeline",
  subsystems: [
    { name:"采集", owner:"embedded-drv", spec:"ADC+DMA 多通道 1kHz" },
    { name:"存储", owner:"embedded-drv", spec:"SPI Flash + FATFS" },
    { name:"CLI",  owner:"embedded-alg", spec:"串口命令解析 + sysFunction" },
    { name:"OLED", owner:"embedded-alg", spec:"I2C 1306 刷新" }
  ]
}
```

- 每个子系统独立穿过 `实现 → 单元自检` 两 stage，**无阶段屏障**：「采集」在自检时「CLI」可能还在实现，墙钟 ≈ 最慢单条链而非总和。
- 文件归属天然互斥（每子系统写自己的 .c/.h），免并发写冲突。
- **取舍（诚实）**：pipeline 模式换吞吐、放弃 role 模式的 `runWithRetry` 自动重试；某子系统 `实现/自检` 失败 → 作为 `blocked` 上报主线 ARCH（不在脚本内重试）。CP-2 之后仍走 CP-3 全量 QA 屏障兜底。
- 不填 `cp2_mode` 或填 `"role"` → 默认 DRV/ALG/REPORT 并行（带重试），适合算法/控制类题。

**② `budget` — CP-3 QA 视角数随 token 目标伸缩**（无需额外 args，脚本读全局 `budget`）：

- 用户**未设** token 目标 → CP-3 单 QA（`QA:CP-3#0`），行为同前。
- 用户**设了**（如 `+500k`）→ 按 CP-3 时的**剩余预算**每 ~120k 加一镜头、封顶 3，自动并行跑 `correctness / realtime / safety` 三视角 QA，tickets 按 `root_cause_id` **去重合并**（正是「perspective-diverse verify」质量模式，分别对上验收表 A-E / H / I+J 类）。
- 视角数在 CP-3 入口 `qaLensCount()` 算一次，修复轮复测沿用，保证一致。
- ⚠️ 这是 **token 预算**驱动的验证深度，与 `retry_budget`（重试次数）无关。

---

## 3. 硬边界（必须知道，否则会踩坑）★诚实声明

| 边界 | 原因 | 落地处理 |
|---|---|---|
| **Workflow 运行中不能问用户** | 工具设计如此 | 任何 `status=blocked`/`human_decision_required` 一律 `return` 给主线 ARCH；ARCH 用 `AskUserQuestion` 拿决策，再 `Workflow({scriptPath, resumeFromRunId, args:{..., human_decisions:{...}}})` 续跑（旧 agent 调用走缓存秒回，从分叉点继续） |
| **硬件在环不进 Workflow** | flash/serial/PIL 需真实硬件，不适合无人值守 | QA 在脚本内只做软件侧（arch-check/include-graph/静态/MIL），硬件步骤写进 `hardware_steps_pending` 返回 |
| **副作用留主线** | git commit/tag/push 是不可逆外部动作 | 脚本只产代码/数据文件；tag 与 push 由 ARCH 在门后做 |
| **CP-3 门禁靠子代理自报** | Workflow 不能自己跑 bash，`arch-check`/`include-graph` 由 QA 子代理执行 | 已强制 QA 把真实 exit code 写进 `result.qa.evidence`；ARCH **应核对这些 exit 行、或在门后亲自复跑一次 `arch-check.sh`** 再打 tag，别盲信 verdict（审查实证：子代理幻觉 "exit 0" 即可骗过门禁）|
| **并行写冲突** | `parallel()` 同时写文件会撞 | 靠文件归属互斥（DRV→drivers/、ALG→app/、REPORT→docs/）；无法互斥时 `routing.isolate_writes=true` 给 worktree 隔离（但跨 worktree 合并 C 工程成本高） |
| **嵌套一层** | `workflow()` 里再调 `workflow()` 抛错 | CP 级脚本别再起子 Workflow；要分层就主线串多个 Workflow |
| **无 `Date.now`/`Math.random`** | 会破坏 resume | 脚本本身不产时间戳：`args.current_time` 由主线传入、trace_id 由主线给；`ticket.created_at` 由 QA 子 agent 填，其可复现性取决于子 agent 环境，排序对此为 best-effort（同优先级回退字符串比较） |
| **重试计数为运行内镜像** | `parallel` 下交错增量略有偏差 | 权威账本仍是 `项目规划清单.md` 的 `competition_state.retry_table`；脚本通过 `result.retry_table` 出口把镜像交回，ARCH 合并写回 |
| **hooks 仍生效（需验证）** | Workflow 派的也是 Claude Code subagent | 写文件**预期**仍触发 `PreToolUse: pre-write-check.py` 分层预拦截。**30 秒验证法**：派一个 DRV 子 agent 故意往 `app/` 写文件（越界，应被分层规则挡）；被拒/有 hook 日志=触发，顺利写入=未触发。**未触发**则把 CP-2 越界写改回主线串行兜底，REVIEW 阶段 `arch-check.sh` 仍是唯一硬门禁 |

> **续跑（resume）操作细节**：
> - `resumeFromRunId` = **首跑 Workflow 工具返回里的 `Run ID`**（形如 `wf_xxx`），不是脚本 `result` 的字段。
> - `human_decisions[cp]` 的文本会拼进对应 CP（CP-1.5/CP-2/CP-3/CP-4 均支持）的 prompt 作为**人工裁决提示**，但它**不改变控制流**（不会让某 CP 跳过）。
> - 要让某 CP「跳过/改道」，靠**改 `args`**（如把指标降级、`run_cp15:false`、缩小 `agents`）后带 `resumeFromRunId` 重发——未改动的 `agent()` 调用走缓存秒回，从分叉点续跑。

---

## 4. 通用长任务（非比赛）：Scout → Builder → Verifier 接 Workflow

`refs/vibe-workflow.md` 的三角色同样能确定性化。**已抽成独立可运行脚本 `tools/vibe-workflow.js`**（参数化 `goal`/`builder_agent`/`scout_agent`，带 blocked-return 与 null 守卫）——直接 `Workflow({ scriptPath:"...\\tools\\vibe-workflow.js", args:{ goal:"<本轮目标>" } })` 即可。下面是其核心骨架（仅说明用）：

```js
export const meta = {
  name: 'embedded-vibe', description: 'Scout→Builder→Verifier 确定性长任务壳',
  phases: [ {title:'Scout'}, {title:'Build'}, {title:'Verify'} ],
}
const OUT = { type:'object', required:['status','summary','evidence','artifact_paths','next_action'],
  properties:{ status:{enum:['success','partial_success','blocked','failure']}, summary:{type:'string'},
    evidence:{type:'array',items:{type:'string'}}, artifact_paths:{type:'array',items:{type:'string'}},
    next_action:{type:'string'}, risks:{type:'array',items:{type:'string'}} } }

phase('Scout')   // 只读：收集证据/约束/候选文件/最小改动范围
const scout = await agent(`${args.goal}\n你是 Scout，只读不写：给候选文件(按优先级)、既有模式、已确认约束(芯片/库/引脚/时钟/DMA/中断)、建议最小改动范围。`,
  { agentType:'Explore', schema:OUT, phase:'Scout' })
if (scout.status === 'blocked') return { blocked: scout }   // 交主线问用户

phase('Build')   // 单写者：只做最小实现
const build = await agent(`${args.goal}\n你是 Builder，按 Scout 证据做最小实现：\n${scout.summary}\n候选文件:${scout.artifact_paths.join(', ')}\n给 3-7 步计划 + 实际改动 + 实跑的编译/测试结果 + 偏差说明。`,
  { agentType:'embedded-alg', schema:OUT, phase:'Build' })

phase('Verify')  // 只读：对抗式审查，默认怀疑
const verify = await agent(`你是 Verifier，只审不补：针对下列改动找风险/未覆盖边界/逐项审查结论，不确定时倾向 FAIL。\n改动:${build.artifact_paths.join(', ')}\n证据:${build.evidence.join('; ')}`,
  { agentType:'embedded-qa', schema:OUT, phase:'Verify' })
return { scout, build, verify }
```

> 说明：`agentType:'Explore'` 用宿主内置的只读探索 agent（**本 skill 不保证它存在**；缺失时改用 `embedded-qa` 并在 prompt 里强制「只读」）；Builder 此处举例用 `embedded-alg`，**实际按任务在 `embedded-drv/alg/arch` 间择一**。**只读保证主要靠 prompt 约束，不靠 agentType。** 单写者规则在此天然满足：同阶段只有一个 Builder 写；需要并行多 Builder 时改用 `pipeline()` + 文件归属互斥或 `isolation:'worktree'`。

---

## 5. 何时用 / 何时不用 Workflow（决策表）

| 场景 | 用 Workflow？ | 理由 |
|---|---|---|
| 比赛模式 CP-1.5→CP-4 执行段 | ✅ 强烈推荐 | 门禁/并行/重试/回派全是确定性控制流，最易漂移，收益最大 |
| 跨 ≥2 文件、≥2 轮迭代的长任务 | ✅ 推荐 | Scout/Builder/Verifier 确定性化，可复现可回退 |
| RESEARCH / INNOVATE 探索 | ❌ 不必 | 需要判断与发散，是 Goal/Agent 的强项，写死控制流反而束缚 |
| 单文件小改 / 纯问答 | ❌ 不必 | 杀鸡用牛刀，奥卡姆剃刀 |
| 需要中途反复问用户的流程 | ⚠️ 拆开 | Workflow 不能问用户；按 §3 切成「Workflow 段 + 主线裁决」交替 |
| 硬件在环调试（flash/PIL/示波器） | ❌ 主线做 | 需真实硬件与人工观察 |
| 三人极简（Mini）模式 | ⚠️ 默认不接 | 队员不熟工具 + 阶段已压缩（奥卡姆剃刀）；如要用，只借 CP-2 并行段且 `skip_pil:true`，tag 按 Mini 的 `v0..v3` 命名由主线打、`arch-check` 降级由主线控制（脚本无开关）|

---

## 6. 关联资源

- **确定性脚本（本模式核心产物）**：`tools/competition-workflow.js`
- **比赛脚本离线自测**：`tools/competition-workflow.test.js`（`node tools/competition-workflow.test.js` 跑一遍，mock 掉所有 agent，验证 CP 门禁 / 重试预算 / 回派环 / low 不阻断 / pipeline / budget 等 12 个控制流场景；不联网不烧 token）
- **通用长任务脚本**：`tools/vibe-workflow.js`（Scout→Builder→Verifier）
- **比赛模式主流程**：`modes/competition.md`
- **6 Agent prompt 模板 / 自动决策门**：`refs/competition-ai-max-workflow.md`
- **Command Outcome / Defect Ticket / 预算公式 / 状态机**：`refs/contracts.md`
- **失败 8 类**：`refs/failure-taxonomy.md`
- **长任务三角色**：`refs/vibe-workflow.md`
- **题型路由**：`refs/competition-task-router.md`
- **subagent 安装 / 验装**：`agents/README.md`
