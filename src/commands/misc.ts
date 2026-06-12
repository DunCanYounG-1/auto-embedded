/**
 * aemb status / check / doctor / backup —— 薄封装。
 *  status/check 直接跑装进工程的内核脚本（get_context.py / check.py）。
 *  doctor 体检：运行时文件 + 各平台独占文件存在性 + 共享配置是否接线 aemb。
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { RUNTIME_DIR } from "../constants/paths";
import { getConfigurator } from "../configurators/index";
import { detectPython } from "../utils/python";
import {
  backupRuntime,
  escapingManagedRoots,
  isInstalled,
  readPlatforms,
  runtimeScriptSafe,
  runtimeUnsafe,
} from "./engine";

/** 运行时根越界 symlink 时统一拒绝（防读穿/执行工程外脚本/拷工程外内容）。 */
function refuseEscape(): number {
  process.stderr.write(
    "✗ 拒绝：.auto-embedded 经解析越出工程根（疑似指向工程外的符号链接）。请手动检查后处理。\n",
  );
  return 1;
}

export function cmdStatus(target: string): number {
  if (runtimeUnsafe(target)) return refuseEscape(); // 根/元数据/scripts 树任一越界 symlink → 拒绝
  const gc = path.join(target, RUNTIME_DIR, "scripts", "get_context.py");
  if (!fs.existsSync(gc)) {
    process.stderr.write(`✗ ${target} 未 init\n`);
    return 1;
  }
  if (!runtimeScriptSafe(target, gc)) return refuseEscape(); // defense-in-depth：脚本真实路径越界则不 spawn
  const r = spawnSync(detectPython(), [gc], { cwd: target, stdio: "inherit" });
  return r.status ?? 1;
}

export function cmdCheck(target: string, extra: string[]): number {
  if (runtimeUnsafe(target)) return refuseEscape();
  const chk = path.join(target, RUNTIME_DIR, "scripts", "check.py");
  if (!fs.existsSync(chk)) {
    process.stderr.write(`✗ ${target} 未 init 或缺 check.py（重跑 update）\n`);
    return 2;
  }
  if (!runtimeScriptSafe(target, chk)) return refuseEscape(); // defense-in-depth
  const r = spawnSync(detectPython(), [chk, ...extra], { cwd: target, stdio: "inherit" });
  return r.status ?? 1;
}

export function cmdBackup(target: string): number {
  if (!isInstalled(target)) {
    process.stderr.write(`✗ ${target} 未 init\n`);
    return 1;
  }
  if (runtimeUnsafe(target)) return refuseEscape();
  const dst = backupRuntime(target);
  console.log(`✓ 已备份 .auto-embedded/ → ${path.basename(dst)}`);
  return 0;
}

export function cmdDoctor(target: string): number {
  console.log(`==> auto-embedded doctor: ${target}`);
  if (runtimeUnsafe(target)) {
    console.log("  ✗ .auto-embedded 根/元数据文件/scripts 树存在越界 symlink——拒绝体检，请手动检查。");
    return 1;
  }
  let ok = true;
  const ae = path.join(target, RUNTIME_DIR);
  const aeOk = fs.existsSync(ae) && fs.statSync(ae).isDirectory();
  console.log(`  .auto-embedded/ : ${aeOk ? "OK" : "MISSING"}`);
  ok = ok && aeOk;
  for (const f of [
    "scripts/aemb_core.py",
    "scripts/task.py",
    "scripts/get_context.py",
    "scripts/check.py",
    "workflow.md",
    "config.yaml",
  ]) {
    const e = fs.existsSync(path.join(ae, f));
    console.log(`  ${f} : ${e ? "OK" : "MISSING"}`);
    ok = ok && e;
  }
  const py = detectPython();
  const platforms = readPlatforms(target);
  if (escapingManagedRoots(target, platforms).length) {
    console.log("  ✗ 某平台受管目录经解析越出工程根（疑似越界 symlink）——拒绝体检，请手动检查。");
    return 1;
  }
  console.log(`  平台: ${platforms.join(", ") || "(无)"}`);
  for (const id of platforms) {
    const cfg = getConfigurator(id);
    if (!cfg) {
      console.log(`  [${id}] configurator 缺失（旧装/预留）`);
      ok = false;
      continue;
    }
    const plan = cfg(py);
    let filesOk = true;
    for (const rel of plan.files.keys()) {
      if (!fs.existsSync(path.join(target, rel))) {
        filesOk = false;
        break;
      }
    }
    console.log(`  [${id}] 独占文件 : ${filesOk ? "OK" : "有缺失"}`);
    ok = ok && filesOk;
    for (const m of plan.merges) {
      let wired = false;
      try {
        wired = fs.readFileSync(path.join(target, m.path), "utf-8").includes(m.marker ?? "aemb-");
      } catch {
        wired = false;
      }
      console.log(`  [${id}] ${m.path} 接线 aemb : ${wired ? "OK" : "NO"}`);
      ok = ok && wired;
    }
  }
  console.log(`  python 探测 : ${py}`);
  console.log("\n==> " + (ok ? "ALL OK" : "有缺失，建议重跑 init/update"));
  return ok ? 0 : 1;
}
