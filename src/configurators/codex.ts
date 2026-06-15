/**
 * Codex 配置器（class-2 pull：hook 只触达主会话，子 Agent 靠 prelude 自取）。
 *
 * 注入接线：
 *  - 共享技能层 .agents/skills/aemb-<name>/SKILL.md ← resolveAllAsSkills（命令也当技能，
 *    Codex 用 $aemb-<name> 调用）；该层是开放标准，Cursor/Gemini CLI/Copilot 等也能读。
 *  - 子 Agent .codex/agents/aemb-*.toml ← 取 common agent 的 frontmatter(name/description)+body
 *    拼成 Codex TOML；aemb-builder/aemb-verifier 把 buildPullPrelude(role) 注入
 *    developer_instructions 顶部（aemb-scout 不加，与 hook 平台一致）。
 *    [features].multi_agent=false 关掉子 Agent 的 collab 工具，防 wait_agent 自死锁。
 *  - 主会话面包屑 .codex/hooks/aemb-inject-workflow-state.py ← getSharedHooksForPlatform("codex")。
 *  - .codex/hooks.json ← MERGE（UserPromptSubmit→inject-workflow-state，嵌套 {hooks:[cmd]} schema）。
 *    Codex 0.5+ 移除 SessionStart（防递归），靠 workflow-state 的 bootstrap 提示用户调 $aemb-start。
 *  - .codex/config.toml ← MERGE（sentinel 注释块包裹 aemb 段，幂等增删）。
 */
import * as fs from "fs";
import * as path from "path";
import type { Configurator, MergeFile, PlatformPlan } from "./types";
import { AEMB_TOOLS } from "../types/ai-tools";
import { TPL } from "../constants/paths";
import { replacePythonLiterals } from "../utils/python";
import {
  buildPullPrelude,
  detectAgentRole,
  getAgents,
  resolveAllAsSkillsNeutral,
  resolvePlaceholders,
  splitFrontmatter,
} from "./shared";
import { getSharedHooksForPlatform } from "./hooks";
import { hookCmd, nestedSettingsMerge } from "./merge";

// ---------------------------------------------------------------------------
// config.toml 的 sentinel 块（包裹 aemb 段，apply 先删旧块再加 → 幂等）
// ---------------------------------------------------------------------------
const CFG_BEGIN = "# >>> auto-embedded begin (managed) >>>";
const CFG_END = "# <<< auto-embedded end (managed) <<<";
// 块体：sentinel 之间的内容，运行时只剥这段、不动用户其它配置。整块正则（含前导空行）。
const CFG_BLOCK_RE = new RegExp(
  `\\n*${escapeRe(CFG_BEGIN)}[\\s\\S]*?${escapeRe(CFG_END)}\\n*`,
  "g",
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 读 templates/codex/config.toml 作为 aemb 段块体（已做 python3 字面替换）。 */
function readCodexConfigBody(): string {
  const raw = fs.readFileSync(path.join(TPL.platform("codex"), "config.toml"), "utf-8");
  return replacePythonLiterals(raw).trimEnd();
}

/** config.toml 的合并项：把 aemb 段以 sentinel 块写入/更新；scrub 剥净。 */
function codexConfigMerge(filePath: string): MergeFile {
  return {
    path: filePath,
    apply(existing) {
      const base = (existing ?? "").replace(CFG_BLOCK_RE, "").trimEnd();
      const block = `${CFG_BEGIN}\n${readCodexConfigBody()}\n${CFG_END}`;
      return base ? `${base}\n\n${block}\n` : `${block}\n`;
    },
    scrub(existing) {
      const content = existing.replace(CFG_BLOCK_RE, "").trimEnd();
      const fullyEmpty = content.length === 0;
      return { content: fullyEmpty ? "" : content + "\n", fullyEmpty };
    },
    marker: CFG_BEGIN, // config.toml 用 sentinel 注释而非 aemb- 字面，doctor 据此识别
  };
}

// ---------------------------------------------------------------------------
// common agent(.md) → Codex 子 Agent(.toml)
// ---------------------------------------------------------------------------
/** TOML basic string 转义（用于 name/description 单行字段）。 */
function tomlBasic(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 从 frontmatter 文本里抓某个键的值（去掉首尾引号）。 */
function fmValue(frontmatter: string, key: string): string {
  const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']/, "").replace(/["']$/, "");
}

/**
 * 把一个 common agent 模板渲染成 Codex .toml：
 *  - name/description 取自 frontmatter；
 *  - developer_instructions = body（builder/verifier 顶部注入 pull prelude）；
 *  - [features] 关掉 collab 工具（防子 Agent 自死锁，与 Trellis 一致）。
 */
function renderCodexAgentToml(name: string, rawContent: string): string {
  const resolved = resolvePlaceholders(rawContent, AEMB_TOOLS.codex.templateContext);
  const sec = splitFrontmatter(resolved);
  const frontmatter = sec ? sec.frontmatter : "";
  const body = (sec ? sec.body : resolved).replace(/^(\r?\n)+/, "").trimEnd();

  const description = fmValue(frontmatter, "description") || `auto-embedded ${name} 子 Agent。`;

  const role = detectAgentRole(name);
  const prelude = role && role !== "research" ? buildPullPrelude(role) : "";
  const instructions = prelude ? `${prelude}${body}` : body;
  // 防御正文进 TOML 多行 basic 串：① 先把所有反斜杠转义成 \\——否则 \| 等 LaTeX/路径会被 Codex 严格 TOML
  //   解析器当成非法转义序列、中断整个 .toml 加载（embedded-qa 的 ‖y - y_target‖ 即触发）；
  //   ② 再把 """ 改成 ""\"（合法转义引号，不构成结束分隔符）。顺序：先转义反斜杠，再加 """ 守卫注入的 \"。
  const safeInstructions = instructions.replace(/\\/g, "\\\\").replace(/"""/g, '""\\"');

  return [
    `name = "${tomlBasic(name)}"`,
    `description = "${tomlBasic(description)}"`,
    `sandbox_mode = "workspace-write"`,
    ``,
    `developer_instructions = """`,
    safeInstructions,
    `"""`,
    ``,
    `# multi_agent = false 即不注册 spawn_agent/wait_agent/list_agents/close_agent，`,
    `# 从结构上杜绝父子继承 transcript 时 wait_agent 自死锁。`,
    `# 刻意不再写 [features.multi_agent_v2] 结构化表：Codex 0.130- 不识别该键，会以`,
    `# FeatureToml untagged-enum 反序列化失败中断整个配置加载、阻止 Codex/子 Agent 启动`,
    `# （v0.6.0 修复项）。该 bare-bool flag 跨版本都被接受，已足够关掉 collab 工具。`,
    `[features]`,
    `multi_agent = false`,
    ``,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// configurator
// ---------------------------------------------------------------------------
export const configureCodex: Configurator = (): PlatformPlan => {
  const ctx = AEMB_TOOLS.codex.templateContext;
  const dir = ".codex";
  const files = new Map<string, string>();

  // 命令 + 技能都当技能 → 共享标准技能层（$aemb-<name> 调用）。
  // 用 neutral 渲染：CMD_REF 不带平台前缀，使与 Gemini 同写 .agents/skills 的文件字节一致。
  for (const s of resolveAllAsSkillsNeutral(ctx)) {
    files.set(`.agents/skills/${s.name}/SKILL.md`, s.content);
  }

  // 子 Agent → .codex/agents/aemb-*.toml（getAgents 取 common 的原始 md，含 frontmatter）
  for (const t of getAgents()) {
    files.set(`${dir}/agents/${t.name}.toml`, renderCodexAgentToml(t.name, t.content));
  }

  // 主会话面包屑 hook（pull 类只装 inject-workflow-state，子 Agent 走 prelude 不装 subagent hook）
  for (const h of getSharedHooksForPlatform("codex")) {
    files.set(`${dir}/hooks/${h.name}`, h.content);
  }

  const merges: MergeFile[] = [
    // hooks.json：Codex 用嵌套 {hooks:[cmd]} schema，UserPromptSubmit → inject-workflow-state
    nestedSettingsMerge(`${dir}/hooks.json`, (py) => ({
      UserPromptSubmit: [{ hooks: [hookCmd(py, dir, "aemb-inject-workflow-state.py", 15)] }],
    })),
    // config.toml：sentinel 块幂等增删
    codexConfigMerge(`${dir}/config.toml`),
  ];

  return { files, merges };
};
