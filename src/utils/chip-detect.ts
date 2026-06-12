/**
 * 芯片/框架/构建系统预探测（只读扫工程文件名/扩展名 → 草案，不覆盖 spec）。
 *
 * 嵌入式专属增强：init 时给出"疑似芯片/框架/构建系统"草案，省去人工从零填 hardware spec。
 * 仅作草案（可能误判），由用户确认后并入 hw-lock.yaml / spec。
 */
import * as fs from "fs";
import * as path from "path";

export interface Hits {
  framework: string[];
  chip: string[];
  build: string[];
  evidence: string[];
}

// 芯片族正则（覆盖常见国产/国际 MCU）。
const CHIP_RE =
  /(stm32[a-z]?[0-9]+x*|gd32[a-z0-9]+|esp32(?:-?[a-z0-9]+)?|esp8266|mspm0[a-z0-9]+|msp430[a-z0-9]+|ch32[a-z0-9]+|ch5[0-9]+[a-z0-9]*|at32[a-z0-9]+|apm32[a-z0-9]+|hk32[a-z0-9]+|n32[a-z0-9]+|air[0-9]+|nrf5[0-9]+|nrf9[0-9]+|rp2040|rp2350|fe310|gd32vf[0-9]+|k210|bl[0-9]{3}[a-z0-9]*|rt-?thread|stm8[a-z0-9]+)/i;

const NAME_SIGNALS: Record<string, [keyof Hits, string]> = {
  sdkconfig: ["framework", "ESP-IDF"],
  "platformio.ini": ["build", "PlatformIO"],
  "cmakelists.txt": ["build", "CMake"],
  makefile: ["build", "Makefile"],
  "kconfig.projbuild": ["framework", "ESP-IDF"],
  "rtconfig.h": ["framework", "RT-Thread"],
  "rtconfig.py": ["framework", "RT-Thread"],
};

const EXT_SIGNALS: Record<string, [keyof Hits, string]> = {
  ".uvprojx": ["build", "Keil MDK"],
  ".uvproj": ["build", "Keil MDK"],
  ".ioc": ["framework", "STM32CubeMX"],
  ".eww": ["build", "IAR EWARM"],
  ".ewp": ["build", "IAR EWARM"],
  ".hex": ["build", "固件产物(.hex)"],
};

const SKIP = new Set([
  ".git",
  ".auto-embedded",
  ".claude",
  ".cursor",
  ".codex",
  ".gemini",
  ".opencode",
  ".github",
  ".windsurf",
  "node_modules",
  "build",
  "Debug",
  "Release",
]);

export function detectChip(target: string): Hits {
  const hits: Hits = { framework: [], chip: [], build: [], evidence: [] };
  let count = 0;
  const add = (k: keyof Hits, val: string, ev: string) => {
    if (!(hits[k] as string[]).includes(val)) {
      (hits[k] as string[]).push(val);
      hits.evidence.push(ev);
    }
  };
  const walk = (dir: string): void => {
    if (count > 20000) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (++count > 20000) return;
      const nm = e.name.toLowerCase();
      if (NAME_SIGNALS[nm]) {
        const [k, v] = NAME_SIGNALS[nm];
        add(k, v, `${v} ← ${e.name}`);
      }
      const ext = path.extname(nm);
      if (EXT_SIGNALS[ext]) {
        const [k, v] = EXT_SIGNALS[ext];
        add(k, v, `${v} ← ${e.name}`);
      }
      const m = CHIP_RE.exec(nm);
      if (m) {
        const chip = m[1].toUpperCase();
        add("chip", chip, `${chip} ← ${e.name}`);
      }
    }
  };
  walk(target);
  return hits;
}

/** 构建探测草案内容（仅当有信号）。返回 {rel(POSIX), content} 或 null，由调用方用 symlink-safe 写入。 */
export function buildDetectDraft(hits: Hits): { rel: string; content: string } | null {
  if (!hits.chip.length && !hits.framework.length && !hits.build.length) return null;
  const lines = [
    "# 自动探测结果（草案，待人工确认）",
    "",
    "> 由 `aemb init` 扫描工程文件名/扩展名推断，**可能误判**。",
    "> 确认无误后，请把相关信息手工并入 `index.md` 与 `hw-lock.yaml`，再删除本文件。",
    "",
  ];
  if (hits.chip.length) lines.push(`- 疑似芯片: ${hits.chip.join(", ")}`);
  if (hits.framework.length) lines.push(`- 疑似框架: ${hits.framework.join(", ")}`);
  if (hits.build.length) lines.push(`- 构建系统: ${hits.build.join(", ")}`);
  lines.push("", "## 证据");
  for (const ev of hits.evidence.slice(0, 30)) lines.push(`- ${ev}`);
  return { rel: ".auto-embedded/spec/hardware/_detected.md", content: lines.join("\n") + "\n" };
}
