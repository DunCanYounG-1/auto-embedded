/**
 * mem 会话选择的工程 / 时间范围 / 来源过滤原语。
 */

import * as path from "path";

import type { MemFilter } from "./types";

/** 单点范围检查：since ≤ t ≤ until。iso 未定义/不可解析时透传。内部用——会话列表过滤用 inRangeOverlap。 */
export function inRange(iso: string | undefined, f: MemFilter): boolean {
  if (!iso) return true;
  const t = new Date(iso);
  if (Number.isNaN(+t)) return true;
  if (f.since && t < f.since) return false;
  if (f.until && t > f.until) return false;
  return true;
}

/**
 * 同时有起止时间戳的会话用区间重叠判定：会话生命期 [start,end] 与查询窗口 [since,until] 重叠才保留。
 * 长会话/跨天会话（创建早于 --since 但窗口内仍活跃）必须存活——单点 inRange(created) 会把它们漏掉。
 *
 * 退化输入：两者都 undefined → 透传；一个 undefined → 在另一端退化为单点；不可解析 iso → 让步给可解析的一端。
 */
export function inRangeOverlap(
  start: string | undefined,
  end: string | undefined,
  f: MemFilter,
): boolean {
  const s = start ?? end;
  const e = end ?? start;
  if (!s && !e) return true;
  if (f.since && e) {
    const eT = new Date(e);
    if (!Number.isNaN(+eT) && eT < f.since) return false;
  }
  if (f.until && s) {
    const sT = new Date(s);
    if (!Number.isNaN(+sT) && sT > f.until) return false;
  }
  return true;
}

/** sessionCwd 是否在 target 内（相等或为其子目录）。target 未定义=不限定，全过；限定时未知 cwd 的会话被丢弃。 */
export function sameProject(
  sessionCwd: string | undefined,
  target: string | undefined,
): boolean {
  if (!target) return true;
  if (!sessionCwd) return false;
  const a = path.resolve(sessionCwd);
  const b = path.resolve(target);
  return a === b || a.startsWith(b + path.sep);
}
