# 竞赛题型路由器（Task Router）

> **元层文档**：任何嵌入式竞赛题，[ARCH] 拿到题目原文后**第 0 步必读本文**，按决策树落到具体的 mode + Agent 分工 + 评分点模板。
>
> 适用：电赛 / 蓝桥杯嵌入式 / 西门子杯 / 工创赛 / 校级 / 省级所有嵌入式赛事。视觉题由独立 `auto-vision` skill 承担。
>
> 设计原则：**只做路由不做实现**。本文不超 500 行，所有具体方法见对应 mode / refs。
>
> **权威分工（勿混淆两个路由文件）**：
> - `refs/competition-task-router.md`（本文）= **静态路由方法论**（决策树 / 角色池矩阵 / 阶段跳过规则），版本受控、跨项目复用，是"怎么路由"的唯一规则源。
> - `docs/competition-routing.md` = **每个项目现场生成的路由决策产物**（[ARCH] 在 CP-0b 按本文规则填出的 MAIN + TAGS + 置信度 + Agent 分工），是"本题路由成什么"的唯一结果源，各 Agent（含 embedded-matlab）运行时读它。
> - 二者是"规则 vs 实例"关系，非重复；改路由规则改本文，查本项目分工读 `docs/competition-routing.md`。

---

## 0. 使用方式（[ARCH] 第 0 步）

```
输入：题目原文（PDF 文字 / 命题书 / 评分细则）
   ↓
Step 1：用 §1 决策树落到 6 大题型之一
Step 2：用 §2 表查"应该派哪些 Agent"
Step 3：用 §3 表查"该跳过哪些 CP"
Step 4：把题目评分点喂给 refs/competition-scoring-checklist-template.md，生成验收表
   ↓
输出（写入 **docs/competition-routing.md**，由 [ARCH] 在 CP-0b 阶段产出）：
  - 题型: <控制 / 信号源 / 仪表 / 通信 / 系统集成 / 电源-模电>
  - 派 Agent: [DRV] [ALG] [MATLAB?] [QA] [REPORT?]
  - 跳过: CP-1.5 ? / Step 6 ?
  - 验收表入口: docs/checklist-100分.md

> **位置约定**（v2.1 修订）：
> - 路由产物（含 tag_weights） → `docs/competition-routing.md`
> - 100 分验收表 → `docs/checklist-100分.md`
> - 比赛状态机（competition_state YAML） → `项目规划清单.md` 顶部（fenced YAML）
> 三者**各自有专属位置**，不要再写"放项目规划清单顶部"了 — 早期版本遗留，已修。
```

**CP-0b 硬门禁**：`docs/competition-routing.md` 未生成或缺 MAIN/TAGS/置信度任一字段 → CP-0b 不通过 → **CP-1 不放行**（[ARCH] 不得跳过路由直接派 Agent）。最小模板（[ARCH] 照填）：

```yaml
# docs/competition-routing.md (CP-0b 产物)
routing:
  main: CONTROL              # SIGNAL/METER/MODEM/CONTROL/SYSTEM/POWER/X 之一
  tags: [MOTOR, IMU, FFT]    # 见 §1.2
  tag_weights: {MOTOR: 40, IMU: 25, FFT: 15}   # 各 TAG 估分占比 %
  confidence: high           # high/medium/low；low → 暂停问用户
  agents: [ARCH, DRV, ALG, MATLAB, QA, REPORT]  # 4-6 个
  skip: {CP-1.5: false, step6: false}
  vision_handoff: false      # true 则视觉部分派 auto-vision skill
  checklist: docs/checklist-100分.md
```

完成 Step 1-4（即生成上表）才能进入比赛模式 v2 的 CP-1。

---

## 1. 标签化路由（主对象 + 能力标签）★v2 升级

**v1 单一题型决策树的致命问题**：真实赛题多数是复合的（如"含通信的电源题"会同时命中 C/F），强行落到单一 box 会让后续 Agent 派发与验收表全部跑偏。

**v2 改用标签化**：

```
题目 → MAIN（主评分对象，1 个）+ TAGS（次要能力标签，0-N 个）
```

### 1.1 7 种主评分对象 MAIN（按"该题最大分值落在哪"判定）

| MAIN | 主评分聚焦 | 代表题 |
|---|---|---|
| `SIGNAL` | 输出信号的精度（频率/失真/幅度）| 2001A 波形发生器 |
| `METER` | 测量信号的精度（频率/THD/调制度）| 2021A 失真度分析仪 |
| `MODEM` | 解调 / 调制识别 / 通信链路 | 2022F 调制度测量 |
| `CONTROL` | 控制性能（超调/调节时间/跟踪精度）| 2019A 电动小车动态行驶 |
| `SYSTEM` | 系统功能完成度（CLI 命令/文件/持久化）| 2025 西门子 CIMC |
| `POWER` | 电源 / 模电指标（效率/纹波/线性度）| 2023A 电源类 |
| `X` | **未归类 / 复合主对象** — 10 分钟内必须人工定主 | 罕见题 |

**判定铁律**：看题目"评分细则"哪一类**单项满分最高**，那就是 MAIN。

### 1.2 能力标签 TAGS（0-N 个，描述次要技术需求）

| 标签 | 触发条件 | 影响 Agent 派发 |
|---|---|---|
| ~~`VISION`~~ | 题目有摄像头 / 图像识别 | **不在本 skill 范围** — 外派给 `auto-vision` skill |
| `RF` | 题目有载波 / 调制 / 射频 | + [MATLAB] 重点跑 Communications Toolbox |
| `STORAGE` | 题目要求 SD/Flash 存数据 | [DRV] 加文件系统模块 |
| `CLI` | 题目要求串口命令交互 | [ALG] 加 CLI 框架 |
| `LOG` | 题目要求操作日志 | [ALG] 加日志模块 |
| `RTC` | 题目要求时间戳 | [DRV] 配 RTC |
| `OLED` | 题目要求显示 | [DRV] 加显示驱动 |
| `MOTOR` | 题目有电机 / 舵机 / PWM 输出 | [DRV] + [ALG] 控制律 |
| `IMU` | 题目要求姿态融合 | [MATLAB] 跑 Kalman |
| `FILTER_ADAPT` | 题目要求自适应滤波 / LMS | [MATLAB] 跑 E5 |
| `FFT` | 题目要求频谱分析 | [MATLAB] 跑 FFT 场景 3 |
| `MULTIMOD` | 题目要求多种调制方式识别 | [MATLAB] 跑 E2 自动识别 |
| `LOWPOWER` | 题目强调低功耗 / 电池供电 | [DRV] 加 sleep / [ALG] 降频策略 |

**没列出的能力**：自行加标签（如 `BLUETOOTH` / `CAN` / `ROBOT_ARM`），但要在路由记录里说明。

### 1.3 决策步骤（10 分钟内完成）

```
Step 1：通读题目原文（5 分钟）
Step 2：找"评分细则"那张表，找单项满分最高的一行 → MAIN
Step 3：扫题目正文（含图示）勾出所有 TAGS（看 §1.2 表逐个匹配）
Step 4：写到 docs/competition-routing.md：
  MAIN: <CONTROL | SIGNAL | ...>
  TAGS: [MOTOR, OLED, IMU]
  评分单项最高: <分数> 分（来自<评分细则>第<X>条）
  路由置信度: <high | low>（low 时进 §1.4 兜底）
Step 5：进 §2 派 Agent（按 MAIN + TAGS 叠加）
```

### 1.4 路由置信度低 / MAIN=X 兜底

- 题目刻意复合（如电源 + 仪表 + 通信 3 评分模块平均）→ MAIN = X
- MAIN=X 处置：选**实施成本最高**的那个模块作为 MAIN（如电源稳定性成本最高），其他降为 TAGS

### 1.5 关键词反例表（零基础友好）★新

不熟悉控制 / 信号术语的同学按下表反查：

| 题目里出现的词 | 大概率 MAIN | 大概率 TAGS |
|---|---|---|
| "产生 / 输出 / 发生器" + 频率/波形 | SIGNAL | — |
| "测量 / 分析仪 / 计 / 检测器" | METER | FFT |
| "调制 / 解调 / 识别（AM/FM/PSK 等）" | MODEM | RF |
| "稳定 / 跟踪 / 追踪 / 平衡 / 倒立" | CONTROL | MOTOR / IMU |
| "小车 / 机器人 / 无人机 / 飞行器" | CONTROL | MOTOR / IMU（视觉部分外派 auto-vision）|
| "采集 / 记录 / 数据存储 / 日志" | SYSTEM | STORAGE / CLI / LOG |
| "DC-DC / AC-DC / 放大器 / 滤波器（硬件电路）" | POWER | — |
| "摄像头 / 图像 / 视觉" | — | **外派 `auto-vision` skill**（不在本 skill 范围）|
| "TF 卡 / SD 卡 / Flash 存储" | — | + STORAGE |
| "串口命令 / CLI / 控制台" | — | + CLI |
| "OLED / LCD / 显示屏" | — | + OLED |
| "电机 / 舵机 / PWM" | — | + MOTOR |
| "IMU / 加速度计 / 陀螺仪" | — | + IMU |
| "RTC / 实时时钟 / 时间戳" | — | + RTC |
| "射频 / 载波 / 调制" | — | + RF |
| "电池 / 低功耗 / 长续航" | — | + LOWPOWER |

### 1.6 复合题示例（v2 标签化的力量）

| 题 | v1 单题型（旧）| v2 标签化（新）|
|---|---|---|
| 2025 西门子 CIMC | E | MAIN=SYSTEM, TAGS=[STORAGE, CLI, LOG, RTC, OLED] |
| 2019A 电动小车动态行驶 | D（电机+编码器 PID 控制）| MAIN=CONTROL, TAGS=[MOTOR, IMU, OLED] |
| 2017A 微弱信号检测 | F（漏了滤波 + 仪表）| MAIN=POWER, TAGS=[FILTER_ADAPT, METER] |
| 2022F 调制度测量 | C（漏了仪表精度核心）| MAIN=METER, TAGS=[RF, MODEM, OLED] |

---

## 1.7 分值加权 TAG（v2.1 升级）★新

**v2 单选 MAIN 的剩余问题**：`v2` 把 MAIN 定成"评分细则单项最高分"，但电赛复合题往往 *单项最高 30 分 + 多个小项 5-8 分 + 多项隐性扣分*。如果只看 MAIN，会牺牲 *"低分高风险"* 模块（典型：电源稳定、掉电恢复、串口日志、按键交互、答辩演示）。

**v2.1 改法**：MAIN **仍单选**（决定题型默认架构），但 TAG **必须带加权分**，让 Agent 派发与验收表权重都按"加权分占比"自动算。

### 加权分提取流程（CP-0b 内嵌）

```
Step A：读题目"评分细则"原文，把所有评分条款分组：
  - 完成基本要求（一般 50-60 分）
  - 完成发挥部分（一般 30-40 分）
  - 现场报告/答辩（一般 10-20 分）
  - 隐性扣分项（违规-5/超时-10/...）
Step B：每个评分条款按"主要触发哪个 TAG"打 1-3 个 TAG（一个条款可挂多个）
Step C：每个 TAG 的总权重 = Σ(所属条款分值 × 触发系数)
       触发系数：主因=1.0 / 关联=0.5 / 边缘=0.2
Step D：TAG 排序，得到分值占比表
```

### TAG 权重表（写入 docs/competition-routing.md）

```yaml
tag_weights:
  CONTROL_LOOP:        # 控制律本身
    total_score: 35
    percentage: 35%
    score_sources:
      - "评分细则 §1.2 完成时间 ≤ 30s（20 分）"
      - "评分细则 §1.3 超调 ≤ 10%（15 分）"
    triggers_agents: [MATLAB, ALG]
  OLED_HMI:           # 人机界面（低分但答辩易被问）
    total_score: 5
    percentage: 5%
    score_sources:
      - "评分细则 §3.2 显示状态信息（5 分）"
    triggers_agents: [DRV, ALG]
  MOTOR:
    total_score: 10
    percentage: 10%
    triggers_agents: [DRV, MATLAB]
  POWER_STABILITY:    # 隐性扣分项
    total_score: -10   # 不稳定就扣分
    percentage: 10%
    score_sources:
      - "评分细则 §扣分项 电源不稳/抖动 -10 分"
    triggers_agents: [DRV]
    note: "低分高风险，必须独立验收"
```

### 派发规则（v2.1）

| TAG percentage | 派 Agent 力度 |
|---|---|
| ≥ 20% | 必派对应 Agent；CP-3 验收单独立项 |
| 10% ~ 20% | 必派对应 Agent；CP-3 合并验收 |
| 5% ~ 10% | 主 Agent 兼任；CP-3 必测但不阻断 |
| < 5% | 主 Agent 兼任；CP-3 抽查即可 |
| 负权重（扣分项）| 单独派 Agent；CP-3 单独红线验收（哪怕分值小） |

**强制规则**：CP-3 验收时间预算按 percentage 切配；20% 占比的 TAG 至少分 20% 的验收时间，禁止"主 Agent 通过了就算"。

### 兜底：若没有评分细则原文

罕见情况（题目过早 / 评分细则未公开）→ 用默认 TAG 模板（按 MAIN 给典型权重，见 `refs/competition-scoring-checklist-template.md` §A-F）。但 docs/competition-routing.md 的 `route_confidence` 必须降为 `low`，CP-0b → CP-1 前必须人工确认。

---

## 2. Agent 派发矩阵（标签化叠加）★v2 升级

不再"题型→Agent"一对多硬绑，改成**角色池**按 MAIN + TAGS 叠加选择。**v2.1 升级**：派发后还需检查 TAG percentage 权重（见 §1.7），权重 ≥ 10% 的 TAG 必派对应 Agent。

### 2.1 角色池（6 个 Agent：ARCH / DRV / ALG / QA / REPORT / MATLAB，按 MAIN 给"必选/可选/禁用"标签；下表表头 SIGNAL…X 为 7 类 MAIN 题型列，非 Agent）

| Agent | SIGNAL | METER | MODEM | CONTROL | SYSTEM | POWER | X |
|---|---|---|---|---|---|---|---|
| `[ARCH]` 主控 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 |
| `[DRV]` 驱动 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 |
| `[ALG]` 应用算法 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 |
| `[QA]` 验证 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 |
| `[REPORT]` 报告答辩 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 |
| `[MATLAB]` 算法仿真 | ✓ 必 | ✓ 必 | ✓ 必 | ✓ 必 | ⚠ 看 TAGS | ✓ 必 | 默认必选 |

> **视觉相关 Agent 不在本 skill 范围**。需要视觉的题目（含摄像头、赛道识别、目标追踪、SLAM 等）由独立 `auto-vision` skill 承担，通过 Skill Handoff Contract 调用。

### 2.2 TAGS 对角色池 + CP-3 验收的修订规则（v2.2 扩展）

| TAG | 派 Agent 修订 | CP-3 验收触发（强制必测） |
|---|---|---|
| `FFT`/`FILTER_ADAPT`/`RF` | [MATLAB] 即使 MAIN=SYSTEM 也升 ✓ 必选 | 实测频谱 vs 仿真精度对比 |
| `STORAGE`/`CLI`/`LOG` | [ALG] 内部添加对应模块（不增 Agent，只扩职责） | TF 卡多文件夹结构 + CLI 全命令覆盖 |
| `MOTOR` | [MATLAB] 必跑控制器仿真 | competition.md CP-3 §I 闭环指标（超调/调节/稳态/跟踪）+ §J 机电安全红线（critical, 不允许重试）|
| `IMU` | [MATLAB] 必跑 Kalman / Mahony 融合 | competition.md CP-3 §I 闭环指标 + 姿态漂移 ≤ 0.5°/min |
| `LOWPOWER` | [DRV] 加 sleep / 唤醒模块 | 电流测量：休眠 < 100 μA，唤醒响应 < 50 ms |

### 2.2.1 TAG 触发的验收红线优先级

`MOTOR` 触发的 §J 机电安全是 **critical failure**（不允许 retry，必须人工裁决），其他都是常规 failure（按 retry_budget 走）。详见 `refs/contracts.md §强制规则 #6` 预算公式 + `agents/embedded-qa.md §Closed-loop verification`。

### 2.3 最小 / 最大 Agent 数

- **最小可跑**：4 个（[ARCH] + [DRV] + [ALG] + [QA]） — 适合 3 人队 / 简单题
- **标准**：5-6 个（按 MAIN 默认）
- **最多**：6 个 — 复合题或大题
- **绝不超 6** — Claude 主上下文压力太大

### 2.4 派发例（用 §1.6 复合题表算一遍）

| 题 | MAIN | TAGS | 最终 Agent |
|---|---|---|---|
| 2019A 电动小车 | CONTROL | MOTOR, IMU, OLED | [ARCH] [DRV] [ALG] [QA] [REPORT] [MATLAB] = **6** |
| 2025 西门子 | SYSTEM | STORAGE, CLI, LOG, RTC, OLED | [ARCH] [DRV] [ALG] [QA] [REPORT] = **5**（不派 MATLAB）|
| 2017A 微弱信号检测 | POWER | FILTER_ADAPT, METER | [ARCH] [DRV] [ALG] [QA] [REPORT] [MATLAB] = **6**（电源 + 滤波算法）|
| 2022F 调制度测量 | METER | RF, MODEM, OLED | [ARCH] [DRV] [ALG] [QA] [REPORT] [MATLAB] = **6** |
| 2023A 电源类 | POWER | — | [ARCH] [DRV] [ALG] [QA] [REPORT] [MATLAB] = **6** |

---

## 3. 阶段跳过矩阵（按 MAIN）★v2 升级

| MAIN | CP-1.5（MATLAB 仿真）| CP-3 流水线 Step 1-2 | CP-3 流水线 Step 6 | 备注 |
|---|---|---|---|---|
| SIGNAL | ✅ 必做 | ✅ 必做 | ✅ 实测 THD vs 仿真 | — |
| METER | ✅ 必做 | ✅ 必做 | ✅ 测量精度对比 | — |
| MODEM | ✅ 必做 | ✅ 必做 | ✅ BER 实测对比 | — |
| CONTROL | ✅ 必做（重） | ✅ 必做 | ✅ MIL/SIL/PIL 三层 | 强制 SIL/PIL |
| SYSTEM | ⏭️ 跳过（若 TAGS 无 FFT/RF/FILTER_ADAPT 等算法标签） | ⏭️ 跳过 Step 1-2 | ⏭️ 跳过 Step 6 | 只跑编译/烧/监 |
| POWER | ✅ 必做（Simscape）| ⏭️ 跳过（不上 MCU）| ⏭️ 跳过 | 多为 PCB 题 |
| X | 按等价 MAIN 走 | 同上 | 同上 | MAIN=X 时先定主再查 |

**SYSTEM 题特殊规则**：若 TAGS 含 `FFT` / `RF` / `FILTER_ADAPT` / `MODEM` 等算法标签 → CP-1.5 **不能跳**，需派 [MATLAB] Agent 算关键系数（参考 §2.2 修订规则）。

---

## 4. 题型 → 验收表模板入口

每个题型对应 `refs/competition-scoring-checklist-template.md` 的特定章节：

| 题型 | 验收表章节 | 典型评分点 |
|---|---|---|
| A 信号源 | §A | 频率精度 / THD / SFDR / 波形类型 / 幅度范围 |
| B 测量仪表 | §B | 测量精度 / 测量范围 / 速度 / 显示更新 |
| C 通信解调 | §C | 调制度精度 / BER / SNR 适应范围 |
| D 机电控制 | §D | 完成时间 / 超调 / 稳态误差 / 抗干扰 |
| E 系统集成 | §E | 命令完整 / 文件完整 / 持久化 / 日志 |
| F 电源-模电 | §F | 效率 / 纹波 / 负载调节率 |

---

## 5. 历年题对照（即时验证）

> 用这张表验证你对题型的判断对不对。

### 5.1 电赛控制题（题型 D）

| 年-题号 | 题目 | 关键技术 | mode | Agent |
|---|---|---|---|---|
| 1997C | 水温控制 | PID + 温度采样 | 主线 4 | [MATLAB] [DRV] [ALG] [QA] |
| 2011F | 风力摆系统 | 多自由度控制 | 主线 4 + 5 LQR | + [MATLAB] 重 |
| 2019A | 电动小车动态行驶 | 电机 + 编码器 + 电磁循迹（无视觉）| 主线 4 + pid-tune | [MATLAB] |

> 含视觉的控制题（如 2017B/2023E/2024H 等需要摄像头识别）：视觉部分外派给 `auto-vision` skill；本 skill 负责控制律 / 电机驱动 / 状态机 / 通信。

### 5.2 信号源类（题型 A）

| 年-题号 | mode |
|---|---|
| 2001A 波形发生器 | E1 + `refs/matlab-example-dds-signal-gen.md` |
| 2005A 正弦信号发生器 | E1 |

### 5.3 仪表类（题型 B）

| 年-题号 | mode |
|---|---|
| 2021A 失真度分析仪 | E3 + `refs/matlab-example-thd-meter.md` |
| 2024B 单相功率分析仪 | E3 |
| 2015A 频率特性测试仪 | E3 + 扫频 |

### 5.4 通信类（题型 C）

| 年-题号 | mode |
|---|---|
| 2022F 调制度测量 | E2 + `refs/matlab-example-modem-am.md` |
| 2023D 调制识别 | E2 自动识别 |
| 2019F 短距离无线 | E2 + E1 |

### 5.5 系统集成（题型 E）

| 赛事-题号 | mode |
|---|---|
| 2025 CIMC 西门子杯初赛 | `modes/industrial-data-acquisition.md` + `refs/example-siemens-cimc-2025.md` |
| 类似工业 DAQ 题 | 同上 |

### 5.6 电源-模电（题型 F）

| 年-题号 | mode |
|---|---|
| 2019C 线性放大器 | E6 + E3（测频响）|
| 2023A 电源类 | E6 Simscape |
| 2017A 微弱信号检测 | E6 + E5 |

---

## 6. [ARCH] 第 0 步执行脚本（伪代码）

```
# 输入：题目 PDF 或文本
def archs_first_step(题目原文):
    # 1. 题型识别
    题型 = match_by_decision_tree(题目原文, §1)
    if 题型 is None:
        题型 = match_by_four_questions(题目原文, §1.1)

    # 2. 提取量化指标（输入到下游 Agent）
    指标列表 = extract_metrics(题目原文)
    # 例：电赛 2019A → [行驶时间 < 30s, 跟踪误差 < 5cm, 抗扰恢复 < 2s]

    # 3. 派 Agent
    agents = base_agents()  # [DRV] [ALG] [QA] [REPORT]
    agents += optional_agents_by_type(题型, §2)

    # 4. 阶段跳过
    skipped = stages_to_skip(题型, §3)
    # 例：题型 E → ['CP-1.5', 'Pipeline Step 1-2', 'Pipeline Step 6']

    # 5. 验收表生成
    checklist = generate_checklist(题目评分细则, 题型,
                                   from='refs/competition-scoring-checklist-template.md')

    # 6. 写入磁盘记忆
    write('项目规划清单.md', {
        '题型': 题型,
        '指标': 指标列表,
        'Agent': agents,
        '跳过': skipped,
        '验收表': checklist
    })

    # 7. 进入 CP-1
    proceed_to('CP-1: 三表 + 接口契约')
```

---

## 7. 常见判断错误

| 错判 | 真实 | 后果 |
|---|---|---|
| 把"控制 + 测量"题判成 B 仪表 | 题型 D 主 + B 次 | 漏掉 PID/LQR 设计 |
| 把"信号源 + 失真度自检" 判成 A | A 主 + B 次 | 没准备测量算法 |
| 把"工业题 + 算法处理" 判成 E | E + 弱 D 算法 | 误以为不用 MATLAB |
| 把"含摄像头的控制题"完全本 skill 接手 | D + 视觉子题型 | 视觉部分必须外派 `auto-vision` skill |
| 把"无人机题"判成 D | D + 飞行器子类 | 缺姿态控制专项参考 |

**纠正方法**：第 0 步输出题型判定后，让 **[QA] Agent 旁听**，对比题目原文 + 路由表挑战 [ARCH] 的判断。

---

## 8. 与其他文档的关系

```
本文件（task-router）= 元层路由器
   ↓ 指向 ↓
具体执行文档：
  ├── modes/competition.md          # 6-Agent 比赛模式 v2 主流程
  ├── modes/matlab-toolkit-competition.md   # MATLAB 竞赛专题（计算/控制类）
  ├── modes/matlab-embedded-toolkit.md      # 10 场景算法主线
  ├── modes/industrial-data-acquisition.md  # 系统集成 mode
  ├── refs/competition-scoring-checklist-template.md  # 验收表通用模板
  ├── refs/cli-command-framework.md         # CLI 框架
  ├── refs/example-siemens-cimc-2025.md     # 题型 E 实战
  ├── refs/matlab-example-*.md              # 各场景实战
  └── refs/lqr-example-*.md                 # 控制实战
  # 注：视觉相关由独立 `auto-vision` skill 承担，不在本目录
```

**禁止**：跳过 task-router 直接进 CP-1。这会导致后续 Agent 没有题型上下文，输出散乱。

---

## 9. 限制（诚实）

- 本路由器**仅做大类分流**，不替代专家判断。罕见交叉题（如"超声波避障 + 蓝牙通信 + OLED 显示"）需要 [ARCH] 自行裁决主次。
- 路由的"派 Agent"是建议，不是死规则。资源紧张时（队员少）可串行执行。
- 评分点提取依赖题目原文质量。如果题目本身模糊（如只写"完成度高"），需要先与评测员澄清。

完整工作流见 `modes/competition.md` + `refs/competition-ai-max-workflow.md`。
