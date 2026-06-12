# Core Concepts

**English** | [简体中文](./concepts_CN.md)

> Six mechanisms that turn "AI embedded fails" into things the process simply won't allow.

## ① RIPER-5: the five phases the AI must walk

Every reply opens with its phase tag `[MODE: XXX]`; the authoritative definition lives in your project's `.auto-embedded/workflow.md`:

```
 RESEARCH ─► INNOVATE ─► PLAN ─[code involved? needs your OK]─► EXECUTE ─► REVIEW
  research     ideate      plan                                  execute     review
 gather facts  compare    checklist + signatures               per-round    verification
    │                                                            impl          gate
    └────── key material missing / high risk → pause & ask you, never guess ◄──┘
```

| Phase | Does | Forbidden | Role |
|---|---|---|---|
| RESEARCH | consult datasheets & the bundled knowledge base, find existing drivers, freeze pins into `hw-lock.yaml`, log evidence | editing code, concluding | Scout (read-only) |
| INNOVATE | compare approaches (IRQ/polling/DMA? write vs. port?) | writing code | — |
| PLAN | itemized checklist: file paths + signatures + register configs + verification criteria + `review` flags + layer tags (L1–L6), zero placeholders | business logic in `main.c`, vagueness | — |
| EXECUTE | one change per round: declare trace_id + criteria first, then edit, then show evidence; local git snapshot after each confirmed step (never auto-push, never `git add -A`) | out-of-plan "improvements", skipping verification | Builder (single writer) |
| REVIEW | mechanical gates → real verification → hardware compliance against hw-lock → promote learnings | declaring done with "should work" | Verifier (review-only) |

Multi-file / long tasks split across **Scout → Builder → Verifier**; only one Builder writes at a time.

## ② Hardware resource lock (hw-lock)

Before any code: pin assignments, DMA channels, IRQ priorities and clocks are frozen into `.auto-embedded/spec/hardware/hw-lock.yaml`. From then on:

- the AI checks every resource against this table — no silent grabs
- `aemb check --hw` detects conflicts (pin / dma / irq / timer) mechanically — exit code decides
- the lock summary is injected at session start, with conflict warnings up front

## ③ Four-file disk memory + 5-question restart

Long-task facts, plans, progress and hardware constraints live on disk (plan / edits / hardware table / research findings — bilingual file naming supported), not in the chat. After the hook injects the scene into a new session, the AI answers five questions before touching anything:

1. Which RIPER phase are we in?
2. What changed recently?
3. Hardware status?
4. What did RESEARCH find?
5. Which role (Scout/Builder/Verifier) continues?

## ④ Spec library & learning promotion

`.auto-embedded/spec/` is the project-level spec library in five layers: `architecture` (6-layer model + ARCH-1~8 gate rules), `conventions` (evidence-first / ISR discipline / critical sections / git snapshots), `hardware` (baseline + hw-lock), `guides`, `governance` (memory boundaries).

At task wrap-up, `task.py promote <layer> "<learning>"` distills decisions, gotchas and conventions back into the right layer — **forcibly categorized** (decision / convention / gotcha / pattern) so transient facts don't fossilize into fake rules. Next session injects them automatically: knowledge compounds in *your repo*, not evaporating in chat.

## ⑤ Tool skills & knowledge base

**22 tool skills** (scripts live in `.auto-embedded/tools/`, auto-triggered by description, registered with the `aemb-` prefix):

| Category | Skills |
|---|---|
| Build | `aemb-build-cmake` `-keil` `-iar` `-idf` `-makefile` `-platformio` |
| Flash | `aemb-flash-jlink` `-openocd` `-keil` `-idf` `-platformio` |
| Debug | `aemb-debug-gdb-openocd` `-jlink` `-platformio` |
| Observe / analyze | `aemb-serial-monitor` `aemb-static-analysis` (MISRA) `aemb-memory-analysis` `aemb-rtos-debug` |
| Bus / instruments | `aemb-can-debug` `aemb-modbus-debug` `aemb-visa-debug` |
| Drivers | `aemb-peripheral-driver` (open-source driver search → evaluate → adapt/scaffold) |

All tools return a uniform Command Outcome (status / summary / evidence / next_action / failure_category); the EXECUTE routing table in `refs/riper5-stages.md` makes calling them mandatory over hand-typed shell commands.

**55+ article offline knowledge base** (`.auto-embedded/refs/`, catalog in `refs/index.md`): STM32/GD32/MSPM0 API quick references, pin planning, IMU debugging checklists, control-loop sign traps, driver porting methodology, competition checklists/contracts, and the `stm32-hal/` domain pack (methodology + BSP templates). Consulted on demand — never bulk-injected.

**12 specialized workflows** (`.auto-embedded/modes/`, catalog in `modes/index.md`): datasheet lookup, netlist reading, competition mode, MATLAB→firmware pipeline, GD32/MSPM0 board templates, Seekfree library management, industrial data acquisition, MCP health check, deterministic orchestration…

## ⑥ Competition mode (NUEDC / smart car / Siemens Cup)

Say *"enable competition mode"* to enter `modes/competition.md` with six specialist roles:

| Role | Responsibility |
|---|---|
| `embedded-arch` | the only decision-maker: problem routing (MAIN+TAGS), dispatch, contract freezing, integration |
| `embedded-drv` / `embedded-alg` | drivers / algorithms in parallel tracks |
| `embedded-matlab` | MATLAB simulation (LQR/Kalman/filters → export gain headers) |
| `embedded-qa` | verification gate: MIL/SIL checks, Defect Ticket dispatch-back |
| `embedded-report` | report & defense material (every claim with sim + measured evidence) |

The flow runs **CP-0~CP-5 decision gates**: no work before interface contracts freeze, no firmware before MATLAB sim passes, no integration before QA goes green; failures travel as structured Defect Tickets with retry budgets.

> **Platform boundary (honest)**: full 6-role *parallel* orchestration is currently Claude-complete (native sub-agents + optional deterministic Workflow backend, 37/37 offline self-tests); other platforms install the role definitions but degrade to a single agent walking the same gates sequentially.

## Supported chips

STM32 (StdPeriph / HAL) · ESP32 (ESP-IDF / Arduino) · Arduino (AVR) · RISC-V (GD32VF / CH32V) · NXP (MCUXpresso) · TI MSP430 / **MSPM0** (SDK + Seekfree lib) · Chinese MCUs (GD32 / CH32 / AT32 / APM32).

Deeply localized (dedicated API references + board templates): **STM32 · GD32F470 · MSPM0G3507**; the rest run on general methodology + web research.

<a id="scope--limits"></a>
## Scope & limits

It covers the **firmware software chain**, not "the whole embedded project":

| Closed-loop capable (toolchain + hardware present) | Human required | Not covered |
|---|---|---|
| architecture · simulation (MIL) · drivers · app layer · build · flash · debug · verify · report — with real mechanical layering gates | soldering · scope/logic-analyzer measurement · PCB fabrication · PIL hardware-in-loop · defense | schematic/PCB design · part selection/BOM · requirements discovery · production/EMC certification |

Hardware design and physical measurement are inherently human — this framework doesn't replace them, and doesn't pretend to.

---

Next: [Architecture](./architecture.md) — how the injection loop works and how to extend platforms & knowledge.
