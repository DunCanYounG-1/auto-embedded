#!/usr/bin/env node
// ============================================================================
// competition-workflow.test.js — competition-workflow.js 的离线 dry-run 自测
// ============================================================================
//
// 用法:  node tools/competition-workflow.test.js
// 退出码: 0 = 全部通过；1 = 有失败
//
// 原理: 按原生 Workflow 的执行模型，把脚本体包进 AsyncFunction，注入 mock 的
//       agent / parallel / pipeline / phase / log + 各场景的 args / budget，
//       然后断言控制流分支。所有 agent 被 mock (喂假 Outcome) →
//       不联网、不烧 token、纯本地验证 CP 门禁 / 重试预算 / 回派环 / low 不阻断 /
//       pipeline 子系统流水 / budget 多视角 QA 等分支是否走对。
//
// 注意: 本文件是普通 Node 测试脚本 (非 Workflow 脚本)，可正常用 require/Date 等。
//       被测脚本 competition-workflow.js 仍是单一真相源，这里只加载并驱动它。
// ============================================================================

const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, 'competition-workflow.js')
const raw = fs.readFileSync(SRC, 'utf8').replace('export const meta', 'const meta')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// 按 Workflow 执行模型加载：脚本体 → async 函数，运行时全局作为形参注入
function loadScript() {
  return new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', raw)
}

// ──────────────────── mock 运行时 (忠实模仿 Workflow 工具语义) ────────────────────
function makeRuntime(responder, budgetObj) {
  const calls = []
  const phases = []
  const logs = []
  const agent = async (prompt, o) => {
    o = o || {}
    calls.push({ label: o.label, agentType: o.agentType, phase: o.phase })
    return responder(prompt, o)
  }
  // parallel：屏障；thunk 抛错 → null (调用本身不 reject)
  const parallel = (thunks) => Promise.all(thunks.map(t => Promise.resolve().then(t).catch(() => null)))
  // pipeline：每项独立穿过所有 stage，无屏障；stage 抛错 → 该项 null 并跳过其余 stage
  //   stage 回调签名 (prevResult, originalItem, index)；首个 stage 的 prevResult 即 item
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let v = item
    for (const s of stages) {
      try { v = await s(v, item, i) } catch (e) { return null }
    }
    return v
  }))
  const phase = (t) => phases.push(t)
  const log = (m) => logs.push(m)
  const budget = budgetObj || { total: null, spent: () => 0, remaining: () => Infinity }
  return { agent, parallel, pipeline, phase, log, budget, calls, phases, logs }
}

// ──────────────────── Outcome 构造助手 ────────────────────
const ok = (o, extra) => Object.assign(
  { status: 'success', summary: 's', owner_agent: (o && o.agentType) || 'x', trace_id: 't', evidence: ['e'], artifact_paths: ['f.c'], next_action: 'n' },
  extra || {})
const blockedOut = (extra) => Object.assign(
  { status: 'blocked', human_decision_required: true, summary: 'blk', owner_agent: 'x', trace_id: 't', evidence: [], artifact_paths: [], next_action: '' },
  extra || {})
const qa = (verdict, tickets) => ({
  status: 'success', owner_agent: 'embedded-qa', trace_id: 't', verdict,
  tickets: tickets || [], summary: 'qa', evidence: [], artifact_paths: [], next_action: '', hardware_steps_pending: [],
})
const ticket = (extra) => Object.assign(
  { defect_id: 'D-1', severity: 'high', owner_agent: 'embedded-drv', category: 'target-response-abnormal', root_cause_id: 'RC-1', title: 't', blocking_cp: 'CP-3' },
  extra || {})

const baseRouting = (over) => Object.assign(
  { main: 'CONTROL', tags: ['MOTOR'], agents: ['DRV', 'ALG', 'QA', 'REPORT', 'MATLAB'], run_cp15: true, run_cp4: true, skip_pil: false },
  over || {})
const hasCall = (rt, prefix) => rt.calls.some(c => (c.label || '').startsWith(prefix))

// ──────────────────── 极简断言 ────────────────────
let pass = 0, fail = 0
const failures = []
function check(name, cond, detail) {
  if (cond) { pass++ } else { fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`    ${cond ? 'ok  ' : 'FAIL'} ${name}`)
}

async function run(name, scenario) {
  console.log(`\n[场景] ${name}`)
  const rt = makeRuntime(scenario.responder, scenario.budget)
  const fn = loadScript()
  let result
  try {
    result = await fn(rt.agent, rt.parallel, rt.pipeline, rt.phase, rt.log, scenario.args, rt.budget)
  } catch (e) {
    check(`${name} 不应抛异常`, false, String(e && e.stack || e))
    return
  }
  scenario.assert(result, rt)
}

// ──────────────────── 场景集 ────────────────────
const scenarios = [
  {
    name: '1. happy path (role 模式)：全程 success → 过 CP-1.5/2/3/4',
    args: { trace_id: 't1', routing: baseRouting() },
    responder: (p, o) => {
      if ((o.label || '').startsWith('MATLAB')) return ok(o, { artifact_paths: ['app/dsp/x.h'] })
      if (o.agentType === 'embedded-qa') return qa('PASS', [])
      return ok(o)
    },
    assert: (r) => {
      check('blocked 为 null', r.blocked === null, JSON.stringify(r.blocked))
      check('passed_cps 含 CP-1.5/CP-2/CP-3/CP-4',
        ['CP-1.5', 'CP-2', 'CP-3', 'CP-4'].every(c => r.passed_cps.includes(c)), r.passed_cps.join(','))
    },
  },
  {
    name: '2. CP-1.5 仿真 blocked → return blocked, 不前进',
    args: { trace_id: 't2', routing: baseRouting() },
    responder: (p, o) => (o.label || '').startsWith('MATLAB') ? blockedOut() : ok(o),
    assert: (r) => {
      check('blocked.cp === CP-1.5', r.blocked && r.blocked.cp === 'CP-1.5', JSON.stringify(r.blocked))
      check('passed_cps 为空', r.passed_cps.length === 0, r.passed_cps.join(','))
    },
  },
  {
    name: '3. 路由不一致 (run_cp15=true 但无 MATLAB) → blocked',
    args: { trace_id: 't3', routing: baseRouting({ agents: ['DRV', 'ALG', 'QA', 'REPORT'] }) },
    responder: (p, o) => ok(o),
    assert: (r) => {
      check('blocked.cp === CP-1.5', r.blocked && r.blocked.cp === 'CP-1.5')
      check('reason 含「路由不一致」', r.blocked && /路由不一致/.test(r.blocked.reason), r.blocked && r.blocked.reason)
    },
  },
  {
    name: '4. SYSTEM 题 run_cp15=false → 跳过 CP-1.5，直接 CP-2/CP-3',
    args: { trace_id: 't4', routing: baseRouting({ main: 'SYSTEM', agents: ['DRV', 'ALG', 'QA', 'REPORT'], run_cp15: false, run_cp4: false }) },
    responder: (p, o) => (o.agentType === 'embedded-qa') ? qa('PASS', []) : ok(o),
    assert: (r, rt) => {
      check('blocked 为 null', r.blocked === null, JSON.stringify(r.blocked))
      check('passed_cps 不含 CP-1.5', !r.passed_cps.includes('CP-1.5'), r.passed_cps.join(','))
      check('passed_cps 含 CP-2/CP-3', ['CP-2', 'CP-3'].every(c => r.passed_cps.includes(c)), r.passed_cps.join(','))
      check('未派 MATLAB', !hasCall(rt, 'MATLAB'))
    },
  },
  {
    name: '5. CP-3 FAIL → 回派修复 → 复测 PASS, retry_table 计数=1',
    args: { trace_id: 't5', routing: baseRouting() },
    responder: (() => {
      let qaN = 0
      return (p, o) => {
        if ((o.label || '').startsWith('MATLAB')) return ok(o)
        if (o.agentType === 'embedded-qa') {
          if ((o.label || '').startsWith('QA:CP-3')) { qaN++; return qaN === 1 ? qa('FAIL', [ticket()]) : qa('PASS', []) }
          return qa('PASS', []) // CP-4 QA
        }
        return ok(o) // CP-2 / fix / CP-4 alg+report
      }
    })(),
    assert: (r, rt) => {
      check('blocked 为 null', r.blocked === null, JSON.stringify(r.blocked))
      check('passed_cps 含 CP-3', r.passed_cps.includes('CP-3'), r.passed_cps.join(','))
      check('发生了 fix 回派到 embedded-drv', hasCall(rt, 'fix:embedded-drv'))
      check('retry_table[RC-1] === 1', r.retry_table && r.retry_table['RC-1'] === 1, JSON.stringify(r.retry_table))
    },
  },
  {
    name: '6. critical ticket (预算=0) → CP-3 首次失败即 blocked, 不回派',
    args: { trace_id: 't6', routing: baseRouting() },
    responder: (p, o) => {
      if ((o.label || '').startsWith('MATLAB')) return ok(o)
      if (o.agentType === 'embedded-qa') return qa('FAIL', [ticket({ severity: 'critical' })])
      return ok(o)
    },
    assert: (r, rt) => {
      check('blocked.cp === CP-3', r.blocked && r.blocked.cp === 'CP-3', JSON.stringify(r.blocked))
      check('reason 含「预算」', r.blocked && /预算/.test(r.blocked.reason), r.blocked && r.blocked.reason)
      check('未发生 fix 回派 (零自动重试)', !hasCall(rt, 'fix:'))
      check('passed_cps 不含 CP-3', !r.passed_cps.includes('CP-3'))
    },
  },
  {
    name: '7. 仅 low ticket 的 FAIL → low 排队不阻断门禁 → CP-3 PASS',
    args: { trace_id: 't7', routing: baseRouting({ run_cp4: false }) },
    responder: (p, o) => {
      if ((o.label || '').startsWith('MATLAB')) return ok(o)
      if (o.agentType === 'embedded-qa') return qa('FAIL', [ticket({ severity: 'low', root_cause_id: 'RC-LOW' })])
      return ok(o)
    },
    assert: (r, rt) => {
      check('blocked 为 null', r.blocked === null, JSON.stringify(r.blocked))
      check('passed_cps 含 CP-3', r.passed_cps.includes('CP-3'), r.passed_cps.join(','))
      check('未发生 fix 回派', !hasCall(rt, 'fix:'))
      check('low ticket 进 defects 排队', r.defects && r.defects.some(t => t.severity === 'low'))
    },
  },
  {
    name: '8. budget=500k → CP-3 多视角 QA (correctness/realtime/safety)',
    args: { trace_id: 't8', routing: baseRouting({ run_cp4: false }) },
    budget: { total: 500000, spent: () => 0, remaining: () => 500000 },
    responder: (p, o) => {
      if ((o.label || '').startsWith('MATLAB')) return ok(o)
      if (o.agentType === 'embedded-qa') return qa('PASS', [])
      return ok(o)
    },
    assert: (r, rt) => {
      check('blocked 为 null', r.blocked === null, JSON.stringify(r.blocked))
      check('跑了 correctness 视角', hasCall(rt, 'QA:correctness'))
      check('跑了 realtime 视角', hasCall(rt, 'QA:realtime'))
      check('跑了 safety 视角', hasCall(rt, 'QA:safety'))
      check('passed_cps 含 CP-3', r.passed_cps.includes('CP-3'))
    },
  },
  {
    name: '9. pipeline 模式：子系统全 success → CP-2 子系统流水通过',
    args: {
      trace_id: 't9',
      routing: baseRouting({
        main: 'SYSTEM', agents: ['DRV', 'ALG', 'QA', 'REPORT'], run_cp15: false, run_cp4: false,
        cp2_mode: 'pipeline', subsystems: [{ name: '采集', owner: 'embedded-drv' }, { name: 'CLI', owner: 'embedded-alg' }],
      }),
    },
    responder: (p, o) => (o.agentType === 'embedded-qa' && (o.label || '').startsWith('QA:CP-3')) ? qa('PASS', []) : ok(o),
    assert: (r, rt) => {
      check('blocked 为 null', r.blocked === null, JSON.stringify(r.blocked))
      check('passed_cps 含 CP-2/CP-3', ['CP-2', 'CP-3'].every(c => r.passed_cps.includes(c)), r.passed_cps.join(','))
      check('两个子系统都实现了', hasCall(rt, 'impl:采集') && hasCall(rt, 'impl:CLI'))
      check('两个子系统都自检了', hasCall(rt, 'check:采集') && hasCall(rt, 'check:CLI'))
    },
  },
  {
    name: '10. [回归] pipeline 子系统 impl 成功但单元自检被跳过(null) → 应 blocked (不静默放行)',
    args: {
      trace_id: 't10',
      routing: baseRouting({
        main: 'SYSTEM', agents: ['DRV', 'ALG', 'QA', 'REPORT'], run_cp15: false, run_cp4: false,
        cp2_mode: 'pipeline', subsystems: [{ name: '采集', owner: 'embedded-drv' }],
      }),
    },
    responder: (p, o) => (o.label || '').startsWith('check:') ? null : ok(o), // 自检被用户跳过
    assert: (r) => {
      check('blocked.cp === CP-2', r.blocked && r.blocked.cp === 'CP-2', JSON.stringify(r.blocked))
      check('reason 含「子系统流水」', r.blocked && /子系统流水/.test(r.blocked.reason))
      check('passed_cps 不含 CP-2', !r.passed_cps.includes('CP-2'))
    },
  },
  {
    name: '11. pipeline 子系统 impl 失败 → blocked',
    args: {
      trace_id: 't11',
      routing: baseRouting({
        main: 'SYSTEM', agents: ['DRV', 'ALG', 'QA', 'REPORT'], run_cp15: false, run_cp4: false,
        cp2_mode: 'pipeline', subsystems: [{ name: '采集', owner: 'embedded-drv' }, { name: 'CLI', owner: 'embedded-alg' }],
      }),
    },
    responder: (p, o) => {
      if ((o.label || '') === 'impl:采集') return ok(o, { status: 'failure' })
      return ok(o)
    },
    assert: (r) => {
      check('blocked.cp === CP-2', r.blocked && r.blocked.cp === 'CP-2', JSON.stringify(r.blocked))
      check('passed_cps 不含 CP-2', !r.passed_cps.includes('CP-2'))
    },
  },
  {
    name: '12. role 模式 CP-2 某 Agent blocked → blocked',
    args: { trace_id: 't12', routing: baseRouting({ run_cp15: false }) },
    responder: (p, o) => (o.label || '').startsWith('DRV:CP-2') ? blockedOut() : ok(o),
    assert: (r) => {
      check('blocked.cp === CP-2', r.blocked && r.blocked.cp === 'CP-2', JSON.stringify(r.blocked))
    },
  },
]

;(async () => {
  console.log('=== competition-workflow.js dry-run 自测 ===')
  for (const s of scenarios) await run(s.name, s)
  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
  if (fail) { console.log('失败项:'); failures.forEach(f => console.log('  - ' + f)) }
  process.exit(fail ? 1 : 0)
})()
