/**
 * aemb init —— 把运行时内核 + 选定平台的注入接线装进工程。
 *
 *  1) 运行时 managed（scripts/workflow.md）覆盖 + 记 hash
 *  2) 运行时 seed（config/spec）仅缺失时写
 *  3) 每个平台：configurator 产出 plan → 写独占文件(+hash) + 合并共享配置(settings/hooks-config)
 *  4) 写 .platforms/.developer/.version/manifest + 芯片探测草案
 *
 * 预留平台 / 未实现 configurator 会被明确拒绝并列出已实现平台。
 */
import * as fs from "fs";
import * as path from "path";
import { RUNTIME_DIR } from "../constants/paths";
import { RUNTIME_VERSION } from "../migrations/index";
import { AEMB_TOOLS, type AITool } from "../types/ai-tools";
import { getConfigurator, implementedTools } from "../configurators/index";
import { getRuntimeManaged, getRuntimeSeed } from "../configurators/workflow";
import { detectPython } from "../utils/python";
import { writeFile } from "../utils/file-writer";
import { toPosix } from "../utils/posix";
import { loadManifest, saveManifest, sha256 } from "../utils/manifest";
import { buildDetectDraft, detectChip, type Hits } from "../utils/chip-detect";
import {
  applyMerge,
  escapingManagedRoots,
  parentWithinTarget,
  readPlatforms,
  runtimeUnsafe,
  safeMkdir,
  safeWrite,
  sanitizeDeveloper,
  writePlatforms,
  writeProfile,
} from "./engine";
import {
  type Profile,
  profileFromHits,
  noSignal,
  resolveSelection,
} from "../content/packs";

export interface InitOpts {
  platforms: AITool[];
  user?: string;
  force?: boolean;
  /** 强制全量安装（跳过 profile 过滤）。 */
  full?: boolean;
  /** 非交互：跳过确认提示，按探测/显式 profile 直接装。 */
  yes?: boolean;
  /** `--profile k=v` 原始 token（k ∈ chips/build/probe/rtos/packs/mode，v 逗号分隔）。 */
  profileKV?: string[];
}

/** 把 `--profile k=v` 覆盖并入 profile。 */
function applyProfileOverrides(p: Profile, kvs: string[]): void {
  for (const kv of kvs) {
    const i = kv.indexOf("=");
    if (i < 0) continue;
    const k = kv.slice(0, i).trim();
    const vals = kv
      .slice(i + 1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (k === "chips") p.chips = vals;
    else if (k === "build") p.build = vals;
    else if (k === "probe") p.probe = vals;
    else if (k === "rtos") p.rtos = vals;
    else if (k === "packs") p.packs = vals;
    else if (k === "mode" && (vals[0] === "auto" || vals[0] === "full" || vals[0] === "manual")) p.mode = vals[0];
  }
}

/** 交互确认：TTY 且非 --yes 时提示一行 y/N（读失败/无输入默认接受）。 */
function promptAccept(question: string): boolean {
  process.stdout.write(question);
  const buf = Buffer.alloc(256);
  try {
    const n = fs.readSync(0, buf, 0, 256, null);
    const ans = buf.toString("utf8", 0, n).trim().toLowerCase();
    return ans === "" || ans === "y" || ans === "yes";
  } catch {
    return true;
  }
}

export function cmdInit(target: string, opts: InitOpts): number {
  const py = detectPython();
  console.log(`==> auto-embedded init: ${target}  (python=${py})`);

  // 校验平台
  const usable: AITool[] = [];
  for (const id of opts.platforms) {
    const cfg = AEMB_TOOLS[id];
    if (!cfg) {
      process.stderr.write(`  ⚠ 未知平台: ${id}，跳过\n`);
      continue;
    }
    if (cfg.status === "reserved" || !getConfigurator(id)) {
      process.stderr.write(
        `  ⚠ 平台 ${id}（${cfg.name}）暂为预留位，configurator 未实现，跳过。` +
          `已实现: ${implementedTools().join(", ")}\n`,
      );
      continue;
    }
    if (!usable.includes(id)) usable.push(id);
  }
  if (!usable.length) {
    process.stderr.write(`✗ 没有可用平台。可选（已实现）: ${implementedTools().join(", ")}\n`);
    return 1;
  }

  // 入口安全：受管根（.auto-embedded + 各平台 configDir）若是指向工程外的 symlink，拒绝（防写穿工程外文件）
  const escaping = escapingManagedRoots(target, usable);
  if (escaping.length) {
    process.stderr.write(
      `✗ 拒绝：以下受管目录经解析越出工程根（疑似指向工程外的符号链接），可能导致写穿工程外文件，` +
        `请先移除/还原后重试：${escaping.join(", ")}\n`,
    );
    return 1;
  }
  if (runtimeUnsafe(target)) {
    process.stderr.write(
      `✗ 拒绝：.auto-embedded 根/元数据文件/scripts 树存在越界符号链接，请先移除/还原后重试。\n`,
    );
    return 1;
  }

  // 增量安装：从既有 manifest 起步（union），保留之前已装平台的 owned/merges 记账，
  // 否则再 init 一个新平台会丢掉旧平台的清单，导致 uninstall 清不掉旧平台文件。
  const manifest = loadManifest(target);
  const writeOwned = (rel: string, content: string) => {
    const abs = path.join(target, rel);
    if (!parentWithinTarget(target, abs)) {
      process.stderr.write(`  ⚠ 跳过 ${rel}：父目录经 symlink 越出工程根\n`);
      return;
    }
    writeFile(abs, content); // writeFile 已防 symlink-dst 跟随
    manifest.owned[toPosix(rel)] = sha256(content);
  };

  // 0) profile 感知装配：探测芯片/框架/构建 → profile → 选内容包 selection
  let hits: Hits = { framework: [], chip: [], build: [], evidence: [] };
  try {
    hits = detectChip(target);
  } catch {
    /* 探测失败按无信号处理 */
  }
  const profile = profileFromHits(hits);
  if (opts.profileKV?.length) applyProfileOverrides(profile, opts.profileKV);
  // 显式给了 profile 覆盖 = 手动模式，抑制"无信号→全装"回退（尊重显式最小 profile）
  if (opts.profileKV?.length) profile.mode = "manual";

  let full = !!opts.full || (profile.mode !== "manual" && noSignal(hits));
  const interactive = !!process.stdout.isTTY && !!process.stdin.isTTY && !opts.yes;
  if (!full && interactive) {
    const preview = resolveSelection(profile, { full: false });
    const packs = [...preview].filter((p) => p !== "core").sort();
    console.log("  探测到工程画像 → 将按内容包精简安装（core 恒装）：");
    if (profile.chips.length) console.log(`    芯片: ${profile.chips.join(", ")}`);
    if (profile.build.length) console.log(`    构建: ${profile.build.join(", ")}`);
    if (profile.rtos.length) console.log(`    RTOS: ${profile.rtos.join(", ")}`);
    console.log(`    启用包: ${packs.join(", ") || "(仅 core)"}`);
    if (!promptAccept("  按此精简安装？其余可后续 `aemb add`（Y=精简 / n=全量）[Y/n] ")) {
      console.log("  → 改为全量安装（可用 --profile / aemb add 精确控制）");
      full = true;
    }
  }
  if (full) profile.mode = "full";
  const sel = resolveSelection(profile, { full });
  writeProfile(target, profile);
  if (!full) {
    const packs = [...sel].filter((p) => p !== "core").length;
    console.log(`  ✓ profile 装配：core + ${packs} 个内容包（全量目录见 --full / aemb profile）`);
  }

  // 1) 运行时 managed（按 selection 过滤 tools/refs/modes；scripts/workflow.md 永不过滤）
  for (const [rel, content] of getRuntimeManaged(sel)) writeOwned(rel, content);

  // 2) 运行时 seed（缺失才写，属用户内容，不记 hash）
  let seeded = 0;
  let skippedSeed = 0;
  for (const [rel, content] of getRuntimeSeed()) {
    const dst = path.join(target, rel);
    if (fs.existsSync(dst) && !opts.force) {
      skippedSeed++;
      continue;
    }
    if (safeWrite(target, dst, content)) seeded++;
  }

  // 3) 运行时目录 + .runtime/.gitignore
  for (const d of ["tasks", "workspace", ".runtime"]) safeMkdir(target, path.join(target, RUNTIME_DIR, d));
  const rtIgnore = path.join(target, RUNTIME_DIR, ".runtime", ".gitignore");
  if (!fs.existsSync(rtIgnore)) safeWrite(target, rtIgnore, "*\n!.gitignore\n");
  // .auto-embedded/.gitignore：运行时 git 卫生 + 负例护栏。seed-like，仅缺失才写（保留用户改动）。
  const aeIgnore = path.join(target, RUNTIME_DIR, ".gitignore");
  if (!fs.existsSync(aeIgnore)) {
    safeWrite(
      target,
      aeIgnore,
      "# auto-embedded 运行时 git 卫生（init 生成，可按需调整）。\n" +
        "# 切勿用 `git add -f .auto-embedded/`：-f 会强加忽略目录，把 .runtime/ 缓存、备份、*.new 一并提交\n" +
        "# （Trellis 曾因此误提交 548 个无关文件）。要提交就按精确路径 git add，绝不 -f 整个目录。\n" +
        ".runtime/\n.cache/\n*.new\n*.aemb-bak\n",
    );
  }

  console.log(`  ✓ 运行时内核: scripts/workflow 覆盖；seed 新写 ${seeded}，保留 ${skippedSeed}`);

  // 4) 每个平台
  for (const id of usable) {
    const plan = getConfigurator(id)!(py, sel);
    for (const [rel, content] of plan.files) writeOwned(rel, content);
    for (const m of plan.merges) {
      const p = applyMerge(target, m, py); // 含 symlink 防护 + .json 解析失败备份
      if (p && !manifest.merges.includes(p)) manifest.merges.push(p);
    }
    const fc = plan.files.size;
    const mc = plan.merges.length;
    console.log(`  ✓ [${id}] ${AEMB_TOOLS[id].name}（${fc} 文件 + ${mc} 合并）`);
  }

  // 5) 元数据（.platforms 取 既有 ∪ 本次，保留之前已装平台，使 uninstall 能清全部）
  const allPlatforms = [...new Set([...readPlatforms(target), ...usable])];
  writePlatforms(target, allPlatforms);
  safeWrite(target, path.join(target, RUNTIME_DIR, ".version"), `${RUNTIME_VERSION}\n`);
  if (opts.user) {
    const clean = sanitizeDeveloper(opts.user);
    if (clean && safeWrite(target, path.join(target, RUNTIME_DIR, ".developer"), clean + "\n")) {
      console.log(`  ✓ 开发者身份: ${clean}`);
    }
  }
  saveManifest(target, manifest);

  // 6) 芯片探测草案（复用第 0 步的 hits）
  try {
    const draft = buildDetectDraft(hits);
    if (draft && safeWrite(target, path.join(target, draft.rel), draft.content)) {
      const sm: string[] = [];
      if (hits.chip.length) sm.push("芯片=" + hits.chip.join("/"));
      if (hits.framework.length) sm.push("框架=" + hits.framework.join("/"));
      if (hits.build.length) sm.push("构建=" + hits.build.join("/"));
      console.log(`  ✓ 探测到 ${sm.join("; ") || "信号"} → 草案 ${draft.rel}（待你确认并入 spec）`);
    }
  } catch (e) {
    console.log(`  · 平台探测跳过（${e}）`);
  }

  console.log("\n完成。下一步：");
  console.log("  1) 在该工程根用对应 AI 工具开新会话（有 hook 的平台会自动注入 RIPER 现场 + spec 索引）");
  console.log(`  2) ${py} .auto-embedded/scripts/task.py start "<你的任务>"`);
  console.log("  3) 填 .auto-embedded/spec/hardware/hw-lock.yaml 冻结引脚/DMA/中断");
  if (allPlatforms.length) {
    console.log(`  · 已装平台入口（在对应平台的会话里用，语法各不同）:` +
      (usable.length < allPlatforms.length ? `（本次新增: ${usable.join(", ")}）` : ""));
    for (const id of allPlatforms) {
      const cfg = AEMB_TOOLS[id];
      if (!cfg) continue;
      const tc = cfg.templateContext;
      const shortName = cfg.name.replace(/（.*$/, ""); // 去掉展示名里的长括注（如 codex）
      const p = tc.cmdRefPrefix;
      const cmds = `${p}start · ${p}continue · ${p}finish-work · ${p}status`;
      const noHook = tc.hasHooks ? "" : `（无 hook 自动注入，开场先 ${p}continue 恢复现场）`;
      console.log(`      [${id}] ${shortName} → ${tc.userActionLabel}: ${cmds}${noHook}`);
    }
  }
  return 0;
}
