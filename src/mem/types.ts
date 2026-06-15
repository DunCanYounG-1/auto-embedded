/**
 * aemb mem 的公开输入/输出类型（对标 Trellis core/mem，仅保留 Claude + Codex）。
 *
 * 只服务"已持久化的 AI 会话检索 + 对话上下文抽取"。纯本地读取 ~/.claude 与 ~/.codex 的会话记录，
 * 不建索引、不上传。OpenCode（1.2+ 转 SQLite，曾因原生依赖装不上而回退）在本端口直接不支持。
 */

export type MemSourceKind = "claude" | "codex";
export type MemSourceFilter = MemSourceKind | "all";
export type MemPhase = "brainstorm" | "implement" | "all";
export type DialogueRole = "user" | "assistant";

export interface DialogueTurn {
  role: DialogueRole;
  text: string;
}

/**
 * 跨命令的会话选择过滤器。字段都可选——platform 缺省 "all"，limit 缺省 50。
 * cwd 把范围限定到某工程目录（含其子目录）；留 undefined 则全局检索。
 */
export interface MemFilter {
  platform?: MemSourceFilter;
  since?: Date;
  until?: Date;
  cwd?: string;
  limit?: number;
}

/** 跨平台统一的会话元数据。JSON 字段名（platform/filePath）保持稳定，供用户可见输出。 */
export interface MemSessionInfo {
  platform: MemSourceKind;
  id: string;
  title?: string;
  cwd?: string;
  created?: string;
  updated?: string;
  filePath: string;
}

export interface SearchExcerpt {
  role: DialogueRole;
  snippet: string;
}

/** 单会话命中：各类计数 + 段落对齐的摘录。 */
export interface SearchHit {
  /** 所有命中轮次里 token 出现总次数。 */
  count: number;
  /** user 轮次出现次数。 */
  userCount: number;
  /** assistant 轮次出现次数。 */
  asstCount: number;
  /** 清洗后对话规模（相关性密度的分母）。 */
  totalTurns: number;
  excerpts: SearchExcerpt[];
}

/** 非致命警告，由调用方决定是否/如何呈现。 */
export interface MemWarning {
  code: string;
  message: string;
}

export interface MemSearchMatch {
  session: MemSessionInfo;
  /** 加权密度相关性分。 */
  score: number;
  hit: SearchHit;
}

export interface MemSearchResult {
  /** 已按 filter.limit 截断的排序命中。 */
  matches: MemSearchMatch[];
  /** 截断前的命中会话总数。 */
  totalMatches: number;
  warnings: MemWarning[];
}

export interface MemContextTurn {
  idx: number;
  role: DialogueRole;
  text: string;
  isHit: boolean;
}

export interface MemContextResult {
  session: MemSessionInfo;
  query?: string;
  totalTurns: number;
  totalHitTurns: number;
  budgetUsed: number;
  maxChars: number;
  turns: MemContextTurn[];
  warnings: MemWarning[];
}

export interface BrainstormWindow {
  label: string;
  /** 含（inclusive）。 */
  startTurn: number;
  /** 不含（exclusive）。 */
  endTurn: number;
}

export interface MemDialogueGroup {
  label: string | null;
  turns: DialogueTurn[];
}

export interface MemExtractResult {
  session: MemSessionInfo;
  phase: MemPhase;
  windows: BrainstormWindow[];
  /** 底层清洗对话的总轮次（grep 过滤前）。 */
  totalTurns: number;
  /** 每窗一组（phase="all" 时单组、无标签）。 */
  groups: MemDialogueGroup[];
  /** 各组轮次的扁平拼接。 */
  turns: DialogueTurn[];
  warnings: MemWarning[];
}

export interface MemProjectSummary {
  cwd: string;
  last_active: string;
  sessions: number;
  by_platform: Record<MemSourceKind, number>;
}

/**
 * 从一条 Bash/exec 命令里识别出的 aemb 任务生命周期边界信号。
 * RIPER-5 没有 Trellis 的 create+start 两段；aemb 用 `task.py start "<标题>"`（建+激活）作为
 * "进入头脑风暴/RESEARCH" 的起点，用 `task.py phase EXECUTE`（切到实现）作为该窗口的终点。
 */
export type ParsedTaskPyCommand =
  | { action: "start"; titleArg?: string }
  | { action: "execute" };

export interface TaskPyEvent {
  action: "start" | "execute";
  timestamp: string;
  /** 命令运行那一刻清洗后 DialogueTurn[] 的下标。 */
  turnIndex: number;
  title?: string;
}

// ---------- 公开 API 选项袋 ----------

export interface ListMemSessionsOptions {
  filter?: MemFilter;
}

export interface SearchMemSessionsOptions {
  keyword: string;
  filter?: MemFilter;
}

export interface ReadMemContextOptions {
  sessionId: string;
  filter?: MemFilter;
  /** 多 token AND 关键词，用于排序与锚定命中轮次。 */
  grep?: string;
  /** 返回的命中轮次数（缺省 3）。 */
  turns?: number;
  /** 每个命中两侧扩展的上下文轮次数（缺省 1）。 */
  around?: number;
  /** 总字符预算（缺省 6000）。 */
  maxChars?: number;
}

export interface ExtractMemDialogueOptions {
  sessionId: string;
  filter?: MemFilter;
  /** 阶段切片（缺省 "all"）。 */
  phase?: MemPhase;
  /** 阶段切片后再按多 token AND 子串过滤。 */
  grep?: string;
}

export interface ListMemProjectsOptions {
  filter?: MemFilter;
}
