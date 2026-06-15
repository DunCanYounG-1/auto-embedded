import type { ChannelEventKind } from "../store/schema";

/**
 * adapter 从一行 worker stdout 解析出的事件。adapter 不赋 seq/ts/by（supervisor 追加前补全），
 * 只决定 kind + payload。
 */
export interface AdapterEvent {
  kind: ChannelEventKind;
  payload?: Record<string, unknown>;
}

/** adapter 解析该行时请求的副作用（supervisor 在 append 后执行）。 */
export interface AdapterSideEffect {
  persistSessionId?: string;
  persistThreadId?: string;
  /** adapter 想写回 worker stdin 的行（已含换行）。 */
  reply?: string[];
}

export interface ParseResult {
  events: AdapterEvent[];
  side?: AdapterSideEffect;
}
