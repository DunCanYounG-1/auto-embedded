/**
 * Windsurf 配置器（class-3 command：无 hook、无子 Agent、纯命令/工作流）。
 *
 * 注入接线：Windsurf 没有 hook 系统，也不支持派子 Agent，全靠用户主动触发的
 * Workflows（斜杠）+ 自动触发的 Skills。模板里 {{#AGENT_CAPABLE}} / {{#HAS_HOOKS}}
 * 块在 agentCapable=false / hasHooks=false 下由 resolvePlaceholders 自动隐去。
 * 命令：.windsurf/workflows/aemb-<name>.md（命令当 workflow，aemb- 前缀）；
 * 技能：.windsurf/skills/aemb-<name>/SKILL.md。
 * 无 hooks、无 agents、无 merges。
 */
import type { Configurator, PlatformPlan } from "./types";
import { AEMB_TOOLS } from "../types/ai-tools";
import { resolveCommands, resolveSkills } from "./shared";

export const configureWindsurf: Configurator = (): PlatformPlan => {
  const ctx = AEMB_TOOLS.windsurf.templateContext;
  const files = new Map<string, string>();

  // 用户仪式命令 → workflows（aemb- 前缀文件名，触发形如 /aemb-<name>）
  for (const c of resolveCommands(ctx)) {
    files.set(`.windsurf/workflows/aemb-${c.name}.md`, c.content);
  }
  // 自动触发技能（resolveSkills 已带 aemb- 前缀与 SKILL frontmatter）
  for (const s of resolveSkills(ctx)) {
    files.set(`.windsurf/skills/${s.name}/SKILL.md`, s.content);
  }

  return { files, merges: [] };
};
