/**
 * GitHub Copilot 配置器（class-2 pull 平台）。
 *
 * 注入接线：Copilot CLI hook 文件 { version:1, hooks:{ sessionStart:[{type,command,timeoutSec}] } }。
 * 只装 sessionStart（一次性注入现场）：Copilot 的 userPromptSubmitted 事件"输出不被处理"（官方文档），
 * 故无每轮面包屑（属平台能力限制，如 Cursor）；子 Agent 走 prelude 自取上下文（renderMarkdownAgent pull=true）。
 *
 * 布局：
 *  - .github/prompts/aemb-<name>.prompt.md    ← 用户仪式命令（resolveCommands，纯 body）→ /aemb-<name>
 *  - .github/skills/aemb-<name>/SKILL.md       ← 自动触发技能（resolveSkills，含 SKILL frontmatter）
 *  - .github/agents/aemb-*.agent.md            ← 子 Agent（pull：builder/verifier 注入 prelude）；
 *                                                 frontmatter 的逗号分隔 tools 归一成 Copilot 的 YAML 列表
 *  - .github/copilot/hooks/aemb-session-start.py      ← 共享 session-start（输出 JSON 信封）
 *  - .github/copilot/hooks.json + .github/hooks/aemb.json（同 schema）← MERGE（version:1 + sessionStart）
 */
import type { Configurator, MergeFile, PlatformPlan } from "./types";
import { AEMB_TOOLS } from "../types/ai-tools";
import { getAgents, renderMarkdownAgent, resolveCommands, resolveSkills, splitFrontmatter } from "./shared";
import { getSharedHook } from "./hooks";

/** Claude 风格工具名 → Copilot YAML 列表里的工具名（多个可映射到同一项，去重）。 */
function mapToolToCopilot(tool: string): string[] {
  switch (tool) {
    case "Read":
      return ["read"];
    case "Write":
    case "Edit":
      return ["edit"];
    case "Glob":
    case "Grep":
      return ["search"];
    case "Bash":
      return ["execute"];
    case "WebSearch":
    case "WebFetch":
      return ["web"];
    default:
      return [];
  }
}

/**
 * 把子 Agent frontmatter 里 `tools: Read, Write, ...` 这一行归一成 Copilot 的 YAML 列表：
 *   tools:
 *     - read
 *     - edit
 * 其余行原样保留。无 frontmatter 则原样返回。
 */
function normalizeCopilotAgentTools(content: string): string {
  const sec = splitFrontmatter(content);
  if (!sec) return content;
  const lines = sec.frontmatter.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("tools:")) {
      out.push(line);
      continue;
    }
    const legacy = line
      .slice("tools:".length)
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const tools = [...new Set(legacy.flatMap(mapToolToCopilot))];
    out.push("tools:");
    for (const t of tools) out.push(`  - ${t}`);
  }
  return `---\n${out.join("\n")}\n---\n\n${sec.body.replace(/^(\r?\n)+/, "")}`;
}

export const configureCopilot: Configurator = (): PlatformPlan => {
  const ctx = AEMB_TOOLS.copilot.templateContext;
  const dir = ".github/copilot"; // configDir：仅 hook 脚本与 hooks.json
  const files = new Map<string, string>();

  // 命令 → .github/prompts/aemb-<name>.prompt.md（纯 body）
  for (const c of resolveCommands(ctx)) {
    files.set(`.github/prompts/aemb-${c.name}.prompt.md`, c.content);
  }
  // 技能 → .github/skills/aemb-<name>/SKILL.md
  for (const s of resolveSkills(ctx)) files.set(`.github/skills/${s.name}/SKILL.md`, s.content);
  // 子 Agent → .github/agents/aemb-*.agent.md（pull prelude + tools 归一）
  for (const t of getAgents()) {
    const a = renderMarkdownAgent(t, ctx, true);
    files.set(`.github/agents/${a.name}.agent.md`, normalizeCopilotAgentTools(a.content));
  }

  // hook 脚本：只装共享 session-start（输出 JSON 信封 hookSpecificOutput.additionalContext，
  // 正是 Copilot CLI sessionStart 会消费的格式）。Copilot 的 userPromptSubmitted 事件"输出不被处理"
  //（官方 hook 文档），故不接每轮面包屑——Copilot 主会话靠 sessionStart 一次性注入现场、子 Agent 走 prelude
  //（与 Cursor 一样属平台能力限制：无可用的"每轮且输出被消费"事件）。
  const SS_SCRIPT = "aemb-session-start.py";
  files.set(`${dir}/hooks/${SS_SCRIPT}`, getSharedHook("aemb-session-start.py"));

  // Copilot CLI hook 文件 schema：{ "version": 1, "hooks": { "sessionStart": [ {type,command,timeoutSec} ] } }。
  // 自写 MergeFile：写 version=1（CLI 要求）、用 timeoutSec（非 timeout）；scrub 对非法 JSON 原样保留不删。
  const isOurs = (it: unknown): boolean =>
    !!it &&
    typeof it === "object" &&
    typeof (it as { command?: unknown }).command === "string" &&
    (it as { command: string }).command.includes(SS_SCRIPT);
  const copilotMerge = (filePath: string): MergeFile => ({
    path: filePath,
    apply(existing, py) {
      let obj: Record<string, unknown> = {};
      if (existing) {
        try {
          obj = JSON.parse(existing) as Record<string, unknown>;
        } catch {
          obj = {};
        }
      }
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};
      obj.version = 1;
      if (!obj.hooks || typeof obj.hooks !== "object" || Array.isArray(obj.hooks)) obj.hooks = {};
      const hooks = obj.hooks as Record<string, unknown[]>;
      const ss = Array.isArray(hooks.sessionStart) ? hooks.sessionStart.filter((i) => !isOurs(i)) : [];
      ss.push({ type: "command", command: `${py} ${dir}/hooks/${SS_SCRIPT}`, timeoutSec: 30 });
      hooks.sessionStart = ss;
      return JSON.stringify(obj, null, 2) + "\n";
    },
    scrub(existing) {
      let obj: Record<string, unknown>;
      try {
        const o = JSON.parse(existing) as unknown;
        if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not-object");
        obj = o as Record<string, unknown>;
      } catch {
        return { content: existing, fullyEmpty: false }; // 非法 JSON 原样保留
      }
      const hooks = obj.hooks as Record<string, unknown[]> | undefined;
      if (hooks && Array.isArray(hooks.sessionStart)) {
        hooks.sessionStart = hooks.sessionStart.filter((i) => !isOurs(i));
        if (!hooks.sessionStart.length) delete hooks.sessionStart;
      }
      if (hooks && Object.keys(hooks).length === 0) delete obj.hooks;
      const keys = Object.keys(obj);
      // 只剩 version（我们写入的）→ 视为空，整删
      const fullyEmpty = keys.length === 0 || (keys.length === 1 && keys[0] === "version");
      return { content: JSON.stringify(obj, null, 2) + "\n", fullyEmpty };
    },
    marker: SS_SCRIPT,
  });

  // copilot/hooks.json 与仓库级 .github/hooks/aemb.json 同 schema（同逻辑、换路径）。
  return { files, merges: [copilotMerge(`${dir}/hooks.json`), copilotMerge(".github/hooks/aemb.json")] };
};
