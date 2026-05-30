# 竞赛 AI 完赛 — 单页 15 分钟快速通道

> 第一次用本 skill 打竞赛的同学读这一张表就够。**不读完不上手**。
>
> 读完这页 → 知道按啥顺序读啥文件 → 自己拿到题目能起步。
> 比完整文档（30+ 个 md）省 4 小时学习曲线。

---

## 🎯 5 分钟核心：3 个文件 + 1 句话

```
1. SKILL.md            — 触发词 + 路由表（不用全读，知道有就行）
2. refs/competition-task-router.md  — 第 0 步必读：MAIN + TAGS 路由
3. refs/competition-scoring-checklist-template.md  — 第 0 步必读：5 元组验收表
```

**一句话工作流**：
> 拿到题 → router 落 MAIN + TAGS → checklist 出 100 分追踪表 → 派 4-6 Agent → 6 阶段 CP-0~CP-5 → 完赛
>
> 含视觉的题目（摄像头/赛道识别/目标追踪）：视觉部分外派给独立 `auto-vision` skill。

---

## 🚀 10 分钟首跑：从读题到派 Agent

### Step 1（2 分钟）：Claude 这样起手

打开 Claude Code，输入：

```
启用比赛模式

题目（PDF 全文贴这里）：
<把题目原文粘贴完整>

硬件：<MCU 型号> + <外设清单>
团队：N 人
时间：M 天
```

### Step 2（3 分钟）：[ARCH] 自动跑 CP-0a + CP-0b

Claude 会自动：

1. `mkdir <题目>-project && cd && git init`（CP-0a）
2. 读题 → 套 `task-router` 决策树
3. 落 MAIN（7 选 1）+ TAGS（0-N 个）
4. 派 4-6 个 Agent（按角色池表）
5. 生成 100 分验收表
6. 写入 `docs/competition-routing.md` + git tag v0.0-routing

你做的：**看 docs/competition-routing.md 验证 MAIN 对不对**。错了立刻让 Claude 重判。

### Step 3（5 分钟）：CP-1 三表 + 接口契约

Claude 会让 [ARCH] 写：
- 引脚分配表
- DMA 通道表
- 中断优先级表
- 接口契约（函数签名清单）

你做的：**看引脚有没有冲突 / 跟你硬件对得上**。

---

## 📋 第 0 步必做检查（防翻车）

| 检查项 | 怎么检查 | 错了怎么办 |
|---|---|---|
| **MAIN 对吗** | 题目"评分细则"单项最高分对应的功能 = MAIN | 让 Claude 看 `task-router §1.5 关键词反例表` 重判 |
| **TAGS 全吗** | 看 §1.2 表逐个对题目内容 | 让 Claude 补 |
| **Agent 数量合理吗** | 4 人队默认 4-5 个、6 人队最多 6 个 | 资源紧 → 改 4 个最小集 |
| **验收表总分=100 吗** | 5 元组累加 | 漏了/多了立刻补/删 |
| **创新点列了吗** | 至少 1 个加分项 | 答辩前补 |

---

## 🏗️ 6 阶段流程概览（每阶段 1 句话）

```
CP-0a (5min)   建目录 + git init                        ← 跑过即可
CP-0b (10min)  读题 → 路由 → 验收表 → git tag           ← 关键决策
CP-1  (1-2h)   硬件三表 + 接口契约 → git tag v0.1-arch  ← 冻结接口
CP-1.5 (2-4h)  [MATLAB] 仿真（仅算法题）→ v0.15-sim     ← SYSTEM 题跳过
CP-2  (4-8h)   N-Agent 并行开发 → v0.2-dev              ← 主力开发
CP-3  (2-4h)   [QA] 流水线 + MIL/SIL/PIL → v0.3-qa      ← 验证闸口
CP-4  (1-2h)   集成 + [REPORT] 报告 → v1.0-release      ← 交付
CP-5  (1h)     答辩演练（10 个 why）→ v1.1-rehearsed   ← 上场前
```

每阶段都打 git tag，**4 天 72 小时核心工时 12-22 小时**，剩下时间硬件调试 + 多次试跑。

---

## 🧰 6 角色 Agent 速查

| Agent | 干啥 | 何时派 |
|---|---|---|
| `[ARCH]` | 主控 + 路由 + 集成 + 决策门 | **任何题** |
| `[DRV]` | 全部外设驱动 | **任何题** |
| `[ALG]` | 应用层算法 + CLI + 状态机 | **任何题** |
| `[QA]` | 验证 + MIL/SIL/PIL + 5 元组验收 | **任何题** |
| `[REPORT]` | 报告 + 答辩 why-evidence | **任何题** |
| `[MATLAB]` | 算法仿真 + .h 导出 | MAIN ≠ SYSTEM（或 SYSTEM 含 FFT/RF 标签）|

> 视觉相关任务（摄像头驱动 / 二值化 / 透视变换 / 模型部署）外派给独立 `auto-vision` skill，不在本 skill 角色池。

---

## 📁 不同题型的文件读取路径（按 MAIN）

读到这里你已经知道**第 0 步该怎么走**。需要深入细节时按下表读：

| MAIN | 主入口（必读）| 实战示例（参考）|
|---|---|---|
| SIGNAL | `modes/matlab-toolkit-competition.md` §2 E1 | `refs/matlab-example-dds-signal-gen.md` |
| METER | 同上 §4 E3 | `refs/matlab-example-thd-meter.md` |
| MODEM | 同上 §3 E2 | `refs/matlab-example-modem-am.md` |
| CONTROL | `modes/matlab-embedded-toolkit.md` §5 控制器 | `refs/lqr-example-segway.md` + `refs/lqr-example-bicycle-cornell.md` |
| SYSTEM | `modes/industrial-data-acquisition.md` | `refs/example-siemens-cimc-2025.md` |
| POWER | `modes/matlab-toolkit-competition.md` §7 E6 | —（电源题以 PCB 为主）|

含 CLI/STORAGE/LOG TAGS：加读 `refs/cli-command-framework.md`
含视觉（摄像头/赛道识别等）：调用独立 `auto-vision` skill

---

## 🚨 5 个常见坑（赛场踩过的）

| 坑 | 表现 | 修复 |
|---|---|---|
| 跳过路由直接干 | Agent 派错 / 漏 TAG | 永远先 CP-0b 再 CP-1 |
| Agent 全派 6 个 | 主上下文炸 / [MATLAB] 空转 | 看 task-router §2.4 实际算 |
| MATLAB 仿真没过就上板 | 实测和仿真差 30% | CP-1.5 status≠success 不准进 CP-2 |
| 答辩说"AI 给的方案" | 老师追问翻车 | CP-5 每个 why 绑实验证据 |
| Git 不打 tag | 出错时无法回档 | 每个 CP 必打 v0.X-* tag |

---

## 📞 路径选择（按你现在的状态）

```
我现在是……
│
├── 完全没用过 MATLAB / Claude → 先读 refs/matlab-hello-5min.md（5 分钟跑通最小闭环）
│
├── 用过 MATLAB / Claude 但没打过竞赛 → 读 refs/example-siemens-cimc-2025.md（看一道完整题）
│
├── 队伍 3 人 + 时间紧 → 读 modes/competition.md "三人极简模式"段
│
├── 我现在要开始干 → 输入"启用比赛模式 + 题目"给 Claude
│
└── Claude 给出的方案我不放心 → 让 Claude 列 5 元组验收表 + 5 个反方案对比
```

---

## ⚠️ 这页文档的"边界"

**包含**：
- 第 0 步必须做什么
- Agent 怎么选
- 阶段大致顺序
- 5 个常见坑

**不包含**（要进对应文档）：
- 具体算法实现（看 matlab-* mode + example-*）
- Git 命令细节（看 competition.md "紧急回档"段）
- Agent prompt 内容（看 competition-ai-max-workflow.md）
- 失败兜底分类（看 refs/failure-taxonomy.md）

读完本页 + 任选 1 个实战示例 = **能跑通本 skill 的最小知识集**。
