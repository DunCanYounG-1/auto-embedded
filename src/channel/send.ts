/** aemb channel send <name> [text] —— 写一条 message 事件（可 --to 定向）。 */
import { appendEvent } from "./store/events";
import { resolveExistingChannelRef } from "./store/paths";
import { parseChannelScope, parseCsv } from "./store/schema";
import { resolveChannelTextBody } from "./text-body";

export interface SendOptions {
  as?: string;
  text?: string;
  stdin?: boolean;
  textFile?: string;
  scope?: string;
  to?: string; // CSV
}

export async function channelSend(channelName: string, opts: SendOptions): Promise<number> {
  const text = await resolveChannelTextBody(opts, {
    required: true,
    missingMessage: "未提供文本（用 <text> 参数 / --stdin / --text-file）",
    emptyMessage: "消息为空",
  });
  const ref = resolveExistingChannelRef(channelName, { scope: parseChannelScope(opts.scope) });
  const to = parseCsv(opts.to);
  const event = await appendEvent(
    channelName,
    {
      kind: "message",
      by: opts.as ?? "main",
      text: text as string,
      ...(to ? { to: to.length === 1 ? to[0] : to } : {}),
    },
    ref.project,
  );
  console.log(JSON.stringify(event));
  return 0;
}
