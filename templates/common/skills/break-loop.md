# {{CMD_REF:break-loop}} —— bug 根因复盘，打破"修了又犯"

修完一个 bug（尤其是反复出现、或同类第二次出现的）后做**深度根因分析**，
把教训沉淀成可复用知识，防止同一类 bug 再犯。

## 五问复盘（逐条作答，要具体到代码/寄存器/时序）
1. **根因类别**：属于哪类？（时序/竞态、寄存器位配置、时钟门未开、引脚复用冲突、中断优先级、
   缓冲区/对齐、栈溢出、volatile 缺失、临界区缺失、第三方库误用…）
2. **为什么之前没发现**：编译过了但运行错？无测试？只在特定条件触发？审查时漏看哪一点？
3. **真正的修复**（非掩盖症状）：改了什么、为什么这样能根治。附证据（日志/波形/寄存器值）。
4. **防复发机制**：怎样让这类 bug 下次被**自动挡住**？例如——
   - 写进 `spec/conventions` 或 `spec/hardware` 的约定（下次自动注入）
   - 能否加进 `check.py` 的机械门禁（hw-lock 冲突 / arch-check）
   - 引脚/资源类 → 补进 `hw-lock.yaml`
5. **同类排查**：代码里还有没有同样模式的地方？一并查。

## 沉淀（必做）
把根因与防复发约定写回 spec，下次开发自动注入：
```bash
{{PYTHON_CMD}} .auto-embedded/scripts/task.py promote conventions gotcha "<一句话根因+防复发约定>"
# 硬件类坑 → promote hardware gotcha "..."；可复用解法 → promote conventions pattern "..."
```
并写一条会话记忆：
```bash
{{PYTHON_CMD}} .auto-embedded/scripts/task.py journal "break-loop: <bug> 根因=<...> 防复发=<已 promote 到 spec/...>"
```
