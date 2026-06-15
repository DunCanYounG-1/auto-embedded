/**
 * 工程聚合：各会话的不同 cwd + 最近活跃时间 + 各平台计数。
 */

import { listAll, resolveFilter, WIDE_LIMIT } from "./sessions";
import type { ListMemProjectsOptions, MemProjectSummary } from "./types";

/**
 * 聚合跨平台的不同工程 cwd。始终全局扫（丢掉 cwd 限定）——since/until/platform 仍生效。
 * 按 last_active 降序；显示上限由调用方决定。
 */
export function listMemProjects(
  options?: ListMemProjectsOptions,
): MemProjectSummary[] {
  const f = resolveFilter(options?.filter);
  const all = listAll({ ...f, cwd: undefined, limit: WIDE_LIMIT });

  const byCwd = new Map<string, MemProjectSummary>();
  for (const s of all) {
    if (!s.cwd) continue;
    const ts = s.updated ?? s.created ?? "";
    let agg = byCwd.get(s.cwd);
    if (!agg) {
      agg = {
        cwd: s.cwd,
        last_active: ts,
        sessions: 0,
        by_platform: { claude: 0, codex: 0 },
      };
      byCwd.set(s.cwd, agg);
    }
    agg.sessions++;
    agg.by_platform[s.platform]++;
    if (ts > agg.last_active) agg.last_active = ts;
  }

  return [...byCwd.values()].sort((a, b) =>
    b.last_active.localeCompare(a.last_active),
  );
}
