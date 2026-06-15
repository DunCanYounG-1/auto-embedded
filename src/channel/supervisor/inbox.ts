/**
 * inbox 监听：tail events.jsonl 取本 worker 的 message / interrupt_requested，编码后写进 worker stdin。
 * 持久化 inbox-cursor，使 respawn 不重放已投递事件。
 */
import type { ChildProcessByStdio } from "child_process";
import * as fs from "fs";
import type { Readable, Writable } from "stream";

import { DEFAULT_INBOX_POLICY, matchesInboxPolicy, type InboxPolicy } from "../store/schema";
import type { WorkerAdapter } from "../adapters/index";
import { appendEvent } from "../store/events";
import { workerFile } from "../store/paths";
import { watchEvents } from "../store/watch";
import type { TurnTracker } from "./turns";

type Child = ChildProcessByStdio<Writable, Readable, Readable>;

export interface InboxWatcherArgs {
  channelName: string;
  workerName: string;
  adapter: WorkerAdapter;
  ctx: unknown;
  child: Child;
  signal: AbortSignal;
  inboxPolicy?: InboxPolicy;
  turnTracker?: TurnTracker;
}

export async function runInboxWatcher(args: InboxWatcherArgs): Promise<void> {
  const { channelName, workerName, adapter, ctx, child, signal } = args;
  const inboxPolicy = args.inboxPolicy ?? DEFAULT_INBOX_POLICY;
  let cursor = readInboxCursor(channelName, workerName);

  for await (const ev of watchEvents(
    channelName,
    { self: workerName, kind: ["message", "interrupt_requested"] },
    { signal, sinceSeq: cursor, fromStart: cursor === 0 ? true : undefined },
  )) {
    if (signal.aborted) return;
    if (ev.kind === "message") {
      if (!matchesInboxPolicy(ev, workerName, inboxPolicy)) continue;
    } else if (ev.worker !== workerName) {
      continue;
    }

    const text = (ev.text ?? "").trim();
    const interruptText = (ev.message ?? "").trim();
    const isInterrupt = ev.kind === "interrupt_requested";
    if (!text && (!isInterrupt || !interruptText)) continue;

    if (!adapter.isReady(ctx)) {
      const deadline = Date.now() + 60_000;
      while (!adapter.isReady(ctx) && Date.now() < deadline && !signal.aborted) await sleep(25);
      if (!adapter.isReady(ctx)) {
        cursor = ev.seq;
        writeInboxCursor(channelName, workerName, cursor);
        continue;
      }
    }

    if (!isInterrupt) {
      await waitForActiveTurnToFinish(args.turnTracker, signal);
      if (signal.aborted) return;
    }

    if (isInterrupt) {
      const aborted = args.turnTracker?.abortCurrent();
      if (aborted) {
        await appendEvent(channelName, {
          kind: "turn_finished",
          by: workerName,
          worker: workerName,
          inputSeq: aborted.inputSeq,
          turnId: aborted.turnId,
          outcome: "aborted",
        });
      }
      await appendEvent(channelName, {
        kind: "interrupted",
        by: workerName,
        worker: workerName,
        ...(aborted?.turnId ? { turnId: aborted.turnId } : {}),
        reason: "user",
        method: "stdin",
        outcome: aborted ? "interrupted" : "no-active-turn",
      });
    }

    let turn = args.turnTracker?.begin(ev.seq);
    try {
      if (turn) {
        await appendEvent(channelName, {
          kind: "turn_started",
          by: workerName,
          worker: workerName,
          inputSeq: ev.seq,
          turnId: turn.turnId,
        });
      }
      child.stdin.write(
        isInterrupt ? adapter.encodeInterruptMessage(interruptText, ctx) : adapter.encodeUserMessage(text, ctx),
      );
      cursor = ev.seq;
      writeInboxCursor(channelName, workerName, cursor);
    } catch {
      if (turn) {
        args.turnTracker?.finish();
        await appendEvent(channelName, {
          kind: "turn_finished",
          by: workerName,
          worker: workerName,
          inputSeq: turn.inputSeq,
          turnId: turn.turnId,
          outcome: "aborted",
        }).catch(() => undefined);
        turn = undefined;
      }
      return; // stdin 已关，worker 退出中
    }
  }
}

function readInboxCursor(channelName: string, workerName: string): number {
  try {
    const raw = fs.readFileSync(workerFile(channelName, workerName, "inbox-cursor"), "utf-8");
    const n = Number(raw.trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeInboxCursor(channelName: string, workerName: string, seq: number): void {
  try {
    fs.writeFileSync(workerFile(channelName, workerName, "inbox-cursor"), String(seq), "utf-8");
  } catch {
    /* best-effort */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForActiveTurnToFinish(turnTracker: TurnTracker | undefined, signal: AbortSignal): Promise<void> {
  while (turnTracker?.current() && !signal.aborted) await sleep(25);
}
