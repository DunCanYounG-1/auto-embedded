# 贡献 / 维护指南

本文件是**加内容时的操作清单**。上面那几处漂移（数量声明、逐飞库整表失效、AMetal 死链）全都是
"加东西时漏了一步"造成的——所以每类新增都写成固定几步，照着走一遍就不会漏。

维护约定（文件位置、`git mv`、改动后跑什么）见 [CLAUDE.md](CLAUDE.md)，本文件只讲**新增内容的步骤**。

## 通用前置

```bash
npm install          # 本仓不提交 package-lock.json，用 install 不用 ci
npm run build
```

改完之后必跑：

```bash
bash tests/test-auto-embedded.sh     # 全链路自测，含 parity / 索引 / packs 三段静态校验
npm run check:claims                 # 数量声明一致性
```

## 新增一个工具技能（tool-skill）

1. `templates/common/tool-skills/<名字>.md` —— 带 frontmatter 的 SKILL body（**全平台共用这一份**，
   平台差异靠 `{{CMD_REF:...}}` / `{{#AGENT_CAPABLE}}` 等占位符，别为某个平台单独写一份）
2. `templates/auto-embedded/tools/<名字>/scripts/*.py` —— 实际脚本；公共件放 `tools/shared/`，
   用相对导入（脚手架会重定位，自测第 7 段专门盯这个）
3. `src/content/packs.ts` 的 `CATALOG` —— 归到某个内容包（芯片 / OS / 构建 / 探针 / 领域）或显式进 `core`
4. 自测里的计数断言（第 3 段 `claude 技能数` / `工具脚本数`）同步 +1
5. 文档里的 "N 个工具技能" 同步改 —— `npm run check:claims` 会把所有站点列出来
6. `npm run check:parity` —— 确认 7 个平台都落地了（漏一个就是那个平台的用户永远看不到它）

## 新增一篇知识库（ref）

1. `templates/auto-embedded/refs/<名字>.md`（`workflow.ts` 按前缀 dir-walk 自动装入，不用注册路径）
2. **在 `refs/index.md` 表格里登记**——漏登记＝装进工程了但 AI 永远不会打开它，等于没交付；
   `npm run check:index` 会拦
3. `src/content/packs.ts` 的 `CATALOG` 归类（同上）
4. 引了外部仓库/文档链接的话：`GITHUB_TOKEN=$(gh auth token) npm run check:links`
   —— **知识库里的链接是选型推荐，不是装饰**。上游归档/删号后 AI 还会用"查表干活"的姿态
   把死代码推给用户，比瞎编更可信、危害更大
5. 数量声明是 `80+ 篇` 这种开放形式，实际值超出容差（默认 15）时 `check:claims` 会要求上调

新增**领域包**（`refs/` 下的子目录）时，还要在 `refs/index.md` 的「领域包」段登记该目录。

## 新增一个专项流程（mode）

同 ref，但登记到 `modes/index.md`，数量声明是精确值（`13 个专项流程`），必须同步改。

## 新增一个平台

1. `src/types/ai-tools.ts` 的 `AEMB_TOOLS` 加配置（`configDir` / `injectClass` /
   `templateContext` / `status: "stable"`）
2. `src/configurators/<平台>.ts` 写行为，在 `configurators/index.ts` 的 `CONFIGURATORS` 注册
3. `templates/<平台>/` 放平台私有模板
4. `src/cli/index.ts` 暴露 `--<flag>`
5. **`scripts/check-parity.mjs` 的 `BASELINE` 显式声明每类交付 `full`/`none`**
   —— 不声明会直接硬失败（防止新平台悄悄少装一半东西）
6. 文档里的 "7 平台" 同步改（`check:claims` 会拦）
7. 自测第 3 段的关键文件断言加上该平台

## 校验器一览

| 命令 | 管什么 | 什么时候跑 |
|---|---|---|
| `npm test` | 全链路：7 平台脚手架 / parity / doctor / 幂等 / 注入 / 卸载 / profile gate | 改 `src/` `templates/` `tests/` |
| `npm run check:claims` | 文档数量声明 + `project.yaml` 的 `updated` 日期 | 每次 push/PR（CI） |
| `npm run check:index` | `refs/`·`modes/` 索引双向对齐 | 每次 push/PR（CI） |
| `npm run check:parity` | 7 平台交付矩阵 vs 基线 | 自测第 3b 段 |
| `npm run check:links` | `templates/` 外链死链 / 归档 / 停更 | 每月 1 号（CI cron）+ 手动 |

所有校验器都遵循同一套约定：先出 Markdown 报告再定退出码、阈值走环境变量、
`FAIL_ON_FINDINGS=false` 可临时放行、拿不到外部信息时告警而不是误判。
确实要写与真值不同的数字，在那一行加 `claims-ignore` 豁免。
