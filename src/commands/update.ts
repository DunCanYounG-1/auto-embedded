/**
 * aemb update —— 升级 managed（运行时脚本 + 各平台独占文件）并重放共享配置合并；保留 spec/tasks/用户改动。
 *
 * 用 hash 清单区分：模板升级(覆盖) / 已最新(跳过) / 用户改过(写 .new 不覆盖)。
 */
import * as fs from "fs";
import * as path from "path";
import { getConfigurator } from "../configurators/index";
import { getRuntimeManaged } from "../configurators/workflow";
import { detectPython } from "../utils/python";
import { writeFile } from "../utils/file-writer";
import { toPosix } from "../utils/posix";
import { type Manifest, loadManifest, saveManifest, sha256 } from "../utils/manifest";
import {
  applyMerge,
  escapingManagedRoots,
  isInstalled,
  parentWithinTarget,
  readPlatforms,
  runtimeUnsafe,
} from "./engine";

export function cmdUpdate(target: string): number {
  if (!isInstalled(target)) {
    process.stderr.write(`✗ ${target} 未 init（无 .auto-embedded/）\n`);
    return 1;
  }
  console.log(`==> auto-embedded update: ${target}`);
  const py = detectPython();
  // 先查运行时根/元数据/scripts 树是否越界（在读取其 .platforms/manifest 之前，否则会先读到工程外内容）
  if (runtimeUnsafe(target)) {
    process.stderr.write(
      `✗ 拒绝：.auto-embedded 根/元数据文件/scripts 树存在越界符号链接，其清单不可信。请手动检查后处理。\n`,
    );
    return 1;
  }
  const platforms = readPlatforms(target);
  const escaping = escapingManagedRoots(target, platforms);
  if (escaping.length) {
    process.stderr.write(
      `✗ 拒绝：以下受管目录经解析越出工程根（疑似指向工程外的符号链接），请先移除/还原后重试：${escaping.join(", ")}\n`,
    );
    return 1;
  }
  const manifest = loadManifest(target);
  const next: Manifest = { owned: { ...manifest.owned }, merges: [...manifest.merges] };

  // 期望的 managed 文件集合：运行时 managed + 各平台 plan.files；顺带重放 merges
  const desired = new Map<string, string>();
  for (const [rel, c] of getRuntimeManaged()) desired.set(toPosix(rel), c);
  for (const id of platforms) {
    const cfg = getConfigurator(id);
    if (!cfg) {
      process.stderr.write(`  · 平台 ${id} 无 configurator（可能为旧装/预留），跳过其文件\n`);
      continue;
    }
    const plan = cfg(py);
    for (const [rel, c] of plan.files) desired.set(toPosix(rel), c);
    for (const m of plan.merges) {
      const p = applyMerge(target, m, py); // 含 symlink 防护 + .json 解析失败备份
      if (p && !next.merges.includes(p)) next.merges.push(p);
    }
  }

  let updated = 0;
  let same = 0;
  let preserved = 0;
  const conflicts: [string, string][] = [];
  for (const [rel, content] of desired) {
    const abs = path.join(target, rel);
    if (!parentWithinTarget(target, abs)) {
      process.stderr.write(`  ⚠ 跳过 ${rel}：父目录经 symlink 越出工程根\n`);
      continue;
    }
    // 目标自身若是 symlink：删链接，按缺失 managed 文件重建（防读穿/读到目录 EISDIR 崩溃）。
    try {
      if (fs.lstatSync(abs).isSymbolicLink()) fs.unlinkSync(abs);
    } catch {
      /* 不存在 */
    }
    const newHash = sha256(content);
    if (!fs.existsSync(abs)) {
      writeFile(abs, content); // writeFile 已防 symlink-dst
      next.owned[rel] = newHash;
      updated++;
      continue;
    }
    let cur: string;
    try {
      cur = fs.readFileSync(abs, "utf-8");
    } catch {
      // 现有路径不可读（如被占为目录）→ 跳过，不崩
      process.stderr.write(`  ⚠ 跳过 ${rel}：现有路径不可读（可能被占为目录），请手动处理\n`);
      continue;
    }
    const curHash = sha256(cur);
    const recorded = manifest.owned[rel];
    if (curHash === newHash) {
      next.owned[rel] = newHash;
      same++;
    } else if (recorded !== undefined && curHash === recorded) {
      writeFile(abs, content);
      next.owned[rel] = newHash;
      updated++;
    } else {
      writeFile(abs + ".new", content);
      conflicts.push([rel, rel + ".new"]);
      preserved++;
    }
  }

  saveManifest(target, next);
  console.log(`  ✓ managed: 更新 ${updated}，已最新 ${same}，保留用户改动 ${preserved}`);
  for (const [rel, side] of conflicts) {
    process.stderr.write(`    ⚠ ${rel} 你改过 → 新版写到 ${side}，请手动比对合并\n`);
  }
  const migrated = migrateConfigKnowledgeLayers(target);
  console.log(
    migrated
      ? "  ✓ config.yaml: spec_layers 补注册 refs/modes 知识层（SessionStart 将注入其索引）"
      : "  · spec/tasks/workspace/config 未触碰",
  );
  return 0;
}

/**
 * seed 迁移（v2+）：老工程的 config.yaml 没有 refs/modes 层注册 → SessionStart 不会注入知识库索引。
 * 仅当存在 spec_layers: 块且缺对应条目时，把缺的层插到该块末尾；其余内容一字不动。幂等。
 * config.yaml 属用户内容，只做"纯新增条目"这一种最小手术；解析口径与 aemb_core 的迷你解析一致。
 */
function migrateConfigKnowledgeLayers(target: string): boolean {
  const abs = path.join(target, ".auto-embedded", "config.yaml");
  if (!parentWithinTarget(target, abs) || !fs.existsSync(abs)) return false;
  try {
    if (fs.lstatSync(abs).isSymbolicLink()) return false; // 被换成 symlink → 不碰
  } catch {
    return false;
  }
  let text: string;
  try {
    text = fs.readFileSync(abs, "utf-8");
  } catch {
    return false;
  }
  const missing = [
    { name: "refs", path: "refs" },
    { name: "modes", path: "modes" },
  ].filter((l) => !new RegExp(`^\\s*-\\s*name\\s*:\\s*${l.name}\\s*$`, "m").test(text));
  if (!missing.length) return false;

  // 定位 spec_layers: 块的末行（与 aemb_core 迷你解析同口径：块到下一个非缩进、非 "-" 开头行为止）
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*spec_layers\s*:/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return false; // 用户改走了结构 → 不猜，不动
  let end = lines.length; // 块内容 [start+1, end)
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i]) && !lines[i].trimStart().startsWith("-")) {
      end = i;
      break;
    }
  }
  // 跳过块尾的空行，使新条目紧贴最后一个已有条目
  let insertAt = end;
  while (insertAt > start + 1 && lines[insertAt - 1].trim() === "") insertAt--;
  // 沿用块内已有条目的缩进；无条目则默认两空格
  const indentMatch = lines.slice(start + 1, insertAt).map((l) => l.match(/^(\s*)-\s*name\s*:/)).find(Boolean);
  const ind = indentMatch ? indentMatch[1] : "  ";
  const add: string[] = [
    `${ind}# 随框架装入的只读知识面（aemb update 自动补注册；项目级学习走 promote 进 spec 层）`,
  ];
  for (const l of missing) {
    add.push(`${ind}- name: ${l.name}`, `${ind}  path: ${l.path}`);
  }
  lines.splice(insertAt, 0, ...add);
  writeFile(abs, lines.join("\n"));
  return true;
}
