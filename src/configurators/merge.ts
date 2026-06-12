/**
 * 共享配置文件的合并/scrub 工具。
 *
 * 与用户共享的配置（settings.json/hooks.json/...）不能整文件覆盖——只增删 aemb 自己的片段。
 * apply 必须幂等（先剥旧 aemb 片段再加，可重复跑）；scrub 用于卸载（剥光 aemb 片段，fullyEmpty 则整删）。
 */
import type { MergeFile } from "./types";
import type { SharedHookName } from "./hooks";

/** aemb 自有 hook 脚本名（用于在 command 串里识别"这是 aemb 的"）。 */
const OUR_HOOK_SCRIPTS: SharedHookName[] = [
  "aemb-session-start.py",
  "aemb-inject-workflow-state.py",
  "aemb-inject-subagent-context.py",
];

function isOurCommand(cmd: unknown): boolean {
  return typeof cmd === "string" && OUR_HOOK_SCRIPTS.some((s) => cmd.includes(s));
}

/** 从嵌套 hooks 桶（hooks.{Event}[].hooks[].command）剥掉 aemb 项；丢弃因此变空的组。 */
function stripOurNested(bucket: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const g of bucket) {
    if (!g || typeof g !== "object") {
      out.push(g);
      continue;
    }
    const grp = g as { hooks?: unknown[] };
    const hooks = Array.isArray(grp.hooks) ? grp.hooks : [];
    const kept = hooks.filter((h) => !isOurCommand((h as { command?: unknown })?.command));
    if (kept.length === hooks.length) out.push(g);
    else if (kept.length) out.push({ ...grp, hooks: kept });
    // kept.length === 0 → 整组丢弃
  }
  return out;
}

/** 一个 hook item 的任意命令字段（command/bash/powershell）是否指向 aemb 脚本（Copilot 用 bash/powershell）。 */
function itemIsOurs(o: { command?: unknown; bash?: unknown; powershell?: unknown }): boolean {
  return isOurCommand(o.command) || isOurCommand(o.bash) || isOurCommand(o.powershell);
}

/** 从扁平 hooks 桶（hooks.{Event}[].command/bash/powershell 或 .[].hooks[] 混用）剥掉 aemb 项。 */
function stripOurFlat(bucket: unknown[]): unknown[] {
  return bucket.filter((h) => {
    if (!h || typeof h !== "object") return true;
    const o = h as { command?: unknown; bash?: unknown; powershell?: unknown; hooks?: unknown[] };
    if (itemIsOurs(o)) return false;
    // 兼容个别平台用 {hooks:[{command}]} 包一层
    if (Array.isArray(o.hooks) && o.hooks.some((x) => itemIsOurs(x as Record<string, unknown>))) {
      return false;
    }
    return true;
  });
}

type Entries = Record<string, unknown[]>;

/** 一条 hook command 项（type/command/timeout）。arg：可选脚本参数（如 Gemini 的事件名 BeforeAgent）。 */
export function hookCmd(py: string, platDir: string, name: SharedHookName, timeout: number, arg?: string) {
  const base = `${py} ${platDir}/hooks/${name}`;
  return { type: "command", command: arg ? `${base} ${arg}` : base, timeout };
}

/**
 * 嵌套 schema 的 settings.json 合并（Claude/Gemini/CodeBuddy/Qoder 同构）。
 * entriesFor(py) 产出 { 事件: [ {matcher?, hooks:[cmd...]} ] }。
 */
export function nestedSettingsMerge(
  filePath: string,
  entriesFor: (py: string) => Entries,
): MergeFile {
  return {
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
      if (!obj.hooks || typeof obj.hooks !== "object" || Array.isArray(obj.hooks)) obj.hooks = {};
      const hooks = obj.hooks as Record<string, unknown[]>;
      const entries = entriesFor(py);
      for (const ev of Object.keys(entries)) {
        if (!Array.isArray(hooks[ev])) hooks[ev] = [];
        hooks[ev] = stripOurNested(hooks[ev]);
        for (const g of entries[ev]) hooks[ev].push(g);
      }
      return JSON.stringify(obj, null, 2) + "\n";
    },
    scrub(existing) {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(existing) as Record<string, unknown>;
      } catch {
        return { content: existing, fullyEmpty: false };
      }
      const hooks = obj?.hooks as Record<string, unknown[]> | undefined;
      if (hooks && typeof hooks === "object") {
        for (const ev of Object.keys(hooks)) {
          if (Array.isArray(hooks[ev])) {
            hooks[ev] = stripOurNested(hooks[ev]);
            if (!hooks[ev].length) delete hooks[ev];
          }
        }
        if (Object.keys(hooks).length === 0) delete obj.hooks;
      }
      const fullyEmpty = Object.keys(obj).length === 0;
      return { content: JSON.stringify(obj, null, 2) + "\n", fullyEmpty };
    },
  };
}

/**
 * 扁平 schema 的 hooks.json 合并（Cursor/Copilot 类，hooks.{Event} 为数组）。
 * entriesFor(py) 产出 { 事件: [ hookItem... ] }，hookItem 由平台自定义形状。
 */
export function flatHooksJsonMerge(
  filePath: string,
  entriesFor: (py: string) => Entries,
): MergeFile {
  return {
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
      if (!obj.hooks || typeof obj.hooks !== "object" || Array.isArray(obj.hooks)) obj.hooks = {};
      const hooks = obj.hooks as Record<string, unknown[]>;
      const entries = entriesFor(py);
      for (const ev of Object.keys(entries)) {
        if (!Array.isArray(hooks[ev])) hooks[ev] = [];
        hooks[ev] = stripOurFlat(hooks[ev]);
        for (const item of entries[ev]) hooks[ev].push(item);
      }
      return JSON.stringify(obj, null, 2) + "\n";
    },
    scrub(existing) {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(existing) as Record<string, unknown>;
      } catch {
        return { content: existing, fullyEmpty: false };
      }
      const hooks = obj?.hooks as Record<string, unknown[]> | undefined;
      if (hooks && typeof hooks === "object") {
        for (const ev of Object.keys(hooks)) {
          if (Array.isArray(hooks[ev])) {
            hooks[ev] = stripOurFlat(hooks[ev]);
            if (!hooks[ev].length) delete hooks[ev];
          }
        }
        if (Object.keys(hooks).length === 0) delete obj.hooks;
      }
      const fullyEmpty = Object.keys(obj).length === 0;
      return { content: JSON.stringify(obj, null, 2) + "\n", fullyEmpty };
    },
  };
}
