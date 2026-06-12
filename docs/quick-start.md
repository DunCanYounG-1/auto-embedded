# Quick Start

**English** | [简体中文](./quick-start_CN.md)

> Zero to first task: install the CLI → install into your project → open a session and work.

## Prerequisites

| Dependency | Version | Used for |
|---|---|---|
| Node.js | ≥ 18 | the aemb CLI (zero runtime deps) |
| Python | ≥ 3.9 | injection hooks & runtime scripts |
| Any supported AI coding tool | — | Claude Code / Cursor / Codex / OpenCode / Copilot / Gemini CLI / Windsurf |

Windows notes (Git Bash, path styles) in [INSTALL.md](../INSTALL.md).

## Install

```bash
# Global CLI install
npm install -g auto-embedded

# Or from source
git clone https://github.com/DunCanYounG-1/auto-embedded
cd auto-embedded && npm install -g .
```

## Install into a firmware project

```bash
# Pick platforms (comma-separated)
aemb init /path/to/firmware-project -u your-name --platforms claude,cursor

# Equivalent flag style
aemb init /path/to/firmware-project -u your-name --claude --cursor

# Or everything that's implemented
aemb init /path/to/firmware-project -u your-name --all
```

`init` does three things:

1. **Writes the runtime** `.auto-embedded/`: workflow engine scripts, spec seeds, 22 tool scripts (`tools/`), the 55+ article knowledge base (`refs/`), 12 specialized workflows (`modes/`), and `workflow.md`
2. **Wires each platform**: hooks and skills written via each platform's native mechanism (Claude `settings.json`, Cursor/Codex `hooks.json`, Gemini `settings.json`, OpenCode JS plugins…), smart-merged into existing configs — only its own fragments are added/removed
3. **Detects your chip**: identifies chip / framework / build system and drafts a hardware baseline for you to confirm

> Adding a platform later: just run `aemb init --<platform>` again — incremental, nothing existing is touched.

## Per-platform command syntax

Same commands, different trigger syntax per platform (`init` prints the right ones for what you installed):

| Platform | Trigger | Example |
|---|---|---|
| Claude Code / OpenCode / Gemini CLI | slash commands | `/aemb:start` `/aemb:continue` |
| Cursor / Windsurf / Copilot | slash / workflows / prompts | `/aemb-start` `/aemb-continue` |
| Codex | skills | `$aemb-start` `$aemb-continue` |

## Daily commands

| Command | What it does | When |
|---|---|---|
| `start <title>` | Create a task, enter RESEARCH | starting something new |
| `continue` | Restore the scene + 5-question restart + route by phase | resuming / new session |
| `brainstorm <title>` | One-question-at-a-time requirement convergence → PRD | requirements unclear |
| `check` | Mechanical gates: layering + hardware conflicts + spec integrity | before REVIEW / commit |
| `break-loop` | Root-cause a bug, persist prevention | after fixing a bug (esp. recurring) |
| `finish-work` | Verification gate → promote learnings → journal → archive | wrapping up |
| `journal <summary>` | Write a cross-session memory entry | after key decisions |
| `status` | Print the current scene | anytime |

## Your first task (typical flow)

```text
You: /aemb:start add SHT30 temperature/humidity reading
AI:  [MODE: RESEARCH] consults knowledge base & datasheet, freezes I2C pins into hw-lock.yaml …
AI:  [MODE: PLAN] implementation checklist (3 items, review-flagged) — please confirm
You: confirmed
AI:  [MODE: EXECUTE] round 1: bsp_sht30.c … build passing (evidence: …)
You: /aemb:finish-work
AI:  [MODE: REVIEW] checks pass → verified on hardware → 2 learnings promoted into spec → archived
```

## Maintenance

```bash
aemb doctor <project>      # health-check the wiring across platforms
aemb update <project>      # upgrade managed content (scripts/tools/knowledge), keep your spec/tasks/edits
aemb check  <project>      # run mechanical gates manually (--arch / --hw / --spec / --json)
aemb backup <project>      # back up .auto-embedded/
aemb uninstall <project>   # strip everything per manifest (backs up first)
```

## Next

- Understand the workflow and mechanisms → [Core Concepts](./concepts.md)
- Understand the injection loop and how to extend → [Architecture](./architecture.md)
