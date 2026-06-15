# auto-embedded 工作流 · TDD 变体（RIPER-5 + 测试先行）

> RIPER-5 主干不变，EXECUTE 改为"测试先行"：每轮先写/挑一个会失败的测试，再实现到它通过。
> 适合有可跑测试（单元 / HIL / 仿真 / 串口断言）的固件模块。
> UserPromptSubmit hook 按 active task 的阶段从下面 `[workflow-state:阶段]` 块取一行面包屑注入。

每条回复开头声明当前阶段：`[MODE: RESEARCH|INNOVATE|PLAN|EXECUTE|REVIEW]`。
默认从 RESEARCH 开始；含写代码的清单项进入 EXECUTE 前必须过 PLAN 审查门并获用户确认。

```
 RESEARCH ─► INNOVATE ─► PLAN(含测试清单) ─► EXECUTE(红→绿→重构) ─► REVIEW(全绿+回流)
```

三角色与相关性注入同 native：Scout/Builder/Verifier，按 research/implement/verify.jsonl 注入相关 spec。

---

[workflow-state:RESEARCH]
[MODE: RESEARCH] 收集事实：识别芯片/库、查现成驱动、读 spec（architecture/conventions/hardware）、引脚规划写 hw-lock.yaml；并额外明确**怎么测**（单元/HIL/仿真/串口断言），把可观测的验收信号写进 research.md。禁止改代码、禁止下最终方案。关键资料缺失则暂停问用户。
[/workflow-state]

[workflow-state:INNOVATE]
[MODE: INNOVATE] 评估候选方案（中断/轮询/DMA、自研/移植），并评估每个方案的**可测性**（能否写出确定性的失败测试）。禁止写代码、禁止承诺实施清单。
[/workflow-state]

[workflow-state:PLAN]
[MODE: PLAN] 出实施清单：文件路径 + 函数签名 + 寄存器配置 + **每项对应的测试**（测试文件/用例名/期望）+ 验证标准 + review:true/false + 每个新文件标层级(L1~L6)。硬约束：main.c 只做编排；零占位符。含 review:true 项必须展示清单并获用户确认才进 EXECUTE。
[/workflow-state]

[workflow-state:EXECUTE]
[MODE: EXECUTE] 测试先行，一轮一个改动点：① 先写/选一个**当前会失败**的测试并跑出红；② 写最小实现到它变绿；③ 必要时重构并保持绿。每轮先声明 trace_id+目标+该测试+停止条件。review:true 步骤先展示测试+实现+证据等用户确认。每步确认后本地 git 快照（不自动 push、不用 git add -A、更不用 git add -f .auto-embedded/）。改动与测试结果写入 edits.md。
[/workflow-state]

[workflow-state:REVIEW]
[MODE: REVIEW] 先跑机械门禁 `python .auto-embedded/scripts/check.py`（ARCH-1~8 + 硬件冲突 + spec 完整性），不过不许进结论。再确认**全部测试为绿**（贴运行输出，禁用"应该/理论上"）+ 硬件合规（check.py 已核对 hw-lock）+ 代码质量（main.c/volatile/临界区）。通过后 promote：`task.py promote <layer> "..."` 把设计决策/约定/坑沉淀回 spec。
[/workflow-state]
