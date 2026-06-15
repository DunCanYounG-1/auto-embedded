# {{CMD_REF:session-insight}} —— 翻历史会话找"上次怎么解的"

本机过去与 Claude / Codex 的会话都存在本地（`~/.claude/projects`、`~/.codex/sessions`）。
`aemb mem` 现读这些记录、按内容搜、看上下文、按阶段切片——**纯本地、不建索引、不上传**。
它是只读的"原料"：捞出来由你决定怎么用（直接引用、写进 prd/research、`task.py promote` 沉淀、或只是心里有数）。

## 什么时候用（命中以下情形就去 mem 搜，别从零重来）
- 用户问"**上次怎么解的**""**之前讨论过吗**""这个决策当时怎么定的"，或 "did we solve this before / what did we decide"。
- RESEARCH：这颗芯片/这个外设/这个 bug 以前查过/踩过吗？
- INNOVATE：这个方案以前是不是评估过、或被否过？
- {{CMD_REF:continue}} 跨会话续作：上个会话的结论/下一步是什么。
- 调一个**似曾相识**的 bug（配合 {{CMD_REF:break-loop}}）：翻上次的根因与修法。
- {{CMD_REF:finish-work}} 收尾复盘：回看这条线一路的决策。

**不要用**：上下文里已有答案、或问的是当前代码事实（用 grep/git，别翻历史会话）。

## 怎么用（aemb 是全局命令，任何平台都能调）
```bash
aemb mem projects                                  # 先看哪些工程近期活跃（挑 --cwd 用）
aemb mem search "USART 中断 DMA" --global          # 跨工程按关键词搜（多词 AND）
aemb mem search "hw-lock 冲突"                      # 默认只搜当前工程
aemb mem list --global --since 2026-06-01          # 近期会话列表（跨天大会话不漏）
aemb mem context <会话id> --grep "时钟树"          # 钻取该会话里命中处的上下文
aemb mem extract <会话id> --phase brainstorm       # 只看 RESEARCH..PLAN 的讨论段
aemb mem extract <会话id> --grep memory            # 导出并按关键词过滤轮次
```
要机器可读加 `--json`。范围：默认按当前工程 cwd 限定，`--global` 跨所有工程。

## 捞到之后做什么（接回 auto-embedded 的记忆层）
- 直接**引用**关键结论到当前讨论；
- 写进 active task 的 `prd.md` / `research.md`（当前任务记忆）；
- 可复用的决策/约定/坑 → `{{PYTHON_CMD}} .auto-embedded/scripts/task.py promote <layer> <decision|convention|gotcha|pattern> "<一句话>"`（沉淀进 spec，下次自动注入）；
- 叙事性的"这次干到哪了" → `{{PYTHON_CMD}} .auto-embedded/scripts/task.py journal "<摘要>"`。

> 诚实边界：mem 只读本机的 Claude/Codex 记录、不上传；OpenCode 暂不支持。它给的是原料，不是结论——自己判断可信度。
