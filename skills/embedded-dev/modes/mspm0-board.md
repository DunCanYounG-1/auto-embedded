# MSPM0G3507 主板 / 核心板 工作流（逐飞开源库）

> 触发词：`MSPM0` / `MSPM0G3507` / `逐飞 MSPM0` / `Seekfree MSPM0` / `TI MSPM0`
>
> 用途：当用户基于逐飞 MSPM0G3507 核心板（或扩展板）启动新工程、移植驱动、做闭环控制或竞赛代码时，**直接复用本地开源库 + 例程**，避免从空白工程开始。
>
> **核心原则**：能用例程就用例程。本地已经备好 11 个核心板例程 + 主板综合例程 + 完整驱动封装，禁止重写底层。

---

## ⚠️ 法律警告（必读）

**逐飞 MSPM0G3507 开源库 = GPL-3.0**。商用闭源固件**必须**开源整个工程。

| 你的场景 | 是否可用 |
|---|---|
| 智能车竞赛 / 教学 / 个人学习 | ✅ 可用 |
| 比赛开源项目（按比赛规则发布源） | ✅ 可用 |
| 商业产品 + 闭源固件 | 🔴 **不可用** — 换 TI MSPM0 SDK 原生 + 自写驱动 |
| 商业产品 + 接受 GPL-3.0 整体开源 | ⚠️ 可用但需提供 anti-tivoization 安装指引 |

**Claude 操作**：当用户表露商用意图，立即询问发布形态（GPL 全开源 / 闭源 / 商业授权三选一），明确前不写代码。

**详细合规规则 + 替代方案 + 商业授权联系方式见 `modes\seekfree-lib.md` 的"法律警告"段。**

---

## 0. 资源定位（本地优先，远程兜底）

**仓库变量约定**：本模式所有路径以 `$MSPM0_LIB_ROOT` 为根。完整四级解析链 + POSIX 探测脚本见 `refs\mspm0g3507-seekfree-api.md` 第 0 节。

| 优先级 | 来源 | 备注 |
|---|---|---|
| ① | 环境变量 `MSPM0_LIB_ROOT` | 用户显式指定 |
| ② | 工程 `硬件资源表.md` 中 `MSPM0_LIB_ROOT:` 字段 | 跨项目复用 |
| ③ | skill 内置缓存 `$HOME/.claude/skills/embedded-dev/MSPM0G3507_Library-master/` | 典型场景 |
| ④ | 远程仓库 <https://gitee.com/seekfree/MSPM0G3507_Library> | 前三级未命中，需 clone |

> API 速查见 `refs\mspm0g3507-seekfree-api.md`（本模式启动后**必须先读** §0 + §1 + §2 + §3）。

---

## 1. 流程

### Step 0：定位库（自动探测）

执行 `refs\mspm0g3507-seekfree-api.md` §0.2 的 `detect_mspm0_root` 探测脚本：

```bash
detect_mspm0_root() {
  if [ -n "${MSPM0_LIB_ROOT:-}" ] && [ -d "$MSPM0_LIB_ROOT" ]; then
    printf '%s\n' "$MSPM0_LIB_ROOT"; return 0
  fi
  local skill_local="$HOME/.claude/skills/embedded-dev/MSPM0G3507_Library-master"
  if [ -d "$skill_local" ]; then
    printf '%s\n' "$skill_local"; return 0
  fi
  return 1
}

if MSPM0_LIB_ROOT=$(detect_mspm0_root); then
  echo "[MSPM0] 命中本地：$MSPM0_LIB_ROOT"
fi
```

**分支处理**：

- **命中本地** → 把 `MSPM0_LIB_ROOT` 写入工程 `硬件资源表.md`（键 `MSPM0_LIB_ROOT:`），进入 Step 1
- **未命中** → Claude 必须在对话中向用户询问以下两项，**禁止**自动决定：
  1. 是否同意从 Gitee 克隆远程仓库（约 200 MB，首次较慢）
  2. 克隆目标目录（建议 `~/sdk/`、`D:/sdk/` 或工程同级 `sdk/`，避免污染 skill 目录）

  用户确认后执行：
  ```bash
  git clone https://gitee.com/seekfree/MSPM0G3507_Library.git "<用户指定目录>"
  export MSPM0_LIB_ROOT="<用户指定目录>"
  ```
  并把路径写入工程 `硬件资源表.md`。

**禁止事项**：
- 禁止 shell 交互式 `read -p`（非交互 shell 不工作）
- 禁止 clone 进 `$HOME/.claude/skills/` 内部（污染 skill）
- 禁止硬编码具体用户名绝对路径
- 禁止跳过"询问用户"环节自作主张

---

### Step 1：识别用户场景

通过对话识别用户做的是什么类型项目，决定从哪个例程切入：

| 用户场景 | 推荐起点例程 | 关键驱动 |
|---|---|---|
| **新手第一次跑通板子** | `E10_printf_debug_log_demo` | 打印日志 → 后续调试基础 |
| **GPIO 点灯 / 按键** | `E01_gpio_demo` | `zf_driver_gpio` |
| **串口通信 / 上位机** | `E02_uart_demo` | `zf_driver_uart` |
| **电压采集 / 传感器读取** | `E03_adc_demo` | `zf_driver_adc` |
| **电机控制 / 舵机** | `E04_pwm_demo` | `zf_driver_pwm` + 主板 motor demo |
| **闭环 PID 控制** | `E05_pit_demo` + 主板 motor demo | PIT 周期触发 |
| **编码器测速** | 主板 encoder demo | `zf_driver_timer` 编码器模式 / `zf_device_absolute_encoder` |
| **IMU 姿态解算** | 主板 IMU demo | `zf_device_imu660ra` / `_imu963ra`，配 `refs\imu-gyroscope-checklist.md` |
| **图像处理 / CCD** | 主板 CCD demo | `zf_device_dl1b` / `_tsl1401` |
| **屏幕显示** | 主板 screen demo | `zf_device_ips200` / 等（§3.2 选型） |
| **参数掉电保存** | `E08_flash_demo` | `zf_driver_flash` |
| **多中断系统** | `E11_interrupt_priority_set_demo` | NVIC 优先级（M0+ 仅 4 档） |

**Claude 操作**：在 PLAN 模式实施清单中，**第一项必须**是"复制 `<起点例程>/` 到工程目录"。

---

### Step 2：硬件资源表初始化

把以下信息写入工程 `硬件资源表.md`：

```markdown
## 芯片与库
- 芯片：TI MSPM0G3507（Cortex-M0+, 80 MHz, 128 KB Flash, 32 KB SRAM）
- 库：逐飞 MSPM0G3507 开源库（GPL-3.0）
- MSPM0_LIB_ROOT: <实际路径>
- 编译环境：Keil MDK ≥ v5.37 + ARMCC v6
- 仿真器：逐飞 DAP（V2 WinUSB 模式高速烧录）

## 引脚禁用清单（来自 project/尽量不要使用的引脚.txt）
- SWD：<SWDIO 引脚> / <SWCLK 引脚>
- 屏幕接口：<板载固定引脚>
- IMU 接口：<板载固定引脚>
- 编码器接口 1-4：<板载固定引脚>
- 电机驱动 1-2：<板载固定引脚>
（按实际清单填写）

## 用户外设规划
| 外设 | 引脚 | 模块 | 用途 |
|---|---|---|---|
| ... | ... | ... | ... |
```

**Claude 操作**：在写代码前必须先填好这表，引脚冲突按 `refs\pin-planning.md` 校验。

---

### Step 3：移植到用户工程

按 PLAN 清单顺序，最小步幅：

1. **拷贝例程为基线**：把 `$MSPM0_LIB_ROOT/Example/Coreboard_Demo/E<XX>_<name>/` 整体复制到用户工程
2. **修改 `project/user/main.c`**：保留原例程初始化框架，业务逻辑写到独立 `.c`（命名 `app_*.c`，参照 `refs\embedded-architecture.md` 分层）
3. **新增业务文件**：放在 `project/code/`，遵循 `app_<module>.[ch]` / `drv_<device>.[ch]` 命名前缀
4. **应用层禁止**：`#include "ti_msp_dl_config.h"` / `#include "zf_driver_*.h"` 之外直接调 TI SDK
5. **每次只改一个文件**：编译 + 烧录 + 跑串口日志验证后再改下一个（RIPER-5 轮次制）

**反屎山检查**（按 `refs\embedded-architecture.md` §7）：
- [ ] `main.c` 仅做编排（`bsp_init` → `mid_init` → `svc_init` → `app_run`）
- [ ] 业务函数无 `DL_*` / `ti_msp_dl_*` 直接调用
- [ ] 函数 ≤ 50 行，嵌套 ≤ 2，参数 ≤ 3

---

### Step 4：编译 / 烧录 / 验证

#### 4.1 Keil 编译

打开 `$MSPM0_LIB_ROOT/SeekFree_MSPM0G3507_Opensource_Library/project/keil/Project.uvprojx`：
- 首次打开若提示缺 Pack：到 [TI Resource Explorer](https://www.ti.com/tool/MSPM0-SDK) 下载 MSPM0 SDK 安装
- 编译目标默认 `Flash`，调试用 `RAM`（更快烧录）
- 编译警告**必须清零**才能进入 REVIEW

#### 4.2 烧录（DAP 仿真器）

- DAP V1 模式：HID 协议，烧录速度 ~5 KB/s
- DAP V2 模式（WinUSB）：MDK v5.37+ 支持，速度 ~50 KB/s
- 配置：`Options → Debug → CMSIS-DAP → Settings`，勾选 `Reset and Run`

#### 4.3 验证证据（REVIEW 阶段必交）

每个清单项完成后必须**当场展示**：
- 编译输出（含 `0 Error(s), 0 Warning(s)` 字样）
- 烧录成功 log
- 串口日志（用 `printf` 输出关键变量值，或屏幕显示）
- 示波器 / 万用表测量（若涉及 PWM / ADC）

> "应该没问题 / 理论上能用" = REVIEW 不通过。

---

## 2. 与其他模式的关系

| 模式 | 何时切换 |
|---|---|
| `refs\embedded-architecture.md` | 任何写代码场景，本模式 Step 3 默认引用 |
| `refs\imu-gyroscope-checklist.md` | 用 `zf_device_imu*` 时必读 |
| `refs\mahony-ahrs-reference.md` | 高精度姿态解算（M0+ 上慎用浮点，建议定点） |
| `refs\control-loop-sign-debug.md` | E05/PIT + PWM 闭环调不稳时 |
| `refs\pin-planning.md` | Step 2 引脚规划展开 |
| `refs\static-analysis-pipeline.md` | REVIEW 阶段静态检查门 |
| `modes\seekfree-lib.md` | 库本身的更新 / 版本切换（不是工程移植） |
| `modes\datasheet-lookup.md` | 查 MSPM0G3507 TRM / 引脚复用 / 寄存器细节 |
| `modes\netlist-lookup.md` | 读原理图 PDF 提取硬件连接 |

---

## 3. 已知陷阱与最佳实践

### 3.1 Cortex-M0+ 硬约束

- ❌ **无 LDREX/STREX**：所有"读-改-写"原子操作改用 `__disable_irq()` / PRIMASK 保护，**不要**用 C11 `_Atomic`（GCC 在 M0 上会退化为锁版本）
- ❌ **无硬 FPU**：浮点运算靠软件库，PID 控制环路要么改 Q15/Q31 定点，要么控制频率 ≤ 200 Hz
- ❌ **无 DSP 指令**：MAC / 饱和算术等都是软件实现
- ⚠️ **NVIC 优先级仅 2 bit**（4 档），不能像 STM32F4 那样配 16 档

### 3.2 时序与功耗

- 主频上限 80 MHz，闭环控制环路建议 ≥ 1 ms（1 kHz）
- 低功耗模式见 SDK 的 `DL_SYSCTL_*` 函数，Seekfree 库未封装，需直接调 TI HAL

### 3.3 库版本兼容

- `COMPATIBLE_WITH_OLDER_VERSIONS` 宏：定义后启用旧版函数名（`gpio_set`/`gpio_get` 等），新工程**不要**定义此宏，强制用新接口
- `timer_funciton_check` 是原库拼写错误，**不要**改成 `function_check`，否则后续库升级冲突

### 3.4 工程组织建议

```
<user_project>/
├── project/
│   ├── code/                # 业务代码（推荐分层）
│   │   ├── app/             # L6 应用层（不 include zf_driver_*）
│   │   ├── drv/             # L3 设备驱动（封装 zf_device_*）
│   │   └── bsp/             # L2 板级配置
│   ├── user/
│   │   └── main.c           # 仅做编排，≤ 50 行
│   └── keil/
│       └── Project.uvprojx
├── libraries/               # 软链或 git submodule 到 $MSPM0_LIB_ROOT/SeekFree_MSPM0G3507_Opensource_Library/libraries/
└── docs/
    ├── 硬件资源表.md
    ├── 项目规划清单.md
    └── 编辑清单.md
```

---

## 4. 退出本模式

任务完成后：
1. 把最终引脚分配 / 编译参数 / 烧录方法**完整**写入 `硬件资源表.md`
2. 编辑清单记录所有改动文件 + commit hash
3. 回到触发前的 RIPER-5 阶段
