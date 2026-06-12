/**
 * Gemini CLI 配置器（主会话 push、子 Agent pull 的 class-2 平台）。
 *
 * 注入接线：项目级 .gemini/settings.json 的 hook 事件（SessionStart + BeforeAgent，嵌套 schema）→ Python
 * shared hooks。Gemini CLI 用 BeforeAgent（非 UserPromptSubmit）做每轮注入，matcher 用空串（全匹配），
 * timeout 单位毫秒（与 Trellis gemini 一致）。子 Agent 提示链路不可靠，故只装两件、不装 subagent hook，
 * 子 Agent 走 prelude 自取上下文。
 *
 * 布局：
 *  - .gemini/commands/aemb/<name>.toml ← 命令 body 包成 gemini 命令 toml（description + prompt 三引号）→ /aemb:<name>
 *  - .agents/skills/aemb-<name>/SKILL.md ← 共享技能层（Gemini CLI 0.40+ 原生读 .agents/skills）
 *  - .gemini/agents/aemb-*.md ← 子 Agent（pull，builder/verifier 注入 prelude）
 *  - .gemini/hooks/<name>.py ← 共享 python hook（session-start + workflow-state）
 *  - .gemini/settings.json ← MERGE 合并 hook 接线
 */
import type { Configurator, PlatformPlan } from "./types";
import { AEMB_TOOLS } from "../types/ai-tools";
import { getAgents, renderMarkdownAgent, resolveCommands, resolveSkillsNeutral } from "./shared";
import { getSharedHooksForPlatform } from "./hooks";
import { hookCmd, nestedSettingsMerge } from "./merge";

/** gemini 命令 toml 里的一行简述（命令调色板展示用）。 */
const CMD_DESC: Record<string, string> = {
  start: "开始一个新的 auto-embedded 任务（进 RESEARCH）。",
  continue: "在正确的 RIPER 阶段恢复并继续当前任务。",
  "finish-work": "收尾：机械门禁 + REVIEW 三层 + promote 回流 + journal + 归档。",
  status: "打印当前 auto-embedded 现场状态。",
  journal: "写一条跨会话记忆到 workspace/journal.md。",
};

/** 把命令 body 包成 gemini 命令 toml（description = 一句话；prompt = 三引号包 body）。 */
function toGeminiToml(name: string, body: string): string {
  const desc = CMD_DESC[name] ?? "auto-embedded 命令。";
  return `description = "${desc}"\n\nprompt = """\n${body}\n"""\n`;
}

export const configureGemini: Configurator = (): PlatformPlan => {
  const ctx = AEMB_TOOLS.gemini.templateContext;
  const dir = ".gemini";
  const files = new Map<string, string>();

  // 命令 → .gemini/commands/aemb/<name>.toml
  for (const c of resolveCommands(ctx)) {
    files.set(`${dir}/commands/aemb/${c.name}.toml`, toGeminiToml(c.name, c.content));
  }
  // 技能 → 跨平台共享技能层 .agents/skills/aemb-<name>/SKILL.md
  // 用 neutral 渲染：与 Codex 同写该目录时字节一致（避免 last-writer-wins 覆盖出错的 CMD_REF）。
  for (const s of resolveSkillsNeutral(ctx)) files.set(`.agents/skills/${s.name}/SKILL.md`, s.content);
  // 子 Agent → .gemini/agents/aemb-*.md（pull：builder/verifier 注入 prelude）
  for (const t of getAgents()) {
    const a = renderMarkdownAgent(t, ctx, true);
    files.set(`${dir}/agents/${a.name}.md`, a.content);
  }
  // 共享 hook（gemini 只 2 个：session-start + workflow-state）
  for (const h of getSharedHooksForPlatform("gemini")) files.set(`${dir}/hooks/${h.name}`, h.content);

  // settings.json 合并：嵌套 schema。事件 SessionStart + BeforeAgent（Gemini 用 BeforeAgent 而非
  // UserPromptSubmit 做每轮注入）；matcher 空串=全匹配；timeout 单位毫秒（Gemini 约定，非秒）。
  const merges = [
    nestedSettingsMerge(`${dir}/settings.json`, (py) => ({
      SessionStart: [{ matcher: "", hooks: [hookCmd(py, dir, "aemb-session-start.py", 30000)] }],
      // hook 输出 JSON 时 hookEventName 必须是 BeforeAgent（作为 argv 传给脚本）
      BeforeAgent: [{ matcher: "", hooks: [hookCmd(py, dir, "aemb-inject-workflow-state.py", 15000, "BeforeAgent")] }],
    })),
  ];

  return { files, merges };
};
