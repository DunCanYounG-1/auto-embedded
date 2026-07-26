## 改了什么

<!-- 一句话说清：加了什么 / 删了什么 / 修了什么 -->

## 影响面

- [ ] `src/`（CLI / configurator / 内容分类）
- [ ] `templates/auto-embedded/`（装进工程的运行时：scripts / spec / tools / refs / modes）
- [ ] `templates/common/`（全平台共享 body：commands / skills / tool-skills / agents）
- [ ] `templates/<平台>/`、`shared-hooks/`（平台私有模板 / Python hook）
- [ ] 仅文档（README / SKILL / INSTALL / docs / CLAUDE）

## 自检

CI 会跑，但本地先过一遍能省一轮往返（详细规则见 [CONTRIBUTING.md](../CONTRIBUTING.md)）：

- [ ] `npm run build && bash tests/test-auto-embedded.sh` 全绿（含 parity / 索引 / packs 三段静态校验）
- [ ] `npm run check:claims` 无漂移 —— 增删 ref·mode·工具技能后，文档里的数量声明同步改了
- [ ] `npm run check:index` 无漂移 —— 新增/改名的 ref·mode 已在对应 `index.md` 登记
- [ ] 新增内容已在 `src/content/packs.ts` 的 `CATALOG` 里归类（否则会默默落进 `core`，profile 精简装失效）
- [ ] 新增 command/skill/tool-skill/agent 是**全平台**交付的（parity 校验会拦，但漏了要回头改 configurator）
- [ ] 引了外部链接的话，`GITHUB_TOKEN=$(gh auth token) npm run check:links` 没新增死链

## 说明

<!-- 评审需要知道的取舍、已知限制、故意没做的部分 -->
