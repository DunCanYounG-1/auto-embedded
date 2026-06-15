/**
 * aemb mem —— 跨会话记忆：本地索引并检索你的 Claude / Codex 历史会话（对标 Trellis 的 tl mem）。
 *
 * 纯本地读取 ~/.claude/projects 与 ~/.codex/sessions，每次现读、不建索引、不上传。
 * 引擎在 src/mem/（零依赖、verbatim 自 Trellis core/mem，仅留 Claude+Codex）；本文件只管 CLI：
 * 参数解析、终端渲染、退出码。aemb 约定：命令返回数字退出码，不在内部 process.exit。
 *
 * 子命令：
 *   list                  列会话（无子命令时的默认）
 *   search <关键词>       按内容搜会话
 *   context <会话id>      钻取：前 N 命中轮 + 周边上下文（配合 search，用 --grep 锚定）
 *   extract <会话id>      导出清洗后对话（--grep 过滤轮次、--phase 按阶段切片）
 *   projects              列有活跃记录的工程 cwd（AI 路由入口，先调它再挑 --cwd）
 *
 * 跑 `aemb mem help` 看完整 flag。
 */

import * as os from "os";
import * as path from "path";

import {
  extractMemDialogue,
  listMemProjects,
  listMemSessions,
  MemSessionNotFoundError,
  readMemContext,
  searchMemSessions,
} from "../mem/index";
import type {
  MemFilter,
  MemPhase,
  MemSessionInfo,
  MemSourceFilter,
  MemSourceKind,
} from "../mem/index";

// ---------- argv ----------

interface Argv {
  cmd: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgv(argv: readonly string[]): Argv {
  const cmd = argv[0] ?? "list";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd, positional, flags };
}

/** 参数错误：抛出，由 cmdMem 统一捕获 → stderr + 退出码 2（不在深处 process.exit）。 */
class MemArgError extends Error {}
function die(msg: string): never {
  throw new MemArgError(msg);
}

const VALID_PLATFORMS: readonly string[] = ["claude", "codex", "all"];

/** 把 CLI flags 翻成核心 MemFilter；校验失败抛 MemArgError。 */
function buildFilter(flags: Argv["flags"]): MemFilter {
  const platformRaw =
    typeof flags.platform === "string" ? flags.platform : "all";
  if (!VALID_PLATFORMS.includes(platformRaw))
    die(`未知 platform: ${platformRaw}（可选 claude|codex|all）`);
  const platform = platformRaw as MemSourceFilter;

  const sinceRaw = flags.since;
  const since = typeof sinceRaw === "string" ? new Date(sinceRaw) : undefined;
  if (since && Number.isNaN(+since)) die(`非法 --since: ${String(sinceRaw)}`);

  const untilRaw = flags.until;
  const until =
    typeof untilRaw === "string"
      ? new Date(`${untilRaw}T23:59:59.999Z`)
      : undefined;
  if (until && Number.isNaN(+until)) die(`非法 --until: ${String(untilRaw)}`);

  const cwd = flags.global
    ? undefined
    : path.resolve(typeof flags.cwd === "string" ? flags.cwd : process.cwd());

  const limit = parseOptionalNumberFlag(flags.limit, "--limit", 50);

  return { platform, since, until, cwd, limit };
}

function parseOptionalNumberFlag(
  raw: string | boolean | undefined,
  name: string,
  fallback: number,
): number {
  if (raw === undefined || raw === false) return fallback;
  if (typeof raw !== "string") die(`${name} 需要一个数字`);
  const value = Number(raw);
  if (!Number.isFinite(value)) die(`非法 ${name}: ${raw}`);
  return value;
}

// ---------- formatting ----------

const HOME = process.env.AEMB_HOME || os.homedir();

function shortDate(iso?: string): string {
  if (!iso) return "         ";
  return iso.slice(0, 16).replace("T", " ");
}

function shortPath(p?: string): string {
  if (!p) return "(no cwd)";
  return p.replace(HOME, "~");
}

function printSessions(rows: readonly MemSessionInfo[]): void {
  if (rows.length === 0) {
    console.log("(无会话)");
    return;
  }
  for (const s of rows) {
    const id = s.id.length > 12 ? s.id.slice(0, 12) : s.id.padEnd(12);
    console.log(
      `[${s.platform.padEnd(6)}] ${shortDate(s.updated ?? s.created)}  ${id}  ${shortPath(s.cwd)}` +
        (s.title ? `  — ${s.title}` : ""),
    );
  }
}

// ---------- commands ----------

function cmdList(argv: Argv): void {
  const f = buildFilter(argv.flags);
  const rows = listMemSessions({ filter: f });
  if (argv.flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log(
    `范围: ${f.cwd ? `project=${shortPath(f.cwd)}` : "global"}  platform=${f.platform}` +
      (f.since ? `  since=${f.since.toISOString().slice(0, 10)}` : "") +
      (f.until ? `  until=${f.until.toISOString().slice(0, 10)}` : ""),
  );
  printSessions(rows);
  console.log(`\n${rows.length} 个会话`);
}

function cmdSearch(argv: Argv): void {
  const kw = argv.positional[0];
  if (!kw) die("用法: search <关键词>");
  const f = buildFilter(argv.flags);
  const result = searchMemSessions({ keyword: kw, filter: f });
  const top = result.matches;

  if (argv.flags.json) {
    console.log(
      JSON.stringify(
        top.map((m) => ({
          session: m.session,
          score: Number(m.score.toFixed(4)),
          hit_count: m.hit.count,
          user_count: m.hit.userCount,
          asst_count: m.hit.asstCount,
          total_turns: m.hit.totalTurns,
          excerpts: m.hit.excerpts,
        })),
        null,
        2,
      ),
    );
    return;
  }
  console.log(
    `范围: ${f.cwd ? `project=${shortPath(f.cwd)}` : "global"}  关键词="${kw}"  platform=${f.platform}`,
  );
  if (top.length === 0) {
    console.log("(无匹配)");
    return;
  }
  for (const m of top) {
    const s = m.session;
    const idShort = s.id.slice(0, 12);
    const score = m.score.toFixed(3);
    console.log(
      `\n[${s.platform.padEnd(6)}] ${shortDate(s.updated ?? s.created)}  ${idShort}  ${shortPath(s.cwd)}` +
        `  score=${score}  hits=${m.hit.count} (u=${m.hit.userCount},a=${m.hit.asstCount})  turns=${m.hit.totalTurns}` +
        (s.title ? `  — ${s.title}` : ""),
    );
    for (const ex of m.hit.excerpts) {
      console.log(`    [${ex.role}] ${ex.snippet}`);
    }
  }
  console.log(
    `\n${top.length} 个会话${result.totalMatches > top.length ? `（共 ${result.totalMatches}）` : ""}`,
  );
}

function cmdProjects(argv: Argv): void {
  // 跨所有平台的不同 cwd + 最近活跃 + 各平台会话数。AI 先调它知道哪些工程路径近期活跃，再挑 --cwd 去 search。
  const f = buildFilter({ ...argv.flags, global: true });
  const rows = listMemProjects({ filter: f });
  const limit = parseOptionalNumberFlag(argv.flags.limit, "--limit", 30);
  const top = rows.slice(0, limit);

  if (argv.flags.json) {
    console.log(JSON.stringify(top, null, 2));
    return;
  }
  console.log(
    `活跃工程` +
      (f.since ? `  since=${f.since.toISOString().slice(0, 10)}` : "") +
      (f.until ? `  until=${f.until.toISOString().slice(0, 10)}` : ""),
  );
  if (top.length === 0) {
    console.log("(无)");
    return;
  }
  for (const r of top) {
    const parts = (Object.entries(r.by_platform) as [MemSourceKind, number][])
      .filter(([, n]) => n > 0)
      .map(([p, n]) => `${p}:${n}`)
      .join(" ");
    console.log(
      `${shortDate(r.last_active)}  sessions=${r.sessions.toString().padStart(3)} (${parts})  ${shortPath(r.cwd)}`,
    );
  }
  console.log(
    `\n${top.length} 个工程${rows.length > top.length ? `（共 ${rows.length}）` : ""}`,
  );
}

function cmdContext(argv: Argv): void {
  const id = argv.positional[0];
  if (!id) die("用法: context <会话id> [--grep 关键词] [--turns N] [--around M]");
  const f = buildFilter(argv.flags);

  const grepRaw = argv.flags.grep;
  const grep = typeof grepRaw === "string" ? grepRaw : undefined;
  if (grep?.split(/\s+/).filter(Boolean).length === 0)
    die("--grep 需要非空值");
  const nTurns = parseOptionalNumberFlag(argv.flags.turns, "--turns", 3);
  const around = parseOptionalNumberFlag(argv.flags.around, "--around", 1);
  const maxChars = parseOptionalNumberFlag(
    argv.flags["max-chars"],
    "--max-chars",
    6000,
  );

  let result;
  try {
    result = readMemContext({ sessionId: id, filter: f, grep, turns: nTurns, around, maxChars });
  } catch (error) {
    if (error instanceof MemSessionNotFoundError) die(`未找到会话: ${id}`);
    throw error;
  }
  const s = result.session;

  if (argv.flags.json) {
    console.log(
      JSON.stringify(
        {
          session: s,
          query: result.query,
          total_turns: result.totalTurns,
          total_hit_turns: result.totalHitTurns,
          turns: result.turns.map((t) => ({
            idx: t.idx,
            role: t.role,
            text: t.text,
            is_hit: t.isHit,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const shown = grep
    ? Math.min(result.totalHitTurns, nTurns)
    : Math.min(nTurns, result.totalTurns);

  console.log(`# context: [${s.platform}] ${s.id}`);
  if (s.title) console.log(`# title: ${s.title}`);
  if (s.cwd) console.log(`# cwd:   ${shortPath(s.cwd)}`);
  if (grep)
    console.log(`# query: "${grep}"  hit_turns=${result.totalHitTurns}  showing top ${shown}`);
  else console.log(`# 无 grep——显示前 ${shown}/${result.totalTurns} 轮`);
  console.log(
    `# turns shown: ${result.turns.length}  budget_used: ${result.budgetUsed}/${result.maxChars} chars`,
  );
  console.log("");

  for (const t of result.turns) {
    const marker = t.isHit ? "  ← hit" : "";
    console.log(`## turn ${t.idx} (${t.role})${marker}\n`);
    console.log(t.text);
    console.log("\n---\n");
  }
}

function parsePhaseFlag(raw: unknown): MemPhase {
  if (raw === undefined || raw === false) return "all";
  if (raw === "brainstorm" || raw === "implement" || raw === "all") return raw;
  die(`未知 --phase: ${String(raw)}（可选 brainstorm|implement|all）`);
}

function cmdExtract(argv: Argv): void {
  const id = argv.positional[0];
  if (!id) die("用法: extract <会话id>");
  const f = buildFilter(argv.flags);

  const phase = parsePhaseFlag(argv.flags.phase);
  const grepRaw = argv.flags.grep;
  const grep = typeof grepRaw === "string" ? grepRaw.toLowerCase() : undefined;

  let result;
  try {
    result = extractMemDialogue({ sessionId: id, filter: f, phase, grep });
  } catch (error) {
    if (error instanceof MemSessionNotFoundError) die(`未找到会话: ${id}`);
    throw error;
  }

  for (const w of result.warnings) process.stderr.write(`warning: ${w.message}\n`);

  const s = result.session;
  if (argv.flags.json) {
    console.log(
      JSON.stringify(
        {
          session: s,
          phase: result.phase,
          windows: result.windows,
          total_turns: result.totalTurns,
          groups: result.groups,
          turns: result.turns,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`# session: [${s.platform}] ${s.id}`);
  if (s.title) console.log(`# title: ${s.title}`);
  if (s.cwd) console.log(`# cwd:   ${shortPath(s.cwd)}`);
  if (s.created) console.log(`# date:  ${shortDate(s.created)}`);
  console.log(
    `# phase: ${result.phase}  turns: ${result.turns.length}/${result.totalTurns}` +
      (grep ? ` (filtered by /${grep}/)` : "") +
      (result.windows.length > 0 ? `  windows: ${result.windows.length}` : ""),
  );
  console.log("");
  for (const g of result.groups) {
    if (g.label !== null) console.log(`--- task: ${g.label} ---\n`);
    for (const t of g.turns) {
      console.log(`## ${t.role === "user" ? "Human" : "Assistant"}\n`);
      console.log(t.text);
      console.log("\n---\n");
    }
  }
}

function cmdHelp(): void {
  console.log(`aemb mem —— 检索本机 Claude / Codex 历史会话（纯本地、不上传）

子命令:
  list                  列会话（无子命令时默认）
  search <关键词>       按内容搜会话（多 token AND）
  context <会话id>      钻取：前 N 命中轮 + 周边上下文（配合 search，用 --grep 锚定）
  extract <会话id>      导出清洗后对话（--grep 过滤轮次）
  projects              列活跃工程 cwd + 会话数——据此挑 --cwd 再 search

flags:
  --platform claude|codex|all   缺省 all
  --since YYYY-MM-DD            含下界（按会话生命期重叠判定，跨天大会话不漏）
  --until YYYY-MM-DD            含上界
  --global                     跨所有工程（缺省按当前 cwd 限定）
  --cwd <路径>                 覆盖工程 cwd
  --limit N                    截输出（缺省 50）
  --grep 关键词                extract/context：按关键词过滤/锚定轮次（多 token AND）
  --phase brainstorm|implement|all   extract：按 task.py start→phase EXECUTE 窗口切片
                               （缺省 all；brainstorm=RESEARCH..PLAN，implement=EXECUTE..REVIEW）
  --turns N                    context：返回命中轮数（缺省 3）
  --around N                   context：每个命中两侧上下文轮数（缺省 1）
  --max-chars N                context：总字符预算（缺省 6000，约 1500 token）
  --json                       输出 JSON
  --help, -h                   显示本帮助

例:
  aemb mem projects
  aemb mem list --global --platform claude --since 2026-06-01
  aemb mem search "USART 中断" --global
  aemb mem extract 5842592d --grep memory
  aemb mem context 5842592d --grep "hw-lock"`);
}

// ---------- entry ----------

export function cmdMem(args: readonly string[]): number {
  const argv = parseArgv(args);
  if (argv.flags.help || argv.flags.h || argv.cmd === "help" || argv.cmd === "--help") {
    cmdHelp();
    return 0;
  }
  try {
    switch (argv.cmd) {
      case "list":
        cmdList(argv);
        return 0;
      case "search":
        cmdSearch(argv);
        return 0;
      case "extract":
        cmdExtract(argv);
        return 0;
      case "context":
        cmdContext(argv);
        return 0;
      case "projects":
        cmdProjects(argv);
        return 0;
      default:
        die(`未知子命令: ${argv.cmd}（试 'aemb mem help'）`);
    }
  } catch (error) {
    if (error instanceof MemArgError || error instanceof MemSessionNotFoundError) {
      process.stderr.write(`✗ ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}
