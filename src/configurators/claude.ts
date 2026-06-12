/**
 * Claude Code 配置器。
 *
 * 注入接线：项目级 .claude/settings.json 的 hook 事件（SessionStart/UserPromptSubmit/PreToolUse）
 * → Python shared hooks（必然运行，绕开 user-skill frontmatter hook 不生效的死穴）。
 * 命令：.claude/commands/aemb/<name>.md（→ /aemb:<name>）；技能：.claude/skills/aemb-<name>/SKILL.md；
 * 子 Agent：.claude/agents/aemb-*.md（push 平台，无需 prelude）。
 */
import type { Configurator, PlatformPlan } from "./types";
import { AEMB_TOOLS } from "../types/ai-tools";
import { getAgents, renderMarkdownAgent, resolveCommands, resolveSkills } from "./shared";
import { getSharedHooksForPlatform } from "./hooks";
import { hookCmd, nestedSettingsMerge } from "./merge";

export const configureClaude: Configurator = (): PlatformPlan => {
  const ctx = AEMB_TOOLS.claude.templateContext;
  const dir = ".claude";
  const files = new Map<string, string>();

  for (const c of resolveCommands(ctx)) files.set(`${dir}/commands/aemb/${c.name}.md`, c.content);
  for (const s of resolveSkills(ctx)) files.set(`${dir}/skills/${s.name}/SKILL.md`, s.content);
  for (const t of getAgents()) {
    const a = renderMarkdownAgent(t, ctx, false);
    files.set(`${dir}/agents/${a.name}.md`, a.content);
  }
  for (const h of getSharedHooksForPlatform("claude")) files.set(`${dir}/hooks/${h.name}`, h.content);

  const merges = [
    nestedSettingsMerge(`${dir}/settings.json`, (py) => ({
      SessionStart: ["startup", "clear", "compact"].map((m) => ({
        matcher: m,
        hooks: [hookCmd(py, dir, "aemb-session-start.py", 10)],
      })),
      UserPromptSubmit: [{ hooks: [hookCmd(py, dir, "aemb-inject-workflow-state.py", 5)] }],
      PreToolUse: [
        { matcher: "Task", hooks: [hookCmd(py, dir, "aemb-inject-subagent-context.py", 30)] },
        { matcher: "Agent", hooks: [hookCmd(py, dir, "aemb-inject-subagent-context.py", 30)] },
      ],
    })),
  ];

  return { files, merges };
};
