/**
 * aemb upgrade —— 按当前通道（latest/beta/rc）一键升级全局 aemb CLI（对标 Trellis 的 trellis upgrade）。
 *
 *   aemb upgrade            # 按当前版本推断通道：含 -beta→beta，-rc→rc，否则 latest
 *   aemb upgrade --tag beta # 显式指定 dist-tag / 版本（如 beta / rc / 1.2.0-beta.3）
 *   aemb upgrade --dry-run  # 只打印将执行的命令，不改动
 *
 * Windows 关键点：npm 在 win32 是 npm.cmd（批处理），spawnSync('npm', shell:false) 会 ENOENT，
 * 必须用 cmd.exe /d /s /c 包裹（与 Trellis 一致）。stdio:'inherit' 让 npm 自身的 UTF-8 输出原样透出。
 */
import { spawnSync } from "child_process";
import { PACKAGE_NAME, VERSION } from "../constants/version";

export interface UpgradeOptions {
  tag?: string;
  dryRun?: boolean;
}

interface UpgradePlan {
  command: string;
  args: string[];
  displayCommand: string;
  target: string;
  tag: string;
  binCheck: string;
}

// dist-tag / 版本号白名单：字母数字开头，其后允许 . _ -（与 npm 一致，防注入 shell 参数）。
const NPM_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 解析升级通道：显式 tag 优先（校验合法）；否则由当前版本推断 beta/rc/latest。 */
export function resolveUpgradeTag(currentVersion: string = VERSION, requestedTag?: string): string {
  if (requestedTag) {
    if (!NPM_TAG_RE.test(requestedTag)) {
      throw new Error(
        `无效的 npm tag/版本 "${requestedTag}"：只接受形如 latest / beta / rc / 1.2.0-beta.3 的简单 dist-tag 或版本号。`,
      );
    }
    return requestedTag;
  }
  if (currentVersion.includes("-beta")) return "beta";
  if (currentVersion.includes("-rc")) return "rc";
  return "latest";
}

/** 组装升级命令计划（win32 用 cmd.exe 包裹 npm.cmd，其它平台直接 spawn npm）。 */
export function buildUpgradeCommand(
  options: UpgradeOptions = {},
  currentVersion: string = VERSION,
  platform: NodeJS.Platform = process.platform,
): UpgradePlan {
  const tag = resolveUpgradeTag(currentVersion, options.tag);
  const target = `${PACKAGE_NAME}@${tag}`;
  const npmArgs = ["install", "-g", target];
  const displayCommand = `npm ${npmArgs.join(" ")}`;
  const binCheck = platform === "win32" ? "where aemb" : "which aemb";
  if (platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", displayCommand], displayCommand, target, tag, binCheck };
  }
  return { command: "npm", args: npmArgs, displayCommand, target, tag, binCheck };
}

function troubleshooting(plan: UpgradePlan): string {
  return [
    "",
    "排查：",
    `  · 手动执行: ${plan.displayCommand}`,
    "  · 查看 npm 全局前缀与 PATH: npm config get prefix",
    `  · 查看 shell 解析到的 aemb 二进制: ${plan.binCheck}`,
    "  · 若是权限错误，修复 Node/npm 安装或 npm prefix；aemb 不会自动 sudo。",
    "  · 若 npm 报已存在二进制/文件占用，请手动处理该 npm 错误；aemb 不会自动加 --force。",
  ].join("\n");
}

/** 执行升级（同步 spawnSync，返回数字退出码，契合 aemb 命令约定）。 */
export function cmdUpgrade(options: UpgradeOptions = {}): number {
  let plan: UpgradePlan;
  try {
    plan = buildUpgradeCommand(options); // resolveUpgradeTag 对非法 --tag 抛错 → 转成干净的 ✗ + exit 1，不外抛栈
  } catch (e) {
    process.stderr.write(`✗ ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
  console.log(`==> 升级 auto-embedded CLI → ${plan.target}（当前 ${VERSION}）`);
  console.log(`  · 执行: ${plan.displayCommand}`);
  if (options.dryRun) {
    console.log("  · dry-run：未做任何改动");
    return 0;
  }
  const r = spawnSync(plan.command, plan.args, { stdio: "inherit", shell: false });
  if (r.error) {
    process.stderr.write(`✗ 无法运行 npm（${r.error.message}）。${troubleshooting(plan)}\n`);
    return 1;
  }
  if (r.signal) {
    process.stderr.write(`✗ npm install 被信号 ${r.signal} 中断。${troubleshooting(plan)}\n`);
    return 1;
  }
  if (r.status === null) {
    process.stderr.write(`✗ npm install 无退出码即结束。${troubleshooting(plan)}\n`);
    return 1;
  }
  if (r.status !== 0) {
    process.stderr.write(`✗ npm install 退出码 ${r.status}。${troubleshooting(plan)}\n`);
    return r.status;
  }
  console.log("\n  ✓ 升级完成。验证: aemb --version");
  console.log(`  · ${plan.binCheck}`);
  return 0;
}
