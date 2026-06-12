# Architecture

**English** | [简体中文](./architecture_CN.md)

> For readers who want the mechanism or want to contribute: the injection loop, the managed/seed split, repo layout, and extension points.

## The injection loop (why it doesn't rely on AI goodwill)

```
aemb init ─► writes .auto-embedded/ into the project (spec/tasks/workspace/scripts/tools/refs/modes/config/workflow)
             + per-platform hook wiring (settings.json / hooks.json / config.toml / JS plugins…)
                                    │
  session start ─ SessionStart ─────┼─► injects: RIPER phase + active task + spec index (incl. refs/modes)
  │                                 │           + hw-lock summary & conflict warnings + recent journal + 5-question restart
  every turn ─ UserPromptSubmit ────┼─► injects: the current phase's behavioral breadcrumb
  │                                 │           (one line from workflow.md's [workflow-state:PHASE] block)
  sub-agent dispatch ─ PreToolUse ──┴─► injects: role-scoped specs from research/implement/verify.jsonl
                                                (rewrites the Task prompt via updatedInput)

  REVIEW ─► task.py promote ─► written back into spec/ ─► auto-injected next time (knowledge compounds)
```

Key design points:

- **Injection is guaranteed by platform hook mechanisms**, not by whether the model read a rules file. Three platform-agnostic Python hooks (session-start / inject-workflow-state / inject-subagent-context) are wired by each platform's configurator in its native way.
- **Injection classes**: class-1 push (Claude/Cursor/Gemini — hooks can rewrite both main session and sub-agent prompts), class-2 pull (Codex/Copilot — sub-agents self-load via a prelude), class-3 command (Windsurf — pure commands/skills). Shared templates render per platform capability via `{{#AGENT_CAPABLE}}` / `{{#HAS_HOOKS}}` conditionals.
- **Injection budget**: 6,000 chars per file / 16,000 total for sub-agents by default (tunable in `config.yaml`) — a growing knowledge base can't blow up the context; over-budget files degrade to lazy-loaded paths.
- **Role relevance**: dispatching Scout/Builder/Verifier (or the 6 competition roles) loads only that role's relevant specs via per-task `*.jsonl` selectors — mirroring Trellis's per-task jsonl mechanism.

## The managed / seed split (upgrades never eat your content)

| Class | Content | `aemb update` behavior |
|---|---|---|
| **managed** | `scripts/` (engine), `tools/` (22 skills), `refs/`, `modes/`, `workflow.md`, platform wiring files | hash-compared upgrade: template changed → overwrite; you changed it → new version written as `.new`, yours kept |
| **seed** | `config.yaml`, `spec/**` (your project's rules), `tasks/`, `workspace/` | never touched (only seeded when missing) |

The clean knowledge-evolution story: upstream knowledge (refs/modes) upgrades with the framework; **project-level** learnings flow through `promote` into spec layers — the two never pollute each other.

## Safety hardening

Every command entry point checks for escaping symlinks/junctions (preventing `.auto-embedded` or its subtrees from being swapped with links pointing outside the project — which would mean writing through, reading through, or executing foreign code). Uninstall strips by manifest accounting with a backup first; config merges only add/remove their own fragments and back up unparseable files.

## Repository layout

```
src/                        aemb CLI (TypeScript, zero runtime deps)
├─ cli/                     entry & hand-written arg parsing (no deps)
├─ commands/                init / update / doctor / check / backup / uninstall
├─ configurators/           one wiring module per platform + shared.ts (placeholder rendering)
│                           + merge.ts (config merging) + hooks.ts (shared hook dispatch)
│                           + workflow.ts (runtime kernel bundling)
└─ types/ai-tools.ts        platform registry (single source of truth: 7 implemented + 7 reserved)

templates/
├─ auto-embedded/           the runtime kernel installed into projects
│  ├─ scripts/              RIPER engine (aemb_core/task/check/get_context + arch-check)
│  ├─ spec/                 spec seeds (five layers, seed-class)
│  ├─ tools/                22 tool-skill scripts + shared/ commons + companion tools
│  ├─ refs/                 55+ article offline knowledge base (managed)
│  ├─ modes/                12 specialized workflows (managed)
│  └─ workflow.md           workflow single source of truth (hooks read breadcrumbs from it)
├─ common/                  cross-platform shared bodies (placeholder-rendered per platform)
│  ├─ commands/ skills/     user ritual commands + auto-trigger skills
│  ├─ tool-skills/          22 tool-skill SKILL bodies
│  └─ agents/               aemb-scout/builder/verifier + 6 competition roles
├─ shared-hooks/            3 platform-agnostic Python injection hooks
└─ <platform>/              platform-private templates (config.toml / JS plugins, etc.)

tests/test-auto-embedded.sh end-to-end self-test (7-platform install/doctor/idempotency/injection/uninstall assertions)
```

## How to extend

| Goal | Steps |
|---|---|
| **Add an AI platform** | add a registry entry in `types/ai-tools.ts` → write `configurators/<platform>.ts` → register in `configurators/index.ts`. Reserved platforms already have registry slots. |
| **Add knowledge** | drop a md file into `templates/auto-embedded/refs/` or `modes/` (`workflow.ts` bundles by prefix) → list it in the corresponding `index.md` |
| **Add a tool skill** | add a frontmattered `.md` under `templates/common/tool-skills/` + scripts under `templates/auto-embedded/tools/<name>/` → update the self-test count assertions |
| **Change the workflow** | edit `templates/auto-embedded/workflow.md` (breadcrumbs follow automatically); don't duplicate workflow definitions elsewhere |

Then run the regression: `npm run build && bash tests/test-auto-embedded.sh`.

## Relationship to the previous generation (embedded-dev)

This repository used to be `embedded-dev` — a Claude-Code-only global single-plugin protocol (read-only global refs, reliant on model goodwill, single-platform). auto-embedded inherits all of its protocol assets (RIPER-5 / knowledge base / competition mode) and upgrades the delivery model to "installed into the project, hook-enforced injection, 7 platforms" (mirroring [Trellis](https://github.com/mindfold-ai/Trellis)'s in-repo foundation approach), renamed in place.

- The old version: git history before `1c984e5`
- The original standalone repo: archived at [auto-embedded-legacy](https://github.com/DunCanYounG-1/auto-embedded-legacy)
- `refs/riper5-protocol.md` and `refs/hooks-design.md` in the knowledge base are kept as previous-generation historical references (clearly annotated)
