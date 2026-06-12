/**
 * 写"装进工程"的运行时内核（.auto-embedded/）：对标 Trellis 的 createWorkflowStructure。
 *
 *  managed（升级覆盖 + 记 hash）：scripts/**、workflow.md  —— 这是 RIPER-5 引擎，平台无关。
 *  seed（仅缺失时写、不记 hash、属用户内容）：config.yaml、spec/**          —— 项目自有约定，update 不动。
 *
 * 内核源在 templates/auto-embedded/，被原样保留（多平台交付不改内核）。
 */
import * as fs from "fs";
import * as path from "path";
import { TPL, RUNTIME_DIR } from "../constants/paths";
import { walkFiles } from "../utils/fs-walk";
import { toPosix } from "../utils/posix";
import { replacePythonLiterals } from "../utils/python";

function relFromRuntime(abs: string): string {
  return toPosix(path.relative(TPL.runtime, abs));
}

/** managed 运行时文件（相对工程根 POSIX 路径 → 内容）。 */
export function getRuntimeManaged(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of walkFiles(TPL.runtime)) {
    const rel = relFromRuntime(f);
    const raw = fs.readFileSync(f, "utf-8");
    if (rel.startsWith("tools/") || rel.startsWith("refs/") || rel.startsWith("modes/")) {
      // tools/ = 22 个工具 skill 的脚本/shared/references；refs/ = 嵌入式离线知识库；modes/ = 专项流程。
      // 三者均自包含、按需读取，原样装入（不做 python3 字面替换以免误改脚本逻辑或文档内容）。
      out.set(`${RUNTIME_DIR}/${rel}`, raw);
    } else if (rel.startsWith("scripts/") || rel === "workflow.md") {
      // scripts/ = RIPER 引擎；workflow.md = 流程单一事实源（hook 接线相关，做 python3 字面替换）
      out.set(`${RUNTIME_DIR}/${rel}`, replacePythonLiterals(raw));
    }
  }
  return out;
}

/** seed 运行时文件（config.yaml + spec/**），仅缺失时写。 */
export function getRuntimeSeed(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of walkFiles(TPL.runtime)) {
    const rel = relFromRuntime(f);
    if (rel === "config.yaml" || rel.startsWith("spec/")) {
      out.set(`${RUNTIME_DIR}/${rel}`, fs.readFileSync(f, "utf-8"));
    }
  }
  return out;
}
