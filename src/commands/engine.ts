/**
 * orchestrator 共享件：目标定位、平台记录、安装计划落盘。
 */
import * as fs from "fs";
import * as path from "path";
import { RUNTIME_DIR } from "../constants/paths";
import { AEMB_TOOLS, ALL_TOOLS, getManagedPaths, type AITool } from "../types/ai-tools";
import { ensureDir, readFileOrNull, writeFile } from "../utils/file-writer";

/** 定位工程根：显式参数 > 含 .git 的最近祖先 > CWD。 */
export function resolveTarget(arg?: string): string {
  if (arg) return path.resolve(arg);
  let cur = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(cur, ".git"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return process.cwd();
}

/** 已装平台（.auto-embedded/.platforms，一行一个）。.platforms 自身若是 symlink 不跟随（防读外部平台清单）。 */
export function readPlatforms(target: string): AITool[] {
  const abs = path.join(target, RUNTIME_DIR, ".platforms");
  try {
    if (fs.lstatSync(abs).isSymbolicLink()) return [];
  } catch {
    /* 不存在 */
  }
  const raw = readFileOrNull(abs);
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((x): x is AITool => (ALL_TOOLS as string[]).includes(x));
}

export function writePlatforms(target: string, platforms: AITool[]): void {
  writeFile(path.join(target, RUNTIME_DIR, ".platforms"), platforms.join("\n") + "\n");
}

/** 把开发者名净化成单行安全串。 */
export function sanitizeDeveloper(name: string): string {
  return Array.from(name)
    .map((ch) => (ch >= " " ? ch : " "))
    .join("")
    .trim()
    .slice(0, 64);
}

/** 工程是否已 init。 */
export function isInstalled(target: string): boolean {
  return fs.existsSync(path.join(target, RUNTIME_DIR));
}

/** 平台展示名（未知回退 id）。 */
export function toolName(id: AITool): string {
  return AEMB_TOOLS[id]?.name ?? id;
}

/**
 * 把 manifest 里的相对路径安全解析到 target 内：拒绝绝对路径与越界(..)，防被篡改的 manifest
 * 删除/写到工程外。返回绝对路径或 null（越界）。
 */
export function safeResolve(target: string, rel: string): string | null {
  if (!rel || path.isAbsolute(rel)) return null;
  const base = path.resolve(target);
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

/**
 * 校验 abs 的（最近已存在的）父目录经 symlink 解析后仍在 target 内。
 * 防"父级目录是指向工程外的符号链接"导致写穿到工程外（与 writeFile 的 symlink-dst 防护互补）。
 */
export function parentWithinTarget(target: string, abs: string): boolean {
  let parent = path.dirname(abs);
  while (!fs.existsSync(parent)) {
    const up = path.dirname(parent);
    if (up === parent) break;
    parent = up;
  }
  try {
    const baseReal = fs.realpathSync(target);
    const parentReal = fs.realpathSync(parent);
    return parentReal === baseReal || parentReal.startsWith(baseReal + path.sep);
  } catch {
    return false;
  }
}

/** 安全写：父目录经 symlink 越界则拒绝（返回 false）；否则 symlink-safe 写入。 */
export function safeWrite(target: string, abs: string, content: string): boolean {
  if (!parentWithinTarget(target, abs)) {
    process.stderr.write(`  ⚠ 跳过写入 ${path.relative(target, abs)}：父目录经 symlink 越出工程根\n`);
    return false;
  }
  writeFile(abs, content); // writeFile 已防 symlink-dst 跟随
  return true;
}

/** 安全建目录：父目录经 symlink 越界则拒绝。 */
export function safeMkdir(target: string, abs: string): boolean {
  if (!parentWithinTarget(target, abs)) {
    process.stderr.write(`  ⚠ 跳过建目录 ${path.relative(target, abs)}：父目录经 symlink 越出工程根\n`);
    return false;
  }
  ensureDir(abs);
  return true;
}

/**
 * 入口安全检查：受管根（.auto-embedded + 各平台 configDir/managed）若已存在且经 realpath 解析越出工程根
 *（即被替换为指向工程外的 symlink/reparse point），返回越界根列表（非空 = 命令应拒绝，防写穿/删穿工程外）。
 */
export function escapingManagedRoots(target: string, platforms: AITool[]): string[] {
  const roots = new Set<string>([RUNTIME_DIR]);
  for (const id of platforms) for (const d of getManagedPaths(id)) roots.add(d);
  let baseReal: string;
  try {
    baseReal = fs.realpathSync(target);
  } catch {
    return [];
  }
  const bad: string[] = [];
  for (const r of roots) {
    const abs = path.join(target, r);
    if (!fs.existsSync(abs)) continue;
    let real: string;
    try {
      real = fs.realpathSync(abs);
    } catch {
      bad.push(r);
      continue;
    }
    if (real !== baseReal && !real.startsWith(baseReal + path.sep)) bad.push(r);
  }
  return bad;
}

/**
 * 应用一个共享配置合并项：读现有 → apply → 写回。
 * 安全：父目录经 symlink 越界则拒绝（返回 null）；目标若是 symlink 先删（不读不写工程外文件）。
 * 防静默吞配置：已存在的 .json 若解析失败，先备份 `.aemb-bak`（apply 会从 {} 重建接线，用户原内容不丢）。
 * 返回写入的 POSIX 相对路径（供记账），拒绝时返回 null。
 */
export function applyMerge(
  target: string,
  m: import("../configurators/types").MergeFile,
  py: string,
): string | null {
  const abs = path.join(target, m.path);
  if (!parentWithinTarget(target, abs)) {
    process.stderr.write(`  ⚠ 跳过 merge ${m.path}：父目录经 symlink 越出工程根\n`);
    return null;
  }
  // 防 symlink 跟随：目标若是 symlink 先删，避免读到/写穿工程外文件。
  try {
    if (fs.lstatSync(abs).isSymbolicLink()) fs.unlinkSync(abs);
  } catch {
    /* 不存在 */
  }
  const existing = readFileOrNull(abs);
  if (existing && m.path.endsWith(".json")) {
    try {
      JSON.parse(existing);
    } catch {
      try {
        writeFile(abs + ".aemb-bak", existing); // symlink-safe：备份文件若是 symlink 先删，不写穿工程外
      } catch {
        /* ignore */
      }
      process.stderr.write(
        `  ⚠ ${m.path} 解析失败：已备份到 ${path.basename(m.path)}.aemb-bak，将重建 aemb 接线\n`,
      );
    }
  }
  writeFile(abs, m.apply(existing, py));
  return m.path.replace(/\\/g, "/");
}

/** .auto-embedded 运行时根本身是否被替换为越界 symlink（写/读/删/备份/执行前的统一安全闸）。 */
export function runtimeRootEscapes(target: string): boolean {
  return escapingManagedRoots(target, []).length > 0;
}

/**
 * 运行时元数据文件（.platforms / .template-manifest.json / .version / .developer）自身是否为 symlink。
 * 这些是 .auto-embedded 直接子文件，正常由 aemb 写出的真实文件；若被替换为符号链接 = 被植入，
 * 跟随读会读到工程外内容（如中毒 manifest 驱动删工程内文件、外部 .platforms 影响行为）→ 命令应 fail-closed 拒绝。
 */
export function runtimeMetaEscapes(target: string): boolean {
  for (const f of [".platforms", ".template-manifest.json", ".version", ".developer"]) {
    try {
      if (fs.lstatSync(path.join(target, RUNTIME_DIR, f)).isSymbolicLink()) return true;
    } catch {
      /* 不存在 */
    }
  }
  return false;
}

/**
 * 整个 .auto-embedded 树内是否有"经解析越出 .auto-embedded 真实根"的 symlink/junction。
 * 覆盖：scripts（执行/导入）、tools、spec/tasks/workspace/config/workflow（hook 读取的数据面）、meta 文件。
 * 防：① 执行/导入工程外脚本；② 把工程外内容读入注入上下文；③ 备份(cpSync)把工程外内容拷进备份。
 * 必须先 lstat 当前路径再决定是否 readdir，否则目录自身是 junction 时 readdir 会跟随到工程外。
 * .auto-embedded 根自身的越界由 runtimeRootEscapes 负责；这里只遍历其内容。
 */
export function runtimeTreeEscapes(target: string): boolean {
  const ae = path.join(target, RUNTIME_DIR);
  let aeReal: string;
  try {
    aeReal = fs.realpathSync(ae);
  } catch {
    return false; // .auto-embedded 不存在（如全新 init）
  }
  const within = (real: string) => real === aeReal || real.startsWith(aeReal + path.sep);
  const escapes = (abs: string): boolean => {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch {
      return false;
    }
    if (st.isSymbolicLink()) {
      try {
        return !within(fs.realpathSync(abs)); // 越界=不安全；指向 .auto-embedded 内放行
      } catch {
        return true; // 悬空/不可解析 → 保守判不安全
      }
    }
    if (st.isDirectory()) {
      let names: string[];
      try {
        names = fs.readdirSync(abs);
      } catch {
        return false;
      }
      for (const name of names) {
        if (escapes(path.join(abs, name))) return true;
      }
    }
    return false;
  };
  let names: string[];
  try {
    names = fs.readdirSync(ae);
  } catch {
    return false;
  }
  for (const name of names) {
    if (escapes(path.join(ae, name))) return true;
  }
  return false;
}

/** 统一运行时安全闸：运行时根越界 / 元数据文件 symlink / .auto-embedded 树内任一越界 symlink → true（命令应拒绝）。 */
export function runtimeUnsafe(target: string): boolean {
  return runtimeRootEscapes(target) || runtimeMetaEscapes(target) || runtimeTreeEscapes(target);
}

/** 待执行脚本的真实路径是否仍在 .auto-embedded 真实根内（防脚本文件自身是越界 symlink 导致执行工程外脚本）。 */
export function runtimeScriptSafe(target: string, scriptAbs: string): boolean {
  try {
    const runtimeReal = fs.realpathSync(path.join(target, RUNTIME_DIR));
    const real = fs.realpathSync(scriptAbs);
    return real === runtimeReal || real.startsWith(runtimeReal + path.sep);
  } catch {
    return false;
  }
}

/** 把 .auto-embedded/ 备份到同级 .auto-embedded.bak.N，返回备份路径。运行时根/树内任一越界则抛错（防 cpSync 跟随 junction 拷工程外内容）。 */
export function backupRuntime(target: string): string {
  if (runtimeRootEscapes(target) || runtimeTreeEscapes(target)) {
    throw new Error(
      ".auto-embedded 根或其内部存在指向工程外的符号链接/junction，拒绝备份以防 cpSync 拷贝工程外内容",
    );
  }
  const src = path.join(target, RUNTIME_DIR);
  let n = 1;
  while (fs.existsSync(path.join(target, `${RUNTIME_DIR}.bak.${n}`))) n++;
  const dst = path.join(target, `${RUNTIME_DIR}.bak.${n}`);
  fs.cpSync(src, dst, { recursive: true });
  return dst;
}

/** 递归删空目录（bottom-up）。用 lstat 不跟随 symlink：目录若是符号链接则跳过，防遍历/删到工程外。 */
function removeEmptyDirs(abs: string): void {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(abs);
  } catch {
    return;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return; // 不跟随目录 symlink
  for (const name of fs.readdirSync(abs)) removeEmptyDirs(path.join(abs, name));
  try {
    if (fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
  } catch {
    /* 忽略权限/竞态 */
  }
}

/** 卸载后清理各平台 managed 目录里残留的空目录（含空的 managed 根 + 因此变空的中间层，如 .github/.windsurf/.agents）。 */
export function cleanupManagedDirs(target: string, platforms: AITool[]): void {
  const dirs = new Set<string>();
  for (const id of platforms) {
    for (const d of getManagedPaths(id)) {
      dirs.add(d);
      // 加入祖先目录（.github/copilot → .github），以便清掉空的中间层（removeEmptyDirs 只删空目录，安全）
      const segs = d.split("/");
      for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join("/"));
    }
  }
  for (const d of [...dirs].filter(Boolean).sort((a, b) => b.split("/").length - a.split("/").length)) {
    removeEmptyDirs(path.join(target, d));
  }
}
