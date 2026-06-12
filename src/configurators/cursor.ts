/**
 * Cursor 配置器。
 *
 * 注入接线：项目级 .cursor/hooks.json 的 hook 事件（sessionStart/beforeShellExecution/preToolUse）
 * → Python shared hooks（push 平台，子 Agent 提示可被 preToolUse 注入，无需 prelude）。
 * 命令：.cursor/commands/aemb-<name>.md（→ /aemb-<name>，flat 加前缀）；
 * 技能：.cursor/skills/aemb-<name>/SKILL.md；子 Agent：.cursor/agents/<name>.md（push，无 prelude）。
 *
 * Cursor hooks.json 是扁平 schema（hooks.{event} 为 [{command, matcher?, timeout}] 数组），
 * 与 Claude 的 settings.json 嵌套 schema 不同，故走 flatHooksJsonMerge。事件映射：
 *   会话起始    → sessionStart           → aemb-session-start.py
 *   每轮提交    → beforeShellExecution    → aemb-inject-workflow-state.py（Cursor 无 UserPromptSubmit，
 *                                            借 shell 执行前注入每轮面包屑，与 Trellis 一致）
 *   子 Agent    → preToolUse(Task|Subagent) → aemb-inject-subagent-context.py
 */
import type { Configurator, PlatformPlan } from "./types";
import { AEMB_TOOLS } from "../types/ai-tools";
import { getAgents, renderMarkdownAgent, resolveCommands, resolveSkills } from "./shared";
import { getSharedHooksForPlatform } from "./hooks";
import { flatHooksJsonMerge } from "./merge";

export const configureCursor: Configurator = (): PlatformPlan => {
  const ctx = AEMB_TOOLS.cursor.templateContext;
  const dir = ".cursor";
  const files = new Map<string, string>();

  // 命令：flat + aemb- 前缀（→ /aemb-<name>）。
  for (const c of resolveCommands(ctx)) files.set(`${dir}/commands/aemb-${c.name}.md`, c.content);
  // 技能：aemb-<name>/SKILL.md。
  for (const s of resolveSkills(ctx)) files.set(`${dir}/skills/${s.name}/SKILL.md`, s.content);
  // 子 Agent：push 平台，无 prelude。文件名沿用 common 的 aemb-* 名。
  for (const t of getAgents()) {
    const a = renderMarkdownAgent(t, ctx, false);
    files.set(`${dir}/agents/${a.name}.md`, a.content);
  }
  // 三件 shared python hook。
  for (const h of getSharedHooksForPlatform("cursor")) files.set(`${dir}/hooks/${h.name}`, h.content);

  // Cursor 原生 item 形状：{command, matcher?, timeout}（无 type 字段，与 Claude settings.json 不同）。
  // stripOurFlat 靠 command 含本平台 hook 脚本名识别 aemb 片段，幂等剥旧再加。
  const cmd = (py: string, name: string, timeout: number, matcher?: string): Record<string, unknown> => {
    const item: Record<string, unknown> = { command: `${py} ${dir}/hooks/${name}` };
    if (matcher) item.matcher = matcher;
    item.timeout = timeout;
    return item;
  };

  const merges = [
    flatHooksJsonMerge(`${dir}/hooks.json`, (py) => ({
      sessionStart: [cmd(py, "aemb-session-start.py", 30)],
      beforeShellExecution: [cmd(py, "aemb-inject-workflow-state.py", 5)],
      preToolUse: [cmd(py, "aemb-inject-subagent-context.py", 30, "Task|Subagent")],
    })),
  ];

  return { files, merges };
};
