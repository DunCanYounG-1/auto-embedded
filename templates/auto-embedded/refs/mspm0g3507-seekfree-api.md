# MSPM0G3507 Seekfree 开源库 API 速查手册

> 来源：[逐飞科技 MSPM0G3507 开源库](https://gitee.com/seekfree/MSPM0G3507_Library)（基于 TI MSPM0 SDK 的第三方封装，GPL-3.0）
> 适用芯片：**TI MSPM0G3507**（Arm Cortex-M0+，80 MHz，128 KB Flash / 32 KB SRAM）
> 板载参考：逐飞 MSPM0G3507 核心板 + 扩展板（电机驱动 / 编码器 / IMU / 摄像头 / 屏幕）
> 资源仓库：变量 `$MSPM0_LIB_ROOT`，按第 0 节四级链解析
> 离线缓存，RESEARCH / EXECUTE 阶段优先查本文件，无需联网

---

## 0. 资源定位（必须先读）

### 0.1 仓库位置解析（四级链）

仓库路径由变量 **`MSPM0_LIB_ROOT`** 表示，按以下优先级解析，找到第一个存在的路径即停：

| 优先级 | 来源 | 检测方式 | 适用场景 |
|---|---|---|---|
| ① | 环境变量 `MSPM0_LIB_ROOT` | `[ -n "$MSPM0_LIB_ROOT" ] && [ -d "$MSPM0_LIB_ROOT" ]` | 用户显式指定，最高优先 |
| ② | 工程 `硬件资源表.md` 中 `MSPM0_LIB_ROOT:` 字段 | RESEARCH 阶段读取此键 | 多项目复用同一份库 |
| ③ | skill 内置缓存 | `[ -d "$HOME/.claude/skills/embedded-dev/MSPM0G3507_Library-master" ]` | 用户已把库放进 skill 目录（典型场景） |
| ④ | 远程仓库 | <https://gitee.com/seekfree/MSPM0G3507_Library> | 前三级未命中，需 `git clone` |

> 路径解析必须在 **RESEARCH 阶段最早** 完成；结果写入工程 `硬件资源表.md`，**禁止**在 PLAN / EXECUTE 阶段反复探测。

### 0.2 解析脚本（POSIX，Git Bash / bash / zsh 通用）

```bash
detect_mspm0_root() {
  # ① 环境变量
  if [ -n "${MSPM0_LIB_ROOT:-}" ] && [ -d "$MSPM0_LIB_ROOT" ]; then
    printf '%s\n' "$MSPM0_LIB_ROOT"; return 0
  fi
  # ③ skill 内置缓存（② 由 Claude 在 RESEARCH 阶段读硬件资源表完成）
  local skill_local="$HOME/.claude/skills/embedded-dev/MSPM0G3507_Library-master"
  if [ -d "$skill_local" ]; then
    printf '%s\n' "$skill_local"; return 0
  fi
  return 1
}

if MSPM0_LIB_ROOT=$(detect_mspm0_root); then
  echo "[MSPM0] 命中本地：$MSPM0_LIB_ROOT"
else
  echo "[MSPM0] 未命中本地。远程仓库：https://gitee.com/seekfree/MSPM0G3507_Library"
  echo "[MSPM0] 需要 Claude 向用户索要目标目录后执行 git clone，并把路径写入硬件资源表"
fi
```

> 解析失败时**禁止** shell 交互式 `read`（Claude 调用的非交互 shell 不工作）。改由 Claude 在对话中向用户询问 clone 目标目录，再执行 `git clone https://gitee.com/seekfree/MSPM0G3507_Library.git <目标目录>`。

### 0.3 跨平台 skill 安装根目录约定

参照 `refs\gd32f4xx-api.md` §0.2 — 三平台 `$HOME` 展开规则一致，禁止硬编码用户名路径。

### 0.4 关键资源（相对 `$MSPM0_LIB_ROOT`）

> 路径分隔符统一用正斜杠，Windows 下 Git Bash / Keil / VS Code 均可识别。

| 资源 | 路径（`$MSPM0_LIB_ROOT/` 之下） | 用途 |
|---|---|---|
| TI MSPM0 SDK | `SeekFree_MSPM0G3507_Opensource_Library/libraries/sdk/` | vendor HAL，含 `ti_msp_dl_config.*` |
| Seekfree 公共头 | `SeekFree_MSPM0G3507_Opensource_Library/libraries/zf_common/` | 类型定义 / 调试 / printf 重定向 |
| Seekfree 外设驱动 | `SeekFree_MSPM0G3507_Opensource_Library/libraries/zf_driver/` | 11 个外设封装（见 §2） |
| Seekfree 设备驱动 | `SeekFree_MSPM0G3507_Opensource_Library/libraries/zf_device/` | 21 个模块驱动（见 §3） |
| Seekfree 组件 | `SeekFree_MSPM0G3507_Opensource_Library/libraries/zf_components/` | 高层组件（菜单 / 摄像头处理等） |
| MDK 工程 | `SeekFree_MSPM0G3507_Opensource_Library/project/keil/` | 默认 Keil 工程入口 |
| 用户代码区 | `SeekFree_MSPM0G3507_Opensource_Library/project/user/` | `main.c` 所在 |
| 引脚禁用清单 | `SeekFree_MSPM0G3507_Opensource_Library/project/尽量不要使用的引脚.txt` | **强烈推荐先读** |
| 核心板例程 | `Example/Coreboard_Demo/E01..E11/` | 11 个基础外设例程（见 §4） |
| 主板例程 | `Example/Motherboard_Demo/` | 电机 / 编码器 / 屏幕 / IMU 综合例程 |
| 例程功能说明 | `Example/【必读】例程功能说明.xlsx` | 用 `/xlsx` skill 解析 |
| 原理图 | `【原理图】原理图 丝印图 尺寸图 位号图/` | 板载网表来源（PDF） |
| 芯片手册 | `【文档】说明书 芯片手册等/` | MSPM0G3507 datasheet + TRM |

---

## 1. 与 STM32 HAL / GD32 标准库的核心差异

| 维度 | STM32 HAL | GD32 标准库 | **MSPM0 + Seekfree** |
|---|---|---|---|
| 内核 | Cortex-M0~M7 | Cortex-M3/M4/M7 | **Cortex-M0+**（无 DSP / FPU） |
| 主频上限 | 多变 | 200 MHz (F470) | **80 MHz** |
| 时钟单元 | RCC | RCU | **SYSCTL** (TI 命名) |
| 初始化工具 | CubeMX 生成 | 手动 / GD-Link | **TI SysConfig** 生成 `ti_msp_dl_config.*` |
| HAL 风格 | `HAL_Xxx_Yyy()` 驼峰 | `xxx_yyy()` 全小写 | TI: `DL_GPIO_*()` 大写；**Seekfree: `xxx_yyy()` 全小写**（推荐用） |
| GPIO 命名 | `GPIO_PIN_0..15` × `GPIOA..H` | 同 STM32 | **`A0..A31` / `B0..B27`** 单标识符直接选 |
| 中断回调 | `HAL_UART_RxCpltCallback` 弱链接 | 寄存器轮询 | **`xxx_set_callback(idx, cb, ptr)`** 注册式 |
| 原子操作 | LDREX/STREX (M3+) | LDREX/STREX (M3+) | **❌ 无 LDREX/STREX** → 用 `__disable_irq()` / PRIMASK |
| 内存屏障 | `__DMB/DSB/ISB` | `__DMB/DSB/ISB` | **同样可用**（Cortex-M0+ 标准指令） |

**关键限制提示**：
- MSPM0G3507 是 Cortex-M0+，**没有 DSP 指令、没有硬 FPU、没有 LDREX/STREX 原子读改写**。所有 IMU 姿态解算、卡尔曼滤波等浮点计算性能受限，必要时改定点
- 80 MHz 主频 + 32 KB SRAM 是硬约束，**禁止**在关键路径用 `malloc`，控制环路定时 ≥ 1 ms（高于 STM32F4 典型 0.1 ms）

---

## 2. zf_driver/ 外设驱动 API 速查（11 类）

> 命名风格：snake_case + 模块前缀。所有函数签名见对应 `.h` 文件，注释规整。

### 2.1 GPIO — `zf_driver_gpio.h`

```c
// 引脚枚举：A0~A31, B0~B27（直接当一个值用）
void   gpio_init       (gpio_pin_enum pin, gpio_dir_enum dir, const uint8 dat, gpio_mode_enum mode);
void   afio_init       (gpio_pin_enum pin, gpio_dir_enum dir, gpio_af_enum af, gpio_mode_enum mode);
void   gpio_set_level  (gpio_pin_enum pin, const uint8 dat);
uint8  gpio_get_level  (gpio_pin_enum pin);
void   gpio_toggle_level(gpio_pin_enum pin);
void   gpio_set_dir    (gpio_pin_enum pin, gpio_dir_enum dir, gpio_mode_enum mode);

// 高速宏（直接寄存器，节省函数调用开销）
#define gpio_low(pin)   ...   // 拉低
#define gpio_high(pin)  ...   // 拉高
```

**枚举**：`gpio_dir_enum {GPI, GPO}` / `gpio_mode_enum {GPI_PULL_UP, GPO_PUSH_PULL, GPO_AF_PUSH_PULL, ...}` / `gpio_af_enum {GPIO_AF0..AF15}`

### 2.2 UART — `zf_driver_uart.h`

```c
void   uart_init                (uart_index_enum uart, uint32 baud, uart_tx_pin_enum tx, uart_rx_pin_enum rx);
void   uart_write_byte          (uart_index_enum uart, const uint8 dat);
void   uart_write_buffer        (uart_index_enum uart, const uint8 *buf, uint32 len);
void   uart_write_string        (uart_index_enum uart, const char *str);
uint8  uart_read_byte           (uart_index_enum uart, uint8 *data);   // 阻塞 + 超时
uint8  uart_query_byte          (uart_index_enum uart, uint8 *data);   // 非阻塞查询
void   uart_set_callback        (uart_index_enum uart, void_callback_uint32_ptr cb, void *ptr);
void   uart_set_interrupt_config(uart_index_enum uart, uart_interrupt_config_enum cfg);
```

**模块**：`UART_0 ~ UART_3`（共 4 个）
**引脚枚举**示例：`UART0_TX_A0`, `UART0_RX_A1`, `UART1_TX_B4`, ...（每个 UART 都有 4 个可选 TX/RX 引脚位置）
**超时常量**：`UART_DEFAULT_TIMEOUT_COUNT = 0x001FFFFF`（约 2M cycle，80 MHz 下约 26 ms）

### 2.3 ADC — `zf_driver_adc.h`

```c
void   adc_init               (adc_pin_enum adc_pin, adc_resolution_enum resolution);
uint16 adc_convert            (adc_pin_enum adc_pin);                       // 单次转换
uint16 adc_mean_filter_convert(adc_pin_enum adc_pin, const uint8 count);   // 多次均值滤波
```

**分辨率**：`ADC_RESOLUTION_12BIT` / `ADC_RESOLUTION_10BIT` / `ADC_RESOLUTION_8BIT`

### 2.4 PWM — `zf_driver_pwm.h`

```c
void   pwm_init    (pwm_channel_enum pin, const uint32 freq, const uint32 duty);
void   pwm_set_duty(pwm_channel_enum pin, const uint32 duty);
```

**占空比单位**：万分比（10000 = 100%）
**典型频率**：电机 ≤ 20 kHz，舵机 50 Hz

### 2.5 PIT（周期性中断定时器）— `zf_driver_pit.h`

```c
void   pit_init    (pit_index_enum pit_n, uint32 period, void_callback_uint32_ptr cb, void *ptr);  // 原始 tick
void   pit_us_init (pit_index_enum pit_n, uint32 period, void_callback_uint32_ptr cb, void *ptr);  // 微秒
void   pit_ms_init (pit_index_enum pit_n, uint32 period, void_callback_uint32_ptr cb, void *ptr);  // 毫秒
void   pit_enable  (pit_index_enum pit_n);
void   pit_disable (pit_index_enum pit_n);
```

> **闭环控制建议**：用 `pit_ms_init(PIT0, 5, control_loop_cb, NULL)` 跑 200 Hz 控制环。

### 2.6 EXTI（外部中断）— `zf_driver_exti.h`

```c
void   exti_init   (gpio_pin_enum pin, exti_trigger_enum trigger, void_callback_uint32_ptr cb, void *ptr);
void   exti_enable (gpio_pin_enum pin);
void   exti_disable(gpio_pin_enum pin);
```

**触发类型**：`EXTI_TRIGGER_RISING` / `_FALLING` / `_BOTH`

### 2.7 TIMER — `zf_driver_timer.h`

```c
void   timer_init           (timer_index_enum idx, timer_mode_enum mode);
void   timer_clock_enable   (timer_index_enum idx);
void   timer_start          (timer_index_enum idx);
void   timer_stop           (timer_index_enum idx);
uint16 timer_get            (timer_index_enum idx);
void   timer_clear          (timer_index_enum idx);
uint8  timer_funciton_check (timer_index_enum idx, timer_function_enum mode);  // 注：原库拼错 funciton
```

> ⚠️ `timer_funciton_check` 是原库的拼写（**function** → funciton），保留原样调用。

### 2.8 FLASH — `zf_driver_flash.h`

```c
uint8  flash_check                  (uint32 sector_num, uint32 page_num);
uint8  flash_erase_page             (uint32 sector_num, uint32 page_num);
void   flash_read_page              (uint32 sector_num, uint32 page_num, uint32 *buf, uint16 len);
uint8  flash_write_page             (uint32 sector_num, uint32 page_num, const uint32 *buf, uint16 len);
// 带内部缓冲的读写
void   flash_read_page_to_buffer    (uint32 sector_num, uint32 page_num);
uint8  flash_write_page_from_buffer (uint32 sector_num, uint32 page_num);
void   flash_buffer_clear           (void);
```

> ⚠️ MSPM0G3507 Flash 总 128 KB，**写前必须 erase**；buffer 模式用于按字段修改而不重写整页。

### 2.9 SPI（硬件）— `zf_driver_spi.h`

```c
void   spi_init               (spi_index_enum idx, spi_mode_enum mode, uint32 baud,
                               spi_sck_pin_enum sck, spi_mosi_pin_enum mosi,
                               spi_miso_pin_enum miso, spi_cs_pin_enum cs);
// 写
void   spi_write_8bit         (spi_index_enum idx, const uint8 data);
void   spi_write_8bit_array   (spi_index_enum idx, const uint8 *data, uint32 len);
void   spi_write_16bit        (spi_index_enum idx, const uint16 data);
void   spi_write_16bit_array  (spi_index_enum idx, const uint16 *data, uint32 len);
// 寄存器风格（先发寄存器名再发数据，OLED/IMU 常用）
void   spi_write_8bit_register(spi_index_enum idx, const uint8 reg, const uint8 data);
void   spi_write_8bit_registers(spi_index_enum idx, const uint8 reg, const uint8 *data, uint32 len);
// 读
uint8  spi_read_8bit          (spi_index_enum idx);
void   spi_read_8bit_array    (spi_index_enum idx, uint8 *data, uint32 len);
uint16 spi_read_16bit         (spi_index_enum idx);
// 双向
void   spi_transfer_8bit      (spi_index_enum idx, const uint8 *tx, uint8 *rx, uint32 len);
void   spi_transfer_16bit     (spi_index_enum idx, const uint16 *tx, uint16 *rx, uint32 len);
```

### 2.10 软件 IIC — `zf_driver_soft_iic.h`

> 不限引脚，**任意 GPIO** 当 SCL/SDA。比硬件 IIC 灵活但慢。

```c
void   soft_iic_init          (soft_iic_info_struct *obj, uint8 addr, uint32 delay,
                               gpio_pin_enum scl, gpio_pin_enum sda);
// 8/16-bit 单字节 / 数组 / 寄存器风格 / SCCB（摄像头专用） / splicing（拼接数组）
// 完整 28 个函数见头文件
```

**典型应用**：MPU6050（不能用 SPI 时）、SCCB 协议摄像头（OV7670）

### 2.11 延时 — `zf_driver_delay.h`

```c
void system_delay_ms(uint32 time);   // 阻塞毫秒
void system_delay_us(uint32 time);   // 阻塞微秒
```

> ⚠️ 阻塞延时**禁止**在 ISR 内调用，控制环路也不要用 — 改用 PIT 定时回调。

---

## 3. zf_device/ 设备驱动选型表（21 个）

按用途分类，**选型决策表**如下：

### 3.1 IMU 姿态传感器（4 选 1）

| 驱动 | 芯片 | 接口 | 量程 | 推荐场景 |
|---|---|---|---|---|
| `zf_device_imu660ra` | IMU660RA | SPI/IIC | ±2/4/8/16 g, ±125/250/500/1000/2000 dps | **默认推荐**（性能均衡） |
| `zf_device_imu660rb` | IMU660RB | SPI/IIC | 同上 | 660RA 替代型号 |
| `zf_device_imu660rc` | IMU660RC | SPI/IIC | 同上 | 660RA 替代型号 |
| `zf_device_imu963ra` | IMU963RA | SPI/IIC | **9 轴**（加表 + 陀螺 + 磁力计） | **需要绝对航向角**（电磁组 / 全场定位） |

> 高精度姿态解算见 `.auto-embedded/refs/mahony-ahrs-reference.md`；逐项核对见 `.auto-embedded/refs/imu-gyroscope-checklist.md`。

### 3.2 屏幕（5 选 1）

| 驱动 | 屏幕 | 接口 | 尺寸 / 分辨率 | 推荐场景 |
|---|---|---|---|---|
| `zf_device_oled` | OLED 12864 | IIC | 0.96" / 128×64 | 调试日志小屏 |
| `zf_device_tft180` | TFT180 | SPI | 1.8" / 160×128 | 中等价位彩屏 |
| `zf_device_ips114` | IPS114 | SPI | 1.14" / 240×135 | 小尺寸高分辨率 |
| `zf_device_ips200` | IPS200 | SPI | 2.0" / 320×240 | **默认推荐**（高性价比） |
| `zf_device_ips200pro` | IPS200 Pro | SPI（**8080 并口** 或 SPI） | 2.0" / 320×240 | 需要高刷新率（图像显示） |

### 3.3 线性 CCD（3 选 1）

| 驱动 | 芯片 | 接口 | 像素 | 推荐场景 |
|---|---|---|---|---|
| `zf_device_tsl1401` | TSL1401 | GPIO + ADC | 128 像素 | 入门赛车光电组 |
| `zf_device_dl1a` | DL1A | GPIO + ADC | 128 像素 | 逐飞 a 版 |
| `zf_device_dl1b` | DL1B | GPIO + ADC | 128 像素 | 逐飞 b 版（推荐） |

### 3.4 编码器

| 驱动 | 接口 | 说明 |
|---|---|---|
| `zf_device_absolute_encoder` | UART | 逐飞绝对值编码器（红色） |

> 增量编码器走 `zf_driver_timer.h` 的 TIM 编码器模式，不在 zf_device 层。

### 3.5 无线 / WiFi

| 驱动 | 接口 | 用途 |
|---|---|---|
| `zf_device_wireless_uart` | UART | 逐飞无线串口模块 |
| `zf_device_wifi_uart` | UART | WiFi 模块（AT 指令） |
| `zf_device_wifi_spi` | SPI | WiFi 模块（高速 SPI） |

### 3.6 其他

| 驱动 | 说明 |
|---|---|
| `zf_device_key` | 按键扫描（去抖 + 长按） |
| `zf_device_type` | 通用类型定义 |
| `zf_device_config.h` / `.lib` | 设备全局配置（含库文件，**禁止删除 .lib**） |

---

## 4. Example/Coreboard_Demo/ 例程对照表（11 个）

> **学习路径建议**：E10 → E01 → E02 → E03 → E04 → E05 → E06 → E07 → E08 → E11
> 先打通日志输出，再依次掌握 GPIO / UART / ADC / PWM / 定时器 / 中断 / Flash。

| 例程 | 解决问题 | 推荐复用方式 |
|---|---|---|
| `E01_gpio_demo` | 点灯 / 按键扫描 | 任何 GPIO 操作起点 |
| `E02_uart_demo` | UART 收发 + 中断回调 | 调试日志 + 串口通信 |
| `E03_adc_demo` | ADC 采样 + 均值滤波 | 电压采集 / CCD 读取 |
| `E04_pwm_demo` | PWM 输出（电机 / 舵机） | 任何运动控制起点 |
| `E05_pit_demo` | 周期中断（控制环路） | **闭环 PID 入口** |
| `E06_exti_demo` | 外部中断（按键 / 编码器） | 异步事件入口 |
| `E07_timer_demo` | 通用定时器 | 测时间 / 高级触发 |
| `E08_flash_demo` | Flash 读写 | 参数掉电保存 |
| `E10_printf_debug_log_demo` | `printf` 重定向到 UART | **第一个跑通的例程** |
| `E11_interrupt_priority_set_demo` | NVIC 优先级设置 | 多中断系统必读 |

> **没有 E09**（原库跳号，正常）。

`Example/Motherboard_Demo/` 含电机 / 舵机 / 编码器 / 屏幕 / IMU / CCD 等综合例程，按 `【必读】例程功能说明.xlsx` 查阅（用 `/xlsx` skill 解析）。

---

## 5. 典型工程结构与编译

### 5.1 默认 Keil 工程结构

```
$MSPM0_LIB_ROOT/SeekFree_MSPM0G3507_Opensource_Library/
├── libraries/
│   ├── sdk/                  # TI MSPM0 SDK (vendor HAL)
│   ├── zf_common/            # 类型 / 调试 / printf
│   ├── zf_driver/            # 外设驱动 (§2)
│   ├── zf_device/            # 设备驱动 (§3)
│   └── zf_components/        # 高层组件
└── project/
    ├── code/                 # 用户业务代码
    ├── user/                 # main.c 入口
    │   └── 尽量不要使用的引脚.txt
    └── keil/
        └── Project.uvprojx   # Keil 工程文件
```

### 5.2 必读：引脚禁用清单

打开工程前**必须**读 `project/尽量不要使用的引脚.txt`，里面列了：
- 板载已占用引脚（屏幕 / IMU / 编码器接口固定连接）
- 调试相关引脚（SWD：SWDIO / SWCLK）
- 晶振引脚

将清单内容**完整复制**到工程的 `硬件资源表.md`，作为引脚规划的硬约束。

### 5.3 开发环境

| 工具 | 版本要求 |
|---|---|
| Keil MDK | ≥ v5.37（支持 DAP V2 WinUSB 模式高速下载） |
| 仿真器 | **逐飞 DAP** 或 ARM 兼容 CMSIS-DAP |
| TI SysConfig | 用于修改 `ti_msp_dl_config.*`（已配好默认值，简单工程可不动） |
| 编译器 | Keil ARMCC v6.x（**Cortex-M0+ 用 v6 即可，无需 ARMCC5**） |

### 5.4 关键编译宏

| 宏 | 位置 | 作用 |
|---|---|---|
| `COMPATIBLE_WITH_OLDER_VERSIONS` | `zf_driver_gpio.h` 等 | 启用 `gpio_set/gpio_get/gpio_dir` 等旧版函数名兼容 |
| `MSPM0G3507_RAM_RUN` | linker script | RAM 调试模式（更快烧录） |

---

## 6. 与 RIPER-5 集成钩子

| 阶段 | 应用本文 |
|---|---|
| **RESEARCH** | §0 解析 `$MSPM0_LIB_ROOT` 写入 `硬件资源表.md`；读 `尽量不要使用的引脚.txt` 写入引脚清单 |
| **INNOVATE** | §3 设备选型表对比，§4 选最接近的例程作模板 |
| **PLAN** | 实施清单引用 §2 / §3 的具体 API + 例程编号；引脚冲突参照 `refs\pin-planning.md` |
| **EXECUTE** | 优先 **复制例程** 改造，禁止从空白工程写起；编译跑 §5.3 Keil + DAP |
| **REVIEW** | §1 的关键限制提示（M0+ 无 LDREX、80 MHz 上限）必跑检查；分层合规见 `refs\embedded-architecture.md` |

---

## 7. 已知陷阱（按 Seekfree 库使用经验）

1. **`uart_read_byte` 是阻塞 + 超时**，不要在控制环回调里直接调，会卡 26 ms。控制环用 `uart_query_byte` 或开 RX 中断 + 环形缓冲
2. **`gpio_high`/`gpio_low` 是宏**（直接写寄存器），可在 ISR 中用；`gpio_set_level` 是函数（带边界检查），ISR 内不推荐
3. **SPI 时钟频率上限受 SYSCLK 影响**：80 MHz SYSCLK 下 SPI 最高约 20 MHz，IPS200Pro 8080 接口的高速模式需用并口而非 SPI
4. **`zf_device_config.lib` 是预编译库文件，不要删**：链接时需要
5. **`timer_funciton_check` 是原库拼写错误**（function → funciton），保留原样调用
6. **Cortex-M0+ 中断嵌套层级少**（默认 4 级），优先级位宽仅 2 bit（4 档），不能像 STM32F4 那样配 16 档优先级
7. **Flash 写前必须 erase**，且每次 erase 是一整页（1 KB），不可单字节修改

---

## 8. 联动参考

| 场景 | 参考文档 |
|---|---|
| 完整移植流程 | `modes\mspm0-board.md` |
| 引脚规划 / 冲突检测 | `refs\pin-planning.md` |
| IMU 姿态解算 | `refs\imu-gyroscope-checklist.md` + `refs\mahony-ahrs-reference.md` |
| 闭环控制调试 | `refs\control-loop-sign-debug.md` |
| 分层架构合规 | `refs\embedded-architecture.md`（Seekfree 库属 L0/L1，业务代码 ≥ L3） |
| 故障排查 | `refs\troubleshooting.md`（症状速查）+ `refs\systematic-debugging.md`（根因分析） |
| 静态检查 | `refs\static-analysis-pipeline.md`（cppcheck / clang-tidy） |
| 通用 Seekfree 库管理 | `modes\seekfree-lib.md`（搜索 / 下载 / 索引） |
