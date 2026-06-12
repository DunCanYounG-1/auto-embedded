# 思维指南 spec（guides）

> guide = "要考虑什么"的思维清单（区别于 spec 的"怎么做才安全"）。本层入口，列出可用 guide。

## 可用 guide
- [`pin-planning.md`](pin-planning.md) —— 引脚规划：复用矩阵、调试口/STRAP 避让、冲突自查 → 写入 hw-lock.yaml。

## 何时用
- RESEARCH 阶段做引脚/资源规划、或面对"该考虑哪些边界"时，先读对应 guide 再动手。
- 新增 guide：在本目录加 `xxx.md`，并在上面"可用 guide"补一行。

## 沉淀（promote 回流）
> REVIEW 阶段把"某类问题该考虑什么"的清单式经验沉淀于此（`task.py promote guides "..."`）。
