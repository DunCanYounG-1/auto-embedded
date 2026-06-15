/**
 * channel 磁盘布局：~/.aemb/channels/<projectBucket>/<channel>/（对标 Trellis，去掉 legacy 迁移）。
 * bucket = cwd 经 Claude 式 `/ _ \` → `-` 净化，和 ~/.claude/projects 心智一致。
 * 根目录可用 AEMB_CHANNEL_ROOT 覆盖；当前 bucket 可用 AEMB_CHANNEL_PROJECT 覆盖（detached supervisor 据此落同一桶）。
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GLOBAL_PROJECT_KEY, type ChannelRef, type ChannelScope } from "./schema";

export function channelRoot(): string {
  const env = process.env.AEMB_CHANNEL_ROOT;
  if (env && env.length > 0) return path.resolve(env);
  return path.join(os.homedir(), ".aemb", "channels");
}

export function projectKey(cwd: string): string {
  const abs = path.resolve(cwd);
  const slashes = abs.replace(/[\\/_]/g, "-");
  return slashes.replace(/[^A-Za-z0-9.-]/g, "-");
}

export function currentProjectKey(): string {
  const env = process.env.AEMB_CHANNEL_PROJECT;
  if (env && env.length > 0) return env;
  return projectKey(process.cwd());
}

export function projectDir(project: string = currentProjectKey()): string {
  return path.join(channelRoot(), project);
}

const BUCKET_MARKER = ".bucket";

export function channelDir(name: string, project: string = currentProjectKey()): string {
  return path.join(projectDir(project), name);
}
export function eventsPath(name: string, project: string = currentProjectKey()): string {
  return path.join(channelDir(name, project), "events.jsonl");
}
export function lockPath(name: string, project: string = currentProjectKey()): string {
  return path.join(channelDir(name, project), `${name}.lock`);
}
export function workerFile(name: string, worker: string, suffix: string, project: string = currentProjectKey()): string {
  return path.join(channelDir(name, project), `${worker}.${suffix}`);
}
export function workerLockPath(name: string, worker: string, project: string = currentProjectKey()): string {
  return path.join(channelDir(name, project), `${worker}.spawnlock`);
}

export function ensureBucketMarker(project: string): void {
  const dir = projectDir(project);
  fs.mkdirSync(dir, { recursive: true });
  const marker = path.join(dir, BUCKET_MARKER);
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, "");
}

export function listProjects(): string[] {
  const root = channelRoot();
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root)) {
    const dir = path.join(root, entry);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (fs.existsSync(path.join(dir, BUCKET_MARKER)) || entry === GLOBAL_PROJECT_KEY) out.push(entry);
  }
  return out;
}

export interface ResolveChannelOptions {
  scope?: ChannelScope;
  cwd?: string;
}

export function resolveChannelProjectForCreate(name: string, opts: ResolveChannelOptions = {}): ChannelRef {
  const scope = opts.scope ?? "project";
  const project = scope === "global" ? GLOBAL_PROJECT_KEY : opts.cwd ? projectKey(opts.cwd) : currentProjectKey();
  return { name, scope, project, dir: channelDir(name, project) };
}

/** 解析一个已存在频道的归属桶：显式 scope > 当前 cwd 桶 > global > 唯一 project 桶。设置 AEMB_CHANNEL_PROJECT。 */
export function resolveExistingChannelRef(name: string, opts: ResolveChannelOptions = {}): ChannelRef {
  if (opts.scope) {
    const project = opts.scope === "global" ? GLOBAL_PROJECT_KEY : opts.cwd ? projectKey(opts.cwd) : currentProjectKey();
    if (!fs.existsSync(eventsPath(name, project))) throw new Error(`频道 '${name}' 不在 ${opts.scope} 作用域 (${project})`);
    process.env.AEMB_CHANNEL_PROJECT = project;
    return { name, scope: opts.scope, project, dir: channelDir(name, project) };
  }
  const current = currentProjectKey();
  const projectMatches = listProjects()
    .filter((p) => p !== GLOBAL_PROJECT_KEY)
    .filter((p) => fs.existsSync(eventsPath(name, p)));
  const globalExists = fs.existsSync(eventsPath(name, GLOBAL_PROJECT_KEY));
  if (globalExists && projectMatches.length > 0) {
    throw new Error(`频道 '${name}' 同时存在于 global 与 project 作用域，请加 --scope global|project`);
  }
  if (globalExists) {
    process.env.AEMB_CHANNEL_PROJECT = GLOBAL_PROJECT_KEY;
    return { name, scope: "global", project: GLOBAL_PROJECT_KEY, dir: channelDir(name, GLOBAL_PROJECT_KEY) };
  }
  if (fs.existsSync(eventsPath(name, current))) {
    process.env.AEMB_CHANNEL_PROJECT = current;
    return { name, scope: "project", project: current, dir: channelDir(name, current) };
  }
  if (projectMatches.length === 1) {
    process.env.AEMB_CHANNEL_PROJECT = projectMatches[0];
    return { name, scope: "project", project: projectMatches[0], dir: channelDir(name, projectMatches[0]) };
  }
  if (projectMatches.length > 1) {
    throw new Error(`频道 '${name}' 存在于多个工程桶: ${projectMatches.join(", ")}，请在所属工程 cwd 运行或加 --scope`);
  }
  throw new Error(`频道 '${name}' 未找到（当前工程桶 ${current} 或其它作用域均无）`);
}
