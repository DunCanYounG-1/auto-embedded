/* global process */
/**
 * auto-embedded 每轮面包屑插件（OpenCode）。
 *
 * 对标 Claude 的 UserPromptSubmit：每轮注入一行 <workflow-state> RIPER 阶段面包屑，
 * 提醒主 AI 当前任务/阶段，防长会话漂移。内容由 python hook
 * aemb-inject-workflow-state.py 产出（文本唯一来源是 workflow.md 的 [workflow-state:PHASE] 块）。
 *
 * 与 session-start 不同：不去重，每轮都注；子 Agent 轮跳过（子 Agent 上下文走父会话 task 注入）。
 */

import {
  HOOK_WORKFLOW_STATE,
  debugLog,
  hooksDisabled,
  isAembProject,
  isAembSubagent,
  prependContextToParts,
  runHook,
} from "../lib/aemb-context.js"

// OpenCode 1.2.x 要求插件是工厂函数。
export default async ({ directory }) => {
  debugLog("workflow-state", "plugin loaded, directory:", directory)

  return {
    "chat.message": async (input, output) => {
      try {
        if (hooksDisabled()) return
        if (isAembSubagent(input)) {
          debugLog("workflow-state", "skip subagent turn:", input && input.agent)
          return
        }
        if (!isAembProject(directory)) return

        const breadcrumb = runHook(directory, HOOK_WORKFLOW_STATE)
        if (!breadcrumb) {
          debugLog("workflow-state", "no breadcrumb produced")
          return
        }

        prependContextToParts(output, breadcrumb, "\n\n")
        debugLog("workflow-state", "injected breadcrumb, length:", breadcrumb.length)
      } catch (e) {
        debugLog("workflow-state", "chat.message error:", e && e.message ? e.message : String(e))
      }
    },
  }
}
