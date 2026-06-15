/**
 * task.py 命令解析 + 头脑风暴窗口切片（aemb RIPER-5 适配版）。
 *
 * 纯逻辑——边界信号从原始 shell 命令串里还原；产生这些串的逐行 JSONL 扫描在各 adapter 里。
 *
 * 与 Trellis 的差异：RIPER-5 没有 `task.py create` + 独立 `task.py start` 两段。aemb 用
 *   · `task.py start "<标题>"`（建+激活）= 进入 RESEARCH/头脑风暴的起点；
 *   · `task.py phase EXECUTE`        = 切到实现，作为该窗口的终点。
 * 故 brainstorm 窗 = [task.py start, 其后第一个 task.py phase EXECUTE)，覆盖 RESEARCH..PLAN；
 * implement = 这些窗口之外的轮次（EXECUTE..REVIEW）。
 */

import type {
  BrainstormWindow,
  ParsedTaskPyCommand,
  TaskPyEvent,
} from "./types";

/**
 * 找出一条命令串里所有 `task.py start ...` 与 `task.py phase EXECUTE` 调用，按源序返回。
 * 一条 Bash 里可能链多个（如 `task.py start "X"; task.py phase PLAN; ...`）。
 *
 * 误报防护：task.py 必须出现在行首、空白后或路径分隔符后（/ 或 \），不会匹配嵌在 flag 值里的。
 * 兼容各种启动器（`python`/`py -3`/绝对路径）——因为锚点就在 task.py 本身。
 */
export function parseTaskPyCommandsAll(cmd: string): ParsedTaskPyCommand[] {
  if (typeof cmd !== "string" || cmd.length === 0) return [];
  const all: ParsedTaskPyCommand[] = [];
  const findRe = /(^|[\s/\\])task\.py\s+(start|phase)\b/g;
  const matches: { kind: "start" | "phase"; bodyStart: number }[] = [];
  for (const m of cmd.matchAll(findRe)) {
    matches.push({ kind: m[2] as "start" | "phase", bodyStart: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    if (!cur) continue;
    const next = matches[i + 1];
    const slice = cmd.slice(cur.bodyStart, next?.bodyStart ?? cmd.length);
    const restRaw = (slice.split("\n")[0] ?? "").trim();
    const args = splitShellArgs(restRaw);
    if (cur.kind === "start") {
      let titleArg: string | undefined;
      for (const a of args) {
        if (a.startsWith("-")) continue;
        titleArg = a;
        break;
      }
      all.push({ action: "start", titleArg });
    } else {
      // phase：只有切到 EXECUTE 才作为"进入实现"的窗口终点；其它阶段忽略。
      const phaseName = args.find((a) => !a.startsWith("-"));
      if (phaseName && phaseName.toUpperCase() === "EXECUTE") {
        all.push({ action: "execute" });
      }
    }
  }
  return all;
}

/** 尽力的 shell 参数切分：尊重 "…"/'…' 引号，按空白切，把 ; | & ( ) 当 token 边界，去尾随 shell 元字符。非完整 POSIX 解析，够用来抽标题/路径。 */
export function splitShellArgs(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  const flush = (): void => {
    if (!cur) return;
    const cleaned = cur.replace(/[)};&|>]+$/, "");
    if (cleaned) out.push(cleaned);
    cur = "";
  };
  for (const ch of s) {
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&" || ch === "(" || ch === ")") {
      flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}

/**
 * 把 start → execute 事件配成头脑风暴窗口。
 *
 * 配对策略（FIFO）：按事件顺序遍历，维护待配对的 start 队列；遇到一个 execute 就闭合最早未配对的 start，
 * 窗口 = [start.turnIndex, execute.turnIndex)。剩余未配对的 start → [start, totalTurns)。
 * 没有对应 start 的 execute 忽略（无边界）。窗口按 startTurn 升序输出。
 */
export function buildBrainstormWindows(
  events: readonly TaskPyEvent[],
  totalTurns: number,
): BrainstormWindow[] {
  const windows: BrainstormWindow[] = [];
  const open: { turnIndex: number; title?: string }[] = [];
  let counter = 0;
  for (const ev of events) {
    if (ev.action === "start") {
      open.push({ turnIndex: ev.turnIndex, title: ev.title });
    } else {
      const s = open.shift();
      if (s) pushWindow(windows, s.turnIndex, ev.turnIndex, s.title, ++counter);
    }
  }
  for (const s of open) {
    pushWindow(windows, s.turnIndex, totalTurns, s.title, ++counter);
  }
  windows.sort((a, b) => a.startTurn - b.startTurn);
  return windows;
}

function pushWindow(
  windows: BrainstormWindow[],
  startTurn: number,
  endTurn: number,
  title: string | undefined,
  counter: number,
): void {
  // 防御非法窗口（事件交错导致 start 在终点之后），不产出负切片。
  if (endTurn < startTurn) return;
  const label = title ? slugifyTitle(title) : `window-${counter}`;
  windows.push({ label, startTurn, endTurn });
}

/** 标题 → 简短 label（取前几词、去多余空白），仅用于展示。 */
function slugifyTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, " ");
  return t.length > 32 ? t.slice(0, 32) + "…" : t;
}
