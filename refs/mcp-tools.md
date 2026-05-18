# MCP / 外部工具调用细则

> 本文讲**怎么调用**每个工具（命令模板、关键参数、降级）。**何时用哪个工具**见 `refs/tool-routing.md`。两个文件不重复。

---

## 1. grok-search（联网检索 CLI）

**本地 Python 脚本**，不是 MCP 服务器。通过 Bash 调用：

```bash
# 基本搜索
python ~/.claude/skills/grok-search/scripts/grok_search.py --query "<检索词>"

# 指定模型 / 端点
python ~/.claude/skills/grok-search/scripts/grok_search.py \
  --query "..." --model grok-4.20-expert --timeout-seconds 180
```

**返回字段（stdout 单行 JSON）**：
- `ok` — 布尔
- `content` — 模型归纳答案（解析失败时为空字符串）
- `sources` — URL 列表（`{url, title, snippet}`，可能字段空）
- `raw` — **content 解析失败时务必读 raw**（原始文本）

**默认配置**：`~/.claude/skills/grok-search/config.json`（含 `base_url` / `api_key` / `model` / `timeout_seconds` / `extra_body`）。可用 `extra_body: {"stream": true}` 启用网关 web_search。

**降级**：未装 / 503 / 网络故障 → 直接用 Claude 内置 WebSearch / WebFetch，不强求先失败一次。

**典型查询模板**：
- `<芯片型号> pinout datasheet GPIO alternate functions site:官网`
- `<外设/库名> driver StdPeriph/HAL site:github.com`
- `<错误信息原文> site:github.com OR site:eevblog.com`

---

## 2. Context7 MCP（库 API 即时文档）

**适用**：固件库 API 速查（HAL / StdPeriph / ESP-IDF / FreeRTOS / Arduino / CMSIS 等）。

**调用**：直接用 Claude Code 内置 MCP 工具（`mcp__context7__*`）。

**优先级**：本地 `refs/*-api.md` → Context7 → grok-search。

---

## 3. Document Skills（PDF / DOCX / XLSX / PPTX）

| Skill | 触发 | 嵌入式典型用途 |
|---|---|---|
| `/pdf` | 处理 PDF | 数据手册寄存器表、引脚图、电气参数、时序图 |
| `/xlsx` | 处理 Excel | 引脚映射表、BOM、测试数据 |
| `/docx` | 处理 Word | 技术规格文档 |
| `/pptx` | 处理 PPT | 答辩 / 方案演示 |

**降级**：未装 → Claude 内置 Read 工具（支持 PDF ≤ 20 页/次）。

**系统依赖（按需）**：`poppler`（PDF 必装）、`tesseract`（OCR）、`pandoc`、`libreoffice`、`qpdf`。

---

## 4. Sequential Thinking MCP（结构化推理）

**适用**：架构设计、引脚冲突分析、DMA 通道分配、中断优先级排布、HardFault 根因链 — 任何**需要逐步推理 + 假设验证 + 分支比较**的复杂决策。

**调用**：Claude Code 内置 MCP 工具直接用。

---

## 5. agent-browser（网页交互，按需）

仅当**任务真实发生在网页**（在线 pinout / 厂商配置工具 / 后台抓取等）才用。

**核心纪律**（来自 `agent-browser` skill 文档）：
- 先 `agent-browser skills get agent-browser` 看当前版本
- 流程：`open → snapshot → 解析 refs → 动作 → 页面变化后重新 snapshot`
- **禁止**复用旧 refs（页面变化后必须重采样）
- 涉及登录态用独立 `session-name`，结束 `close`
- 不可用 / 太动态 → 降级 `/playwright-skill`
- 只读静态网页文本 → 优先 `WebFetch`，别启浏览器

---

## 6. gh CLI（GitHub）

```bash
gh search repos "STM32F103 SSD1306 driver"             # 搜仓库
gh api repos/owner/repo/contents/path                  # 读仓库文件
gh api repos/zhengnianli/EmbedSummary/readme           # 查 EmbedSummary 索引
gh repo clone owner/repo                               # clone 评估
```

需先 `gh auth login`。

---

## 7. Embedded Debugger / Serial MCP（按需）

仅硬件联调时可用。具体调用方式由该 MCP 提供方文档定义。

---

## 8. 外部 skill 方法论借鉴（不默认调用）

| skill | 借鉴时机 | 关键纪律 |
|---|---|---|
| `find-skills` | 引入非固件核心能力前先调研 | 看 leaderboard / 安装量 / 来源信誉；低安装量低信誉的不直接入主协议 |
| `summarize` | 长 PDF / 长网页 / 视频转写 | 先压缩成"结论 / 证据 / 待确认"再决策，**禁止**把原文塞主上下文 |
| `/simplify` | REVIEW 代码整理 | 小步重构、行为保持、一次只改一件事 |

---

## 9. 工具降级总表

| 主工具 | 主用途 | 缺失/失败时降级到 |
|---|---|---|
| grok-search | 联网检索 | Claude WebSearch / WebFetch |
| Context7 | 库 API 文档 | 本地 refs → grok-search |
| Document Skills | PDF/DOCX/XLSX/PPTX | Claude Read（仅 PDF ≤ 20 页） |
| Sequential Thinking | 结构化推理 | 手动 step-by-step + WebSearch |
| agent-browser | 网页交互 | `/playwright-skill` / `WebFetch`（静态文本） |
| gh CLI | GitHub | grok-search `site:github.com` |
| Embedded Debugger | 硬件联调 | 串口日志 / 断言 / 手工烧录 |

降级**不**意味着工作流崩；只是体验下降。任何工具不可用时协议主流程仍然能跑。
