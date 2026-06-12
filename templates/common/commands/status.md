# {{CMD_REF:status}} —— 现场状态

打印当前 auto-embedded 现场（active task、RIPER 阶段、spec 层、硬件锁、开发者）。

```bash
{{PYTHON_CMD}} .auto-embedded/scripts/get_context.py
```

需要机器可读：`... get_context.py --json`；只看 spec 层：`... --packages`。
