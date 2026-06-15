/**
 * aemb workflow —— 切换工程的 RIPER-5 workflow 模板（对标 Trellis 的 trellis workflow）。
 *
 *   aemb workflow              # 列出可选模板
 *   aemb workflow --list
 *   aemb workflow <id>         # 切到该模板（native|tdd|competition）
 *   aemb workflow <id> --force # 覆盖你改过的 workflow.md
 *   aemb workflow <id> --create-new  # 不覆盖，新版写到 workflow.md.new
 *
 * durable-state 契约（与 update.ts 配合）：native 写入后在 manifest.owned 记录 hash（update 继续刷新它）；
 * 任何非 native 变体写入后从 manifest.owned 移除该键 → aemb update 视其为用户自管，不再用 native 覆盖
 *（update.ts 已对 rel===workflow.md && recorded===undefined 跳过回写）。
 */
import * as fs from "fs";
import * as path from "path";
import { TPL, RUNTIME_DIR } from "../constants/paths";
import { replacePythonLiterals } from "../utils/python";
import { writeFile } from "../utils/file-writer";
import { toPosix } from "../utils/posix";
import { loadManifest, saveManifest, sha256 } from "../utils/manifest";
import { isInstalled, parentWithinTarget, runtimeUnsafe } from "./engine";

export interface WorkflowOpts {
  id?: string;
  list?: boolean;
  force?: boolean;
  createNew?: boolean;
}

interface WorkflowDef {
  desc: string;
  /** 变体文件名（在 TPL.workflows）；缺省 = native，源自受管的 runtime/workflow.md。 */
  file?: string;
}

const WORKFLOWS: Record<string, WorkflowDef> = {
  native: { desc: "标准 RIPER-5：RESEARCH→INNOVATE→PLAN→EXECUTE→REVIEW（默认）" },
  tdd: { desc: "RIPER-5 + 测试先行：EXECUTE 每轮先写失败测试再实现", file: "tdd.md" },
  competition: { desc: "RIPER-5 + 6-Agent CP 门禁（比赛/攻坚，详见 modes/competition.md）", file: "competition.md" },
};

/** 读模板内容并做 python3 字面替换（与 getRuntimeManaged 对 workflow.md 的处理一致，保证 native 字节一致）。 */
function readWorkflowContent(id: string): string {
  const def = WORKFLOWS[id];
  const raw = def.file
    ? fs.readFileSync(path.join(TPL.workflows, def.file), "utf-8")
    : fs.readFileSync(path.join(TPL.runtime, "workflow.md"), "utf-8");
  return replacePythonLiterals(raw);
}

function printList(): void {
  console.log("auto-embedded workflow 模板（aemb workflow <id> 切换）：");
  for (const [id, def] of Object.entries(WORKFLOWS)) {
    console.log(`  ${id.padEnd(12)} ${def.desc}`);
  }
}

export function cmdWorkflow(target: string, o: WorkflowOpts): number {
  if (o.list || !o.id) {
    printList();
    if (!o.id && !o.list) console.log("\n用法: aemb workflow <id> [--force | --create-new]");
    return 0;
  }
  const id = o.id;
  if (!(id in WORKFLOWS)) {
    process.stderr.write(`✗ 未知 workflow: ${id}；可选: ${Object.keys(WORKFLOWS).join(", ")}\n`);
    return 1;
  }
  if (!isInstalled(target)) {
    process.stderr.write(`✗ ${target} 未 init（无 .auto-embedded/）\n`);
    return 1;
  }
  if (runtimeUnsafe(target)) {
    process.stderr.write(`✗ 拒绝：.auto-embedded 根/元数据/scripts 树存在越界符号链接，请先处理。\n`);
    return 1;
  }

  const rel = toPosix(`${RUNTIME_DIR}/workflow.md`);
  const abs = path.join(target, RUNTIME_DIR, "workflow.md");
  if (!parentWithinTarget(target, abs)) {
    process.stderr.write(`✗ 拒绝：workflow.md 父目录经 symlink 越出工程根。\n`);
    return 1;
  }

  const content = readWorkflowContent(id);
  const newHash = sha256(content);
  const manifest = loadManifest(target);
  const recorded = manifest.owned[rel];

  let cur: string | null = null;
  try {
    cur = fs.readFileSync(abs, "utf-8");
  } catch {
    cur = null;
  }
  const curHash = cur === null ? null : sha256(cur);

  // 用户改过（当前为 managed/native 但与记录 hash 不符）且非 --force → 保护用户改动。
  const userModified = cur !== null && recorded !== undefined && curHash !== recorded;
  if (userModified && !o.force) {
    if (o.createNew) {
      writeFile(abs + ".new", content);
      console.log(`  ⚠ workflow.md 你改过：新模板 ${id} 写到 .auto-embedded/workflow.md.new（未覆盖你的改动），请手动比对合并`);
      return 0;
    }
    process.stderr.write(
      `✗ workflow.md 你改过（与上次安装记录不一致），切到 ${id} 会覆盖你的改动。\n` +
        `  确认覆盖: --force；保留并把新模板另存 .new: --create-new。\n`,
    );
    return 1;
  }

  // 目标符号链接先删，避免顺链接写穿（与 writeFile 的防护互补）。
  try {
    if (fs.lstatSync(abs).isSymbolicLink()) fs.unlinkSync(abs);
  } catch {
    /* 不存在 */
  }

  if (curHash === newHash) {
    // 内容已一致，仅校正 manifest 归属（幂等）。
    if (id === "native") manifest.owned[rel] = newHash;
    else delete manifest.owned[rel];
    saveManifest(target, manifest);
    console.log(`  · workflow 已是 ${id}，无需切换`);
    return 0;
  }

  writeFile(abs, content);
  if (id === "native") manifest.owned[rel] = newHash;
  else delete manifest.owned[rel];
  saveManifest(target, manifest);

  console.log(`  ✓ workflow → ${id}（${WORKFLOWS[id].desc}）`);
  if (id !== "native") {
    console.log("  · 已记为用户自管：aemb update 不会用 native 覆盖它（切回标准流程用 aemb workflow native）");
  }
  return 0;
}
