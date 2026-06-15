# auto-embedded 工作流 · 比赛变体（RIPER-5 + 6-Agent CP 门禁）

> RIPER-5 主干不变，但由 `modes/competition.md` 的 6 个专职 subagent 并行推进、embedded-arch 唯一决策/路由/集成，
> 配合 CP-0~CP-5 决策门与 Defect Ticket 回派协议。适合时间紧、并行度高的竞赛/攻坚。
> 详细分工与各 CP 门禁判据见 `.auto-embedded/modes/competition.md`。
> UserPromptSubmit hook 按 active task 的阶段从下面 `[workflow-state:阶段]` 块取一行面包屑注入。

每条回复开头声明当前阶段：`[MODE: RESEARCH|INNOVATE|PLAN|EXECUTE|REVIEW]`。
6 个 Agent：embedded-arch（决策/路由/集成）· embedded-drv（驱动）· embedded-alg（算法）· embedded-matlab（仿真）· embedded-qa（验证门）· embedded-report（报告）。日常单点任务仍可用 native 的 Scout/Builder/Verifier。

```
 RESEARCH(CP-0) ─► INNOVATE(CP-1) ─► PLAN/分派(CP-2) ─► EXECUTE/集成(CP-3,4) ─► REVIEW/交付(CP-5)
```

---

[workflow-state:RESEARCH]
[MODE: RESEARCH] embedded-arch 牵头拆题与资源规划：识别芯片/库、读 spec、引脚规划写 hw-lock.yaml，过 CP-0（题目/资源/工具链就绪）。各子 Agent 只在分派范围内收证据写 active task 的 research.md。禁止改代码。关键资料（pinout/datasheet/赛题约束）缺失则暂停问用户。
[/workflow-state]

[workflow-state:INNOVATE]
[MODE: INNOVATE] embedded-arch 汇总各路候选方案做选型（资源占用/可靠性/工期），过 CP-1（方案冻结）。禁止写代码、禁止承诺实施清单。
[/workflow-state]

[workflow-state:PLAN]
[MODE: PLAN] embedded-arch 出总实施清单并按 drv/alg/matlab 分派子任务：文件路径 + 函数签名 + 寄存器 + 验证标准 + review:true/false + 层级(L1~L6) + 模块间接口契约，过 CP-2（接口/分工冻结）。硬约束：main.c 只做编排；零占位符。含 review:true 项需用户确认才进 EXECUTE。
[/workflow-state]

[workflow-state:EXECUTE]
[MODE: EXECUTE] 各 Builder 角色在各自子任务内按轮次最小实现（先声明 trace_id+目标+验证标准+停止条件，再改再给证据），同一模块同一时刻只一个写者；集成由 embedded-arch 统一，过 CP-3（模块集成）/CP-4（系统联调）。缺陷走 Defect Ticket 回派对应角色，不就地乱改。每步本地 git 快照（不自动 push、不用 git add -A、更不用 git add -f .auto-embedded/）。改动写入 edits.md。
[/workflow-state]

[workflow-state:REVIEW]
[MODE: REVIEW] embedded-qa 跑机械门禁 `python .auto-embedded/scripts/check.py`（ARCH-1~8 + 硬件冲突 + spec），不过不许交付；再三层人工：①验证门（先跑编译/实测，禁用"应该/理论上"）②硬件合规（核对 hw-lock）③代码质量。过 CP-5（交付）。embedded-report 出报告。通过后 promote：`task.py promote <layer> "..."` 把决策/约定/坑沉淀回 spec。
[/workflow-state]
