/**
 * auto-embedded OpenCode 插件共享库。
 *
 * 设计取向（与 Trellis 在 JS 里重写全部逻辑不同）：把平台无关的注入逻辑留在 3 个
 * python hook 里（.opencode/hooks/aemb-*.py，与 Claude/Gemini 同一份脚本），JS 这边
 * 只负责"用 node 子进程跑 python、把 stdout 当注入上下文喂给 opencode 插件 API"。
 * 好处：JS 与 python 零逻辑重复，hook 行为跨平台一致，升级只改一处。
 *
 * 本文件平台无关；spawn 用的 python 命令由 init 期 resolvePlaceholders 把
 * {{PYTHON_CMD}} 替换为探测到的解释器（Windows 多为 python，*nix 为 python3）。
 */

import { existsSync, appendFileSync } from "fs"
import { join } from "path"
import { spawnSync } from "child_process"
import process from "process"

// init 期被 resolvePlaceholders 替换为真实解释器；模板里以占位符存在。
const PYTHON_CMD = "{{PYTHON_CMD}}"

const ROOT_MARKER = ".auto-embedded"
const HOOKS_REL = join(".opencode", "hooks")

// hook 文件名（与 templates/shared-hooks 一致；本平台显式写进 .opencode/hooks/）。
export const HOOK_SESSION_START = "aemb-session-start.py"
export const HOOK_WORKFLOW_STATE = "aemb-inject-workflow-state.py"
export const HOOK_SUBAGENT = "aemb-inject-subagent-context.py"

/** 调试日志（仅在 AEMB_PLUGIN_DEBUG=1 时落盘到系统临时目录），失败静默。 */
export function debugLog(prefix, ...args) {
  if (process.env.AEMB_PLUGIN_DEBUG !== "1") return
  try {
    const tmp = process.env.TMPDIR || process.env.TEMP || process.env.TMP || "/tmp"
    const line =
      `[${new Date().toISOString()}] [aemb:${prefix}] ` +
      args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") +
      "\n"
    appendFileSync(join(tmp, "aemb-opencode-plugin.log"), line)
  } catch {
    // ignore
  }
}

/** 非交互 / 显式关闭时跳过注入（与 python 端 should_skip 对齐，避免污染脚本会话）。 */
export function hooksDisabled() {
  return (
    process.env.AEMB_HOOKS === "0" ||
    process.env.AEMB_DISABLE_HOOKS === "1" ||
    process.env.OPENCODE_NON_INTERACTIVE === "1"
  )
}

/** 是否 auto-embedded 工程（存在 .auto-embedded/ 标记目录）。 */
export function isAembProject(directory) {
  return existsSync(join(directory, ROOT_MARKER))
}

/**
 * 跑一个 python hook，返回其 stdout（已 trim 尾部换行）。失败/超时/空输出返回 ""。
 *  - directory 作为 cwd 且经 AEMB_PROJECT_DIR 传给脚本，保证 hook 能定位项目根。
 *  - stdinText 非空时写到子进程 stdin（subagent hook 读 stdin JSON 取角色）。
 */
export function runHook(directory, hookName, stdinText = "") {
  const scriptPath = join(directory, HOOKS_REL, hookName)
  if (!existsSync(scriptPath)) {
    debugLog("run", "hook not found:", scriptPath)
    return ""
  }
  try {
    const r = spawnSync(PYTHON_CMD, [scriptPath], {
      cwd: directory,
      timeout: 30000,
      encoding: "utf-8",
      input: stdinText,
      env: {
        ...process.env,
        AEMB_PROJECT_DIR: directory,
        PYTHONIOENCODING: "utf-8",
      },
    })
    if (r.error) {
      debugLog("run", "spawn error:", r.error.message)
      return ""
    }
    const out = typeof r.stdout === "string" ? r.stdout : ""
    return out.replace(/\s+$/, "")
  } catch (e) {
    debugLog("run", "exception:", e && e.message ? e.message : String(e))
    return ""
  }
}

// aemb-scout / aemb-builder / aemb-verifier 子 Agent 名（OpenCode 用文件名作 agent 名）。
const AEMB_SUBAGENT_RE = /^aemb-(scout|builder|verifier)$/

/**
 * 判断当前 chat.message 是否发生在 auto-embedded 子 Agent 轮内。
 * 子 Agent 由 Task/agent 工具派生时，OpenCode 会把 input.agent 设为该 agent 名。
 * 子 Agent 的上下文由父会话 tool.execute.before 注入，避免在子 Agent 轮再注入主会话面包屑。
 */
export function isAembSubagent(input) {
  if (!input || typeof input !== "object") return false
  const agent = typeof input.agent === "string" ? input.agent.trim() : ""
  return AEMB_SUBAGENT_RE.test(agent)
}

/**
 * 把 context 文本拼到 chat.message 的输出 parts 最前面（保证持久化进会话历史）。
 * 优先合并进已有 text part，否则插入新 text part。prefixSep 控制与原文的分隔。
 */
export function prependContextToParts(output, context, prefixSep = "\n\n") {
  const parts = (output && output.parts) || []
  const idx = parts.findIndex((p) => p && p.type === "text" && p.text !== undefined)
  if (idx !== -1) {
    const original = parts[idx].text || ""
    parts[idx].text = `${context}${prefixSep}${original}`
  } else {
    parts.unshift({ type: "text", text: context })
  }
}
