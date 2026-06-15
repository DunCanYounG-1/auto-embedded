/**
 * supervisor 进程：独占一个 worker（claude），桥接 worker ↔ 频道 events.jsonl。
 * 运行方式：`aemb channel __supervisor <channel> <worker> <config-path>`。
 * 两/三个并发环：stdout 读取泵、inbox 监听、关停漏斗。MVP 去掉 idle/warning（OOM 守护）子环。
 */
import { spawn, type ChildProcessByStdio } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { Readable, Writable } from "stream";

import { DEFAULT_INBOX_POLICY, type InboxPolicy } from "./store/schema";
import { getAdapter, type Provider } from "./adapters/index";
import { appendEvent } from "./store/events";
import { workerFile } from "./store/paths";
import { runInboxWatcher } from "./supervisor/inbox";
import { createShutdown, type ShutdownReason } from "./supervisor/shutdown";
import { startStdoutPump } from "./supervisor/stdout";
import { TurnTracker } from "./supervisor/turns";

export interface SupervisorConfig {
  provider: Provider;
  cwd: string;
  systemPrompt: string;
  env?: Record<string, string>;
  model?: string;
  resume?: string;
  timeoutMs?: number;
  spawnedBy?: string;
  agent?: string;
  contextFiles?: string[];
  contextManifests?: string[];
  inboxPolicy?: InboxPolicy;
}

type Child = ChildProcessByStdio<Writable, Readable, Readable>;

const SHUTDOWN_GRACE_MS = 3000;

/**
 * 解析 worker 启动命令。Windows 上 claude 是 claude.cmd 垫片：Node 24 直接 spawn .cmd（shell:false）
 * 会同步抛 EINVAL（CVE-2024-27980 修复后），故在 PATH 上解析绝对路径，并用 cmd.exe /d /s /c 包裹 .cmd/.bat
 *（与 upgrade.ts 处理 npm.cmd 一致）。其它平台直接用 provider 名。
 */
function buildWorkerSpawn(
  provider: string,
  args: string[],
): { command: string; args: string[]; verbatim?: boolean } {
  if (process.platform !== "win32") return { command: provider, args };
  const dirs = (process.env.PATH || "").split(path.delimiter);
  let resolved = provider;
  outer: for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of [".cmd", ".exe", ".bat", ""]) {
      const candidate = path.join(dir, provider + ext);
      try {
        if (fs.statSync(candidate).isFile()) {
          resolved = candidate;
          break outer;
        }
      } catch {
        /* next */
      }
    }
  }
  if (/\.(cmd|bat)$/i.test(resolved)) {
    // cmd.exe /c 的解析会在第一个空格处切断程序路径，故手工把整条命令行加引号、用 windowsVerbatimArguments 原样透传
    // （否则含空格的路径——C:\Program Files\… 或带空格的用户名 npm 全局前缀——会启动失败）。
    const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
    const line = [q(resolved), ...args.map(q)].join(" ");
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], verbatim: true };
  }
  return { command: resolved, args }; // 解析到 .exe 或回退 provider（ENOENT 由 child.on('error') 兜底）
}

export async function runSupervisor(channelName: string, workerName: string, configPath: string): Promise<void> {
  const config = readConfig(configPath);
  const project = process.env.AEMB_CHANNEL_PROJECT;

  fs.writeFileSync(workerFile(channelName, workerName, "pid", project), String(process.pid));

  const adapter = getAdapter(config.provider);
  const adapterCtx = adapter.createCtx();
  const view = { resume: config.resume, model: config.model, systemPrompt: config.systemPrompt, cwd: config.cwd };
  const args = adapter.buildArgs(view);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...config.env,
    AEMB_HOOKS: "0",
    AEMB_CHANNEL: channelName,
    AEMB_CHANNEL_AS: workerName,
  };

  const logPath = workerFile(channelName, workerName, "log", project);
  const log = fs.createWriteStream(logPath);
  log.write(`[supervisor] starting ${adapter.provider} ${args.join(" ")}\n`);

  const plan = buildWorkerSpawn(adapter.provider, args);
  let child: Child;
  try {
    child = spawn(plan.command, plan.args, {
      cwd: config.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      ...(plan.verbatim ? { windowsVerbatimArguments: true } : {}), // 仅 .cmd 包裹分支：args 已手工加引号，勿再让 Node 转义
    }) as Child;
  } catch (err) {
    // 同步抛错（如平台仍拒绝该可执行）→ 写 error 事件、清理、退出，绝不留下哑死的 supervisor。
    const msg = err instanceof Error ? err.message : String(err);
    log.write(`[supervisor] spawn threw synchronously: ${msg}\n`);
    try {
      await appendEvent(
        channelName,
        { kind: "error", by: `supervisor:${workerName}`, message: `worker spawn 同步失败: ${msg}`, provider: config.provider },
        project,
      );
    } catch {
      /* exiting */
    }
    await cleanup(channelName, workerName).catch(() => undefined);
    process.exit(1);
  }

  const shutdown = createShutdown({
    channelName,
    workerName,
    log,
    getChild: () => child,
    graceMs: SHUTDOWN_GRACE_MS,
    timeoutMs: config.timeoutMs,
  });

  let spawnFailed = false;
  let settleSpawn: () => void = () => undefined;
  const spawnSettled = new Promise<void>((resolve) => {
    settleSpawn = resolve;
  });

  // 监听器必须同步挂（spawn 与这些行之间不能 await）：spawn 失败时 Node 下个 tick fire error，
  // 此时若无监听器，supervisor 会因 unhandled error 死掉并留下陈旧 .pid。
  child.stderr.on("data", (b: Buffer) => log.write(b));
  child.once("spawn", () => settleSpawn());
  child.on("error", (err) => {
    if (spawnFailed) return;
    log.write(`[supervisor] worker error: ${err.message}\n`);
    if (!child.pid) {
      // pre-spawn 失败（ENOENT/EACCES）：发一个 error 事件，跳过误导性的 spawned，清理后退出。
      spawnFailed = true;
      settleSpawn();
      void (async () => {
        try {
          await appendEvent(
            channelName,
            { kind: "error", by: `supervisor:${workerName}`, message: `worker spawn 失败: ${err.message}`, provider: config.provider },
            project,
          );
        } catch {
          /* exiting */
        }
        await cleanup(channelName, workerName).catch(() => undefined);
        process.exit(1);
      })();
      return;
    }
    // post-spawn error：先同步认领 shutdown，再 await error append（保证 error 先于 killed 落盘）。
    shutdown.claim("crash");
    void (async () => {
      try {
        await appendEvent(
          channelName,
          { kind: "error", by: `supervisor:${workerName}`, message: `worker 进程错误: ${err.message}`, provider: config.provider },
          project,
        );
      } catch {
        /* ignore */
      }
      await shutdown.request("SIGTERM", "crash");
    })();
  });
  child.on("exit", (code, sig) => {
    void (async () => {
      await shutdown.finalizeOnExit(code, sig).catch(() => undefined);
      await cleanup(channelName, workerName).catch(() => undefined);
      process.exit(0);
    })();
  });

  // 信号处理必须在任何 await 前注册，否则窗口期到来的 SIGTERM 走 Node 默认行为（孤儿 child + 跳过 killed）。
  process.on("SIGTERM", () => {
    void shutdown.request("SIGTERM", readExternalShutdownReason(channelName, workerName, project));
  });
  process.on("SIGINT", () => void shutdown.request("SIGINT", "explicit-kill"));
  // SIGHUP 在 Windows 上不存在，注册会抛错 → 平台守卫。
  if (process.platform !== "win32") {
    process.on("SIGHUP", () => void shutdown.request("SIGHUP", "explicit-kill"));
  }

  await spawnSettled;
  if (spawnFailed) return;
  if (shutdown.isShuttingDown()) {
    await shutdown.awaitFinalize();
    return;
  }

  fs.writeFileSync(workerFile(channelName, workerName, "worker-pid", project), String(child.pid));

  await appendEvent(
    channelName,
    {
      kind: "spawned",
      by: config.spawnedBy ?? "main",
      as: workerName,
      provider: config.provider,
      pid: child.pid,
      inboxPolicy: config.inboxPolicy ?? DEFAULT_INBOX_POLICY,
      ...(config.agent ? { agent: config.agent } : {}),
      ...(config.contextFiles && config.contextFiles.length > 0 ? { files: config.contextFiles } : {}),
      ...(config.contextManifests && config.contextManifests.length > 0 ? { manifests: config.contextManifests } : {}),
    },
    project,
  );

  const turnTracker = new TurnTracker();

  // ── 1. stdout 读取泵 ──
  startStdoutPump({ channelName, workerName, child, adapter, adapterCtx, log, shutdown, turnTracker });

  // ── 超时守护（防僵尸）──
  if (config.timeoutMs && config.timeoutMs > 0) {
    setTimeout(() => {
      log.write(`[supervisor] timeout ${config.timeoutMs}ms reached, killing worker\n`);
      void shutdown.request("SIGTERM", "timeout");
    }, config.timeoutMs).unref();
  }

  // ── 2. inbox 监听（在 handshake 前启动，捕获握手窗口期消息）──
  const abort = new AbortController();
  process.on("exit", () => abort.abort());
  void runInboxWatcher({
    channelName,
    workerName,
    adapter,
    ctx: adapterCtx,
    child,
    signal: abort.signal,
    inboxPolicy: config.inboxPolicy ?? DEFAULT_INBOX_POLICY,
    turnTracker,
  });

  // ── adapter handshake（claude 无；codex 等才有，stage 2）──
  if (adapter.handshake) {
    try {
      await adapter.handshake({ child, ctx: adapterCtx, view });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.write(`[supervisor] adapter handshake failed: ${msg}\n`);
      void (async () => {
        try {
          await appendEvent(
            channelName,
            { kind: "error", by: `supervisor:${workerName}`, message: `handshake 失败: ${msg}`, provider: config.provider },
            project,
          );
        } catch {
          /* ignore */
        }
        await shutdown.request("SIGTERM", "crash");
      })();
    }
  }
}

async function cleanup(channelName: string, workerName: string): Promise<void> {
  // 删临时运行文件，保留 log/session-id/inbox-cursor（forensic / resume / 防 respawn 重放）。
  for (const suffix of ["pid", "worker-pid", "config", "spawnlock", "shutdown-reason", "reservation"]) {
    try {
      fs.unlinkSync(workerFile(channelName, workerName, suffix, process.env.AEMB_CHANNEL_PROJECT));
    } catch {
      /* already gone */
    }
  }
}

function readExternalShutdownReason(channelName: string, workerName: string, project?: string): ShutdownReason {
  const file = workerFile(channelName, workerName, "shutdown-reason", project);
  try {
    const reason = fs.readFileSync(file, "utf-8").trim();
    fs.unlinkSync(file);
    if (reason === "idle-timeout") return "idle-timeout";
  } catch {
    /* 普通外部 SIGTERM = explicit-kill */
  }
  return "explicit-kill";
}

function readConfig(p: string): SupervisorConfig {
  return JSON.parse(fs.readFileSync(p, "utf-8")) as SupervisorConfig;
}

/** fork supervisor 前写一份 config 文件。 */
export function writeSupervisorConfig(
  channelName: string,
  workerName: string,
  config: SupervisorConfig,
  project?: string,
): string {
  const p = workerFile(channelName, workerName, "config", project);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
  return p;
}
