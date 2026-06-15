/**
 * Claude Code 持久化会话读取器。
 * 布局：~/.claude/projects/<净化cwd>/<sessionId>.jsonl，可选 <projectDir>/sessions-index.json 提供 cwd/created/title。
 */

import * as fs from "fs";
import * as path from "path";

import { stripInjectionTags, isBootstrapTurn } from "../dialogue";
import { inRangeOverlap, sameProject } from "../filter";
import {
  findInJsonl,
  readJsonFile,
  readJsonl,
  readJsonlFirst,
} from "../internal/jsonl";
import { CLAUDE_PROJECTS, claudeProjectDirFromCwd } from "../internal/paths";
import { parseTaskPyCommandsAll } from "../phase";
import { searchInDialogue } from "../search";
import type {
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  SearchHit,
  TaskPyEvent,
} from "../types";

// ---------- loose external shapes ----------

interface ClaudeBlock {
  type?: string;
  text?: string;
  name?: unknown;
  input?: unknown;
}

interface ClaudeMessage {
  role?: string;
  content?: string | ClaudeBlock[];
}

interface ClaudeEvent {
  type?: string;
  cwd?: string;
  timestamp?: string;
  message?: ClaudeMessage;
  isCompactSummary?: boolean;
}

interface ClaudeIndexEntry {
  id?: string;
  cwd?: string;
  created?: string;
  title?: string;
}

interface ClaudeIndex {
  entries?: ClaudeIndexEntry[];
}

// ---------- list ----------

export function claudeListSessions(f: MemFilter): MemSessionInfo[] {
  if (!fs.existsSync(CLAUDE_PROJECTS)) return [];
  const out: MemSessionInfo[] = [];
  const projectDirs: string[] = f.cwd
    ? [claudeProjectDirFromCwd(f.cwd)].filter((d) => fs.existsSync(d))
    : fs.readdirSync(CLAUDE_PROJECTS).map((d) => path.join(CLAUDE_PROJECTS, d));

  for (const dir of projectDirs) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const indexFile = path.join(dir, "sessions-index.json");
    const index = readJsonFile<ClaudeIndex>(indexFile);
    const indexById = new Map<string, ClaudeIndexEntry>();
    for (const e of Array.isArray(index?.entries) ? index.entries : []) {
      if (typeof e.id === "string") indexById.set(e.id, e);
    }

    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".jsonl")) continue;
      const filePath = path.join(dir, e.name);
      const id = e.name.replace(/\.jsonl$/, "");
      const idx = indexById.get(id);
      let cwd: string | undefined = idx?.cwd;
      let created: string | undefined = idx?.created;
      const title: string | undefined = idx?.title;

      if (!cwd || !created) {
        const evt = findInJsonl<ClaudeEvent>(
          filePath,
          (o) => typeof o.cwd === "string",
          100,
        );
        cwd = cwd ?? evt?.cwd;
        created =
          created ??
          evt?.timestamp ??
          readJsonlFirst<ClaudeEvent>(filePath)?.timestamp;
      }

      const stat = fs.statSync(filePath);
      const updated = stat.mtime.toISOString();
      // 区间重叠：创建早于 --since 但窗口内仍活跃的跨天会话必须存活。
      if (!inRangeOverlap(created, updated, f)) continue;
      if (f.cwd && cwd && !sameProject(cwd, f.cwd)) continue;

      out.push({
        platform: "claude",
        id,
        title,
        cwd,
        created,
        updated,
        filePath,
      });
    }
  }
  return out;
}

// ---------- extract ----------

export function claudeExtractDialogue(s: MemSessionInfo): DialogueTurn[] {
  // - user: type=="user" + role=="user" + content 为字符串
  // - assistant: type=="assistant" + role=="assistant"，仅保留 text 块
  // - thinking / tool_use 块整块丢弃；注入标签剥掉
  // - 压缩：isCompactSummary 用户事件重置之前轮次，替换为单条合成 [compact summary]
  let turns: DialogueTurn[] = [];
  readJsonl<ClaudeEvent>(s.filePath, (obj) => {
    const t = obj.type;
    const msg = obj.message;
    if (!msg) return;
    const content = msg.content;
    if (t === "user" && obj.isCompactSummary === true) {
      let summary = "";
      if (typeof content === "string") {
        summary = stripInjectionTags(content);
      } else if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            const cleaned = stripInjectionTags(block.text);
            if (cleaned) parts.push(cleaned);
          }
        }
        summary = parts.join("\n\n");
      }
      turns = summary
        ? [{ role: "user", text: `[compact summary]\n${summary}` }]
        : [];
      return;
    }
    if (t === "user" && msg.role === "user") {
      if (typeof content === "string") {
        const text = stripInjectionTags(content);
        if (text && !isBootstrapTurn(text, content.length)) {
          turns.push({ role: "user", text });
        }
      }
    } else if (
      t === "assistant" &&
      msg.role === "assistant" &&
      Array.isArray(content)
    ) {
      const parts: string[] = [];
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          const cleaned = stripInjectionTags(block.text);
          if (cleaned) parts.push(cleaned);
        }
      }
      if (parts.length)
        turns.push({ role: "assistant", text: parts.join("\n\n") });
    }
  });
  return turns;
}

export function claudeSearch(s: MemSessionInfo, kw: string): SearchHit {
  return searchInDialogue(claudeExtractDialogue(s), kw);
}

/**
 * 单遍扫描 Claude JSONL，同时产出清洗后的对话轮次（语义同 claudeExtractDialogue）和
 * `task.py start|phase EXECUTE` 的 Bash tool_use 事件（含 turnIndex）。
 * 压缩同时重置 turns 与 events——压缩后历史塌缩，压缩前的事件下标不再指向真实轮次。
 */
export function collectClaudeTurnsAndEvents(s: MemSessionInfo): {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
} {
  let turns: DialogueTurn[] = [];
  let events: TaskPyEvent[] = [];

  readJsonl<ClaudeEvent>(s.filePath, (obj) => {
    const t = obj.type;
    const msg = obj.message;
    if (!msg) return;
    const content = msg.content;

    if (t === "user" && obj.isCompactSummary === true) {
      let summary = "";
      if (typeof content === "string") {
        summary = stripInjectionTags(content);
      } else if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            const cleaned = stripInjectionTags(block.text);
            if (cleaned) parts.push(cleaned);
          }
        }
        summary = parts.join("\n\n");
      }
      turns = summary
        ? [{ role: "user", text: `[compact summary]\n${summary}` }]
        : [];
      events = [];
      return;
    }

    if (t === "user" && msg.role === "user") {
      if (typeof content === "string") {
        const text = stripInjectionTags(content);
        if (text && !isBootstrapTurn(text, content.length)) {
          turns.push({ role: "user", text });
        }
      }
      return;
    }

    if (
      t === "assistant" &&
      msg.role === "assistant" &&
      Array.isArray(content)
    ) {
      const parts: string[] = [];
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          const cleaned = stripInjectionTags(block.text);
          if (cleaned) parts.push(cleaned);
        } else if (block.type === "tool_use") {
          if (block.name !== "Bash") continue;
          const inp = block.input;
          if (!inp || typeof inp !== "object") continue;
          const command = (inp as { command?: unknown }).command;
          if (typeof command !== "string") continue;
          const parsedAll = parseTaskPyCommandsAll(command);
          for (const parsed of parsedAll) {
            events.push({
              action: parsed.action,
              timestamp: obj.timestamp ?? "",
              turnIndex: turns.length,
              ...(parsed.action === "start" ? { title: parsed.titleArg } : {}),
            });
          }
        }
      }
      if (parts.length)
        turns.push({ role: "assistant", text: parts.join("\n\n") });
    }
  });

  return { turns, events };
}
