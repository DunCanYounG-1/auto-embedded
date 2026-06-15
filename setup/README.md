# 一条龙安装（setup）

克隆本仓后，**一个命令装齐整套嵌入式 AI 研发栈**：`aemb` 框架 CLI + 两个全局技能，并打印后续（MCP / Multisim）步骤。

## 一键装 / 更新

- **双击仓库根 `setup.cmd`**（最省事），或：
  ```powershell
  powershell -ExecutionPolicy Bypass -File setup\install.ps1            # 全套：aemb CLI + 全局技能
  powershell -ExecutionPolicy Bypass -File setup\install.ps1 -SkillsOnly# 只装/更新全局技能
  powershell -ExecutionPolicy Bypass -File setup\install.ps1 -List      # 列出技能来源链接
  powershell -ExecutionPolicy Bypass -File setup\install.ps1 -Mcp       # 额外半自动装 simubridge MCP 后端
  ```
- **更新全套** = `git pull` 本仓 → 再跑一次（aemb 重装 + 各技能 `git` 拉最新）。

## 装了什么

| 组件 | 装到 | 作用 | 来源（更新看这里） |
|---|---|---|---|
| **aemb CLI** | npm 全局（`npm install -g .`） | 项目级固件框架（RIPER-5 / 多平台 / build·flash·debug / 竞赛 6-Agent） | 本仓 |
| `multisim-spice` | `~/.claude/skills/multisim-spice/` | 自然语言 → SPICE 网表 → 自带 ngspice 自检 → 导入 NI Multisim | https://github.com/zuoliangyu/multisim-spice |
| `simubridge` | `~/.claude/skills/simubridge/` | AI 驱动 MATLAB Simulink 模型操作（20+ 工具） | https://github.com/naaomiur/simubridge-skills |

> 技能来源链接全记在 [`skills.json`](skills.json)（= 更新的单一事实源）。

## 三者怎么配合（一条完整研发链）

```
①模型/控制(Simulink)  →  ②电路/模拟设计           →  ③固件
   simubridge              multisim-spice              aemb (auto-embedded)
   (MATLAB MCP)            (SPICE/ngspice/Multisim)    (RIPER-5 固件框架)
```

- **simubridge ↔ aemb 的 MATLAB 链**：aemb 已内置 `matlab-firmware-pipeline` / `matlab-embedded-toolkit` 模式 + `embedded-matlab` 子 Agent，描述"模型在环→固件"流程；simubridge 提供**真正操控 Simulink 的工具**作为其执行后端。
- **multisim-spice ↔ 硬件链**：RESEARCH/PLAN 阶段先设计+ngspice 自检模拟前端/电源/采样电路，达标再进 Multisim，把验证过的电路交给 `embedded-drv` 写驱动固件。竞赛模式里就是"电路设计"那一环。
- **作用域互补**：aemb 是装进单个固件工程的项目级框架；两个技能是全局技能——**在 aemb 工程里开会话也自动加载**，AI 谈到画电路/SPICE/Multisim 或 Simulink 时自然触发。

## simubridge MCP 后端（要真正动 Simulink 才需要）

技能本体让 AI"知道怎么用"，执行要连 MATLAB。`-Mcp` 会半自动 `pip install` 后端；**MATLAB 侧需手动**（脚本不动你的 MATLAB / `~/.claude.json`）：

1. Python 必须 **3.9–3.12**（3.13+ 不支持 MATLAB 引擎）。装 MATLAB 引擎：`<py> setup.py install`（在 `<matlabroot>\extern\engines\python`）。
2. `%USERPROFILE%\.claude.json` 的 `mcpServers` 加：`"simubridge": { "command": "<那个 python.exe>", "args": ["-m","simubridge"] }`。
3. MATLAB 里：`matlab.engine.shareEngine('SIMULINK_MCP_SESSION')`（可写进 `startup.m`）。
4. 重启 Claude Code，`/mcp` 看 `simubridge` 是否 **Connected**。

## 加更多技能

往 [`skills.json`](skills.json) 的 `skills` 加一条，再跑安装：
```json
{ "name": "技能名", "repo": "https://github.com/用户/仓库.git", "subdir": "SKILL.md 若在子目录就填路径，否则留空", "desc": "一句话", "notes": "注意事项" }
```
- `subdir` 留空 = SKILL.md 在仓库根（直接克隆到 `skills/<name>`，保留 git remote）。
- `subdir` 有值 = 仓库缓存到 `~/.claude/.skill-sources/`，把该子目录同步到 `skills/<name>`。
