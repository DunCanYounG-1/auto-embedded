/**
 * 持久化会话根目录（Claude / Codex）。
 *
 * HOME 在模块加载时捕获一次。支持 AEMB_HOME 覆盖（测试用：指向假的 home 而无需 mock os）。
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const HOME = process.env.AEMB_HOME || os.homedir();
export const CLAUDE_PROJECTS = path.join(HOME, ".claude", "projects");
export const CODEX_SESSIONS = path.join(HOME, ".codex", "sessions");

/** Claude 把 cwd 净化成磁盘上的工程目录名：/ _ 以及 Windows 的盘符冒号 : 和反斜杠 \ 都替换成 -。
 *  （Windows：D:\aiskills\auto-embedded → D--aiskills-auto-embedded，与 Claude 实际落盘一致；
 *   只留 / 会让默认 cwd 作用域在 Windows 上找不到任何 Claude 会话。保留 / 以兼容 POSIX 主机。） */
export function claudeProjectDirFromCwd(cwd: string): string {
  return path.join(CLAUDE_PROJECTS, cwd.replace(/[/\\:_]/g, "-"));
}

/** 惰性栈式递归遍历——产出 root 下每个文件路径。缺失的根与不可读目录静默跳过。 */
export function* walkDir(root: string): Generator<string> {
  if (!fs.existsSync(root)) return;
  const stack: string[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) yield p;
    }
  }
}
