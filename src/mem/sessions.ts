/**
 * 会话编排：来源扇出、平台分发、会话查找、阶段切片，及 listMemSessions / searchMemSessions /
 * extractMemDialogue 公开入口。仅 Claude + Codex。
 */

import {
  claudeExtractDialogue,
  claudeListSessions,
  claudeSearch,
  collectClaudeTurnsAndEvents,
} from "./adapters/claude";
import {
  codexExtractDialogue,
  codexListSessions,
  codexSearch,
  collectCodexTurnsAndEvents,
} from "./adapters/codex";
import { buildBrainstormWindows } from "./phase";
import { relevanceScore } from "./search";
import type {
  DialogueTurn,
  ExtractMemDialogueOptions,
  ListMemSessionsOptions,
  MemDialogueGroup,
  MemExtractResult,
  MemFilter,
  MemPhase,
  MemSearchMatch,
  MemSearchResult,
  MemSessionInfo,
  MemWarning,
  SearchHit,
  SearchMemSessionsOptions,
  TaskPyEvent,
} from "./types";

/** 内部宽上限——limit 只截显示；搜索召回与会话查找必须扫全量。 */
export const WIDE_LIMIT = 1_000_000;

/** readMemContext / extractMemDialogue 解析不到会话 id 时抛。 */
export class MemSessionNotFoundError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`mem session not found: ${sessionId}`);
    this.name = "MemSessionNotFoundError";
    this.sessionId = sessionId;
  }
}

/** 补齐 platform / limit 缺省，让内部 helper 看到完整 filter。 */
export function resolveFilter(filter?: MemFilter): MemFilter {
  return {
    platform: filter?.platform ?? "all",
    since: filter?.since,
    until: filter?.until,
    cwd: filter?.cwd,
    limit: filter?.limit ?? 50,
  };
}

/** 扇出到在范围内的每个平台，按最近活跃合并，截到 f.limit。 */
export function listAll(f: MemFilter): MemSessionInfo[] {
  const all: MemSessionInfo[] = [];
  if (f.platform === "all" || f.platform === "claude")
    all.push(...claudeListSessions(f));
  if (f.platform === "all" || f.platform === "codex")
    all.push(...codexListSessions(f));
  all.sort((a, b) =>
    (b.updated ?? b.created ?? "").localeCompare(a.updated ?? a.created ?? ""),
  );
  return all.slice(0, f.limit);
}

export function extractDialogue(s: MemSessionInfo): DialogueTurn[] {
  return s.platform === "codex"
    ? codexExtractDialogue(s)
    : claudeExtractDialogue(s);
}

function searchSession(s: MemSessionInfo, kw: string): SearchHit {
  return s.platform === "codex" ? codexSearch(s, kw) : claudeSearch(s, kw);
}

function collectTurnsAndEvents(s: MemSessionInfo): {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
} {
  return s.platform === "codex"
    ? collectCodexTurnsAndEvents(s)
    : collectClaudeTurnsAndEvents(s);
}

/** 按精确 id 或 id 前缀解析会话，扫全部工程。 */
export function findSessionById(
  id: string,
  f: MemFilter,
): MemSessionInfo | undefined {
  const wide: MemFilter = { ...f, cwd: undefined, limit: WIDE_LIMIT };
  const all = listAll(wide);
  return all.find((s) => s.id === id) ?? all.find((s) => s.id.startsWith(id));
}

interface PhaseSlice {
  groups: MemDialogueGroup[];
  windows: MemExtractResult["windows"];
  totalTurns: number;
  warnings: MemWarning[];
}

/** 按阶段切清洗后的对话。Claude/Codex 有原生边界检测（task.py start / phase EXECUTE）。 */
function sliceMemPhase(s: MemSessionInfo, phase: MemPhase): PhaseSlice {
  const warnings: MemWarning[] = [];

  if (phase === "all") {
    const turns = extractDialogue(s);
    return {
      groups: [{ label: null, turns }],
      windows: [],
      totalTurns: turns.length,
      warnings,
    };
  }

  const { turns, events } = collectTurnsAndEvents(s);
  const windows = buildBrainstormWindows(events, turns.length);

  if (phase === "brainstorm") {
    if (windows.length === 0) {
      warnings.push({
        code: "no-brainstorm-boundary",
        message: `本会话未发现 task.py start / phase EXECUTE 边界——返回完整对话。`,
      });
      return {
        groups: [{ label: null, turns }],
        windows: [],
        totalTurns: turns.length,
        warnings,
      };
    }
    const groups = windows.map((w) => ({
      label: w.label,
      turns: turns.slice(w.startTurn, w.endTurn),
    }));
    return { groups, windows, totalTurns: turns.length, warnings };
  }

  // phase === "implement"：所有不在任何 brainstorm 窗口内的轮次（EXECUTE..REVIEW）。
  if (windows.length === 0) {
    warnings.push({
      code: "no-brainstorm-boundary",
      message: `本会话未发现 task.py start / phase EXECUTE 边界——implement 阶段为空。`,
    });
    return {
      groups: [{ label: null, turns: [] }],
      windows: [],
      totalTurns: turns.length,
      warnings,
    };
  }
  const covered = new Set<number>();
  for (const w of windows) {
    for (let i = w.startTurn; i < w.endTurn; i++) covered.add(i);
  }
  const implementTurns: DialogueTurn[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (!covered.has(i)) {
      const t = turns[i];
      if (t) implementTurns.push(t);
    }
  }
  return {
    groups: [{ label: null, turns: implementTurns }],
    windows,
    totalTurns: turns.length,
    warnings,
  };
}

// ---------- 公开 API ----------

/** 列 Claude/Codex 会话元数据，按最近活跃排序，截到 filter.limit（缺省 50）。 */
export function listMemSessions(
  options?: ListMemSessionsOptions,
): MemSessionInfo[] {
  return listAll(resolveFilter(options?.filter));
}

/** 跨所有匹配会话做多 token AND grep，按加权密度相关性排序。matches 截到 filter.limit；totalMatches 为全量命中数。 */
export function searchMemSessions(
  options: SearchMemSessionsOptions,
): MemSearchResult {
  const f = resolveFilter(options.filter);
  const kw = options.keyword;

  const candidates = listAll({ ...f, limit: WIDE_LIMIT });
  const matches: MemSearchMatch[] = [];
  for (const s of candidates) {
    const hit = searchSession(s, kw);
    if (hit.count === 0) continue;
    matches.push({ session: s, hit, score: relevanceScore(hit) });
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.hit.count !== a.hit.count) return b.hit.count - a.hit.count;
    return (b.session.updated ?? b.session.created ?? "").localeCompare(
      a.session.updated ?? a.session.created ?? "",
    );
  });

  return {
    matches: matches.slice(0, f.limit),
    totalMatches: matches.length,
    warnings: [],
  };
}

/** 导出单个会话的清洗对话，可按头脑风暴阶段切片、再按多 token AND grep 过滤。 */
export function extractMemDialogue(
  options: ExtractMemDialogueOptions,
): MemExtractResult {
  const f = resolveFilter(options.filter);
  const phase: MemPhase = options.phase ?? "all";
  const s = findSessionById(options.sessionId, f);
  if (!s) throw new MemSessionNotFoundError(options.sessionId);

  const slice = sliceMemPhase(s, phase);
  const grepLc =
    typeof options.grep === "string" ? options.grep.toLowerCase() : undefined;
  const filterTurns = (turns: DialogueTurn[]): DialogueTurn[] =>
    grepLc ? turns.filter((t) => t.text.toLowerCase().includes(grepLc)) : turns;

  const groups = slice.groups.map((g) => ({
    label: g.label,
    turns: filterTurns(g.turns),
  }));
  const flat = groups.flatMap((g) => g.turns);

  return {
    session: s,
    phase,
    windows: slice.windows,
    totalTurns: slice.totalTurns,
    groups,
    turns: flat,
    warnings: slice.warnings,
  };
}
