/**
 * 监听频道 events.jsonl，按 filter yield 匹配事件（零依赖）。
 * fs.watch 监听频道「目录」（便于 recreate 后重扫）+ 200ms 安全轮询（Windows/NFS 下 fs.watch 易丢事件，必须保留）。
 */
import * as fs from "fs";
import { eventsPath, channelDir } from "./paths";
import { matchesEventFilter, type ChannelEvent, type ChannelEventFilter } from "./schema";

export type WatchFilter = ChannelEventFilter;

interface ReadProgress {
  byteOffset: number;
  carry: string;
  ident?: string; // 文件身份(ino:birthtime)；变化=被 delete+recreate（即使新文件 ≥ 旧 offset）→ 从头重扫
}

async function readNewEvents(filePath: string, state: ReadProgress): Promise<ChannelEvent[]> {
  if (!fs.existsSync(filePath)) {
    state.byteOffset = 0;
    state.carry = "";
    return [];
  }
  const stat = await fs.promises.stat(filePath);
  const ident = `${stat.ino}:${stat.birthtimeMs}`;
  if (stat.size < state.byteOffset || (state.ident !== undefined && state.ident !== ident)) {
    // 文件被截断、或被 delete+recreate（身份变化，即便新文件 ≥ 旧 offset）→ 从头重扫，避免读进新文件中部/漏掉重建后的事件。
    state.byteOffset = 0;
    state.carry = "";
  }
  state.ident = ident;
  if (stat.size <= state.byteOffset) return [];
  const fh = await fs.promises.open(filePath, "r");
  try {
    const length = stat.size - state.byteOffset;
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, state.byteOffset);
    state.byteOffset = stat.size;
    const text = state.carry + buf.toString("utf-8");
    const lines = text.split("\n");
    state.carry = lines.pop() ?? "";
    const events: ChannelEvent[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        events.push(JSON.parse(t) as ChannelEvent);
      } catch {
        /* 损坏行跳过 */
      }
    }
    return events;
  } finally {
    await fh.close();
  }
}

export async function* watchEvents(
  channelName: string,
  filter: WatchFilter,
  opts: { signal?: AbortSignal; fromStart?: boolean; sinceSeq?: number; project?: string } = {},
): AsyncGenerator<ChannelEvent, void, unknown> {
  const file = eventsPath(channelName, opts.project);
  const dir = channelDir(channelName, opts.project);
  if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });

  // 三种模式：默认(from-now)=从 EOF 起（wait 用，避免上一轮 done 立刻解阻塞）；
  // fromStart=从 0 起重放既有事件再 tail；sinceSeq=N=类似 fromStart 但跳过 seq<=N（respawn 后 inbox 防重放）。
  let initialOffset = 0;
  if (!opts.fromStart && opts.sinceSeq === undefined) {
    try {
      if (fs.existsSync(file)) initialOffset = (await fs.promises.stat(file)).size;
    } catch {
      initialOffset = 0;
    }
  }
  const state: ReadProgress = { byteOffset: initialOffset, carry: "" };
  const sinceSeq = opts.sinceSeq;

  let resolveNext: (() => void) | null = null;
  const wake = (): void => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(dir, () => wake());
    watcher.on("error", () => {
      try {
        watcher?.close();
      } catch {
        /* already closed */
      }
      watcher = null;
      wake(); // 保活：200ms 轮询作为兜底
    });
  } catch {
    /* 忽略 — 退化为纯轮询 */
  }

  const poll = setInterval(wake, 200);
  const abortHandler = (): void => wake();
  opts.signal?.addEventListener("abort", abortHandler);

  try {
    while (true) {
      if (opts.signal?.aborted) return;
      const fresh = await readNewEvents(file, state);
      for (const ev of fresh) {
        if (sinceSeq !== undefined && ev.seq <= sinceSeq) continue;
        if (matchesEventFilter(ev, filter)) yield ev;
        if (opts.signal?.aborted) return;
      }
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
    }
  } finally {
    clearInterval(poll);
    try {
      watcher?.close();
    } catch {
      /* already closed */
    }
    opts.signal?.removeEventListener("abort", abortHandler);
  }
}
