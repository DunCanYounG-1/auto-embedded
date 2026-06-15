/**
 * channel 事件 append/read（零依赖）。append 在频道级锁内序列化 + fsp.appendFile（追加，不走
 * file-writer.writeFile 的 symlink-删-重写）。readLastSeq 简单扫最后一行（无 seq sidecar，MVP 够用）。
 */
import * as fs from "fs";
import * as fsp from "fs/promises";
import { withLock } from "./lock";
import { eventsPath, channelDir, lockPath } from "./paths";
import type { ChannelEvent, ChannelEventKind } from "./schema";

export async function ensureChannelDir(name: string, project?: string): Promise<string> {
  const dir = channelDir(name, project);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

export async function readLastSeq(name: string, project?: string): Promise<number> {
  const file = eventsPath(name, project);
  if (!fs.existsSync(file)) return 0;
  const content = await fsp.readFile(file, "utf-8");
  // 向后扫描第一条可解析、seq 为有限数的行：容忍崩溃/掉电留下的半截尾行。否则 lastSeq=0 → 新事件 seq 重置成 1，
  // 与既有 seq 撞号，inbox cursor（seq<=N 跳过）会漏投消息。整文件非空却无可恢复 seq → 抛错，绝不静默归 0。
  const lines = content.split("\n");
  let sawNonEmpty = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) continue;
    sawNonEmpty = true;
    try {
      const obj = JSON.parse(t) as { seq?: number };
      if (typeof obj.seq === "number" && Number.isFinite(obj.seq)) return obj.seq;
    } catch {
      /* 半截/损坏行，继续往前找 */
    }
  }
  if (sawNonEmpty) throw new Error(`无法从 ${file} 恢复频道 seq（文件非空但无可解析的 seq 行）`);
  return 0;
}

export interface AppendablePartial {
  kind: ChannelEventKind;
  by: string;
  ts?: string;
  [extra: string]: unknown;
}

export async function appendEvent(name: string, partial: AppendablePartial, project?: string): Promise<ChannelEvent> {
  await ensureChannelDir(name, project);
  return withLock(lockPath(name, project), async () => {
    const lastSeq = await readLastSeq(name, project);
    const event = { ...partial, seq: lastSeq + 1, ts: partial.ts ?? new Date().toISOString() } as ChannelEvent;
    await fsp.appendFile(eventsPath(name, project), JSON.stringify(event) + "\n", "utf-8");
    return event;
  });
}

export async function readChannelEvents(name: string, project?: string): Promise<ChannelEvent[]> {
  const file = eventsPath(name, project);
  if (!fs.existsSync(file)) return [];
  const text = await fsp.readFile(file, "utf-8");
  const events: ChannelEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as ChannelEvent);
    } catch {
      /* 跳过损坏行 */
    }
  }
  return events;
}

export interface ChannelMetadata {
  type: string;
  title?: string;
  description?: string;
  labels: string[];
  cwd?: string;
  task?: string;
  ephemeral: boolean;
  createdBy?: string;
}

/** 元数据=对事件做左折叠投影（不单独存储）。MVP 只取 create + channel(title)。 */
export function reduceChannelMetadata(events: ChannelEvent[]): ChannelMetadata {
  const meta: ChannelMetadata = { type: "chat", labels: [], ephemeral: false };
  for (const ev of events) {
    if (ev.kind === "create") {
      meta.type = ev.type === "forum" ? "forum" : "chat";
      if (ev.description) meta.description = ev.description;
      if (Array.isArray(ev.labels)) meta.labels = ev.labels;
      if (ev.cwd) meta.cwd = ev.cwd;
      if (ev.task) meta.task = ev.task;
      meta.ephemeral = ev.ephemeral === true;
      meta.createdBy = ev.by;
      if (typeof ev.title === "string") meta.title = ev.title;
    } else if (ev.kind === "channel" && ev.action === "title") {
      meta.title = ev.title == null ? undefined : ev.title;
    }
  }
  return meta;
}
