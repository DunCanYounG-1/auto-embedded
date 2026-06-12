/**
 * 模板清单（.auto-embedded/.template-manifest.json）——记录 aemb 写过哪些文件，
 * 让 update 能区分"模板升级 vs 用户改过"，让 uninstall 知道哪些该删、哪些该 scrub。
 *
 *   owned : { 相对路径(POSIX) → sha256 }   —— aemb 独占文件（agents/skills/commands/hooks/plugins…），整文件覆盖
 *   merges: [ 相对路径(POSIX) ]            —— 与用户共享的配置文件（settings.json/hooks.json/config.toml/package.json），
 *                                            只增删 aemb 自己的片段，卸载时 scrub 而非整删
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { readFileOrNull, writeFile } from "./file-writer";
import { toPosix } from "./posix";

export interface Manifest {
  owned: Record<string, string>;
  merges: string[];
}

export const MANIFEST_REL = ".auto-embedded/.template-manifest.json";

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

export function loadManifest(target: string): Manifest {
  const abs = path.join(target, MANIFEST_REL);
  // 防 symlink 跟随：manifest 文件自身若是符号链接，不读外部内容（fail-closed 返回空清单，
  // 避免按被植入的工程外 manifest 删除/改动工程内文件）。
  try {
    if (fs.lstatSync(abs).isSymbolicLink()) return { owned: {}, merges: [] };
  } catch {
    /* 不存在 */
  }
  const raw = readFileOrNull(abs);
  if (!raw) return { owned: {}, merges: [] };
  try {
    const m = JSON.parse(raw);
    return {
      owned: m && typeof m.owned === "object" && !Array.isArray(m.owned) ? m.owned : {},
      merges: Array.isArray(m?.merges) ? m.merges : [],
    };
  } catch {
    return { owned: {}, merges: [] };
  }
}

export function saveManifest(target: string, m: Manifest): void {
  // merges 去重排序，owned key 排序，产出稳定 diff
  const owned: Record<string, string> = {};
  for (const k of Object.keys(m.owned).sort()) owned[toPosix(k)] = m.owned[k];
  const merges = [...new Set(m.merges.map(toPosix))].sort();
  writeFile(path.join(target, MANIFEST_REL), JSON.stringify({ owned, merges }, null, 2) + "\n");
}
