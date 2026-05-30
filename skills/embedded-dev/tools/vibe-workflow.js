// ============================================================================
// vibe-workflow.js — 通用长任务 Scout→Builder→Verifier 确定性壳 (Opus 原生 Workflow)
// ============================================================================
//
// 对应 refs/vibe-workflow.md 三角色 + modes/workflow-orchestration.md §4。
// 非比赛场景的长任务 (跨 ≥2 文件 / ≥2 轮 / 需可回放可交接) 用它把
// 「证据收集 → 最小实现 → 对抗审查」从「主线自觉」变成确定性控制流。
//
// 调用：
//   Workflow({ scriptPath:"C:\\Users\\A\\.claude\\skills\\embedded-dev\\tools\\vibe-workflow.js",
//     args:{
//       goal:          "<本轮目标>",          // 必填
//       trace_id:      "vibe-001",
//       builder_agent: "embedded-alg",         // drv/alg/arch 按任务择一 (默认 alg)
//       scout_agent:   "Explore",              // 只读探索 agent；宿主无 Explore 时主线改传 embedded-qa
//       context:       "<候选文件/约束摘要，可选>"
//     }})
//
// 返回：{ trace_id, scout, build, verify, blocked }
//   blocked != null → 需主线人工介入 (Workflow 不能问用户，见 competition-workflow.js 边界说明)。
//
// 边界 (同 competition-workflow.js)：① 不能问用户 → blocked 一律 return；
//   ② 只读保证靠 prompt 约束而非 agentType；③ 单写者天然满足 (同阶段仅一个 Builder 写)；
//   ④ 禁用「取当前时间 / 取随机数 / 无参构造日期对象」三类 API (会破坏 resume)。
// ============================================================================

export const meta = {
  name: 'embedded-vibe',
  description: '通用长任务 Scout→Builder→Verifier 确定性壳：只读收集 → 最小实现 → 对抗审查；blocked 一律 return 给主线',
  whenToUse: '非比赛的嵌入式长任务 (跨 ≥2 文件 / ≥2 轮 / 需可回放可交接)；比赛执行段请用 competition-workflow.js',
  phases: [
    { title: 'Scout', detail: '只读收集证据/约束/候选文件/最小改动范围' },
    { title: 'Build', detail: '单写者最小实现 + 实跑验证' },
    { title: 'Verify', detail: '对抗式审查，默认怀疑' },
  ],
}

// 轻量 Command Outcome (对齐 refs/contracts.md，去掉比赛专用字段)
const OUTCOME = {
  type: 'object', additionalProperties: true,
  required: ['status', 'summary', 'evidence', 'artifact_paths', 'next_action'],
  properties: {
    status: { enum: ['success', 'partial_success', 'blocked', 'failure'] },
    summary: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    artifact_paths: { type: 'array', items: { type: 'string' } },
    next_action: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    human_decision_required: { type: 'boolean' },
  },
}

const A = args || {}
const goal = A.goal || '(未提供 goal，请在 args.goal 给出本轮目标)'
const traceId = A.trace_id || 'vibe-001'
const builder = A.builder_agent || 'embedded-alg'   // drv / alg / arch 按任务择一
const scoutAgent = A.scout_agent || 'Explore'        // 宿主无 Explore 时主线改传 'embedded-qa'
const ctx = A.context ? `\n【已知上下文】${A.context}` : ''
const result = { trace_id: traceId, scout: null, build: null, verify: null, blocked: null }

// ──────────────────── Scout：只读收集 (只读靠 prompt 约束，不靠 agentType) ────────────────────
phase('Scout')
const scout = await agent(
  `trace_id:${traceId}\n目标：${goal}${ctx}\n你是 Scout，【只读、绝不写文件】：给出 ①候选文件(按优先级) ②既有模式/相似实现 ③已确认约束(芯片/库/构建/引脚/时钟/DMA/中断) ④建议的最小改动范围。回传 Command Outcome。`,
  { agentType: scoutAgent, schema: OUTCOME, phase: 'Scout', label: 'scout' })
if (!scout || scout.status === 'blocked' || scout.human_decision_required === true) {
  result.scout = scout
  result.blocked = { phase: 'Scout', reason: scout ? scout.summary : 'Scout 被用户跳过' }
  log('Scout 阻塞/被跳过 → 交主线人工介入')
  return result
}
result.scout = scout

// ──────────────────── Build：单写者最小实现 ────────────────────
phase('Build')
const build = await agent(
  `trace_id:${traceId}\n目标：${goal}\nScout 证据：${scout.summary}\n候选文件：${(scout.artifact_paths || []).join(', ')}\n你是 Builder(${builder})，做【最小改动】实现：给 3-7 步计划 + 实际代码改动 + 实跑过的编译/测试/烧录结果 + 偏差说明。回传 Command Outcome。`,
  { agentType: builder, schema: OUTCOME, phase: 'Build', label: 'build' })
if (!build || build.status === 'blocked' || build.human_decision_required === true) {
  result.build = build
  result.blocked = { phase: 'Build', reason: build ? build.summary : 'Builder 被用户跳过' }
  log('Build 阻塞/被跳过 → 交主线人工介入')
  return result
}
result.build = build

// ──────────────────── Verify：对抗式审查 (只读，默认怀疑) ────────────────────
phase('Verify')
const verify = await agent(
  `trace_id:${traceId}\n你是 Verifier，【只审不补、默认怀疑】：针对下列改动给 ①按严重度排序的风险 ②未覆盖边界 ③基于 diff 与实跑结果的逐项审查结论 ④最低成本补救。不确定时倾向 failure。\n改动：${(build.artifact_paths || []).join(', ')}\n证据：${(build.evidence || []).join('; ')}\n回传 Command Outcome (risks 必填)。`,
  { agentType: 'embedded-qa', schema: OUTCOME, phase: 'Verify', label: 'verify' })
result.verify = verify
if (!verify) {
  result.blocked = { phase: 'Verify', reason: 'Verifier 被用户跳过，需人工验证' }
} else if (verify.status === 'failure' || verify.status === 'blocked' || verify.human_decision_required === true) {
  result.blocked = { phase: 'Verify', reason: verify.summary, risks: verify.risks || [] }
}
log(`vibe 完成：Scout/Build/Verify 跑完；blocked=${result.blocked ? 'yes' : 'no'}`)
return result
