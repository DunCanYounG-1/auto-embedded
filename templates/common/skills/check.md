# {{CMD_REF:check}} —— 机械门禁

跑脱离 AI 自觉的机械检查（分层架构 + 硬件冲突 + spec 完整性）。REVIEW 阶段与提交前都应跑。

```bash
{{PYTHON_CMD}} .auto-embedded/scripts/check.py          # 全部
{{PYTHON_CMD}} .auto-embedded/scripts/check.py --arch   # 仅 ARCH-1~8 分层门禁
{{PYTHON_CMD}} .auto-embedded/scripts/check.py --hw     # 仅硬件资源锁冲突
{{PYTHON_CMD}} .auto-embedded/scripts/check.py --spec   # 仅 spec 层完整性
{{PYTHON_CMD}} .auto-embedded/scripts/check.py --json   # 机器可读（CI 用）
```

任一项 FAIL（exit≠0）必须先修。HW-CONFLICT 表示 hw-lock.yaml 里 pin/dma/irq/timer 重复或中断优先级撞车。
