/** aemb channel list —— 列出各工程桶里的频道（折叠元数据 + worker 存活）。 */
import * as fs from "fs";
import * as path from "path";
import { readChannelEvents, reduceChannelMetadata } from "./store/events";
import { pidAlive } from "./store/lock";
import { channelDir, currentProjectKey, eventsPath, listProjects, projectDir } from "./store/paths";
import { GLOBAL_PROJECT_KEY, parseChannelScope } from "./store/schema";

export interface ListOptions {
  all?: boolean; // 含 ephemeral
  scope?: string;
}

export async function channelList(opts: ListOptions): Promise<number> {
  const scope = parseChannelScope(opts.scope);
  const projects =
    scope === "global" ? [GLOBAL_PROJECT_KEY] : scope === "project" ? [currentProjectKey()] : listProjects();
  let count = 0;
  for (const project of projects) {
    const dir = projectDir(project);
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const nm of entries) {
      if (nm.startsWith(".")) continue; // .bucket
      const chDir = channelDir(nm, project);
      try {
        if (!fs.statSync(chDir).isDirectory()) continue;
      } catch {
        continue;
      }
      if (!fs.existsSync(eventsPath(nm, project))) continue;
      const meta = reduceChannelMetadata(await readChannelEvents(nm, project));
      if (meta.ephemeral && !opts.all) continue;
      const live = hasLiveWorker(chDir);
      console.log(
        `  ${nm.padEnd(20)} [${meta.type}]${live ? " ●live" : "      "}  ${project}` +
          (meta.task ? `  task=${meta.task}` : ""),
      );
      count++;
    }
  }
  if (!count) console.log("(无频道)");
  return 0;
}

function hasLiveWorker(dir: string): boolean {
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".pid")) continue;
      const pid = Number(fs.readFileSync(path.join(dir, f), "utf-8").trim());
      if (pid && pidAlive(pid)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
