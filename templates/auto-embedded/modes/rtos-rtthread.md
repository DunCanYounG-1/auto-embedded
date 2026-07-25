# RT-Thread 带 OS 开发模式

> 触发词：`RT-Thread` / `RTThread` / `RTT` / `rtthread` / `scons` / `menuconfig` / `finsh` / `msh` / `env 工具` / `软件包` / `pkgs`
>
> 用途：当用户基于 RT-Thread（Nano 或完整版）做带 OS 的固件开发时，按 RT-Thread 自成体系的 `env / scons / menuconfig / 软件包 / 设备框架` 流程推进，而不是套裸机或 ESP-IDF 的思路。
>
> **核心原则**：用 RT-Thread 就用它的原生生态——`scons` 构建、`menuconfig` 配置、`pkgs` 软件包、`rt_device` 设备框架、FinSH/MSH 交互。RTOS 在分层架构里属于 **L4 中间件（`mid_`）**，业务层（L6 `app_`）**不直接感知内核 API**，跨设备走 HAL Port 或 RT-Thread 设备框架。

---

## 0. 环境与资源定位

| 检查项 | 判定方式 | 说明 |
|---|---|---|
| 是否 RT-Thread 工程 | 工程根有 `rtconfig.h` + `rtconfig.py` + `SConstruct`；或源码含 `rtthread.h` | 三者齐全即 scons BSP 工程 |
| Nano vs 完整版 | 有独立 `bsp/<board>/` + `components/` + `pkgs` → 完整版；仅几个 `.c/.h` 挂进裸机工程 → Nano | Nano 常直接用 Keil/CubeIDE 编译，不走 scons |
| env 工具 | `RTT_ROOT` 环境变量 / `env` 目录 | 提供 `scons`、`menuconfig`、`pkgs` |
| 工具链 | `rtconfig.py` 的 `CROSS_TOOL` / `EXEC_PATH` / `PREFIX` | 决定 gcc/keil/iar 与编译器路径 |

| 需求 | 交给谁 |
|---|---|
| 探测环境 / 解析 rtconfig.py / scons 构建 / 找产物 | 工具技能 `aemb-build-scons` |
| 任务列表 / 栈水位 / 死锁 / 内核对象 | 工具技能 `aemb-rtos-debug`（RT-Thread 线程感知） |
| 烧录 rtthread.bin/.elf | `aemb-flash-openocd` / `aemb-flash-jlink` |
| 串口看 FinSH/MSH | `aemb-serial-monitor` |

> RT-Thread 库本身的定位、组件生态见 `.auto-embedded/refs/embed-libs-index.md` 第 1 节（**只查不复述**）。

---

## 1. 流程

### Step 0：识别 RT-Thread 工程

在工程根查 `rtconfig.h` / `rtconfig.py` / `SConstruct` / 源码 `#include <rtthread.h>`。命中则调用工程画像探测器写入用户项目 `硬件资源表.md`：

```bash
python .auto-embedded/tools/shared/project_detect.py <工程根>
```

预期 `Project Profile`：`build_system = scons`、`rtos = rt-thread`、`target_mcu = <芯片>`、`artifact_kind = elf/bin`。

> Nano 版若挂在 Keil/裸机工程里编译，**不走 scons**——转用 `aemb-build-keil` / `aemb-build-cmake`，但 RTOS 编码规则（本文第 2 节）仍适用。

### Step 1：menuconfig 配置（交互式，用户手动）

内核裁剪、组件开关、软件包选择都在 `menuconfig`。**Claude 不自动执行**（Kconfig 是全屏交互 TUI），提示用户在工程根手动运行：

```bash
scons --menuconfig        # 或 env 工具里的 menuconfig
```

改完配置会重新生成 `rtconfig.h`；**改配置后必须重新构建**（见 Step 3）。

### Step 2：软件包（pkgs，交互式/联网，用户手动）

在 `menuconfig` 里选中的在线软件包，需用户手动拉取/更新：

```bash
pkgs --update
```

> 联网 + 可能交互，**Claude 不自动执行**；提示用户运行后再继续。

### Step 3：scons 构建

交给工具技能 `aemb-build-scons`（内部调 `scons -j N`）：

```bash
{{PYTHON_CMD}} .auto-embedded/tools/build-scons/scripts/scons_builder.py --detect --source <工程根>
{{PYTHON_CMD}} .auto-embedded/tools/build-scons/scripts/scons_builder.py --source <工程根> -j 8
```

产物默认在工程根：`rtthread.elf` / `rtthread.bin`。

### Step 4：烧录

| 探针 | skill | 备注 |
|---|---|---|
| OpenOCD / DAP | `aemb-flash-openocd` | 烧 `rtthread.bin`，起始地址按芯片 |
| J-Link | `aemb-flash-jlink` | 烧 `rtthread.elf`（带符号） |

### Step 5：FinSH/MSH + 线程感知调试

- 串口连上后，FinSH/MSH 里 `list_thread` / `free` / `ps` 看线程与内存；`aemb-serial-monitor` 抓串口。
- 需要停在断点看任务列表 / 栈水位 / 死锁时，把带符号的 `rtthread.elf` 交给 `aemb-rtos-debug`（`--rtos rt-thread`）。

---

## 2. 分层架构下的 RT-Thread

> RTOS = L4 中间件（`mid_`），`main.c` 只做编排（见 `.auto-embedded/refs/embedded-architecture.md` §1、§6）。带 OS 时 `app_run()` 里挂调度器/创建任务即满足 ARCH-9。

### 2.1 设备框架 vs 自建 HAL Port（取舍与共存）

RT-Thread 自带 `rt_device` I/O 设备框架（`rt_device_find/open/read/write/control`）。它和本框架的 L1 HAL Port 有重叠，按下表取舍：

| 场景 | 推荐 | 理由 |
|---|---|---|
| 用 RT-Thread 完整版 + 组件（DFS/网络/USB） | 直接用 `rt_device_*` 设备框架 | 组件都依赖设备框架，另起 HAL 反而割裂 |
| 需要跨 RTOS / 裸机双目标复用同一份业务 | 自建 L1 HAL Port，RT-Thread 侧写一份 adapter | 业务层不锁定 RT-Thread，可迁到裸机/FreeRTOS |
| Nano 版、无组件、只借调度器 | 自建 HAL Port | 设备框架未裁进来，没必要引入 |

> 共存原则：**同一类外设只选一条路**（要么 `rt_device`，要么 `hal_*` Port），禁止一半走设备框架一半裸调寄存器——违反 `embedded-architecture.md` §8 屎山预警"同一硬件功能多处不同接口实现"。

### 2.2 任务 / 优先级 / 栈 / IPC 设计

- **硬实时控制环仍放硬件 ISR**，RTOS 任务只跑非硬实时逻辑/通信/规划——见 `.auto-embedded/refs/realtime-scheduling-isr-dma.md`「裸机时间片 vs RTOS」。
- **ISR 内只用 ISR-safe API**：RT-Thread 允许 `rt_sem_release` / `rt_event_send`，**禁用** `rt_thread_delay` / `rt_mutex_take(timeout!=0)`——完整白名单见 `.auto-embedded/refs/coding-standards.md` §12.5（由 `arch-check.sh` ARCH-9 扫描）。
- **栈给够防溢出**、当心优先级反转（互斥量用优先级继承）——用 `aemb-rtos-debug --stack-check` 实测水位。

---

## 3. 常见踩坑（RT-Thread 专属）

| 现象 | 修复 |
|---|---|
| `scons` 报找不到编译器 / `arm-none-eabi-gcc: No such file` | `rtconfig.py` 的 `EXEC_PATH` 指错；改成实际工具链 bin 目录（env 内置或系统装的） |
| 改了 `menuconfig` 但行为没变 | 没重新构建；`rtconfig.h` 更新后要 `scons -c` 再 `scons` |
| `pkgs --update` 后编译报缺文件 | 软件包没拉全或版本不符；重跑 `pkgs --update`，或在 menuconfig 里确认包版本 |
| 串口无 FinSH 输出 | console device 没配（menuconfig 里 `RT_CONSOLE_DEVICE_NAME` 与实际 uart 不符），或 uart 未 `rt_hw_..._init` |
| HardFault，怀疑栈溢出 | `aemb-rtos-debug --stack-check` 看各线程水位；调大溢出线程 `stack_size`；开 `RT_USING_OVERFLOW_CHECK` |
| Release 优化后 rtos-debug 读不到线程 | 内核符号被优化掉；调试构建保留符号，或 `aemb-memory-analysis` 辅助分析 |

---

## 4. 完成后回归主协议

任务结束后，**回到触发 `rtos-rtthread` 模式之前的 RIPER-5 阶段**，把：

- `build_system: scons`、`rtos: rt-thread`、RT-Thread 版本（Nano/完整版）
- 工具链家族与 `EXEC_PATH`
- 已配置的关键组件 / 软件包
- 线程划分、优先级、栈深（如已定）

写入用户项目的 `硬件资源表.md`，然后继续 PLAN / EXECUTE / REVIEW。

> 相关契约：`Project Profile` 的 `rtos` 字段取值见 `.auto-embedded/refs/contracts.md`。
