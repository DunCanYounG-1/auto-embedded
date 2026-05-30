# RIPER-5 五阶段详细规则

> 本文件由主协议 `SKILL.md` 按需加载。SKILL.md 仅保留五阶段总览表和跳转入口；详细规则、输出格式、验证证据要求、反自欺检查表统一放在本文。
>
> 顺序：RESEARCH → INNOVATE → PLAN → EXECUTE → REVIEW。每个模式完成且无审查门触发时自动进入下一模式。

---

## 模式1：RESEARCH（研究）

**目的**：信息收集和深入理解
**允许**：读取文件、询问硬件规格、理解代码结构、分析系统架构、识别技术债务、创建任务文件、识别固件库类型
**禁止**：实施更改、规划、给出最终决策方案（允许基于事实约束列出候选分配，但不做最终推荐）
**步骤**：

1. **【最高优先级】搜索现有资料和开源方案**：在开始深入分析代码前，按以下优先级查找：
   - **第一步**：查阅离线索引 `refs/embed-libs-index.md`（RTOS/按键/日志/通信等分类速查）和 `refs/stm32-stdperiph-api.md` / `refs/stm32-hal-api.md`（STM32 API 速查）
   - **第二步**：离线索引未覆盖时，用 `gh api repos/zhengnianli/EmbedSummary/readme` 检索 EmbedSummary
   - **第三步**：仍无结果时，用 `gh` CLI 和 grok-search 扩大搜索：
   - 是否有现成的成熟驱动/库/参考实现
   - 是否有相同芯片/相同应用的竞赛经验帖或开源项目
   - 是否有官方示例代码或 SDK
   - **八荣八耻原则**：以创造接口为耻，以复用现有为荣。搜索结果将直接决定后续技术路线
2. **识别芯片平台和固件库**：
   - **优先调用工程画像探测器**（一键完成构建系统/芯片/产物识别）：
     ```bash
     python ~/.claude/skills/shared/project_detect.py <工作区路径>
     ```
     输出标准化 `Project Profile`（字段定义见 `refs/contracts.md`）：`workspace_root` / `workspace_os` / `build_system` / `target_mcu` / `probe` / `artifact_path` / `artifact_kind` / `serial_port` 等。
   - 探测器无法识别或字段缺失时，回退到人工识别：检查文件包含、API 调用、项目结构（参见原识别规则）
   - 探测结果写入 `硬件资源表.md` 顶部"芯片与开发环境"段落
3. 分析任务相关代码（核心文件/函数、代码流程、中断例程）
4. 检查外设配置和硬件交互
5. 审查时钟设置和时序
6. 记录 API 模式
7. **【关键】引脚规划与冲突检测** — **禁止**未查 datasheet 凭经验分配；**禁止**直接用"默认引脚"。优先 `modes/netlist-lookup.md` 从网表提取，无网表则按 `refs/pin-planning.md` 三步流程（收集需求 → 查约束 → 冲突检测）。详细方法、危险引脚、冲突字段、输出模板 → `refs/pin-planning.md`
8. **生成/更新 `硬件资源表.md`**：芯片型号、开发框架、引脚分配、DMA/中断等写入；格式见 `refs/checklist-templates.md`；**引脚分配表来自步骤 7 结果**
9. 记录搜索到的候选驱动/方案，供 INNOVATE 阶段评估
10. **【模拟前端电路预验证，可选】** 当任务涉及 ADC 抗混叠/采样前端、运放增益与偏置、传感器信号调理、RC/有源滤波等**模拟电路假设**时，调用外部辅助 skill `multisim-spice`（自然语言→SPICE 网表→内置 ngspice 批处理自检→可选 Multisim 出原理图）在写固件前把硬件假设验证为事实。**这是设计期证据生成，不是 EXECUTE 操作执行，不走 Command Outcome 契约**。
    - 选型边界：电路级正确性（网表/小信号/频响/瞬态/元件值）→ `multisim-spice`；系统级行为 / 控制链路 / 与 MATLAB 数据处理耦合 → `modes/matlab-toolkit-competition.md` 的 Simscape
    - 平台限定：仅 Windows + 内置 ngspice；Multisim 为可选可视化入口，**未安装时保留 `.cir` + ngspice 数值结果即视为验证完成，不算失败**
    - 证据反哺四文件：仿真假设 / 网表路径 / 关键数值结果 / 结论可信度写入 `研究发现.md`；确认后的元件值、滤波截止频率、增益/偏置、ADC 通道约束与建议采样率写入 `硬件资源表.md`，供引脚规划与固件常数复用

**输出**：以 `[MODE: RESEARCH]` 开头，按"已确认事实 / 证据来源 / 未确认问题"输出；若任务将进入多轮治理，补充 `trace_id` 和建议轮次拆分
**完成后**：
- 若官方 pinout / datasheet / netlist 等关键资料**均不可得** → **暂停**，向用户索取资料，禁止进入 INNOVATE
- 资料齐备 → 自动进入 INNOVATE 模式

---

## 模式2：INNOVATE（创新）

**目的**：头脑风暴潜在方案
**核心原则**：优先评估和复用 RESEARCH 阶段找到的现有开源方案/驱动/库，而非从零设计。
**允许**：讨论多种方案、评估优缺点（功耗/时间/内存）、征求反馈、探索架构替代方案
**禁止**：具体规划、实现细节、代码编写、承诺特定方案
**步骤**：

1. **【最高优先级】评估 RESEARCH 阶段找到的现有方案**：
   - 用 `gh search repos` / grok-search 进一步筛选和对比候选方案
   - 参考 `refs/driver-porting.md` 中的"驱动库移植优先原则"评估可移植性
   - **八荣八耻原则**：以瞎猜接口为耻，以认真查询为荣；以创造接口为耻，以复用现有为荣
   - 将筛选结果作为方案对比的起点
   **评估流程**：
   - 1. 筛选候选方案（按成熟度、维护活跃度、项目匹配度排序）
   - 2. 前 3 名进入详细对比
   - 3. 若无合适方案或现有方案严重不符合约束，进入"自行实现"决策门
   - 4. 决策门触发条件：无匹配开源方案 / 现有方案 License 不兼容 / 现有方案资源需求超限
2. 基于研究创建方案（硬件依赖、多种实现方法如中断/轮询/DMA、自行实现 vs 移植现有驱动）
3. 评估 CPU 负载、延迟、资源使用
4. 确保与已识别固件库兼容
5. **【模拟前端方案对比，可选】** 若候选方案涉及不同模拟前端拓扑或元件值（如不同截止频率的抗混叠滤波、不同运放增益方案）对固件采样率/标定常数的影响，可调用 `multisim-spice` 用 ngspice 实跑对比各候选的频响/瞬态，用数值证据而非经验拍板（边界与平台限定同 RESEARCH 步骤 10）

**输出**：以 `[MODE: INNOVATE]` 开头，仅提供可能性和考量
**完成后**：自动进入 PLAN 模式

---

## 模式3：PLAN（计划）

**目的**：创建详细技术规格，标记每步是否需要交互审查
**允许**：详细计划（文件路径、函数签名、寄存器配置）、标记 `review:true/false`、定义每轮目标和验证标准
**禁止**：任何实现或代码编写、跳过规格、遗漏审查标记

**架构硬约束**（详见 `refs/embedded-architecture.md` §6 main.c 硬约束 + §1 分层）：
- 实施清单中每个新文件**必须标明层级**（L1~L6）+ 命名前缀 + `#include` 白名单
- 改动 `main.c` 时必须同时给出拟新增 / 复用的模块 API（如 `bsp_init`、`app_run`），说明调用顺序和归属文件
- 模块边界、公共 API、私有 static、依赖方向必须写清

**审查标记规则**：

设置 `review:true` 的情况：
- 编写/修改代码
- 创建/编辑/删除文件
- 需要用户验证的命令
- 关键硬件配置（中断优先级、时钟、DMA）
- AI 认为需要用户迭代确认的操作

设置 `review:false` 的情况：
- 纯问答、概念解释
- 内部计算并报告结果
- AI 确信输出简单清晰
- 用户明确表示无需详细审查

**必须的最终步骤**：转换为编号清单。若任务跨多文件或多轮，按轮次拆分；每项至少包含操作、验证标准、`review:true/false`，必要时补充责任角色和停止条件。

```
实施清单：
1. [具体操作1, verify:<验证标准>, review:true]
2. [具体操作2, verify:<验证标准>, review:false]
...
n. [最终操作, verify:<验证标准>, review:true]
```

**计划自审（零占位符规则）**：

输出清单前必须扫描，**禁止以下内容出现在实施清单中**：
- "后续实现"、"待定"、"TBD"、"TODO"、"暂不处理"
- "参照步骤N"、"类似于XXX"、"同上"（每步必须独立完整）
- "需要时再..."、"如果需要..."、"视情况..."（模糊条件）
- 省略号 `...` 代替实际内容
- 每步必须包含：具体文件路径、操作内容、验证标准

发现占位符 → 立即补全后再输出清单。

**输出**：以 `[MODE: PLAN]` 开头
**完成后**：
- 若实施清单**含任一 `review:true` 项** → **暂停**，展示完整清单并询问用户"是否同意按此清单执行"；用户明确同意后才进入 EXECUTE
- 若清单**全部为 `review:false`**（纯问答 / 内部计算 / 用户明确无需详细审查）→ 自动进入 EXECUTE

---

### PLAN 阶段三件套（反 rationalization 装置）

#### Iron Law

```
NO IMPLEMENTATION LIST WITHOUT FILE PATHS + VERIFY CRITERIA + REVIEW MARKERS + LAYER ASSIGNMENT
```

每一项必须同时具备：① 具体文件路径 ② 验证标准 ③ `review:true/false` 标记 ④ 文件所属层级（L1~L6）。**任何一项缺失就不是计划，是愿望清单。**

**Violating the letter of this rule is violating the spirit of this rule.**

#### Red Flags — STOP and Rewrite

- "后续实现" / "待定" / "TBD" / "TODO" / "暂不处理"
- "参照步骤 N" / "类似于 XXX" / "同上"
- "需要时再..." / "如果需要..." / "视情况..."
- 省略号 `...` 代替实际内容
- 没有标层级（不知道这个文件该归 HAL / BSP / Driver / App 哪一层）
- 没有列出新文件的 `#include` 白名单（应用层不该 include 厂商 HAL — 计划阶段就要规定）
- 整个清单只有一轮（多文件 / 多迭代 / 多 Agent 任务必须按轮次拆）
- review 标记全是 false（涉及代码 / 硬件配置的步骤必须 review:true）

**任一出现 → 删除当前清单，重写。**

#### Common Rationalizations

| Excuse | Reality |
|---|---|
| "这步骤太简单不用写验证标准" | 简单的步骤更容易跳过验证，更需要写出来 |
| "后续步骤我会想清楚的" | 计划阶段不收口，EXECUTE 阶段就会临时拼接，必然出屎山 |
| "这是个 demo 不需要分层" | 分层不只是为产品，是为了让你能验证每一层独立性 |
| "这文件先放着，等写完再决定层级" | 层级决定 #include 边界 — 等写完就来不及堵了 |
| "review:false 因为我有信心" | review 是给用户的，不是给你信心校准的 |
| "main.c 改一点点不用拆" | 一点点叠加就是屎山的起点；超过 10 行连续业务必须下沉 |
| "占位符让计划更灵活" | 占位符让计划变成谎言 — 看似有计划实际没有 |

**任一出现在你的内心独白 → 删除占位符，重写完整清单。**


---

## 模式4：EXECUTE（执行）

**目的**：严格按计划执行，并按轮次制交付证据，根据审查标记有选择地进行用户确认
**允许**：仅实现计划中明确的内容、标记已完成项、小偏差修正并报告、更新任务进度、输出轮次证据包
**禁止**：未报告偏差、计划外改进、重大逻辑变更（须回 PLAN）、跳过代码
**小偏差处理**：先报告再执行，涉及逻辑/算法/架构的变更必须回 PLAN 模式

**操作执行层兄弟 skill 路由（强制优先调用，禁止手敲命令重造轮子）**：

涉及"真去跑命令"的步骤，**必须**路由到对应兄弟 skill，不要在 EXECUTE 内手写 Bash 命令再现造一遍，因为兄弟 skill 已封装：① 工程画像探测、② 工具路径解析（`em_config.py`）、③ 跨平台路径处理、④ 标准化 `Command Outcome` 输出（status / summary / evidence / next_action / failure_category）。

| 操作类型 | 优先 skill | 何时使用 |
|---------|-----------|---------|
| 编译 CMake / Keil / IAR / PlatformIO / ESP-IDF / Makefile 工程 | `/build-cmake` `/build-keil` `/build-iar` `/build-platformio` `/build-idf` `/build-makefile` | 需要 ELF/HEX/BIN 产物时 |
| 烧录 OpenOCD / Keil / PlatformIO / ESP-IDF / J-Link | `/flash-openocd` `/flash-keil` `/flash-platformio` `/flash-idf` `/flash-jlink` | 已有 artifact 需要下载到 MCU 时；BIN 烧录前必须明确基地址 |
| GDB 在线调试（下载/附着/崩溃排查） | `/debug-gdb-openocd` `/debug-jlink` `/debug-platformio` | 需要单步、断点、查看寄存器或栈帧时 |
| 串口日志抓取 | `/serial-monitor` | 验证固件运行、查看 printf/log 输出 |
| Modbus / CAN / VISA 通信调试 | `/modbus-debug` `/can-debug` `/visa-debug` | 工业总线寄存器读写、CAN 帧监听、仪器 SCPI 通信 |
| 内存使用报告 / RTOS 线程检查 | `/memory-analysis` `/rtos-debug` | .map/ELF 内存超限分析；FreeRTOS 任务/栈水位/死锁排查 |
| 静态分析 / MISRA 合规 | `/static-analysis` | 提交前代码扫描 |
| 外设驱动搜索→评估→适配 | `/peripheral-driver` | 新接传感器/显示屏/存储芯片时（与"驱动库移植优先原则"配合） |
| STM32 CubeMX HAL 工程开发 | `/stm32-hal-development` | 需要 BSP 模板、HAL 速查、HAL 专属 troubleshooting |
| 编译→烧录→监控/调试 串接 | `/workflow` | 一个命令完成完整链路 |

**调用规范**：
1. 在轮次声明里标注"本轮将调用 `<skill 名>` 执行 `<动作词>`"，动作词使用 `refs/contracts.md` 的统一动词（detect / build / flash / attach / monitor / reset / verify）
2. skill 返回 `Command Outcome` 后，将 `status` / `evidence` / `next_action` 写入 `编辑清单.md` 本轮记录
3. `status != success` 时，按 `refs/failure-taxonomy.md` 的 8 类标准化失败分类决定下一步：
   - `environment-missing` → 修复缺失依赖后重试，禁止跳过
   - `project-config-error` → 回 PLAN 修配置
   - `connection-failure` / `permission-problem` → 阻塞，向用户索取硬件 / 权限确认
   - `artifact-missing` → 回 build skill 重新产出
   - `target-response-abnormal` → 进入 `refs/systematic-debugging.md` 流程
   - `ambiguous-context` → 列候选向用户裁决，禁止猜测
4. skill 间交接遵循 `refs/contracts.md` 的 Skill Handoff Contract：保留 Project Profile、已执行命令、关键证据、推荐下一步

**轮次制规则**：
1. 执行前声明当前轮次、`trace_id`、目标、验证标准、停止条件
2. 每轮只推进一个改动点；发现需要扩大范围时先报告
3. 每轮结束按 `refs/vibe-workflow.md` 交付证据包和 3 句交接摘要
4. 碰到红线（新增依赖、改动超过 5 个文件、修改根目录配置、连续两轮无法确认根因）时立即停止并回 PLAN 或请求用户裁决

**review:true 流程**：
1. 完整展示本步骤的代码/配置变更与验证证据
2. 输出审查门提示，等待用户回复
3. 用户提出修改意见 → 迭代修改后再次展示
4. 用户确认通过 → 执行**本地** Git 存档（显式 `git add <files>` → `git commit`，**不自动 push**）并记录 commit hash 到 `编辑清单.md` / `edits.md`；push 需用户明确指令
5. 存档完成后关闭审查门，继续下一步

**review:false 流程**：
1. 展示执行结果与验证证据
2. 请求直接确认
3. 用户确认后执行自动 Git 存档（无变更则跳过并写入 `编辑清单.md`）

**后续决定**：
- 失败 → 回 PLAN 模式
- 成功且有剩余项 → 执行下一项
- 全部成功 → 进入 REVIEW 模式

**代码质量标准**（详见 `refs/coding-standards.md` + `refs/embedded-architecture.md`）：
- 完整代码上下文，指定语言和路径
- 对寄存器和 ISR 共享变量使用 `volatile`；必要时原子操作；谨慎处理临界区
- 一致遵循库特定编程模式
- 函数 / `main.c` 行数、嵌套、参数数量、私有 static 等约束 → 见 coding-standards §3-§5、embedded-architecture §6
- 不得用"理论上可行"替代实际验证结论

---

### EXECUTE 阶段三件套（反 rationalization 装置）

#### Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH EVIDENCE IN THIS MESSAGE
```

每个"完成"声明必须**在当前消息内**有：① 执行的命令 ② 命令输出（含退出码）③ 输出对照声明的验证。**上一轮的证据不算；记忆中的证据不算；"刚才已经测过"不算。**

**Violating the letter of this rule is violating the spirit of this rule.**

#### Red Flags — STOP and Verify

- 用 "应该" / "理论上" / "大概" / "差不多" / "应当" 描述结果
- 用 "Great!" / "Perfect!" / "Done!" / "搞定" 等满意感先行词
- 跳过 review:true 步骤的审查门，直接进入下一步
- 同一轮处理超过 1 个改动点（"顺便也改了 X"）
- 改动跨越超过 5 个文件却没有回 PLAN 重新拆轮次
- 应用层 `.c` 文件出现 `#include "stm32f4xx_hal.h"` / `"gd32f4xx.h"` 等
- `main.c` 修改超过 10 行连续业务逻辑
- 子任务 `status != success` 但你没有用 `refs/failure-taxonomy.md` 的 8 类标准分类
- 兄弟 skill 返回 `Command Outcome` 后，证据没写入 `编辑清单.md`
- 用"我已经写好了测试，应该会通过"替代实际跑测试

**任一出现 → 停下，跑验证命令，**用证据**而不是描述**说话。**

#### Common Rationalizations

| Excuse | Reality |
|---|---|
| "编译通过就是功能正确" | 编译通过 ≠ 功能正确。要跑、要看输出、要对照 |
| "代码逻辑很明显是对的" | 逻辑明显 ≠ 实际工作。硬件是诚实的，代码会说谎 |
| "我刚才已经测过了" | 这条消息内没有命令输出 = 没测过。重跑 |
| "顺便也把另一个问题修了" | 一轮一改动点。多改一项就是多一个未验证的风险 |
| "这步是 review:true 但用户应该不介意" | review 标记不是供你跳过的，是供用户裁决的 |
| "兄弟 skill 返回了 success 我就跳过验证了" | Skill 也会撒谎。独立验证 |
| "差不多就这样吧，剩下的小问题之后再说" | "之后"通常意味着永远不修 |
| "应用层 include 一下厂商头会方便一点" | 方便 = 下次换芯片重写。守住 HAL Port 边界 |
| "回 PLAN 重新拆轮次太麻烦了" | 不回 PLAN 你就是在 EXECUTE 里偷做 PLAN，质量崩 |
| "这点改动不用写到编辑清单" | 不写 = 失忆。下次重启或交接时这段就丢了 |
| "我可以用记忆中的引脚信息跳过查硬件资源表" | 记忆 ≠ 文件。打开资源表对一遍 |
| "理论上不会有 race condition" | 理论 = 没验证。给 `volatile` / 临界区，并跑 |

**任一出现在你的内心独白 → 立刻执行该 rationalization 旁边的 Reality 列动作。**

---

## 模式5：REVIEW（审查）

**目的**：全面验证最终结果与初始需求和最终计划的一致性。采用三步审查流程：验证门 → 硬件合规 → 代码质量。

### Step 1: 验证门（Iron Law — 证据先于声明）

**铁律：没有验证证据，不得声明完成。**

对每个完成声明执行验证门：
1. **IDENTIFY**：什么命令/操作能证明这个声明？（编译命令、测试命令、示波器测量）
2. **RUN**：实际执行该命令
3. **READ**：完整读取输出，检查退出码/返回值
4. **VERIFY**：输出是否明确确认声明？
5. **ONLY THEN**：发出完成声明

**常见验证对照**：

| 声明 | 必须的证据 |
|------|-----------|
| "编译通过" | 编译命令输出 + 退出码 0 + 无 warning（或已说明的 warning） |
| "功能正常" | 实际运行结果 / 串口日志 / 示波器波形 |
| "引脚配置正确" | 对照数据手册 + 硬件资源表逐项确认 |
| "中断工作正常" | 中断触发证据（GPIO 翻转/串口计数/断点命中） |
| "DMA 传输完成" | DMA 完成标志位 + 目标缓冲区数据正确 |

### Step 2: 硬件合规审查（Spec Compliance）

- 逐行比较最终计划与实现
- **核对代码与 `硬件资源表.md` 一致性**（引脚配置、DMA 通道、中断优先级、时钟分频是否与表中记录匹配，不匹配则更新资源表或修正代码）
- 对照硬件规格技术验证
- 检查竞态条件、时序问题
- 验证 `volatile` 和原子操作使用
- 验证设备约束内的内存和资源使用

### Step 3: 代码质量审查（Code Quality）

- 库特定模式一致性（HAL/StdPeriph/ESP-IDF 风格统一）
- 命名规范、代码结构
- `main.c` 是否仍是纯编排入口，而不是掺杂大段驱动细节、协议分支或算法实现
- 模块边界是否清晰：公共 API、私有实现、依赖方向、配置结构体是否满足可解耦和可维护要求
- 临界区保护是否完整
- 可调用 `/simplify` skill 自动检查代码复用性、效率和质量问题
- 默认以 Verifier 视角给出结论；若验证未跑通，明确标记为未完成而非"基本可用"

**静态检查门（机械化执行，必跑）**：

按 `refs/static-analysis-pipeline.md` 跑三件套并在证据包中附完整报告：

| 工具 | 通过标准 | 失败处置 |
|---|---|---|
| **cppcheck** | `--enable=warning,style,performance,portability` 无 error；warning 逐条说明 | 真问题回 EXECUTE 修；误报加 `// cppcheck-suppress` |
| **clang-tidy** | `bugprone-* / cert-* / clang-analyzer-*` 0 报告（设为 WarningsAsErrors） | 必修 |
| **lizard** | CCN ≤ 10 / NLOC ≤ 50 / PARAM ≤ 3 / 嵌套 ≤ 2 | 超阈函数必须拆，无例外则标注未完成 |

**禁止**：以"不影响功能"为由略过静态检查报告；以"误报太多"关掉整条规则（必须 per-line suppress）。

### 反自欺检查表（Rationalization Prevention）

**审查过程中若出现以下念头，必须立即停下来验证：**

| 你在想什么 | 现实 | 正确做法 |
|-----------|------|---------|
| "编译通过了，应该没问题" | 编译通过 ≠ 功能正确 | 回到 Step 1 验证门 |
| "这个寄存器配置应该对的" | "应该"不是证据 | 打开数据手册逐位确认 |
| "中断优先级应该够用" | 最坏情况可能嵌套溢出 | 画出中断嵌套路径，计算最坏栈深 |
| "我确定引脚没冲突" | 你的记忆不如文件可靠 | 打开硬件资源表逐条核对 |
| "DMA 不会和别的外设冲突" | DMA 通道共享是常见陷阱 | 检查 DMA 通道映射表 |
| "时钟配置没动过，肯定没问题" | 新外设可能改变分频需求 | 重新计算分频链 |
| "上次这样改好用的" | 环境不同，不能套用 | 从当前证据出发重新验证 |
| "差不多可以了" | "差不多"是 bug 的温床 | 要么完全正确，要么标记未完成 |

> **关键规则**：在 REVIEW 输出中，禁止使用"应该"、"理论上"、"大概"、"基本上"等模糊词汇来声明完成。只允许"已验证"或"未验证"。

**结论格式**：
```
[已验证] 实现完美匹配最终计划。验证证据：[列出具体证据]
```
或
```
[未验证] 实现与最终计划存在偏差：[描述]。待验证项：[列出]
```

**失败分类标准化**：当输出 `[未验证]` 或子任务 `status != success` 时，必须用 `refs/failure-taxonomy.md` 的 8 类标准分类标注偏差类别（`environment-missing` / `project-config-error` / `connection-failure` / `artifact-missing` / `target-response-abnormal` / `permission-problem` / `ambiguous-context` / `realtime-violation`），并按该文件的"响应要求"给出最小修复动作；禁止用"应该""可能""差不多"等模糊词代替分类。

**偏差处理**：发现偏差后，架构/逻辑级偏差 → 返回 PLAN 重新出实施清单；纯实现细节偏差 → 返回 EXECUTE 修正对应步骤。

> 遇到复杂调试问题时，按 `refs/systematic-debugging.md` 的四阶段根因分析方法执行。
> **闭环控制系统专题**：若怀疑症状是"调参调不好 + 方向反 + 震荡"组合，按 `refs/control-loop-sign-debug.md` 的"符号陷阱 + 观察模式对照实验法"排查。典型触发场景：PID/前馈输出方向错、Kp 调到很低才稳、多轮调参治标不治本。
