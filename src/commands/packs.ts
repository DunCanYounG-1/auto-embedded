/**
 * aemb add / remove / profile —— profile 感知装配的用户侧管理命令。
 *
 *  add <pack...>    启用内容包（芯片/OS/构建/探针/领域），改 profile 后重装配（复用 update 的写+prune）。
 *  remove <pack...> 关闭内容包，改 profile 后重装配（未改动的落选文件被 prune，改过的保留）。
 *  profile          打印当前 profile + 解析出的 selection + 已装计数。
 */
import { getConfigurator } from "../configurators/index";
import { detectPython } from "../utils/python";
import { loadManifest } from "../utils/manifest";
import { cmdUpdate } from "./update";
import { isInstalled, readPlatforms, readProfile, writeProfile } from "./engine";
import { allPackIds, optInPackIds, resolveSelection, type Profile } from "../content/packs";

/** 把一个 pack id 并入 profile（轴包→对应轴；领域/opt-in→packs[]）。 */
function addPackToProfile(prof: Profile, pack: string): void {
  const push = (arr: string[], v: string) => {
    if (!arr.includes(v)) arr.push(v);
  };
  if (pack === "core") return;
  if (pack.startsWith("chip:")) push(prof.chips, pack.slice("chip:".length));
  else if (pack.startsWith("build:")) push(prof.build, pack.slice("build:".length));
  else if (pack.startsWith("probe:")) push(prof.probe, pack.slice("probe:".length));
  else if (pack === "os:rt-thread") push(prof.rtos, "rt-thread");
  else push(prof.packs, pack); // matlab / competition / control / bus:* / rtos-debug
}

/** 从 profile 移除一个 pack id。 */
function removePackFromProfile(prof: Profile, pack: string): void {
  prof.packs = prof.packs.filter((p) => p !== pack);
  if (pack.startsWith("chip:")) prof.chips = prof.chips.filter((c) => `chip:${c}` !== pack);
  else if (pack.startsWith("build:")) prof.build = prof.build.filter((b) => `build:${b}` !== pack);
  else if (pack.startsWith("probe:")) prof.probe = prof.probe.filter((x) => `probe:${x}` !== pack);
  else if (pack === "os:rt-thread") prof.rtos = prof.rtos.filter((r) => r !== "rt-thread");
  else if (pack === "rtos-debug") prof.rtos = [];
}

function loadGatedProfile(target: string, verb: string): Profile | null {
  if (!isInstalled(target)) {
    process.stderr.write(`✗ ${target} 未 init（无 .auto-embedded/）\n`);
    return null;
  }
  const prof = readProfile(target);
  if (!prof) {
    console.log(`本工程为全量安装（无 .auto-embedded/profile.json）；${verb} 仅用于 profile 精简安装。`);
    console.log("如需精简，请重跑 `aemb init`（会按芯片/构建探测生成 profile）。");
    return null;
  }
  if (prof.mode === "full") {
    console.log(`本工程为全量安装（mode:full），已包含全部内容包；${verb} 不适用。`);
    console.log("如需精简，请重跑 `aemb init` 并指定芯片/构建（或 --profile）。");
    return null;
  }
  return prof;
}

function validatePacks(packs: string[]): string[] | null {
  const known = new Set(allPackIds());
  const invalid = packs.filter((p) => !known.has(p));
  if (invalid.length) {
    process.stderr.write(`✗ 未知内容包: ${invalid.join(", ")}\n`);
    process.stderr.write(`  可 add 的领域包: ${optInPackIds().join(", ")}\n`);
    process.stderr.write(`  也可用轴包: chip:<x> / build:<x> / probe:<x> / os:rt-thread\n`);
    return null;
  }
  return packs;
}

export function cmdAdd(target: string, packs: string[]): number {
  if (!packs.length) {
    process.stderr.write("✗ add 需要至少一个内容包（如 matlab / control / chip:stm32）\n");
    return 1;
  }
  const prof = loadGatedProfile(target, "add");
  if (!prof) return isInstalled(target) ? 0 : 1;
  if (!validatePacks(packs)) return 1;
  for (const p of packs) addPackToProfile(prof, p);
  prof.mode = "manual"; // 用户显式管理后转手动，避免后续被误当无信号
  writeProfile(target, prof);
  console.log(`==> 启用内容包: ${packs.join(", ")} → 重装配`);
  return cmdUpdate(target);
}

export function cmdRemove(target: string, packs: string[]): number {
  if (!packs.length) {
    process.stderr.write("✗ remove 需要至少一个内容包\n");
    return 1;
  }
  const prof = loadGatedProfile(target, "remove");
  if (!prof) return isInstalled(target) ? 0 : 1;
  if (!validatePacks(packs)) return 1;
  for (const p of packs) removePackFromProfile(prof, p);
  prof.mode = "manual";
  writeProfile(target, prof);
  console.log(`==> 关闭内容包: ${packs.join(", ")} → 重装配（未改动的落选文件将被剪除）`);
  return cmdUpdate(target);
}

export function cmdProfile(target: string): number {
  if (!isInstalled(target)) {
    process.stderr.write(`✗ ${target} 未 init（无 .auto-embedded/）\n`);
    return 1;
  }
  const prof = readProfile(target);
  console.log(`==> auto-embedded profile: ${target}`);
  if (!prof) {
    console.log("  mode: full（无 profile.json —— 全量安装，含全部内容包）");
    console.log("  提示：重跑 `aemb init` 可按芯片/构建探测生成精简 profile。");
    return 0;
  }
  console.log(`  mode:   ${prof.mode}`);
  console.log(`  chips:  ${prof.chips.join(", ") || "(无)"}`);
  console.log(`  build:  ${prof.build.join(", ") || "(无)"}`);
  console.log(`  probe:  ${prof.probe.join(", ") || "(无)"}`);
  console.log(`  rtos:   ${prof.rtos.join(", ") || "(无)"}`);
  console.log(`  opt-in: ${prof.packs.join(", ") || "(无)"}`);
  const sel = resolveSelection(prof);
  console.log(`  启用包: ${[...sel].filter((p) => p !== "core").sort().join(", ") || "(仅 core)"}`);

  // 已装计数（从 manifest.owned 粗略统计）
  const m = loadManifest(target);
  const owned = Object.keys(m.owned);
  const nRefs = owned.filter((p) => p.includes("/refs/") && p.endsWith(".md")).length;
  const nModes = owned.filter((p) => p.includes("/modes/") && p.endsWith(".md")).length;
  const platforms = readPlatforms(target);
  const py = detectPython();
  let nSkills = 0;
  if (platforms.length && getConfigurator(platforms[0])) {
    const plan = getConfigurator(platforms[0])!(py, sel);
    nSkills = [...plan.files.keys()].filter((p) => /\/skills\/aemb-[^/]+\/SKILL\.md$/.test(p)).length;
  }
  console.log(`  已装: refs ${nRefs} · modes ${nModes} · 技能/平台 ${nSkills}`);
  console.log("  改动：`aemb add <pack>` / `aemb remove <pack>`；全量：`aemb init --full`。");
  return 0;
}
