/* global process */
/**
 * auto-embedded SessionStart 插件（OpenCode）。
 *
 * 对标 Claude 的 SessionStart：在一个会话里用户首条消息时，注入一次 RIPER-5 现场
 * （阶段/active task/spec 索引/硬件锁/journal/五问重启）。内容由 python hook
 * aemb-session-start.py 产出，本插件只负责跑它并把 stdout 拼进 chat.message 文本。
 *
 * 用 chat.message 钩子就地改写消息，使注入持久化进会话历史；按 sessionID 去重，
 * 一会话只注一次（与 Claude SessionStart 语义一致）；子 Agent 轮跳过。
 */

import {
  HOOK_SESSION_START,
  debugLog,
  hooksDisabled,
  isAembProject,
  isAembSubagent,
  prependContextToParts,
  runHook,
} from "../lib/aemb-context.js"

// 进程内去重：同一会话只在首条消息注入一次。
const processedSessions = new Set()

// OpenCode 1.2.x 要求插件是工厂函数：export default async (input) => hooks。
export default async ({ directory }) => {
  debugLog("session", "plugin loaded, directory:", directory)

  return {
    event: ({ event }) => {
      try {
        // 压缩后清除去重标记，使压缩出的新会话能重新注入现场。
        if (event && event.type === "session.compacted" && event.properties && event.properties.sessionID) {
          processedSessions.delete(event.properties.sessionID)
          debugLog("session", "cleared dedupe after compaction:", event.properties.sessionID)
        }
      } catch (e) {
        debugLog("session", "event error:", e && e.message ? e.message : String(e))
      }
    },

    "chat.message": async (input, output) => {
      try {
        if (hooksDisabled()) return
        if (isAembSubagent(input)) {
          debugLog("session", "skip subagent turn:", input && input.agent)
          return
        }
        if (!isAembProject(directory)) return

        const sessionID = input && input.sessionID
        if (sessionID && processedSessions.has(sessionID)) {
          debugLog("session", "skip - already injected:", sessionID)
          return
        }

        const context = runHook(directory, HOOK_SESSION_START)
        if (!context) {
          debugLog("session", "no context produced")
          if (sessionID) processedSessions.add(sessionID)
          return
        }

        prependContextToParts(output, context, "\n\n---\n\n")
        if (sessionID) processedSessions.add(sessionID)
        debugLog("session", "injected session context, length:", context.length)
      } catch (e) {
        debugLog("session", "chat.message error:", e && e.message ? e.message : String(e))
      }
    },
  }
}
