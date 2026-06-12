# {{CMD_REF:brainstorm}} —— 需求不清时，先一问一答收敛

当需求模糊、有多种合理方案、或用户描述的是一个新功能/复杂任务时，先在
**进入 PLAN 之前**把需求收敛清楚，再落成 prd。

## 规则
- **一次只问一个高价值问题**，等用户答完再问下一个；不要一次抛一串问题。
- 优先问"会改变方案的"问题，别问能自己查到/能合理默认的（先查 spec/硬件资源表/网表/数据手册）。
- 嵌入式高价值问题示例：目标芯片/主频确定吗？外设走中断/轮询/DMA？实时性指标（控制周期/jitter）？
  资源约束（Flash/RAM/引脚是否紧张）？是否复用现有驱动？精度/量程/采样率？供电与功耗要求？
- 收敛到 **MVP 范围**：先做最小可验证版本，把"可选/以后再说"的明确剔出。

## 步骤
1. 若还没任务，先建：`{{PYTHON_CMD}} .auto-embedded/scripts/task.py start "<标题>"`
2. 逐个提问→记录答案，直到关键未知都消除（关键资料如 pinout/datasheet/netlist 缺失 → 暂停索取，不硬编）。
3. 把收敛结果写进 active task 的 `prd.md`（需求 / 验收标准 / 约束 / MVP 边界 / 已排除项）。
4. 需求清晰后转入 PLAN：`{{PYTHON_CMD}} .auto-embedded/scripts/task.py phase PLAN`，按 {{CMD_REF:continue}} 推进。

> brainstorm 解决"要做什么"（需求澄清）；RIPER 的 INNOVATE 解决"怎么做"（方案对比）。两者不同，别跳过 brainstorm 直接编方案。
