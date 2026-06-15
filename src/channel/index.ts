/**
 * channel 子命令调度器（手写解析，替代 commander，零依赖）。被 cli/index.ts 的 `channel` 早分支调用，返回 Promise<number>。
 * __supervisor 是隐藏入口（spawn 的 detached fork 调它）。
 */
import { channelCreate } from "./create";
import { channelSend } from "./send";
import { channelMessages } from "./messages";
import { channelWait } from "./wait";
import { channelKill } from "./kill";
import { channelInterrupt } from "./interrupt";
import { channelList } from "./list";
import { channelRm } from "./rm";
import { channelSpawn } from "./spawn";
import { runSupervisor } from "./supervisor";
import { parseDuration } from "../utils/duration";

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | string[] | boolean>;
}

/** 通用解析：--bool（无值）/ --k v / 可重复 --multi。其余为位置参数。 */
function parseArgs(rest: string[], opts: { bool?: string[]; multi?: string[] } = {}): ParsedArgs {
  const bool = new Set(opts.bool ?? []);
  const multi = new Set(opts.multi ?? []);
  const positionals: string[] = [];
  const flags: Record<string, string | string[] | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (bool.has(name)) {
        flags[name] = true;
        continue;
      }
      const v = rest[i + 1];
      if (v === undefined || v.startsWith("-")) {
        // 后随 token 是另一个 flag（或无值）→ 视为"给了 flag 但缺值"，置 true（下游 str/num 取不到值会触发必填校验），
        // 不把下一个 flag 误当作本 flag 的值（channel 的取值 flag 都不接受以 - 开头的值）。
        flags[name] = true;
        continue;
      }
      i++;
      if (multi.has(name)) {
        const acc = (flags[name] as string[] | undefined) ?? [];
        acc.push(v);
        flags[name] = acc;
      } else {
        flags[name] = v;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => {
  if (typeof v !== "string") return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
};
const bool = (v: unknown): boolean => v === true;
const list = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? (v as string[]) : typeof v === "string" ? [v] : undefined;

/** 数字 flag：缺失→{}；给了但非有限数（含 value-less 置 true）→{bad}；否则{n}。区分"未给"与"给了但非法"。 */
function intFlag(raw: unknown): { n?: number; bad?: boolean } {
  if (raw === undefined) return {};
  const n = num(raw);
  return n === undefined ? { bad: true } : { n };
}
/** 时长 flag：缺失→{}；给了但解析失败→{bad}；否则{ms}。防 --timeout 非法时静默"无超时"导致 wait 永挂。 */
function durFlag(raw: unknown): { ms?: number; bad?: boolean } {
  if (raw === undefined) return {};
  const ms = typeof raw === "string" ? parseDuration(raw) : undefined;
  return ms === undefined ? { bad: true } : { ms };
}

const USAGE = `aemb channel —— 多 agent 协作（supervisor+worker，文件事件存储）
  aemb channel create <name> [--type chat|forum] [--scope project|global] [--task T] [--labels a,b] [--description D] [--by who] [--ephemeral] [--force]
  aemb channel send <name> [text] [--as who] [--to a,b] [--text-file F] [--stdin] [--scope ..]
  aemb channel messages <name> [--last N] [--since SEQ] [--kind K] [--from a,b] [--to t] [--no-progress] [--raw] [--follow] [--scope ..]
  aemb channel wait <name> [--as who] [--from a,b] [--kind K] [--to t] [--timeout 30s] [--all] [--include-progress] [--scope ..]
  aemb channel spawn <name> [--as who | --agent NAME] [--provider claude] [--model M] [--file F]... [--jsonl J]... [--cwd D] [--timeout 10m] [--scope ..]
  aemb channel interrupt <name> --to <worker> [text] [--as who] [--text-file F] [--stdin] [--scope ..]
  aemb channel kill <name> --as <worker> [--force] [--scope ..]
  aemb channel list [--all] [--scope project|global]
  aemb channel rm <name> [--scope ..]`;

function needName(positionals: string[], sub: string): string | null {
  const name = positionals[0];
  if (!name) {
    process.stderr.write(`✗ channel ${sub} 需要 <name>\n`);
    return null;
  }
  return name;
}

export async function dispatchChannel(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (!sub || sub === "--help" || sub === "-h") {
    console.log(USAGE);
    return sub ? 0 : 1;
  }

  switch (sub) {
    case "__supervisor": {
      const [channel, worker, cfg] = rest;
      if (!channel || !worker || !cfg) {
        process.stderr.write("✗ __supervisor 需要 <channel> <worker> <config>\n");
        return 2;
      }
      await runSupervisor(channel, worker, cfg);
      return 0;
    }
    case "create": {
      const { positionals, flags } = parseArgs(rest, { bool: ["ephemeral", "force"] });
      const name = needName(positionals, sub);
      if (!name) return 2;
      return channelCreate(name, {
        type: str(flags.type),
        scope: str(flags.scope),
        task: str(flags.task),
        labels: str(flags.labels),
        description: str(flags.description),
        by: str(flags.by),
        cwd: str(flags.cwd),
        ephemeral: bool(flags.ephemeral),
        force: bool(flags.force),
      });
    }
    case "send": {
      const { positionals, flags } = parseArgs(rest, { bool: ["stdin"] });
      const name = needName(positionals, sub);
      if (!name) return 2;
      return channelSend(name, {
        text: positionals[1],
        as: str(flags.as),
        to: str(flags.to),
        textFile: str(flags["text-file"]),
        stdin: bool(flags.stdin),
        scope: str(flags.scope),
      });
    }
    case "messages": {
      const { positionals, flags } = parseArgs(rest, { bool: ["raw", "follow", "no-progress"] });
      const name = needName(positionals, sub);
      if (!name) return 2;
      const lastF = intFlag(flags.last);
      if (lastF.bad) {
        process.stderr.write("✗ --last 需要一个数字\n");
        return 2;
      }
      const sinceF = intFlag(flags.since);
      if (sinceF.bad) {
        process.stderr.write("✗ --since 需要一个 SEQ 数字\n");
        return 2;
      }
      return channelMessages(name, {
        last: lastF.n,
        since: sinceF.n,
        kind: str(flags.kind),
        from: str(flags.from),
        to: str(flags.to),
        noProgress: bool(flags["no-progress"]),
        raw: bool(flags.raw),
        follow: bool(flags.follow),
        scope: str(flags.scope),
      });
    }
    case "wait": {
      const { positionals, flags } = parseArgs(rest, { bool: ["all", "include-progress"] });
      const name = needName(positionals, sub);
      if (!name) return 2;
      const tw = durFlag(flags.timeout);
      if (tw.bad) {
        process.stderr.write("✗ 无法解析 --timeout（用 Ns/Nm/Nh/Nms，如 30s/10m）\n");
        return 2;
      }
      return channelWait(name, {
        as: str(flags.as),
        from: str(flags.from),
        kind: str(flags.kind),
        to: str(flags.to),
        timeoutMs: tw.ms,
        all: bool(flags.all),
        includeProgress: bool(flags["include-progress"]),
        scope: str(flags.scope),
      });
    }
    case "spawn": {
      const { positionals, flags } = parseArgs(rest, { multi: ["file", "jsonl"] });
      const name = needName(positionals, sub);
      if (!name) return 2;
      const ts = durFlag(flags.timeout);
      if (ts.bad) {
        process.stderr.write("✗ 无法解析 --timeout（用 Ns/Nm/Nh/Nms，如 10m/30s）\n");
        return 2;
      }
      return channelSpawn(name, {
        as: str(flags.as),
        agent: str(flags.agent),
        provider: str(flags.provider),
        model: str(flags.model),
        files: list(flags.file),
        jsonls: list(flags.jsonl),
        cwd: str(flags.cwd),
        resume: str(flags.resume),
        timeoutMs: ts.ms,
        by: str(flags.by),
        scope: str(flags.scope),
      });
    }
    case "interrupt": {
      const { positionals, flags } = parseArgs(rest, { bool: ["stdin"] });
      const name = needName(positionals, sub);
      if (!name) return 2;
      return channelInterrupt(name, {
        to: str(flags.to) ?? "",
        text: positionals[1],
        as: str(flags.as),
        textFile: str(flags["text-file"]),
        stdin: bool(flags.stdin),
        scope: str(flags.scope),
      });
    }
    case "kill": {
      const { positionals, flags } = parseArgs(rest, { bool: ["force"] });
      const name = needName(positionals, sub);
      if (!name) return 2;
      return channelKill(name, { as: str(flags.as) ?? "", force: bool(flags.force), scope: str(flags.scope) });
    }
    case "list": {
      const { flags } = parseArgs(rest, { bool: ["all"] });
      return channelList({ all: bool(flags.all), scope: str(flags.scope) });
    }
    case "rm": {
      const { positionals, flags } = parseArgs(rest);
      const name = needName(positionals, sub);
      if (!name) return 2;
      return channelRm(name, { scope: str(flags.scope) });
    }
    default:
      process.stderr.write(`✗ 未知 channel 子命令: ${sub}\n${USAGE}\n`);
      return 2;
  }
}
