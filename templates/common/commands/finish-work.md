# {{CMD_REF:finish-work}} —— 收尾当前任务

跑 REVIEW 验证门 + 学习回流 + 归档。

## 1. 机械门禁（先跑，不通过不许进 REVIEW 结论）
```bash
{{PYTHON_CMD}} .auto-embedded/scripts/check.py
```
一条命令跑三类机械检查（脱离 AI 自觉）：
- **ARCH-1~8** 分层架构门禁（arch-check.sh/.ps1 自动选 bash/pwsh）
- **HW-CONFLICT** 硬件资源锁冲突（pin/dma/irq/timer 重复、irq 优先级撞车）
- **SPEC** spec 层完整性

不通过（exit≠0）必须先修，再继续下面的人工 REVIEW。

## 2. REVIEW 三层（缺一不可）
1. **验证门**：当前回复内必须有"命令 + 输出 + 与验证标准的对照"。没有实测证据不许判完成；禁用"应该/理论上/差不多"。
2. **硬件合规**：代码用的引脚/DMA/中断与 hw-lock.yaml 一致（上面 check.py 的 HW-CONFLICT 已机械核对）。
3. **代码质量**：在 check.py 的 ARCH 机械结论之上，再人工看 main.c 编排、volatile、临界区等。

## 3. 学习回流（promote，知识复利的关键）
把本次**可复用**的设计决策 / 约定 / 坑 / 模式写回 spec，下次会被自动注入：
```bash
{{PYTHON_CMD}} .auto-embedded/scripts/task.py promote conventions "<一句话：学到了什么/为什么>"
# 或 architecture / hardware / guides 对应层；类型 decision|convention|gotcha|pattern
```

## 4. 会话记忆（journal，跨会话续上下文）
把本次"过程叙事"（做了什么 / 决策 / 下一步）写进 journal，下次开会话自动注入最近几条：
```bash
{{PYTHON_CMD}} .auto-embedded/scripts/task.py journal "<本次会话摘要 + 下一步>"
```
> promote 记"可复用知识"进 spec；journal 记"过程叙事"续上下文。分工见 spec/governance。

## 5. 归档
```bash
{{PYTHON_CMD}} .auto-embedded/scripts/task.py archive
```
归档后清除 active，可用 {{CMD_REF:start}} 起下一个任务。
