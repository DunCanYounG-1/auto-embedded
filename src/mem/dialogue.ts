/**
 * 对话清洗：剥注入标签 + 识别 bootstrap 轮次。
 *
 * 这套清洗是 String.prototype.includes 相关性排序可行的前提——否则各类注入标签会主导每条命中。
 * verbatim 自 Trellis core/mem。
 */

const INJECTION_TAGS: readonly string[] = [
  "system-reminder",
  "task-status",
  "ready",
  "current-state",
  "workflow",
  "workflow-state",
  "guidelines",
  "instructions",
  "command-name",
  "command-message",
  "command-args",
  "local-command-stdout",
  "local-command-stderr",
  "permissions instructions",
  "collaboration_mode",
  "environment_context",
  "auto_compact_summary",
  "user_instructions",
];

/** 是否为平台 bootstrap 注入轮次（AGENTS.md 前导、纯 INSTRUCTIONS 块等），应整轮丢弃。
 * 在 stripInjectionTags 之后、对照原始 originalLength 评估（阈值按输入长度算）。 */
export function isBootstrapTurn(
  cleaned: string,
  originalLength: number,
): boolean {
  if (cleaned.startsWith("# AGENTS.md instructions for")) return true;
  if (originalLength > 4000 && /^<INSTRUCTIONS>/i.test(cleaned)) return true;
  return false;
}

/** 大小写不敏感地移除 INJECTION_TAGS 里每个 <tag>...</tag> 块，及 AGENTS.md 前导；3+ 连续换行折叠成段落分隔并 trim。 */
export function stripInjectionTags(text: string): string {
  let out = text;
  for (const tag of INJECTION_TAGS) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`<${escaped}[^>]*>[\\s\\S]*?</${escaped}>`, "gi"),
      "",
    );
  }
  out = out.replace(
    /^# AGENTS\.md instructions for[\s\S]*?(?=\n\n[A-Z一-龥]|$)/m,
    "",
  );
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
