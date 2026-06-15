/** aemb channel rm <name> —— kill 所有存活 worker，再删频道目录。 */
import * as fs from "fs";
import * as path from "path";
import { pidAlive } from "./store/lock";
import { killTree } from "./kill-tree";
import { channelDir, resolveExistingChannelRef } from "./store/paths";
import { parseChannelScope } from "./store/schema";

export interface RmOptions {
  force?: boolean;
  project?: string;
  scope?: string;
}

export async function channelRm(name: string, opts: RmOptions = {}): Promise<number> {
  const project = opts.project ?? resolveExistingChannelRef(name, { scope: parseChannelScope(opts.scope) }).project;
  const dir = channelDir(name, project);
  if (!fs.existsSync(dir)) {
    process.stderr.write(`✗ 频道 '${name}' 未找到: ${dir}\n`);
    return 1;
  }
  await killLiveWorkers(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`✓ 已删除频道 '${name}'`);
  return 0;
}

async function killLiveWorkers(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const f of entries) {
    if (!f.endsWith(".pid")) continue;
    const pid = Number(fs.readFileSync(path.join(dir, f), "utf-8").trim());
    if (pid && pidAlive(pid)) {
      killTree(pid, "SIGTERM"); // win32: taskkill /T /F → 连 cmd.exe 下的 claude 孙进程一并杀
      const deadline = Date.now() + 1500;
      while (pidAlive(pid) && Date.now() < deadline) await sleep(50);
      if (pidAlive(pid)) killTree(pid, "SIGKILL");
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
