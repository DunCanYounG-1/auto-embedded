// ============================================================================
// competition-workflow.js — 比赛模式 v2 的「确定性编排骨架」(Opus 原生 Workflow)
// ============================================================================
//
// 定位：把 modes/competition.md 里「靠主线 ARCH 每轮自觉遵守」的那段机械流程
//       (CP-1.5 仿真门 → CP-2 并行实现 → CP-3 QA+缺陷回派环 → CP-4 集成)
//       改写成原生 Workflow 工具能执行的「确定性控制流」(deterministic)，
//       而每个叶子 subagent 内部仍是「自主目标自驱」(Goal/Agent)。
//
//       这正是 Anthropic《Building Effective Agents》的 Workflow vs Agent 二分：
//       - Workflow(本脚本)：预先写死的控制流，保证「收齐才过门 / 预算用尽就停」
//       - Goal/Agent(每个 agent() 调用)：给目标，subagent 自己决定怎么实现
//
// 调用方式 (由主线 ARCH 在完成 CP-0a/CP-0b/CP-1 之后发起)：
//       Workflow({ scriptPath: "C:\\Users\\A\\.claude\\skills\\embedded-dev\\tools\\competition-workflow.js",
//                  args: <见下方 args 形状> })
//
// ──────────────────── 关键边界 (诚实声明，落地前必读) ────────────────────
//  1. Workflow 不能在运行中问用户。任何 status=blocked / human_decision_required
//     一律 **return 给主线 ARCH**，由 ARCH 做 AskUserQuestion，再用
//     Workflow({ scriptPath, resumeFromRunId, args:<带上人工决策> }) 续跑。
//  2. CP-0a(建目录/git init) / CP-0b(读题路由) / git commit+tag+push 留在主线 ARCH，
//     不进本脚本 (需要判断、交互、副作用)。本脚本只跑 CP-1.5~CP-4 的执行段。
//  3. 硬件在环步骤 (flash / serial-monitor / PIL) 不适合无人值守的 Workflow 跑；
//     QA 在脚本内只做软件侧 (arch-check / include-graph / 静态分析 / MIL)，
//     把需要硬件的步骤放进 qa.hardware_steps_pending 返回给人工。
//  4. CP-2 并行写文件依赖「文件归属互斥」(DRV→drivers/、ALG→app/、REPORT→docs/)；
//     无法保证互斥时把 routing.isolate_writes=true，脚本给这些 agent 加
//     isolation:'worktree' (但跨 worktree 合并 C 工程成本高，默认不开)。
//  5. retry_table 的权威账本仍是 项目规划清单.md 的 competition_state.retry_table；
//     本脚本内的 Map 是「单次运行内的镜像」，并行下计数可能近似 (单线程 await
//     不会真并发，但交错增量略有偏差)，最终以 ARCH 写回的 state 为准。
//  6. JS (非 TS)：禁止类型标注。禁用「取当前时间戳 / 取随机数 / 无参构造日期对象」这三类 API
//     (会破坏 resume；本注释刻意不写其字面调用形式，以免被 Workflow 静态扫描误判)；
//     时间戳由 args.current_time 传入。
//  7. budget：若用户设了 token 目标 (如 +500k)，CP-3 QA 自动扩成多视角对抗验证
//     (correctness / realtime / safety 三镜头)；未设目标则单 QA。注意 budget(token 预算)
//     与 retry_budget(重试次数预算) 是两码事。
//
// ──────────────────── args 形状 ────────────────────
//  {
//    trace_id:        "comp-2026-001",          // 必填，贯穿全程
//    current_time:    "2026-05-29T09:00:00+08:00", // 主线传入 (脚本内无 Date)
//    workspace_root:  "C:\\path\\to\\project",
//    routing: {                                  // 来自 CP-0b docs/competition-routing.md
//      main:   "CONTROL",                        // SIGNAL/METER/MODEM/CONTROL/SYSTEM/POWER/X
//      tags:   ["MOTOR","IMU","OLED"],
//      agents: ["DRV","ALG","QA","REPORT","MATLAB"], // 本题派哪些 (ARCH 按 task-router §2.4 算)
//      run_cp15: true,                           // 是否跑 CP-1.5 仿真门 (SYSTEM 题常 false)
//      run_cp4:  true,                           // 是否在本次跑 CP-4 集成
//      skip_pil: false,
//      isolate_writes: false,                    // CP-2 是否用 worktree 隔离写
//      cp2_mode: "role",                         // "role"(默认 DRV/ALG/REPORT 并行) | "pipeline"(按子系统独立流水)
//      subsystems: [                             // 仅 cp2_mode="pipeline" 用 (典型：工业 DAQ 多子系统)
//        { name:"采集", owner:"embedded-drv", spec:"ADC+DMA 多通道" },
//        { name:"CLI",  owner:"embedded-alg", spec:"命令解析" }
//      ]
//    },
//    interface_contract: "<架构设计.md 里冻结的接口契约文本或路径>",
//    hw_resource_path:   "硬件资源表.md",
//    indicators: [                               // CP-1.5 量化门禁 (人读，agent 自证)
//      { key:"THD", op:"<=", target:-50, unit:"dB" }
//    ],
//    human_decisions: {}                         // 续跑时回填：{ "CP-1.5": "改用 PID 降级方案", ... }
//  }
//
// ──────────────────── 返回值 (给主线 ARCH 决策 + 写 git tag) ────────────────────
//  {
//    trace_id, passed_cps:[...], artifacts:[...],
//    retry_table: { <root_cause_id>: <count> },   // 运行内镜像，ARCH 据此合并写回 competition_state
//    qa: <最后一次 QA Outcome>, defects:[<未闭环 ticket / 排队的 low ticket>],
//    blocked: null | { cp, reason, outcome?/items?/ticket? }  // 非 null = 需人工裁决
//  }
// ============================================================================

export const meta = {
  name: 'embedded-competition',
  description: '比赛模式 v2 的确定性编排骨架：CP-1.5 仿真门 → CP-2 实现(role 并行 / pipeline 子系统流水) → CP-3 QA+缺陷回派环(QA 视角数按 budget 伸缩) → CP-4 集成；schema 强制 Command Outcome，按 root_cause_id 全局重试预算 min(category,severity)，blocked 一律 return 给主线 ARCH',
  whenToUse: 'ARCH 完成 CP-1（硬件资源表+接口契约冻结）后，把 CP-1.5~CP-4 这段机械流程交给原生 Workflow 确定性执行；人工裁决点(blocked)与 git tag 仍由主线 ARCH 处理',
  phases: [
    { title: 'CP-1.5 仿真门', detail: 'embedded-matlab 单 agent，status=success 才放行；按预算重试（SYSTEM/集成题 run_cp15=false 时跳过）' },
    { title: 'CP-2 并行实现', detail: 'role 模式：DRV/ALG/REPORT 并行 fan-out（文件归属互斥，免写冲突）' },
    { title: 'CP-2 子系统流水', detail: 'pipeline 模式：每个子系统独立穿过 实现→单元自检，无阶段屏障（SYSTEM/多子系统题）' },
    { title: 'CP-3 QA+缺陷回派', detail: 'QA(单或多视角，按 budget) 出 Defect Ticket → 排序 → 按 owner_agent 定向回派 → 全局重试预算 → 复测' },
    { title: 'CP-4 集成', detail: 'ALG 写 main.c + REPORT 填实测 + QA 复验（软件侧）' },
  ],
}

// ──────────────────── JSON Schema：强制结构化 Command Outcome ────────────────────
// 对齐 refs/contracts.md §Command Outcome Schema。agent({schema}) 会在工具层校验，
// 不合格自动让 subagent 重试 → 彻底消灭「忘记返回 YAML / 漏字段」。
const FAILURE_CATEGORIES = [
  'environment-missing', 'project-config-error', 'connection-failure',
  'artifact-missing', 'target-response-abnormal', 'permission-problem',
  'ambiguous-context', 'realtime-violation',
]

const OUTCOME_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['status', 'summary', 'owner_agent', 'trace_id', 'evidence', 'artifact_paths', 'next_action'],
  properties: {
    status: { enum: ['success', 'partial_success', 'blocked', 'failure'] },
    summary: { type: 'string' },
    owner_agent: { type: 'string' },
    trace_id: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    artifact_paths: { type: 'array', items: { type: 'string' } },
    next_action: { type: 'string' },
    // 量化指标证据 (CP-1.5 必须给，否则视为「应该可行」式空话)
    indicators: { type: 'array', items: { type: 'string' } },
    // 失败/阻塞时追加
    failure_category: { enum: FAILURE_CATEGORIES },
    root_cause_id: { type: 'string' },
    retry_count_global: { type: 'number' },
    reproduce_command: { type: 'string' },
    blocking_cp: { type: 'string' },
    // 推荐
    confidence: { enum: ['high', 'medium', 'low'] },
    human_decision_required: { type: 'boolean' },
  },
}

// QA 专用：在 Command Outcome 之上加 verdict + Defect Ticket 列表 (对齐 §Defect Ticket Schema)
const TICKET_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['defect_id', 'severity', 'owner_agent', 'category', 'root_cause_id', 'title', 'blocking_cp'],
  properties: {
    defect_id: { type: 'string' },
    severity: { enum: ['critical', 'high', 'medium', 'low'] },
    owner_agent: { enum: ['embedded-arch', 'embedded-drv', 'embedded-alg', 'embedded-qa', 'embedded-matlab', 'embedded-report'] }, // 决定回派目标，schema 级禁 unknown
    category: { enum: FAILURE_CATEGORIES },
    root_cause_id: { type: 'string' },       // 与 retry_table 联动，同根因复用
    title: { type: 'string' },
    expected: { type: 'string' },
    actual: { type: 'string' },
    blocking_cp: { type: 'string' },
    created_at: { type: 'string' },
    suggested_fix: { type: 'array', items: { type: 'string' } },
    rerun_command: { type: 'string' },
  },
}

const QA_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['status', 'owner_agent', 'trace_id', 'verdict', 'tickets', 'summary', 'evidence', 'artifact_paths', 'next_action'],
  properties: {
    status: { enum: ['success', 'partial_success', 'blocked', 'failure'] },
    owner_agent: { type: 'string' },
    trace_id: { type: 'string' },
    verdict: { enum: ['PASS', 'FAIL'] },
    tickets: { type: 'array', items: TICKET_SCHEMA },
    summary: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    artifact_paths: { type: 'array', items: { type: 'string' } },
    next_action: { type: 'string' },
    hardware_steps_pending: { type: 'array', items: { type: 'string' } }, // 需硬件/人工的步骤
  },
}

// ──────────────────── 重试预算 (对齐 refs/contracts.md §预算公式) ────────────────────
// retry_budget(root_cause_id) = min(category_budget, severity_budget)
// 计数语义 (钉死防 off-by-one)：retry_count_global 从 0 起，每次自动重试失败 ++；
//   retry_count_global >= retry_budget 时 STOP。budget=0 = 首次失败即 STOP、零自动重试。
const CATEGORY_BUDGET = {
  'environment-missing': 0,
  'project-config-error': 3,
  'connection-failure': 0,
  'artifact-missing': 3,
  'target-response-abnormal': 3,
  'permission-problem': 0,
  'ambiguous-context': 0,
  'realtime-violation': 2,
}
// severity：critical=0(首次失败即人工)；high/medium 用 category；low「排队不阻断门禁」
//   → low 不走预算/STOP，由 CP-3 的 blocking() 过滤实现 (见主流程)，这里给个大数仅为公式自洽。
const BIG = Number.MAX_SAFE_INTEGER  // 代替 Infinity，保持可 JSON 序列化
const SEVERITY_BUDGET = { critical: 0, high: BIG, medium: BIG, low: BIG }

function retryBudget(category, severity) {
  const cat = (category in CATEGORY_BUDGET) ? CATEGORY_BUDGET[category] : 3
  const sev = (severity in SEVERITY_BUDGET) ? SEVERITY_BUDGET[severity] : BIG
  return Math.min(cat, sev)
}

// 多 Ticket 排序 (对齐 §多 Ticket 排序规则)：blocking_cp 升序 → severity 降序
//   → 剩余配额升序 → created_at 升序
const CP_ORDER = ['CP-0a', 'CP-0b', 'CP-1', 'CP-1.5', 'CP-2', 'CP-3', 'CP-4', 'CP-5']
const SEVERITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 }
function sortTickets(tickets, retryTable) {
  const cpRank = (cp) => { const i = CP_ORDER.indexOf(cp); return i < 0 ? CP_ORDER.length : i }  // 未知/拼错 CP 排最后
  const copy = tickets.slice()
  copy.sort((a, b) => {
    const ca = cpRank(a.blocking_cp), cb = cpRank(b.blocking_cp)
    if (ca !== cb) return ca - cb
    const sa = SEVERITY_RANK[a.severity] || 0, sb = SEVERITY_RANK[b.severity] || 0
    if (sa !== sb) return sb - sa
    const ra = retryBudget(a.category, a.severity) - (retryTable.get(a.root_cause_id) || 0)
    const rb = retryBudget(b.category, b.severity) - (retryTable.get(b.root_cause_id) || 0)
    if (ra !== rb) return ra - rb
    return String(a.created_at || '').localeCompare(String(b.created_at || ''))
  })
  return copy
}

function groupByOwner(tickets) {
  const m = {}
  for (const t of tickets) {
    if (!m[t.owner_agent]) m[t.owner_agent] = []
    m[t.owner_agent].push(t)
  }
  return m
}

// 人工裁决注入：续跑时 args.human_decisions[cp] 的文本拼进对应 CP 的 prompt
function humanNote(cp) {
  const d = ((args || {}).human_decisions || {})[cp]
  return d ? `\n\n[主线 ARCH 人工裁决 @ ${cp}]：${d}\n请据此执行，勿重复触发同一阻塞。` : ''
}

const ROLE_TO_AGENT = {
  ARCH: 'embedded-arch', DRV: 'embedded-drv', ALG: 'embedded-alg',
  QA: 'embedded-qa', MATLAB: 'embedded-matlab', REPORT: 'embedded-report',
}

// ──────────────────── 共享上下文片段 (拼进每个 subagent 的 prompt) ────────────────────
function contextBlock(A) {
  return [
    `trace_id: ${A.trace_id}`,
    `工作区: ${A.workspace_root || '(当前目录)'}`,
    `MAIN=${A.routing.main} TAGS=[${(A.routing.tags || []).join(', ')}]`,
    `启动后必读: ${A.hw_resource_path || '硬件资源表.md'} (引脚/DMA/中断/时钟) + 接口契约。`,
    `接口契约(冻结，禁改签名):\n${A.interface_contract || '(见 架构设计.md)'}`,
    `【强制】回传必须满足 Command Outcome Schema (refs/contracts.md)，owner_agent/trace_id 必填。`,
  ].join('\n')
}

// ──────────────────── 通用「带预算重试」执行器 ────────────────────
// 返回 { outcome } 成功 | { stopped:true, blocked:{...} } 需人工/预算用尽
async function runWithRetry(role, buildPrompt, cp, phaseTitle, A, retryTable, isolate) {
  let attempt = 0
  let lastRc = ''
  while (true) {
    const extra = attempt
      ? `\n\n[自动重试 #${attempt}] 上一轮 root_cause=${lastRc}，请针对性修复，勿重复同一错误。`
      : ''
    const opts = {
      agentType: ROLE_TO_AGENT[role],
      schema: OUTCOME_SCHEMA,
      phase: phaseTitle,
      label: `${role}:${cp}#${attempt}`,
    }
    if (isolate) opts.isolation = 'worktree'
    const o = await agent(buildPrompt(A) + extra, opts)

    if (!o) return { stopped: true, blocked: { cp, reason: `${role} agent 被用户跳过` } }
    if (o.status === 'success') return { outcome: o }
    if (o.status === 'blocked' || o.human_decision_required === true) {
      return { stopped: true, blocked: { cp, outcome: o, reason: o.summary } }
    }
    // partial_success / failure → 按预算重试
    const rc = o.root_cause_id || `RC-${cp}-${role}-AUTO`
    const cat = o.failure_category || 'target-response-abnormal'
    const rBudget = retryBudget(cat, 'high')  // 叶子 Outcome 无 severity，按 category 治（与全局 token budget 区分）
    const used = retryTable.get(rc) || 0
    if (used >= rBudget) {
      return { stopped: true, blocked: { cp, outcome: o, reason: `root_cause ${rc} 重试预算 ${rBudget} 用尽 (category=${cat})` } }
    }
    retryTable.set(rc, used + 1)
    lastRc = rc
    attempt++
  }
}

// ──────────────────── prompt 构造器 ────────────────────
function cp15Prompt(A) {
  const inds = (A.indicators || []).map(i => `  - ${i.key} ${i.op} ${i.target}${i.unit || ''}`).join('\n')
  return [
    `你是 [MATLAB] 算法仿真工程师。在 RIPER-5 + 比赛模式 v2 框架下工作。`,
    contextBlock(A),
    `【量化门禁指标 (未达标即 status=blocked，禁止放行 CP-2)】\n${inds || '  - (见 docs/competition-routing.md)'}`,
    `【任务】`,
    `1. mcp__matlab__detect_matlab_toolboxes 列可用 toolbox`,
    `2. 按题型选 modes/matlab-toolkit-competition.md (E1-E7) 或主线 1-10 场景，写 scripts/<task>_design.m 并 run`,
    `3. 输出量化指标证据到 indicators 字段 (不许"应该可行")`,
    `4. python tools/export_gains_to_c.py 导出 .h 到 app/dsp/ 或 app/control/`,
    `5. 写 编辑清单_MATLAB.md，给出 SIL/PIL 验证脚本供下游用`,
    `仿真未达指标 → status=blocked + human_decision_required=true。`,
  ].join('\n\n')
}

function cp2Prompt(role, A, cp15) {
  const matlabArtifacts = cp15 && cp15.outcome ? (cp15.outcome.artifact_paths || []).join(', ') : '(无)'
  const common = contextBlock(A)
  if (role === 'DRV') {
    return [
      `你是 [DRV] 底层驱动工程师。在 RIPER-5 + 比赛模式 v2 框架下工作。`, common,
      `职责：GPIO/UART/SPI/I2C/ADC/DMA/PWM/RTC 全部外设。严格按硬件资源表配置，禁用表外引脚/通道。`,
      `必须为 [MATLAB] 产物 (${matlabArtifacts}) 留好 include 接口；ADC/DAC/TIM 必须能跑通其采样率。`,
      `外设初始化顺序：时钟→AFIO→GPIO→DMA→外设→NVIC；IWDG 必启、喂狗仅主循环。`,
      `产出完整 .c/.h (零 TODO/零占位)，写文件到 drivers/ 与 hal/ports/ (与 ALG/REPORT 互斥，免写冲突)。`,
      `编辑清单写 编辑清单_DRV.md。`,
    ].join('\n\n')
  }
  if (role === 'ALG') {
    return [
      `你是 [ALG] 算法控制工程师。在 RIPER-5 + 比赛模式 v2 框架下工作。`, common,
      `职责：#include [MATLAB] 产出的 .h (${matlabArtifacts})，做「接 .h + 调用 + 状态机/CLI/编解码」，不重写算法核心。`,
      `状态机至少 INIT→READY→RUN→ERROR→RECOVERY；PID 限幅+抗饱和；无 FPU 平台高频路径用 Q15/查表。`,
      `失败兜底：[MATLAB] partial_success 时用降级算法 (如 LQR→PID)。`,
      `产出完整 .c/.h，写文件到 app/ (与 DRV/REPORT 互斥)。编辑清单写 编辑清单_ALG.md。`,
    ].join('\n\n')
  }
  // REPORT
  return [
    `你是 [REPORT] 报告与答辩准备工程师。在比赛模式 v2 框架下工作。`, common,
    `本阶段产出报告骨架 (题目分析+指标 / 系统框图 / 算法原理 / 硬件方案+BOM / 软件流程图 / 实测占位 / 创新点)。`,
    `"为什么"段必须有非 AI 理由 (标注 决策依据：见 研究发现.md §X)。只写 docs/ 与 比赛报告.md，禁改 .c/.h (与 DRV/ALG 互斥)。`,
    `编辑清单写 编辑清单_REPORT.md。`,
  ].join('\n\n')
}

function qaPrompt(A, rerunOf) {
  const pil = A.routing.skip_pil ? '本题 skip_pil=true，PIL 跳过' : '控制/滤波/测量题强制 MIL/SIL/PIL'
  const head = rerunOf
    ? `你是 [QA] 验证工程师。这是【复测】，仅复查下列已修复 ticket 是否闭环，其余通过项回 "✓ N/M passed"：\n${rerunOf.map(t => `  - ${t.defect_id} (${t.root_cause_id}) ${t.title}`).join('\n')}`
    : `你是 [QA] 嵌入式验证工程师。在 RIPER-5 + 比赛模式 v2 框架下工作 (独立运行，收齐其他 Agent 产物后跑)。`
  return [
    head, contextBlock(A),
    `【软件侧验证 (本 Workflow 内可跑)】`,
    `1. bash ~/.claude/skills/embedded-dev/scripts/arch-check.sh → exit≠0 即 FAIL`,
    `2. python ~/.claude/skills/embedded-dev/tools/include-graph.py → 有 LAYER-VIOL 即 FAIL`,
    `3. 静态分区检查 (app 严苛 / drv 中等 / vendor 跳过)；MIL：跑 .m 仿真对照参考输出`,
    `4. 5 元组验收表逐项打钩 + 实时性专项 (jitter/ISR/栈水位/CPU/浮点路径)`,
    `【强制证据·防自报失真】evidence 必须含 arch-check 与 include-graph 的真实 exit code 行 (如 "arch-check.sh exit=0"、"include-graph.py exit=1") + 关键输出尾部。编排器不替你跑工具，CP-3 门禁可信度取决于你如实回报——禁止编造 exit 码、禁止未实跑就声称通过。`,
    `【硬件在环 (本 Workflow 不跑，列进 hardware_steps_pending)】`,
    `编译/烧录/serial-monitor/PIL 这些需硬件的步骤不要在此执行，写进 hardware_steps_pending 返回。${pil}`,
    `【强制】FAIL 时每条问题必须打成 Defect Ticket (owner_agent 必填、禁 unknown；root_cause_id 同根因复用；category 用 8 类)。`,
    `verdict=PASS/FAIL；C/D 类红线问题存在即 FAIL。回传满足 QA Schema。`,
  ].join('\n\n')
}

function fixPrompt(ownerAgent, tickets, A) {
  const list = tickets.map(t =>
    `  - [${t.defect_id}] (${t.severity}/${t.category}/${t.root_cause_id}) ${t.title}\n    期望:${t.expected || '-'} 实际:${t.actual || '-'}\n    建议:${(t.suggested_fix || []).join(' / ') || '-'}`
  ).join('\n')
  return [
    `你是 ${ownerAgent}。收到 QA 定向回派的 Defect Ticket，请逐条修复 (最小改动)：`,
    contextBlock(A),
    `【待修 ticket】\n${list}`,
    `修复后在 编辑清单_<ROLE>.md 引用 defect_id；产出 artifact_paths；status=success 表示已修。`,
    `不要修改与本 ticket 无关的文件。回传满足 Command Outcome Schema。`,
  ].join('\n\n')
}

// ──────────────────── budget 驱动：CP-3 多视角对抗式 QA ────────────────────
// 用户设了 token 目标 (如 +500k) → CP-3 自动扩成多视角并行 QA；未设则单 QA。
const QA_LENSES = [
  { key: 'correctness', focus: '功能正确性 / 接口契约一致 / 初始化顺序 / 内存与数值安全 (验收表 A-E 类)' },
  { key: 'realtime', focus: '实时性 (H 类：控制周期 jitter / ISR 耗时 / 栈水位 / CPU 占用 / 浮点路径) + realtime-violation' },
  { key: 'safety', focus: '机电安全红线 (J 类) + 闭环控制指标 (I 类) + 看门狗/故障恢复 (F 类)' },
]

// 按 budget 决定 QA 视角数：未设 token 目标=1；设了则按 CP-3 时的【剩余预算】每 ~120k 加一镜头，
//   封顶 QA_LENSES 数（用 remaining() 而非 total：剩余不够就别在 QA 上把预算烧光）
function qaLensCount() {
  if (!budget || !budget.total) return 1
  return Math.min(QA_LENSES.length, Math.max(1, Math.floor(budget.remaining() / 120000)))
}

// 合并多视角 QA：tickets 按 root_cause_id 去重；verdict = 有非 low ticket 即 FAIL (对齐主流程 blocking)
function mergeQA(parts, traceId) {
  const ok = parts.filter(Boolean)
  if (!ok.length) return null
  const tickets = []
  const seen = new Set()
  for (const p of ok) for (const t of (p.tickets || [])) {
    if (seen.has(t.root_cause_id)) continue
    seen.add(t.root_cause_id); tickets.push(t)
  }
  const hw = []
  for (const p of ok) for (const s of (p.hardware_steps_pending || [])) hw.push(s)
  const blockingLeft = tickets.filter(t => t.severity !== 'low').length
  return {
    status: 'success', owner_agent: 'embedded-qa', trace_id: traceId,
    verdict: blockingLeft ? 'FAIL' : 'PASS',
    tickets,
    summary: `多视角 QA 合并：${ok.length} 视角 / ${tickets.length} 张去重 ticket / ${blockingLeft} 张阻断性`,
    evidence: ok.flatMap(p => p.evidence || []),
    artifact_paths: [],
    next_action: blockingLeft ? '按 owner_agent 回派修复' : 'CP-4',
    hardware_steps_pending: hw,
  }
}

// CP-3 QA 执行器：nLens=1 单 QA；nLens>1 多视角并行 + 合并
async function runQA(A, rerunOf, nLens, round) {
  if (nLens <= 1) {
    return await agent(qaPrompt(A, rerunOf), {
      agentType: ROLE_TO_AGENT.QA, schema: QA_SCHEMA, phase: 'CP-3 QA+缺陷回派', label: `QA:CP-3#${round}`,
    })
  }
  const lenses = QA_LENSES.slice(0, nLens)
  const parts = await parallel(lenses.map(L => () =>
    agent(qaPrompt(A, rerunOf) + `\n\n【本次只聚焦视角：${L.key}】${L.focus}\n其它视角由并行 QA 覆盖，你只针对本视角出 Defect Ticket。`, {
      agentType: ROLE_TO_AGENT.QA, schema: QA_SCHEMA, phase: 'CP-3 QA+缺陷回派', label: `QA:${L.key}#${round}`,
    })
  ))
  return mergeQA(parts, A.trace_id || 'comp-unknown')
}

// ──────────────────── pipeline 模式：CP-2 按子系统独立流水 ────────────────────
function subImplPrompt(sub, A, cp15) {
  const matlabArtifacts = cp15 && cp15.outcome ? (cp15.outcome.artifact_paths || []).join(', ') : '(无)'
  return [
    `你负责子系统【${sub.name}】(owner=${sub.owner || 'embedded-drv'})。在 RIPER-5 + 比赛模式 v2 框架下工作。`,
    contextBlock(A),
    sub.spec ? `【本子系统规格】${sub.spec}` : '',
    `只实现本子系统的 .c/.h，文件写到本子系统专属路径（与其它子系统互斥，免并发写冲突）。如需消费 MATLAB 产物：${matlabArtifacts}。`,
    `产出完整可编译代码（零 TODO / 零占位），回传 Command Outcome（artifact_paths 列出本子系统文件）。`,
  ].filter(Boolean).join('\n\n')
}

function subCheckPrompt(sub, impl, A) {
  return [
    `你是 [QA]，只对子系统【${sub.name}】做单元级静态自检（只读，不改代码）。`,
    contextBlock(A),
    `待检文件：${(impl.artifact_paths || []).join(', ')}`,
    `检查：接口契约一致性 / 零占位 / 头文件保护宏 / volatile / 裸轮询超时 / 本子系统资源占用合规。`,
    `回传 Command Outcome：status=success 表示本子系统单元自检通过；发现红线问题用 status=failure 并在 summary 说明。`,
  ].join('\n\n')
}

// 每个子系统独立穿过 [实现 → 单元自检]，无阶段屏障 (子系统 A 自检时 B 可能还在实现)
async function cp2Pipeline(A, cp15) {
  const subs = A.routing.subsystems || []
  if (!subs.length) return { stopped: true, reason: 'cp2_mode=pipeline 但未提供 routing.subsystems' }
  const rows = await pipeline(subs,
    (sub) => agent(subImplPrompt(sub, A, cp15), {
      agentType: sub.owner || 'embedded-drv', schema: OUTCOME_SCHEMA, phase: 'CP-2 子系统流水', label: `impl:${sub.name}`,
    }),
    (impl, sub) => {
      if (!impl) return { sub: sub.name, impl: null, check: null }
      if (impl.status !== 'success') return { sub: sub.name, impl, check: null }
      return agent(subCheckPrompt(sub, impl, A), {
        agentType: ROLE_TO_AGENT.QA, schema: OUTCOME_SCHEMA, phase: 'CP-2 子系统流水', label: `check:${sub.name}`,
      }).then(chk => ({ sub: sub.name, impl, check: chk }))
    }
  )
  return { rows: rows.filter(Boolean) }
}

// ============================================================================
//                                主流程
// ============================================================================
const A = args || {}
A.routing = A.routing || {}
A.routing.main = A.routing.main || 'X'
A.routing.tags = A.routing.tags || []
const agentsToRun = A.routing.agents || ['DRV', 'ALG', 'QA', 'REPORT']
const retryTable = new Map()  // root_cause_id -> retry_count_global (单次运行镜像)

const result = {
  trace_id: A.trace_id || 'comp-unknown',
  passed_cps: [],
  artifacts: [],
  retry_table: {},
  qa: null,
  defects: [],
  blocked: null,
}

log(`比赛模式 Workflow 启动 trace_id=${result.trace_id} MAIN=${A.routing.main} agents=[${agentsToRun.join(',')}]`)

// ──────────────────── CP-1.5：仿真门 (强制串行点，绝不并行 ALG) ────────────────────
let cp15 = null
if (A.routing.run_cp15) {
  // 路由一致性守门：run_cp15=true 却没派 MATLAB → 交主线 ARCH，勿静默跳过 (contracts.md CP-1.5 进入条件)
  if (!agentsToRun.includes('MATLAB')) {
    result.retry_table = Object.fromEntries(retryTable)
    result.blocked = { cp: 'CP-1.5', reason: '路由不一致：run_cp15=true 但 agents 未含 MATLAB' }
    log(result.blocked.reason)
    return result
  }
  phase('CP-1.5 仿真门')
  cp15 = await runWithRetry('MATLAB', (a) => cp15Prompt(a) + humanNote('CP-1.5'), 'CP-1.5', 'CP-1.5 仿真门', A, retryTable, false)
  if (cp15.stopped) {
    result.retry_table = Object.fromEntries(retryTable)
    result.blocked = { cp: 'CP-1.5', ...cp15.blocked }
    log(`CP-1.5 阻塞 → 交主线 ARCH 人工裁决：${cp15.blocked.reason}`)
    return result
  }
  result.passed_cps.push('CP-1.5')
  result.artifacts.push(...(cp15.outcome.artifact_paths || []))
  log(`CP-1.5 通过，产物：${(cp15.outcome.artifact_paths || []).join(', ')}`)
} else {
  log(`CP-1.5 跳过 (SYSTEM/集成题：run_cp15=false，不派 MATLAB)`)
}

// ──────────────────── CP-2：实现 (role 并行 / pipeline 子系统流水) ────────────────────
if (A.routing.cp2_mode === 'pipeline') {
  // pipeline 模式：每个子系统独立穿过 实现→单元自检，无阶段屏障 (吞吐=最慢单条链)
  // 取舍：换吞吐而放弃 role 模式的 runWithRetry 自动重试；失败子系统作为 blocked 上报
  phase('CP-2 子系统流水')
  const pres = await cp2Pipeline(A, cp15)
  if (pres.stopped) {
    result.retry_table = Object.fromEntries(retryTable)
    result.blocked = { cp: 'CP-2', reason: pres.reason }
    log(`CP-2 阻塞：${pres.reason}`)
    return result
  }
  // check 必须存在且 success：impl 成功但单元自检被跳过(null)/未通过 都算未通过，勿静默放行
  const bad = pres.rows.filter(r => !r.impl || r.impl.status !== 'success' || !r.check || r.check.status !== 'success')
  if (bad.length) {
    result.retry_table = Object.fromEntries(retryTable)
    result.blocked = {
      cp: 'CP-2', reason: 'CP-2 子系统流水有未通过项',
      items: bad.map(r => ({ sub: r.sub, impl: r.impl && r.impl.summary, check: r.check && r.check.summary })),
    }
    log(`CP-2 子系统流水阻塞 ${bad.length} 项 → 交主线 ARCH`)
    return result
  }
  for (const r of pres.rows) if (r.impl) result.artifacts.push(...(r.impl.artifact_paths || []))
  result.passed_cps.push('CP-2')
  log(`CP-2 子系统流水通过：${pres.rows.map(r => r.sub).join(', ')}`)
} else {
  // role 模式 (默认)：DRV/ALG/REPORT 并行 fan-out (屏障：收齐才过门)，各自带 runWithRetry 重试
  phase('CP-2 并行实现')
  const cp2Roles = agentsToRun.filter(r => ['DRV', 'ALG', 'REPORT'].includes(r))
  const cp2 = await parallel(cp2Roles.map(role => () =>
    runWithRetry(role, (a) => cp2Prompt(role, a, cp15) + humanNote('CP-2'), 'CP-2', 'CP-2 并行实现', A, retryTable, A.routing.isolate_writes === true)
  ))
  const cp2Blocked = cp2.filter(r => !r || r.stopped)  // null = thunk 异常；stopped = 阻塞/预算用尽
  if (cp2Blocked.length) {
    result.retry_table = Object.fromEntries(retryTable)
    result.blocked = { cp: 'CP-2', reason: 'CP-2 有 Agent 阻塞/预算用尽/被跳过', items: cp2Blocked.map(b => b ? b.blocked : { reason: 'thunk 异常或被跳过' }) }
    log(`CP-2 阻塞 ${cp2Blocked.length} 项 → 交主线 ARCH 人工裁决`)
    return result
  }
  for (const r of cp2) if (r && r.outcome) result.artifacts.push(...(r.outcome.artifact_paths || []))
  result.passed_cps.push('CP-2')
  log(`CP-2 通过：${cp2Roles.join(' + ')} 全部 success`)
}

// ──────────────────── CP-3：QA + Defect Ticket 回派环 ────────────────────
phase('CP-3 QA+缺陷回派')
// budget 驱动：QA 视角数随 token 目标伸缩 (未设=1 单 QA；设了 → correctness/realtime/safety 多镜头并行)
const nLens = qaLensCount()  // 入口算一次、整个回派环沿用 (resume 友好：避免镜头数中途漂移)
log(`CP-3 QA 视角数=${nLens}${budget && budget.total ? ` (budget≈${Math.round(budget.total / 1000)}k)` : ' (未设 token 目标 → 单 QA)'}`)
let qa = await runQA(A, null, nLens, 0)
if (!qa) {  // QA 被用户跳过
  result.retry_table = Object.fromEntries(retryTable)
  result.blocked = { cp: 'CP-3', reason: 'QA 被用户跳过，需人工验证' }
  return result
}
let round = 0
// 「low 排队不阻断门禁」(contracts.md §预算公式)：只有非 low ticket 才进入回派/STOP 判定
const blocking = (ts) => (Array.isArray(ts) ? ts : []).filter(t => t.severity !== 'low')
while (qa && qa.verdict === 'FAIL' && blocking(qa.tickets).length) {
  const tickets = sortTickets(blocking(qa.tickets), retryTable)
  // 预算守门：任一 ticket 的 root_cause 已耗尽预算 → STOP 交人工
  for (const t of tickets) {
    const rBudget = retryBudget(t.category, t.severity)
    const used = retryTable.get(t.root_cause_id) || 0
    if (used >= rBudget) {
      result.qa = qa
      result.defects = qa.tickets
      result.retry_table = Object.fromEntries(retryTable)
      result.blocked = {
        cp: 'CP-3',
        reason: `Defect ${t.defect_id} root_cause ${t.root_cause_id} 预算 ${rBudget} 用尽 (severity=${t.severity}/category=${t.category})`,
        ticket: t,
      }
      log(`CP-3 阻塞：${result.blocked.reason} → 交主线 ARCH 人工裁决`)
      return result
    }
  }
  // 同 owner 多 ticket 合并 1 次 Task；不同 owner 并行修
  const byOwner = groupByOwner(tickets)
  log(`CP-3 第 ${round + 1} 轮回派：${Object.keys(byOwner).map(o => `${o}(${byOwner[o].length})`).join(', ')}`)
  const fixes = await parallel(Object.keys(byOwner).map(owner => () =>
    agent(fixPrompt(owner, byOwner[owner], A) + humanNote('CP-3'), {
      agentType: owner, schema: OUTCOME_SCHEMA, phase: 'CP-3 QA+缺陷回派', label: `fix:${owner}#${round}`,
    })
  ))
  // fixer 被跳过(null)或自身 blocked → 上报主线，勿静默吞掉信号
  const stuck = fixes.filter(f => !f || f.status === 'blocked' || f.human_decision_required === true)
  if (stuck.length) {
    result.qa = qa
    result.defects = qa.tickets
    result.retry_table = Object.fromEntries(retryTable)
    result.blocked = { cp: 'CP-3', reason: 'fix agent 阻塞/被跳过', items: stuck.map(f => (f ? f.summary : 'fixer 被用户跳过')) }
    log(`CP-3 回派阻塞 ${stuck.length} 项 → 交主线 ARCH`)
    return result
  }
  // 本轮视为一次自动重试 → 对本轮回派的 root_cause 计数 (下轮 QA 复测会筛掉已闭环的)
  for (const t of tickets) retryTable.set(t.root_cause_id, (retryTable.get(t.root_cause_id) || 0) + 1)
  round++
  if (round > 12) { log('CP-3 修复轮次超 12，强制停以防失控'); break }
  qa = await runQA(A, tickets, nLens, round)
}
result.qa = qa
result.defects = qa && qa.tickets ? qa.tickets.filter(t => t) : []
result.retry_table = Object.fromEntries(retryTable)
// PASS 判据：verdict=PASS，或 verdict=FAIL 但阻断性 ticket 已清零（仅剩 low，排队不阻断门禁）
const onlyLowLeft = qa && qa.verdict === 'FAIL' && blocking(qa.tickets).length === 0
if (qa && (qa.verdict === 'PASS' || onlyLowLeft)) {
  result.passed_cps.push('CP-3')
  log(`CP-3 PASS (经历 ${round} 轮修复${onlyLowLeft ? '；剩余仅 low ticket，已排队不阻断' : ''})`)
} else {
  result.blocked = result.blocked || { cp: 'CP-3', reason: round > 12 ? 'CP-3 修复轮次超限' : 'QA 未 PASS', outcome: qa }
  log(`CP-3 未 PASS → 交主线 ARCH`)
  return result
}

// ──────────────────── CP-4：集成 (软件侧) ────────────────────
if (A.routing.run_cp4) {
  phase('CP-4 集成')
  // 3-owner 拆分：ALG 写 main.c / REPORT 填实测 (并行，文件互斥)；ARCH(主线) 不在此写代码
  const cp4Roles = []
  if (agentsToRun.includes('ALG')) cp4Roles.push('ALG')
  if (agentsToRun.includes('REPORT')) cp4Roles.push('REPORT')
  const cp4 = await parallel(cp4Roles.map(role => () => {
    const p = role === 'ALG'
      ? `${contextBlock(A)}\n\n你是 [ALG]：按 modes/competition.md 阶段四模板写 app/main.c (时间片轮询，严格按初始化顺序，连 bsp_init/svc_init/app_run，IWDG 喂狗仅主循环)。回传 Command Outcome。${humanNote('CP-4')}`
      : `${contextBlock(A)}\n\n你是 [REPORT]：读 编辑清单_QA.md + 实测 CSV，把实测数据填进 比赛报告.md，禁改 .c/.h。回传 Command Outcome。${humanNote('CP-4')}`
    return agent(p, { agentType: ROLE_TO_AGENT[role], schema: OUTCOME_SCHEMA, phase: 'CP-4 集成', label: `${role}:CP-4` })
  }))
  for (const r of cp4) if (r && r.artifact_paths) result.artifacts.push(...r.artifact_paths)
  // 任一集成 agent 被跳过(null)/阻塞 → 上报主线
  const cp4stuck = cp4.filter(r => !r || r.status === 'blocked' || r.human_decision_required === true)
  if (cp4stuck.length) {
    result.retry_table = Object.fromEntries(retryTable)
    result.blocked = { cp: 'CP-4', reason: 'CP-4 集成 agent 阻塞/被跳过', items: cp4stuck.map(r => (r ? r.summary : '被用户跳过')) }
    return result
  }
  // QA 复验 (软件侧；编译/烧录列 hardware_steps_pending)
  const cp4qa = await agent(qaPrompt(A, null) + '\n\n本次仅对 main.c 复验 A/C/F/G 类 + #include 链路完整性。', {
    agentType: ROLE_TO_AGENT.QA, schema: QA_SCHEMA, phase: 'CP-4 集成', label: 'QA:CP-4',
  })
  result.cp4_qa = cp4qa
  result.retry_table = Object.fromEntries(retryTable)
  if (cp4qa && cp4qa.verdict === 'PASS') {
    result.passed_cps.push('CP-4')
    log('CP-4 集成软件侧 PASS；编译/烧录步骤见 cp4_qa.hardware_steps_pending')
  } else {
    result.blocked = { cp: 'CP-4', reason: !cp4qa ? 'CP-4 复验 QA 被用户跳过，需人工' : 'CP-4 集成复验未 PASS', outcome: cp4qa }
    return result
  }
}

result.retry_table = Object.fromEntries(retryTable)
log(`Workflow 完成。已过 CP：${result.passed_cps.join(' → ')}。交主线 ARCH 打 git tag + 回盘四文件 + (若有) 处理 hardware_steps_pending。`)
return result
