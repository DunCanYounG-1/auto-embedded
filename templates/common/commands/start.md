# {{CMD_REF:start}} —— 开始新任务

新建一个 auto-embedded 任务并进入 RIPER-5 的 RESEARCH 阶段。

## 步骤
1. 创建任务（标题取自参数）。用单引号包裹标题以避免 `$`、反引号、`\` 被 shell 解释；
   标题为空则先向用户确认要做什么，**不要**用空标题建任务：
   ```bash
   {{PYTHON_CMD}} .auto-embedded/scripts/task.py start '在此粘贴标题（保持单引号）'
   ```
   （`task.py` 会对任务 id 做净化，但仍请避免在标题里放命令替换字符。）
2. 以 `[MODE: RESEARCH]` 开始：识别芯片/库 → 读相关 spec（architecture/conventions/hardware）→
   引脚规划写入 `.auto-embedded/spec/hardware/hw-lock.yaml` → 证据写入该任务的 `research.md`。
3. 给各角色挂相关 spec（决定{{#AGENT_CAPABLE}}派 Scout/Builder/Verifier 时{{/AGENT_CAPABLE}}自动注入哪些）：
   ```bash
   {{PYTHON_CMD}} .auto-embedded/scripts/task.py select builder spec/architecture/index.md "分层约束"
   ```

> 关键资料（pinout/datasheet/netlist）缺失就暂停问用户，**不要硬编**。
