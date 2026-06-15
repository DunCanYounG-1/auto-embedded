# 配套全局技能（电路 / Simulink）

> 这两个是**全局 Claude Code 技能**（装在 `~/.claude/skills/`，任何工程会话都自动加载，含本 auto-embedded 工程）。
> 日常开发命中相关主题时直接用；未安装则忽略本页。安装/更新：仓库根 `setup.cmd`（详见 `setup/README.md`）。

## multisim-spice —— 电路设计 / SPICE 仿真 / Multisim
- **做什么**：自然语言电路描述 → 生成 SPICE 网表 → 自带 ngspice 批处理自检（达标才交付）→ 导入 NI Multisim。
- **日常何时用**：设计/验证模拟前端、电源、传感器调理、滤波/放大电路；要"画个电路""仿真一下""出 SPICE 网表""prelab 电路"时。
- **衔接**：电路仿真验证过再交给 `embedded-drv` 写对应驱动固件，少返工。

## simubridge —— MATLAB Simulink 模型操作（MCP）
- **做什么**：AI 直接操控 Simulink（建模 / 读拓扑 / 加模块 / 连线 / 改参 / 仿真，20+ 工具）。
- **日常何时用**：控制/信号的**模型在环**——建 Simulink 模型、仿真调参，再把参数/算法落到固件。是 `modes/matlab-embedded-toolkit.md` / `modes/matlab-firmware-pipeline.md` 里 Simulink 那部分的执行后端（与裸 MATLAB eval 的 matlab MCP 互补）。
- **后端**：完整功能需 MCP 后端（Python 3.9–3.12 + MATLAB 引擎）；技能本体即使没后端也能给 AI 操作指导。装后端：`setup.cmd -Mcp`。

## 与 RIPER-5 的衔接（这才是"日常"用法）
- **RESEARCH / INNOVATE**：用 simubridge 建模仿真比较控制方案；用 multisim-spice 仿真比较电路候选。
- **PLAN**：把仿真验证过的电路 / 控制参数写进实施清单（带验证标准）。
- **EXECUTE / REVIEW**：固件实现（aemb 本体 + 工具技能），实测与仿真对比。
- 一条链：模型(simubridge) → 电路(multisim-spice) → 固件(aemb)。
