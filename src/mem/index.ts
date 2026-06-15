/**
 * aemb mem 引擎对外桶（barrel）：跨会话记忆检索的公开 API + 类型。
 * 纯本地读取 ~/.claude 与 ~/.codex，零依赖、不建索引、不上传。
 */

export {
  listMemSessions,
  searchMemSessions,
  extractMemDialogue,
  MemSessionNotFoundError,
} from "./sessions";
export { readMemContext } from "./context";
export { listMemProjects } from "./projects";
export type {
  MemFilter,
  MemPhase,
  MemSessionInfo,
  MemSourceFilter,
  MemSourceKind,
  MemSearchResult,
  MemContextResult,
  MemExtractResult,
  MemProjectSummary,
} from "./types";
