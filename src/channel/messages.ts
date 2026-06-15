/** aemb channel messages <name> —— 读 events.jsonl 打印（纯文本，无 chalk）；--follow tail。 */
import * as fs from "fs";
import { readChannelEvents } from "./store/events";
import { eventsPath, resolveExistingChannelRef } from "./store/paths";
import {
  matchesEventFilter,
  parseChannelKind,
  parseChannelScope,
  parseCsv,
  type ChannelEvent,
  type ChannelEventFilter,
} from "./store/schema";
import { watchEvents } from "./store/watch";

export interface MessagesOptions {
  raw?: boolean;
  follow?: boolean;
  last?: number;
  since?: number;
  kind?: string;
  from?: string;
  to?: string;
  noProgress?: boolean;
  scope?: string;
}

export async function channelMessages(channelName: string, opts: MessagesOptions): Promise<number> {
  const ref = resolveExistingChannelRef(channelName, { scope: parseChannelScope(opts.scope) });
  const file = eventsPath(channelName, ref.project);
  if (!fs.existsSync(file)) {
    process.stderr.write(`✗ 频道 '${channelName}' 未找到: ${file}\n`);
    return 1;
  }
  const all = await readChannelEvents(channelName, ref.project);
  const filter: ChannelEventFilter = {
    kind: parseChannelKind(opts.kind),
    from: parseCsv(opts.from),
    to: opts.to,
    includeProgress: !opts.noProgress,
    includeNonMeaningful: true,
  };
  const filtered = all.filter((ev) => {
    if (opts.since !== undefined && ev.seq <= opts.since) return false;
    return matchesEventFilter(ev, filter);
  });
  const view = opts.last === undefined ? filtered : opts.last <= 0 ? [] : filtered.slice(-opts.last);
  for (const ev of view) printEvent(ev, opts.raw ?? false);

  if (opts.follow) {
    const abort = new AbortController();
    process.on("SIGINT", () => abort.abort());
    for await (const ev of watchEvents(channelName, filter, { signal: abort.signal, project: ref.project })) {
      printEvent(ev, opts.raw ?? false);
    }
  }
  return 0;
}

function printEvent(ev: ChannelEvent, raw: boolean): void {
  if (raw) {
    console.log(JSON.stringify(ev));
    return;
  }
  const ts = (ev.ts || "").slice(11, 19);
  const tag = `[${ev.kind}]`.padEnd(10);
  const head = `${tag} #${ev.seq} ${ts} by=${ev.by}`;
  switch (ev.kind) {
    case "create":
      console.log(`${head}  type=${ev.type ?? "chat"}${ev.task ? "  task=" + ev.task : ""}`);
      if (ev.description) console.log(`           ${ev.description}`);
      break;
    case "spawned":
      console.log(`${head}  worker=${ev.as ?? "?"} provider=${ev.provider ?? "?"} pid=${ev.pid ?? "?"}${ev.agent ? " agent=" + ev.agent : ""}`);
      break;
    case "killed":
      console.log(`${head}  worker=${ev.worker ?? "?"} reason=${ev.reason ?? "?"} signal=${ev.signal ?? "?"}`);
      break;
    case "message": {
      const to = ev.to ? `  to=${Array.isArray(ev.to) ? ev.to.join(",") : ev.to}` : "";
      console.log(`${head}${to}`);
      if (ev.text) console.log(`           ${ev.text.replace(/\n/g, "\n           ")}`);
      break;
    }
    case "done":
      console.log(`${head}${ev.duration_ms !== undefined ? "  duration=" + ev.duration_ms + "ms" : ""}${ev.synthesized ? "  (synthesized)" : ""}`);
      break;
    case "error":
      console.log(`${head}  ${ev.message ?? ""}`);
      break;
    case "progress": {
      const d = ev.detail ?? {};
      const parts: string[] = [];
      for (const k of ["kind", "tool", "tool_name", "server", "status"]) {
        if (d[k] !== undefined) parts.push(`${k}=${String(d[k]).slice(0, 60)}`);
      }
      console.log(`${head}  ${parts.join(" ")}`);
      break;
    }
    case "turn_started":
    case "turn_finished":
    case "interrupted":
    case "interrupt_requested":
      console.log(`${head}  worker=${ev.worker ?? "?"}${ev.outcome ? " outcome=" + ev.outcome : ""}${ev.turnId ? " turn=" + ev.turnId : ""}`);
      break;
    default:
      console.log(head);
  }
}
