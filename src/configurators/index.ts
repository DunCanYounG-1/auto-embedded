/**
 * 配置器注册表：AITool → Configurator。
 *
 * 核心 7 已全部接入；预留 7 暂无 configurator，由 orchestrator 在 init 时拒绝并提示。
 * 新增平台：写 ./<平台>.ts 导出 Configurator，在此 import + 注册即可。
 */
import type { AITool } from "../types/ai-tools";
import type { Configurator } from "./types";

import { configureClaude } from "./claude";
import { configureCursor } from "./cursor";
import { configureCodex } from "./codex";
import { configureOpencode } from "./opencode";
import { configureCopilot } from "./copilot";
import { configureGemini } from "./gemini";
import { configureWindsurf } from "./windsurf";

export const CONFIGURATORS: Partial<Record<AITool, Configurator>> = {
  claude: configureClaude,
  cursor: configureCursor,
  codex: configureCodex,
  opencode: configureOpencode,
  copilot: configureCopilot,
  gemini: configureGemini,
  windsurf: configureWindsurf,
  // —— 预留 7（kilo/kiro/antigravity/qoder/codebuddy/droid/pi）暂未实现 ——
};

export function getConfigurator(id: AITool): Configurator | undefined {
  return CONFIGURATORS[id];
}

/** 已实现 configurator 的平台。 */
export function implementedTools(): AITool[] {
  return Object.keys(CONFIGURATORS) as AITool[];
}
