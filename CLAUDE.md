# 仓库维护约定

本文件为本仓库（`embedded-dev` 仓托管的 **auto-embedded** 框架）的维护规范，所有人（含 AI 助手）在修改本仓库时必须遵守。

> 历史背景：本仓库原为上一代 `embedded-dev`（Claude Code 单插件）。现已合并升级为新一代 **auto-embedded**（全平台 aemb CLI 框架），上一代的 RIPER-5 协议、离线知识库、专项流程与 6 个比赛 subagent 已全量吸收进 `templates/auto-embedded/`（refs/modes）与 `templates/common/agents/`。仓库已更名为 `github.com/DunCanYounG-1/auto-embedded`（与 npm 包名一致；旧地址 embedded-dev 由 GitHub 自动重定向），上一代源码归档在 `auto-embedded-legacy`。

## 文件位置约定

### `project.yaml` 必须固定在仓库根目录

- **`project.yaml` 永远放在仓库根目录（GitHub 首页），禁止移动到任何子目录。**
- 维护本仓库时，如遇到目录重构、批量移位等操作，**必须显式排除 `project.yaml`**，保持它在根目录不动。
- 若确有充分理由必须移动，需先与仓库所有者确认，不得自行决定。

## 仓库结构（合并后）

- `src/` —— aemb CLI（TypeScript/Node，零运行时依赖）：`cli/` `commands/` `configurators/`（每平台注入接线）`utils/` `types/`。
- `templates/common/` —— 一套内核、全平台交付的共享 body：`commands/` `skills/` `tool-skills/`（24 工具技能）`agents/`（aemb-scout/builder/verifier + 6 比赛 subagent）。
- `templates/auto-embedded/` —— 装进工程的运行时内核：`scripts/`（RIPER 引擎）`spec/` `workflow.md` `tools/`（24 工具脚本）`refs/`（80+ 篇知识库）`modes/`（13 专项流程）。
- `templates/<平台>/`、`templates/shared-hooks/` —— 平台私有模板与平台无关 Python hook。
- `SKILL.md`（协议入口）、`INSTALL.md`（安装）、`README.md`（中文主页）/`README_EN.md`（English）、`docs/`（中英详细文档：quick-start/concepts/architecture）。

## 通用原则

- 移动/重命名文件一律用 `git mv` 保留历史，不要先删后建。
- 移动文件前，先全仓搜索是否有别处引用其旧路径（`Grep` 旧路径字符串），避免引用断裂。
- 改动 `src/configurators/` 或 `templates/` 后，跑 `npm run build && bash tests/test-auto-embedded.sh` 回归（7 平台脚手架/doctor/幂等/内核/工具脚本/refs+modes 装入/注入/卸载全链路）。
- **数量声明必须可推导**：新增/删除 ref·mode·工具技能，或改动文档里的"N 个工具技能 / N 个专项流程 / N+ 篇知识库 / N 平台"时，跑 `npm run check:claims`——它从 `templates/` 与 `src/configurators/index.ts` 数出真值，比对 README/README_EN/SKILL/INSTALL/CLAUDE/project.yaml/package.json/docs 里的所有声明，不一致就硬失败。确实要写与真值不同的数字，在该行加 `claims-ignore` 豁免。
- **索引必须双向对齐**：新增/删除/改名 ref·mode 后跑 `npm run check:index`——表格登记与磁盘互为充要（漏登记＝装进工程但 AI 查不到，等于没交付；悬空登记＝AI 拿不存在的路径去读），`refs/` 的子目录还必须在「领域包」段登记。已接进自测第 13b 段。
- **外链是选型推荐，会腐化**：`npm run check:links` 审计 `templates/` 里所有外链（GitHub/Gitee 走 API 查 404/归档/停更）。死链和归档是硬失败——上游没了还留在知识库里，AI 会用"查表"的口气把死代码推给用户。停更只告警（嵌入式库长期不动是常态）。本地跑要给 token：`GITHUB_TOKEN=$(gh auth token) npm run check:links`。
- CI：`static-checks.yml`（每次 push/PR 跑声明 + 索引）、`test.yml`（改 `src/`·`templates/`·`tests/` 时跑全链路自测，ubuntu + windows 双必过）、`link-rot.yml`（每月 1 号跑外链审计，也可手动触发）。
- 新增工具技能：在 `templates/common/tool-skills/` 加带 frontmatter 的 `.md` + 在 `templates/auto-embedded/tools/<x>/` 放脚本；自测计数断言（技能数/脚本数）同步更新。
- 新增 refs/modes：直接放进 `templates/auto-embedded/refs|modes/`（`workflow.ts` 已按前缀 dir-walk 装入），并在对应 `index.md` 登记。
- **内容分类（profile 感知装配）**：每新增一个 ref / mode / 工具技能，必须在 `src/content/packs.ts` 的 `CATALOG` 里归类到某个内容包（芯片/OS/构建/探针/领域）或显式进 `core`；否则 `aemb init` 按 profile 精简装时它会回退默认进 `core`（永远装）。`src/content/packs.selftest.ts` 会遍历磁盘断言"每个交付文件恰好被一个 pack 认领"，漏归类 → `node dist/content/packs.selftest.js` 硬失败。分类逻辑（芯片正则、轴回退）也集中在 `packs.ts`。
