# 工具路由表 + 优先级总表

> SKILL.md 主文件只保留"按需求查表选工具"一句话；本文是完整的"哪个需求用哪个工具"映射 + 工具优先级 + 路由原则 + 优先参考仓库。
>
> 工具的**具体调用方式 / 降级矩阵 / 恢复策略**见 `.auto-embedded/refs/mcp-tools.md`（讲怎么用，本文讲何时用）。

---

## 1. 按需求查表（快速工具索引）

### 1.0 工程内搜代码 / 找文件 / 读文件（任何探索的第一决策）

> 在**已加载的工程目录里**找代码、找文件、读内容时，**一律用专用工具，禁止用 shell（PowerShell/Bash）的 `Select-String` / `Get-ChildItem` / `Get-Content` / `find` / `grep` / `cat` 去做**。专用工具结果接入权限 UI、可点击跳转、且彼此独立不会"连坐取消"。

| 需求 | 用这个 | **禁止** | 说明 |
|---|---|---|---|
| 在工程内**搜文件内容**（符号、函数名、宏、字符串） | **Grep 工具** | PowerShell `Select-String`、Bash `grep/rg`、`findstr` | 全正则；`glob`/`type` 过滤；`output_mode=content` 看行、`files_with_matches` 看文件 |
| 在工程内**按文件名/路径找文件** | **Glob 工具** | PowerShell `Get-ChildItem -Recurse`、Bash `find` | 如 `D:\proj\**\*.{c,h}`、`**\justfloat.{c,h}` |
| **读文件内容**（含逐行看） | **Read 工具** | `Get-Content`、`cat`、`type` | 自带行号；大文件用 `offset`/`limit` 分页 |
| 跨 GitHub 仓库搜代码（联网） | `gh` / grok-search | — | 见 §1.1，这是**联网**场景，与本地工程区分 |

**并行批次纪律（本次"Cancelled: parallel tool call ... errored"的根因，必守）**：

1. **专用工具优先**：探索阶段（摸结构、定位符号、读文件）只用 Glob / Grep / Read。它们稳定、独立，一个失败不影响同批其他调用。
2. **不要把多条易错 shell 命令塞进同一个并行批次**：并行批次里**任意一条**报错（典型：路径不存在、`Get-Content` 找不到文件抛异常），harness 会**连带 `Cancelled` 整批剩余调用**——你会看到一串"errored / Cancelled"，但真正出错的往往只有一条，其余是陪葬，且**根本没执行**。
3. **确需 shell 时单条、串行**：哪条错一目了然，也不连累其他。
4. **先摸结构再搜，不要凭记忆猜路径**（八荣八耻：以瞎猜接口为耻）。先 `Glob **/*.{c,h}` 看真实目录结构（是 `code/app/` 还是 `user/src/`？），再按真实路径 Grep/Read。猜错路径正是触发上面那串报错的导火索。
5. 被批次取消后，**先核实哪些真落地、哪些没执行**，再补跑，不要假设"取消=失败=要重来"。

### 1.1 信息检索 / 查证

| 需求 | 触发工具 | 详细参考 |
|---|---|---|
| 查固件库 API（HAL/StdPeriph/ESP-IDF/GD32 SPL 等） | Context7 MCP（先查本地 `refs/stm32-*-api.md` 或 `.auto-embedded/refs/gd32f4xx-api.md`） | 见 §3 工具优先级 |
| 搜索开源驱动 | grok-search 主用 + `gh` 深查 | RESEARCH 步骤 1，INNOVATE 步骤 1 |
| 引脚冲突分析 | Sequential Thinking MCP 或手动 | RESEARCH 步骤 7，`.auto-embedded/refs/pin-planning.md` |
| 数据手册查询 | grok-search 搜官方链接 + Document Skills 读 PDF | `.auto-embedded/modes/datasheet-lookup.md` |
| 网表引脚提取 | `网表` mode | `.auto-embedded/modes/netlist-lookup.md` |
| 故障快速诊断 | 离线参考 | `.auto-embedded/refs/troubleshooting.md` |
| 硬件实时调试 | Embedded Debugger MCP | 仅硬件联调时可用 |
| **数学计算 / 仿真 / 控制器设计 / 滤波器设计 / FFT / 系统辨识 / 定点化** | `mcp__matlab__*` 工具组 + `.auto-embedded/modes/matlab-embedded-toolkit.md` | 8 大场景 |
| **模拟前端电路预验证**（写固件前验证 ADC 抗混叠/运放增益/传感器调理/RC 滤波等模拟电路假设） | 外部辅助 skill `/multisim-spice`（自然语言→SPICE 网表→内置 ngspice 自检→可选 Multisim） | **设计期证据生成，非 EXECUTE 执行器，不走 Command Outcome 契约**；仅 Windows，Multisim 可选；电路级正确性走它、系统级/控制链路走 Simscape；详见 `.auto-embedded/refs/riper5-stages.md` RESEARCH 步骤 10 |

### 1.2 执行层（操作真实命令）

| 需求 | 兄弟 skill | 备注 |
|---|---|---|
| **工程画像自动探测** | `python .auto-embedded/tools/shared/project_detect.py <ws>` | EXECUTE 前识别构建系统/芯片/产物，避免手工枚举 |
| **构建固件** | `aemb-build-cmake` `aemb-build-keil` `aemb-build-iar` `aemb-build-platformio` `aemb-build-idf` `aemb-build-makefile` | 按工程类型选；输出 Project Profile + ELF/HEX/BIN 路径 |
| **烧录固件** | `aemb-flash-openocd` `aemb-flash-keil` `aemb-flash-platformio` `aemb-flash-idf` `aemb-flash-jlink` | 烧录前必须有 build 输出的 artifact_path |
| **GDB 在线调试** | `aemb-debug-gdb-openocd` `aemb-debug-jlink` `aemb-debug-platformio` | 下载后调试 / 仅附着 / 崩溃现场分析 |
| **串口监视** | `aemb-serial-monitor` | 自动选 COM/tty 端口并抓日志 |
| **协议总线调试** | `aemb-modbus-debug` `aemb-can-debug` `aemb-visa-debug` | Modbus RTU/TCP / CAN 帧 / VISA 仪器 SCPI |
| **内存与 RTOS 分析** | `aemb-memory-analysis` `aemb-rtos-debug` | .map/ELF 内存报告；FreeRTOS/RT-Thread/Zephyr 线程感知 |
| **静态分析 / MISRA** | `aemb-static-analysis` | cppcheck / clang-tidy / GCC analyzer |
| **外设驱动适配** | `aemb-peripheral-driver` | 开源驱动搜索→评估→适配脚本 |
| **STM32 HAL 工程开发** | `/stm32-hal-development` | CubeMX/HAL 工程的 BSP 模板与 troubleshooting |
| **多 skill 流水线** | `/workflow` | 编译→烧录→监控/调试 一键链路 |
| **代码质量审查** | `/simplify` | REVIEW 阶段质量检查 |
| **复杂代码分析 / 双模型擂台** | `/codex` | GPT 视角独立审查 |

### 1.3 跨 skill 契约

| 需求 | 文件 | 用途 |
|---|---|---|
| Project Profile / Skill Handoff / Command Outcome | `.auto-embedded/refs/contracts.md` | 字段定义 + 调用约定 |
| 失败分类（8 类标准） | `.auto-embedded/refs/failure-taxonomy.md` | `environment-missing` / `project-config-error` 等 |
| 跨平台路径规则 | `.auto-embedded/refs/platform-compatibility.md` | Linux/macOS/Windows 串口、路径、权限差异 |

---

## 2. 工具优先级总表（按工具类型）

| 类型 | 工具 | 适用场景 | 缺失时降级 |
|---|---|---|---|
| **CLI (Bash)** | **grok-search** | 所有联网检索：驱动、报错、竞赛经验、数据手册入口、版本查询 | Claude WebSearch / WebFetch |
| MCP | **Context7** | 固件库 API、函数签名、初始化顺序、寄存器说明 | 本地 refs / grok-search |
| Skill | **Document Skills** (`/pdf` `/docx` `/xlsx` `/pptx`) | PDF/XLSX/DOCX/PPTX 文档读取与提取 | Claude Read / grok-search |
| MCP | **Sequential Thinking** | 引脚冲突、DMA 分配、中断优先级等复杂推理 | 人工推理 + WebSearch |
| MCP | **Embedded Debugger / Serial** | 实时硬件调试、烧录、串口交互 | 串口日志 / 断言 / 手工烧录 |
| CLI | **gh** | GitHub 仓库搜索、代码搜索、读取源文件 | grok-search + `site:github.com` |
| External CLI | **agent-browser**（若已安装） | 在线数据手册页面、厂商 Web 配置器、后台取证、截图留档 | `/playwright-skill` / 手工浏览 |
| Python | **shared/project_detect.py** | 工程画像自动探测（构建系统/芯片/产物） | 见 `.auto-embedded/refs/contracts.md`；命令：`python .auto-embedded/tools/shared/project_detect.py <ws>` |
| Python | **shared/tool_config.py** | 嵌入式工具路径管理（OpenOCD / Keil UV4 / arm-gcc / J-Link 等） | 命令：`python .auto-embedded/tools/shared/tool_config.py list` |
| Skill 集 | **操作执行层兄弟 skill** | 真正执行编译/烧录/调试/串口/总线/分析；数量以 `hooks/verify-deps` 探测为准 | 见 §1.2 |
| MCP | **MATLAB MCP**（`mcp__matlab__*`）| 数学计算 / 控制器设计 / 滤波器 / FFT / 系统辨识 / Kalman / 电机辨识 / 定点化 / 日志可视化（8 场景） | 缺 MATLAB → python-control / scipy / numpy；详见 `.auto-embedded/modes/matlab-embedded-toolkit.md` |

### grok-search 调用要点

- **若 grok-search 已安装则优先用它**，未安装直接用内置 WebSearch / WebFetch（不强制先试一次再降级）
- 返回 JSON：`ok` / `content`（归纳答案）/ `sources`（URL 列表）/ `raw`（解析失败时兜底）
- 命令模板、降级矩阵、错误恢复见 `.auto-embedded/refs/mcp-tools.md` Grok-Search 章节（单一权威，本文不重复）

---

## 3. 工具路由原则（按场景选工具）

1. **一般联网搜索**：本地 refs → grok-search → `gh` / WebSearch / 官方站点
2. **STM32 HAL/StdPeriph API**：本地离线 refs → Context7 → grok-search
3. **数据手册 / pinout / 网表**：`网表` mode → grok-search 搜官方入口 → Document Skills 提取 → Sequential Thinking 整理
4. **REVIEW 质量检查**：必要时 `/simplify`
5. **复杂跨文件代码分析 / 独立审查**：必要时 `/codex`

---

## 4. 外部方法论借鉴边界

- **浏览器类任务**借鉴 `agent-browser`：先读取当前版本 skill/帮助，再执行 `open → snapshot/ref → 交互 → 页面变化后重采样`，不要猜 CLI 参数，也不要复用过期元素引用
- **长网页/PDF/视频资料**借鉴 `summarize`：先压缩成"结论/证据/待确认"再进入决策，避免把原始长文本直接塞进主上下文
- **查找外部 skill/工具**借鉴 `find-skills`：先看排行榜、安装量、来源信誉和仓库活跃度，再决定是否引入，禁止把搜索结果直接当结论
- **代码整理**借鉴 `/simplify`：小步重构、行为保持、一次只改一件事，优先拆长函数和消除重复，再谈风格优化

---

## 5. 优先参考仓库（开源驱动搜索）

查找嵌入式开源库、驱动、框架、工具时，优先从以下仓库索引检索：

| 仓库 | 说明 | 使用方式 |
|---|---|---|
| [EmbedSummary](https://github.com/zhengnianli/EmbedSummary) | 精品嵌入式资源汇总（5000+ stars），涵盖 OS、实用库/框架、驱动、网络协议栈、调试工具、开发板 SDK 等 | RESEARCH 阶段需要查找开源库/驱动时，先用 `gh api repos/zhengnianli/EmbedSummary/readme` 检索 README 中是否已收录 |

### 查找流程

1. **离线索引**：先查 `.auto-embedded/refs/embed-libs-index.md`（已整理 RTOS、按键/定时器/日志/Shell/Flash 存储/JSON/调试/状态机/通信协议/GUI/驱动 等分类速查）
2. **README 检索**：`gh api repos/zhengnianli/EmbedSummary/readme`
3. **扩大搜索**：`gh search repos` 或 grok-search

---

## 6. 长任务治理

需要分 Scout / Builder / Verifier、按轮次推进、跨 Agent 交接时，见 `.auto-embedded/refs/vibe-workflow.md`（长任务模板 + 角色分工 + 证据包格式）。
