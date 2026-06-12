import * as fs from "fs";
import * as path from "path";

/** 确保目录存在（递归）。 */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** 写文件（自动建父目录），UTF-8。防 symlink 跟随：目标若是符号链接先删，写真实文件而非顺着链接覆盖外部文件。 */
export function writeFile(dst: string, content: string): void {
  ensureDir(path.dirname(dst));
  try {
    if (fs.lstatSync(dst).isSymbolicLink()) fs.unlinkSync(dst);
  } catch {
    /* 不存在 */
  }
  fs.writeFileSync(dst, content, "utf-8");
}

/** 拷文件（自动建父目录）。 */
export function copyFile(src: string, dst: string): void {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

/** 读文件，缺失/不可读返回 null。 */
export function readFileOrNull(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}
