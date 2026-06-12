/**
 * AI 平台注册表（数据单一事实源，对标 Trellis 的 types/ai-tools.ts）。
 *
 * auto-embedded 的"全平台"= 把 RIPER-5 + spec 注入装进多种 AI 编码工具。每个平台的
 * 注入机制不同（Claude=settings.json hooks / Cursor=hooks.json / Codex=config.toml+hooks.json /
 * OpenCode=JS 插件 / Copilot=hooks.json+prompts / Gemini=settings.json / Windsurf=无 hook 纯 workflow）。
 *
 * 新增/启用一个平台需要：
 *   1) 在 AEMB_TOOLS 加一条（数据）
 *   2) 写 src/configurators/<平台>.ts（行为）并在 configurators/index.ts 的 PLATFORM_FUNCTIONS 注册
 *   3) 准备 templates/<平台>/（平台私有模板：settings/hooks-config 等）
 *   4) 在 src/cli/index.ts 暴露 --<flag>
 */
export type AITool =
  // —— 核心 7（已打通）——
  | "claude"
  | "cursor"
  | "codex"
  | "opencode"
  | "copilot"
  | "gemini"
  | "windsurf"
  // —— 预留 7（注册位 + TODO，configurator 暂未实现）——
  | "kilo"
  | "kiro"
  | "antigravity"
  | "qoder"
  | "codebuddy"
  | "droid"
  | "pi";

/** CLI flag（--claude/--cursor/...），与 AITool 一一对应（这里直接复用同名）。 */
export type CliFlag = AITool;

/**
 * 模板占位符解析上下文（每平台一份）。控制同一份 common 模板渲染成各平台正确的措辞/语法。
 * 占位符见 configurators/shared.ts：
 *   {{CMD_REF:name}}  → cmdRefPrefix + name （如 /aemb:continue、$aemb-continue）
 *   {{CLI_FLAG}}      → cliFlag
 *   {{EXECUTOR_AI}} / {{USER_ACTION_LABEL}}
 *   {{#AGENT_CAPABLE}}..{{/AGENT_CAPABLE}} / {{^..}}  （是否能派子 Agent）
 *   {{#HAS_HOOKS}}..{{/HAS_HOOKS}} / {{^..}}          （是否有 hook 自动注入）
 */
export interface TemplateContext {
  /**
   * 交叉引用其它命令/技能的前缀（含 aemb 命名空间，prefix+base 即可调用形式）：
   * Claude/Gemini `/aemb:`、Cursor/Windsurf/Copilot `/aemb-`、Codex/Qoder/Kiro `$aemb-`。
   * 例：{{CMD_REF:continue}} → /aemb:continue 或 $aemb-continue。
   */
  cmdRefPrefix: "/aemb:" | "/aemb-" | "$aemb-";
  /** 角色表里"AI 执行方"的描述措辞。 */
  executorAI:
    | "Bash 脚本或 Task 调用"
    | "Bash 脚本或工具调用"
    | "Bash 脚本或文件读取";
  /** 用户可主动触发动作的称呼。 */
  userActionLabel: "斜杠命令" | "技能(Skills)" | "工作流(Workflows)" | "提示(Prompts)";
  /** 是否支持派发隔离上下文的子 Agent（Scout/Builder/Verifier）。 */
  agentCapable: boolean;
  /** 是否有 hook 系统能在会话/每轮/派子 Agent 时自动注入（false=靠 pull / 命令）。 */
  hasHooks: boolean;
  /** 本平台 CLI flag，替换进模板的 {{CLI_FLAG}}。 */
  cliFlag: CliFlag;
}

/** 注入分级（决定 hook 接线 + 子 Agent 上下文获取方式）。 */
export type InjectClass =
  /** class-1：hook 能改主会话 + 子 Agent 提示（push）。Claude/Cursor/Gemini。 */
  | "push"
  /** class-2：hook 只能改主会话，子 Agent 靠 prelude 自取（pull）。Codex/Copilot。 */
  | "pull"
  /** class-3：无 hook、无子 Agent，纯命令/工作流。Windsurf 等。 */
  | "command";

export interface AIToolConfig {
  /** 展示名。 */
  name: string;
  /** 工程根下的主配置目录（如 ".claude"）。 */
  configDir: string;
  /** 除 configDir 外还需纳管的路径（卸载/备份时一并处理）。 */
  extraManagedPaths?: string[];
  /** 是否使用 `.agents/skills/` 开放标准技能层（Codex/Gemini 等共享）。 */
  supportsAgentSkills?: boolean;
  /** CLI flag。 */
  cliFlag: CliFlag;
  /** 交互式 init 默认勾选。 */
  defaultChecked: boolean;
  /** 是否用 Python hook（Windows 编码/解释器探测相关）。 */
  hasPythonHooks: boolean;
  /** 注入分级。 */
  injectClass: InjectClass;
  /** 占位符解析上下文。 */
  templateContext: TemplateContext;
  /**
   * 实现状态：
   *   "stable"   —— configurator 已实现并验证（核心 7）。
   *   "reserved" —— 仅注册位，configurator 未实现；init 会拒绝并提示（预留 7）。
   */
  status: "stable" | "reserved";
}

export const AEMB_TOOLS: Record<AITool, AIToolConfig> = {
  // ===================== 核心 7（stable）=====================
  claude: {
    name: "Claude Code",
    configDir: ".claude",
    cliFlag: "claude",
    defaultChecked: true,
    hasPythonHooks: true,
    injectClass: "push",
    status: "stable",
    templateContext: {
      cmdRefPrefix: "/aemb:",
      executorAI: "Bash 脚本或 Task 调用",
      userActionLabel: "斜杠命令",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "claude",
    },
  },
  cursor: {
    name: "Cursor",
    configDir: ".cursor",
    cliFlag: "cursor",
    defaultChecked: false,
    hasPythonHooks: true,
    injectClass: "push",
    status: "stable",
    templateContext: {
      cmdRefPrefix: "/aemb-",
      executorAI: "Bash 脚本或 Task 调用",
      userActionLabel: "斜杠命令",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "cursor",
    },
  },
  codex: {
    name: "Codex（同时写 .agents/skills/，可被 Cursor/Gemini CLI/Copilot 等读取）",
    configDir: ".codex",
    supportsAgentSkills: true,
    cliFlag: "codex",
    defaultChecked: false,
    hasPythonHooks: true,
    injectClass: "pull",
    status: "stable",
    templateContext: {
      cmdRefPrefix: "$aemb-",
      executorAI: "Bash 脚本或工具调用",
      userActionLabel: "技能(Skills)",
      agentCapable: true,
      hasHooks: false, // SessionStart/PreToolUse 对子 Agent 不可靠 → pull
      cliFlag: "codex",
    },
  },
  opencode: {
    name: "OpenCode",
    configDir: ".opencode",
    cliFlag: "opencode",
    defaultChecked: false,
    hasPythonHooks: false, // 用 JS 插件，不用 Python hook
    injectClass: "push",
    status: "stable",
    templateContext: {
      cmdRefPrefix: "/aemb:",
      executorAI: "Bash 脚本或 Task 调用",
      userActionLabel: "斜杠命令",
      agentCapable: true,
      hasHooks: true, // 通过 JS 插件实现 hook 能力
      cliFlag: "opencode",
    },
  },
  copilot: {
    name: "GitHub Copilot",
    configDir: ".github/copilot",
    extraManagedPaths: [
      ".github/agents",
      ".github/hooks",
      ".github/prompts",
      ".github/skills",
    ],
    cliFlag: "copilot",
    defaultChecked: false,
    hasPythonHooks: true,
    injectClass: "pull",
    status: "stable",
    templateContext: {
      cmdRefPrefix: "/aemb-",
      executorAI: "Bash 脚本或工具调用",
      userActionLabel: "提示(Prompts)",
      agentCapable: true,
      hasHooks: true, // 主会话有 hook；子 Agent pull
      cliFlag: "copilot",
    },
  },
  gemini: {
    name: "Gemini CLI",
    configDir: ".gemini",
    supportsAgentSkills: true,
    cliFlag: "gemini",
    defaultChecked: false,
    hasPythonHooks: true,
    injectClass: "pull", // 主会话 push，子 Agent pull（与 Trellis 一致）
    status: "stable",
    templateContext: {
      cmdRefPrefix: "/aemb:",
      executorAI: "Bash 脚本或工具调用",
      userActionLabel: "斜杠命令",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "gemini",
    },
  },
  windsurf: {
    name: "Windsurf",
    configDir: ".windsurf/workflows",
    extraManagedPaths: [".windsurf/skills"],
    cliFlag: "windsurf",
    defaultChecked: false,
    hasPythonHooks: false,
    injectClass: "command",
    status: "stable",
    templateContext: {
      cmdRefPrefix: "/aemb-",
      executorAI: "Bash 脚本或文件读取",
      userActionLabel: "工作流(Workflows)",
      agentCapable: false,
      hasHooks: false,
      cliFlag: "windsurf",
    },
  },

  // ===================== 预留 7（reserved）=====================
  // 注册位已就绪：configDir/上下文已填好，configurator 待实现。
  // init 选到 reserved 平台会明确拒绝并提示（见 commands/init.ts）。
  kilo: {
    name: "Kilo CLI",
    configDir: ".kilocode",
    cliFlag: "kilo",
    defaultChecked: false,
    hasPythonHooks: false,
    injectClass: "command",
    status: "reserved",
    templateContext: {
      cmdRefPrefix: "/aemb:",
      executorAI: "Bash 脚本或文件读取",
      userActionLabel: "工作流(Workflows)",
      agentCapable: false,
      hasHooks: false,
      cliFlag: "kilo",
    },
  },
  kiro: {
    name: "Kiro Code",
    configDir: ".kiro/skills",
    extraManagedPaths: [".kiro/agents", ".kiro/hooks"],
    cliFlag: "kiro",
    defaultChecked: false,
    hasPythonHooks: true,
    injectClass: "push",
    status: "reserved",
    templateContext: {
      cmdRefPrefix: "$aemb-",
      executorAI: "Bash 脚本或工具调用",
      userActionLabel: "技能(Skills)",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "kiro",
    },
  },
  antigravity: {
    name: "Antigravity",
    configDir: ".agent/workflows",
    extraManagedPaths: [".agent/skills"],
    cliFlag: "antigravity",
    defaultChecked: false,
    hasPythonHooks: false,
    injectClass: "command",
    status: "reserved",
    templateContext: {
      cmdRefPrefix: "/aemb-",
      executorAI: "Bash 脚本或文件读取",
      userActionLabel: "工作流(Workflows)",
      agentCapable: false,
      hasHooks: false,
      cliFlag: "antigravity",
    },
  },
  qoder: {
    name: "Qoder",
    configDir: ".qoder",
    cliFlag: "qoder",
    defaultChecked: false,
    hasPythonHooks: true,
    injectClass: "pull",
    status: "reserved",
    templateContext: {
      cmdRefPrefix: "$aemb-",
      executorAI: "Bash 脚本或工具调用",
      userActionLabel: "技能(Skills)",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "qoder",
    },
  },
  codebuddy: {
    name: "CodeBuddy",
    configDir: ".codebuddy",
    cliFlag: "codebuddy",
    defaultChecked: false,
    hasPythonHooks: true,
    injectClass: "push",
    status: "reserved",
    templateContext: {
      cmdRefPrefix: "/aemb:",
      executorAI: "Bash 脚本或 Task 调用",
      userActionLabel: "斜杠命令",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "codebuddy",
    },
  },
  droid: {
    name: "Factory Droid",
    configDir: ".factory",
    cliFlag: "droid",
    defaultChecked: false,
    hasPythonHooks: true,
    injectClass: "push",
    status: "reserved",
    templateContext: {
      cmdRefPrefix: "/aemb-",
      executorAI: "Bash 脚本或 Task 调用",
      userActionLabel: "斜杠命令",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "droid",
    },
  },
  pi: {
    name: "Pi Agent",
    configDir: ".pi",
    cliFlag: "pi",
    defaultChecked: false,
    hasPythonHooks: false,
    injectClass: "push",
    status: "reserved",
    templateContext: {
      cmdRefPrefix: "/aemb-",
      executorAI: "Bash 脚本或工具调用",
      userActionLabel: "斜杠命令",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "pi",
    },
  },
};

/** 全部平台 id。 */
export const ALL_TOOLS = Object.keys(AEMB_TOOLS) as AITool[];

/** 已打通的核心平台。 */
export const STABLE_TOOLS = ALL_TOOLS.filter(
  (id) => AEMB_TOOLS[id].status === "stable",
);

/** 预留平台。 */
export const RESERVED_TOOLS = ALL_TOOLS.filter(
  (id) => AEMB_TOOLS[id].status === "reserved",
);

/** 某平台被纳管（卸载/备份）的全部路径：configDir + 可选 .agents/skills + extraManagedPaths。 */
export function getManagedPaths(tool: AITool): string[] {
  const c = AEMB_TOOLS[tool];
  const paths = [c.configDir];
  if (c.supportsAgentSkills) paths.push(".agents/skills");
  if (c.extraManagedPaths) paths.push(...c.extraManagedPaths);
  return paths;
}

/** flag → AITool（同名直映；非法返回 undefined）。 */
export function resolveCliFlag(flag: string): AITool | undefined {
  return (ALL_TOOLS as string[]).includes(flag) ? (flag as AITool) : undefined;
}
