/* global process */
/**
 * auto-embedded 子 Agent 上下文注入插件（OpenCode）。
 *
 * 对标 Claude 的 PreToolUse(Task)：派发 aemb-scout/builder/verifier 子 Agent 时，按角色
 * 把相关 spec（来自 active task 的 research/implement/verify.jsonl）注入到子 Agent 的派发提示。
 * 内容由 python hook aemb-inject-subagent-context.py 产出——它从 stdin 读
 * {tool_input:{subagent_type,description,prompt}} 判角色、定位 active task、按预算注入 spec。
 *
 * 钩子：tool.execute.before，仅对 task 工具生效；把 hook 的 stdout 前置到 args.prompt
 * （就地改写 args，整体替换对 task 工具无效——运行时持有同一 args 引用）。
 */

import { existsSync } from "fs"
import { join } from "path"
import {
  HOOK_SUBAGENT,
  debugLog,
  hooksDisabled,
  isAembProject,
  runHook,
} from "../lib/aemb-context.js"

// 支持的子 Agent 类型（去掉 aemb- 前缀后比对）。
const AEMB_AGENTS = ["scout", "builder", "verifier"]

// OpenCode 1.2.x 要求插件是工厂函数。
export default async ({ directory }) => {
  debugLog("subagent", "plugin loaded, directory:", directory)

  return {
    "tool.execute.before": async (input, output) => {
      try {
        if (hooksDisabled()) return
        if (!isAembProject(directory)) return

        const toolName = input && typeof input.tool === "string" ? input.tool.toLowerCase() : ""
        if (toolName !== "task") return

        const args = output && output.args
        if (!args) return

        // OpenCode 的 task 工具用 subagent_type 指定子 Agent；去掉 aemb- 前缀比对。
        const rawType = typeof args.subagent_type === "string" ? args.subagent_type : ""
        const subagentType = rawType.replace(/^aemb-/, "")
        const originalPrompt = typeof args.prompt === "string" ? args.prompt : ""
        const description = typeof args.description === "string" ? args.description : ""

        if (!AEMB_AGENTS.includes(subagentType)) {
          debugLog("subagent", "skip - unsupported subagent_type:", rawType)
          return
        }

        // 构造 python hook 期望的 stdin（它从 tool_input 取 subagent_type/description/prompt 判角色）。
        const stdinPayload = JSON.stringify({
          tool_input: {
            subagent_type: rawType,
            description,
            prompt: originalPrompt,
          },
        })

        const context = runHook(directory, HOOK_SUBAGENT, stdinPayload)
        if (!context) {
          debugLog("subagent", "no context produced for", rawType)
          return
        }

        // 前置注入：spec 块在前，原派发提示在后；就地改写 args.prompt。
        args.prompt = `${context}\n\n---\n\n${originalPrompt}`
        debugLog("subagent", "injected context for", rawType, "prompt length:", args.prompt.length)
      } catch (e) {
        debugLog("subagent", "tool.execute.before error:", e && e.message ? e.message : String(e))
      }
    },
  }
}
