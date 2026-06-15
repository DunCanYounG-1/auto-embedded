import * as path from "path";

/**
 * 包根与模板目录（编译后此文件在 dist/constants/paths.js）。
 * dist/constants → .. = dist → .. = 包根；templates/ 与 dist/ 同级随包发布。
 * 集中在此解析，避免各 importer 因自身目录深度不同而算错相对路径。
 */
export const PKG_ROOT = path.resolve(__dirname, "..", "..");
export const TEMPLATES_DIR = path.join(PKG_ROOT, "templates");

/** 装进工程的运行时根目录名（marker）。 */
export const RUNTIME_DIR = ".auto-embedded";

/** 各类模板子目录。 */
export const TPL = {
  runtime: path.join(TEMPLATES_DIR, "auto-embedded"),
  // workflow 模板变体（native 源自 runtime/workflow.md，其余在此；与 runtime 同级，故不被 getRuntimeManaged 的遍历收入）
  workflows: path.join(TEMPLATES_DIR, "auto-embedded-workflows"),
  commonCommands: path.join(TEMPLATES_DIR, "common", "commands"),
  commonSkills: path.join(TEMPLATES_DIR, "common", "skills"),
  commonToolSkills: path.join(TEMPLATES_DIR, "common", "tool-skills"),
  commonAgents: path.join(TEMPLATES_DIR, "common", "agents"),
  sharedHooks: path.join(TEMPLATES_DIR, "shared-hooks"),
  platform: (id: string) => path.join(TEMPLATES_DIR, id),
};
