/**
 * aemb uninstall —— 按 manifest 移除 aemb 写过的一切，再删 .auto-embedded/。
 *
 *  - owned 文件：直接删（.auto-embedded/ 下的随整目录一并删）。
 *  - merges 文件：按对应平台 configurator 的 scrub 只剥 aemb 片段；剥完为空则整删，否则写回保留用户内容。
 *  - 卸载前整目录备份到 .auto-embedded.bak.N。用户固件源码不动。
 */
import * as fs from "fs";
import * as path from "path";
import { RUNTIME_DIR } from "../constants/paths";
import type { MergeFile } from "../configurators/types";
import { getConfigurator } from "../configurators/index";
import { detectPython } from "../utils/python";
import { writeFile } from "../utils/file-writer";
import { toPosix } from "../utils/posix";
import { loadManifest, sha256 } from "../utils/manifest";
import {
  backupRuntime,
  cleanupManagedDirs,
  escapingManagedRoots,
  isInstalled,
  parentWithinTarget,
  readPlatforms,
  runtimeUnsafe,
  safeResolve,
} from "./engine";

export function cmdUninstall(target: string): number {
  if (!isInstalled(target)) {
    process.stderr.write(`✗ ${target} 未 init（无 .auto-embedded/）\n`);
    return 1;
  }
  // 入口安全（先于读取 .auto-embedded 的 manifest/platforms/备份它）：.auto-embedded 根若被替换为
  // 指向工程外的 symlink，则其 manifest 不可信、备份会拷工程外、按其 manifest 删可能删工程内任意文件 → 拒绝。
  if (runtimeUnsafe(target)) {
    process.stderr.write(
      `✗ 拒绝卸载：.auto-embedded 根/元数据文件/scripts 树存在越界符号链接，其清单/平台列表不可信，` +
        `可能导致误删/读穿工程外文件。请手动检查后处理。\n`,
    );
    return 1;
  }
  const py = detectPython();
  const platforms = readPlatforms(target);
  if (escapingManagedRoots(target, platforms).length) {
    process.stderr.write(`✗ 拒绝卸载：某平台受管目录经解析越出工程根（疑似指向工程外的符号链接）。\n`);
    return 1;
  }
  const bak = backupRuntime(target);
  console.log(`✓ 卸载前已备份 .auto-embedded/ → ${path.basename(bak)}`);

  const manifest = loadManifest(target);

  // 重建 merges-by-path（用于 scrub）
  const mergesByPath = new Map<string, MergeFile>();
  for (const id of platforms) {
    const cfg = getConfigurator(id);
    if (!cfg) continue;
    for (const m of cfg(py).merges) mergesByPath.set(toPosix(m.path), m);
  }

  const removed: string[] = [];

  // owned 文件（.auto-embedded/ 内的留给整目录删）
  for (const rel of Object.keys(manifest.owned)) {
    if (rel.startsWith(RUNTIME_DIR + "/")) continue;
    const abs = safeResolve(target, rel); // 词法防越界
    if (!abs || !parentWithinTarget(target, abs)) {
      // 词法越界，或父目录经 symlink 解析后越出工程根 → 不删（防删工程外文件）
      process.stderr.write(`    ⚠ 跳过 ${rel}：路径越界或父目录 symlink 越出工程根\n`);
      continue;
    }
    if (!fs.existsSync(abs)) continue;
    // 目标自身若是 symlink：删链接（不跟随），不读不比对。
    try {
      if (fs.lstatSync(abs).isSymbolicLink()) {
        fs.unlinkSync(abs);
        removed.push(`${rel}（移除 symlink）`);
        continue;
      }
    } catch {
      /* ignore */
    }
    // 只删 aemb 真正写过且未被改动的文件：当前内容 hash 必须等于安装清单记录。
    // 防被篡改/中毒的 manifest 借 uninstall 删除工程内任意无关文件（如 do-not-delete.txt）。
    let cur: string;
    try {
      cur = fs.readFileSync(abs, "utf-8");
    } catch {
      continue; // 读失败（目录等）→ 不删
    }
    if (sha256(cur) !== manifest.owned[rel]) {
      process.stderr.write(`    · 保留 ${rel}（内容与安装记录不符：被改过或非 aemb 所写，不删）\n`);
      continue;
    }
    try {
      fs.unlinkSync(abs);
      removed.push(rel);
    } catch {
      /* best-effort */
    }
  }

  // merges：scrub
  for (const rel of manifest.merges) {
    const abs = safeResolve(target, rel);
    if (!abs || !parentWithinTarget(target, abs)) {
      process.stderr.write(`    ⚠ 跳过 ${rel}：路径越界或父目录 symlink 越出工程根\n`);
      continue;
    }
    if (!fs.existsSync(abs)) continue;
    // 被植入的 symlink：移除链接本身（不跟随读/写工程外文件）
    try {
      if (fs.lstatSync(abs).isSymbolicLink()) {
        fs.unlinkSync(abs);
        removed.push(`${rel}（移除 symlink）`);
        continue;
      }
    } catch {
      /* ignore */
    }
    const m = mergesByPath.get(rel);
    let existing = "";
    try {
      existing = fs.readFileSync(abs, "utf-8");
    } catch {
      continue;
    }
    if (!m) {
      process.stderr.write(`    ⚠ ${rel} 无对应 scrub（平台 configurator 缺失），未改动，请手动清理 aemb 片段\n`);
      continue;
    }
    const { content, fullyEmpty } = m.scrub(existing);
    if (fullyEmpty) {
      try {
        fs.unlinkSync(abs);
        removed.push(`${rel}（scrub 后为空，整删）`);
      } catch {
        /* ignore */
      }
    } else {
      writeFile(abs, content);
      removed.push(`${rel}（剥除 aemb 片段，保留其余）`);
    }
  }

  // 删 .auto-embedded/
  fs.rmSync(path.join(target, RUNTIME_DIR), { recursive: true, force: true });
  removed.push(RUNTIME_DIR + "/");

  // 清理空的 managed 目录
  cleanupManagedDirs(target, platforms);

  console.log(`✓ 已卸载，处理 ${removed.length} 项：`);
  for (const r of removed) console.log("    - " + r);
  console.log(`  · 用户固件源码未触碰；如需恢复见备份 ${path.basename(bak)}`);
  return 0;
}
