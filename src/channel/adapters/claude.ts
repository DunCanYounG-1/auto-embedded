/**
 * Claude `--input-format stream-json --output-format stream-json` adapter（纯函数，verbatim 自 Trellis）。
 * system.init→persist session_id（无事件）；assistant.content[]：text→message，tool_use→progress，thinking→skip；
 * result→done|error。
 */
import type { AdapterEvent, ParseResult } from "./types";

interface ClaudeRawMsg {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: ClaudeMessageContent;
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
}

interface ClaudeMessageContent {
  role?: string;
  model?: string;
  content?: ClaudeBlock[];
}

interface ClaudeBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
}

function summarizeInput(input: unknown, max = 120): string {
  if (input === null || input === undefined) return "";
  let s: string;
  try {
    s = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    s = String(input);
  }
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function isMcpToolName(name: string): boolean {
  return /^mcp__/.test(name);
}

/** 解析一行 Claude stream-json stdout → 频道事件 + 副作用。纯函数，无 IO。 */
export function parseClaudeLine(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { events: [] };
  let msg: ClaudeRawMsg;
  try {
    msg = JSON.parse(trimmed) as ClaudeRawMsg;
  } catch {
    return {
      events: [{ kind: "error", payload: { message: "解析 Claude stdout 行失败", raw_excerpt: trimmed.slice(0, 200) } }],
    };
  }
  switch (msg.type) {
    case "system":
      return handleSystem(msg);
    case "assistant":
      return handleAssistant(msg);
    case "user":
    case "rate_limit_event":
    case "control_response":
      return { events: [] };
    case "result":
      return handleResult(msg);
    default:
      return { events: [] };
  }
}

function handleSystem(msg: ClaudeRawMsg): ParseResult {
  if (msg.subtype === "init" && msg.session_id) {
    return { events: [], side: { persistSessionId: msg.session_id } };
  }
  return { events: [] };
}

function handleAssistant(msg: ClaudeRawMsg): ParseResult {
  const blocks = msg.message?.content;
  if (!Array.isArray(blocks)) return { events: [] };
  const events: AdapterEvent[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "text": {
        if (b.text && b.text.length > 0) events.push({ kind: "message", payload: { text: b.text } });
        break;
      }
      case "tool_use": {
        const name = b.name ?? "";
        const payload: Record<string, unknown> = {
          detail: { tool: name, input_summary: summarizeInput(b.input) },
        };
        if (isMcpToolName(name)) {
          const parts = name.split("__");
          (payload.detail as Record<string, unknown>).kind = "mcp";
          if (parts.length >= 3) {
            (payload.detail as Record<string, unknown>).server = parts[1];
            (payload.detail as Record<string, unknown>).tool_name = parts.slice(2).join("__");
          }
        }
        events.push({ kind: "progress", payload });
        break;
      }
      default:
        break; // thinking / 未知块 → skip
    }
  }
  return { events };
}

function handleResult(msg: ClaudeRawMsg): ParseResult {
  if (msg.is_error) {
    return {
      events: [{ kind: "error", payload: { message: msg.result ?? "Claude 报告 is_error", duration_ms: msg.duration_ms } }],
    };
  }
  // 不把 msg.result 复制进 done.text：最终文本已作为 assistant text 块发过 message 事件，重复会让 GUI 渲染两次。
  return {
    events: [{ kind: "done", payload: { duration_ms: msg.duration_ms, total_cost_usd: msg.total_cost_usd, num_turns: msg.num_turns } }],
  };
}

/** 把频道 user 消息编码成 Claude stream-json stdin 行。 */
export function encodeClaudeUserMessage(text: string): string {
  return JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n";
}

/** 中断：先发 control_request(interrupt)，再发替换 prompt。 */
export function encodeClaudeInterruptMessage(text: string): string {
  const lines = [
    JSON.stringify({
      type: "control_request",
      request_id: `aemb-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      request: { subtype: "interrupt" },
    }),
    encodeClaudeUserMessage(text).trimEnd(),
  ];
  return lines.join("\n") + "\n";
}

/** 组装 `claude -p` stream-json 模式的 CLI 参数。 */
export function buildClaudeArgs(opts: {
  resumeSessionId?: string;
  model?: string;
  verbose?: boolean;
  systemPrompt?: string;
}): string[] {
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--permission-mode",
    "bypassPermissions",
    "--dangerously-skip-permissions",
  ];
  if (opts.verbose !== false) args.push("--verbose");
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
  if (opts.model) args.push("--model", opts.model);
  if (opts.systemPrompt?.trim()) args.push("--append-system-prompt", opts.systemPrompt);
  return args;
}
