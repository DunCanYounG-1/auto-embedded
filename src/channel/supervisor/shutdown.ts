/**
 * ShutdownController —— 所有"worker 要走了"的统一漏斗（显式 kill / 超时 / 崩溃 / 信号 / 子进程退出）。
 * 拥有：idempotent reason、SIGTERM→宽限→SIGKILL 阶梯、尾随 killed 事件、terminalEmitted 标记、
 * finalizeOnExit（adapter 没发 done/error 时合成一个兜底，否则 wait --kind done 永远挂住）。
 */
import type { ChildProcessByStdio } from "child_process";
import type { Readable, Writable } from "stream";
import { appendEvent } from "../store/events";
import { killTree } from "../kill-tree";

type Child = ChildProcessByStdio<Writable, Readable, Readable>;

export type ShutdownReason = "explicit-kill" | "timeout" | "crash" | "idle-timeout";

export interface ShutdownController {
  request(signal: NodeJS.Signals, reason: ShutdownReason): Promise<void>;
  claim(reason: ShutdownReason): boolean;
  isShuttingDown(): boolean;
  reason(): ShutdownReason | null;
  markTerminalEmitted(): void;
  hasTerminalEvent(): boolean;
  finalizeOnExit(code: number | null, signal: NodeJS.Signals | null): Promise<void>;
  awaitFinalize(): Promise<void>;
}

export interface CreateShutdownArgs {
  channelName: string;
  workerName: string;
  log: { write: (data: string) => void };
  getChild: () => Child;
  graceMs: number;
  timeoutMs?: number;
  idleTimeoutMs?: number;
}

export function createShutdown(args: CreateShutdownArgs): ShutdownController {
  const { channelName, workerName, log, getChild, graceMs, timeoutMs, idleTimeoutMs } = args;

  let shutdownReason: ShutdownReason | null = null;
  let requestSignal: NodeJS.Signals | null = null;
  let terminalEmitted = false;
  let killedPromise: Promise<void> | null = null;

  const childStillRunning = (child: Child): boolean => child.exitCode === null && child.signalCode === null;

  const startKillLadder = (child: Child): void => {
    try {
      child.stdin.end();
    } catch {
      /* already closed */
    }
    setTimeout(() => {
      if (childStillRunning(child)) {
        log.write(`[supervisor] grace expired, SIGTERM worker\n`);
        killTree(child.pid, "SIGTERM"); // win32：taskkill /T /F 连 cmd.exe 下的 claude 孙进程一并杀，防孤儿
        setTimeout(() => {
          if (childStillRunning(child)) {
            log.write(`[supervisor] still alive, SIGKILL worker\n`);
            killTree(child.pid, "SIGKILL");
          }
        }, graceMs);
      }
    }, graceMs);
  };

  const writeKilled = async (reason: ShutdownReason, signal: NodeJS.Signals): Promise<void> => {
    await appendEvent(channelName, {
      kind: "killed",
      by: `supervisor:${workerName}`,
      reason,
      signal,
      ...(reason === "timeout" && timeoutMs ? { timeout_ms: timeoutMs } : {}),
      ...(reason === "idle-timeout" && idleTimeoutMs ? { idle_timeout_ms: idleTimeoutMs } : {}),
    });
  };

  const claim = (reason: ShutdownReason): boolean => {
    if (shutdownReason) return false;
    shutdownReason = reason;
    return true;
  };

  const request = async (signal: NodeJS.Signals, reason: ShutdownReason): Promise<void> => {
    if (killedPromise) {
      await killedPromise.catch(() => undefined);
      return;
    }
    shutdownReason ??= reason;
    requestSignal ??= signal;
    log.write(`[supervisor] shutting down worker (reason=${shutdownReason}, signal=${requestSignal})\n`);
    startKillLadder(getChild());
    killedPromise = writeKilled(shutdownReason, requestSignal);
    await killedPromise;
  };

  const finalizeOnExit = async (code: number | null, signal: NodeJS.Signals | null): Promise<void> => {
    log.write(`[supervisor] worker exit code=${code ?? "null"} signal=${signal ?? "null"}\n`);
    // 冷退出（无显式 shutdown）时合成兜底终止事件，避免 wait --kind done 永挂。同步认领 terminal slot 防重复。
    if (!terminalEmitted && shutdownReason === null) {
      terminalEmitted = true;
      if (code === 0) {
        await appendEvent(channelName, { kind: "done", by: workerName, synthesized: true, exit_code: code });
      } else {
        await appendEvent(channelName, {
          kind: "error",
          by: workerName,
          message: `worker 未发终止事件即退出 (code=${code ?? "null"}, signal=${signal ?? "null"})`,
          synthesized: true,
          exit_code: code === null ? undefined : code,
          exit_signal: signal === null ? undefined : signal,
        });
      }
    }
    if (killedPromise) await killedPromise.catch(() => undefined);
  };

  return {
    request,
    claim,
    isShuttingDown: () => shutdownReason !== null,
    reason: () => shutdownReason,
    markTerminalEmitted: () => {
      terminalEmitted = true;
    },
    hasTerminalEvent: () => terminalEmitted,
    finalizeOnExit,
    awaitFinalize: () => killedPromise ?? Promise.resolve(),
  };
}
