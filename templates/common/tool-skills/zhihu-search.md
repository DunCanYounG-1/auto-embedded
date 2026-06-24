---
name: aemb-zhihu-search
description: 当需要在知乎站内检索问答/文章/专栏内容（中文技术资料、工程经验、器件选型与踩坑讨论）并把结构化结果交给下游分析时使用。
---

> **auto-embedded 工具技能**：脚本随框架装在 `.auto-embedded/tools/zhihu-search/`，用 `{{PYTHON_CMD}}` 运行 `.auto-embedded/tools/zhihu-search/scripts/` 下脚本；详细用法见 `.auto-embedded/tools/zhihu-search/references/usage.md`。

# 知乎搜索

## 适用场景

- 需要中文一手工程资料、器件选型讨论、踩坑经验，而英文站点覆盖不足时。
- RIPER 的 RESEARCH 阶段补充中文社区视角，作为 web 搜索的并行来源。
- 需要把检索结果作为结构化 JSON 喂给后续 skill / subagent，而不是人工复制粘贴。

## 必要输入

- 一个 JSON 参数：`{"query":"检索词","count":5}`。`query` 必填且非空，`count` 可选（自动夹到 1-10）。
- 鉴权：环境变量 `ZHIHU_ACCESS_SECRET`（知乎开放平台[个人中心](https://developer.zhihu.com/profile)获取的 Access Secret）。

## 鉴权模型

- 知乎开放平台用 **Bearer Access Secret + 时间戳头**，不是 OAuth：脚本以 `Authorization: Bearer <secret>` 加 `X-Request-Timestamp`（秒级 Unix 时间戳）调用 `GET /api/v1/content/zhihu_search`。
- **Access Secret 绝不写进模板或代码**，只从环境变量 / `Project Profile` 读取。
- 可选覆盖：`ZHIHU_OPENAPI_BASE_URL`（默认 `https://developer.zhihu.com`）、`ZHIHU_ZHIHU_SEARCH_URL`（完整 endpoint 覆盖，用于预发/代理/网关）。

## 执行步骤

1. 先阅读 [references/usage.md](.auto-embedded/tools/zhihu-search/references/usage.md)，确认本次检索词与条数。
2. 确认 `ZHIHU_ACCESS_SECRET` 已在环境中；若缺失，先提示用户配置而不是静默失败。
3. 运行自带脚本 [scripts/zhihu_search.py](.auto-embedded/tools/zhihu-search/scripts/zhihu_search.py)，传入 JSON 参数，例如 `{{PYTHON_CMD}} .auto-embedded/tools/zhihu-search/scripts/zhihu_search.py '{"query":"STM32 HAL 串口DMA 空闲中断","count":5}'`。
4. 读取脚本输出的结构化结果（`title`/`summary`/`url`/`author_name`/`vote_up_count`/`comment_count`/`edit_time`），整理成简洁要点，而不是原样转贴整段 JSON。
5. 把有价值的结论 / 链接写回 `Project Profile` 或交给下游 skill。

## 失败分流

脚本在错误 JSON 里给出 `triage` 字段，便于自动分流：

- `environment-missing`：未设置 `ZHIHU_ACCESS_SECRET`，或运行环境无法发起 HTTPS 请求。
- `auth-failure`：鉴权被拒（HTTP 401/403），密钥失效或无权限。
- `rate-limited`：触发频控（HTTP 429），提示退避后重试。
- `network-failure`：超时、连接失败或返回非 JSON。
- `ambiguous-context`：缺少 `query` 或入参 JSON 非法，需要补全后重试。
- 接口正常但无结果时 `code=0` 且 `items` 为空数组，由调用方决定是否换关键词重试。

## 平台说明

- 脚本仅依赖 Python 标准库（`urllib`），不引入第三方依赖，跨平台一致。
- 脚本开头强制 UTF-8 stdout，规避 Windows 默认 GBK 在重定向/管道时对中文字符的 `UnicodeEncodeError`。

## 输出约定

- 输出查询词、命中条数，以及每条结果的标题/链接/摘要/作者/赞同数的精简列表。
- 当检索用于某个具体技术决策时，把关键链接和结论用 `Project Profile` 记录，便于后续追溯。
- 中文社区结论往往带主观性，转述时标注来源链接，便于人工复核。

## 交接关系

- 当检索结果指向需要深入多源核实的问题时，交给 `deep-research` 做交叉验证。
- 当结论涉及具体器件 / 寄存器 / 时序时，交给对应的 `aemb-peripheral-driver` 等工具落地。
