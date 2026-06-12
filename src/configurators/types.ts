/**
 * configurator 契约：每个平台返回一份"安装计划"，由 orchestrator 落盘 + 记账。
 *
 * 分两类输出：
 *  - files  : aemb 独占文件（agents/skills/commands/hooks/plugins/extension…）→ 整文件写 + 记 hash，update 时按 hash 决定是否覆盖。
 *  - merges : 与用户共享的结构化配置（settings.json/hooks.json/config.toml/package.json）→ 只增删 aemb 片段，
 *             幂等（apply 先剥旧 aemb 片段再加），卸载时 scrub 而非整删。
 */
export interface MergeFile {
  /** 目标文件相对工程根的 POSIX 路径，如 ".claude/settings.json"。 */
  path: string;
  /** 合并：传入现有内容（不存在为 null）与已解析 python 命令，返回写回的完整内容（必须幂等）。 */
  apply(existing: string | null, py: string): string;
  /** 卸载：从现有内容剥掉 aemb 片段；fullyEmpty=true 表示剥完已无意义（orchestrator 会整删）。 */
  scrub(existing: string): { content: string; fullyEmpty: boolean };
  /** doctor 用来判定"已接线"的子串（默认 "aemb-"）。config.toml/package.json 等不含 aemb- 的需显式给。 */
  marker?: string;
}

export interface PlatformPlan {
  /** 独占文件：相对工程根 POSIX 路径 → 内容。 */
  files: Map<string, string>;
  /** 共享配置合并项。 */
  merges: MergeFile[];
}

/** 平台配置器：给定已解析 python 命令，产出安装计划。 */
export type Configurator = (py: string) => PlatformPlan;
