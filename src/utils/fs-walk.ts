import * as fs from "fs";
import * as path from "path";

/** 递归列出目录下所有文件（绝对路径）。目录不存在返回 []。 */
export function walkFiles(dir: string): string[] {
  const out: string[] = [];
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}
