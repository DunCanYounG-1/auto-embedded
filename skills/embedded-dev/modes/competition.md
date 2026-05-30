# 比赛模式 (Embedded Competition Mode) v2

> 由主 SKILL 调用，触发词：**启用比赛模式** / `自动完赛` / `极限并行` / `多 Agent 派发`
> 适用场景：全国大学生电子设计竞赛、全国大学生智能汽车竞赛（NXP 杯）、蓝桥杯嵌入式、省级/校级嵌入式竞赛
> 主协议（RIPER-5）的基础规则全部有效，本文件仅定义比赛模式的**增量规则**
>
> **v2 升级亮点**（与上一版对比）：
> - 团队从 4 角色升级为 **6 角色**（新增 `[MATLAB]` / `[REPORT]`）
> - 并行从 2-Agent 升级为 **N-Agent**（4-6 个 Agent 同时跑）
> - 加入 **CP-1.5 算法仿真验证检查点** 和 **CP-5 答辩演练检查点**
> - 内置 `modes/matlab-firmware-pipeline.md` 一键流水线，强制 MIL/SIL/PIL 三层验证
> - **自动决策门**（按 `refs/contracts.md` 的 Command Outcome Schema 自动路由）
> - 完整 Agent prompt 模板与流程示例：见 `refs/competition-ai-max-workflow.md`

---

## Agent 派发入口（两选一）

**优先用方式 A — 独立 subagent**（如果 `~/.claude/agents/embedded-*.md` 已装，本仓库默认已装）：

```python
Task(subagent_type="embedded-arch", description="CP-0b 路由", prompt="<具体任务>")
Task(subagent_type="embedded-drv",  description="...", prompt="...")
Task(subagent_type="embedded-alg",  description="...", prompt="...")
Task(subagent_type="embedded-qa",   description="...", prompt="...")
Task(subagent_type="embedded-matlab", description="...", prompt="...")
Task(subagent_type="embedded-report", description="...", prompt="...")
```

优势：独立 context = 主线压力小；prompt 已封装；可贡献回社区。**安装与速查**：`agents/README.md`。

**方式 B — 内嵌 prompt 模板**（subagent 未装时回退）：用 `subagent_type=general-purpose` + 把 `refs/competition-ai-max-workflow.md §2.1-2.7` 模板复制进 prompt。本文档下面的 [DRV]/[ALG]/[REPORT] inline prompt 即为 §2.1-2.7 的镜像。

> 一旦用方式 A，本文档下面的 inline prompt 仅作**口径参考**，不必照搬。

---

## 团队角色（v2 — 6 角色池，按题目 MAIN + TAGS 动态选）★v2 升级

不再固定 6 角色全派。改成**角色池**：`[ARCH] [DRV] [ALG] [QA] [REPORT]` 5 个必选，`[MATLAB]` 1 个按 `refs/competition-task-router.md` §2.1 表的"必选/可选/禁用"标签动态加入。

| 代号 | 角色 | 角色池标签 | 职责边界 |
|------|------|---------|---------|
| `[ARCH]` | 系统架构师（主线）| **必选**（任何题）| 第 0 步路由 / 三表 + 接口契约 / 决策门 / 集成 |
| `[DRV]` | 底层驱动 | **必选** | GPIO/UART/SPI/I2C/ADC/DMA/PWM/RTC 全部外设 |
| `[ALG]` | 应用层算法 | **必选** | 调 `.h` / 状态机 / CLI / 编解码 / 业务逻辑 |
| `[QA]` | 嵌入式验证 | **必选** | 静态审查 / MIL/SIL/PIL / 一键流水线 / 5 元组验收 |
| `[REPORT]` | 报告答辩 | **必选** | 5 元组验收 + 答辩 why-evidence + LaTeX |
| `[MATLAB]` | 算法仿真 | **看 MAIN**：SIGNAL/METER/MODEM/CONTROL/POWER 必选 / SYSTEM 看 TAGS / X 默认必选 | mcp__matlab__* + 导出 `.h` |

**视觉题处理**：含摄像头/赛道识别/目标追踪的题目，由独立 `auto-vision` skill 承担（embedded-dev 通过 Skill Handoff Contract 调用，参考 `refs/contracts.md` 跨 skill 协作示例）。本 skill 只做控制、计算、底层驱动。

**Agent 数量**：4-6 个，由 `refs/competition-task-router.md` §2.4 算出。完整 prompt 模板：`refs/competition-ai-max-workflow.md` §2。

**禁止**：不查 task-router 就拍脑袋全派 6 个（[MATLAB] 在纯外设集成题里空转浪费）。

---

## 版本控制规则

比赛模式采用**双层记录**机制，缺一不可：

| 层级 | 工具 | 粒度 | 用途 |
|------|------|------|------|
| 细粒度 | `编辑清单.md`（主协议机制） | 每次文件改动 | 记录改了哪个文件的哪个内容，方便追溯 |
| 阶段快照 | Git + GitHub | 每个阶段完成 | 可一键回退到任意阶段，远端备份防丢失 |

### Git 提交规范

```
提交格式：
[角色] 阶段N-简述

变更文件：
- 新增: xxx.c, xxx.h
- 修改: yyy.c
- 删除: （无）

说明：（可选，补充关键决策或注意事项）
```

示例：
```
[ARCH] 阶段一-硬件资源规划完成

变更文件：
- 新增: 项目规划清单.md, 编辑清单.md
- 新增: .gitignore

说明：引脚/DMA/中断优先级三张表已确认无冲突，接口契约 v1.0 冻结
```

### 提交检查点总览（v2）

| 检查点 | 触发时机 | 执行角色 | 标签 |
|--------|---------|---------|------|
| CP-0a | 工程目录 + git init | [ARCH] | `v0.0-init` |
| CP-0b | 题型路由 + Agent 派发表 | [ARCH] | `v0.0-routing` |
| CP-1 | 阶段一硬件资源规划完成后 | [ARCH] | `v0.1-arch` |
| **CP-1.5** ★新 | 阶段一半 — `[MATLAB]` 仿真达标后 | [ARCH] | `v0.15-sim` |
| CP-2 | 阶段二 N-Agent 并行开发均完成后 | [ARCH] | `v0.2-dev` |
| CP-3 | 阶段三 QA PASS（含 MIL/SIL/PIL）后 | [ARCH] | `v0.3-qa` |
| CP-4 | 阶段四集成完成后 | [ARCH] | `v1.0-release` |
| **CP-5** ★新 | 阶段五答辩演练完成后 | [REPORT] | `v1.1-rehearsed` |

> **修复迭代提交**：任一阶段 FAIL → 修复 → 再次 PASS 期间，每轮修复完成后追加提交，标签为 `v0.2-fix1`、`v0.2-fix2` 依此类推，不覆盖已有标签

---

## 执行流程

### ▶ CP-0a：[ARCH] 建临时赛题目录 + git init（**最先做**）★v2 修订

**为什么 git init 在路由之前**：路由产物（题型识别 / Agent 派发表 / 验收表）本身就是有价值的 artifacts，必须从一开始就纳入 Git 版本控制，否则中途换思路会丢失初始决策。

```bash
# 1. 创建工程目录
mkdir <competition-name>-2026 && cd <competition-name>-2026

# 2. git init + .gitignore（Keil/CubeIDE 模板见后文）
git init
echo "Listings/" > .gitignore
echo "Objects/" >> .gitignore
echo "*.uvguix.*" >> .gitignore
git add .gitignore
git commit -m "[ARCH] CP-0a 工程目录初始化"
git tag v0.0-init

# 3. 创建 docs/ 目录存路由产物
mkdir docs
```

---

### ▶ CP-0b：[ARCH] 读题与题型路由（git init 之后立即做）★v2 修订

**铁律**：CP-0a 之后**立刻**按 `refs/competition-task-router.md` 标签化路由。**禁止直接进 CP-1**。

```
[ARCH] CP-0b 执行：
  1. 完整读题（PDF / 命题书 / 评分细则）
  2. 套 task-router §1.5 关键词反例表（零基础友好）
  3. 套 §1.1 落 MAIN，§1.2 勾 TAGS
  4. 套 §2 → 派 4-6 个 Agent（看 MAIN + TAGS 角色池）
  5. 套 §3 → CP-1.5 / 流水线 Step 是否跳过？
  6. 套 refs/competition-scoring-checklist-template.md → 生成 5 元组验收表
  7. 全部写到 docs/competition-routing.md
  8. git commit + tag v0.0-routing
```

**禁止**：第 0 步用直觉判题型。比如把"系统集成题"派 [MATLAB] Agent 空转，或漏识别控制题里的 MOTOR/IMU TAG。

**docs/competition-routing.md 模板**（写入 docs/，含 v2.1 加权 TAG）：

```yaml
trace_id: <competition-name>-001
读题时间: 2026-08-01 09:00
题目: <赛事名> <年份> <题号> <题目名>

# 路由产物（来自 refs/competition-task-router.md 第 0 步）
MAIN: CONTROL                         # 7 选 1（SIGNAL/METER/MODEM/CONTROL/SYSTEM/POWER/X）
TAGS: [MOTOR, IMU, OLED]              # 0-N 个，来自 §1.2 / §1.5

# v2.1 分值加权 TAG（来自 §1.7，必填）
tag_weights:
  CONTROL_LOOP:
    total_score: 50
    percentage: 50%
    score_sources:
      - "《评分细则》§1.2 完成时间 ≤ 30s（25 分）"
      - "《评分细则》§1.3 超调 ≤ 10%（25 分）"
    triggers_agents: [MATLAB, ALG]
  MOTOR:
    total_score: 20
    percentage: 20%
    triggers_agents: [DRV, MATLAB]
  IMU_FUSION:
    total_score: 10
    percentage: 10%
    triggers_agents: [ALG, MATLAB]
  OLED_HMI:
    total_score: 5
    percentage: 5%
    triggers_agents: [DRV, ALG]
  POWER_STABILITY:    # 隐性扣分项
    total_score: -10
    percentage: 10%
    note: "低分高风险，单独验收"
    triggers_agents: [DRV]

评分单项最高: 25 分（来自《评分细则》"完成时间"或"超调"）
路由置信度: high                       # high / low（low 需人工确认）
派 Agent:                              # §2.4 + §1.7 加权后
  - ARCH（必选）
  - DRV（必选；负权 POWER_STABILITY 强制）
  - ALG（必选）
  - QA（必选）
  - REPORT（必选）
  - MATLAB（CONTROL_LOOP 50% → 必选）
  合计: 6 个

excluded_agents:
  - []                                 # 本题无排除

fallback_plan:                         # v2.1 必填
  if_MATLAB_unavailable: "scipy.signal + python-control 跑等价仿真"
  if_PIL_diverge: "Q15 缩放 + 二次校准"

跳过阶段:                              # 来自 §3
  - 无（CONTROL 题强制 SIL/PIL）

CP3_verify_budget:                     # v2.1 验收时间按权重切
  CONTROL_LOOP: 50%                    # 不少于 50% 验收时间
  MOTOR: 20%
  IMU_FUSION: 10%
  POWER_STABILITY: 10%                 # 红线项独立
  OLED_HMI: 5%
  其他抽查: 5%

验收表入口: docs/checklist-100分.md   # 由 checklist-template §5.2 + §5.3 生成
预期分数: ≥ 85 / 100

第 0 步耗时: 8 分钟
```

完成 8 步 + commit + tag 后才能进入 CP-1。

---

### ▶ .gitignore 模板（CP-0a 用）★保留

```gitignore
# Keil 编译产物
*.o
*.d
*.axf
*.map
*.lst
*.dep
*.htm
*.lnp
*.sct
*.uvguix.*
*.uvoptx
Listings/
Objects/

# STM32CubeIDE
Debug/
Release/
.cproject
.project
.settings/

# 系统文件
.DS_Store
Thumbs.db
```

**关联 GitHub 远端**（可选，CP-0a 后做）：

```bash
git remote add origin https://github.com/<队员>/<项目>.git
git push -u origin main
git push origin v0.0-init v0.0-routing
```

---

### ▶ CP-1 [ARCH] 硬件资源规划

**立即执行，输出以下三张表，确认无冲突后才能进入阶段二。**

**工具辅助**：规划引脚和外设时，用 **grok-search** 搜索官方数据手册（引脚复用表、外设通道映射、关键时序参数），用 **Document Skills** (`/pdf`) 提取表格数据，避免仅凭记忆填表。

#### 1.1 引脚分配表

```
引脚分配表：
┌──────┬────────┬──────────────┬──────────────────┬──────────────────────────┐
│ 引脚 │ 功能   │ 外设         │ 复用/重映射      │ 备注                     │
├──────┼────────┼──────────────┼──────────────────┼──────────────────────────┤
│ PA9  │ USART1 TX │ USART1    │ 无               │ 115200bps                │
│ PA0  │ ADC IN0│ ADC1 CH0    │ 无               │ 电压采样，12bit           │
│ PB6  │ TIM4 CH1│ TIM4       │ 无重映射         │ PWM 输出，1kHz           │
│ ...  │ ...    │ ...          │ ...              │ ...                      │
└──────┴────────┴──────────────┴──────────────────┴──────────────────────────┘
冲突检查：□ 无引脚被两个外设同时占用  □ 需要 AFIO 重映射的引脚已标注
```

#### 1.2 DMA 通道/数据流分配表（若使用 DMA）

```
DMA 分配表（以 STM32F1 为例，每个通道只能分配一个外设）：
┌───────────────┬──────────┬────────────┬──────────────────┐
│ DMA 通道      │ 分配外设 │ 传输方向   │ 触发源           │
├───────────────┼──────────┼────────────┼──────────────────┤
│ DMA1 CH1      │ ADC1     │ 外设→内存  │ ADC 转换完成     │
│ DMA1 CH4      │ USART1TX │ 内存→外设  │ USART1 发送空    │
│ ...           │ ...      │ ...        │ ...              │
└───────────────┴──────────┴────────────┴──────────────────┘
冲突检查：□ 无通道被分配给多个外设
```

#### 1.3 中断优先级矩阵

```
中断优先级矩阵（抢占优先级 / 子优先级，分组方式：[NVIC_PriorityGroup_X]）：
┌──────────────────────┬──────────┬──────────┬────────────────────────────┐
│ 中断源               │ 抢占优先 │ 子优先级 │ 理由                       │
├──────────────────────┼──────────┼──────────┼────────────────────────────┤
│ TIMx_IRQn（控制周期）│ 0        │ 0        │ 最高，控制实时性保证       │
│ USART1_IRQn          │ 1        │ 0        │ 通信不丢包                 │
│ ADCx_IRQn / DMA      │ 1        │ 1        │ 与串口同级，子优先区分     │
│ EXTIx（按键）        │ 2        │ 0        │ 低于控制和通信             │
└──────────────────────┴──────────┴──────────┴────────────────────────────┘
规则：抢占优先级数值越小越高；同抢占级不能互相打断；SysTick 默认最低
```

#### 1.4 模块接口契约

```
接口契约（v1.0）：
[外设模块]  返回类型  函数名(参数列表)         — 语义说明
[算法模块]  返回类型  函数名(参数列表)         — 语义说明
...
约定：初始化函数返回 uint8_t（0=成功，非0=错误码），禁止 void XXX_Init()
```

#### ✦ CP-1 提交检查点

三张表确认无冲突、接口契约冻结后，立即执行：

1. **将架构设计输出写入 `硬件资源表.md`**（引脚分配表、DMA 分配表、中断优先级矩阵、时钟配置），格式见 `refs/checklist-templates.md` 中的硬件资源表模板。此文件为全局共享，后续所有角色（DRV/ALG/QA）均直接引用
2. **将接口契约写入 `架构设计.md`**（接口契约 v1.0 + 设计决策说明）
3. 提交并打标签：

```bash
git add 项目规划清单.md 编辑清单.md 硬件资源表.md 架构设计.md
git commit -m "[ARCH] 阶段一-硬件资源规划完成

变更文件：
- 新增: 项目规划清单.md, 编辑清单.md, 硬件资源表.md, 架构设计.md

说明：引脚/DMA/中断优先级三表确认无冲突，接口契约 v1.0 冻结，硬件资源表已生成"
git push
git tag v0.1-arch && git push origin v0.1-arch
```

---

### ▶ 阶段一半（CP-1.5）：[MATLAB] 仿真验证 ★新

**目标**：在阶段二开始写嵌入式代码**之前**，先让 `[MATLAB]`（必派）跑通算法仿真，给出量化指标证据。仿真不通过 → 阶段二禁止开工（避免基于错误算法写代码）。

**为什么加这一步**：原版直接进阶段二并行开发 `[DRV]+[ALG]`，但 `[ALG]` 依赖的算法参数（K 矩阵 / 滤波系数 / LUT）必须先算出来。把仿真作为独立检查点，能让 `[ALG]` 进阶段二时拿到现成的 `.h` 文件，直接 `#include` 即可。

**视觉题处理**：含摄像头/赛道识别的题目，由独立 `auto-vision` skill 在 CP-1.5 同时派发，本 skill 通过 Skill Handoff Contract 消费其产物（参考 `refs/contracts.md`）。本 skill 文档不再展开视觉流程。

**派发方式**：[ARCH] 同一条消息发出 1 个 Agent（embedded-matlab，按题型）。

#### CP-1.5 - Agent: [MATLAB]（所有题型必派）

完整 prompt 模板见 `refs/competition-ai-max-workflow.md §2.2`。摘要：

```
你是 [MATLAB] 算法仿真工程师。基于：
1. 题目量化指标（精度 / 频响 / 失真度 / 稳定性）
2. 硬件资源表（采样率 / FPU 能力 / Flash 余量）
3. 接口契约（你的产出 .h 文件要被 [ALG] 直接 include）

执行：
1. mcp__matlab__detect_matlab_toolboxes 检测可用 toolbox
2. 选 modes/matlab-toolkit-competition.md 的 E1-E7 场景 或 主线 1-10 场景
3. mcp__matlab__run_matlab_file 跑设计脚本
4. 输出关键指标证据（必须量化，不许"应该可行"）
5. python tools/export_gains_to_c.py 导出 .h 到 app/dsp/ 或 app/control/

强制约束：
- 仿真未达指标 → status=blocked，禁止进入阶段二
- 编辑清单写 编辑清单_MATLAB.md
- Command Outcome 格式（refs/contracts.md）
```

#### ✦ CP-1.5 提交检查点

[MATLAB] 输出 `status=success` 且关键指标达标 → 提交：

```bash
# 合并 编辑清单_MATLAB.md 到主编辑清单
# 删除临时文件
git add app/dsp/*.h scripts/*.m 编辑清单.md 算法报告.md
git commit -m "[MATLAB] CP-1.5 算法仿真验证通过

变更文件：
- 新增: scripts/<算法>_design.m
- 新增: app/dsp/*.h（[MATLAB] 产物）
- 修改: 编辑清单.md

关键指标：
- THD = -58 dB （要求 -50 dB） ✓
- 测量精度 0.7%（要求 ± 1%） ✓"
git push
git tag v0.15-sim && git push origin v0.15-sim
```

**仿真未达标处置**：

- `[MATLAB] status=blocked` → 由 `[ARCH]` 重新评估算法方案（参数调整 / 不同方案），必要时回 CP-1 修订接口契约
- 同一 `root_cause_id` 累计达到 `retry_budget` → **必须人工裁决**：放弃高分项 / 换硬件 / 改题目方案
- **跨 CP 累计，不重置**：同根因在 CP-1.5 / CP-2 / CP-3 反复出现时共用一个计数槽，累计达到 `retry_budget = min(category_budget, severity_budget)` 即 STOP。详见 `refs/contracts.md §预算公式` retry_table 规则

---

### ▶ 阶段二：[DRV] + [ALG] (+ [REPORT]) N-Agent 并行开发

**使用 Agent 工具同时派出 2-3 个 Agent，各自独立工作。**

> **Agent 派发方式**（v2 升级）：在 Claude Code 中，使用一条消息同时发出 N 个 Agent 工具调用（parallel tool calls）。N 由题型决定：
> - 电赛信号 / 仪表 / 控制类：派 2 个（DRV + ALG）+ 可选 REPORT（写报告骨架）
> - 智能车电磁直立组：派 2 个（DRV + ALG）+ 可选 REPORT
> - 复杂综合题：3 个 Agent 同时跑（视觉部分外包给 `auto-vision` skill）
>
> 各 Agent 写自己的 `编辑清单_<ROLE>.md`，[ARCH] 收齐后合并到 `编辑清单.md`。
>
> 完整 Agent prompt 模板：**`refs/competition-ai-max-workflow.md` §2**
>
> **依赖关系**：[ALG] 进阶段二时 **必须**已经有 CP-1.5 产出的 `.h` 文件（K 矩阵 / 滤波系数 / LUT）。CP-1.5 跳过 / 失败 → 阶段二禁止开工。

---

#### Agent 1 — [DRV] 底层驱动工程师

```
你是底层驱动工程师 [DRV]，在主协议 RIPER-5 的基础规则（模块化编程、
命名规范、volatile规范、ISR纪律、通用初始化四步法）之上，
还必须遵守以下嵌入式比赛专项标准：

【接口契约】（严格遵守，禁止修改签名）
[粘贴 ARCH 输出的接口契约]

【硬件资源表】（严格按表配置，不得使用表外引脚/通道）
启动后先读取工程根目录的 `硬件资源表.md`，获取引脚分配、DMA 通道、中断优先级、时钟配置。
严格按表中记录配置，不得使用表外引脚/通道。若需变更资源，必须先更新硬件资源表再修改代码。

▌外设初始化顺序（必须遵守，违反会导致硬件锁死）
  1. 系统时钟配置（RCC / PLL）
  2. AFIO 重映射（如有）
  3. GPIO 初始化
  4. DMA 初始化（先于依赖它的外设）
  5. 各外设初始化（UART / SPI / I2C / TIM / ADC）
  6. NVIC 配置（最后使能中断，防止初始化未完成就触发）

▌时钟频率计算（必须显式注释，不允许靠猜）
  UART 波特率：BRR 寄存器值 = PCLK / (16 × 波特率)，注释写出 PCLK 值
  TIM 频率：计数频率 = PCLK / (PSC+1)，溢出频率 = 计数频率 / (ARR+1)
  ADC 采样时间：采样周期 ≥ 最小采样时间（查数据手册），注释写出来源
  SPI 时钟：PCLK / 分频系数，不超过从设备最大 SCK 频率

▌ADC 专项（竞赛常见错误区）
  - 规则采集必须用 DMA 模式，禁止在 ISR 中 while 等待转换完成
  - 多通道扫描模式下，DMA 缓冲区长度 = 通道数，声明为 volatile uint16_t[]
  - ADC 校准在初始化后、启动前执行（StdPeriph: ADC_ResetCalibration → ADC_StartCalibration）
  - 采样结果转换为实际值必须注明公式：V = (raw / 4095.0f) × VREF

▌TIM/PWM 专项
  - PWM 模式明确写出 OCMode（PWM1 / PWM2），注释占空比计算方式
  - 双通道互补输出（H 桥驱动）必须配置死区时间 DTG，防击穿
  - 输入捕获测频：低频用计数法（捕获两个上升沿），高频用测周法

▌I2C / SPI 专项
  - I2C 软件模拟方式必须有 SCL 超时保护，防总线死锁
  - SPI 片选 CS 必须在完整帧传输完毕后才拉高，不得提前

▌看门狗与故障恢复（竞赛必备，防现场卡死）
  - 必须启用独立看门狗（IWDG），超时建议 500ms-2s
  - 看门狗喂狗只在主循环中执行，禁止在定时器 ISR 中喂狗（会掩盖主循环卡死）
  - 看门狗复位后进入安全状态：电机 PWM 归零、输出关闭、蜂鸣器告警
  - 故障检测策略（任一触发 → 进入 ERROR 状态）：
    · 编码器连续 N 个周期读数为 0 → 电机堵转/断线
    · 电池 ADC 低于阈值 → 低电压保护
    · 传感器读数超出物理范围 → 传感器故障
    · 状态机单一状态停留超时 → 逻辑死锁

▌编辑清单记录（每个文件完成后必须更新）
  在 编辑清单_DRV.md 追加本次操作记录（格式遵循主协议编辑清单机制）
  注意：使用 _DRV 后缀文件，避免与 ALG Agent 并发写入冲突

【输出要求】
每个负责模块输出完整 .c 和 .h 文件，零 TODO，零占位符，接口符合契约，可直接编译。
完成后汇报：已完成的文件列表 + 编辑清单_DRV.md 已更新。
```

---

#### Agent 2 — [ALG] 算法控制工程师

```
你是算法控制工程师 [ALG]，在主协议 RIPER-5 的基础规则之上，
还必须遵守以下嵌入式比赛专项标准：

【接口契约】（只调用 DRV 暴露的接口，禁止直接操作寄存器）
[粘贴 ARCH 输出的接口契约]

【硬件资源感知】（读取硬件资源表了解引脚分配和外设复用）
ALG 不直接操作寄存器，但需要了解硬件资源分配以正确编写故障检测和状态机逻辑。
启动后先读取工程根目录的 `硬件资源表.md`，从中获取引脚分配、ADC 通道、定时器分配等信息，用于：
- 故障检测阈值设定（电压检测对应哪个 ADC 通道）
- 状态机中的 I/O 控制（按键/LED/蜂鸣器对应哪些引脚）
- 参数管理中的外设关联（电机 PWM 通道、编码器定时器）
若并行开发时硬件资源表尚不存在，则依据接口契约中的函数签名推断。

▌浮点与定点运算选择（根据芯片决定，不得随意使用浮点）
  有 FPU（Cortex-M4F/M7，如 STM32F4/H7）：可用 float，开启 -mfpu=fpv4-sp-d16
  无 FPU（Cortex-M0/M3，如 STM32F1/F0）：
    - 禁止在中断和主循环高频路径使用 float / double
    - 替代方案 A：Q15 定点（值域 -1.0~1.0，× 32768 表示）
    - 替代方案 B：整数缩放（如电压 × 1000 保留三位小数，用 int32_t）
    - 替代方案 C：查表法（sin/cos 预先计算，存 const int16_t[]，放 Flash）

▌PID 控制器规范（竞赛常见控制需求）
  typedef struct {
      int32_t  kp, ki, kd;    /* × 1000 的定点系数 */
      int32_t  integral;       /* 积分项，加限幅防饱和 */
      int32_t  integral_max;   /* 积分上限 */
      int32_t  last_error;     /* 上次误差，用于微分 */
      int32_t  output_min;
      int32_t  output_max;
  } PID_t;
  - 输出必须限幅 [output_min, output_max]
  - 积分抗饱和：误差符号与积分方向相反时才累积
  - 微分滤波：使用一阶低通 d_filtered = α × d_raw + (1-α) × d_filtered_prev

▌状态机规范（强制要求，多步骤流程必须用状态机）
  最低要求：必须包含 INIT → READY → RUN → ERROR → RECOVERY 五个基础状态
  typedef enum {
      ST_INIT,       /* 系统初始化 */
      ST_READY,      /* 就绪等待启动 */
      ST_RUN,        /* 正常运行（可含子状态） */
      ST_ERROR,      /* 故障安全（电机停、输出关） */
      ST_RECOVERY,   /* 故障恢复（自检→重回 READY） */
  } State_t;
  typedef struct {
      State_t   cur;
      uint32_t  enter_tick;   /* 进入当前状态的时间戳（SysTick ms）*/
      uint32_t  timeout_ms;   /* 0 表示不超时 */
  } FSM_t;
  - 状态转移集中在单一 Process() 函数的 switch-case，禁止分散
  - 每个状态必须处理超时跳转路径，不得出现永远无法离开的状态
  - ERROR 状态必须执行：PWM 归零 → 输出关闭 → 记录故障原因
  - RECOVERY 状态执行自检，通过后回到 READY，否则留在 ERROR

▌参数管理系统（竞赛调参核心）
  typedef struct {
      int32_t  speed_kp, speed_ki, speed_kd;
      int32_t  steer_kp, steer_ki, steer_kd;
      int32_t  target_speed;
      /* ...其他可调参数 */
      uint32_t crc;  /* 参数校验 */
  } Params_t;
  - 参数表用全局结构体，支持串口/蓝牙在线修改
  - 提供 Params_Save()（写入 Flash 最后一页）和 Params_Load()（上电读取）
  - 上电时 CRC 校验失败 → 加载默认参数
  - 多套参数预案：为不同赛道/电池电压准备 2-3 组参数，一键切换

▌滤波算法选型（ADC 噪声处理）
  窗口均值滤波：适合低速采样（< 1kHz），实现简单
  一阶低通：y = α × x + (1-α) × y_prev，α 用 Q15 表示，乘法后右移 15 位
  中值滤波：适合脉冲干扰，奇数窗口，排序用插入排序（短窗口下最快）

▌数值安全（嵌入式常见溢出场景）
  - 16bit ADC × 系数前先升为 int32_t，禁止 uint16_t × uint16_t 直接相乘
  - 除法前必须检查除数非零
  - 定时器计数差值做差前确认未溢出（用 uint32_t 差值天然处理单次溢出）

▌编辑清单记录（每个文件完成后必须更新）
  在 编辑清单_ALG.md 追加本次操作记录（格式遵循主协议编辑清单机制）
  注意：使用 _ALG 后缀文件，避免与 DRV Agent 并发写入冲突

【输出要求】
每个负责模块输出完整 .c 和 .h 文件，接口符合契约，集成后可直接编译。
若并行开发时 DRV 的 .h 尚不存在，在代码中 #include 对应头文件即可，
由 [ARCH] 集成阶段确保编译链路完整。
完成后汇报：已完成的文件列表 + 编辑清单_ALG.md 已更新。
```

---

**等待两个 Agent 均完成并汇报后，[ARCH] 执行汇总和 CP-2 提交。**

#### ✦ ARCH 汇总（CP-2 提交前必须完成）

1. **合并编辑清单**：将 `编辑清单_DRV.md` 和 `编辑清单_ALG.md` 的内容合并追加到 `编辑清单.md`，然后删除两个临时文件
2. **检查 #include 链路**：确认 ALG 的 `.c` 文件引用的 DRV `.h` 文件均已存在且函数签名一致
3. **确认接口契约合规**：快速比对两方产出的函数签名与阶段一冻结的接口契约

#### ✦ CP-2 提交检查点

```bash
git add .
git commit -m "[DRV+ALG] 阶段二-并行开发完成

变更文件：
- 新增: [DRV 产出的 .c/.h 文件列表]
- 新增: [ALG 产出的 .c/.h 文件列表]
- 修改: 编辑清单.md

说明：底层驱动与算法模块均已完成，待 QA 验证"
git push
git tag v0.2-dev && git push origin v0.2-dev
```

---

### ▶ 阶段三：[QA] 嵌入式专项验证 + 一键流水线 + MIL/SIL/PIL 三层验证

v2 升级：[QA] 不仅做静态检查，还**主动触发** `modes/matlab-firmware-pipeline.md` 完整跑一遍 6 步流水线 + MIL/SIL/PIL 三层验证。

#### 3.0 强制执行：一键流水线

```text
[QA] 跑 modes/matlab-firmware-pipeline.md：
  Step 1: mcp__matlab__run_matlab_file → 重跑 CP-1.5 的算法仿真
  Step 2: tools/export_gains_to_c.py → 确认 .h 与 CP-1.5 一致
  Step 3: /build-cmake | /build-keil | /build-iar → 编译固件
  Step 4: /flash-openocd | /flash-jlink → 烧录
  Step 5: /serial-monitor → 抓闭环 / 测量日志
  Step 6: mcp__matlab__evaluate_matlab_code → 实测 vs 仿真对比
```

任一步 status != success → [QA] 直接 FAIL，按 `refs/failure-taxonomy.md` 路由。

#### 3.1 MIL / SIL / PIL 三层验证（控制 / 滤波器 / 测量类题强制跑）

```text
MIL：mcp__matlab__evaluate_matlab_code 跑 Simulink 模型（或纯 .m 仿真）
     → 参考输出 mil_ref.mat
SIL：若用 Simulink + Embedded Coder：set_param 切 'Software-in-the-Loop (SIL)'
     → 生成 C 桌面编译 → sil_output.mat
     → 对比 mil_ref：差 < 1e-6 才通过
PIL：set_param 切 'Processor-in-the-Loop (PIL)' → 交叉编译到 MCU
     → 实测 pil_output.mat → 对比 mil_ref：差 < 1e-3 才通过
```

阈值见 `modes/matlab-embedded-toolkit.md` 场景 10 详细表。三层定位矩阵帮助定位 bug 在模型 / 代码生成 / 编译器 / 硬件哪一层。

#### 3.2 标准静态检查 + 嵌入式专项

逐项检查，**C 类或 D 类发现任何问题，禁止进入阶段四**：

```
[QA] 嵌入式竞赛验证报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【A. 接口与完整性】
  ✅/❌ 所有函数签名与接口契约完全一致（参数类型、顺序、返回类型）
  ✅/❌ 零 TODO / 零空函数体 / 零占位符
  ✅/❌ 所有 .h 文件有头文件保护宏
  ✅/❌ 返回值在每处调用处均被检查或显式 (void) 忽略

【B. 硬件资源合规】
  ✅/❌ 使用的引脚均在引脚分配表内，无表外引脚
  ✅/❌ DMA 通道无冲突（每通道只分配一个外设）
  ✅/❌ NVIC 优先级与矩阵一致，NVIC_PriorityGroupConfig 调用一次且在最前
  ✅/❌ 所有用到的外设时钟均已使能（最常见遗漏）

【C. 初始化顺序与时序（红线，有问题禁止进入阶段四）】
  ✅/❌ 外设初始化顺序符合规范（时钟→AFIO→GPIO→DMA→外设→NVIC）
  ✅/❌ 所有硬件轮询均有超时退出，无裸 while(flag)
  ✅/❌ ISR 中无 HAL_Delay / 轮询等待 / printf / malloc
  ✅/❌ NVIC 使能放在所有初始化完成之后
  ✅/❌ 时钟频率计算有显式注释，PSC/ARR/BRR 数值可验证

【D. 内存与数值安全（红线，有问题禁止进入阶段四）】
  ✅/❌ ISR/DMA 共享变量均声明 volatile
  ✅/❌ 无 FPU 平台的高频路径无 float/double 运算
  ✅/❌ ADC 原始值参与乘法前已升为 int32_t
  ✅/❌ DMA 缓冲区为全局/static，非栈上分配
  ✅/❌ 无 malloc / free

【E. 嵌入式常见错误专项】
  ✅/❌ ADC 多通道 DMA 缓冲区长度 = 通道数（非 1）
  ✅/❌ ADC 已执行校准（StdPeriph: ResetCalibration → StartCalibration）
  ✅/❌ SPI/I2C CS 片选在完整帧后才拉高
  ✅/❌ PWM 互补输出已配置死区时间（H桥场景）
  ✅/❌ 状态机无永远无法离开的状态（每个状态有超时出口）
  ✅/❌ PID 积分项有限幅，输出有限幅

【F. 故障容错与看门狗（竞赛现场防翻车）】
  ✅/❌ 独立看门狗（IWDG）已启用，喂狗仅在主循环中
  ✅/❌ 状态机包含 ERROR 和 RECOVERY 状态
  ✅/❌ ERROR 状态执行安全动作（PWM 归零、输出关闭）
  ✅/❌ 电机堵转/传感器断线/低电压有检测和保护
  ✅/❌ 参数管理有 Flash 保存和 CRC 校验

【G. 调试日志与可观测性】
  ✅/❌ 有串口/蓝牙调试输出（关键变量可实时观察）
  ✅/❌ 调试宏可一键关闭（发布版不输出调试信息，节省 CPU）
  ✅/❌ 故障时记录最后状态到 RAM/Flash（黑匣子功能）

【H. 实时性专项（红线，所有控制/采集类题强制 ★v2.1）】
  控制周期 jitter ____ μs / 阈值 ____ μs    ✅/❌
  ISR 最大耗时 ____ μs / 阈值 ____ μs       ✅/❌
  栈水位剩余 ____ %  / 阈值 ≥ 20%          ✅/❌
  CPU 占用率 ____ % / 阈值 < 70%            ✅/❌
  浮点路径单次 ____ μs（仅 FPU-less）       ✅/❌
  实测方式（必填）：GPIO toggle + 示波器 / DWT->CYCCNT / RTOS API

【I. 闭环控制指标（MOTOR / IMU TAG 强制 ★v2.2）】
  超调量 ____ % / 阈值 ____ %               ✅/❌
  调节时间 ____ s / 阈值 ____ s             ✅/❌
  稳态误差 ____ % / 阈值 ____ %             ✅/❌
  跟踪误差 ____ % / 阈值 ____ %（移动目标） ✅/❌
  抗干扰恢复 ____ s / 阈值 ____ s           ✅/❌
  数据出处：log/closed_loop_<timestamp>.csv（由 svc_logger 抓 ≥ 30s）
  分析脚本：scripts/closed_loop_analyze.m（matlab 处理 → 5 指标）

【J. 机电安全红线（MOTOR TAG 强制 ★v2.2，critical failure 不允许重试）】
  机械限位触发 → PWM 立即归零 + 告警        ✅/❌
  电机堵转 30s → ERROR 状态 + 电流截止      ✅/❌
  电池欠压 → SAFE + OLED 红警               ✅/❌
  看门狗复位测试（强制 5s 死循环→IWDG）     ✅/❌
  ERROR 状态禁止自动恢复（手动 reset）      ✅/❌
  数据出处：现场人为触发 + 串口日志

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
问题清单（模块 | 文件 | 问题 | 修复方案）：
  [序号] [DRV/ALG] file.c — 问题 → 修复方案
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
结论：PASS / FAIL（C类 N 项，D类 M 项，其他 K 项）
```

**FAIL 处理**：

修复执行方式（按问题规模选择）：
- **小修复**（≤3 处，单文件内改动）：由 [ARCH] 在主上下文直接修复，无需启动 Agent
- **大修复**（>3 处，或涉及多文件逻辑改动）：启动新的定向修复 Agent，prompt 中包含 QA 问题清单和对应文件路径

修复后更新编辑清单.md → 提交修复快照 → [QA] 仅复查改动项

```bash
# 每轮修复完成后提交（fix 轮次递增）
git add .
git commit -m "[DRV/ALG] 阶段三修复-第N轮

修复项：
- [序号] file.c: 问题描述 → 修复内容"
git push
git tag v0.2-fixN && git push origin v0.2-fixN
```

**PASS 后执行 CP-3：**

```bash
git add 编辑清单.md
git commit -m "[QA] 阶段三-验证通过

说明：全部 A/B/C/D/E 类检查项通过，共经历 N 轮修复"
git push
git tag v0.3-qa && git push origin v0.3-qa
```

---

### ▶ 阶段四：集成 + 报告填数据（ownership 拆分）★v2 修订

**v2 修订（P0-3）**：原版让 `[ARCH]` 写 main.c 与 iron rule "arch 不写代码" 字面冲突；让 `[REPORT]` 改代码也违反 iron rule。CP-4 拆成 **3 个独立 owner**：

| 子动作 | owner | 工具 | 边界 |
|---|---|---|---|
| 集成 main.c + 时间片调度 | `embedded-alg` | Write/Edit/Bash | 写 `app/main.c`、连 `bsp_init / svc_init / app_run` |
| 填实测数据到报告 | `embedded-report` | Read/Write/Edit + mcp__matlab__ | 只改 `比赛报告.md` 的实测数据章节，**禁止改 .c/.h** |
| CP-4 验收复测 + 集成 PR 合并 | `embedded-arch` | Task/Bash | 派发上述两 Agent + 收 Outcome + 复测 + tag |

**ARCH 不再亲手 `Write main.c`**，但仍负责协调（派 Task / 决策 / 集成 PR / tag）。

**[REPORT] 派发 prompt** 详见 `refs/competition-ai-max-workflow.md §2.7`。摘要：

```
你是 [REPORT] 报告生成 Agent。
读所有 编辑清单_*.md + 项目规划清单.md + 硬件资源表.md
生成 LaTeX/Word 报告骨架，必须含：
  - 题目分析 + 量化指标
  - 系统方案框图
  - 关键算法原理（含公式）
  - 硬件方案 + BOM
  - 软件流程图
  - 实测数据 + 误差分析（调 mcp__matlab__ 画图）
  - 创新点 / 加分项

强制约束：
  - "为什么"段必须有非 AI 理由（标 "决策依据：见 研究发现.md §X"）
  - 数据必须有出处
  - 编辑清单写 编辑清单_REPORT.md
```



**ALG Agent 编写 `main.c`**（ARCH 派发 Task，不亲手写），采用**时间片轮询架构**（裸机下的类 RTOS 调度）：

```c
/* main.c 架构模板 */
#include "所有模块.h"

/* 时间片标志（由 SysTick 中断置位） */
volatile uint8_t flag_1ms  = 0;
volatile uint8_t flag_5ms  = 0;
volatile uint8_t flag_20ms = 0;

int main(void) {
    /* ——— 初始化区（严格按阶段一规定的顺序） ——— */
    SystemClock_Config();   /* 1. 时钟 */
    /* 2. AFIO（如有） */
    GPIO_AllInit();          /* 3. GPIO */
    DMA_AllInit();           /* 4. DMA */
    /* 5. 各外设 */
    IWDG_Init();             /* 看门狗最后初始化 */
    NVIC_AllEnable();        /* 6. 中断使能（最后） */
    Params_Load();           /* 加载 Flash 参数 */

    while (1) {
        IWDG_Feed();  /* 喂狗：仅在主循环 */

        if (flag_1ms) {   /* 1ms 高频任务 */
            flag_1ms = 0;
            Encoder_Update();
            PID_Speed_Calc();
        }
        if (flag_5ms) {   /* 5ms 中频任务 */
            flag_5ms = 0;
            Sensor_Read();
            PID_Steer_Calc();
            FSM_Process();    /* 状态机主循环 */
        }
        if (flag_20ms) {  /* 20ms 低频任务 */
            flag_20ms = 0;
            Debug_Output();   /* 串口/蓝牙调试输出 */
            Battery_Check();  /* 电压检测 */
        }
    }
}
```

2. 确认初始化调用顺序与阶段一规定的顺序一致
3. 确认所有 `IRQHandler` 函数名与中断向量表拼写完全一致
4. 确认所有 `#include` 链路完整，无循环依赖
5. 添加调试日志模块（可一键关闭）：

```c
/* debug.h */
#define DEBUG_ENABLE  1  /* 发布版改为 0 */

#if DEBUG_ENABLE
  #define DBG_LOG(fmt, ...) printf("[%lu] " fmt "\r\n", HAL_GetTick(), ##__VA_ARGS__)
#else
  #define DBG_LOG(fmt, ...)  /* 空操作，零开销 */
#endif
```

6. **[QA] 快速验证 main.c**：对 main.c 执行 QA 检查表中 A/C/F/G 类相关项
7. 更新 `项目规划清单.md` 和 `编辑清单.md`

#### ✦ CP-4 提交检查点（最终交付）

```bash
git add .
git commit -m "[ARCH] 阶段四-集成完成 v1.0

变更文件：
- 新增: main.c
- 修改: 项目规划清单.md, 编辑清单.md

说明：全部模块集成完毕，可直接编译烧录"
git push
git tag v1.0-release && git push origin v1.0-release
```

输出交付报告：

```
[ARCH] 比赛模式交付报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
芯片：[型号]  主频：[MHz]  固件库：[库名]  NVIC分组：[Group X]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
交付文件：
  main.c
  [模块].c / [模块].h  × N 个
  编辑清单.md / 项目规划清单.md
[QA] 验证：PASS（第 N 轮）
GitHub：已推送，标签 v1.0-release
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
回档方法：git checkout <标签名>  可还原到任意检查点
```

---

### ▶ 阶段五：[REPORT] 答辩演练 ★新

**目标**：通过 CP-4 后报告已生成，但答辩时**老师听学生说**，不听 AI 说。CP-5 强制做 10 个"为什么"问答演练，确保学生真懂方案。

**[REPORT] 在 CP-4 后跑**：

```text
[REPORT] 列出 10 个老师最可能问的 why：
  1. 为什么用 FFT 不用包络检波？
  2. 为什么选 4096 点 FFT 而不是 1024？
  3. 为什么 ADC 用三重交替模式？
  4. 为什么相对误差 ± 1% 而不是 ± 0.5%？
  ...

每个 why 配：
  - 回答模板（≤ 60 字）
  - 备用回答（如果老师追问）
  - 数据出处（编辑清单 / 仿真报告）
```

**强制要求**：每个 why 学生**亲自**模拟回答 1 次（不要求录音，但建议至少自己默念）。

**[ARCH] CP-5 提交**：

```bash
git add 答辩演练.md 比赛报告.md
git commit -m "[REPORT] 阶段五-答辩演练完成 v1.1

变更文件：
- 新增: 答辩演练.md（10 个 why + 回答模板）
- 更新: 比赛报告.md

说明：CP-5 完成，准备上场"
git push
git tag v1.1-rehearsed && git push origin v1.1-rehearsed
```

---

## 自动决策门（v2 核心）★新

[ARCH] 收齐 Agent 输出后按下表自动决策。每个 Agent 输出必须含 **Command Outcome**（见 `refs/contracts.md`）：

```yaml
status: success | partial_success | blocked | failure
summary: 一句话
evidence: [files / commands / indicators]
next_action: <下一步 / 下游 Agent>
failure_category: <见 refs/failure-taxonomy.md，仅非 success 时填>
```

### 决策矩阵

| 所有 Agent 状态 | [ARCH] 决策 | 用户介入 |
|---|---|---|
| 全部 success | 自动 CP-X 提交 + 进下一阶段 | ❌ 不打扰 |
| 任一 partial_success | 标记轮次失败 + 进修复轮 | ⚠️ 通知，不打断 |
| 任一 blocked | 暂停 + 列候选向用户 | ✅ 必须人工 |
| 任一 failure | 按 failure_category 自动路由 | ⚠️ 通知 |

### 自动失败路由

| failure_category | 自动处置 | category_budget |
|---|---|---|
| `environment-missing` | 列缺失依赖 + 安装命令 | 0（须人工装）|
| `project-config-error` | 回该 Agent + 提示配置项 | 3 |
| `connection-failure` | 阻塞 + 检查硬件 | 0 |
| `artifact-missing` | 回上游 Agent | 3 |
| `target-response-abnormal` | 进 `refs/systematic-debugging.md` | 3 |
| `permission-problem` | 阻塞 | 0 |
| `ambiguous-context` | **必须人工** | 0 |
| `realtime-violation` ★v2.1 | 进 `refs/systematic-debugging.md` 查实时性 | 2 |

> 上表为 `category_budget`。实际 `retry_budget = min(category_budget, severity_budget)`，其中 `severity=critical` 时为 0（1 次后必须人工裁决）。**按 `root_cause_id` 全局累计、跨 CP 不重置**（非"每个 Agent 各计 3 次"）。权威定义见 `refs/contracts.md §预算公式`。

---

## 比赛模式核心规则

| 规则 | 说明 |
|------|------|
| **速度优先** | 各阶段完成后立即进入下一阶段，无需等待用户确认（FAIL 除外） |
| **硬件资源即契约** | 阶段一三张表确认后，引脚/DMA/优先级不得私自变更 |
| **接口即契约** | 函数签名冻结，各角色不得单方面修改 |
| **零占位** | 所有文件可编译，禁止 TODO / 空函数体 |
| **零裸轮询** | 所有硬件等待必须有超时退出 |
| **C/D 类红线** | QA 报告中 C/D 类有任何问题，禁止进入阶段四 |
| **双层记录** | 编辑清单.md（细粒度）+ Git 标签（阶段快照）缺一不可 |
| **角色标识** | 每段输出开头标注 `[ARCH]` / `[DRV]` / `[ALG]` / `[QA]` |
| **看门狗必启** | IWDG 必须启用，喂狗仅在主循环，ISR 中禁止喂狗 |
| **故障即安全** | 任何故障检测 → 电机 PWM 归零 → 进入 ERROR 状态 |

---

## 紧急回档操作指南

比赛现场代码出问题时，**30 秒内恢复到稳定版本**：

### 快速回档（保留当前修改）

```bash
# 查看所有检查点标签
git tag -l

# 回退到指定检查点（保留工作区改动，方便后续修复）
git stash             # 暂存当前改动
git checkout v0.3-qa  # 切换到 QA 通过的版本

# 编译烧录后确认可用，再考虑是否恢复改动
git stash pop         # 恢复暂存的改动（可选）
```

### 硬回档（放弃所有修改）

```bash
# 直接回到上一个稳定版本，丢弃所有未提交的修改
git checkout v0.3-qa -- .
git checkout v0.3-qa -- main.c  # 或只回退某个文件
```

### 回档决策表

| 场景 | 操作 | 命令 |
|------|------|------|
| 刚改了一个文件导致编译失败 | 只回退该文件 | `git checkout HEAD -- <file>` |
| 改了多个文件，不确定哪个出问题 | 暂存后回退到稳定点 | `git stash && git checkout <tag>` |
| 烧录后完全不能运行 | 硬回档到上一个通过的版本 | `git checkout v0.3-qa -- .` |
| 需要在稳定版上做小修改 | 从稳定标签创建修复分支 | `git checkout -b hotfix v0.3-qa` |

> **黄金法则**：比赛现场任何修改前，先 `git add -A && git commit -m "赛场备份"` 保存当前状态，再修改。宁可多一个提交，也不要丢失能用的代码。

---

## 三人极简模式（Mini）★新

针对 3 人队 / 时间紧 / 队员不熟 git/MCP 的场景，v2 极限模式（6 Agent + 6 阶段 + 多次 commit）确实过重。Mini 模式压缩到**最小可跑**。

### 触发条件

- 队伍 3 人及以下
- 全员有 1+ 人不熟 Git / MCP 调用
- 决赛时间 ≤ 48 小时
- 复赛及以前不上 PIL

### Agent 压缩：4 → 3 个

| Agent | 合并角色 | 谁来扮 |
|---|---|---|
| `[CAPTAIN]` | [ARCH] + [REPORT] | 队长（统筹 + 报告）|
| `[HARD]` | [DRV] + 硬件焊接 | 硬件队员 |
| `[SOFT]` | [ALG] + [QA] + [MATLAB] | 软件队员（主用 Claude）|

注意：**Claude 仍然按角色派 Agent**，但人类参与时合并。即：Claude 内部派 6 Agent 输出，3 人按角色合并 review + 推进。

### 阶段压缩：6 → 4 个

| Mini 阶段 | 对应 v2 阶段 | 时间预算 |
|---|---|---|
| **mini-init** | CP-0a + CP-0b | 30 分钟 |
| **mini-sim** | CP-1 + CP-1.5 + CP-2 | 6-10 小时 |
| **mini-hw** | CP-3 + CP-4（不跑 PIL）| 4-8 小时 |
| **mini-final** | CP-5 | 1-2 小时 |

### 跳过项（损失换速度）

- ⏭️ PIL（Processor-in-the-Loop）— 直接上板实测
- ⏭️ 静态分析（arch-check.sh）— 时间够再跑
- ⏭️ 远端 git push — 本地 commit 即可
- ⏭️ 双区 Flash CRC（如果题型 E）— 单区即可
- ⏭️ 多文件分模块 — `service/` 内单 `.c` 也行（但 main.c 不能塞业务）

### Mini 模式 Git 简化

```bash
# 4 个 tag 即可，不要 7 个
git tag v0-init
git tag v1-sim-ok
git tag v2-hardware-ok
git tag v3-final
```

### 答辩时怎么说

**禁**：说"用了 Mini 模式"（评审会扣分）。
**对**：按"完整流程"说，但只列做了的部分。

### 与 task-router 联动

```
[ARCH] CP-0b 路由完，多写一行：
mode: mini                            # 三人极简模式开启
```

---

## v2 极限工作流参考资源

| 文件 | 用途 |
|---|---|
| `refs/competition-ai-max-workflow.md` | 完整 6 Agent prompt 模板（直接 copy-paste 派发） + 自动决策门 + 完整流程示例 |
| `refs/competition-index.md` | 历年电赛赛题映射 → 快速定位 E1-E7 场景 |
| `modes/matlab-firmware-pipeline.md` | 一键流水线（算→.h→编译→烧→监→对比），CP-3 [QA] 强制调用 |
| `modes/matlab-toolkit-competition.md` | 7 个竞赛专项场景（E1-E7） |
| `modes/matlab-embedded-toolkit.md` | 10 场景算法主线（基础 1-8 + Simulink 9 + MIL/SIL/PIL 10） |
| `refs/contracts.md` | Command Outcome Schema 标准格式 |
| `refs/failure-taxonomy.md` | 8 类失败分类 + 自动路由参考 |

### 典型派发流程（电赛 4 天压缩到 1.5-2 天）

```
T+0       [ARCH] 读题 → CP-0
T+0.5h    [ARCH] 三表 + 接口契约 → CP-1
T+2h      派 [MATLAB]（视觉题另派 auto-vision skill）
T+5h      CP-1.5 通过
T+5h      同消息派 [DRV] + [ALG] + [REPORT]
T+10h     CP-2 通过
T+12h     [QA] 跑流水线 + MIL/SIL/PIL → CP-3
T+16h     [ARCH] + [REPORT] 集成 → CP-4
T+18h     [REPORT] 答辩演练 → CP-5
T+18h ~ T+72h   纯硬件调试 / 多次试跑 / 备份方案
```

完整示例见 `refs/competition-ai-max-workflow.md §5`。

### 工业系统集成题分支（CIMC 西门子杯 / 电赛仪表题 等）

当题目属于"多外设集成 + 弱算法"类型（典型：电压采集 + CLI + TF 文件系统 + Flash 持久化 + OLED 显示），按下面流程跑：

```
T+0      [ARCH] 读题 → 8 子系统拆解（参考 modes/industrial-data-acquisition.md）
T+0.5h   [ARCH] 三表 + 接口契约 → CP-1
T+1h     CP-1.5 跳过（无算法仿真需求，[MATLAB] 不派）
T+1h     同消息派 4 Agent：[DRV] + [ALG] + [QA] + [REPORT]
T+8h     CP-2 通过 → CP-3 [QA] 跑流水线 Step 3-5（编译/烧/监），跳过 Step 1-2/6
T+12h    [ARCH] + [REPORT] 整合 → CP-4 → CP-5
T+12h ~  剩余时间：边界测试 / 多次试跑 / 答辩演练
```

典型用例（西门子 CIMC 2025）：

- 主入口 mode：`modes/industrial-data-acquisition.md`
- CLI 框架：`refs/cli-command-framework.md`
- 端到端示例：`refs/example-siemens-cimc-2025.md`
