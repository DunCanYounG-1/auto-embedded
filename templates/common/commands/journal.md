# {{CMD_REF:journal}} —— 写一条跨会话记忆

把"本次会话做了什么 / 关键决策 / 下一步"追加到 `workspace/journal.md`。
下次开会话时 SessionStart 会注入最近 3 条，让新会话带着"故事"启动，而非从零。

```bash
{{PYTHON_CMD}} .auto-embedded/scripts/task.py journal "<本次会话摘要>"
```

何时写：会话收尾、做了重要决策、或 {{CMD_REF:finish-work}} 时。一句话即可，例：
- "确认 USART1 用 DMA 收发；下一步写 drv_uart 的空闲中断"
- "放弃 SPI 软件模拟方案（时序不稳），改用硬件 SPI2"

> journal 记"过程叙事"（跨会话续上下文）；可复用的约定/坑请用 {{CMD_REF:finish-work}} 的 promote 进 spec。两者分工见 spec/governance。
