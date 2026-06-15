/** aemb channel kill <name> --as <worker> —— 给 supervisor 发 SIGTERM（--force 直接 SIGKILL），CLI 侧补 killed 事件。 */
import * as fs from "fs";
import { appendEvent } from "./store/events";
import { withLock, pidAlive } from "./store/lock";
import { killTree } from "./kill-tree";
import { resolveExistingChannelRef, workerFile, workerLockPath } from "./store/paths";
import { parseChannelScope } from "./store/schema";

export interface KillOptions {
  as: string;
  force?: boolean;
  scope?: string;
}

const POLL_INTERVAL_MS = 100;
const KILL_GRACE_MS = 8000;

export async function channelKill(channelName: string, opts: KillOptions): Promise<number> {
  if (!opts.as) {
    process.stderr.write("✗ kill 需要 --as <worker>\n");
    return 1;
  }
  const ref = resolveExistingChannelRef(channelName, { scope: parseChannelScope(opts.scope) });
  return withLock(
    workerLockPath(channelName, opts.as, ref.project),
    () => killLocked(channelName, opts, ref.project),
    { maxWaitMs: KILL_GRACE_MS + 2000 },
  );
}

async function killLocked(channelName: string, opts: KillOptions, project: string): Promise<number> {
  const pidPath = workerFile(channelName, opts.as, "pid", project);
  if (!fs.existsSync(pidPath)) {
    process.stderr.write(`✗ worker '${opts.as}' 未在频道 '${channelName}' 运行\n`);
    return 1;
  }
  const supervisorPid = Number(fs.readFileSync(pidPath, "utf-8").trim());
  if (!supervisorPid || !pidAlive(supervisorPid)) {
    await appendEvent(
      channelName,
      { kind: "error", by: "cli:kill", message: `supervisor 已丢失 (pid ${supervisorPid})`, worker: opts.as },
      project,
    );
    cleanupFiles(channelName, opts.as, project);
    return 0;
  }

  if (opts.force) {
    const workerPidPath = workerFile(channelName, opts.as, "worker-pid", project);
    if (fs.existsSync(workerPidPath)) {
      const wpid = Number(fs.readFileSync(workerPidPath, "utf-8").trim());
      if (wpid && pidAlive(wpid)) killTree(wpid, "SIGKILL"); // win32: taskkill /T /F → 连 claude 孙进程
    }
    killTree(supervisorPid, "SIGKILL");
    await appendEvent(
      channelName,
      { kind: "killed", by: "cli:kill", worker: opts.as, reason: "explicit-kill", signal: "SIGKILL" },
      project,
    );
  } else {
    killTree(supervisorPid, "SIGTERM");
  }

  const deadline = Date.now() + KILL_GRACE_MS;
  while (pidAlive(supervisorPid) && Date.now() < deadline) await sleep(POLL_INTERVAL_MS);

  if (pidAlive(supervisorPid)) {
    killTree(supervisorPid, "SIGKILL");
    await appendEvent(
      channelName,
      { kind: "killed", by: "cli:kill", worker: opts.as, reason: "explicit-kill", signal: "SIGKILL", detail: { note: "grace expired, CLI SIGKILL" } },
      project,
    );
  }
  cleanupFiles(channelName, opts.as, project);
  console.log(`✓ 已 kill worker '${opts.as}'`);
  return 0;
}

function cleanupFiles(channelName: string, worker: string, project: string): void {
  for (const suffix of ["pid", "worker-pid", "config", "spawnlock"]) {
    try {
      fs.unlinkSync(workerFile(channelName, worker, suffix, project));
    } catch {
      /* gone */
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
