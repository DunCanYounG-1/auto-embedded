# 仓库维护约定

本文件为本仓库（`embedded-dev` 仓托管的 **auto-embedded** 框架）的维护规范，所有人（含 AI 助手）在修改本仓库时必须遵守。

> 历史背景：本仓库原为上一代 `embedded-dev`（Claude Code 单插件）。现已合并升级为新一代 **auto-embedded**（全平台 aemb CLI 框架），上一代的 RIPER-5 协议、55+ 篇知识库、12 个专项流程与 6 个比赛 subagent 已全量吸收进 `templates/auto-embedded/`（refs/modes）与 `templates/common/agents/`。仓库地址仍为 `github.com/DunCanYounG-1/embedded-dev`，npm/品牌名为 `auto-embedded`。

## 文件位置约定

### `project.yaml` 必须固定在仓库根目录

- **`project.yaml` 永远放在仓库根目录（GitHub 首页），禁止移动到任何子目录。**
- 维护本仓库时，如遇到目录重构、批量移位等操作，**必须显式排除 `project.yaml`**，保持它在根目录不动。
- 若确有充分理由必须移动，需先与仓库所有者确认，不得自行决定。

## 仓库结构（合并后）

- `src/` —— aemb CLI（TypeScript/Node，零运行时依赖）：`cli/` `commands/` `configurators/`（每平台注入接线）`utils/` `types/`。
- `templates/common/` —— 一套内核、全平台交付的共享 body：`commands/` `skills/` `tool-skills/`（22 工具技能）`agents/`（aemb-scout/builder/verifier + 6 比赛 subagent）。
- `templates/auto-embedded/` —— 装进工程的运行时内核：`scripts/`（RIPER 引擎）`spec/` `workflow.md` `tools/`（22 工具脚本）`refs/`（55+ 篇知识库）`modes/`（12 专项流程）。
- `templates/<平台>/`、`templates/shared-hooks/` —— 平台私有模板与平台无关 Python hook。
- `SKILL.md`（协议入口）、`INSTALL.md`（安装）、`README.md`（介绍）。

## 通用原则

- 移动/重命名文件一律用 `git mv` 保留历史，不要先删后建。
- 移动文件前，先全仓搜索是否有别处引用其旧路径（`Grep` 旧路径字符串），避免引用断裂。
- 改动 `src/configurators/` 或 `templates/` 后，跑 `npm run build && bash tests/test-auto-embedded.sh` 回归（7 平台脚手架/doctor/幂等/内核/工具脚本/refs+modes 装入/注入/卸载全链路）。
- 新增工具技能：在 `templates/common/tool-skills/` 加带 frontmatter 的 `.md` + 在 `templates/auto-embedded/tools/<x>/` 放脚本；自测计数断言（技能数/脚本数）同步更新。
- 新增 refs/modes：直接放进 `templates/auto-embedded/refs|modes/`（`workflow.ts` 已按前缀 dir-walk 装入），并在对应 `index.md` 登记。
