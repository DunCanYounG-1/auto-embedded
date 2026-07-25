/**
 * 内容包完备性自测：保证 packs.ts 的 CATALOG 与磁盘上真实交付的文件严格一致。
 *
 * 断言：
 *  1. 每个磁盘单元（ref/mode/toolskill/runtime-loose）在 CATALOG 里被**恰好一个** pack 显式登记
 *     —— 新增文件若忘了归类 → 硬失败（逼贡献者放进某个 pack 或显式进 core）。
 *  2. CATALOG 里登记的每个 id 都在磁盘上存在 —— catch 拼写/重命名/删除导致的悬空登记。
 *
 * 运行：`node dist/content/packs.selftest.js`（build 后）；退出码 0=通过，1=失败。
 * 被 tests/test-auto-embedded.sh 调用。
 */
import * as fs from "fs";
import * as path from "path";
import { TPL } from "../constants/paths";
import { CATALOG, type UnitKind } from "./packs";

interface DiskUnit {
  kind: UnitKind;
  id: string;
  where: string;
}

function listMd(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name.replace(/\.md$/, ""));
}

function collectDiskUnits(): DiskUnit[] {
  const units: DiskUnit[] = [];

  // refs: 顶层 *.md + 子目录
  const refsDir = path.join(TPL.runtime, "refs");
  for (const e of fs.readdirSync(refsDir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".md")) units.push({ kind: "ref", id: e.name.replace(/\.md$/, ""), where: `refs/${e.name}` });
    else if (e.isDirectory()) units.push({ kind: "ref", id: e.name, where: `refs/${e.name}/` });
  }

  // modes: *.md
  for (const id of listMd(path.join(TPL.runtime, "modes"))) units.push({ kind: "mode", id, where: `modes/${id}.md` });

  // toolskills: common/tool-skills/*.md（权威 24）
  for (const id of listMd(TPL.commonToolSkills)) units.push({ kind: "toolskill", id, where: `tool-skills/${id}.md` });

  // tools 下：松散文件 → runtime；shared 目录 → runtime "shared"；其余目录 → toolskill（须与上面配对）
  const toolsDir = path.join(TPL.runtime, "tools");
  for (const e of fs.readdirSync(toolsDir, { withFileTypes: true })) {
    if (e.isFile()) units.push({ kind: "runtime", id: e.name, where: `tools/${e.name}` });
    else if (e.isDirectory() && e.name === "shared") units.push({ kind: "runtime", id: "shared", where: `tools/shared/` });
    // 其余 tools/<skill>/ 目录由 tool-skills/*.md 那条覆盖，不重复计
  }

  return units;
}

const LIST_KEY: Record<UnitKind, keyof (typeof CATALOG)["core"]> = {
  ref: "refs",
  mode: "modes",
  toolskill: "toolskills",
  runtime: "runtime",
};

/** 返回该单元被显式登记的 pack 列表（0 或多个）。 */
function packsContaining(kind: UnitKind, id: string): string[] {
  const key = LIST_KEY[kind];
  const out: string[] = [];
  for (const [pack, def] of Object.entries(CATALOG)) {
    const list = def[key] as string[] | undefined;
    if (list && list.includes(id)) out.push(pack);
  }
  return out;
}

export function runSelfTest(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const disk = collectDiskUnits();

  // 1) 每个磁盘单元恰好一个 pack
  for (const u of disk) {
    const packs = packsContaining(u.kind, u.id);
    if (packs.length === 0) errors.push(`未归类: ${u.kind} "${u.id}" (${u.where}) —— 请放进 packs.ts 的某个 pack 或 core`);
    else if (packs.length > 1) errors.push(`重复归类: ${u.kind} "${u.id}" 出现在 [${packs.join(", ")}]`);
  }

  // 2) CATALOG 里每个 id 在磁盘上存在
  const diskKey = (kind: UnitKind, id: string) => `${kind}:${id}`;
  const diskSet = new Set(disk.map((u) => diskKey(u.kind, u.id)));
  for (const [pack, def] of Object.entries(CATALOG)) {
    for (const kind of ["ref", "mode", "toolskill", "runtime"] as UnitKind[]) {
      const list = def[LIST_KEY[kind]] as string[] | undefined;
      if (!list) continue;
      for (const id of list) {
        if (!diskSet.has(diskKey(kind, id))) errors.push(`悬空登记: pack "${pack}" 列了 ${kind} "${id}"，但磁盘上不存在`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

if (require.main === module) {
  const { ok, errors } = runSelfTest();
  if (ok) {
    console.log("✓ packs.ts 完备性自测通过（磁盘单元 ↔ CATALOG 一一对应）");
    process.exit(0);
  }
  console.error("✗ packs.ts 完备性自测失败：");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
