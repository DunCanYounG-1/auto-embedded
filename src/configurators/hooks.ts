/**
 * 共享 Python hook 的分发表 + 加载器（对标 Trellis 的 shared-hooks/index.ts，但表放 src、脚本放 templates）。
 *
 * 3 个 hook 本身平台无关（只读 .auto-embedded/、emit 文本），各平台只是接线方式不同。
 * 哪个平台装哪几个由下表决定 —— 单一事实源，init 写盘与 update diff 都读它，永不漂移。
 */
import * as fs from "fs";
import * as path from "path";
import { TPL } from "../constants/paths";
import { replacePythonLiterals } from "../utils/python";
import type { AITool } from "../types/ai-tools";

export type SharedHookName =
  | "aemb-session-start.py"
  | "aemb-inject-workflow-state.py"
  | "aemb-inject-subagent-context.py";

/**
 * 每平台注册的 shared hook：
 *  - push 类（claude/cursor/gemini）：三件齐（SessionStart + 每轮面包屑 + 子 Agent 注入）。
 *  - pull 类（codex/copilot）：只装每轮面包屑（含 bootstrap 提示）；子 Agent 靠 prelude 自取，不装 subagent hook。
 *    SessionStart：codex 0.5+ 因防递归移除，靠 workflow-state 的 bootstrap；copilot 用自带 session-start（见其 configurator）。
 *  - opencode：JS 插件，不在此表（见 opencode configurator）。
 *  - windsurf 及 command 类：无 hook。
 */
export const SHARED_HOOKS_BY_PLATFORM: Partial<Record<AITool, SharedHookName[]>> = {
  claude: [
    "aemb-session-start.py",
    "aemb-inject-workflow-state.py",
    "aemb-inject-subagent-context.py",
  ],
  cursor: [
    "aemb-session-start.py",
    "aemb-inject-workflow-state.py",
    "aemb-inject-subagent-context.py",
  ],
  // gemini：主会话 push，但子 Agent 注入不可靠 → 只装 SessionStart + 每轮面包屑；子 Agent 走 prelude。
  gemini: ["aemb-session-start.py", "aemb-inject-workflow-state.py"],
  codex: ["aemb-inject-workflow-state.py"],
  // copilot 自管 hook（只 sessionStart，见 copilot.ts）：userPromptSubmitted 输出不被消费，不接每轮面包屑。
};

/** 读取单个 shared hook 内容（已做 python3 字面替换）。 */
export function getSharedHook(name: SharedHookName): string {
  return replacePythonLiterals(fs.readFileSync(path.join(TPL.sharedHooks, name), "utf-8"));
}

/** 返回某平台应安装的 shared hooks（name → content）。 */
export function getSharedHooksForPlatform(id: AITool): { name: SharedHookName; content: string }[] {
  return (SHARED_HOOKS_BY_PLATFORM[id] ?? []).map((n) => ({ name: n, content: getSharedHook(n) }));
}
