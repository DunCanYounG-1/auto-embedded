/**
 * Python 命令探测（写进各平台 hook 接线）。
 *
 * Windows 上 `python3` 常是 Microsoft Store 的伪 stub（跑起来弹商店、不真执行），
 * 所以这里**实跑** `-c "print(1)"` 校验，挑第一个真能用的；非 Windows 优先 python3。
 * 探测结果缓存进 resolvedPythonCommand，供模板里 `{{PYTHON_CMD}}` / `python3` 字面替换。
 */
import { spawnSync } from "child_process";

let resolved: string | null = null;

/** 平台默认值（未探测时）：Windows→python，其它→python3。 */
export function pythonDefaultForPlatform(platform?: NodeJS.Platform): string {
  const t = platform ?? process.platform;
  return t === "win32" ? "python" : "python3";
}

/** 实跑探测一个可用的 python 命令；缓存结果。 */
export function detectPython(): string {
  if (resolved) return resolved;
  const cands =
    process.platform === "win32"
      ? ["py", "python", "python3"]
      : ["python3", "python"];
  for (const c of cands) {
    try {
      const r = spawnSync(c, ["-c", "print(1)"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      if (r.status === 0 && r.stdout && r.stdout.trim() === "1") {
        resolved = c;
        return c;
      }
    } catch {
      /* 试下一个 */
    }
  }
  resolved = pythonDefaultForPlatform();
  return resolved;
}

/** 当前解析到的 python 命令（未探测则用平台默认）。 */
export function pythonCmd(): string {
  return resolved ?? pythonDefaultForPlatform();
}

/** 显式设置（测试 / 覆盖用）。 */
export function setPythonCmd(cmd: string): void {
  const t = cmd.trim();
  resolved = t || null;
}

/**
 * 把内容里的字面 `python3` 替换成解析到的命令（跳过 shebang 行）。
 * 解析结果为 python3 时是 no-op；幂等。模板用 python3 作为基准写法。
 */
export function replacePythonLiterals(content: string): string {
  const target = pythonCmd();
  if (target === "python3") return content;
  return content
    .split("\n")
    .map((line) => (line.startsWith("#!") ? line : line.split("python3").join(target)))
    .join("\n");
}
