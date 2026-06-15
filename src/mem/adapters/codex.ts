/**
 * Codex 持久化会话读取器。
 * 布局：~/.codex/sessions/**\/rollout-<ts>-<id>.jsonl。元数据读首事件的 payload；文件名时间戳作 created 兜底。
 */

import * as fs from "fs";
import * as path from "path";

import { stripInjectionTags, isBootstrapTurn } from "../dialogue";
import { inRangeOverlap, sameProject } from "../filter";
import { readJsonl, readJsonlFirst } from "../internal/jsonl";
import { CODEX_SESSIONS, walkDir } from "../internal/paths";
import { parseTaskPyCommandsAll } from "../phase";
import { searchInDialogue } from "../search";
import type {
  DialogueRole,
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  SearchHit,
  TaskPyEvent,
} from "../types";

// ---------- loose external shapes ----------

interface CodexContentPart {
  type?: string;
  text?: string;
}

interface CodexCompactedItem {
  type?: string;
  role?: string;
  content?: CodexContentPart[];
}

interface CodexPayload {
  type?: string;
  role?: string;
  cwd?: string;
  id?: string;
  content?: CodexContentPart[];
  replacement_history?: CodexCompactedItem[];
  name?: unknown;
  arguments?: unknown;
}

interface CodexEvent {
  timestamp?: string;
  type?: string;
  payload?: CodexPayload;
}

function parseDialogueRole(v: unknown): DialogueRole | undefined {
  return v === "user" || v === "assistant" ? v : undefined;
}

/**
 * 从 Codex function_call 的 arguments 还原 shell 命令串。各版本编码不一：原始字符串、
 * 含 cmd/command(string) 或 argv(string[]) 的 JSON 串、或同形状的原始对象。无法还原则 undefined。
 */
export function commandFromCodexArguments(argsRaw: unknown): string | undefined {
  const fromObject = (obj: Record<string, unknown>): string | undefined => {
    const cmd = obj.cmd;
    if (typeof cmd === "string") return cmd;
    const command = obj.command;
    if (typeof command === "string") return command;
    const argv = obj.argv;
    if (Array.isArray(argv)) {
      const parts = argv.filter((a): a is string => typeof a === "string");
      if (parts.length) return parts.join(" ");
    }
    return undefined;
  };

  if (typeof argsRaw === "string") {
    try {
      const parsed: unknown = JSON.parse(argsRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return fromObject(parsed as Record<string, unknown>);
      }
    } catch {
      // 非 JSON——某些 Codex 版本内联原始 shell 串。
      return argsRaw;
    }
    return undefined;
  }

  if (argsRaw && typeof argsRaw === "object" && !Array.isArray(argsRaw)) {
    return fromObject(argsRaw as Record<string, unknown>);
  }

  return undefined;
}

// ---------- list ----------

export function codexListSessions(f: MemFilter): MemSessionInfo[] {
  if (!fs.existsSync(CODEX_SESSIONS)) return [];
  const out: MemSessionInfo[] = [];
  for (const file of walkDir(CODEX_SESSIONS)) {
    if (!file.endsWith(".jsonl")) continue;
    const base = path.basename(file, ".jsonl");
    const m = base.match(
      /^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(.+)$/,
    );
    const tsFromName = m?.[1]
      ? new Date(
          m[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3") + "Z",
        ).toISOString()
      : undefined;

    const first = readJsonlFirst<CodexEvent>(file);
    const meta = first?.payload;
    const id = meta?.id ?? m?.[2] ?? base;
    const cwd = meta?.cwd;
    const created = first?.timestamp ?? tsFromName ?? "";

    if (f.cwd && !sameProject(cwd, f.cwd)) continue;
    const updated = fs.statSync(file).mtime.toISOString();
    if (!inRangeOverlap(created, updated, f)) continue;

    out.push({
      platform: "codex",
      id,
      cwd,
      created,
      updated,
      filePath: file,
    });
  }
  return out;
}

// ---------- extract ----------

function buildTurnFromMessage(
  role: DialogueRole,
  parts: CodexContentPart[] | undefined,
): DialogueTurn | null {
  const collected: string[] = [];
  let totalRaw = 0;
  for (const c of parts ?? []) {
    const txt = c.text;
    if (typeof txt !== "string") continue;
    if (c.type !== "input_text" && c.type !== "output_text") continue;
    totalRaw += txt.length;
    const cleaned = stripInjectionTags(txt);
    if (cleaned) collected.push(cleaned);
  }
  if (!collected.length) return null;
  const merged = collected.join("\n\n");
  if (isBootstrapTurn(merged, totalRaw)) return null;
  return { role, text: merged };
}

export function codexExtractDialogue(s: MemSessionInfo): DialogueTurn[] {
  // payload.type=="message"、role ∈ {user, assistant}。
  // 压缩：顶层 compacted 事件带 payload.replacement_history——新权威历史，替换之前全部。
  let turns: DialogueTurn[] = [];

  readJsonl<CodexEvent>(s.filePath, (obj) => {
    if (obj.type === "compacted") {
      const rh = obj.payload?.replacement_history;
      turns = [];
      if (!Array.isArray(rh)) return;
      for (const item of rh) {
        if (item.type !== "message") continue;
        const role = parseDialogueRole(item.role);
        if (!role) continue;
        const turn = buildTurnFromMessage(role, item.content);
        if (turn)
          turns.push({ role: turn.role, text: `[compact]\n${turn.text}` });
      }
      return;
    }

    const p = obj.payload;
    if (p?.type !== "message") return;
    const role = parseDialogueRole(p.role);
    if (!role) return;
    const turn = buildTurnFromMessage(role, p.content);
    if (turn) turns.push(turn);
  });
  return turns;
}

export function codexSearch(s: MemSessionInfo, kw: string): SearchHit {
  return searchInDialogue(codexExtractDialogue(s), kw);
}

/**
 * collectClaudeTurnsAndEvents 的 Codex 孪生：单遍扫描 rollout 文件，产出清洗对话轮次 +
 * function_call（name==="exec_command" 或 "shell"）里的 `task.py start|phase EXECUTE` 调用。压缩重置 turns 与 events。
 */
export function collectCodexTurnsAndEvents(s: MemSessionInfo): {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
} {
  let turns: DialogueTurn[] = [];
  let events: TaskPyEvent[] = [];

  readJsonl<CodexEvent>(s.filePath, (obj) => {
    if (obj.type === "compacted") {
      const rh = obj.payload?.replacement_history;
      turns = [];
      events = [];
      if (!Array.isArray(rh)) return;
      for (const item of rh) {
        if (item.type !== "message") continue;
        const role = parseDialogueRole(item.role);
        if (!role) continue;
        const turn = buildTurnFromMessage(role, item.content);
        if (turn)
          turns.push({ role: turn.role, text: `[compact]\n${turn.text}` });
      }
      return;
    }

    const p = obj.payload;
    if (!p) return;

    if (p.type === "function_call") {
      const fnName = p.name;
      if (fnName !== "exec_command" && fnName !== "shell") return;
      const cmd = commandFromCodexArguments(p.arguments);
      if (!cmd) return;
      const parsedAll = parseTaskPyCommandsAll(cmd);
      for (const parsed of parsedAll) {
        events.push({
          action: parsed.action,
          timestamp: obj.timestamp ?? "",
          turnIndex: turns.length,
          ...(parsed.action === "start" ? { title: parsed.titleArg } : {}),
        });
      }
      return;
    }

    if (p.type !== "message") return;
    const role = parseDialogueRole(p.role);
    if (!role) return;
    const turn = buildTurnFromMessage(role, p.content);
    if (turn) turns.push(turn);
  });

  return { turns, events };
}
