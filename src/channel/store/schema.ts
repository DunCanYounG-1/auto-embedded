/**
 * channel 事件 schema + 过滤 + inbox 策略（零依赖，自 Trellis core/channel internal/store 精简移植）。
 * MVP 为 chat 时间线；forum/thread 投影、seq sidecar、idempotency/origin/meta 校验均延后（stage 2）。
 */

export const GLOBAL_PROJECT_KEY = "_global";

export type ChannelScope = "project" | "global";
export type ChannelType = "chat" | "forum";
export type InboxPolicy = "explicitOnly" | "broadcastAndExplicit";

export type ChannelEventKind =
  | "create" | "join" | "leave" | "message" | "thread" | "context" | "channel"
  | "spawned" | "killed" | "respawned" | "progress" | "done" | "error"
  | "waiting" | "awake" | "undeliverable" | "interrupt_requested"
  | "turn_started" | "turn_finished" | "interrupted" | "supervisor_warning";

export const CHANNEL_EVENT_KINDS: ReadonlySet<ChannelEventKind> = new Set([
  "create", "join", "leave", "message", "thread", "context", "channel", "spawned",
  "killed", "respawned", "progress", "done", "error", "waiting", "awake",
  "undeliverable", "interrupt_requested", "turn_started", "turn_finished",
  "interrupted", "supervisor_warning",
]);

/** 宽松事件形状：MVP 直接读字段，不做严格判别联合（省大量样板，行为不变）。 */
export interface ChannelEvent {
  seq: number;
  ts: string;
  kind: ChannelEventKind;
  by: string;
  to?: string | string[];
  text?: string;
  // spawned
  as?: string;
  provider?: string;
  pid?: number;
  agent?: string;
  files?: string[];
  inboxPolicy?: InboxPolicy;
  // killed / error / done
  reason?: string;
  signal?: string;
  worker?: string;
  message?: string;
  exit_code?: number;
  duration_ms?: number;
  synthesized?: boolean;
  // progress
  detail?: Record<string, unknown>;
  // turns / interrupt
  inputSeq?: number;
  turnId?: string;
  outcome?: string;
  // create / channel
  cwd?: string;
  task?: string;
  type?: string;
  description?: string;
  labels?: string[];
  ephemeral?: boolean;
  action?: string;
  title?: string | null;
  [extra: string]: unknown;
}

export interface ChannelRef {
  name: string;
  scope: ChannelScope;
  project: string;
  dir: string;
}

export function parseChannelKind(v: string | undefined): ChannelEventKind | undefined {
  if (v === undefined) return undefined;
  if (!CHANNEL_EVENT_KINDS.has(v as ChannelEventKind)) {
    throw new Error(`无效 --kind '${v}'，须是: ${[...CHANNEL_EVENT_KINDS].join(", ")}`);
  }
  return v as ChannelEventKind;
}

export function parseChannelKinds(v: string | undefined): ChannelEventKind[] | undefined {
  if (v === undefined) return undefined;
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  const out: ChannelEventKind[] = [];
  const seen = new Set<ChannelEventKind>();
  for (const p of parts) {
    const k = parseChannelKind(p);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out.length ? out : undefined;
}

export function parseChannelScope(v: string | undefined): ChannelScope | undefined {
  if (v === undefined) return undefined;
  if (v === "project" || v === "global") return v;
  throw new Error(`无效 --scope '${v}'，须是 project | global`);
}

export function parseChannelType(v: string | undefined): ChannelType {
  if (!v || v === "chat") return "chat";
  if (v === "forum") return "forum";
  throw new Error(`无效 --type '${v}'，须是 chat | forum`);
}

export function parseCsv(value: string | undefined): string[] | undefined {
  const out = value?.split(",").map((s) => s.trim()).filter(Boolean);
  return out && out.length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// 事件过滤（wait / messages 用）
// ---------------------------------------------------------------------------
export const MEANINGFUL_EVENT_KINDS: ReadonlySet<ChannelEventKind> = new Set([
  "create", "join", "leave", "message", "thread", "context", "channel",
  "spawned", "killed", "respawned", "done", "error",
] as ChannelEventKind[]);

export interface ChannelEventFilter {
  from?: string[];
  /** 单值或列表(OR)。显式指定 kind 会绕过默认 meaningful 闸，使 supervisor_warning 等也可匹配。 */
  kind?: ChannelEventKind | readonly ChannelEventKind[];
  to?: string;
  self?: string;
  includeProgress?: boolean;
  includeNonMeaningful?: boolean;
}

function matchesKind(evKind: ChannelEventKind, fk: ChannelEventFilter["kind"]): boolean {
  if (fk === undefined) return true;
  if (typeof fk === "string") return evKind === fk;
  if (fk.length === 0) return true;
  return fk.includes(evKind);
}

export function matchesEventFilter(ev: ChannelEvent, filter: ChannelEventFilter): boolean {
  if (filter.self && ev.by === filter.self) return false;
  const hasExplicitKind =
    filter.kind !== undefined && (typeof filter.kind === "string" || filter.kind.length > 0);
  if (!filter.includeNonMeaningful && !hasExplicitKind && !MEANINGFUL_EVENT_KINDS.has(ev.kind)) {
    return false;
  }
  if (!filter.includeProgress && ev.kind === "progress") return false;
  if (!matchesKind(ev.kind, filter.kind)) return false;
  if (filter.from && filter.from.length > 0 && !filter.from.includes(ev.by)) return false;
  if (filter.to) {
    const evTo = ev.to;
    if (filter.to === "exclusive") {
      if (!evTo) return false;
    } else {
      if (!evTo) return true;
      if (Array.isArray(evTo)) return evTo.includes(filter.to);
      return evTo === filter.to;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// inbox 投递策略（supervisor inbox 子环用）
// ---------------------------------------------------------------------------
export const DEFAULT_INBOX_POLICY: InboxPolicy = "explicitOnly";

export function matchesInboxPolicy(ev: ChannelEvent, workerId: string, policy: InboxPolicy): boolean {
  if (ev.kind !== "message") return false;
  if (ev.by === workerId) return false;
  const targets = ev.to === undefined ? [] : Array.isArray(ev.to) ? ev.to : [ev.to];
  if (targets.length > 0) return targets.includes(workerId);
  return policy === "broadcastAndExplicit"; // 广播（无 to）
}
