/** aemb channel interrupt <name> --to <worker> [text] —— 写 interrupt_requested 事件（supervisor inbox 据此打断当前轮）。 */
import { appendEvent } from "./store/events";
import { resolveExistingChannelRef } from "./store/paths";
import { parseChannelScope } from "./store/schema";
import { resolveChannelTextBody } from "./text-body";

export interface InterruptOptions {
  as?: string;
  to: string;
  text?: string;
  stdin?: boolean;
  textFile?: string;
  scope?: string;
}

export async function channelInterrupt(channelName: string, opts: InterruptOptions): Promise<number> {
  if (!opts.to) {
    process.stderr.write("✗ interrupt 需要 --to <worker>\n");
    return 1;
  }
  const message = await resolveChannelTextBody(opts, {
    required: true,
    missingMessage: "未提供打断消息（用 <text> 参数 / --stdin / --text-file）",
    emptyMessage: "打断消息为空",
  });
  const ref = resolveExistingChannelRef(channelName, { scope: parseChannelScope(opts.scope) });
  const event = await appendEvent(
    channelName,
    { kind: "interrupt_requested", by: opts.as ?? "main", worker: opts.to, message: message as string, reason: "user" },
    ref.project,
  );
  console.log(JSON.stringify(event));
  return 0;
}
