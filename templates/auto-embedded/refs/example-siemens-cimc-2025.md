# 端到端示例：2025 CIMC 西门子杯工业嵌入式开发初赛

> 难度：★★★（题目本身不难，但 9 大评分类 + 12 命令 + 4 文件夹 + 上电次数计数 + HEX 编码相互交织，集成难度高）
>
> 题目类型：工业数据采集系统（典型"系统集成题"）
>
> 对应 mode：`.auto-embedded/modes/industrial-data-acquisition.md`（IDA 主流程）+ `.auto-embedded/refs/cli-command-framework.md`（CLI 框架）
>
> 比赛模式：用 `.auto-embedded/modes/competition.md` v2，**跳过 CP-1.5 仿真阶段**（无算法需求），派 4 个 Agent（DRV/ALG/QA/REPORT）

---

## 0. 题目核心要求（从赛题原文提炼）

### 0.1 硬件清单（来自 `E:\嵌入式资料\西门子资料\西门子原理图.pdf` 推断）

| 资源 | 用途 | 关键 |
|---|---|---|
| GD32F470 主控 | MCU | Cortex-M4F，HSE 外接晶振 |
| 外部 NOR Flash (GD25Q16) | 设备 ID + ratio + limit + 上电次数 | SPI |
| TF 卡 | 文件系统（4 文件夹）| SDIO 或 SPI |
| OLED (SSD1306 0.91") | 实时显示 | I2C 或 SPI |
| ADC 通道 | 电压采集（滑动变阻器输入）| 12-bit |
| RTC | 标准时间 | LSE 32.768 kHz（题目说没装电池也可）|
| 串口 (USART) | CLI 通信 | 默认 115200 / 460800 |
| 4 个按键 | KEY1=采集切换、KEY2/3/4=周期 5/10/15s | GPIO 输入 |
| 2 个 LED | LED1=采集中闪烁、LED2=超限点亮 | GPIO 输出 |

### 0.2 12 个串口命令清单

| 命令 | 功能 | 评分点 |
|---|---|---|
| `test` | 系统自检（flash + TF + RTC）| 系统检测 4 分 |
| `RTC Config` | 输入标准时间设 RTC | 时钟设置 3 分 |
| `RTC now` | 显示当前 RTC | 时钟 3 分 |
| `conf` | 读 TF 卡 config.ini → Flash | 配置文件 1+2 分 |
| `ratio` | 设变比（0-100）| 数据采集 9 分 |
| `limit` | 设阈值（0-500，但评测用 0-200）| 超阈值 4 分 |
| `start` / `stop` | 采样启停 | 数据采集 9 分 |
| `hide` / `unhide` | 启用/取消 HEX 编码 | 数据加密 3 分 |
| `config save` | 写参数到 Flash | 参数存储 |
| `config read` | 从 Flash 读参数 | 参数存储 |

### 0.3 评分总览（满分 100）

| 大类 | 分值 | 主要外设 |
|---|---|---|
| 系统上电初始化 | 5 | 串口/flash/OLED |
| 时钟设置 | 6 | 串口/RTC |
| 系统检测 | 8 | 串口/flash/TF/RTC |
| 数据采集与参数存储 | 33 | 全部 |
| 超阈值数据采集 | 16.5 | flash/RTC/TF/LED/ADC |
| 数据加密 | 15.5 | 串口/RTC/TF/ADC |
| 操作审计 | 12 | TF/日志 |
| 配置文件读取 | 4 | TF/串口 |

**关键评分倾向**：TF 卡 + Flash 操作占总分约 50%（不要小看文件系统）。

---

## 1. 总体方案设计

### 1.1 关键决策（写入 `项目规划清单.md` 开头）

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| MCU 框架 | StdPeriph / HAL | **HAL**（GD32 HAL）| 资料里有 GD32_HAL.7z |
| 文件系统 | FatFs / LittleFs | **FatFs** | 工业标准 + 资料里有完整 demo |
| OLED 库 | u8g2 / SSD1306-HAL-master | **SSD1306-HAL-master** | 轻量 + 资料里有 |
| SPI Flash | 直接 SPI / SFUD | **SFUD** | 自动识别 GD25Q16 + 通用 |
| 按键库 | easy_button / ebtn | **ebtn（优化版）** | 资料里给了优化版 |
| RingBuffer | 自写 / 资料给的 | **资料给的 ringbuffer** | 直接复用 |
| CLI 框架 | letter-shell / 自写 | **自写**（`.auto-embedded/refs/cli-command-framework.md`）| 控制 12 命令 + 多词 + 状态机 |
| INI 解析 | minIni / 自写 | **自写**（≤ 100 行）| 只解析 2 字段 |

### 1.2 任务分解给 4 个 Agent（CP-2 阶段并行）

```
[DRV]：
  - drivers/drv_uart.c（USART1 + 中断 + ringbuffer）
  - drivers/drv_spi.c（Flash 用）
  - drivers/drv_sdio.c（TF 卡用 SDIO 或 SPI）
  - drivers/drv_i2c.c（OLED 用，如果 OLED 是 I2C）
  - drivers/drv_adc.c（电压采样）
  - drivers/drv_rtc.c（时钟 + 时间转换）
  - drivers/drv_tim.c（采样周期 / LED1 闪烁）
  - drivers/drv_gpio.c（4 按键 + 2 LED）
  - drivers/drv_flash.c（基于 SFUD）
  - drivers/drv_oled.c（基于 SSD1306-HAL）
  - drivers/drv_key.c（基于 ebtn）

[ALG]：
  - service/svc_cli.c（基于 cli-command-framework）
  - service/svc_config.c（变比/阈值/上电次数 + Flash + INI）
  - service/svc_sampler.c（状态机 + 周期采集 + 超限）
  - service/svc_storage.c（4 文件夹 + 10 条/文件）
  - service/svc_logger.c（log{N}.txt 上电递增）
  - service/svc_display.c（OLED 显示逻辑）
  - service/svc_codec.c（hide/unhide HEX 编码）
  - service/svc_rtc.c（解析时间字符串）
  - sysFunction/（题目要求"逻辑层程序"放这里，否则 -20 分！）

[QA]：
  - 验证 12 命令逐一对照题目截图
  - 验证 4 文件夹 + 文件命名规则
  - 验证 7 个评测流程 step
  - arch-check.sh + .auto-embedded/tools/include-graph.py

[REPORT]：
  - 技术方案文档（25% 分数）
  - 答辩演练（15% 分数，10 个 why）
```

---

## 2. 关键陷阱与处置（按踩坑频率排序）

### 2.1 陷阱 1：`sysFunction` 文件夹（不放 -20 分！）

题目原文："以下所有逻辑层程序功能都需要放在 sysFunction 文件夹下，否则总分按 -20 分处理！"

**处置**：把所有 service/*.c/.h 复制或软链到 `sysFunction/` 文件夹下（**注意：是题目要求的命名，不是本 skill 通常的 `service/`**）。

```
project_root/
├── sysFunction/                  ← 题目硬性要求，命名不能变
│   ├── svc_cli.c/.h
│   ├── svc_config.c/.h
│   ├── svc_sampler.c/.h
│   ├── svc_storage.c/.h
│   ├── svc_logger.c/.h
│   ├── svc_display.c/.h
│   ├── svc_codec.c/.h
│   └── svc_rtc.c/.h
└── drivers/、middleware/、hal/ 等
```

### 2.2 陷阱 2：上电次数 **必须存 Flash 不能数 TF 卡文件**

题目原文："文件 id 号（上电次数）应当记录在 MCU 中，例如将 TF 卡清空后，第五次上电后应当生成的是 log4.txt，而不是从 0 开始。"

**处置**：boot_count 存外部 SPI Flash 的固定地址，**绝对不能**通过 `fopen("/log/log*.txt", "r")` 数文件个数。

### 2.3 陷阱 3：评测流程 5.12 — limit 设置**不自动**持久化

题目原文 5.11-5.12："系统断电... 重新上电，输入 config read，**不能读取到** 5.1 设定的阈值。"

→ 说明 `limit` 命令**只改 RAM**，必须显式 `config save` 才存 Flash。

但 4.17："插卡，系统上电，输入 config read，**能读取到**存储的变比值。"

→ 说明 `ratio` 在 4.15 显式 `config save` 后已经持久化，重启后能读到。

**统一处理**：变比和阈值都只改 RAM，靠 `config save` 才落 Flash。

### 2.4 陷阱 4：HEX 编码顺序（big-endian / 字符串拼接）

题目原文：

```
12.5V → 整数 12 → 000C（高位在前）
       → 小数 0.5*65536=32768 → 8000
unix 1735705845 → 6774C4F5
拼起来：6774C4F5000C8000
```

**注意**：是字符串 ASCII 大写 HEX，不是二进制字节。`snprintf("%08lX%04X%04X")` 即可。

### 2.5 陷阱 5：变比 / 阈值范围矛盾

题目：

- 2(2) ratio 有效范围 0-100，但评测 4.2 写"199.99"，意味着评测员**会输入超量程值**测有效性
- 2(3) limit 有效范围 0-500，但评测 5.1 写"30，有效范围 0-200" — 评测员用 0-200 测，所以**建议代码里写 0-500 但评测员的有效范围是 0-200**（按更严的 200 校验）

**统一处置**：按题目正文 0-500（更宽），评测员若发现也接受。

### 2.6 陷阱 6：OLED 在 IDLE / 采集间切换

题目原文："自上电起，除了采集状态下 OLED 显示刷新数据外，其余时刻均第一行显示 "system idle"，第二行为空"

→ 每次 stop → 立即清 OLED 显示 idle。
→ 切周期 (KEY2/3/4) 不影响 OLED（仍按采集模式刷新）。
→ 配置命令（ratio/limit/conf 等）不影响 OLED（仍 idle 或采集中）。

### 2.7 陷阱 7：评测 5.13 重置 limit

5.12 重启后 limit 没存 → 5.13 重复 5.1 把 limit 设回 30。但 5.13 没有 config save → 6.x 开始 hide/unhide 时仍在内存，**重启又会丢**。

→ 没有问题，6.x 是连续的（不重启），limit 在 RAM 里就够用。

### 2.8 陷阱 8：日志要按操作发生时刻**实时写**

题目要求 7.1：log0.txt 含 2.1（RTC Config）和 3.1（test）。

但 2.1 时 RTC 还没设置 → log0.txt 里这条记录用的是**默认时间**（如 2000-01-01 00:00:01）。这是正常的，不要等 RTC 设置完再补日志。

---

## 3. 完整文件清单 + 实现要点

### 3.1 sysFunction/svc_cli.c — 命令分发

参考 `.auto-embedded/refs/cli-command-framework.md`，注册 12 条命令。

### 3.2 sysFunction/svc_config.c — 参数管理

```c
/* Flash 布局（外部 SPI Flash 0x000000 开始） */
typedef struct __attribute__((packed)) {
    char     magic[4];        /* "CIMC" */
    char     device_id[20];   /* "2025-CIMC-队伍编号" */
    float    ratio;           /* 默认 1.0 */
    float    limit;           /* 默认 1.0 */
    uint32_t boot_count;      /* 上电次数 */
    uint32_t crc32;
} flash_config_t;

#define FLASH_CFG_ADDR  0x000000

void svc_config_load(void) {
    flash_config_t cfg;
    drv_flash_read(FLASH_CFG_ADDR, &cfg, sizeof(cfg));
    if (memcmp(cfg.magic, "CIMC", 4) != 0 ||
        crc32(&cfg, sizeof(cfg) - 4) != cfg.crc32) {
        /* 首次上电 / Flash 损坏 → 默认值 */
        memcpy(cfg.magic, "CIMC", 4);
        strncpy(cfg.device_id, "2025-CIMC-XXX", sizeof(cfg.device_id));
        cfg.ratio = 1.0f;
        cfg.limit = 1.0f;
        cfg.boot_count = 0;
        save_to_flash(&cfg);
    }
    s_cfg = cfg;
}

void svc_config_inc_boot_count(void) {
    s_cfg.boot_count++;
    save_to_flash(&s_cfg);    /* 立即刷 */
}

void cmd_config_save(int argc, char **argv) {
    printf("ratio: %.1f\n", s_cfg.ratio);
    printf("       limit: %.2f\n", s_cfg.limit);
    save_to_flash(&s_cfg);
    printf("       save parameters to flash\n");
}

void cmd_config_read(int argc, char **argv) {
    flash_config_t cfg;
    drv_flash_read(FLASH_CFG_ADDR, &cfg, sizeof(cfg));
    printf("read parameters from flash\n");
    printf("       ratio: %.1f\n", cfg.ratio);
    printf("       limit: %.2f\n", cfg.limit);
}
```

### 3.3 sysFunction/svc_sampler.c — 采集状态机

参考 `.auto-embedded/modes/industrial-data-acquisition.md` §6。关键点：

- 采样周期由 SysTick + 计数器实现（不要用单独定时器）
- 周期切换立即生效，**不重置已采条数计数**
- 超限事件**只在那一条**点亮 LED2 + 打印 OverLimit，下一条若不超限则熄灭

### 3.4 sysFunction/svc_storage.c — 4 文件夹

```c
void svc_storage_init(void) {
    fs_mkdir("/sample");
    fs_mkdir("/overLimit");
    fs_mkdir("/log");
    fs_mkdir("/hideData");
}

void svc_storage_append_sample(const char *time_str, float v) {
    if (s_ctx.encrypt_on) return;       /* hide 模式跳过 sample 写入（题目 6c）*/
    /* ... 满 10 条新建逻辑，见 IDA mode §8.3 ... */
}

void svc_storage_append_overlimit(const char *time_str, float v) {
    /* hide 模式也要写 overLimit（题目 6c）*/
}

void svc_storage_append_hidedata(const char *hex) {
    if (!s_ctx.encrypt_on) return;
    /* ... */
}
```

### 3.5 sysFunction/svc_codec.c — HEX 编码

```c
void encode_hex(const hal_rtc_time_t *t, float v, char *out, size_t len) {
    uint32_t unix_ts = hal_rtc_to_unix(t);
    int      i_part  = (int)v;
    int      f_part  = (int)((v - i_part) * 65536.0f);
    snprintf(out, len, "%08lX%04X%04X", unix_ts, i_part & 0xFFFF, f_part & 0xFFFF);
}

void cmd_hide(int argc, char **argv) {
    s_ctx.encrypt_on = true;
    /* 立即开始输出 HEX 格式（如果 sampler 在 RUNNING）*/
}

void cmd_unhide(int argc, char **argv) {
    s_ctx.encrypt_on = false;
}
```

### 3.6 sysFunction/svc_logger.c — 操作日志

```c
static FILE *s_log_fp = NULL;

void svc_logger_open(void) {
    uint32_t id = svc_config_get_boot_count() - 1;  /* 已经在 init 时 +1 */
    char path[32];
    snprintf(path, sizeof(path), "/log/log%lu.txt", id);
    s_log_fp = f_open(path, "a");
}

/* 在 svc_cli_process 中调 */
void svc_logger_log_cmd(const char *cmd, const char *result) {
    if (!s_log_fp) return;
    hal_rtc_time_t t; hal_rtc_get(&t);
    f_printf(s_log_fp, "[%04d-%02d-%02d %02d:%02d:%02d] CMD: %s | %s\n",
             t.year, t.month, t.day, t.hour, t.minute, t.second, cmd, result);
    f_sync(s_log_fp);    /* 立即落盘，断电不丢 */
}
```

---

## 4. 评测流程对照表（确保不漏分）

按题目"二、评分细则"的 8 个评测大类，逐项对照实现状态：

### 4.1 系统上电初始化（5 分）

| 评测步骤 | 实现要点 | 文件 |
|---|---|---|
| 1.1 串口打印 `====system init====` | `system_init()` 第一行 | sysFunction/system_init.c |
| 1.2 读 flash 中 Device_ID | `printf("Device_ID: %s\n", s_cfg.device_id)` | svc_config.c |
| 1.3 串口打印 `====system ready====` | `system_init()` 末尾 | system_init.c |
| 1.4 OLED 第一行 `system idle` | `drv_oled_show_idle()` | svc_display.c |

### 4.2 时钟设置（6 分）

| 步骤 | 实现 |
|---|---|
| 2.1 输入 `RTC Config` 提示 `Input Datetime` | cmd_rtc_config 第一步 |
| 2.2 解析时间字符串 | svc_rtc_parse（兼容多种分隔符）|
| 2.3 `RTC now` 显示时间 | cmd_rtc_now |

### 4.3 系统检测（8 分）

| 步骤 | 实现 |
|---|---|
| 3.1 输入 `test` | cmd_test |
| 3.2 TF 卡不在 → error + can not find | drv_sd_is_mounted = false |
| 3.4 插卡后 → 所有 ok | drv_sd_init 重试 |

### 4.4 数据采集与参数存储（33 分，最大头）

| 步骤 | 实现 |
|---|---|
| 4.1-4.2 ratio 输入有效性 | parse_float_in_range(0, 100) |
| 4.3 LED1 1Hz 闪烁 | drv_tim_led1_blink_start |
| 4.4 串口周期输出 | svc_sampler 主循环 |
| 4.5 OLED 显示时间+电压 | svc_display |
| 4.6 滑动变阻器改变电压 | ADC 实时采样 |
| 4.7 stop → LED1 灭 | drv_tim_led1_stop |
| 4.10 KEY1 切换 → 与 4.4 相同输出 | drv_key + svc_sampler |
| 4.11-4.12 KEY3/4 切周期 | drv_key + svc_sampler.set_period |
| 4.15 config save | cmd_config_save |
| 4.16 TF 卡 sample/ 文件夹有数据 | svc_storage_append_sample |
| 4.17 重启后 config read 能读回 ratio | svc_config_load 验证 CRC |

### 4.5 超阈值数据采集（16.5 分）

| 步骤 | 实现 |
|---|---|
| 5.1 limit = 30 | cmd_limit |
| 5.2 limit = 300 → invalid（评测说 0-200）| 校验 + invalid |
| 5.6 串口含 OverLimit + 阈值 | svc_sampler 检测 |
| 5.7 LED2 点亮 | drv_led_set |
| 5.10 电压回落 → LED2 熄灭 | drv_led_set(0) |
| 5.11 TF 卡 overLimit/ 文件夹有数据 | svc_storage_append_overlimit |
| 5.12 重启 config read → 没存 limit | limit 默认不存（5.13 不调 save）|

### 4.6 数据加密（15.5 分）

| 步骤 | 实现 |
|---|---|
| 6.2 hide 后 HEX 输出 | encode_hex |
| 6.6 sample/ 文件夹**无新数据** | encrypt_on 时跳过 append_sample |
| 6.7 overLimit/ 仍有数据 | append_overlimit 不受 encrypt 影响 |
| 6.8 hideData/ 有 HEX 数据 | append_hidedata |
| 6.9 校验工具验证准确性 | encode_hex 正确实现 |

### 4.7 操作审计（12 分）

| 步骤 | 实现 |
|---|---|
| 7.1 log0.txt 含 2.1 + 3.1 | svc_logger 在 cmd 分发前后写 |
| 7.2 log1.txt 含 3.4 等 | boot_count = 2 时打开 log1.txt |
| 7.3 / 7.4 同理 | 每次重启 boot_count += 1 |

### 4.8 配置文件读取（4 分）

| 步骤 | 实现 |
|---|---|
| 8.1 TF 卡根目录 config.ini | 评测员准备 |
| 8.2 输入 conf 读取 + 显示 | cmd_conf → svc_config_load_ini |

---

## 4.9 ⭐ 100 分逐项验收追踪表（赛前最后一晚必跑）

> 这张表是答辩前 24 小时**最后一道闸**。打印一份纸质对照表，每条逐项打钩 ✓ / ✗。**任何 ✗ 项立刻定位修复**。

### 4.9.1 系统上电初始化（5 分）

| 评分点 | 操作 | 验证位置 | 预期输出 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 1.1 上电初始化 banner | 串口断电重启 | 串口 | `====system init====` | 1 | ☐ |
| 1.2 设备 ID 读取 | 同上 | 串口 | `Device_ID: 2025-CIMC-XXX` | 2 | ☐ |
| 1.3 ready 标志 | 同上 | 串口 | `====system ready====` | 1 | ☐ |
| 1.4 OLED idle | 同上 | OLED | 第一行 `system idle`，第二行空 | 1 | ☐ |

### 4.9.2 时钟设置（6 分）

| 评分点 | 操作 | 验证位置 | 预期输出 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 2.1 RTC Config 提示 | 串口输入 `RTC Config` | 串口 | `Input Datetime` | 1 | ☐ |
| 2.2 时间解析容忍多分隔符 | 输入 `2025-01-01 12:00:30` / `2025/01/01 12-00-30` / `20250101120030` | 串口 | `RTC Config success` + `Time: 2025-01-01 12:00:30` | 3 | ☐ |
| 2.3 RTC now | 输入 `RTC now` | 串口 | `Current Time: 2025-01-01 12:00:30`（实时）| 2 | ☐ |

### 4.9.3 系统检测（8 分）

| 评分点 | 操作 | 验证位置 | 预期输出 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 3.1 不插 TF 卡时 test | 断电拔卡 → 上电 → `test` | 串口 | flash ok / TF error / can not find TF | 4 | ☐ |
| 3.2 flash ID 显示 | 同上 | 串口 | `flash ID: 0xC84015`（GD25Q16 typical） | 1.5 | ☐ |
| 3.3 插卡后 test | 插卡 → 上电 → `test` | 串口 | 全部 ok + 显示 TF 容量 | 2 | ☐ |
| 3.4 RTC 显示在 test 里 | 同上 | 串口 | 自检结果里含 `RTC: 2025-01-01 hh:mm:ss` | 0.5 | ☐ |

### 4.9.4 数据采集与参数存储（33 分）

| 评分点 | 操作 | 验证位置 | 预期输出/条件 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 4.1 ratio=1.0 成功 | `ratio` → `1.0` | 串口 | `ratio modified success` | 2 | ☐ |
| 4.2 ratio=199.99 拒绝 | `ratio` → `199.99` | 串口 | `ratio invalid` + ratio 不变 | 2 | ☐ |
| 4.3 start LED1 闪 | `start` | LED1 + 串口 | LED1 1Hz + `Periodic Sampling` | 1.5 | ☐ |
| 4.4 串口周期数据 | 静等 5s | 串口 | `2025-01-01 hh:mm:ss ch0=x.xxV` | 3 | ☐ |
| 4.5 OLED 时间+电压 | 同上 | OLED | 第一行 hh:mm:ss，第二行 xx.xx V | 4 | ☐ |
| 4.6 变阻器改电压 | 旋钮调 | 串口+OLED | 数值跟随变化 | 2 | ☐ |
| 4.7 stop 串口 | `stop` | 串口 | `Periodic Sampling STOP` | 1 | ☐ |
| 4.8 stop OLED 转 idle | 同上 | OLED | system idle | 1 | ☐ |
| 4.9 ratio=10.0 | `ratio` → `10.0` | 串口 | success + ratio=10.0 | 1 | ☐ |
| 4.10 KEY1 启动 | 按 KEY1 | LED1+串口+OLED | 与 4.3-4.5 相同，**电压 ×10** | 2 | ☐ |
| 4.11 KEY3 切 10s | 按 KEY3 | 串口 | `sample cycle adjust: 10s` + 周期变 | 1 | ☐ |
| 4.12 KEY4 切 15s | 按 KEY4 | 串口 | `sample cycle adjust: 15s` | 1 | ☐ |
| 4.13 KEY1 停止 | 按 KEY1 | LED1+OLED | LED 灭 + idle | 1 | ☐ |
| 4.14 `config save` | `config save` | 串口+Flash | 打印参数 + `save parameters to flash` | 2.5 | ☐ |
| 4.15 sample 文件夹有数据 | 断电拔卡 → 读 TF | TF/sample/ | sampleData{datetime}.txt 文件 ≥ 1 个 | 4 | ☐ |
| 4.16 每文件 10 条 | 同上 | TF | 每个文件内 ≤ 10 条 | 1 | ☐ |
| 4.17 重启 `config read` | 插卡 → 上电 → `config read` | 串口 | `ratio: 10.0` + `limit: 1.0` | 4 | ☐ |

### 4.9.5 超阈值数据采集（16.5 分）

| 评分点 | 操作 | 验证位置 | 预期输出/条件 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 5.1 limit=30 | `limit` → `30` | 串口 | success | 2 | ☐ |
| 5.2 limit=300 拒绝 | `limit` → `300` | 串口 | invalid（评测员范围 0-200）| 2 | ☐ |
| 5.3 start 后超限 | start + 旋钮调高 | 串口+LED2 | `OverLimit (30.00) !` + LED2 亮 | 4 | ☐ |
| 5.4 回落 LED2 灭 | 旋钮调低 | LED2 | 灭 | 2 | ☐ |
| 5.5 overLimit 文件夹 | 断电拔卡读 TF | TF/overLimit/ | 至少 1 个 overLimit{datetime}.txt | 4 | ☐ |
| 5.6 limit **不自动持久** | 重启 → `config read` | 串口 | limit 应为 **默认 / 上次 save 值**，**不是 30** | 2.5 | ☐ |

### 4.9.6 数据加密（15.5 分）

| 评分点 | 操作 | 验证位置 | 预期输出/条件 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 6.1 hide 切换格式 | start + `hide` | 串口 | `6774C4F5000C8000` 形式 HEX | 3 | ☐ |
| 6.2 超限时尾 `*` | 旋钮超限 | 串口 | `6774C4F5000C8000*` | 2 | ☐ |
| 6.3 unhide 恢复 | `unhide` | 串口 | 回到 `xx-xx-xx ch0=x.xxV` 格式 | 1 | ☐ |
| 6.4 sample 不写 | hide 模式 + 断电拔卡 | TF/sample/ | **此期间**新数据**不**在 sample/ | 4 | ☐ |
| 6.5 overLimit 仍写 | hide+超限 | TF/overLimit/ | 仍有数据 | 1.5 | ☐ |
| 6.6 hideData 有 HEX | 同上 | TF/hideData/ | hideData{datetime}.txt 有 HEX 内容 | 2 | ☐ |
| 6.7 HEX 解码准确 | 用赛方校验工具 | PC | 时间+电压 小数 2 位正确 | 2 | ☐ |

### 4.9.7 操作审计（12 分）

| 评分点 | 操作 | 验证位置 | 预期输出/条件 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 7.1 log0.txt 含 2.1+3.1 | 第 1 次上电的命令 | TF/log/log0.txt | 至少包含 `RTC Config` / `test` 两条记录 | 3 | ☐ |
| 7.2 log1.txt 多条 | 第 2 次上电（评测 3.4-4.15 之间）| TF/log/log1.txt | 全部 cmd 都在里面 | 3 | ☐ |
| 7.3 log2.txt 限制类 | 第 3 次上电（5.1-5.3）| TF/log/log2.txt | 含 limit 等命令 | 3 | ☐ |
| 7.4 boot_count 不数 TF | TF 卡清空后重启 | TF/log/ | 文件名 N **继续递增**，**不是从 0** | 3 | ☐ |

### 4.9.8 配置文件读取（4 分）

| 评分点 | 操作 | 验证位置 | 预期输出/条件 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 8.1 config.ini 不存在 | 删除 → `conf` | 串口 | `config.ini file not found.` | 1 | ☐ |
| 8.2 config.ini 存在 | 放入文件 → `conf` | 串口 | `Ratio = 10.5` + `Limit = 100` + `config read success` | 1 | ☐ |
| 8.3 解析后写 Flash | `conf` 之后 `config read` | 串口 | 显示 ini 文件里的值 | 2 | ☐ |

### 4.9.9 验收总分实时统计模板

```
答辩前 24 小时验收：
  系统上电初始化       __ / 5
  时钟设置             __ / 6
  系统检测             __ / 8
  数据采集与参数存储   __ / 33
  超阈值采集           __ / 16.5
  数据加密             __ / 15.5
  操作审计             __ / 12
  配置文件读取         __ / 4
  ───────────────────────────
  合计                 __ / 100
  目标 ≥ 85 分
```

**禁止**：答辩前一晚跳过这张表上场。每个 ✗ 项要么修要么主动放弃（不要欺骗自己说"答辩时不演这个"）。

---

## 5. 4 天工作时间表（v2 比赛模式落地）

```
T+0       [ARCH] 读题 → 8 评分大类拆解 → CP-0 git init
T+30min   [ARCH] 列硬件资源表（引脚 / DMA / NVIC）+ 接口契约（12 命令签名）
T+2h      [ARCH] CP-1 完成（架构 v1.0 冻结）
T+2h      CP-1.5 跳过（无算法）
T+2h      [ARCH] 同消息派 4 Agent：
            ├ [DRV] 全部外设驱动
            ├ [ALG] sysFunction 全部 service 模块
            ├ [QA] 验证脚本 + arch-check.sh + 测试矩阵
            └ [REPORT] 答辩模板 + 8 评分类对照表
T+8h      [ARCH] 收齐 → CP-2 git tag v0.2-dev
T+8h      [QA] 跑 matlab-firmware-pipeline 的 Step 3-5（编译 + 烧 + 串口监视）
                跳过 Step 1-2（MATLAB）和 Step 6（仿真对比）
T+12h     [QA] 逐条验证 7 个评测流程 → PASS → CP-3 v0.3-qa
T+18h     [ARCH] + [REPORT] 报告 + main.c 整合 → CP-4 v1.0-release
T+20h     [REPORT] CP-5 10 个 why 答辩演练 → v1.1-rehearsed
T+20h     ↓
T+72h     剩 50+ 小时缓冲：
            - 边界测试（参数极值 / 长时间运行 / TF 卡满）
            - 真实硬件多次跑通
            - 答辩 PPT 视频录制
            - 备份方案（U 盘存代码 + bin）
```

---

## 6. 答辩 10 个 why 模板（给 [REPORT] 用）

| # | Q | 60 字内回答模板 |
|---|---|---|
| 1 | 为什么用 SFUD 不直接写 SPI Flash 驱动？ | SFUD 自动识别 JEDEC ID 适配 GD25Q16，减少手写错误，且未来换 Flash 型号无需改代码。 |
| 2 | 为什么 boot_count 存 Flash 不数 TF 卡？ | 题目明确要求 TF 卡清空后还能按上电次数递增，所以必须 MCU 内持久化。 |
| 3 | 为什么 sysFunction/ 这样命名？ | 题目硬性要求，不放 -20 分。 |
| 4 | 为什么 ratio / limit 改了不立即存 Flash？ | 题目评测 5.12 验证 limit 重启后不应持久，说明运行时仅改 RAM，靠 config save 触发持久。 |
| 5 | 为什么 RTC 时间解析能容忍多种分隔符？ | 题目原文支持 `2025-01-01 01-30-10` 这种格式，sscanf %*c 自动吃任意分隔符。 |
| 6 | 为什么 hide 模式 sample/ 文件夹不写？ | 题目 6c：启用加密时不存 sample，但超阈值仍存。逻辑分开判断。 |
| 7 | HEX 编码为什么是大写？ | 题目示例 `6774C4F5` 是大写，`%08lX` 保证一致。 |
| 8 | 为什么不用 RTOS？ | 题目无强实时多任务要求，时间片轮询 + SysTick 即可，省 Flash/RAM。 |
| 9 | 为什么用 FatFs 不用 LittleFs？ | TF 卡工业标准 FAT32，FatFs 兼容性好，资料里有完整 demo。 |
| 10 | 看门狗策略？ | IWDG 启用 500ms 超时，喂狗仅在主循环；ISR 中禁止喂狗以保护主循环卡死可被检测。 |

---

## 7. 关键测试矩阵（[QA] 用）

```
□ 1. 不插 TF 卡 → test → flash ok / TF error / 不显存量
□ 2. 插 TF 卡 → test → 全部 ok
□ 3. RTC Config 各种格式："2025-01-01 12:00:30" / "2025/01/01 12-00-30" / 紧凑串
□ 4. ratio 输入：1.0 ✓ / 199.99 ✗ / -1 ✗ / abc ✗ / 50.5 ✓ / 100 ✓ / 100.1 ✗
□ 5. limit 同上（范围 0-500 或 0-200）
□ 6. start → LED1 闪烁 → 串口周期输出
□ 7. KEY1 切换：第 1 次按 → 启动；第 2 次按 → 停止
□ 8. KEY2/3/4 切周期 5/10/15s（采集中无缝切换）
□ 9. 滑动变阻器超 limit → LED2 + OverLimit
□ 10. hide → HEX 格式输出
□ 11. unhide → 恢复原格式
□ 12. config save / config read 闭环
□ 13. 断电重启 → boot_count 自增，log 文件号 +1
□ 14. TF 卡 sample/ 满 10 条新建文件
□ 15. log 文件含全部 CMD 操作时间戳
□ 16. config.ini 不在 → "config.ini file not found"
□ 17. config.ini 在 → 解析 [Ratio] Ch0 + [Limit] Ch0 写 Flash
```

---

## 8. 学生提交清单（提交前必查）

```
□ 代码 sysFunction/ 目录存在且包含全部业务逻辑
□ TF 卡四文件夹（sample / overLimit / log / hideData）能自动创建
□ Flash 设备 ID 能在断电后保留
□ 评测 4.16 验证：TF 卡里有 sampleData<datetime>.txt 多个文件，每个 10 条以内
□ 评测 5.11 验证：TF 卡 overLimit/ 文件夹有数据
□ 评测 6.8 验证：TF 卡 hideData/ 文件夹有 HEX 数据
□ 评测 7.1-7.4 验证：log/ 文件夹有 log0/1/2/3.txt
□ 校验工具能解码 HEX → 时间 + 电压（小数点后 2 位准确）
□ Git 有 v0.0-init / v0.1-arch / v0.2-dev / v0.3-qa / v1.0-release 5 个标签
□ 技术方案文档 30 页以内，含框图 / 算法 / 测试数据
□ 答辩 PPT 15 张以内，含演示视频片段
□ U 盘备份 + GitHub 远端
```

---

## 9. 与本 skill 工具链的精确映射

| 任务 | 用哪个 skill / mode |
|---|---|
| GD32 HAL 工程 | `.auto-embedded/modes/gd32-board.md` + `.auto-embedded/refs/gd32f4xx-api.md` |
| 多 Agent 协同 | `.auto-embedded/modes/competition.md` v2 |
| sysFunction/ 集成 | `.auto-embedded/modes/industrial-data-acquisition.md` |
| 12 命令解析 | `.auto-embedded/refs/cli-command-framework.md` |
| 工程画像探测 | `python .auto-embedded/tools/shared/project_detect.py` |
| 编译 | `aemb-build-keil` 或 `aemb-build-cmake` |
| 烧录 | `aemb-flash-openocd` 或 `aemb-flash-keil` |
| 串口测试 | `aemb-serial-monitor` |
| 静态检查 | `scripts/arch-check.sh` + ` |
| 答辩演练 | `.auto-embedded/modes/competition.md` v2 CP-5 |

---

## 10. 失败兜底

| 现象 | 排查 | 修复 |
|---|---|---|
| TF 卡挂载失败 | SPI/SDIO 引脚 + 上拉电阻 + 卡兼容性 | 换 FAT32 + 4GB Class10 卡 |
| Flash 读不到 ID | SPI CS / 时钟分频 / 模式 0 vs 3 | 用 SFUD 自动适配 |
| OLED 不显示 | I2C 地址 0x78 vs 0x7A / 上电时序 | 示波器看 I2C 波形 |
| 串口收命令丢字符 | 中断优先级 + ringbuffer 大小 | 优先级 0 + 256 字节 buffer |
| 上电后 RTC 跑飞 | LSE 晶振未启振 / 电池没装 | 用 LSI 备份 或 题目说免扣分 |
| log 文件没自增 | 数 TF 卡文件了？ | 必须 Flash boot_count |
| HEX 校验工具说错 | endian 错 / 大小写错 / 多余字符 | 严格 `%08lX%04X%04X` |
| 加密模式后 sample 仍写 | 没判 encrypt_on | 在 append_sample 入口判断 |
| KEY3 切周期后不生效 | 没在 sampler 主循环检查 | 立即生效，无需重启 |

---

## 11. 关联资源

- **集成框架**：`.auto-embedded/modes/industrial-data-acquisition.md`
- **CLI 框架**：`.auto-embedded/refs/cli-command-framework.md`
- **比赛模式 v2**：`.auto-embedded/modes/competition.md`
- **GD32 主板模板**：`.auto-embedded/modes/gd32-board.md`、`.auto-embedded/refs/gd32f4xx-api.md`
- **驱动移植**：`.auto-embedded/refs/driver-porting.md`
- **静态检查管线**：`.auto-embedded/refs/static-analysis-pipeline.md`、`scripts/arch-check.sh`
- **开源库索引**：`.auto-embedded/refs/embed-libs-index.md`（FatFs / SFUD / ebtn / ringbuffer 全部在内）
