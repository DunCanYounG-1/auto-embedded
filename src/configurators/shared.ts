/**
 * 配置器共享工具：占位符解析 + common 模板加载 + 技能/命令/Agent 渲染 + pull-based prelude。
 *
 * 同一份 common 模板（templates/common/{commands,skills,agents}）通过占位符渲染成各平台正确的
 * 措辞与语法 —— 这是"一套内核、全平台交付"的关键。
 */
import * as fs from "fs";
import * as path from "path";
import type { TemplateContext } from "../types/ai-tools";
import { TPL } from "../constants/paths";
import { pythonCmd, replacePythonLiterals } from "../utils/python";

// ---------------------------------------------------------------------------
// 占位符解析
// ---------------------------------------------------------------------------
const RE_PYTHON_CMD = /\{\{PYTHON_CMD\}\}/g;
const RE_CMD_REF = /\{\{CMD_REF:([\w][\w-]*)\}\}/g;
const RE_EXECUTOR_AI = /\{\{EXECUTOR_AI\}\}/g;
const RE_USER_ACTION_LABEL = /\{\{USER_ACTION_LABEL\}\}/g;
const RE_CLI_FLAG = /\{\{CLI_FLAG\}\}/g;
const RE_BLANK = /\n{3,}/g;

const COND_FLAGS = ["AGENT_CAPABLE", "HAS_HOOKS"] as const;
type CondFlag = (typeof COND_FLAGS)[number];
const COND_RE: Record<CondFlag, { pos: RegExp; neg: RegExp }> = Object.fromEntries(
  COND_FLAGS.map((f) => [
    f,
    {
      pos: new RegExp(`\\{\\{#${f}\\}\\}([\\s\\S]*?)\\{\\{/${f}\\}\\}`, "g"),
      neg: new RegExp(`\\{\\{\\^${f}\\}\\}([\\s\\S]*?)\\{\\{/${f}\\}\\}`, "g"),
    },
  ]),
) as Record<CondFlag, { pos: RegExp; neg: RegExp }>;

/**
 * 解析占位符。无 ctx 时只解析 {{PYTHON_CMD}} 与 python3 字面（用于 settings/hooks-config 等）。
 */
export function resolvePlaceholders(
  content: string,
  ctx?: TemplateContext,
  opts?: { neutralCmdRef?: boolean },
): string {
  let r = replacePythonLiterals(content.replace(RE_PYTHON_CMD, pythonCmd()));
  if (!ctx) return r;
  // neutralCmdRef：{{CMD_REF:x}} 渲染成不带平台前缀的 `aemb-x`，让多平台同写 .agents/skills 时字节一致。
  r = r.replace(RE_CMD_REF, (_m, name: string) =>
    opts?.neutralCmdRef ? `\`aemb-${name}\`` : `${ctx.cmdRefPrefix}${name}`);
  r = r.replace(RE_EXECUTOR_AI, ctx.executorAI);
  r = r.replace(RE_USER_ACTION_LABEL, ctx.userActionLabel);
  r = r.replace(RE_CLI_FLAG, ctx.cliFlag);
  const vals: Record<CondFlag, boolean> = {
    AGENT_CAPABLE: ctx.agentCapable,
    HAS_HOOKS: ctx.hasHooks,
  };
  for (const f of COND_FLAGS) {
    const { pos, neg } = COND_RE[f];
    pos.lastIndex = 0;
    neg.lastIndex = 0;
    r = r.replace(pos, vals[f] ? "$1" : "");
    r = r.replace(neg, vals[f] ? "" : "$1");
  }
  return r.replace(RE_BLANK, "\n\n");
}

// ---------------------------------------------------------------------------
// common 模板加载（body-only，无 frontmatter）
// ---------------------------------------------------------------------------
export interface Template {
  name: string; // 文件名去掉 .md，如 "continue"
  content: string; // 原始 body（未解析）
}

function loadDir(dir: string): Template[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  return names.map((f) => ({
    name: f.replace(/\.md$/, ""),
    content: fs.readFileSync(path.join(dir, f), "utf-8"),
  }));
}

/** 用户仪式命令（start/continue/finish-work/status/journal）。 */
export function getCommands(): Template[] {
  return loadDir(TPL.commonCommands);
}

/** 自动触发技能（brainstorm/check/break-loop）。 */
export function getSkills(): Template[] {
  return loadDir(TPL.commonSkills);
}

/** 子 Agent 角色 body（aemb-scout/aemb-builder/aemb-verifier）。 */
export function getAgents(): Template[] {
  return loadDir(TPL.commonAgents);
}

/**
 * 工具技能 body（21 个：build/flash/debug/serial/can/modbus/visa/static/memory/rtos）。
 * 与工作流技能不同：这些文件**自带 frontmatter**（name: aemb-<x> + description，源自 embedded-dev），
 * 正文已机械适配指向 .auto-embedded/tools/<x>/，故 resolveToolSkills 只解析占位符、不再包 frontmatter。
 */
export function getToolSkills(): Template[] {
  return loadDir(TPL.commonToolSkills);
}

// ---------------------------------------------------------------------------
// frontmatter 包装（技能 / 命令）
// ---------------------------------------------------------------------------
/** 技能描述（供 skill matcher 自动触发；skill-only 平台把命令也当技能，故命令名也要有）。 */
const SKILL_DESC: Record<string, string> = {
  start:
    "新建 auto-embedded 任务并进入 RIPER-5 的 RESEARCH 阶段：识别芯片/库、读 spec、引脚规划写 hw-lock。开始新任务、起一个固件开发会话时用。",
  continue:
    "恢复当前任务现场，按 RIPER 阶段在正确步骤接着干：载入 active task/阶段/spec 索引/硬件锁，做五问重启并路由。断点续作时用。",
  "finish-work":
    "收尾任务：先跑机械门禁(check.py)，再 REVIEW 三层(验证门/硬件合规/分层门禁)，promote 学习回流进 spec，写 journal，归档。写完代码准备结束会话时用。",
  status: "打印 auto-embedded 现场：active task、RIPER 阶段、spec 层、硬件锁、开发者。查看当前状态时用。",
  journal:
    "把本次会话的过程叙事（做了什么/决策/下一步）写进 workspace/journal.md，下次 SessionStart 自动注入最近几条。会话收尾或做了重要决策时用。",
  brainstorm:
    "需求不清/有多种方案/新功能时，进入 PLAN 前一问一答收敛需求并落成 prd：一次只问一个高价值问题，收敛到 MVP。需求模糊时用。",
  check:
    "机械门禁：分层架构 ARCH-1~8 + 硬件资源锁冲突(pin/dma/irq/timer) + spec 完整性。REVIEW 阶段与提交前、或长会话中怀疑漂移时用。",
  "break-loop":
    "修完 bug 后做深度根因复盘，打破修了又犯：分析根因类别/为何没发现/真正修复/防复发机制/同类排查，并沉淀进 spec。修完 bug（尤其反复出现的）后用。",
};

/** 命令调色板里的一行简述。 */
const CMD_DESC: Record<string, string> = {
  start: "开始一个新的 auto-embedded 任务（进 RESEARCH）。",
  continue: "在正确的 RIPER 阶段恢复并继续当前任务。",
  "finish-work": "收尾：机械门禁 + REVIEW 三层 + promote 回流 + journal + 归档。",
  status: "打印当前 auto-embedded 现场状态。",
  journal: "写一条跨会话记忆到 workspace/journal.md。",
  brainstorm: "进 PLAN 前一问一答收敛需求 → prd。",
  check: "跑机械门禁（分层架构 + 硬件冲突 + spec）。",
  "break-loop": "bug 根因复盘，防修了又犯，沉淀进 spec。",
};

/** 包成 SKILL.md 的 YAML frontmatter（用 aemb- 前缀）。 */
export function wrapSkillFrontmatter(name: string, body: string): string {
  const base = name.replace(/^aemb-/, "");
  const desc = SKILL_DESC[base];
  if (!desc) throw new Error(`缺少技能描述: ${base}（补进 shared.ts SKILL_DESC）`);
  return `---\nname: ${name}\ndescription: "${desc}"\n---\n\n${body}`;
}

/** 包成命令的 YAML frontmatter（部分平台需要，如 qoder）。 */
export function wrapCommandFrontmatter(name: string, body: string): string {
  const base = name.replace(/^aemb-/, "");
  const desc = CMD_DESC[base] ?? SKILL_DESC[base] ?? "auto-embedded 命令。";
  return `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}`;
}

export interface Resolved {
  name: string;
  content: string;
}

/** 命令解析为纯 body（不包 frontmatter）——"both" 平台的用户仪式命令。 */
export function resolveCommands(ctx: TemplateContext): Resolved[] {
  return getCommands().map((t) => ({ name: t.name, content: resolvePlaceholders(t.content, ctx) }));
}

/**
 * 工具技能解析（21 个）：文件自带 frontmatter，只解析占位符，不再包 frontmatter。
 * 全平台都交付（嵌入式框架的"动手"层）。
 */
export function resolveToolSkills(ctx: TemplateContext): Resolved[] {
  return getToolSkills().map((t) => ({
    name: `aemb-${t.name}`,
    content: resolvePlaceholders(t.content, ctx),
  }));
}

/** 自动触发技能 = 工作流技能(brainstorm/check/break-loop) + 21 个工具技能（aemb- 前缀 + SKILL frontmatter）。 */
export function resolveSkills(ctx: TemplateContext): Resolved[] {
  const workflow = getSkills().map((t) => ({
    name: `aemb-${t.name}`,
    content: wrapSkillFrontmatter(`aemb-${t.name}`, resolvePlaceholders(t.content, ctx)),
  }));
  return [...workflow, ...resolveToolSkills(ctx)];
}

/** 全部（命令 + 工作流技能 + 工具技能）都当技能 —— skill-only 平台（Codex/Kiro/Qoder）。 */
export function resolveAllAsSkills(ctx: TemplateContext): Resolved[] {
  const cmdAndWorkflow = [...getCommands(), ...getSkills()].map((t) => ({
    name: `aemb-${t.name}`,
    content: wrapSkillFrontmatter(`aemb-${t.name}`, resolvePlaceholders(t.content, ctx)),
  }));
  return [...cmdAndWorkflow, ...resolveToolSkills(ctx)];
}

// ---------------------------------------------------------------------------
// neutral 变体（写共享 .agents/skills 时用，让 Codex 与 Gemini 同写产出字节一致；
// {{CMD_REF}} 渲染成不带平台前缀的 `aemb-x`）。
// ---------------------------------------------------------------------------
function neutral(content: string, ctx: TemplateContext): string {
  return resolvePlaceholders(content, ctx, { neutralCmdRef: true });
}

/** resolveToolSkills 的 neutral 版（工具技能无 CMD_REF，结果与普通版一致，仅为对称）。 */
export function resolveToolSkillsNeutral(ctx: TemplateContext): Resolved[] {
  return getToolSkills().map((t) => ({ name: `aemb-${t.name}`, content: neutral(t.content, ctx) }));
}

/** resolveSkills 的 neutral 版（Gemini 写 .agents/skills 用）。 */
export function resolveSkillsNeutral(ctx: TemplateContext): Resolved[] {
  const workflow = getSkills().map((t) => ({
    name: `aemb-${t.name}`,
    content: wrapSkillFrontmatter(`aemb-${t.name}`, neutral(t.content, ctx)),
  }));
  return [...workflow, ...resolveToolSkillsNeutral(ctx)];
}

/** resolveAllAsSkills 的 neutral 版（Codex 写 .agents/skills 用）。 */
export function resolveAllAsSkillsNeutral(ctx: TemplateContext): Resolved[] {
  const cmdAndWorkflow = [...getCommands(), ...getSkills()].map((t) => ({
    name: `aemb-${t.name}`,
    content: wrapSkillFrontmatter(`aemb-${t.name}`, neutral(t.content, ctx)),
  }));
  return [...cmdAndWorkflow, ...resolveToolSkillsNeutral(ctx)];
}

// ---------------------------------------------------------------------------
// 子 Agent 角色 + pull-based prelude（class-2 平台 hook 改不了子 Agent 提示，靠自取）
// ---------------------------------------------------------------------------
export type AgentRole = "research" | "implement" | "verify";

/** Agent 文件名 → 角色 / jsonl。aemb-scout=research, aemb-builder=implement, aemb-verifier=verify。 */
export function detectAgentRole(name: string): AgentRole | null {
  const base = name.replace(/\.(md|toml)$/, "");
  if (base === "aemb-scout") return "research";
  if (base === "aemb-builder") return "implement";
  if (base === "aemb-verifier") return "verify";
  return null;
}

/** 把 markdown 内容拆成 frontmatter + body（无 frontmatter 返回 null）。 */
export function splitFrontmatter(content: string): { frontmatter: string; body: string } | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  return { frontmatter: m[1], body: content.slice(m[0].length) };
}

/**
 * pull-based prelude：告诉子 Agent 自己加载 task 上下文（因为本平台 hook 注入不到子 Agent 提示）。
 * research 角色不加（它搜 spec 树、不依赖 active task，与 hook 平台一致）。
 */
export function buildPullPrelude(role: AgentRole): string {
  const jsonl = role === "verify" ? "verify.jsonl" : "implement.jsonl";
  return replacePythonLiterals(`## 必读：先自取 auto-embedded 上下文

本平台 hook 不会自动把任务上下文注入到你（子 Agent）的提示，开工前你必须自己加载：

1. 看主控派发提示首行是否为 \`Active task: <路径>\`（本平台要求主控带上）；用它。
2. 否则跑 \`python3 ./.auto-embedded/scripts/get_context.py\`，读 active task 路径与阶段。
3. 两者都没有 → 问用户该做哪个任务，不要猜。

随后读该任务目录下：\`prd.md\`（需求）、\`${jsonl}\`（本角色相关 spec 选择器，逐行 \`{"file":"spec/...","reason":"..."}\`），
并把每行 \`file\` 指向的 spec 读进来照做（跳过没有 \`file\` 字段的示例行）。jsonl 无有效行就读 prd + 用
\`python3 ./.auto-embedded/scripts/get_context.py --packages\` 列 spec 自行挑选，别卡住。

---

`);
}

/** markdown Agent：解析占位符；class-2(pull) 平台在 frontmatter 后插入 prelude。 */
export function renderMarkdownAgent(t: Template, ctx: TemplateContext, pull: boolean): Resolved {
  const resolved = resolvePlaceholders(t.content, ctx);
  if (!pull) return { name: t.name, content: resolved };
  const role = detectAgentRole(t.name);
  if (!role || role === "research") return { name: t.name, content: resolved };
  const prelude = buildPullPrelude(role);
  const sec = splitFrontmatter(resolved);
  if (!sec) return { name: t.name, content: prelude + resolved };
  const body = sec.body.replace(/^(\r?\n)+/, "");
  return { name: t.name, content: `---\n${sec.frontmatter}\n---\n\n${prelude}${body}` };
}
