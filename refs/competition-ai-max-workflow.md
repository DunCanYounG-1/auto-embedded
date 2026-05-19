# 自动完赛极限工作流（AI Max Throughput Mode）

> **目的**：在 `modes/competition.md` v2 框架下，把 AI 协作效率推到极致 — N-Agent 并行、自动决策门、流水线集成，逼近"自动完赛"。
>
> **读者**：已经熟悉 RIPER-5 + 比赛模式 + MATLAB MCP 的高级用户；想要从"AI 辅助"升级到"AI 主导 + 人工裁决"的团队。
>
> **不读者**：第一次接触本 skill 的人 — 先读 `refs/matlab-hello-5min.md` 跑通最小闭环再来。

---

## 0. 极限工作流 vs 普通用法

| 维度 | 普通用法 | 极限工作流 |
|---|---|---|
| Agent 数量 | 1-2 个串行 | 5-7 个并行 |
| 用户介入次数 | 每个文件都确认 | 只在决策门确认 |
| MATLAB 调用 | 学生手动跑 | [MATLAB] Agent 自动跑 |
| 验证强度 | 编译过 = 通过 | MIL → SIL → PIL 三层强制 |
| 报告生成 | 人工写 | [REPORT] Agent 自动出初稿 |
| 失败恢复 | 学生看日志手动判断 | 按 `failure_category` 自动路由 |
| 加速倍数 | 1.5× | **3-5×** |

---

## 1. 7 Agent 角色总览（VoltAgent 风格 subagent — 实际安装在 `agents/embedded-*.md`）

```
                ┌──────────────────────────┐
                │   [ARCH] embedded-arch    │ ← 主线 / 统筹 / 决策门
                │  题目分解 / 路由 / 集成    │
                └──┬─────────────────────┬──┘
                   │                     │
            ┌──────┴──────┐       ┌─────┴──────┐
            │ CP-1.5 仿真 │       │ CP-2 实现   │
            └──────┬──────┘       └─────┬──────┘
                   │                     │
        ┌──────────┼──────────┐         ├─────────┬─────────┐
        ▼          ▼                    ▼         ▼         ▼
    [MATLAB]   [VISION]              [DRV]    [ALG]    [REPORT]
    embedded-  embedded-             embedded- embedded- embedded-
    matlab     vision                drv       alg       report
       │          │                     │         │         │
       └──────────┴─────────────────────┴─────────┴─────────┘
                           │
                           ▼
                       [QA] embedded-qa
                       CP-3 验证 + Defect Ticket
                       （不并发；收齐其他 Agent 产物后单独跑）
```

**编制**：7 个 subagent（ARCH/DRV/ALG/QA/MATLAB/VISION/REPORT），无第 8 个。
Simscape 电路仿真属于 `embedded-matlab` 的能力之一（场景 E6），不单独成 Agent。

**派发方式**：每个 Agent 独立 context、独立写 `编辑清单_<ROLE>.md`（大写枚举：DRV/ALG/QA/MATLAB/VISION/REPORT），ARCH 在 CP-2 末尾合并到主 `编辑清单.md`。完整契约见 `agents/README.md` + `refs/contracts.md`。

---

## 2. 7 Agent 完整 Prompt 模板（可直接复制粘贴）

### 2.1 [ARCH] — 主控（两种用法）

`embedded-arch` 是独立 subagent，但典型用法是**作为主线**（即用户直接对话的 Claude 窗口本身扮演 ARCH 角色），原因是主控全程在线、需要做用户交互。

| 用法 | 触发 | 适用 |
|---|---|---|
| **主线 ARCH**（默认）| 用户喊"启用比赛模式" | 主对话窗口加载 `agents/embedded-arch.md` 行为，直接执行 |
| **独立 subagent**（少见）| `Task(subagent_type="embedded-arch", prompt=...)` | 把架构决策外包（如多个并行 ARCH 评估不同方案）|

无论哪种用法，ARCH 的产出（Outcome）必须遵守 `refs/contracts.md §Command Outcome Schema` 全字段。

主控职责：

1. 读题 + 分解 + 路由（MAIN+TAGS+分值加权）
2. 写硬件资源表（含 hw_lock YAML 块）+ 接口契约
3. **决定派几个 subagent**（按 task-router §2.4 + §1.7 分值加权）
4. **同一条消息派出 N 个 subagent**（并行，Task tool 多次调用）
5. 收 Outcome → 自动决策门（按 contracts.md CP 门禁表）
6. Defect Ticket 回派
7. Git 检查点提交
8. 集成 + 交付

### 2.2 [MATLAB] — 算法仿真 Agent（CP-1.5 派发，最先开工）

```text
你是嵌入式比赛专项的 MATLAB 算法工程师 [MATLAB]。在主协议 RIPER-5 + 比赛模式 v2 框架下工作。

【接口契约】（由 [ARCH] 提供，严格遵守 .h 函数签名）
[贴 ARCH 输出的算法接口段]

【硬件资源表】（从工程根目录读取）
启动后必读 `硬件资源表.md`，知道你算的参数将落到哪些引脚/通道。

【题目指标】
[贴量化指标，如：调制度精度 ± 1%、THD ≤ -50 dB、闭环带宽 ≥ 10 Hz]

【你的任务】
1. 工具检测：先跑 mcp__matlab__detect_matlab_toolboxes，列出可用 toolbox
2. 算法仿真：根据题型选 modes/matlab-toolkit-competition.md 的 E1-E7 场景
   - 信号源 → E1（DDS）
   - 调制解调 → E2
   - 仪表测量 → E3
   - 控制系统 → 主线场景 4 + LQR
   - 自适应滤波 → E5
3. 写 scripts/<task>_design.m，通过 mcp__matlab__run_matlab_file 跑
4. 输出关键指标：精度 / 误差 / 频响 / 闭环极点
5. 用 tools/export_gains_to_c.py 导出 .h 文件到 app/dsp/ 或 app/control/

【强制约束】
- 仿真未达指标 → status=blocked，不允许进入下一阶段
- 必须输出量化指标证据，不允许"应该可行"
- 写 编辑清单_MATLAB.md，每次仿真追加：参数 + 指标 + 是否达标
- 必须给出 SIL/PIL 验证脚本（即使本轮不跑，下游 Agent 要用）

【输出格式 — 必须用 refs/contracts.md §Command Outcome Schema 全字段】
status: success | partial_success | blocked | failure
owner_agent: embedded-matlab           # 必填
trace_id: <competition>-<NNN>          # 必填，从 ARCH 派发时传入
summary: 一句话说明
artifact_paths:                        # 必填
  - scripts/xxx_design.m
  - app/dsp/xxx.h
evidence:
  - indicator: <key=value, e.g. THD=-58dB>
next_action: <下一个 subagent 该做什么>
confidence: high | medium | low
# 失败时还必须填：
failure_category: <见 refs/failure-taxonomy.md 8 类>
root_cause_id: <RC-XXX-NNN>            # 同根因跨 Agent 复用
retry_count_global: <N>                # 按 root_cause_id 全局计数
reproduce_command: <可粘贴命令>
blocking_cp: CP-1.5
```

### 2.3 [DRV] — 底层驱动 Agent

```text
你是底层驱动工程师 [DRV]。在主协议 RIPER-5 + 比赛模式 v2 框架下工作。

[完整 prompt 见 modes/competition.md 阶段二 DRV 段]

补充（v2 升级）：
- 必须为 [MATLAB] Agent 产出的 .h 留好 include 接口
- ADC/DAC/TIM 配置必须能跑通 [MATLAB] 设计的采样率
- 输出 Command Outcome 格式（同 [MATLAB]）
- 编辑清单写 编辑清单_DRV.md
```

### 2.4 [ALG] — 应用算法 Agent

```text
你是算法控制工程师 [ALG]。在主协议 RIPER-5 + 比赛模式 v2 框架下工作。

[完整 prompt 见 modes/competition.md 阶段二 ALG 段]

补充（v2 升级）：
- 直接 include [MATLAB] Agent 产出的 .h（增益矩阵 / 滤波系数 / LUT）
- 不重新实现算法核心，只做"接 .h + 调用 + 状态机"
- 失败兜底：[MATLAB] 标记 partial_success 时，[ALG] 用降级算法（如 LQR 降到 PID）
- 编辑清单写 编辑清单_ALG.md
```

### 2.5 [VISION] — 智能车视觉专项 Agent（仅视觉组用）

```text
你是智能车视觉工程师 [VISION]。在主协议 RIPER-5 + 比赛模式 v2 框架下工作。

【任务】
针对智能车视觉组（NXP 杯），完成完整视觉处理链路：

1. 摄像头标定（如有标定图）：cameraCalibrator → cam_params.mat
2. 离线算法调试：从录制视频选 N 张不同光照/角度的图，调以下参数：
   - 二值化阈值（固定 vs OTSU 自适应）
   - Sobel/Canny 边缘
   - 透视变换 src_pts → dst_pts
   - 中线提取扫线策略
3. 输出：
   - app/vision/perspective.h（透视矩阵）
   - app/vision/track_detect.c/.h（实时处理代码）
   - 性能基准：FPS + 不同场景丢线率

【强制约束】
- 必须用 mcp__matlab__evaluate_matlab_code 真实跑算法（不允许凭空推测）
- 测试图 ≥ 10 张（含直道/弯道/十字/环岛/强光/弱光）
- 丢线率 ≤ 5% 才能 status=success
- 编辑清单写 编辑清单_VISION.md
- Command Outcome 格式同 [MATLAB]

参考完整流程：refs/matlab-example-smartcar-vision.md
```

### 2.6 [QA] — 验证 Agent

```text
你是嵌入式验证工程师 [QA]。在主协议 RIPER-5 + 比赛模式 v2 框架下工作。

[基础 prompt 见 modes/competition.md 阶段三 QA 段]

v2 升级（核心强化）：
- 跑 scripts/arch-check.sh，exit ≠ 0 → 必须 FAIL
- 跑 tools/include-graph.py，有 LAYER-VIOL → 必须 FAIL
- 触发 modes/matlab-firmware-pipeline.md 的 Step 1-6 完整跑一遍
- MIL/SIL/PIL 三层验证（主线场景 10）：
  - MIL：[MATLAB] 仿真输出对照
  - SIL：Embedded Coder SIL 模式（若用 Simulink）
  - PIL：编译到 MCU 跑相同测试用例
  - 误差阈值见 refs/contracts.md
- 编辑清单写 编辑清单_QA.md（含三层一致性证据表）
- Command Outcome 格式同 [MATLAB]
```

### 2.7 [REPORT] — 报告生成 Agent（CP-4 派发）

```text
你是比赛报告与答辩准备工程师 [REPORT]。

【任务】
1. 读所有 编辑清单_*.md + 项目规划清单.md + 硬件资源表.md
2. 生成 LaTeX/Word 报告骨架（见 refs/report-template.md，若存在）
3. 必须包含：
   - 题目分析与指标
   - 系统方案框图
   - 关键算法原理（含公式）
   - 硬件方案 + BOM
   - 软件流程图
   - 实测数据 + 误差分析
   - 创新点 / 加分项
4. 数据可视化（调 mcp__matlab__evaluate_matlab_code 画图）
5. 模拟答辩 Q&A：列出 10 个老师可能问的"为什么"，给出回答模板

【强制约束】
- 报告中"为什么"部分必须有非 AI 的理由（标注 "决策依据：见 研究发现.md §X"）
- 所有数据必须能在 编辑清单_*.md 找到出处
- Command Outcome 格式同 [MATLAB]
```

---

## 3. 多 subagent 派发模板（ARCH 在 CP-1.5 / CP-2 用）

### 3.0 派发约定

- **优先 subagent_type="embedded-*"**（VoltAgent 风格，已装在 `~/.claude/agents/`，见 `agents/README.md` §安装方式）
- 仅在 subagent 未注册时回退 `general-purpose` + 内嵌 prompt（不推荐 — 回退后 Outcome/Ticket 规约可能失效）
- 派发分两批：CP-1.5 派仿真组（MATLAB + VISION）；CP-2 派实现组（DRV + ALG + REPORT）；**绝不**在 CP-1.5 完成前派 ALG
- 同一批的所有 subagent 必须**在同一条消息**用并行 Task tool 发出

### 3.1 电赛仪表类题（如 2021A / 2022F / 2024B）

**CP-1.5 派 1 个**（MATLAB 跑算法，无 VISION）：

```python
Task(subagent_type="embedded-matlab",
     description="FFT 测量精度仿真",
     prompt=<§2.2 模板 + 题目指标>)
```

CP-1.5 通过后 → **CP-2 同条消息派 3 个**：

```python
Task(subagent_type="embedded-drv",    description="ADC+DMA+OLED", prompt=<§2.3 模板 + 接口契约>)
Task(subagent_type="embedded-alg",    description="FFT 测量逻辑", prompt=<§2.4 模板 + 消费 fft_config.h>)
Task(subagent_type="embedded-report", description="报告骨架",     prompt=<§2.7 模板>)
```

CP-3 单独派：

```python
Task(subagent_type="embedded-qa", description="CP-3 验证", prompt=<§2.6 模板 + 验证清单>)
```

### 3.2 智能车视觉组

**CP-1.5 同条消息派 2 个**：

```python
Task(subagent_type="embedded-matlab", description="LQR + Kalman", prompt=<§2.2 模板>)
Task(subagent_type="embedded-vision", description="视觉离线",     prompt=<§2.5 模板>)
```

CP-2 派 3 个（DRV + ALG + REPORT），CP-3 派 QA。共 7 个 subagent 覆盖。

### 3.3 智能车电磁直立组

CP-1.5 派 1 个（MATLAB 含 LQR + Kalman），CP-2 派 3 个（DRV + ALG + REPORT），CP-3 派 QA。共 6 个。VISION 不派（电磁组无摄像头）。

---

## 3.9 ⭐ subagent 紧凑回传（防主上下文炸）

**问题**：N-subagent 并行派发，如果每个回 1000+ 行 markdown，ARCH 收齐 5-7 个 → 主上下文炸。

**解决**：强制每个 subagent 只回 `refs/contracts.md §Command Outcome Schema` 字段，**禁止** inline 完整代码 / 大型数据表 / 调试日志。

唯一权威 Outcome schema 见 `refs/contracts.md §Command Outcome Schema`（必填 status/owner_agent/trace_id/summary/artifact_paths/evidence/next_action；失败时追加 failure_category/root_cause_id/retry_count_global/reproduce_command/blocking_cp；可选 confidence/human_decision_required）。

`interface_contract` / `risks` 是**额外推荐**字段（不是替代 Outcome）：

```yaml
# Outcome 必填字段（详见 contracts.md，不重复）
status: success
owner_agent: embedded-matlab
trace_id: comp-2026-001
artifact_paths: [...]
...
# 额外推荐字段（可选）
interface_contract:                  # 我产出的接口（供下游 subagent 引用）
  - file: app/control/lqr_gains.h
    api: K_BALANCE[4]
risks:                               # 已知风险（让 ARCH 评估是否阻塞）
  - 滤波器 fc=20 Hz 偏低，可能丢高频信号
```

### 3.9.1 禁止回传的内容（写文件而非返回）

| 内容 | 写到哪里 | 不返回原因 |
|---|---|---|
| 完整代码 | `app/<file>.c/.h` | 太长，[ARCH] 不需要审 |
| 仿真结果数值表 | `编辑清单_<Agent>.md` | 太长，需要时引用 |
| 调试日志 | `log/<timestamp>.log` | 主上下文不需要 |
| 算法推导过程 | `docs/algorithm-report.md` | 让 [REPORT] 写报告时用 |
| MATLAB plot 图 | `figures/*.png` | 不要 inline base64 |

### 3.9.2 主上下文占用估算

| 项 | 旧版 (v1 全回传) | 新版 (v2 紧凑) |
|---|---|---|
| 5 Agent 回传 | ~25 KB | ~3 KB |
| [ARCH] 决策门可读性 | 难 | 易 |
| 上下文剩余预算 | 70% | 95% |
| 跨阶段交接 | 需重读 | 看 interface_contract 即可 |

### 3.9.3 例外：[QA] 验证报告

[QA] 是唯一可以回传**完整 5 元组验收表**的 Agent（因为这是答辩必备产物），但即便如此也建议：
- 表头 + 不通过项保留在回传里
- 通过的项只回 "✓ N/M passed"

---

## 4. 自动决策门规则（[ARCH] 收齐 Agent 输出后执行）

### 4.1 决策矩阵

| 所有 Agent 状态 | [ARCH] 决策 | 用户介入 |
|---|---|---|
| 全部 success | 自动 CP-X 提交 + 进下一阶段 | ❌ 不打扰 |
| 任一 partial_success | 标记轮次失败 + 进入修复轮 | ⚠️ 通知，不打断 |
| 任一 blocked | 暂停 + 列候选向用户 | ✅ 必须人工 |
| 任一 failure | 按 failure_category 自动路由 | ⚠️ 通知 |

### 4.2 failure_category 自动路由表

| failure_category | 自动处置 | 重试上限 |
|---|---|---|
| `environment-missing` | 列缺失依赖 + 提供安装命令 | 0（须人工装） |
| `project-config-error` | 回该 Agent + 提示具体配置项 | 1 |
| `connection-failure` | 阻塞 + 提示检查硬件 | 0 |
| `artifact-missing` | 回上游 Agent 重新产出 | 1 |
| `target-response-abnormal` | 进 `refs/systematic-debugging.md` | 2 |
| `permission-problem` | 阻塞 | 0 |
| `ambiguous-context` | **必须人工裁决** | 0 |

### 4.3 同根因 3 次失败自动停（v2.1 全局计数）

**v2.1 升级**：不再按 subagent 各自计 3 次（旧规则会导致同一根因在 drv → alg → arch 间漂移时重新获得 3 次预算），改成按 `root_cause_id` **全局累计**：

- 每个 Defect Ticket 携带 `root_cause_id`（由 QA 或上一个失败的 Agent 命名，如 `RC-ADC-DRIFT-001`）
- `项目规划清单.md` 的 `competition_state.retry_table` 按 `root_cause_id` 累计 `retry_count_global`
- 同 `root_cause_id` 跨 subagent / 跨 CP 一律共用一个计数器
- 累计达 3 次 → STOP，写 `研究发现.md`，必须人工裁决

举例：[MATLAB] 仿真发现 LQR Q 矩阵选错，root_cause_id=`RC-LQR-Q-001`，重试 1 次失败 → 派 ALG 用 PID 替代仍失败（计数 2）→ 派 ARCH 改约束仍失败（计数 3）→ STOP。**不允许**ALG/ARCH 各得 3 次预算。

详见 `refs/contracts.md §比赛状态机` retry_table 字段。

---

## 5. 完整流程示例：电赛 2022F 调制度测量

### 用户输入

```
启用比赛模式

题目：[贴 2022F 原文]
硬件：STM32F407VG + 内置 12bit ADC + OLED1306
团队：3 人
时间：4 天（电赛标准）
```

### Claude 自动跑流程

#### T+0 ~ T+5min：CP-0a 工程初始化

```
ARCH（主线）：
→ mkdir 2022F-am-meter && cd && git init
→ .gitignore（Keil/CubeIDE 模板）
→ git commit -m "[ARCH] CP-0a"  + git tag v0.0-init
```

#### T+5min ~ T+15min：CP-0b 题型路由

```
ARCH：
→ 读题 / 提取指标：fc=200kHz-1MHz, m=5%-100%, 精度±1%, 更新≤1s
→ 套 task-router §1.1：MAIN=METER（单项最高分=测量精度）
→ 套 §1.2：TAGS=[FFT, RF, MODEM, OLED]
→ 套 §1.7 分值加权：FFT=35% / OLED=10% / 测量精度=40% / 其他=15%
→ §2.4 + §1.7 算 Agent：[ARCH][DRV][ALG][QA][REPORT][MATLAB] = 6 个，不派 VISION
→ 5 元组验收表 → docs/checklist-100分.md
→ docs/competition-routing.md 生成
→ git commit + tag v0.0-routing
```

#### T+15min ~ T+2h：CP-1 硬件资源规划

```
ARCH（grok-search 查 STM32F407 ADC 三重交替模式）：
→ 硬件资源表.md（含 hw_lock YAML 块）：
  - PA0/PA1 ADC1/2 / PA9/10 USART1 / PB6/7 I2C OLED
  - DMA2_S0 ADC1，DMA2_S2 ADC2 交替
  - NVIC：ADC=0/0 / USART=1/0 / TIM=2/0
→ 接口契约 v1.0 → 架构设计.md
→ bash scripts/arch-check.sh --hw-check → exit 0 ✓
→ git commit + tag v0.1-arch
```

#### T+2h ~ T+5h：CP-1.5 仿真（必须先跑，绝不并行 ALG）★关键串行点

ARCH **同条消息派 1 个 subagent**（本题无 VISION）：

```python
Task(subagent_type="embedded-matlab",
     description="2022F FFT 测量精度仿真",
     prompt=<§2.2 模板 + 接口契约 + 量化指标>)
```

收 Outcome：

```yaml
status: success
owner_agent: embedded-matlab
trace_id: 2022F-am-meter-001
artifact_paths: [scripts/am_design.m, app/dsp/fft_config.h]
evidence:
  - indicator: 仿真精度 0.7% < 1% ✓
  - indicator: FFT 4096 点 SFDR 65 dB
next_action: CP-2 可消费 fft_config.h
confidence: high
```

ARCH 决策门：success + 指标达标 → tag v0.15-sim → 才能进 CP-2。

#### T+5h ~ T+10h：CP-2 N-subagent 并行实现

**ARCH 同条消息派 3 个 subagent**（DRV + ALG + REPORT，ALG 现已可拿到 fft_config.h）：

```python
Task(subagent_type="embedded-drv",
     description="ADC 三重交替 + DMA + OLED I2C",
     prompt=<§2.3 模板 + 硬件资源表 + 接口契约>)
Task(subagent_type="embedded-alg",
     description="AM 测量逻辑 + 状态机",
     prompt=<§2.4 模板 + 消费 fft_config.h + 接口契约>)
Task(subagent_type="embedded-report",
     description="报告骨架 + 题目分析段",
     prompt=<§2.7 模板 + 占位实测数据>)
```

收 3 个 Outcome（全 success）→ ARCH 合并编辑清单 → git commit + tag v0.2-dev。

#### T+10h ~ T+16h：CP-3 QA 一键流水线 + 实时性验收

ARCH 派 1 个 subagent：

```python
Task(subagent_type="embedded-qa",
     description="CP-3 验证 + Defect Ticket",
     prompt=<§2.6 模板 + 5 元组验收表 + 实时性专项>)
```

QA 内部执行（详见 `agents/embedded-qa.md`）：

```
Step 1: bash ~/.claude/skills/embedded-dev/scripts/arch-check.sh         → 0 LAYER-VIOL
Step 2: python ~/.claude/skills/embedded-dev/tools/include-graph.py      → 无违规
Step 3: 静态分区检查：app/严苛 + drv/中等 + vendor/跳过
Step 4: matlab-firmware-pipeline 6 步：编译 → 烧 → 抓日志 → 实测 vs 仿真
Step 5: 实时性专项：jitter / ISR / 栈水位 / CPU / 浮点路径（5 项必测）
Step 6: 5 元组验收表逐项打钩
```

Outcome（含 Defect Ticket 列表，每条带 owner_agent 决定回派目标）→ ARCH 按 ticket 回派修复 → 复测 → 全 resolved → tag v0.3-qa。

若同 root_cause_id 累计 3 次失败 → STOP，写 研究发现.md，人工裁决。

#### T+16h ~ T+18h：CP-4 集成（3-owner 拆分）

ARCH **同条消息派 2 个**（自己只协调，不写代码）：

```python
Task(subagent_type="embedded-alg",
     description="集成 main.c 时间片轮询",
     prompt="按 modes/competition.md 阶段四模板写 app/main.c")
Task(subagent_type="embedded-report",
     description="填实测数据到报告",
     prompt="读编辑清单_QA.md + 实测 CSV，填比赛报告.md，禁改 .c/.h")
```

两个 Outcome → ARCH 派 QA 复验编译烧录 → tag v1.0-release。

#### T+18h ~ T+20h：CP-5 答辩演练（[REPORT]）

```
[REPORT] 模拟 10 个 why：
  Q: 为什么用 FFT 不用包络检波？
  A: FFT 频域抗噪好 + 精度 0.6% 优于包络 1.2%（见 编辑清单_MATLAB.md 第 3 轮）
  ...
```

#### 剩余 48 小时

可全部用于：硬件 PCB 优化 + 边界测试 + 调电源稳定性 + 现场调试备份方案。

**实际加速**：原本 4 天卡死的活，1.5 天搞完核心；剩余时间留作竞赛风险缓冲。

---

## 5.2 控制+视觉题完整示例：2017B 滚球控制系统 ★v2.2

### 用户输入

```
启用比赛模式

题目：[贴 2017B 原文]
硬件：STM32F407 + OV7725 摄像头 + 双轴舵机 + MPU6050 + OLED1306
团队：4 人
时间：4 天
```

### MAIN + TAGS + 加权

```yaml
MAIN: CONTROL
TAGS: [VISION, MOTOR, OLED, IMU]
tag_weights:
  CLOSED_LOOP_CONTROL:  { total_score: 30, percentage: 30%, agents: [MATLAB, ALG] }
  VISION_TRACK:         { total_score: 25, percentage: 25%, agents: [VISION, ALG] }
  MOTOR_RESPONSE:       { total_score: 15, percentage: 15%, agents: [DRV, MATLAB] }
  OLED_HMI:             { total_score: 5,  percentage:  5%, agents: [DRV, ALG] }
  MECH_SAFETY:          { total_score: -10, percentage: 10%, agents: [DRV], note: critical 红线 }
派 Agent: 7 个全派（ARCH+DRV+ALG+QA+REPORT+MATLAB+VISION）
```

### 关键差异（与仪表题 §5 对比）

| 维度 | 仪表题 (2022F) | 控制+视觉题 (2017B) |
|---|---|---|
| CP-1.5 仿真 | 仅 MATLAB（FFT 精度）| **MATLAB + VISION 并行**（LQR / Kalman / 视觉离线）|
| CP-1.5 串行点 | .h 文件等待 | .h + perspective.h + track_detect.c skeleton 三件套等待 |
| CP-3 验收 | 5 元组 + 测量精度 + 实时性 | 5 元组 + 实时性 + **§I 闭环 + §J 视觉 + §K 机电安全（红线）**|
| 关键风险 | ADC 漂移 | 视觉延迟 + 机械响应 + 限位保护 |

### 完整时间表（4 天，控制题压缩到 28h 核心 + 44h 调优）

```
CP-0a   T+0~5min      git init + .gitignore
CP-0b   T+5~15min     路由 → MAIN=CONTROL + TAGS + 7-agent 派发
CP-1    T+15min~3h    硬件资源表（含 hw_lock：摄像头 DCMI + 舵机 PWM × 2 + IMU I2C）
                      接口契约 v1.0（vision/control/motor/imu 接口分离）
                      arch-check.sh --hw-check exit 0 → tag v0.1-arch
                      ⚠️ 控制题 CP-1 时间比仪表题长（额外要锁视觉/电机/IMU 三路）

CP-1.5  T+3h~10h      ARCH 同条消息派 2 个：
                       Task(embedded-matlab):
                         - LQR 4 状态：[x, ẋ, y, ẏ]
                         - dlqr 离散化 Ts=20ms
                         - Q=diag([100,1,100,1]), R=[0.01]
                         - 仿真：超调 < 8%, 调节时间 1.2s, 稳态 < 2mm
                         - 导出 app/control/lqr_gains.h
                         - 同时跑 MPU6050 Kalman 融合（Q/R 噪声协方差）
                         - 导出 app/control/kalman_params.h
                       Task(embedded-vision):
                         - 摄像头标定 (cameraCalibrator)
                         - 离线测试 12 张图（直/弯/十字/强光/弱光/遮挡）
                         - OTSU + 形态学 + Hough 圆检测（球体）
                         - 透视变换 188×120 → 100×80 bird-view
                         - 导出 app/vision/{perspective.h, camera_params.h, threshold_lut.h}
                         - 产 app/vision/track_detect.c skeleton（含 TODO[ALG]）
                         - 性能：检测率 95%，估算 FPS 100 @ STM32F407
                      收 2 个 Outcome 都 success → tag v0.15-sim

CP-2    T+10h~20h     ARCH 同条消息派 3 个：
                       Task(embedded-drv):
                         - DCMI + DMA 摄像头（行中断 + 帧缓冲双 buffer）
                         - TIM_PWM 双舵机（50 Hz, 0.5-2.5ms 脉宽）
                         - I2C IMU + OLED 共用 I2C2
                         - 软限位保护（GPIO 中断）★机电安全
                         - 看门狗 IWDG 启用
                       Task(embedded-alg):
                         - 消费 lqr_gains.h + kalman_params.h + perspective.h
                         - 填 track_detect.c 的 TODO[ALG] 标记
                         - svc_controller.c：LQR 主循环 50 Hz
                         - svc_estimator.c：球位置 Kalman 融合
                         - svc_safety.c：限位 / 跟丢 / 堵转检测
                         - 状态机 INIT→READY→TRACKING→LOST→SAFE→ERROR
                       Task(embedded-report):
                         - 报告骨架 + 题目分析段 + 实测数据占位
                      tag v0.2-dev

CP-3    T+20h~26h     ARCH 派 Task(embedded-qa)：
                       全套验收（详见 agents/embedded-qa.md）：
                        ★ 静态分区检查（app 严苛/drv 中等/vendor 跳过）
                        ★ MIL/SIL/PIL 三层一致性
                        ★ 实时性 5 项（jitter/ISR/栈/CPU/浮点）
                        ★ §I 闭环 5 指标：
                           - 超调 ≤ 8% (仿真目标，实测 < 12% 是阈值 1.5×)
                           - 调节时间 < 1.5s
                           - 稳态误差 < 3mm
                           - 跟踪误差（动态目标）< 5mm
                           - 抗扰恢复 < 2× 调节时间
                        ★ §J 视觉容错 4 项：
                           - 丢帧恢复 < 0.3s（人为遮挡测试）
                           - 跟丢→SAFE 状态
                           - 光照 3 档检测率 ≥ 90%
                           - 跟踪失败率 < 5%
                        ★ §K 机电安全 5 项（critical 红线）：
                           - 软限位 → PWM 归零
                           - 堵转 30s → ERROR
                           - 欠压 → SAFE + OLED 红警
                           - IWDG 复位测试
                           - ERROR 禁止自动恢复
                      Defect Ticket 列表 → ARCH 按 §排序规则定向回派
                      tag v0.3-qa

CP-4    T+26h~28h     派 2 个（alg 写 main.c / report 填实测数据）
                      ARCH 协调 → QA 复验 → tag v1.0-release

CP-5    T+28h~30h     答辩演练 10 whys（含 LQR vs PID / Kalman vs 互补 /
                      Hough vs HSV / 软限位时序 5 个核心 why）
                      → tag v1.1-rehearsed

T+30h ~ T+96h         剩余 66h（4 天）：
                        - 机械松动反复紧固（控制题常见硬伤）
                        - 不同光照 5 次回归测试
                        - 电池电压衰减场景验证
                        - 备份方案：视觉失败 → IMU+电磁辅助定位（如果题目允许）
                        - 答辩多轮录像 + 同伴模拟提问
```

### 关键控制题 why-evidence（10 whys 示例）

```
Q1: 为什么用 LQR 不用 PID？
A:  4 状态耦合，PID 难协调（4 路 PID 互相打架），LQR 一组 K 同时优化能量与跟踪
    证据：scripts/lqr_design.m:28-45 Q/R 选取 + figures/lqr_vs_pid.png 调节时间
          1.2s vs 2.5s

Q2: 为什么控制频率 50 Hz 不是 100 Hz？
A:  摄像头 100 FPS + 机械响应 ~20 Hz 带宽，50 Hz 已 > 5× Nyquist；提到 100 Hz
    会增 50% CPU 但效果无提升
    证据：硬件资源表.md:#L42 摄像头 FPS + log/cpu_usage_compare.csv

Q3: 为什么 Hough 不用 HSV 阈值？
A:  HSV 在光照变化下漂移大（实测 100/1000 lux 阈值差 ±20）；Hough 几何特征鲁棒
    证据：vision_eval.csv 三档光照检测率 Hough 95% vs HSV 67%

Q4-Q10: 略（机电安全 / IMU Kalman / 限位 / 状态机超时 / 实时性...）
```

### 控制题特别提醒

1. **CP-1.5 不能跳**：控制+视觉题必须先把 LQR / Kalman / 视觉算法验证完才能进 CP-2，否则 ALG 拿着错的 .h 写代码 → CP-3 必崩
2. **§K 机电安全是 critical 红线**：任一项失败不允许 retry，必须人工裁决（不是软件能补的）
3. **视觉与控制耦合**：视觉延迟（捕获→识别→输出）通常 30-50 ms，控制律设计时**必须**把这延迟当作系统延迟纳入（不然闭环会震荡）— `embedded-matlab` 在 LQR 设计时加 Padé 近似
4. **机械限位永远比软件限位先**：电赛规则一般要求物理限位开关（GPIO 中断），软限位（θ_max 角度判断）是兜底

---

## 6. 阻塞与人工裁决场景

并非所有事都能自动。以下情况**必须**让 Claude 暂停 + 让人工决定：

| 场景 | 为什么必须人工 |
|---|---|
| 选 2-3 个技术路线之一 | 隐性团队偏好（熟悉度、PCB 复用） |
| Q/R 调参达到性能瓶颈 | 物理硬件极限，不是软件能补的 |
| 烧录后无串口输出 | 可能硬件焊接 / 引脚配置错 |
| 实测与仿真偏差 > 阈值 | 模型或测量假设错误 |
| 评分点取舍（砍哪些功能） | 队伍战略选择 |
| 答辩演练的"为什么"质量 | 答辩老师听学生说，不听 AI 说 |

[ARCH] 遇到这些必须 **status=blocked + 候选列表给用户**，禁止猜测。

---

## 7. 跨赛季积累（不要每次从零）

### 7.1 赛后 1 周内做

```
[REPORT] 整理：
  refs/team-archive/<year>-<competition>/
    ├─ 完赛复盘.md
    ├─ 核心代码模板/
    ├─ 仿真脚本/
    └─ 经验教训.md
```

### 7.2 下届开赛前 1 个月

```
新成员：
  1. 跑 refs/matlab-hello-5min.md
  2. 跑 refs/team-archive/<上届>/example
  3. 一周内可上手 v2 工作流
```

---

## 8. 限制与边界（诚实）

| 能不能做 | 答案 |
|---|---|
| AI 100% 完赛？ | ❌ 不行。硬件焊接、临场调试、答辩仍是人的事 |
| 所有题型适用？ | ⚠️ 主流类型（信号 / 控制 / 视觉 / 电磁）OK；很冷门题型可能没现成场景 |
| 第一次用就能 3-5× 加速？ | ⚠️ 不行。学习曲线 10-20 小时，赛前必须先练 |
| 离线场景能用？ | ✅ 本 skill 全套离线可用；grok-search 失效但不影响主流程 |
| 不会编程能用？ | ❌ 至少要会读 C 代码 + 能调试硬件 |
| 跨赛事复用？ | ✅ 电赛 + 智能车 + 其他嵌入式赛事都适用 |

---

## 9. 关联资源

- **比赛模式入口**：`modes/competition.md`（v2 主流程）
- **赛题门类专题**：`modes/matlab-toolkit-competition.md`（E1-E7）
- **算法门类主线**：`modes/matlab-embedded-toolkit.md`（场景 1-10）
- **一键流水线**：`modes/matlab-firmware-pipeline.md`（6 步算到烧）
- **历年赛题索引**：`refs/competition-index.md`
- **失败分类**：`refs/failure-taxonomy.md`
- **统一约定**：`refs/contracts.md`（Project Profile / Command Outcome）
- **入门示例**：`refs/matlab-example-*.md`、`refs/lqr-example-*.md`
- **首跑**：`refs/matlab-hello-5min.md`
