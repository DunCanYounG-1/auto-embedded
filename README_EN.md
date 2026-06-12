<h1 align="center">auto-embedded</h1>

<p align="center">
<strong>An out-of-the-box engineering framework that makes AI coding agents reliable at embedded firmware.</strong><br/>
<sub>AI agents guess pins, lose track mid-task, and claim "fixed" without evidence. auto-embedded installs a discipline layer into your firmware project — an enforced 5-phase workflow, frozen hardware resources, on-disk task memory, build/flash/debug toolchain skills, and a 55+ article offline embedded knowledge base — delivered to 7 AI coding platforms at once.</sub>
</p>

<p align="center">
<a href="./README.md">简体中文</a> •
<a href="./docs/quick-start.md">Quick Start</a> •
<a href="./docs/concepts.md">Core Concepts</a> •
<a href="./docs/architecture.md">Architecture</a> •
<a href="#faq">FAQ</a>
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

## Why auto-embedded?

| Capability | What it changes |
| --- | --- |
| **Enforced 5-phase workflow** | Every reply declares its phase (`[MODE: RESEARCH]`…). Code is only written after a reviewed plan — no more "shoot first" edits. |
| **Hardware resource lock** | Pins / DMA / IRQ priorities are frozen into `hw-lock.yaml` before coding. Conflicts are caught by a script's exit code, not by the AI's goodwill. |
| **On-disk task memory** | Progress, edits, and findings persist in `.auto-embedded/`. New sessions auto-inject the scene and resume via a 5-question restart — context loss stops killing tasks. |
| **Evidence-gated completion** | "Should work" is blocked. Build output, serial logs, or datasheet page numbers are required before anything is declared done. |
| **Self-improving project specs** | Each finished task promotes its learnings (decisions, gotchas, conventions) back into the repo's spec library, auto-injected next time. |
| **Toolchain + knowledge built in** | 22 tool skills (build / flash / debug / serial / bus / analysis) and a 55+ article offline knowledge base ship into the project — the AI consults them instead of hallucinating registers. |
| **7 platforms, one setup** | Write the rules once; `aemb init` wires them into Claude Code, Cursor, Codex, OpenCode, Copilot, Gemini CLI, and Windsurf with each platform's native syntax and hooks. |

## Prerequisites

- **Node.js** >= 18
- **Python** >= 3.9

## Quick Start

```bash
# 1. Install the CLI
npm install -g auto-embedded

# 2. Initialize in your firmware project (pick the AI tools you use, or --all)
aemb init /path/to/firmware-project -u your-name --platforms claude,cursor

# 3. Open a new AI session in that project — the scene is auto-injected. Just describe what you need.
```

See the [Quick Start guide](./docs/quick-start.md) for per-platform command syntax, daily commands, and maintenance (`doctor` / `update` / `uninstall`).

## How to Use

Describe your need in natural language — the framework routes it:

| You say | What happens |
| --- | --- |
| *"Port an SSD1306 driver for STM32F103"* | Searches the local knowledge base → evaluates open-source drivers → adapts one (reuse before reinvent) |
| *"Check the datasheet for F103 ADC clock limits"* | Datasheet-lookup mode: find PDF → extract parameters → write back as code comments with page numbers |
| *"Why doesn't the USART1 interrupt fire?"* | Evidence-first debugging: registers / NVIC / netlist checked before any code is touched |
| *"Enable competition mode for a balance car"* | 6 specialist agents in parallel: freeze pins & interface contracts → MATLAB simulation gate → driver + algorithm tracks |

## How It Works

auto-embedded runs an enforced loop with platform hooks and role-scoped sub-agents:

1. **RESEARCH** — identify the chip, consult the bundled knowledge base, plan pins into `hw-lock.yaml`. No code allowed.
2. **INNOVATE → PLAN** — compare approaches, produce an itemized plan (paths + signatures + verification criteria). Plans containing code require your approval.
3. **EXECUTE** — a single-writer Builder implements one item per round with evidence; each confirmed step gets a local git snapshot.
4. **REVIEW** — mechanical gates run first (`arch-check` layering + hardware-conflict + spec integrity), then verification with real output; learnings are promoted back into `spec/`.

Session start, every turn, and every sub-agent dispatch are wired through **project-level hooks** that inject exactly the relevant context — guaranteed by each platform's hook mechanism, not by the model remembering. Details in [Architecture](./docs/architecture.md).

## Resources

| Need | Link |
| --- | --- |
| Install & first task, per-platform syntax | [Quick Start](./docs/quick-start.md) |
| RIPER-5, hardware lock, memory, competition mode | [Core Concepts](./docs/concepts.md) |
| Injection loop, repo layout, extending platforms | [Architecture](./docs/architecture.md) |
| Installation details & troubleshooting | [INSTALL.md](./INSTALL.md) |
| The protocol the AI itself follows | [SKILL.md](./SKILL.md) |

## FAQ

<details>
<summary><strong>How is this different from writing a <code>CLAUDE.md</code> / <code>AGENTS.md</code> by hand?</strong></summary>

Static rule files rely on the model reading and remembering them — they grow monolithic and silently fall out of context. auto-embedded injects *scoped* context through platform hooks (session start / per turn / per sub-agent role), gates progress with *mechanical* checks (scripts with exit codes), and persists task state on disk so sessions are resumable.

</details>

<details>
<summary><strong>Is it only for Claude?</strong></summary>

No. One `aemb init` delivers the same workflow to Claude Code, Cursor, Codex, OpenCode, GitHub Copilot, Gemini CLI, and Windsurf, each wired with its native config and hook mechanism. Seven more platforms have reserved registry slots.

</details>

<details>
<summary><strong>Will it touch my existing code?</strong></summary>

No. It only writes `.auto-embedded/` plus each platform's config wiring, tracked in a manifest. `aemb uninstall` strips everything back out (with a backup first).

</details>

<details>
<summary><strong>Does it guarantee the AI won't make mistakes?</strong></summary>

No — and it doesn't pretend to. It sharply reduces the probability (evidence requirements, frozen hardware tables, mechanical layer checks) and forces a pause at high-risk points instead of letting the AI guess. Hardware design and physical measurement still need you.

</details>

<details>
<summary><strong>What about the old <code>embedded-dev</code> project?</strong></summary>

This repo *is* its successor — renamed in place. The previous Claude-only plugin's protocol, knowledge base, and competition mode were fully absorbed; the old standalone repo is archived at [auto-embedded-legacy](https://github.com/DunCanYounG-1/auto-embedded-legacy). Old links redirect automatically.

</details>

<details>
<summary><strong>What does it NOT cover?</strong></summary>

Schematic/PCB design, component selection, soldering, oscilloscope work, and certification. It is an engineering execution framework for the *firmware software* chain — honest scope, see [Core Concepts](./docs/concepts.md#scope--limits).

</details>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DunCanYounG-1/auto-embedded&type=Date)](https://star-history.com/#DunCanYounG-1/auto-embedded&Date)

## Community & Resources

- [GitHub Issues](https://github.com/DunCanYounG-1/auto-embedded/issues)
- [npm package](https://www.npmjs.com/package/auto-embedded)
- Supported by the [LinuxDo](https://linux.do/) community

<p align="center">
<a href="https://github.com/DunCanYounG-1/auto-embedded">Official Repository</a> •
<a href="https://github.com/DunCanYounG-1/auto-embedded/blob/main/LICENSE">MIT License</a> •
Built by <a href="https://github.com/DunCanYounG-1">DuncanY</a> · Architecture inspired by <a href="https://github.com/mindfold-ai/Trellis">Trellis</a>
</p>
