# auto-embedded 工作流（RIPER-5 单一事实源）

> 这是本工程 RIPER-5 流程的权威定义。UserPromptSubmit hook 按 active task 的阶段，
> 从下面 `[workflow-state:阶段]` 块取一行面包屑注入。改流程改这里。

每条回复开头声明当前阶段：`[MODE: RESEARCH|INNOVATE|PLAN|EXECUTE|REVIEW]`。
默认从 RESEARCH 开始；含写代码的清单项进入 EXECUTE 前必须过 PLAN 审查门并获用户确认。

```
 RESEARCH ─► INNOVATE ─► PLAN ─[含 review:true → 需用户确认]─► EXECUTE ─► REVIEW
   查证据      评方案      定清单+签名+审查标记                按轮次实现   验证门+回流
```

**知识库与专项流程**（按需读取，不自动全量注入）：命中相关主题时打开 `.auto-embedded/refs/`（离线知识库，总览 `refs/index.md`）；需要比赛/MATLAB/板级/查手册/查网表等专项工作流时进入 `.auto-embedded/modes/`（总览 `modes/index.md`，如"启用比赛模式" → `modes/competition.md` 的 6-Agent + CP 门禁）。

三角色（多文件/长任务）：Scout 只收证据、Builder 只做最小实现、Verifier 只审验收；
同一时刻只允许一个 Builder 写。派 Agent 时 hook 会按 research/implement/verify.jsonl
自动注入该角色相关的 spec。

---

[workflow-state:RESEARCH]
[MODE: RESEARCH] 收集事实：识别芯片/库、查现成驱动、读 spec（architecture/conventions/hardware）、做引脚规划写入 hw-lock.yaml。命中专题（芯片 API/驱动移植/IMU/竞赛/MATLAB/查手册/查网表…）先查离线知识库 .auto-embedded/refs/index.md 与专项流程 .auto-embedded/modes/index.md，勿凭记忆。禁止改代码、禁止下最终方案。证据写入 active task 的 research.md。关键资料（pinout/datasheet/netlist）缺失则暂停问用户，不硬编。
[/workflow-state]

[workflow-state:INNOVATE]
[MODE: INNOVATE] 评估候选方案（中断/轮询/DMA、自研/移植），对比资源占用与兼容性。禁止写代码、禁止承诺具体实施清单。
[/workflow-state]

[workflow-state:PLAN]
[MODE: PLAN] 出实施清单：文件路径 + 函数签名 + 寄存器配置 + 验证标准 + review:true/false + 每个新文件标层级(L1~L6)。硬约束：main.c 只做编排；零占位符。含 review:true 项必须展示清单并获用户确认才进 EXECUTE。
[/workflow-state]

[workflow-state:EXECUTE]
[MODE: EXECUTE] 按轮次实现，一轮一个改动点：先声明 trace_id+目标+验证标准+停止条件，再改，再给证据。review:true 步骤先展示代码+证据等用户确认。每步确认后本地 git 快照（不自动 push、不用 git add -A）。改动写入 edits.md。
[/workflow-state]

[workflow-state:REVIEW]
[MODE: REVIEW] 先跑机械门禁 `python .auto-embedded/scripts/check.py`（ARCH-1~8 + 硬件冲突 + spec 完整性），不过不许进结论。再三层人工：①验证门(先跑编译/测试/实测，禁用"应该/理论上") ②硬件合规(check.py 已机械核对 hw-lock) ③代码质量(main.c/volatile/临界区)。通过后 promote：`task.py promote <layer> "..."` 把设计决策/约定/坑沉淀回 spec，下次自动注入。
[/workflow-state]
