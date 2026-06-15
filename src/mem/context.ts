/**
 * 对话窗口上下文抽取：解析会话，围绕命中选一段 token 预算内的轮次。
 */

import {
  extractDialogue,
  findSessionById,
  MemSessionNotFoundError,
  resolveFilter,
} from "./sessions";
import type {
  DialogueRole,
  DialogueTurn,
  MemContextResult,
  MemContextTurn,
  ReadMemContextOptions,
} from "./types";

interface SelectedContext {
  turns: MemContextTurn[];
  totalHitTurns: number;
  budgetUsed: number;
}

/**
 * 纯选择：按 grep 排序轮次（user 角色优先，再按命中密度），取前 nTurns，各向两侧扩 around 轮，
 * 再在 maxChars 内产出——单轮超过半预算则头部截断。无 grep 时返回前 nTurns 轮（会话开头）。
 */
export function selectContextTurns(
  turns: readonly DialogueTurn[],
  grep: string | undefined,
  nTurns: number,
  around: number,
  maxChars: number,
): SelectedContext {
  let hitIndices: number[] = [];
  let totalHitTurns = 0;

  if (grep) {
    const tokens = grep.toLowerCase().split(/\s+/).filter(Boolean);
    const matchCount = (text: string): number => {
      const hay = text.toLowerCase();
      if (!tokens.every((tok) => hay.includes(tok))) return 0;
      let n = 0;
      for (const tok of tokens) {
        let from = 0;
        while (true) {
          const idx = hay.indexOf(tok, from);
          if (idx === -1) break;
          n++;
          from = idx + tok.length;
        }
      }
      return n;
    };
    const ranked: { idx: number; role: DialogueRole; hits: number }[] = [];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (!turn) continue;
      const h = tokens.length === 0 ? 0 : matchCount(turn.text);
      if (h > 0) ranked.push({ idx: i, role: turn.role, hits: h });
    }
    totalHitTurns = ranked.length;
    ranked.sort((a, b) => {
      if (a.role !== b.role) return a.role === "user" ? -1 : 1;
      if (b.hits !== a.hits) return b.hits - a.hits;
      return a.idx - b.idx;
    });
    hitIndices = ranked.slice(0, nTurns).map((r) => r.idx);
  } else {
    for (let i = 0; i < Math.min(nTurns, turns.length); i++) hitIndices.push(i);
  }

  // 每个命中向两侧扩 around 轮，用 Set 去重。
  const display = new Set<number>();
  for (const idx of hitIndices) {
    for (
      let j = Math.max(0, idx - around);
      j <= Math.min(turns.length - 1, idx + around);
      j++
    ) {
      display.add(j);
    }
  }
  const ordered = [...display].sort((a, b) => a - b);
  const hitSet = new Set(hitIndices);

  const out: MemContextTurn[] = [];
  let used = 0;
  for (const i of ordered) {
    const t = turns[i];
    if (!t) continue;
    let text = t.text;
    const cap = Math.floor(maxChars / 2);
    if (text.length > cap)
      text = text.slice(0, cap) + `\n…[+${t.text.length - cap} chars]`;
    if (used + text.length > maxChars && out.length > 0) break;
    out.push({ idx: i, role: t.role, text, isHit: hitSet.has(i) });
    used += text.length;
  }

  return { turns: out, totalHitTurns, budgetUsed: used };
}

/** 钻取单个会话：前 N 命中轮 + 周边上下文，字符预算内。无 grep 时返回会话开头。 */
export function readMemContext(
  options: ReadMemContextOptions,
): MemContextResult {
  const f = resolveFilter(options.filter);
  const s = findSessionById(options.sessionId, f);
  if (!s) throw new MemSessionNotFoundError(options.sessionId);

  const grep = typeof options.grep === "string" ? options.grep : undefined;
  const nTurns = options.turns ?? 3;
  const around = options.around ?? 1;
  const maxChars = options.maxChars ?? 6000;

  const turns: DialogueTurn[] = extractDialogue(s);
  const selected = selectContextTurns(turns, grep, nTurns, around, maxChars);

  return {
    session: s,
    query: grep,
    totalTurns: turns.length,
    totalHitTurns: selected.totalHitTurns,
    budgetUsed: selected.budgetUsed,
    maxChars,
    turns: selected.turns,
    warnings: [],
  };
}
