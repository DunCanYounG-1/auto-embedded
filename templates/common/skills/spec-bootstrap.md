# {{CMD_REF:spec-bootstrap}} —— 从真实代码库重建 .auto-embedded/spec/ 五层规范

把项目专属约定从「凭记忆 / 泛泛而谈」升级成「源码背书、带真实文件路径与正反例」的可注入规范。
新项目刚 init、或 spec 陈旧/漂移需重建时用。产出写进 .auto-embedded/spec/ 的五个固定层，
SessionStart 与派子 Agent 时会按相关性自动注入。

## 五个固定层（在 config.yaml 声明，勿增删层名）
- architecture —— 六层模型 + ARCH-1~8 分层门禁（谁能调谁、ISR/HAL/驱动/应用边界）
- conventions —— 编码/复用/ISR/临界区/Git 快照等约定（证据优先、复用优先）
- hardware —— 硬件事实基线 + 机器可读 spec/hardware/hw-lock.yaml（引脚/DMA/中断/定时器）
- guides —— 思维清单（排查/选型/移植的步骤化提示）
- governance —— 记忆边界（什么该 promote、什么留在 tasks/ 不固化）

## 工作流
1. 确认已 init，先看现状（勿凭记忆）：
   ```bash
   {{PYTHON_CMD}} .auto-embedded/scripts/get_context.py            # active task / 阶段 / spec 索引
   {{PYTHON_CMD}} .auto-embedded/scripts/check.py --spec           # 哪些层 index.md 还缺
   ```
2. 分析真实代码库（证据优先，勿照搬模板）：
   - 读 .auto-embedded/refs/ 离线知识库（STM32/GD32 HAL、引脚规划、驱动移植、故障分类…）按需取；
   - 读工程源码：芯片型号、HAL/RTOS、构建链（CMake/Keil/IAR/PlatformIO/IDF）、外设使用、分层现状；
   - init 的芯片探测草案通常落在 spec/hardware 附近，作为起点核对。
3. 按五层重塑各 index.md：写**具体**规则——真实文件路径、函数/寄存器、正例与反例（anti-pattern），
   而非泛泛的「要写好代码」。hardware 层把已定的引脚/DMA/中断冻结进 hw-lock.yaml（机器可读，check.py 据此查冲突）。
4. 删除所有占位符/模板腔；确保每个 index.md 的标题与该层实际内容相符。
5. 自检：
   ```bash
   {{PYTHON_CMD}} .auto-embedded/scripts/check.py --spec   # 五层 index.md 齐全
   {{PYTHON_CMD}} .auto-embedded/scripts/check.py --hw     # hw-lock 无冲突
   ```

## 操作规则
- 模板是起点不是契约：只保留反映本工程真实情况的内容，其余删。
- 源码背书 > 泛泛建议；每条规则尽量给出处（文件:行 或寄存器）。
- 默认单一 owner：每层一份 index.md，需要细分再加文件并在 index.md 引用。
- 杜绝占位符：留 `<TODO>` / 示例腔 = 没做完。

## 沉淀回流
后续调试/实现中学到的可复用知识，用回流环固化（下次自动注入，知识复利）：
```bash
{{PYTHON_CMD}} .auto-embedded/scripts/task.py promote <layer> <decision|convention|gotcha|pattern> "<一句话>"
```
任务过程性事实留在 tasks/ 不要 promote（边界见 governance 层）。
