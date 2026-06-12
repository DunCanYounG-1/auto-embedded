# GD32F470 主板模板模式（MICU / CMIC 主板）

> 触发词：`GD32` / `GD32F4` / `GD32F470` / `GigaDevice` / `兆易` / `兆易创新` / `MICU 主板` / `CMIC 主板`
>
> 用途：当用户基于 MICU / McuSTUDIO GD32F470VET6 主板（或同芯片型号）启动新工程、移植驱动或做 UART OTA 升级时，**直接复用本地模板**，避免从空白工程开始或盲目联网搜索。
>
> **核心原则**：能用模板就用模板。本地已经备好 V1/V2 双版本 × Standalone/Bootloader 双形态共 4 套 Keil 工程 + 标准外设库 Pack + 完整 BSP + OTA 工具，禁止重写。

---

## 0. 资源定位（本地优先，远程兜底，跨平台）

**仓库变量约定**：本模式所有路径以 `$GD_ROOT` 为根。完整的四级解析链与 POSIX 探测脚本见 `.auto-embedded/refs/gd32f4xx-api.md` 第 0 节。

| 优先级 | 来源 | 备注 |
|---|---|---|
| ① | 环境变量 `GD32_SDK_ROOT` | 用户显式指定 |
| ② | 用户工程 `硬件资源表.md` 中 `GD32_SDK_ROOT:` 字段 | 跨项目复用 |
| ③ | skill 内置缓存 `$HOME/.claude/skills/embedded-dev/mcu_-gd_-main-board-master/` | 典型场景 |
| ④ | 远程仓库 <https://gitee.com/Ahypnis/mcu_-gd_-main-board> | 前三级未命中，需 clone |

| 子目录（相对 `$GD_ROOT`） | 用途 |
|---|---|
| `datasheet/` | V1/V2 原理图 PDF、芯片资料 |
| `doc/` | 数据手册、固件库使用指南、DMA 通道表 |
| `pack/` | Keil Pack（CMSIS、GD32F4xx_DFP、perf_counter）、标准外设库压缩包、`Keil5_disp_size_bar` 辅助工具 |
| `template_project/v1/` | 2025 版硬件模板（AC5+CMSIS5 或 AC6+CMSIS6） |
| `template_project/v2/` | 2026 版硬件模板（AC6+CMSIS6） |

> 详细 API 速查见 `.auto-embedded/refs/gd32f4xx-api.md`（本模式启动后**必须先读**）。

---

## 1. 流程

### Step 0：定位仓库（自动探测，必要时由 Claude 询问用户）

执行 `.auto-embedded/refs/gd32f4xx-api.md` 第 0.3 节的 `detect_gd_root` 探测脚本：

```bash
# 来源：.auto-embedded/refs/gd32f4xx-api.md §0.3
detect_gd_root() {
  if [ -n "${GD32_SDK_ROOT:-}" ] && [ -d "$GD32_SDK_ROOT" ]; then
    printf '%s\n' "$GD32_SDK_ROOT"; return 0
  fi
  local skill_local="$HOME/.claude/skills/embedded-dev/mcu_-gd_-main-board-master"
  if [ -d "$skill_local" ]; then
    printf '%s\n' "$skill_local"; return 0
  fi
  return 1
}

if GD_ROOT=$(detect_gd_root); then
  echo "[GD] 命中本地：$GD_ROOT"
fi
```

**分支处理**：

- **命中本地** → 把 `GD_ROOT` 写入用户工程 `硬件资源表.md`（键 `GD32_SDK_ROOT:`），进入 Step 1
- **未命中** → Claude 必须在对话中向用户询问以下两项，**禁止**自动决定：
  1. 是否同意从 Gitee 克隆远程仓库（仓库约 248 MB，首次克隆较慢）
  2. 克隆目标目录（建议放在用户 `~/sdk/`、`D:/sdk/` 或工程同级目录的 `sdk/` 下，避免污染 skill 目录或 HOME 根）

  用户确认后执行：
  ```bash
  git clone https://gitee.com/Ahypnis/mcu_-gd_-main-board "<用户指定目录>"
  export GD32_SDK_ROOT="<用户指定目录>"
  ```
  并把路径写入工程 `硬件资源表.md`。

**禁止事项**：
- 禁止使用 shell 交互式 `read -p`（Claude 调用的 bash 通常非交互）
- 禁止把仓库 clone 进 `$HOME/.claude/skills/` 内部任何位置（污染 skill）
- 禁止使用任何具体用户名的硬编码绝对路径
- 禁止跳过"询问用户"环节自作主张选择目录

---

### Step 1：识别硬件版本 + 工程形态

向用户确认两个维度（如果用户没说清）：

| 维度 | 取值 | 判定提示 |
|---|---|---|
| **板卡版本** | V1（2025 板）/ V2（2026 板） | 看板上丝印；或问用户"LED 是高电平点亮（V2）还是低电平点亮（V1）？" |
| **工程形态** | Standalone（裸 App）/ Bootloader（OTA） | 是否需要远程升级？需要就选 Bootloader |

### Step 2：选择模板入口

| 板卡 | 形态 | 工程目录 | 工具链 |
|---|---|---|---|
| V1 | Standalone | `template_project\v1\GD32F470_App_Standalone\` | AC5+CMSIS5 或 AC6+CMSIS6（两套均有） |
| V1 | Bootloader | `template_project\v1\GD32F470_App_Bootloader\` | AC5+CMSIS5 |
| V2 | Standalone | `template_project\v2\GD32F470_App_Standalone\GD_Firmware_Template_ac6_cmsis_6_with_dependence\MDK\Project.uvprojx` | AC6+CMSIS6 |
| V2 | Bootloader | `template_project\v2\GD32F470_App_Bootloader\Project\` | AC6+CMSIS6 |

> 工程名含 `with_dependence` 的版本**已把依赖打进工程**，可直接打开 `MDK\Project.uvprojx`；不含的需先安装 `pack\` 下对应 Pack。

### Step 3：依赖安装（仅"不带 with_dependence"模板）

```
1. 双击安装：pack\ARM.CMSIS.5.9.0.pack           （或 CMSIS6 等价 Pack）
2. 双击安装：pack\GigaDevice.GD32F4xx_DFP.3.0.3.pack
3. 双击安装：pack\GorgonMeducer.perf_counter.2.3.3.pack  （或 2.5.4，按工具链匹配）
4. 如需自行编译标准外设库：解压 pack\GD32F4xx_Firmware_Library_V3.3.3.7z
```

### Step 4：拷贝模板到用户工作目录

由 Claude 询问用户目标位置后，拷贝整个工程目录。**禁止**让用户在 `$GD_ROOT` 内直接编辑模板（会污染未来其他项目，且若 `$GD_ROOT` 在 skill 目录内，更新 skill 时可能丢失）。

通用模板路径（按解析结果展开）：

| 板卡 | 工程形态 | 源路径（相对 `$GD_ROOT`） |
|---|---|---|
| V2 | Standalone | `template_project/v2/GD32F470_App_Standalone/GD_Firmware_Template_ac6_cmsis_6_with_dependence/` |
| V2 | Bootloader | `template_project/v2/GD32F470_App_Bootloader/Project/` |
| V1 | Standalone | `template_project/v1/GD32F470_App_Standalone/` |
| V1 | Bootloader | `template_project/v1/GD32F470_App_Bootloader/Project/` |

执行命令（按平台二选一）：

```bash
# Linux / macOS / Git Bash
SRC="$GD_ROOT/template_project/v2/GD32F470_App_Standalone/GD_Firmware_Template_ac6_cmsis_6_with_dependence"
DST="<用户指定的工程目录>"   # 例如 ~/projects/my_gd32_app
cp -r "$SRC" "$DST"
```

```powershell
# Windows PowerShell
$src = "$env:GD32_SDK_ROOT\template_project\v2\GD32F470_App_Standalone\GD_Firmware_Template_ac6_cmsis_6_with_dependence"
$dst = "<用户指定的工程目录>"   # 例如 D:\projects\my_gd32_app
Copy-Item -Recurse $src $dst
```

### Step 5：识别工程画像（接入主协议）

拷贝完成后，调用工程画像探测器写入用户项目的 `硬件资源表.md`：

```bash
python .auto-embedded/tools/shared/project_detect.py <dst>
```

预期 `Project Profile`：
- `build_system = keil-mdk`
- `target_mcu = GD32F470VET6`
- `probe = j-link / cmsis-dap`（由用户硬件决定）
- `artifact_kind = hex/bin`

### Step 6：编译 → 烧录 → 监控

| 操作 | 兄弟 skill | 命令模板 |
|---|---|---|
| 编译 | `aemb-build-keil` | 工程根 `MDK\Project.uvprojx` |
| 烧录 | `aemb-flash-keil`（Keil 内置）或 `aemb-flash-jlink` | 起始地址按版本选 `0x08000000`（Standalone）或 `0x0800D000`（Bootloader 的 App） |
| 串口监视 | `aemb-serial-monitor` | Debug 默认 USART0 `PA9/PA10 @115200` |

### Step 7：UART OTA 升级（仅 Bootloader 模板）

工程引脚和参数（V2）：

| 项 | 默认 |
|---|---|
| OTA UART | USART2 |
| TX / RX | PD8 / PD9 |
| DMA | DMA0 CH1 SUB4 |
| 波特率 | 921600 |
| App 起始地址 | `0x0800D000` |

执行：
```powershell
cd <Bootloader 模板根目录>
pip install pyserial
python Tools\ota_uart_sender.py --port COM4 --baud 921600 `
    --bin Project\GD_Firmware_Template_ac6_cmsis_6_with_dependence\MDK\output\App.bin `
    --header-version v2 --target-addr 0x0800D000 --monitor-seconds 5
```

> 首次烧录顺序：先用调试器烧 BootLoader 到 `0x08000000`，再烧 App 到 `0x0800D000`（Keil 下载时**不要选整片擦除**，否则会把 BootLoader 擦掉）；后续用 OTA 脚本升级即可。

---

## 2. 板载 BSP 与 API 速查

| 需求 | 文件 |
|---|---|
| GD32F4xx 外设 API（RCU/GPIO/USART/SPI/I2C/DMA/TIMER/ADC） | `refs\gd32f4xx-api.md` 第 3~8 节 |
| 板载引脚 / LED / 按键 / OLED / SPI Flash / SDIO 映射 | `refs\gd32f4xx-api.md` 第 9 节 |
| DMA 通道完整表 | `mcu_-gd_-main-board-master\doc\DMA_CHANNEL_MAP.md` |
| Bootloader 分区表 | `refs\gd32f4xx-api.md` 第 10 节 |
| BSP 头文件源 | `template_project\v2\...\Components\bsp\mcu_cmic_gd32f470vet6.h` |

---

## 3. 添加新外设的标准流程（参考板载 BSP）

1. 在 `Components\bsp\mcu_cmic_gd32f470vet6.h` 模式下，按外设分段定义 `xxx_PORT / xxx_PIN / xxx_AF`
2. 在 BSP `.c` 文件实现 `bsp_xxx_init(void)`：使能时钟 → 配 GPIO → 配外设 → 配中断/DMA → 使能外设
3. 在 `USER\src\main.c` 中**只**调用 `bsp_xxx_init()`，不要把寄存器代码写进 `main.c`（违反主协议架构硬约束）
4. 应用层逻辑放 `APP\xxx_app.c/h`，并在 `APP\scheduler.c` 注册

> 严格遵循主协议 `main.c 仅承担启动编排和顶层循环调度` 的硬约束。

---

## 4. 常见踩坑（GD32 模板专属）

| 现象 | 修复 |
|---|---|
| Keil 报 `Device GD32F470VETx not found` | 没装 `GigaDevice.GD32F4xx_DFP.3.0.3.pack` |
| `perf_counter.h` 找不到 | 没装 `GorgonMeducer.perf_counter.*.pack`，或用 `with_dependence` 模板 |
| Bootloader 烧好后 App 不跳转 | 检查 App 工程 scatter `LR_IROM1 0x0800D000`、`SCB->VTOR = 0x0800D000UL`、`common\bl_partition.h` 与 BL 同步 |
| OTA 接收超时 | 优先查串口接线、波特率（默认 921600）、App 是否在运行（OTA 由 App 触发而非 BL） |
| LED 状态相反 | 注意 V1=低电平点亮、V2=高电平点亮，`LED_ACTIVE_HIGH` 宏要匹配 |
| `keilkill.bat` 误删 | 该批处理在 `template_project\` 根，用于清 Keil 中间产物，**只在确实要清理时用**，不要养成习惯 |

---

## 5. 完成后回归主协议

任务结束后，**回到触发 `gd32-board` 模式之前的 RIPER-5 阶段**，把：

- 模板路径、版本（V1/V2、Standalone/Bootloader）、工具链
- 已识别的引脚分配
- DMA 通道占用
- Bootloader 分区（如适用）

写入用户项目的 `硬件资源表.md`，然后继续 PLAN / EXECUTE / REVIEW。
