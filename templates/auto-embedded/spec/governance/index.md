# 记忆边界治理 spec（governance）

> 明确"项目运行态"与"可复用知识"的生命周期边界，防止 `promote` 把临时事实固化成伪规范。

## 两类记忆，别混

| 类别 | 存放 | 生命周期 | 例子 |
|---|---|---|---|
| **运行态（任务过程）** | `.auto-embedded/tasks/<id>/`（prd / research / edits / *.jsonl / task.json） | 随任务，归档即冻结 | "本次 USART1 波特率试了 9600/115200"、"第 3 轮编译报 undefined ref" |
| **可复用知识（spec）** | `.auto-embedded/spec/<layer>/`（index.md 等） | 跨任务、跟随 repo、团队共享 | "应用层禁 include 厂商头"、"本板 LED 在 PA14 低有效" |

判断口诀：**只对"下一个任务/别人也用得上"的结论 `promote`**；只跟当前任务相关的事实留在 `tasks/`。

## promote 必须分类

`task.py promote <layer> <type> "<内容>"`，type ∈：
- `decision` 设计决策（为什么选 A 不选 B）
- `convention` 约定（团队/项目统一做法）
- `gotcha` 坑（非显然的硬件/工具行为）
- `pattern` 可复用模式（验证过的解法）

不属于这四类的，多半是运行态事实，**不要 promote**。

## 反污染自查（REVIEW 时）
- [ ] 这条沉淀换个任务还成立吗？不成立 → 留 tasks/
- [ ] 它是"事实记录"还是"可执行规范"？纯记录 → 留 tasks/
- [ ] 已有 spec 是否已覆盖？是 → 不重复 promote

## 沉淀（promote 回流）
> 关于"什么该沉淀"本身的元经验，沉淀于此。
