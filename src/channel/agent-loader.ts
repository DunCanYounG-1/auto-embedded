/**
 * 加载 spawn 的 agent 定义：内置角色表（aemb-scout/builder/verifier → claude）+ 可选读工程 .claude/agents/<name>.md。
 * 路径遍历守卫：name 不得含 / \ ..（防读工程外文件）。
 */
import * as fs from "fs";
import * as path from "path";
import type { Provider } from "./adapters/index";

export interface LoadedAgent {
  name: string;
  provider?: Provider;
  model?: string;
  systemPrompt: string;
}

const BUILTIN: Record<string, { provider: Provider }> = {
  "aemb-scout": { provider: "claude" },
  "aemb-builder": { provider: "claude" },
  "aemb-verifier": { provider: "claude" },
};

function fmValue(frontmatter: string, key: string): string | undefined {
  const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!m) return undefined;
  return m[1].trim().replace(/^["']/, "").replace(/["']$/, "") || undefined;
}

export function loadAgent(name: string, cwd: string): LoadedAgent {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`非法 agent 名（含路径分隔/..）: ${name}`);
  }
  const builtin = BUILTIN[name];
  const f = path.join(cwd, ".claude", "agents", `${name}.md`);
  let body = "";
  let provider: Provider | undefined = builtin?.provider;
  let model: string | undefined;
  if (fs.existsSync(f)) {
    const raw = fs.readFileSync(f, "utf-8");
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (fm) {
      const front = fm[1];
      body = raw.slice(fm[0].length);
      const p = fmValue(front, "provider");
      if (p === "claude") provider = "claude";
      model = fmValue(front, "model");
    } else {
      body = raw;
    }
  }
  return { name, provider, model, systemPrompt: body.trim() };
}
