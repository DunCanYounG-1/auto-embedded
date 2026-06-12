# {{CMD_REF:continue}} —— 继续当前任务

恢复现场，按 RIPER 阶段在正确的步骤接着干。

## 1. 载入现场
```bash
{{PYTHON_CMD}} .auto-embedded/scripts/get_context.py
```
确认：active task、当前阶段、spec 索引、硬件锁。

## 2. 五问重启
读 active task 的 `prd.md` / `research.md` / `edits.md` 和 `.auto-embedded/workflow.md` 当前阶段块，回答：
1. 当前在哪个 RIPER 阶段  2. 最近改了什么  3. 硬件资源现状
4. 之前 RESEARCH 发现了什么  5. {{#AGENT_CAPABLE}}现在该以哪个角色（Scout/Builder/Verifier）继续{{/AGENT_CAPABLE}}{{^AGENT_CAPABLE}}下一步的最小动作是什么{{/AGENT_CAPABLE}}

## 3. 按阶段路由继续
- RESEARCH → 补证据 / 引脚规划
- INNOVATE → 评候选方案
- PLAN → 出/补实施清单（含 `review:true` 项须用户确认）
- EXECUTE → 按轮次实现，一轮一个改动点 + 验证证据；切阶段用 `{{PYTHON_CMD}} .auto-embedded/scripts/task.py phase EXECUTE`
- REVIEW → 跑验证门 + 分层门禁，然后 {{CMD_REF:finish-work}}
