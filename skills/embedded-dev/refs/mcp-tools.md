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

## 10. MATLAB MCP（数学副驾 — 8 场景综合工具箱）

**适用**：所有需要 MATLAB 算力的嵌入式开发场景。MathWorks 2025-11 发布的 [MATLAB MCP Core Server](https://github.com/matlab/matlab-mcp-core-server) 已与 Claude Code 原生集成。

**调用**：直接用 Claude Code 内置 MCP 工具（`mcp__matlab__*`）。

### 10.1 四个核心工具

| 工具 | 用途 | 典型场景 |
|---|---|---|
| `mcp__matlab__detect_matlab_toolboxes` | 列出已装 toolbox 与版本 | 流程开始前必跑（决定是否降级） |
| `mcp__matlab__check_matlab_code` | 静态分析 .m 脚本（不执行） | 调用前先检查语法 |
| `mcp__matlab__evaluate_matlab_code` | 执行内联 MATLAB 命令 | 单步计算 / 验证 / 一次性脚本 |
| `mcp__matlab__run_matlab_file` | 执行 .m 文件 | 长脚本 / 仿真 / 多步流程 |
| `mcp__matlab__run_matlab_test_file` | 跑 MATLAB 单元测试 | 验证脚本正确性 |

### 10.2 调用模板

**最简单：单行计算**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    A = [0 1; -1 -0.1];
    B = [0; 1];
    Q = eye(2);
    R = 1;
    K = lqr(A, B, Q, R);
    disp(K);
""")
```

**带数据返回**：MATLAB 端 `disp()` / `fprintf()` 的内容会回到 stdout；矩阵建议先 `save()` 到 .mat / .csv 再用 `tools/export_gains_to_c.py` 转 C 头。

**长流程**：写成 .m 文件后用 `run_matlab_file`，便于版本控制和重跑。

### 10.3 8 大场景速查

| 场景 | 关键函数 | 详细流程 |
|---|---|---|
| 系统辨识 | `iddata` / `tfest` / `ssest` / `procest` | `modes/matlab-embedded-toolkit.md` §2 |
| 滤波器设计 | `butter` / `fir1` / `designfilt` / `tf2sos` | §3 |
| FFT 分析 | `fft` / `pwelch` / `findpeaks` | §4 |
| 控制器设计 | `lqr` / `dlqr` / `place` / `pidtune` | §5 |
| 卡尔曼滤波 | `kalman` / `lqe` / `extendedKalmanFilter` | §6 |
| 电机辨识 | Motor Control Blockset 或手工脚本 | §7 |
| 日志可视化 | `readmatrix` / `plot` / `canDatabase` / `blfread` | §8 |
| 定点化 | `fi()` / Fixed-Point Designer / 查表 | §9 |

### 10.4 工具箱依赖与降级

| Toolbox | 8 场景中哪些必需 | 降级 |
|---|---|---|
| Control System Toolbox | 4, 5 | python-control |
| Signal Processing Toolbox / DSP System Toolbox | 2, 3 | scipy.signal |
| System Identification Toolbox | 1 | python-control / scipy |
| Motor Control Blockset | 6（高级） | 手工辨识脚本 |
| Vehicle Network Toolbox | 7（CAN） | cantools + pandas |
| Fixed-Point Designer | 8（高级） | 手算 Qm.n |

**降级原则**：调用前用 `detect_matlab_toolboxes` 探测，缺失时切换到 Python 等价物，告知用户并继续。

### 10.5 典型失败与处置

| 失败 | failure_category | 处置 |
|---|---|---|
| MATLAB 未启动 | `environment-missing` | 启动 MATLAB，或降级 Python |
| Toolbox 未装 | `environment-missing` | 装 toolbox / 用降级 |
| 输入维度不匹配 | `ambiguous-context` | 回数据准备阶段 |
| 仿真发散 / 模型不稳 | `target-response-abnormal` | 调参或换模型 |
| `.h` 导出失败 | `artifact-missing` | 检查 `tools/export_gains_to_c.py` 输入 |

### 10.6 与 export_gains_to_c.py 的联动

MATLAB 算出来的矩阵 / 系数 → **本 skill 自带导出器**：

```bash
# MATLAB 端先：save('K.mat', 'K');
python "C:\Users\A\.claude\skills\embedded-dev\tools\export_gains_to_c.py" \
    --input K.mat --output app/control/lqr_gains.h \
    --name K_BALANCE --type float --with-cmsis-template
```

支持 `.npy` / `.mat` / 命令行内联三种输入；输出标准 C 头文件（含 CMSIS-DSP 矩阵乘模板）。详见 `tools/export_gains_to_c.py --help`。

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
| **MATLAB MCP** | 数学计算 / 控制器 / 滤波 / FFT / 辨识 | python-control / scipy / numpy |

降级**不**意味着工作流崩；只是体验下降。任何工具不可用时协议主流程仍然能跑。
