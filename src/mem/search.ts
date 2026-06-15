/**
 * 清洗后对话上的搜索打分与文本匹配（verbatim 自 Trellis core/mem）。
 */

import type { DialogueTurn, SearchExcerpt, SearchHit } from "./types";

/**
 * 加权密度相关性分：(3*userCount + asstCount) / totalTurns。
 * user 命中 ×3——用户自己的措辞锚定"他真正在意什么"，助手展开是下游噪声；除以 totalTurns 归一，
 * 让紧凑短会话能盖过冗长长会话。
 */
export function relevanceScore(h: SearchHit): number {
  if (h.totalTurns === 0) return 0;
  return (3 * h.userCount + h.asstCount) / h.totalTurns;
}

/** 命中位置所在的段落对齐 chunk（两侧最近的空行 \n\n 为界）。段落超 maxChars 则退化为居中字符窗并标记截断。 */
export function chunkAround(
  text: string,
  hitIdx: number,
  maxChars: number,
): { start: number; end: number; truncated: boolean } {
  const startPara = text.lastIndexOf("\n\n", hitIdx);
  let start = startPara === -1 ? 0 : startPara + 2;
  const endPara = text.indexOf("\n\n", hitIdx);
  let end = endPara === -1 ? text.length : endPara;
  let truncated = false;
  if (end - start > maxChars) {
    start = Math.max(0, hitIdx - Math.floor(maxChars / 2));
    end = Math.min(text.length, hitIdx + Math.ceil(maxChars / 2));
    truncated = true;
  }
  return { start, end, truncated };
}

/**
 * 多 token AND grep。空白切分；某轮需每个 token（不分大小写）都出现才算命中。count 为命中轮内所有 token 出现总数。
 * 摘录为命中处的段落对齐 chunk，按 chunk 起点去重；user 角色摘录排在 assistant 之前。
 */
export function searchInDialogue(
  turns: readonly DialogueTurn[],
  kw: string,
  maxExcerpts = 3,
  chunkChars = 400,
): SearchHit {
  const tokens = kw.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return {
      count: 0,
      userCount: 0,
      asstCount: 0,
      totalTurns: turns.length,
      excerpts: [],
    };
  }

  let userCount = 0;
  let asstCount = 0;
  const userExcerpts: SearchExcerpt[] = [];
  const asstExcerpts: SearchExcerpt[] = [];

  for (const t of turns) {
    const hay = t.text.toLowerCase();
    if (!tokens.every((tok) => hay.includes(tok))) continue;

    const hitPositions: { idx: number; tok: string }[] = [];
    const tokenFreq = new Map<string, number>();
    let turnHits = 0;
    for (const tok of tokens) {
      let from = 0;
      let n = 0;
      while (true) {
        const idx = hay.indexOf(tok, from);
        if (idx === -1) break;
        n++;
        turnHits++;
        hitPositions.push({ idx, tok });
        from = idx + tok.length;
      }
      tokenFreq.set(tok, n);
    }
    if (t.role === "user") userCount += turnHits;
    else asstCount += turnHits;
    hitPositions.sort((a, b) => a.idx - b.idx);

    interface Candidate {
      start: number;
      end: number;
      truncated: boolean;
      coverage: number;
      rarity: number;
    }
    const candidates: Candidate[] = [];
    const seenStarts = new Set<number>();
    for (const { idx, tok } of hitPositions) {
      const { start, end, truncated } = chunkAround(t.text, idx, chunkChars);
      if (seenStarts.has(start)) continue;
      seenStarts.add(start);
      const slice = hay.slice(start, end);
      const coverage = tokens.filter((tk) => slice.includes(tk)).length;
      const rarity = 1 / (tokenFreq.get(tok) ?? 1);
      candidates.push({ start, end, truncated, coverage, rarity });
    }
    candidates.sort((a, b) => {
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      if (b.rarity !== a.rarity) return b.rarity - a.rarity;
      return a.start - b.start;
    });
    for (const c of candidates) {
      let snippet = t.text.slice(c.start, c.end).trim();
      if (c.truncated) {
        if (c.start > 0) snippet = "…" + snippet;
        if (c.end < t.text.length) snippet += "…";
      }
      (t.role === "user" ? userExcerpts : asstExcerpts).push({
        role: t.role,
        snippet,
      });
    }
  }

  const excerpts = [...userExcerpts, ...asstExcerpts].slice(0, maxExcerpts);
  return {
    count: userCount + asstCount,
    userCount,
    asstCount,
    totalTurns: turns.length,
    excerpts,
  };
}
