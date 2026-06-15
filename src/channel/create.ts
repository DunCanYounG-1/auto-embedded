/** aemb channel create <name> —— 写一条 create 事件，建立频道目录。 */
import * as fs from "fs";
import { appendEvent } from "./store/events";
import { ensureBucketMarker, eventsPath, resolveChannelProjectForCreate } from "./store/paths";
import { parseChannelScope, parseChannelType, parseCsv } from "./store/schema";

export interface CreateOptions {
  task?: string;
  labels?: string;
  cwd?: string;
  scope?: string;
  type?: string;
  description?: string;
  by?: string;
  force?: boolean;
  ephemeral?: boolean;
}

export async function channelCreate(name: string, opts: CreateOptions): Promise<number> {
  const scope = parseChannelScope(opts.scope) ?? "project";
  const type = parseChannelType(opts.type);
  const ref = resolveChannelProjectForCreate(name, { scope, cwd: opts.cwd });
  if (fs.existsSync(eventsPath(name, ref.project))) {
    if (!opts.force) {
      process.stderr.write(`✗ 频道 '${name}' 已存在: ${ref.dir}（加 --force 重建）\n`);
      return 1;
    }
    fs.rmSync(ref.dir, { recursive: true, force: true });
  }
  ensureBucketMarker(ref.project);
  const labels = parseCsv(opts.labels);
  await appendEvent(
    name,
    {
      kind: "create",
      by: opts.by ?? "main",
      type,
      cwd: opts.cwd ?? process.cwd(),
      ...(opts.task ? { task: opts.task } : {}),
      ...(labels ? { labels } : {}),
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.ephemeral ? { ephemeral: true } : {}),
    },
    ref.project,
  );
  console.log(`✓ 创建频道 '${name}' (${type}) @ ${ref.dir}`);
  return 0;
}
