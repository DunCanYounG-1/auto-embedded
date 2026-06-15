/**
 * 把 --file 注入到 worker system prompt（cwd 关押 + 字节上限）。MVP 只支持 --file；--jsonl 记到 manifests 但不展开（stage 2）。
 */
import * as fs from "fs";
import * as path from "path";

const MAX_FILE_CHARS = 32 * 1024;
const MAX_TOTAL_CHARS = 128 * 1024;

export interface AssembledContext {
  prompt: string;
  paths: string[];
  manifests: string[];
}

export function assembleContext(cwd: string, files: string[] = [], jsonls: string[] = []): AssembledContext {
  const base = path.resolve(cwd);
  const blocks: string[] = [];
  const paths: string[] = [];
  let total = 0;
  for (const f of files) {
    const abs = path.resolve(base, f);
    // cwd 关押：拒绝越出工程根的路径。
    if (abs !== base && !abs.startsWith(base + path.sep)) {
      process.stderr.write(`  ⚠ 跳过 ${f}：越出 cwd\n`);
      continue;
    }
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf-8");
    } catch {
      process.stderr.write(`  ⚠ 跳过 ${f}：不可读\n`);
      continue;
    }
    if (content.length > MAX_FILE_CHARS) content = content.slice(0, MAX_FILE_CHARS) + "\n…（单文件超限已截断）";
    if (total + content.length > MAX_TOTAL_CHARS) break;
    total += content.length;
    const rel = path.relative(base, abs).replace(/\\/g, "/");
    paths.push(rel);
    blocks.push(`## ${rel}\n\n${content}`);
  }
  return { prompt: blocks.join("\n\n"), paths, manifests: jsonls };
}
