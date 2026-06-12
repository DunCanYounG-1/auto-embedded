# 共享约定

本文定义了这个仓库中所有 skill 的最小共享接口。

## 工程画像（Project Profile）

每个 skill 都应当读取或写入标准化后的 `Project Profile`。输出可以使用 Markdown 或 YAML，但字段名必须保持稳定。

| 字段 | 是否必需 | 含义 |
| --- | --- | --- |
| `workspace_root` | 是 | 固件工作区的绝对路径。 |
| `workspace_os` | 是 | 宿主操作系统：`linux`、`macos` 或 `windows`。 |
| `build_system` | 是 | 主构建系统，例如 `cmake`。 |
| `toolchain` | 否 | 工具链家族，例如 `gnu-arm`、`clang` 或厂商 SDK。 |
| `target_mcu` | 否 | MCU 家族或更精确的芯片型号。 |
| `board` | 否 | 如果工程绑定某块开发板，则记录板卡名称。 |
| `probe` | 否 | 调试探针家族，例如 `stlink`、`jlink`、`cmsis-dap`。 |
| `artifact_path` | 否 | 默认用于烧录或调试的固件产物路径。 |
| `artifact_kind` | 否 | `elf`、`hex` 或 `bin`。 |
| `openocd_config` | 否 | 按顺序排列的 OpenOCD 配置文件或配置片段列表。 |
| `gdb_executable` | 否 | 首选 GDB 可执行文件。 |
| `serial_port` | 否 | 首选串口设备路径或 COM 口。 |
| `baud_rate` | 否 | 首选串口波特率。 |
| `notes` | 否 | 不值得单独增加结构化字段的简短人工备注。 |
| `idf_path` | 否 | ESP-IDF 安装路径。 |
| `idf_version` | 否 | ESP-IDF 版本号，例如 `v5.3.2`。 |
| `idf_target` | 否 | ESP-IDF 目标芯片，例如 `esp32`、`esp32s3`。 |
| `jlink_device` | 否 | J-Link 设备名称，例如 `STM32F407VG`。 |
| `jlink_interface` | 否 | J-Link 接口类型：`SWD` 或 `JTAG`。 |
| `rtos` | 否 | RTOS 类型：`freertos`、`rt-thread` 或 `zephyr`。 |

## 动作词

以下动作词在所有 skill 中保持统一语义：

| 动作词 | 含义 |
| --- | --- |
| `detect` | 检查工作区或宿主环境，并填充工程画像 |
| `build` | 配置并编译固件产物 |
| `flash` | 将固件烧录到目标设备 |
| `attach` | 在不默认执行加载步骤的前提下连接调试器 |
| `monitor` | 观察串口或运行期输出 |
| `reset` | 通过当前工具链路复位目标设备 |
| `verify` | 确认产物、探针或烧录状态 |

## 决策规则

- 显式用户输入永远优先于自动探测结果。
- 若已有 `Project Profile`，优先复用，而不是每次都从头探测。
- 在下游工具和用户没有明确要求其他格式时，始终优先 `ELF`，其次 `HEX`，最后 `BIN`。
- 不要猜测 `BIN` 的烧录基地址；地址未知时必须阻塞并询问。
- 如果探测后仍存在多个同样合理的板卡、探针或串口候选，应返回阻塞结果并列出候选项。

## 技能交接约定

当一个 skill 将结果交给下一个 skill 时，应尽量保留这些内容：

- 标准化后的 `Project Profile`
- 已执行过的命令
- 重要输出，例如产物路径和探测到的配置
- 若流程中断，对应的失败分类
- 推荐的下一步 skill

## Agent 命名三层概念（v2.1 必读）

工作流出现三个易混名词，强制按下表区分：

| 概念 | 含义 | 取值范围 | 出现位置 |
|---|---|---|---|
| **agent_id** | subagent 在 Outcome / Ticket 里自报家门 | 与 `subagent_type` 同名 | `Outcome.owner_agent` / `Ticket.owner_agent` |
| **subagent_type** | Task tool 派发时的类型字符串 | `embedded-arch` / `embedded-drv` / `embedded-alg` / `embedded-qa` / `embedded-matlab` / `embedded-report`（共 6 个）| `Task(subagent_type="...")` |
| **ROLE** | 写子清单时用的角色短名 | `DRV` / `ALG` / `QA` / `MATLAB` / `REPORT`（共 **5 个**，无 ARCH）| `编辑清单_<ROLE>.md` 文件名 |

**关键区分**：
- ARCH 是 subagent_type / agent_id 之一，但**不是 ROLE**（ARCH 只合并主清单，自己不写子清单）
- 因此**不应出现** `编辑清单_ARCH.md`；ARCH 的工作记录直接进 `编辑清单.md` 主清单 + `项目规划清单.md` 的 `competition_state`
- subagent_type 用全名 `embedded-xxx`，ROLE 用短名大写 `XXX`，**不要混用**

## 比赛状态机（Competition State）★v2

比赛模式 v2 的全局状态由"当前 CP + 状态机"显式表达，不允许 Agent 靠自然语言推进。

**写入位置（强制）**：`项目规划清单.md` 的**第一个 fenced YAML 块**（即文件 `# 项目规划清单` 标题之后立即出现的 ```yaml ... ``` 块）。由 `embedded-arch` 写入，所有 subagent 只读。自动解析工具按"第一个 yaml fence"定位，不要嵌入 `## XXX` 节内。

**字段（共 8 个，含 trace_id）**：`trace_id` / `current_cp` / `state` / `blocked_by` / `passed_cps` / `active_agents` / `defect_queue` / `retry_table`。任何文档/示例引用本节时按这 8 个为准，不要简化为"5 字段"或"几个核心字段"。

格式如下：

```yaml
competition_state:
  trace_id: comp-2026-001
  current_cp: CP-2           # CP-0a / CP-0b / CP-1 / CP-1.5 / CP-2 / CP-3 / CP-4 / CP-5
  state: in_progress          # not_started / in_progress / passed / blocked / failed
  blocked_by:                 # 仅 state=blocked 时填
    - defect_id: D-001
      owner_agent: embedded-drv
      reason: "ADC 多通道 DMA 缓冲区长度错误"
  passed_cps:                 # 已过的 CP（含 git tag）
    - cp: CP-0a
      tag: v0.0-init
      timestamp: 2026-05-19T09:00:00+08:00
    - cp: CP-0b
      tag: v0.0-routing
      timestamp: 2026-05-19T09:15:00+08:00
    - cp: CP-1
      tag: v0.1-arch
      timestamp: 2026-05-19T11:30:00+08:00
    - cp: CP-1.5
      tag: v0.15-sim
      timestamp: 2026-05-19T16:00:00+08:00
  active_agents:              # 当前并行运行的 subagent
    - embedded-drv
    - embedded-alg
    - embedded-report
  defect_queue: []            # Defect Ticket 列表（见下方）
  retry_table: {}             # root_cause_id → retry_count_global
```

### CP 门禁表（自动决策门）

各 CP 的进入/通过条件，`embedded-arch` 据此判定是否允许进入下一 CP：

| CP | 进入条件 | 通过条件（全部 satisfy 才能 tag） | 阻塞处置 |
|---|---|---|---|
| CP-0a | 用户触发"启用比赛模式" | 工程目录 + `.gitignore` + `git init` 完成 | — |
| CP-0b | CP-0a passed | `docs/competition-routing.md` 含 MAIN+TAGS+路由置信度 high；5 元组验收表生成 | low 置信 → 暂停问用户 |
| CP-1 | CP-0b passed | `硬件资源表.md` YAML 块通过 `arch-check.sh --hw-check`；接口契约 v1.0 写入 `架构设计.md` | pin/DMA/IRQ 冲突 → 回 ARCH 重排 |
| CP-1.5 | CP-1 passed；MATLAB 派发条件成立 | 全部仿真 Agent `status=success` + 关键指标量化达标 | 连续 3 轮不达标 → 人工裁决 |
| CP-2 | CP-1.5 passed（或 SYSTEM 题跳过 CP-1.5） | 全部并行开发 Agent `status=success`；编辑清单合并完成 | 任一 `failure` → 进 defect_queue |
| CP-3 | CP-2 passed | `arch-check.sh` exit 0；`include-graph.py` 无 LAYER-VIOL；MIL/SIL/PIL（控制题）；5 元组 ≥ 85/100 | C/D 类红线问题禁止过 CP |
| CP-4 | CP-3 passed | 集成 `main.c` 编译烧录通过；报告填实测数据；`embedded-qa` 复验 PASS | 集成失败 → 回 alg/drv 修 |
| CP-5 | CP-4 passed | 10 whys 答辩演练 ≥ 8/10；学生亲自答完；`答辩演练.md` 生成 | 失败项 → 回 report 补证据 |

**强制规则**：

1. `current_cp` 字段是唯一真相源；不允许 Agent 跳 CP（如 CP-1 直接跳 CP-3）
2. 任何 Agent 看到 `state=blocked` 时必须**只读不写**，等待 arch 解除阻塞
3. `passed_cps` 按时间顺序追加，不允许覆盖；回档时新增 `rollback` 字段（不删 entry）
4. `retry_table` 按 `root_cause_id` 全局计数；累计达到预算即 STOP + 写 `研究发现.md`
5. **跨 CP 累计规则**★v2.1：`root_cause_id` 计数**跨 CP 累计，不重置**。同根因在 CP-1.5、CP-2、CP-3 反复出现时，计数共用一个 `retry_table[root_cause_id]` 槽位。**禁止**改名绕过；CP 切换不清零；不要再用"连续 N 次"的旧表述。
6. **预算公式**★v2.1：
   ```
   retry_budget(root_cause_id) = min(
       category_budget(failure_category),
       severity_budget(ticket.severity)
   )
   ```
   累计达到 budget 即 STOP。其中：
   - `category_budget`：默认 3，例外 `realtime-violation=2` / `environment-missing=0` / `connection-failure=0` / `permission-problem=0` / `ambiguous-context=0`（见 `failure-taxonomy.md`）
   - `severity_budget`：`critical=0` / `high=按 category` / `medium=按 category` / `low=排队不阻断门禁`
   - 取 min 意为"最严的那个先生效"
   - **计数语义（钉死，防 off-by-one）**：`retry_budget` 指**首次失败之后允许的自动重试次数**，**不含首次尝试**。`retry_count_global` 从 0 起，每次自动重试失败 `++`；当 `retry_count_global >= retry_budget` 时 STOP。因此 `budget=0`（如 `critical` / `environment-missing`）= **首次失败即 STOP、零自动重试、立即人工介入**；`budget=2` = 首次失败后最多再自动试 2 次。

> **术语 `hw_lock`（schema 级合同，与 `scripts/arch-check.sh --hw-check` 实现严格对齐）**：指 `硬件资源表.md`（英文 fallback `hw-resources.md`）中以 ```` ```yaml ```` 围栏、含 `hw_lock:` 行的资源锁定块。**结构为每节下的对象列表**：
> ```yaml
> hw_lock:
>   pins:
>     - {id: PA0, func: ADC1_IN0, owner: drv_adc}
>   dma:
>     - {stream: DMA1_Stream0, peripheral: ADC1, owner: drv_adc}
>   irq:
>     - {irqn: TIM2_IRQn, priority_preempt: 2, priority_sub: 0, owner: drv_motor}
>   timers:
>     - {id: TIM2, use: pwm_motor, owner: drv_motor}
> ```
> 脚本机械检测（命中任一即输出 `[ARCH-8]` 行，使 `arch-check.sh` 退出码 = 1）：① `pins[].id` 重复；② `dma[].stream` 重复；③ `irq[].irqn` 重复或 `priority_preempt`+`priority_sub` 组合重复（抢占歧义）；④ `timers[].id` 重复。校验键为 `id` / `stream` / `irqn` / `priority_*`（`owner` 等其余字段为人读注释，脚本不据其判定）。
> **fail-closed 边界**：`硬件资源表.md` 存在但**缺 `hw_lock` 块** → 输出 `[ARCH-8]` 视为违规、退出码 1、不放行 CP-1；若该文件整体不存在 → 跳过检测（exit 0）。各 Agent 文档中出现的 `hw_lock` 均指此块。

### Competition State 与 git tag 一一对应

```
CP-0a passed → v0.0-init
CP-0b passed → v0.0-routing
CP-1  passed → v0.1-arch
CP-1.5 passed → v0.15-sim
CP-2  passed → v0.2-dev
CP-3  passed → v0.3-qa
CP-4  passed → v1.0-release
CP-5  passed → v1.1-rehearsed
修复迭代 → v0.X-fix1 / fix2 / ...（不覆盖主 tag）
```

## Defect Ticket Schema（缺陷回派协议）★v2

修补"`embedded-qa` 不修代码、`embedded-arch` 不写代码 → 缺陷无人接"的字面契约 bug。QA 发现的每条 issue 必须打包成 `Defect Ticket` 写入 `编辑清单_QA.md` + `competition_state.defect_queue`，由 ARCH 据此**定向回派** owner_agent 修复。

### Ticket 字段

```yaml
- defect_id: D-001                    # 工程内唯一，QA 生成（D-001, D-002, ...）
  severity: critical                  # critical / high / medium / low
  owner_agent: embedded-drv           # 必填，从 QA 失败归因得出，决定回派目标
  trace_id: comp-2026-001
  found_in_cp: CP-3                   # 在哪个 CP 发现
  blocking_cp: CP-3                   # 阻塞哪个 CP 通过（一般等于 found_in_cp）

  category: target-response-abnormal  # 沿用 failure-taxonomy.md 8 类
  root_cause_id: RC-ADC-DRIFT-001     # 与 retry_table 联动，同根因复用

  title: "ADC 多通道读数漂移 8 LSB"
  expected: "差值 < 2 LSB（11.5 cycles 采样周期）"
  actual: "差值 8-12 LSB，与采样顺序相关"

  reproduce_step:                     # 完整可粘贴步骤，让 owner_agent 不靠猜
    - "/build-cmake debug"
    - "/flash-openocd build/app.elf"
    - "/serial-monitor COM3 115200 -duration 30"
    - "观察 ch0-ch3 raw 值"
  rerun_command: |                    # 修复后 QA 用这条命令复测
    /build-cmake debug && /flash-openocd && /serial-monitor COM3 115200 -duration 30

  evidence:                           # 证据路径
    - log/adc_drift_20260520.csv
    - 编辑清单_QA.md#L42-L58

  suggested_fix:                      # QA 给出修复建议（不强制采纳）
    - "drivers/drv_adc.c: 采样周期 ADC_SampleTime_1Cycles5 → ADC_SampleTime_239Cycles5"
    - "或：在多通道间插入 dummy read"

  status: open                        # open / fixing / rerun_pending / resolved / wontfix
  retry_count_global: 0               # 全局重试次数（与 root_cause_id 联动）
  resolution:                         # 闭环填，resolved 后填
    fix_commit: ""                    # commit hash
    fixed_by_agent: ""
    verified_by_qa: ""
    rerun_evidence: ""
```

### Ticket 生命周期

```
QA 创建（status=open）
   ↓
ARCH 读 defect_queue → 按 owner_agent 派 Task → ticket.status = fixing
   ↓
owner_agent 修复 → commit → 在 编辑清单_<role>.md 引用 defect_id → ticket.status = rerun_pending
   ↓
ARCH 唤起 QA 复测（带 rerun_command）→ QA 验证
   ↓
  ✓ → ticket.status = resolved，填 resolution 字段
  ✗ → retry_count_global++，达到 retry_budget(root_cause_id) → STOP + 写 研究发现.md（预算 = min(category_budget, severity_budget)，critical=0；见上方 §预算公式）
```

### 强制规则

1. **QA 不允许只说"failure"** — 必须打 Defect Ticket，否则 CP-3 不能 FAIL
2. **owner_agent 是必填字段** — 由 QA 据失败现象 + failure-taxonomy.md 决定，不能写 `unknown`
3. **同 root_cause_id 在所有 ticket 间共享重试计数**（替代旧版按 Agent 各计 3 次）
4. **resolved 的 ticket 不允许删除** — 只能改 status，保留可审计性

### 多 Ticket 排序规则（ARCH 收到 ≥ 2 ticket 时）★v2.1

ARCH 派 Task 修复时按以下顺序处理 `defect_queue`（先满足上层，相同再看下层）：

1. **`blocking_cp`** 升序（CP 越早被阻塞的先修，让流水线尽快前进）
2. **`severity`** 降序（critical > high > medium > low）
3. **`retry_count_global` 剩余配额** 升序（已用 2/3 的优先修，避免再失败就 STOP）
4. **`created_at`** 升序（同优先级按 QA 发现顺序）

```python
defect_queue.sort(key=lambda t: (
    cp_order(t.blocking_cp),
    -severity_rank(t.severity),
    retry_budget(t.root_cause_id) - t.retry_count_global,
    t.created_at,
))
```

同 `owner_agent` 的多 ticket 合并成 1 次 Task 派发（prompt 列全部 ticket），减少 token。

## 命令结果结构（Command Outcome Schema）

每个 skill / subagent 的结果都应当归入以下状态之一：

- `success`：请求动作已完成。
- `partial_success`：有部分有效进展，但主目标尚未完全达成。
- `blocked`：由于仍存在高风险未知项，skill 主动停止。
- `failure`：在信息已足够的前提下，动作执行失败。

### 必填字段（每个 Outcome 都有）

- `status`：上述 4 个之一
- `summary`：一句话说明发生了什么
- `owner_agent`：产出本 Outcome 的 subagent 名（`embedded-arch` / `embedded-drv` / ...）★v2
- `trace_id`：贯穿整个比赛的 ID，例如 `comp-2026-001`★v2
- `evidence`：最关键的日志、文件或探测证据（路径列表或简短引用）
- `artifact_paths`：本轮新增/修改的代码/.h/脚本/数据文件路径列表★v2
- `next_action`：推荐的下一条命令或下一个 subagent

### 失败/阻塞时追加字段

- `failure_category`：使用 [failure-taxonomy.md](failure-taxonomy.md) 中的分类
- `root_cause_id`：根因 ID（如 `RC-ADC-DRIFT-001`），同一根因在多个 Agent 间漂移时复用此 ID★v2
- `retry_count_global`：基于 `root_cause_id` 的全局重试计数（不再按 Agent 各自计 3 次）★v2
- `reproduce_command`：可粘贴的复现命令（让下游 Agent 不靠猜）★v2
- `blocking_cp`：当前阻塞的 CP 编号（`CP-0a` ~ `CP-5`）★v2

### 推荐字段

- `confidence`：`high` / `medium` / `low`（自评信心度，`low` 时主线必须人工介入）★v2
- `human_decision_required`：`true` / `false`（候选多于一个、风险过高时必须 `true`）★v2

### 最小示例（success）

```yaml
status: success
owner_agent: embedded-drv
trace_id: comp-2026-001
summary: 已实现 UART/SPI/ADC/RTC 全部驱动，DMA + IRQ 配置完成
artifact_paths:
  - drivers/drv_uart.c
  - drivers/drv_uart.h
  - drivers/drv_adc.c
  - drivers/drv_adc.h
  - hal/ports/stm32f4/hal_uart_stm32f4.c
evidence:
  - 编辑清单_DRV.md
  - arch-check.sh exit 0
confidence: high
next_action: embedded-alg can consume drv_*.h
```

### 失败示例（含 root_cause_id 全局重试）

```yaml
status: failure
owner_agent: embedded-qa
trace_id: comp-2026-001
summary: ADC 多通道读数漂移，差值 > 8 LSB
failure_category: target-response-abnormal
root_cause_id: RC-ADC-DRIFT-001
retry_count_global: 2     # 第 3 次失败就 STOP，不再按 Agent 各自计
reproduce_command: |
  /flash-openocd build/app.elf
  /serial-monitor COM3 115200 -duration 30
artifact_paths:
  - log/adc_drift_20260520.csv
evidence:
  - 编辑清单_QA.md L42-58
  - log/adc_drift_20260520.csv
blocking_cp: CP-3
confidence: medium
human_decision_required: false
next_action: route to embedded-drv (ADC gain prescaler) per failure-taxonomy.md
```

### 历史兼容（仅 Project Profile 场景）

旧版 Project Profile success 示例（保留兼容）：

```yaml
status: success
summary: 已使用 CMake 构建 Debug 固件，并生成 ELF 产物。
project_profile:
  workspace_root: /repo/fw
  workspace_os: linux
  build_system: cmake
  toolchain: gnu-arm
  target_mcu: stm32f429zi
  probe: stlink
  artifact_path: /repo/fw/build/debug/app.elf
  artifact_kind: elf
evidence:
  - cmake preset: debug
  - artifact: /repo/fw/build/debug/app.elf
next_action: flash-openocd
```
