/**
 * 运行时版本与布局迁移（修复"升级链断裂、无法 update"）。
 *
 * 旧 update 完全忽略 .version、只做加法（只写当前 desired 集），所以一旦未来重命名/删除某个 managed 文件，
 * 老装机上会永远残留孤儿、且无有序重放。本模块让 update 变成版本感知：
 *   1) 读 .auto-embedded/.version（缺失/非法 → 0，整链重放）；
 *   2) 在写 desired 之前，按版本升序重放 (installed, RUNTIME_VERSION] 区间的迁移（rename/delete，带越界与 hash 守卫）；
 *   3) update 末尾把 .version 写成 RUNTIME_VERSION。
 *
 * 迁移在工程根内用 engine 的 safeResolve/parentWithinTarget 守卫执行，绝不写/删工程外文件。
 */
import * as fs from "fs";
import * as path from "path";
import { RUNTIME_DIR } from "../constants/paths";
import { readFileOrNull } from "../utils/file-writer";
import { sha256 } from "../utils/manifest";
import { parentWithinTarget, safeResolve } from "../commands/engine";
import type { MigrationItem } from "../types/migration";

/** 当前运行时布局版本。破坏性改动布局（重命名/删除 managed 文件）时 +1，并在 MIGRATIONS 追加对应项。 */
export const RUNTIME_VERSION = 2;

/** 版本布局迁移表（按 version 升序、(from, to] 区间重放）。当前无布局变更 → 空表（机制就位，行为不变）。 */
const MIGRATIONS: MigrationItem[] = [
  // 示例：{ version: 3, type: "rename", from: ".auto-embedded/old.md", to: ".auto-embedded/new.md", description: "重命名 X" }
];

/** 取 (from, to] 区间、按版本升序的迁移。 */
export function getMigrationsBetween(from: number, to: number): MigrationItem[] {
  return MIGRATIONS.filter((m) => m.version > from && m.version <= to).sort((a, b) => a.version - b.version);
}

/** 读 .auto-embedded/.version（整数）；缺失/非法 → 0（使整条迁移链重放——老装机正是无 .version 的情形）。 */
export function readRuntimeVersion(target: string): number {
  const raw = readFileOrNull(path.join(target, RUNTIME_DIR, ".version"));
  const n = raw ? parseInt(raw.trim(), 10) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** 把 .version 写成当前 RUNTIME_VERSION（与 init 写法字节一致：尾随 "\n"）。 */
export function writeRuntimeVersion(target: string): void {
  fs.writeFileSync(path.join(target, RUNTIME_DIR, ".version"), `${RUNTIME_VERSION}\n`, "utf-8");
}

/**
 * 重放 (from, to] 区间的迁移，返回人类可读日志行（供 update 打印）。
 * 安全：from/to 经 safeResolve + parentWithinTarget 守卫（拒绝绝对/越界/穿 symlink 父目录），
 * delete 可选 hash 守卫（仅当现内容匹配才删，防误删用户改动）。
 */
/** 实际执行的迁移结果：日志行 + 真正落盘的 rename/delete（供 update 同步 manifest.owned 键，防孤儿）。 */
export interface MigrationResult {
  log: string[];
  renamed: [string, string][]; // [fromRel, toRel]
  deleted: string[]; // fromRel
}

export function applyMigrations(target: string, from: number, to: number): MigrationResult {
  const log: string[] = [];
  const renamed: [string, string][] = [];
  const deleted: string[] = [];
  for (const m of getMigrationsBetween(from, to)) {
    const fromAbs = safeResolve(target, m.from);
    if (!fromAbs || !parentWithinTarget(target, fromAbs)) {
      log.push(`跳过迁移 v${m.version}（from 越界/不安全）: ${m.from}`);
      continue;
    }
    if (!fs.existsSync(fromAbs)) continue; // 源已不在 → 幂等跳过
    if (m.type === "rename") {
      if (!m.to) {
        log.push(`跳过迁移 v${m.version}（rename 缺 to）: ${m.from}`);
        continue;
      }
      const toAbs = safeResolve(target, m.to);
      if (!toAbs || !parentWithinTarget(target, toAbs)) {
        log.push(`跳过迁移 v${m.version}（to 越界/不安全）: ${m.to}`);
        continue;
      }
      try {
        fs.mkdirSync(path.dirname(toAbs), { recursive: true });
        fs.renameSync(fromAbs, toAbs);
        renamed.push([m.from, m.to]);
        log.push(`重命名 ${m.from} → ${m.to}` + (m.description ? `（${m.description}）` : ""));
      } catch (e) {
        log.push(`重命名失败 ${m.from}: ${e}`);
      }
    } else {
      // delete
      if (m.hashes && m.hashes.length) {
        const cur = readFileOrNull(fromAbs);
        if (cur === null || !m.hashes.includes(sha256(cur))) {
          log.push(`保留 ${m.from}（你改过，hash 不匹配；请手动确认是否删除）`);
          continue;
        }
      }
      try {
        fs.rmSync(fromAbs, { recursive: true, force: true });
        deleted.push(m.from);
        log.push(`删除 ${m.from}` + (m.description ? `（${m.description}）` : ""));
      } catch (e) {
        log.push(`删除失败 ${m.from}: ${e}`);
      }
    }
  }
  return { log, renamed, deleted };
}
