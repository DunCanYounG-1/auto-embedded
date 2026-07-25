/**
 * 内容包（content packs）分类映射 —— profile 感知装配的单一事实源（CLI 侧，不装进工程）。
 *
 * 目的：让 `aemb init` 按工程 profile（芯片/架构/OS/构建系统）只落盘相关内容，去臃肿。
 *
 * 设计：
 *  - 每个"可安装单元"（一篇 ref / 一个 mode / 一个 tool-skill / tools 下松散脚本）归到**恰好一个** pack。
 *  - `core` 永远装（RIPER 引擎、通用规范、两个 index.md、通用操作技能…）。
 *  - 未在任何 pack 显式登记的单元 ⇒ classify 回退到 `core`（运行时**绝不静默丢**）；
 *    完备性由 packs.selftest.ts 兜底：磁盘上出现未登记文件 → 硬失败，逼贡献者归类。
 *  - refs/modes 现在无 frontmatter、raw 拷贝，故分类放这份中心映射而非逐文件 frontmatter：
 *    单一可评审文件、改 0 安装字节、逻辑（chip 正则→pack、轴回退）集中一处。
 */
import type { Hits } from "../utils/chip-detect";

export type UnitKind = "ref" | "mode" | "toolskill" | "runtime";

export interface Unit {
  kind: UnitKind;
  /** ref/mode: 去 .md 的文件名（或 refs 子目录名）；toolskill: skill 名；runtime: tools 下松散文件名或 "shared"。 */
  id: string;
}

export interface PackDef {
  /** true = 领域包，默认不装，需 `aemb add` 显式启用。 */
  optIn: boolean;
  refs?: string[];
  modes?: string[];
  toolskills?: string[];
  runtime?: string[];
}

/**
 * pack 目录。key = PackId。
 * 命名：`core` / `chip:<x>` / `os:<x>` / `build:<x>` / `probe:<x>` / `rtos-debug` / 领域名 / `bus:<x>`。
 */
export const CATALOG: Record<string, PackDef> = {
  // ── 永远安装 ────────────────────────────────────────────────
  core: {
    optIn: false,
    refs: [
      "arch-gate",
      "checklist-mechanism",
      "checklist-templates",
      "cli-command-framework",
      "coding-standards",
      "companion-skills",
      "contracts",
      "driver-porting",
      "embedded-architecture",
      "embed-libs-index",
      "failure-taxonomy",
      "git-snapshot",
      "hooks-design",
      "index", // refs/index.md —— spec 层注册 + check.py 校验，强制核心
      "mcp-tools",
      "pin-planning",
      "platform-compatibility",
      "platform-migration",
      "realtime-scheduling-isr-dma", // 广泛适用 + 被 rtos-rtthread 模式引用，留核心避免悬空
      "riper5-protocol",
      "riper5-stages",
      "shared-contracts",
      "shared-failure-taxonomy",
      "shared-platform-compatibility",
      "static-analysis-pipeline",
      "systematic-debugging",
      "task-template",
      "tool-routing",
      "troubleshooting",
      "vibe-workflow",
    ],
    modes: ["datasheet-lookup", "index", "mcp-healthcheck", "netlist-lookup", "workflow-orchestration"],
    toolskills: ["serial-monitor", "static-analysis", "memory-analysis", "peripheral-driver", "zhihu-search"],
    // tools 下松散脚本 + shared 公共件：始终装（可能被引用，去臃肿收益极小、误删风险高）
    runtime: [
      "shared",
      "competition-workflow.js",
      "competition-workflow.test.js",
      "export_gains_to_c.py",
      "include-graph.py",
      "vibe-workflow.js",
    ],
  },

  // ── 芯片/厂商包（命中 chip 装） ──────────────────────────────
  "chip:stm32": { optIn: false, refs: ["stm32-hal-api", "stm32-stdperiph-api", "stm32-hal"] },
  "chip:gd32": { optIn: false, refs: ["gd32f4xx-api"], modes: ["gd32-board"] },
  "chip:mspm0": { optIn: false, refs: ["mspm0g3507-seekfree-api"], modes: ["mspm0-board", "seekfree-lib"] },

  // ── OS 包（命中 rtos 装） ────────────────────────────────────
  "os:rt-thread": { optIn: false, modes: ["rtos-rtthread"] },

  // ── 构建系统 → 操作技能 ─────────────────────────────────────
  "build:cmake": { optIn: false, toolskills: ["build-cmake"] },
  "build:platformio": { optIn: false, toolskills: ["build-platformio", "flash-platformio", "debug-platformio"] },
  "build:idf": { optIn: false, toolskills: ["build-idf", "flash-idf"] },
  "build:keil": { optIn: false, toolskills: ["build-keil", "flash-keil"] },
  "build:iar": { optIn: false, toolskills: ["build-iar"] },
  "build:makefile": { optIn: false, toolskills: ["build-makefile"] },
  "build:scons": { optIn: false, toolskills: ["build-scons"] },

  // ── 探针 → 烧录/调试技能 ────────────────────────────────────
  "probe:openocd": { optIn: false, toolskills: ["flash-openocd", "debug-gdb-openocd"] },
  "probe:jlink": { optIn: false, toolskills: ["flash-jlink", "debug-jlink"] },

  // ── 任一 RTOS 启用 ──────────────────────────────────────────
  "rtos-debug": { optIn: false, toolskills: ["rtos-debug"] },

  // ── 领域包（默认 OFF，opt-in） ──────────────────────────────
  matlab: {
    optIn: true,
    refs: [
      "lqr-example-bicycle-cornell",
      "lqr-example-segway",
      "matlab-example-dds-signal-gen",
      "matlab-example-iir-filter",
      "matlab-example-modem-am",
      "matlab-example-serial-plot",
      "matlab-example-step-id",
      "matlab-example-thd-meter",
      "matlab-hello-5min",
    ],
    modes: ["matlab-embedded-toolkit", "matlab-firmware-pipeline", "matlab-toolkit-competition"],
  },
  competition: {
    optIn: true,
    refs: [
      "competition-ai-max-workflow",
      "competition-index",
      "competition-quickstart-1page",
      "competition-scoring-checklist-template",
      "competition-task-router",
      "example-siemens-cimc-2025",
    ],
    modes: ["competition", "industrial-data-acquisition"],
  },
  control: {
    optIn: true,
    refs: [
      "attitude-estimation-sota",
      "attitude-init-single-frame",
      "balance-car-cascade-control",
      "case-dcar-control-defects",
      "chassis-kinematics",
      "comms-protocol-bus-reliability",
      "control-loop-sign-debug",
      "control-safety-limits",
      "foc-calibration-checklist",
      "foc-control-overview",
      "foc-current-loop",
      "foc-sensorless",
      "foc-speed-position-loop",
      "gimbal-control",
      "imu-fusion-filter-selection",
      "imu-gyroscope-checklist",
      "imu-wheel-ekf-fusion",
      "line-follow-vision-sensing",
      "mahony-ahrs-reference",
      "motion-profiling-trajectory",
      "motor-drive-simple-actuators",
      "omni-wheel-odometry",
      "path-planning-obstacle-avoidance",
      "path-tracking-pure-pursuit-stanley",
      "pid-control-reference",
      "ranging-localization-sensors",
    ],
  },
  "bus:can": { optIn: true, toolskills: ["can-debug"] },
  "bus:modbus": { optIn: true, toolskills: ["modbus-debug"] },
  "bus:visa": { optIn: true, toolskills: ["visa-debug"] },
};

const LIST_KEY: Record<UnitKind, keyof PackDef> = {
  ref: "refs",
  mode: "modes",
  toolskill: "toolskills",
  runtime: "runtime",
};

/** 归类一个单元到 pack。未显式登记 ⇒ 回退 `core`（运行时不丢；完备性由 selftest 保证）。 */
export function classify(u: Unit): string {
  const key = LIST_KEY[u.kind];
  for (const [pack, def] of Object.entries(CATALOG)) {
    const list = def[key] as string[] | undefined;
    if (list && list.includes(u.id)) return pack;
  }
  return "core";
}

/** 该单元在给定 selection 下是否应安装（core 恒装）。 */
export function isEnabled(u: Unit, sel: Set<string>): boolean {
  const p = classify(u);
  return p === "core" || sel.has(p);
}

/**
 * 由运行时相对路径（POSIX，相对 templates/auto-embedded）算出可安装单元。
 * 只对 refs/ | modes/ | tools/ 前缀返回单元；scripts/ | workflow.md | config.yaml | spec/ 返回 null（不 gate）。
 */
export function unitFromRel(rel: string): Unit | null {
  if (rel.startsWith("refs/")) {
    const rest = rel.slice("refs/".length);
    const seg = rest.split("/")[0];
    // refs 子目录（如 stm32-hal/**）以子目录名为单元 id
    return { kind: "ref", id: rest.includes("/") ? seg : seg.replace(/\.md$/, "") };
  }
  if (rel.startsWith("modes/")) {
    const name = rel.slice("modes/".length).split("/")[0].replace(/\.md$/, "");
    return { kind: "mode", id: name };
  }
  if (rel.startsWith("tools/")) {
    const parts = rel.slice("tools/".length).split("/");
    if (parts.length >= 2) {
      if (parts[0] === "shared") return { kind: "runtime", id: "shared" };
      return { kind: "toolskill", id: parts[0] };
    }
    return { kind: "runtime", id: parts[0] }; // tools/<松散文件>
  }
  return null;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type ProfileMode = "auto" | "full" | "manual";

export interface Profile {
  mode: ProfileMode;
  chips: string[];
  build: string[];
  probe: string[];
  rtos: string[];
  /** 显式启用的 opt-in 领域包（matlab/competition/control/bus:*）。 */
  packs: string[];
}

export function emptyProfile(mode: ProfileMode = "auto"): Profile {
  return { mode, chips: [], build: [], probe: [], rtos: [], packs: [] };
}

const CHIP_PACK: Record<string, string> = { stm32: "chip:stm32", gd32: "chip:gd32", mspm0: "chip:mspm0" };
const BUILD_PACKS = [
  "build:cmake",
  "build:platformio",
  "build:idf",
  "build:keil",
  "build:iar",
  "build:makefile",
  "build:scons",
];
const PROBE_PACKS = ["probe:openocd", "probe:jlink"];

/** chip-detect 的 Hits → Profile（把具体芯片型号规约成芯片家族）。 */
export function profileFromHits(hits: Hits): Profile {
  const p = emptyProfile("auto");
  const chips = new Set<string>();
  const build = new Set<string>();
  const rtos = new Set<string>();

  for (const raw of hits.chip) {
    const u = raw.toUpperCase();
    if (/^STM32/.test(u) || /^AT32/.test(u) || /^APM32/.test(u) || /^HK32/.test(u) || /^N32/.test(u)) chips.add("stm32");
    else if (/^GD32VF/.test(u)) chips.add("riscv");
    else if (/^GD32/.test(u)) chips.add("gd32");
    else if (/^ESP32/.test(u) || /^ESP8266/.test(u)) chips.add("esp");
    else if (/^MSPM0/.test(u) || /^MSP430/.test(u)) chips.add("mspm0");
    else if (/^CH32V/.test(u) || /^BL\d/.test(u) || /^FE310/.test(u) || /^K210/.test(u)) chips.add("riscv");
    else if (/^NRF/.test(u)) chips.add("nrf");
    else if (/^RP20|^RP23/.test(u)) chips.add("rp2040");
    else if (/^RT-?THREAD/.test(u)) rtos.add("rt-thread");
  }
  for (const f of hits.framework) {
    if (f === "ESP-IDF") {
      chips.add("esp");
      build.add("idf");
    } else if (f === "RT-Thread") rtos.add("rt-thread");
    else if (f === "STM32CubeMX") chips.add("stm32");
  }
  for (const b of hits.build) {
    if (b === "CMake") build.add("cmake");
    else if (b === "PlatformIO") build.add("platformio");
    else if (b === "Keil MDK") build.add("keil");
    else if (b === "IAR EWARM") build.add("iar");
    else if (b === "Makefile") build.add("makefile");
  }

  p.chips = [...chips];
  p.build = [...build];
  p.rtos = [...rtos];
  return p;
}

/** true = 探测无任何芯片/框架/构建信号（空工程）→ 调用方应退回全装。 */
export function noSignal(hits: Hits): boolean {
  return !hits.chip.length && !hits.framework.length && !hits.build.length;
}

/** Profile → 启用的 pack 集合（core 恒在）。full=true 或 mode:full ⇒ 全部 pack。 */
export function resolveSelection(p: Profile, opts?: { full?: boolean }): Set<string> {
  const sel = new Set<string>(["core"]);
  if (opts?.full || p.mode === "full") {
    for (const k of Object.keys(CATALOG)) sel.add(k);
    return sel;
  }

  for (const c of p.chips) {
    if (CHIP_PACK[c]) sel.add(CHIP_PACK[c]);
    if (c === "esp") sel.add("build:idf"); // ESP 无专属 refs，但需要 idf 构建/烧录技能
  }

  // 构建轴：有则按需；有芯片但没探到构建系统 → 全装（保证可编）
  if (p.build.length) for (const b of p.build) sel.add(`build:${b}`);
  else if (p.chips.length) for (const bp of BUILD_PACKS) sel.add(bp);

  // 探针轴：有则按需；有芯片/构建但探针未知 → 两种都装（保证可烧/可调）
  if (p.probe.length) for (const pr of p.probe) sel.add(`probe:${pr}`);
  else if (p.chips.length || p.build.length) for (const pp of PROBE_PACKS) sel.add(pp);

  // RTOS
  if (p.rtos.length) sel.add("rtos-debug");
  if (p.rtos.includes("rt-thread")) sel.add("os:rt-thread");

  // opt-in 领域包
  for (const k of p.packs) if (CATALOG[k]) sel.add(k);

  return sel;
}

/** 全部已知 PackId（供 CLI 校验 add/remove 参数、full 展开）。 */
export function allPackIds(): string[] {
  return Object.keys(CATALOG);
}

/** 可被 `aemb add` 启用的 opt-in 领域包 id。 */
export function optInPackIds(): string[] {
  return Object.entries(CATALOG)
    .filter(([, d]) => d.optIn)
    .map(([k]) => k);
}
