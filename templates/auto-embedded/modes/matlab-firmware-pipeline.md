# MATLAB → 固件 一键流水线

> 辅助型 mode — 不替代 RIPER-5，串接已有兄弟 skill 形成端到端闭环。
>
> 6 步：**MATLAB 算参数 → `.mat` → `.h` → 编译 → 烧录 → 串口监视 → MATLAB 读回画图与仿真对比**。
>
> 解决的痛点：你已经能用 `.auto-embedded/modes/matlab-embedded-toolkit.md` 算系数、能 `aemb-build-cmake` 编译、能 `aemb-flash-openocd` 烧录、能 `aemb-serial-monitor` 抓日志，但**串起来需要 4 次"等待 + 复制 + 切窗口"**。本 mode 让 Claude 一次跑完 6 步并返回最终对比图。

---

## 0. 触发条件

`MATLAB 一键流水线` / `matlab pipeline` / `MATLAB 到固件` / `仿真到实测` / `一键算到烧` / `算参数烧上板` / `闭环到端验证` / `一键 LQR 上板`

### 适用范围

- 已经知道 `.auto-embedded/modes/matlab-embedded-toolkit.md` 8 大场景的人；用本 mode 把单场景 + 后续步骤串起来
- 工程已经能 `aemb-build-cmake` 编译通过、`aemb-flash-openocd` 能烧、`aemb-serial-monitor` 能看到日志（**三者各自跑通才上流水线**）

### 不适用

- 三件兄弟 skill 任一未跑通 → 先单独跑通再来
- 流程含 review:true 步骤（如硬件改线、跨核分配）→ 必须停下来让用户审，禁止流水线绕过 RIPER-5 审查门

---

## 1. 流水线 6 步标准链

```
┌──────────────────────────────────────────────────────────────────┐
│ Step 1: MATLAB 算参数                                              │
│   tool: mcp__matlab__run_matlab_file 或 evaluate_matlab_code      │
│   产物: K.mat / filter_coeffs.mat / lookup_table.mat              │
│   写: 编辑清单.md（轮次 N，步骤 1）                                │
├──────────────────────────────────────────────────────────────────┤
│ Step 2: .mat → C 头文件                                            │
│   tool:                                 │
│   产物: app/control/*.h（与现有命名空间一致）                       │
│   写: 编辑清单.md（步骤 2）                                        │
├──────────────────────────────────────────────────────────────────┤
│ Step 3: 编译固件                                                   │
│   skill: /build-cmake | /build-keil | /build-iar | /build-idf     │
│   产物: build/<name>.elf / .hex / .bin                            │
│   失败处置: 按 .auto-embedded/refs/failure-taxonomy.md 分类，不一定回 Step 1      │
├──────────────────────────────────────────────────────────────────┤
│ Step 4: 烧录                                                       │
│   skill: /flash-openocd | /flash-jlink | /flash-keil              │
│   产物: 烧录成功证据（OpenOCD 输出 verify ok / J-Link FlashOK）     │
├──────────────────────────────────────────────────────────────────┤
│ Step 5: 串口监视抓闭环数据                                          │
│   skill: /serial-monitor                                          │
│   产物: log/closed_loop_<timestamp>.csv                           │
│   触发条件: 用户给定测试动作（如"按 ENTER 后给 1V 阶跃 5 秒"）       │
├──────────────────────────────────────────────────────────────────┤
│ Step 6: MATLAB 读回 + 对比仿真                                      │
│   tool: mcp__matlab__evaluate_matlab_code                         │
│   产物: 对比图 + 实测 vs 仿真误差表                                 │
│   判定: 误差 < 阈值 → success；否则 partial_success                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 每步的 Command Outcome（按 `.auto-embedded/refs/contracts.md`）

每步执行后，Claude 必须按下面格式记录到 `编辑清单.md`，并据此决定下一步：

### Step 1 Outcome：MATLAB 计算

```yaml
status: success | failure
summary: 已用 LQR 算出 K 表（15 速度点）并保存 K.mat
evidence:
  - script: scripts/bicycle_lqr_design.m
  - output_file: K.mat
  - key_numbers: K[0]=[-157.46, -17.62, 15.16] (v=0.5)
  - matlab_toolboxes_used: Control System Toolbox
next_action: export_to_c
failure_category: environment-missing (若 toolbox 缺)
```

### Step 2 Outcome：导出 C 头

```yaml
status: success
summary: K.mat → app/control/lqr_gains.h，15x3 float，with-cmsis-template
evidence:
  - input: K.mat (var=K_disc)
  - output: app/control/lqr_gains.h
  - bytes: 1230
next_action: build
failure_category: artifact-missing (若 .mat 文件路径错)
```

### Step 3 Outcome：编译

```yaml
status: success | failure
summary: cmake build (Debug preset) 成功，生成 ELF
evidence:
  - command: cmake --build build/debug
  - artifact: build/debug/firmware.elf
  - artifact_size_kb: 56.3
  - warnings: 0
next_action: flash
failure_category: project-config-error (若 cmake preset 错)
```

### Step 4 Outcome：烧录

```yaml
status: success | failure
summary: OpenOCD verify ok，目标 STM32F407 已下载
evidence:
  - command: openocd -f interface/stlink.cfg -f target/stm32f4x.cfg
              -c "program build/debug/firmware.elf verify reset exit"
  - probe: STLink V2-1 (SN: 066AFF...)
next_action: monitor
failure_category: connection-failure (probe 未连接) | permission-problem (USB 权限)
```

### Step 5 Outcome：抓日志

```yaml
status: success | partial_success
summary: 抓到 30 秒闭环日志，6000 行 CSV
evidence:
  - port: COM3 @ 921600
  - file: log/closed_loop_20260519_174532.csv
  - rows: 6021
  - columns: t_ms,setpoint,measured,u_out
  - dropouts: 0
next_action: matlab_compare
failure_category: target-response-abnormal (无数据流出)
```

### Step 6 Outcome：MATLAB 对比

```yaml
status: success | partial_success | failure
summary: 实测响应与 Simulink 仿真对比，最大误差 4.2%（阈值 10%）
evidence:
  - measured_file: log/closed_loop_20260519_174532.csv
  - sim_file: scripts/sim_output.mat
  - max_rel_error: 4.2%
  - mean_rel_error: 1.8%
  - settle_time_measured: 1.32s
  - settle_time_simulated: 1.25s
  - figure_saved: log/compare_20260519.png
next_action: review_or_iterate
failure_category: ambiguous-context (实测振荡 = 调参 vs 模型错？)
```

---

## 3. 失败语义与路由（每步失败回哪里）

| 失败步骤 | failure_category | 不回 Step 1 | 回到 |
|---|---|---|---|
| Step 1 MATLAB 算不出 | `environment-missing` | — | RESEARCH 装 toolbox / 改 Python 降级 |
| Step 2 导出报错 | `artifact-missing` | ✓ | 回 Step 1 检查 .mat 字段名 |
| Step 3 编译错 | `project-config-error` | ✓ | 看错误：① 头文件路径未加 → 改 CMakeLists ② 函数命名冲突 → 改导出器 `--name` |
| Step 4 烧录错 | `connection-failure` / `permission-problem` | ✓ | 物理检查；阻塞向用户索取 |
| Step 5 没日志 | `target-response-abnormal` | ✓ | 不能盲烧 → 用 `aemb-debug-gdb-openocd` 进 MCU 看 |
| Step 6 误差超阈 | `ambiguous-context` | ✓ | **人工判定**：是调参还是模型错？回 RIPER-5 PLAN 决策 |

**Iron Rule**：**任一步 status != success，流水线暂停**。不允许"先继续看下一步成不成"。这是流水线 mode 与"手工跑 4 个 skill"的核心区别 — 全部成功才报 success。

---

## 4. 调用示例（端到端）

### 用户输入

> 用 MATLAB 算出我两轮平衡车的 LQR K 表，导成 C，编译烧到 STM32F407，给阶跃扰动看响应，与仿真对比

### Claude 执行（自动 6 步）

```text
[轮次声明] trace_id=lqr-pipeline-001  目标=LQR 端到端验证  停止条件=任一步失败或 Step 6 误差>10%

--- Step 1: MATLAB ---
mcp__matlab__run_matlab_file('scripts/bicycle_lqr_design.m')
→ 输出 K.mat
→ status: success
→ 已写 编辑清单.md

--- Step 2: 导出 ---
bash: python  --input K.mat --mat-var K_disc
      --output app/control/lqr_gains.h --name K_BALANCE --with-cmsis-template
→ 已生成 app/control/lqr_gains.h (15x3 float)
→ status: success

--- Step 3: 编译 ---
（路由到 /build-cmake）
→ status: success, artifact=build/debug/firmware.elf

--- Step 4: 烧录 ---
（路由到 /flash-openocd）
→ status: success, verify ok

--- Step 5: 抓日志 ---
（路由到 /serial-monitor，命令"30秒后停止"）
→ status: success, log/closed_loop_174532.csv

--- Step 6: 对比 ---
mcp__matlab__evaluate_matlab_code(...)
→ 最大误差 4.2% < 10%
→ status: success
→ 图: log/compare_174532.png

=== 流水线完成 ===
- 6 步全 success
- 端到端耗时: 4 分 32 秒
- commit: a3b4c5d (已存档)
```

---

## 5. 中断恢复（流水线不是"原子操作"）

任一步成功的产物都已落盘，可单独重做：

```
我想从 Step 4 重跑       → 给定 elf 路径，跳过 1-3 直接 flash
我想只重做 Step 6 对比   → 给定 csv 和 sim_output.mat，跑 MATLAB 对比脚本
我想换参数从 Step 1 重跑 → 改 scripts/bicycle_lqr_design.m 后整条重跑
```

**禁止**：用本 mode "覆盖" 中间状态。每次成功步骤都有 `编辑清单.md` 时间戳 + Git commit hash 作为恢复点。

---

## 6. 阈值与人工裁决

Step 6 误差阈值不固定，按算法类型分级：

| 算法 | 推荐阈值 | 超阈处置 |
|---|---|---|
| LQR / PID 闭环跟踪 | max 误差 < 10%、mean < 3% | 看是模型还是调参 |
| 滤波器输出 | RMS 误差 < 1% | 大概率定点截断；进场景 8 重新定点化 |
| 状态机 | 必须 100% 一致 | 模型与代码状态枚举不对齐 |
| FOC 电流环 | 谐波失真 < 5% | 调采样率 / 电流采样窗口 |
| 卡尔曼估计 | 状态估计 RMS < 2% | Q/R 协方差需调 |

**模糊场景**（实测振荡 / 大延迟 / 偶发漂移）→ Step 6 自动落到 `ambiguous-context`，**Claude 必须停下来让用户裁决**，不允许自动"凑数继续"。

---

## 7. 与 RIPER-5 主协议的衔接

| RIPER-5 阶段 | 本流水线在哪一步 |
|---|---|
| RESEARCH | 流水线触发前应已确认 MATLAB toolbox / 硬件连接 / 串口端口（写入 `硬件资源表.md`）|
| INNOVATE | 在 Step 1 之前确定用什么算法（LQR / PID / Kalman），写入 `项目规划清单.md` |
| PLAN | **流水线 6 步本身就是 PLAN 的实施清单**；每步 `review:false` 自动跑、`review:true` 必须停 |
| EXECUTE | 流水线就是 EXECUTE，每步证据写 `编辑清单.md` |
| REVIEW | 流水线 success ≠ 通过 REVIEW；REVIEW 阶段额外跑 `arch-check.sh` + 静态分析 + 反自欺检查表 |

### review:true 强制停顿

以下情况流水线必须停下：

- Step 2 改动 `app/control/` 下原已有 `.h`（覆盖前必须 diff 给用户看）
- Step 3 改动 CMakeLists.txt（任何根目录配置）
- Step 4 烧录新固件到生产板卡（非开发板）
- Step 6 误差超阈

**禁止**：把 `review:true` 跳过去美化流水线"丝滑"。

---

## 8. 与现有兄弟 skill 的对比

| 工具 | 本流水线 |
|---|---|
| `/workflow` | 通用编译→烧→监控；不知道 MATLAB 算法 |
| 本流水线 | **特化** MATLAB → 固件，知道如何把 `.mat` → `.h`、如何反向对比 |
| `.auto-embedded/modes/matlab-embedded-toolkit.md` | 只覆盖 MATLAB 端（1 步） |
| 本流水线 | MATLAB 端 + 嵌入式端 + 实测对比 6 步 |

**协作关系**：本流水线**内部调用** `/workflow` 或单独的 build/flash/monitor skill，不重新实现这些能力。

---

## 9. Toolbox 依赖

| 步骤 | 需要 | 缺失时 |
|---|---|---|
| Step 1 | MATLAB + Control System / Signal / DSP Toolbox（按场景） | 降级 python-control / scipy |
| Step 2 | Python 3 + numpy + scipy（仅 .mat 输入需要 scipy）| `pip install numpy scipy` |
| Step 3 | 你工程的构建链（cmake / gcc-arm-none-eabi / Keil 等） | 没有就先别上流水线 |
| Step 4 | OpenOCD / J-Link / Keil 任一 + 探针 | 同上 |
| Step 5 | Python + pyserial / `aemb-serial-monitor` skill | 同上 |
| Step 6 | MATLAB Base + plot 能力 | 降级 Python matplotlib |

---

## 10. 触发示例

不全的描述也能触发（Claude 帮你补齐）：

```
"算个 LQR 烧上去看效果"                 → 完整 6 步
"按我现在的 K.mat 重新烧一遍"           → Steps 2-6（跳过算）
"现在固件已经烧好，对比一下实测和仿真"   → Steps 5-6
"改了滤波器系数，重跑一遍流水线"         → Steps 1-6（全部）
```

Claude 应**先回声**列出"我打算跑这几步、跳过这几步"再开干，让用户确认。

---

## 11. 失败兜底完整路由

如果流水线出问题不知道该回 RIPER-5 哪个阶段：

```
Step 1 失败 + environment-missing  → RESEARCH（装环境）
Step 1 失败 + 其他                 → 流水线终止，回 INNOVATE 换算法
Step 2-3 失败                       → 流水线暂停，回 PLAN 改清单
Step 4 失败 + connection-failure   → 阻塞，要求用户检查硬件
Step 4 失败 + 其他                 → 流水线暂停，回 PLAN
Step 5 失败                         → 流水线暂停，进 systematic-debugging（refs）
Step 6 误差超阈 + ambiguous-context → 流水线暂停，让用户裁决
```

完整失败分类见 `.auto-embedded/refs/failure-taxonomy.md`。
