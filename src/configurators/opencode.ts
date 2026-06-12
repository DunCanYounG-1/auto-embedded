/**
 * OpenCode 配置器（push 平台，但用 JS 插件而非 python hook 接线）。
 *
 * OpenCode 无 settings.json hook 系统，靠自动加载 .opencode/plugins/*.js 注入。本平台不在
 * SHARED_HOOKS_BY_PLATFORM（不走标准 python hook 接线），故 3 个共享 python hook 由本 configurator
 * 显式写进 .opencode/hooks/；3 个 JS 插件用 node 子进程跑这些 python 脚本、把 stdout 当注入上下文
 * 喂给 OpenCode 插件 API（chat.message / tool.execute.before）。好处：JS 与 python 零逻辑重复，
 * hook 行为与 Claude/Gemini 完全一致，升级只改 templates/shared-hooks 一处。
 *
 * 布局：
 *  - .opencode/commands/aemb/<name>.md       ← resolveCommands（→ /aemb:<name>）
 *  - .opencode/skills/aemb-<name>/SKILL.md    ← resolveSkills
 *  - .opencode/agents/aemb-*.md               ← getAgents + renderMarkdownAgent(pull=false，push 平台)
 *  - .opencode/hooks/aemb-*.py                ← 3 个共享 python hook（getSharedHook 直接读）
 *  - .opencode/plugins/*.js + .opencode/lib/*.js ← JS 插件 + 共享库（templates/opencode/，{{PYTHON_CMD}} 展开）
 *  - .opencode/package.json                   ← MERGE：幂等加 @opencode-ai/plugin 依赖
 */
import * as fs from "fs";
import * as path from "path";
import type { Configurator, MergeFile, PlatformPlan } from "./types";
import { AEMB_TOOLS } from "../types/ai-tools";
import { TPL } from "../constants/paths";
import { getAgents, renderMarkdownAgent, resolveCommands, resolvePlaceholders, resolveSkills } from "./shared";
import { getSharedHook } from "./hooks";
import type { SharedHookName } from "./hooks";

/** OpenCode 插件依赖（@opencode-ai/plugin）的版本与键名——也是 MERGE 的幂等/scrub 标记。 */
const PLUGIN_DEP = "@opencode-ai/plugin";
const PLUGIN_DEP_VERSION = "^1.14.39";

/** 本平台显式写进 .opencode/hooks/ 的 3 个共享 python hook。 */
const HOOK_NAMES: SharedHookName[] = [
  "aemb-session-start.py",
  "aemb-inject-workflow-state.py",
  "aemb-inject-subagent-context.py",
];

/** templates/opencode/ 下需照搬的 JS 文件（相对 templates/opencode 的 POSIX 路径）。 */
const JS_TEMPLATES = [
  "lib/aemb-context.js",
  "plugins/aemb-session-start.js",
  "plugins/aemb-inject-workflow-state.js",
  "plugins/aemb-inject-subagent-context.js",
];

/** 读 templates/opencode/<rel> 并解析占位符（{{PYTHON_CMD}} → 探测到的解释器）。 */
function readJsTemplate(rel: string): string {
  const abs = path.join(TPL.platform("opencode"), ...rel.split("/"));
  return resolvePlaceholders(fs.readFileSync(abs, "utf-8"));
}

/**
 * .opencode/package.json 合并：幂等加 @opencode-ai/plugin 到 dependencies。
 * scrub 移除该依赖、清掉因此变空的 dependencies/devDependencies；若文件只剩空壳则 fullyEmpty。
 */
function opencodePackageJsonMerge(): MergeFile {
  const filePath = ".opencode/package.json";

  function parse(existing: string | null): Record<string, unknown> {
    if (!existing) return {};
    try {
      const o = JSON.parse(existing) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  const bucket = (obj: Record<string, unknown>, key: string): Record<string, unknown> | null => {
    const b = obj[key];
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  };
  /** 用户是否已在某桶维护该依赖。 */
  const hasDep = (obj: Record<string, unknown>, key: string): boolean => {
    const b = bucket(obj, key);
    return !!b && PLUGIN_DEP in b;
  };
  /** 仅当该依赖值 == 我们写入的受管版本时移除（用户改过版本=他自己的，不动）；桶空则删桶。 */
  const stripIfManaged = (obj: Record<string, unknown>, key: string): void => {
    const b = bucket(obj, key);
    if (b && b[PLUGIN_DEP] === PLUGIN_DEP_VERSION) {
      delete b[PLUGIN_DEP];
      if (Object.keys(b).length === 0) delete obj[key];
    }
  };

  return {
    path: filePath,
    apply(existing) {
      const obj = parse(existing);
      // 用户已在 dependencies/devDependencies 维护该依赖 → 原样保留（不覆盖其版本/位置）。
      if (!hasDep(obj, "dependencies") && !hasDep(obj, "devDependencies")) {
        let deps = obj.dependencies;
        if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
          deps = {};
          obj.dependencies = deps;
        }
        (deps as Record<string, unknown>)[PLUGIN_DEP] = PLUGIN_DEP_VERSION;
      }
      return JSON.stringify(obj, null, 2) + "\n";
    },
    scrub(existing) {
      // 非法 JSON：原样保留、fullyEmpty=false，绝不整删用户的 package.json（防卸载误删数据）。
      let obj: Record<string, unknown>;
      try {
        const o = JSON.parse(existing) as unknown;
        if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not-object");
        obj = o as Record<string, unknown>;
      } catch {
        return { content: existing, fullyEmpty: false };
      }
      stripIfManaged(obj, "dependencies");
      stripIfManaged(obj, "devDependencies");
      const fullyEmpty = Object.keys(obj).length === 0;
      return { content: JSON.stringify(obj, null, 2) + "\n", fullyEmpty };
    },
    marker: PLUGIN_DEP, // package.json 用依赖键名而非 aemb- 字面，doctor 据此识别
  };
}

export const configureOpencode: Configurator = (): PlatformPlan => {
  const ctx = AEMB_TOOLS.opencode.templateContext;
  const dir = ".opencode";
  const files = new Map<string, string>();

  // 命令 → .opencode/commands/aemb/<name>.md（/aemb:<name>）
  for (const c of resolveCommands(ctx)) files.set(`${dir}/commands/aemb/${c.name}.md`, c.content);
  // 技能 → .opencode/skills/aemb-<name>/SKILL.md
  for (const s of resolveSkills(ctx)) files.set(`${dir}/skills/${s.name}/SKILL.md`, s.content);
  // 子 Agent → .opencode/agents/aemb-*.md（push：子 Agent 上下文由 JS 插件注入，无需 prelude）
  for (const t of getAgents()) {
    const a = renderMarkdownAgent(t, ctx, false);
    files.set(`${dir}/agents/${a.name}.md`, a.content);
  }
  // 3 个共享 python hook（getSharedHook 直接读，绕开 SHARED_HOOKS_BY_PLATFORM 分发表）
  for (const name of HOOK_NAMES) files.set(`${dir}/hooks/${name}`, getSharedHook(name));
  // JS 插件 + 共享库（{{PYTHON_CMD}} 已展开）
  for (const rel of JS_TEMPLATES) files.set(`${dir}/${rel}`, readJsTemplate(rel));

  // package.json 合并：幂等加 @opencode-ai/plugin 依赖（OpenCode 加载插件所需）
  const merges = [opencodePackageJsonMerge()];

  return { files, merges };
};
