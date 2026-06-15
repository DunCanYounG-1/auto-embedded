/**
 * stdout 管线：行缓冲读 → adapter.parseLine → append 事件 + 持久化 session/thread id + 把 adapter reply 写回 worker stdin。
 */
import type { ChildProcessByStdio } from "child_process";
import * as fs from "fs";
import type { Readable, Writable } from "stream";

import type { WorkerAdapter } from "../adapters/index";
import type { ParseResult } from "../adapters/types";
import { appendEvent } from "../store/events";
import { workerFile } from "../store/paths";
import type { ShutdownController } from "./shutdown";
import type { TurnOutcome, TurnTracker } from "./turns";

type Child = ChildProcessByStdio<Writable, Readable, Readable>;

/** 行缓冲 stdout 泵：newline 到达即把整行交给 onLine；包 .catch 防 unhandledRejection。 */
export function pumpStdout(
  stream: Readable,
  onLine: (line: string) => Promise<void> | void,
  onError?: (err: Error) => void,
): void {
  let buf = "";
  stream.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf-8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim()) {
        Promise.resolve()
          .then(() => onLine(line))
          .catch((err) => {
            if (onError) {
              try {
                onError(err instanceof Error ? err : new Error(String(err)));
              } catch {
                /* swallow */
              }
            }
          });
      }
    }
  });
}

/** 把 adapter ParseResult 落成频道事件 + 副作用（session-id 持久化、stdin 写回），并通知 shutdown adapter 已发终止事件。 */
export async function applyParseResult(
  channelName: string,
  workerName: string,
  result: ParseResult,
  child: Child,
  shutdown: ShutdownController,
  turnTracker?: TurnTracker,
): Promise<void> {
  for (const ev of result.events) {
    if (ev.kind === "done" || ev.kind === "error") shutdown.markTerminalEmitted();
    await appendEvent(channelName, { kind: ev.kind, by: workerName, ...(ev.payload ?? {}) });
    if (ev.kind === "done" || ev.kind === "error") {
      const turn = turnTracker?.finish();
      if (turn) {
        const outcome: TurnOutcome = ev.kind === "done" ? "done" : "error";
        await appendEvent(channelName, {
          kind: "turn_finished",
          by: workerName,
          worker: workerName,
          inputSeq: turn.inputSeq,
          turnId: turn.turnId,
          outcome,
        });
      }
    }
  }
  if (result.side) {
    const { reply, persistSessionId, persistThreadId } = result.side;
    if (persistSessionId) fs.writeFileSync(workerFile(channelName, workerName, "session-id"), persistSessionId);
    if (persistThreadId) fs.writeFileSync(workerFile(channelName, workerName, "thread-id"), persistThreadId);
    if (reply) {
      for (const r of reply) {
        try {
          child.stdin.write(r);
        } catch {
          /* worker stdin 已关，supervisor 即将退出 */
        }
      }
    }
  }
}

export function startStdoutPump(args: {
  channelName: string;
  workerName: string;
  child: Child;
  adapter: WorkerAdapter;
  adapterCtx: unknown;
  log: { write: (data: string) => void };
  shutdown: ShutdownController;
  turnTracker?: TurnTracker;
}): void {
  const { channelName, workerName, child, adapter, adapterCtx, log, shutdown, turnTracker } = args;
  pumpStdout(
    child.stdout,
    async (line: string) => {
      log.write(line + "\n");
      const result = adapter.parseLine(line, adapterCtx);
      await applyParseResult(channelName, workerName, result, child, shutdown, turnTracker);
    },
    (err) => {
      log.write(`[supervisor] stdout 行处理失败: ${err.message}\n`);
      void appendEvent(channelName, {
        kind: "error",
        by: `supervisor:${workerName}`,
        message: `stdout 管线错误: ${err.message}`,
      }).catch(() => undefined);
    },
  );
}
