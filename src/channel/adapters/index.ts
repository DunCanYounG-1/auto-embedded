/**
 * Worker adapter 注册表。每个 provider 实现 WorkerAdapter（如何 spawn / 解析 stdout / 编码 stdin）。
 * supervisor/spawn 与具体 provider 无关；新增 provider = 写 adapters/<name>.ts + 在 REGISTRY 注册。
 * MVP 仅 claude；codex 延后 stage 2。
 */
import type { ChildProcessByStdio } from "child_process";
import type { Readable, Writable } from "stream";

import {
  buildClaudeArgs,
  encodeClaudeInterruptMessage,
  encodeClaudeUserMessage,
  parseClaudeLine,
} from "./claude";
import type { ParseResult } from "./types";

export type WorkerChild = ChildProcessByStdio<Writable, Readable, Readable>;
export type AdapterCtx = unknown;

export interface SupervisorView {
  resume?: string;
  model?: string;
  systemPrompt: string;
  cwd: string;
}

export interface WorkerAdapter<Ctx = AdapterCtx> {
  readonly provider: Provider;
  buildArgs(view: SupervisorView): string[];
  createCtx(): Ctx;
  handshake?(args: { child: WorkerChild; ctx: Ctx; view: SupervisorView }): Promise<void>;
  isReady(ctx: Ctx): boolean;
  parseLine(line: string, ctx: Ctx): ParseResult;
  encodeUserMessage(text: string, ctx: Ctx): string;
  encodeInterruptMessage(text: string, ctx: Ctx): string;
}

/** Claude adapter —— stream-json over stdio，无 handshake，spawn 后即就绪。 */
const claudeAdapter: WorkerAdapter<undefined> = {
  provider: "claude",
  buildArgs(view) {
    return buildClaudeArgs({ resumeSessionId: view.resume, model: view.model, systemPrompt: view.systemPrompt });
  },
  createCtx() {
    return undefined;
  },
  isReady() {
    return true;
  },
  parseLine(line) {
    return parseClaudeLine(line);
  },
  encodeUserMessage(text) {
    return encodeClaudeUserMessage(text);
  },
  encodeInterruptMessage(text) {
    return encodeClaudeInterruptMessage(text);
  },
};

/** 已知 provider 单一事实源。新增 adapter：写 adapters/<name>.ts + 在此加一行。 */
const REGISTRY = {
  claude: claudeAdapter,
} as const;

export type Provider = keyof typeof REGISTRY;

export function listProviders(): Provider[] {
  return Object.keys(REGISTRY) as Provider[];
}

export function isProvider(value: string): value is Provider {
  return value in REGISTRY;
}

export function getAdapter(provider: Provider): WorkerAdapter<AdapterCtx> {
  const a = REGISTRY[provider];
  if (!a) throw new Error(`未知 provider '${provider}'（已注册: ${listProviders().join(", ")}）`);
  return a as WorkerAdapter<AdapterCtx>;
}
