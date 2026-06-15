/** aemb channel wait <name> —— tail events.jsonl 阻塞直到匹配事件或超时（超时退出码 124）。 */
import { resolveExistingChannelRef } from "./store/paths";
import { parseChannelKinds, parseChannelScope, parseCsv } from "./store/schema";
import { watchEvents, type WatchFilter } from "./store/watch";

export interface WaitOptions {
  as?: string;
  timeoutMs?: number;
  from?: string;
  kind?: string;
  to?: string;
  scope?: string;
  includeProgress?: boolean;
  /** 等到 --from 里每个 agent 都产出一个匹配事件。 */
  all?: boolean;
}

const TIMEOUT_EXIT_CODE = 124;

export async function channelWait(channelName: string, opts: WaitOptions): Promise<number> {
  const ref = resolveExistingChannelRef(channelName, { scope: parseChannelScope(opts.scope) });
  const as = opts.as ?? "main";
  const fromList = parseCsv(opts.from);
  if (opts.all && (!fromList || fromList.length === 0)) {
    process.stderr.write("✗ --all 需要 --from <a,b,...>\n");
    return 1;
  }
  const filter: WatchFilter = {
    self: as,
    from: fromList,
    kind: parseChannelKinds(opts.kind),
    to: opts.to ?? as, // 默认：广播给我 + 显式发我
    includeProgress: opts.includeProgress,
  };
  const abort = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => abort.abort(), opts.timeoutMs) : undefined;
  const pending = opts.all ? new Set(fromList) : null;
  try {
    for await (const ev of watchEvents(channelName, filter, { signal: abort.signal, project: ref.project })) {
      console.log(JSON.stringify(ev));
      if (!pending) return 0;
      pending.delete(ev.by);
      if (pending.size === 0) return 0;
    }
    if (pending && pending.size > 0) process.stderr.write(`超时：仍在等 ${[...pending].join(",")}\n`);
    return TIMEOUT_EXIT_CODE;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
