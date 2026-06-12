<h1 align="center">auto-embedded</h1>

<p align="center">
<strong>让 AI 编码助手可靠地写嵌入式固件的开箱即用工程框架。</strong><br/>
<sub>AI 写嵌入式三宗罪：乱猜引脚、上下文断档、空口宣称修好。auto-embedded 一条命令装进你的固件工程——强制五阶段流程、冻结的硬件资源表、落盘的任务记忆、编译/烧录/调试工具技能、55+ 篇离线嵌入式知识库——一次接线，7 个 AI 平台同时生效。</sub>
</p>

<p align="center">
<a href="./README_EN.md">English</a> •
<a href="./docs/quick-start_CN.md">快速开始</a> •
<a href="./docs/concepts_CN.md">核心概念</a> •
<a href="./docs/architecture_CN.md">架构原理</a> •
<a href="#faq">常见问题</a>
</p>

<p align="center">
<a href="https://www.npmjs.com/package/auto-embedded"><img src="https://img.shields.io/npm/v/auto-embedded.svg?style=flat-square&color=2563eb" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/auto-embedded"><img src="https://img.shields.io/npm/dw/auto-embedded?style=flat-square&color=cb3837&label=downloads" alt="npm downloads" /></a>
<a href="https://github.com/DunCanYounG-1/auto-embedded/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/DunCanYounG-1/auto-embedded/stargazers"><img src="https://img.shields.io/github/stars/DunCanYounG-1/auto-embedded?style=flat-square&color=eab308" alt="stars" /></a>
<a href="https://github.com/DunCanYounG-1/auto-embedded/issues"><img src="https://img.shields.io/github/issues/DunCanYounG-1/auto-embedded?style=flat-square&color=e67e22" alt="open issues" /></a>
<a href="https://github.com/DunCanYounG-1/auto-embedded/pulls"><img src="https://img.shields.io/github/issues-pr/DunCanYounG-1/auto-embedded?style=flat-square&color=9b59b6" alt="open PRs" /></a>
<a href="https://deepwiki.com/DunCanYounG-1/auto-embedded"><img src="https://img.shields.io/badge/Ask-DeepWiki-blue?style=flat-square" alt="Ask DeepWiki" /></a>
<a href="https://chatgpt.com/?q=Explain+the+project+DunCanYounG-1/auto-embedded+on+GitHub"><img src="https://img.shields.io/badge/Ask-ChatGPT-74aa9c?style=flat-square&logo=openai&logoColor=white" alt="Ask ChatGPT" /></a>
</p>

## 为什么需要它？

| 能力 | 改变了什么 |
| --- | --- |
| **强制五阶段流程** | 每条回复声明所处阶段（`[MODE: RESEARCH]`…）。计划经你审查后才能写代码——不再"上来就改"。 |
| **硬件资源锁** | 引脚 / DMA / 中断优先级先冻结进 `hw-lock.yaml` 再编码。冲突由脚本 exit code 拦截，不靠 AI 自觉。 |
| **任务记忆落盘** | 进度、改动、研究发现持久化在 `.auto-embedded/`。新会话自动注入现场、"五问重启"接着干——上下文断档不再杀死任务。 |
| **证据门禁** | 屏蔽"应该没问题"。必须出示编译输出 / 串口日志 / 手册页码才算完成。 |
| **项目规范自我进化** | 每个任务收尾把学到的（决策、坑、约定）沉淀回工程规范库，下次自动注入。 |
| **工具链与知识库内置** | 22 个工具技能（编译/烧录/调试/串口/总线/分析）+ 55+ 篇离线知识库随框架装进工程——AI 查表干活，不瞎编寄存器。 |
| **7 平台一次接线** | 规则写一次，`aemb init` 按各平台原生语法和钩子机制装进 Claude Code、Cursor、Codex、OpenCode、Copilot、Gemini CLI、Windsurf。 |

## 前置要求

- **Node.js** >= 18
- **Python** >= 3.9

## 快速开始

```bash
# 1. 全局安装 CLI
npm install -g auto-embedded

# 2. 装进你的固件工程（--platforms 选你在用的 AI 工具，或 --all 全装）
aemb init /path/to/firmware-project -u 你的名字 --platforms claude,cursor

# 3. 在该工程用对应 AI 工具新开会话 —— 现场自动注入，直接说需求即可
```

各平台命令语法、日常命令、维护操作（`doctor` / `update` / `uninstall`）见 [快速开始指南](./docs/quick-start_CN.md)。

## 怎么用

用自然语言说需求，框架自动路由：

| 你说 | 它做什么 |
| --- | --- |
| `帮我给 STM32F103 移植一个 SSD1306 驱动` | 先搜本地知识库 → 评估开源驱动 → 移植适配（复用优先，不造轮子） |
| `查手册，确认 F103 ADC 时钟上限` | 查手册流程：搜 PDF → 提取参数 → 写回代码注释并带页码 |
| `USART1 中断为什么不触发` | 证据优先排障：先查寄存器配置 / NVIC / 网表，再动代码 |
| `启用比赛模式，做一个平衡车控制系统` | 6 个专职 AI 角色并行：冻结引脚与接口契约 → MATLAB 仿真过门 → 驱动+算法分头推进 |

## 工作原理

auto-embedded 用平台钩子和角色化子代理跑一个强约束循环：

1. **RESEARCH** —— 识别芯片、查内置知识库、引脚规划写入 `hw-lock.yaml`。禁止改代码。
2. **INNOVATE → PLAN** —— 对比方案，产出逐项实施清单（路径 + 函数签名 + 验证标准）。含代码的计划需你确认。
3. **EXECUTE** —— 单写者 Builder 一轮一个改动点、每项给证据；每步确认后本地 git 快照。
4. **REVIEW** —— 先跑机械门禁（`arch-check` 分层 + 硬件冲突 + 规范完整性），再实测验证；经验沉淀回 `spec/`。

会话开始、每轮对话、每次派子代理都经**项目级钩子**注入恰好相关的上下文——由各平台钩子机制保证必然发生，不靠模型记性。详见 [架构原理](./docs/architecture_CN.md)。

## 资源导航

| 需求 | 链接 |
| --- | --- |
| 安装、首个任务、各平台语法 | [快速开始](./docs/quick-start_CN.md) |
| RIPER-5、硬件锁、记忆机制、比赛模式 | [核心概念](./docs/concepts_CN.md) |
| 注入闭环、仓库结构、扩展平台 | [架构原理](./docs/architecture_CN.md) |
| 安装细节与排障 | [INSTALL.md](./INSTALL.md) |
| AI 自身遵循的协议 | [SKILL.md](./SKILL.md) |

## FAQ

<details>
<summary><strong>和自己手写 <code>CLAUDE.md</code> / <code>AGENTS.md</code> 有什么区别？</strong></summary>

静态规则文件靠模型自己读、自己记——越写越臃肿，还会悄悄掉出上下文。auto-embedded 通过平台钩子**分场景注入**（会话开始 / 每轮 / 按子代理角色），用**机械检查**（脚本 exit code）守门，任务状态落盘可跨会话续作。

</details>

<details>
<summary><strong>只能用于 Claude 吗？</strong></summary>

不是。一次 `aemb init` 同时交付 Claude Code、Cursor、Codex、OpenCode、GitHub Copilot、Gemini CLI、Windsurf，各自用原生配置和钩子机制接线；另有 7 个平台预留注册位。

</details>

<details>
<summary><strong>会动我现有的代码吗？</strong></summary>

不会。只写入 `.auto-embedded/` 和各平台配置接线，全部记录在 manifest 里；`aemb uninstall` 可干净剥离（先自动备份）。

</details>

<details>
<summary><strong>它能保证 AI 不犯错吗？</strong></summary>

不能——也不假装能。它做的是大幅降低概率（证据要求、冻结硬件表、机械分层检查），并在高风险点强制暂停问你，而不是放任 AI 猜。硬件设计与物理实测仍然靠人。

</details>

<details>
<summary><strong>和老项目 <code>embedded-dev</code> 什么关系？</strong></summary>

本仓库就是它的继任者——原地更名。上一代 Claude 单插件的协议、知识库、比赛模式已全量吸收；原独立旧仓归档于 [auto-embedded-legacy](https://github.com/DunCanYounG-1/auto-embedded-legacy)，旧链接自动重定向。

</details>

<details>
<summary><strong>哪些事它不做？</strong></summary>

原理图/PCB 设计、器件选型、焊接、示波器实测、量产认证。它是**固件软件链路**的工程执行框架——边界诚实，见 [核心概念](./docs/concepts_CN.md#能力边界)。

</details>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DunCanYounG-1/auto-embedded&type=Date)](https://star-history.com/#DunCanYounG-1/auto-embedded&Date)

## 社区与资源

- [GitHub Issues](https://github.com/DunCanYounG-1/auto-embedded/issues)
- [npm 包](https://www.npmjs.com/package/auto-embedded)
- 感谢 [LinuxDo](https://linux.do/) 社区支持

<p align="center">
<a href="https://github.com/DunCanYounG-1/auto-embedded">官方仓库</a> •
<a href="https://github.com/DunCanYounG-1/auto-embedded/blob/main/LICENSE">MIT 许可证</a> •
作者 <a href="https://github.com/DunCanYounG-1">DuncanY</a> · 架构对标 <a href="https://github.com/mindfold-ai/Trellis">Trellis</a>
</p>
