/**
 * 文件型 advisory lock（零依赖，verbatim 自 Trellis）。
 * 用 open(path,"wx")(O_EXCL) 跨进程原子创建；lockfile 存持有者 pid，持有者 pid 已死则下次 acquire 偷锁。
 * 频道在 ~/.aemb/channels（本地盘），不支持 NFS。
 */
import * as fs from "fs";
import * as path from "path";

const DEFAULT_RETRY_INTERVAL_MS = 25;
const DEFAULT_MAX_WAIT_MS = 5000;

interface AcquireOptions {
  retryIntervalMs?: number;
  maxWaitMs?: number;
}

export async function acquireLock(lockFile: string, opts: AcquireOptions = {}): Promise<void> {
  const interval = opts.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  const deadline = Date.now() + (opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  while (true) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    if (await checkAndStealStale(lockFile)) continue;
    if (Date.now() >= deadline) {
      throw new Error(`无法在 ${opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS}ms 内获取锁 ${lockFile}`);
    }
    await sleep(interval);
  }
}

export function releaseLock(lockFile: string): void {
  try {
    // 防御：只在锁文件仍属于本进程时删（并发偷锁会用别的 pid 重建）。
    const content = fs.readFileSync(lockFile, "utf-8").trim();
    if (content === String(process.pid)) fs.unlinkSync(lockFile);
  } catch {
    /* 已不存在 */
  }
}

export async function withLock<T>(
  lockFile: string,
  fn: () => Promise<T> | T,
  opts?: AcquireOptions,
): Promise<T> {
  await acquireLock(lockFile, opts);
  try {
    return await fn();
  } finally {
    releaseLock(lockFile);
  }
}

async function checkAndStealStale(lockFile: string): Promise<boolean> {
  let holderPid = 0;
  try {
    holderPid = Number(fs.readFileSync(lockFile, "utf-8").trim());
  } catch {
    return false; // 锁在检查期间消失 → 让外层 openSync 重试
  }
  if (!holderPid || !pidAlive(holderPid)) {
    try {
      fs.unlinkSync(lockFile);
      process.stderr.write(`[channel lock] 偷走死 pid ${holderPid} 的陈旧锁: ${lockFile}\n`);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** pid 是否存活（win32 上 process.kill(pid,0) 同样可用）。 */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = 进程存在但无权限（仍算活）；ESRCH = 不存在。
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
