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
    if (e.isDirectory() && e.name === "__pycache__") continue; // 跳过 Python 字节码目录：勿当模板装入（UTF-8 读写会损坏 .pyc）
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(full));
    else if (e.isFile() && !e.name.endsWith(".pyc")) out.push(full);
  }
  return out;
}
