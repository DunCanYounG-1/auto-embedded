# 工业数据采集系统模板（IDA — Industrial Data Acquisition）

> 辅助型 mode — 不替代 RIPER-5。专为"采集 + 处理 + 显示 + 存储"型工业嵌入式题设计的集成框架。
>
> 与 `.auto-embedded/modes/matlab-embedded-toolkit.md`（算法门类）和 `.auto-embedded/modes/matlab-toolkit-competition.md`（赛题门类，E1-E7）的关系：本 mode 是**系统集成视角**，覆盖"无算法/弱算法 + 多外设协同 + 数据落盘"类竞赛题。
>
> **入口前置**：由 `.auto-embedded/refs/competition-task-router.md` 在 [ARCH] 第 0 步判定为**题型 E（系统集成）**时调用本 mode。题目特化细节（如 CIMC 的 sysFunction/ 命名 + 100 分追踪表 + hide 真值表）见 `.auto-embedded/refs/example-siemens-cimc-2025.md`，本 mode 只保留**所有工业集成题通用**的结构。
>
> **何时不用本 mode**：纯算法题（DDS / LQR / FFT 等）→ 走 MATLAB 工具箱；视觉题 → 走独立 `auto-vision` skill；电磁循迹 → 走 `.auto-embedded/modes/matlab-toolkit-competition.md` E7。

---

## 0. 触发条件

`工业数据采集` / `工业嵌入式` / `数据采集系统` / `CIMC` / `西门子杯` / `数据记录仪` / `data logger` / `DAQ` / `多外设集成` / `工业题` / `系统集成题`

### 0.1 适用判断（决策树）

```
你的题目主要做……
│
├── 算 K 矩阵 / 滤波系数 / FFT  → 走 matlab-embedded-toolkit.md（不要走本 mode）
│
├── 摄像头循迹                 → 走独立 `auto-vision` skill
├── 电磁循迹                   → 走 matlab-toolkit-competition E7
│
├── 输出特定波形（DDS）         → 走 matlab-toolkit-competition E1
│
└── 我的题主要是：
       串口命令 → 操作外设 → 显示 → 落盘 → 答辩
       几乎没有"算法"，但有 6-10 个不同外设要协同
       → **走本 mode**
```

典型题目模式：

- 一组 CLI 命令（test/RTC/start/stop/ratio/limit/hide/...）
- ADC 采样（可能有变比 / 阈值 / 报警）
- 多文件夹 SD 卡存储 + 命名约定
- 操作日志（每次上电自增）
- 外部 Flash 参数持久化
- OLED / LCD 实时显示
- 按键 + LED 指示

---

## 1. 系统架构（8 子系统）

```
┌──────────────────────────────────────────────────────────────────┐
│                        L6 Application                            │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ app_main：状态机调度（IDLE / SAMPLING / CONFIG / ERROR）     │ │
│  └─────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│                        L5 Service（业务无关）                       │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐    │
│  │ svc_cli      │ svc_logger   │ svc_storage  │ svc_config   │    │
│  │（命令解析）   │（操作日志）   │（TF 卡多文件夹）│（Flash 参数）  │    │
│  └──────────────┴──────────────┴──────────────┴──────────────┘    │
├──────────────────────────────────────────────────────────────────┤
│                        L4 Middleware                             │
│  ┌──────────────────────────┬──────────────────────────────────┐  │
│  │ FatFs / LittleFs（文件系统）│ SFUD（SPI Flash 抽象）            │  │
│  └──────────────────────────┴──────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                        L3 Driver（设备驱动）                       │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐         │
│  │ drv_oled │ drv_flash│ drv_sd   │ drv_key  │ drv_led  │         │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘         │
├──────────────────────────────────────────────────────────────────┤
│                        L1/L2 HAL + BSP                           │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐         │
│  │ hal_uart │ hal_spi  │ hal_i2c  │ hal_adc  │ hal_rtc  │         │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘         │
└──────────────────────────────────────────────────────────────────┘
```

### 1.1 8 子系统职责

| 子系统 | 文件 | 职责 |
|---|---|---|
| 1 **启动与自检** | `app/system_init.c` | 上电打印 banner / 读设备 ID / 检测 Flash & TF |
| 2 **RTC 时间管理** | `service/svc_rtc.c` | 设置 / 读取标准时间 + Unix 时间戳转换 |
| 3 **CLI 命令解析** | `service/svc_cli.c` | 串口命令注册 / 参数解析 / 输出格式化（详见 `.auto-embedded/refs/cli-command-framework.md`）|
| 4 **配置管理** | `service/svc_config.c` | 变比 / 阈值 / 上电次数 / Flash 持久化 + INI 文件加载 |
| 5 **采集控制** | `service/svc_sampler.c` | start/stop 状态机 / 周期定时器 / ADC 读 / 变比换算 / 超限检测 |
| 6 **OLED 显示** | `service/svc_display.c` | 时间 + 电压实时刷新 / IDLE 状态显示 |
| 7 **文件系统存储** | `service/svc_storage.c` | 多文件夹结构 / 文件名约定 / 满 10 条新建 |
| 8 **操作日志** | `service/svc_logger.c` | 每次上电递增文件号 + 操作记录 |

---

## 2. 子系统 1：启动与自检

### 2.1 上电流程

```c
/* app/system_init.c */
void system_init(void)
{
    bsp_init();                          /* 1. 板级（时钟 + Debug UART） */
    drv_oled_init();
    drv_flash_init();
    drv_sd_init();                       /* 可能失败（TF 卡未插入） */

    svc_rtc_init();
    svc_config_load();                   /* 从 Flash 读变比/阈值/上电次数 */
    svc_config_inc_boot_count();         /* 上电次数 +1 并写回 Flash */
    svc_logger_open();                   /* 用新上电次数打开 log{N}.txt */

    printf("====system init====\n");
    printf("Device_ID: %s\n", svc_config_get_device_id());
    printf("====system ready====\n");
    drv_oled_show_idle();
}
```

### 2.2 系统自检命令（test）

```c
/* service/svc_cli.c — test 命令处理 */
int cmd_test(int argc, char **argv)
{
    printf("=====system selftest=====\n");

    /* Flash 自检：读 JEDEC ID */
    uint32_t flash_id;
    bool flash_ok = drv_flash_read_id(&flash_id);
    printf("flash..........%s\n", flash_ok ? "ok" : "error");

    /* TF 卡自检：检测是否挂载 */
    bool sd_ok = drv_sd_is_mounted();
    printf("TF card..........%s\n", sd_ok ? "ok" : "error");

    if (flash_ok) printf("flash ID: 0x%lX\n", flash_id);
    if (sd_ok) {
        uint32_t mem_kb = drv_sd_get_capacity_kb();
        printf("TF card memory: %lu KB\n", mem_kb);
    } else {
        printf("can not find TF card\n");
    }

    char time_str[24];
    svc_rtc_get_time_str(time_str, sizeof(time_str));
    printf("RTC: %s\n", time_str);

    printf("=====system selftest=====\n");
    return 0;
}
```

---

## 3. 子系统 2：RTC 时间管理

### 3.1 RTC 抽象（hal_rtc.h）

```c
/* hal/inc/hal_rtc.h */
typedef struct {
    uint16_t year;
    uint8_t  month, day;
    uint8_t  hour, minute, second;
} hal_rtc_time_t;

hal_status_t hal_rtc_set(const hal_rtc_time_t *t);
hal_status_t hal_rtc_get(hal_rtc_time_t *t);
uint32_t     hal_rtc_to_unix(const hal_rtc_time_t *t);
```

### 3.2 时间字符串解析（容忍多种分隔符）

```c
/* service/svc_rtc.c */
int svc_rtc_parse(const char *s, hal_rtc_time_t *t)
{
    /* 解析 "2025-01-01 12:00:30" 或 "2025/01/01 12-00-30" 或紧凑形式 */
    int y, mo, d, h, mi, se;
    int n = 0;
    /* sscanf 不挑剔分隔符，用 %*c 吃任意字符 */
    n = sscanf(s, "%d%*c%d%*c%d%*c%d%*c%d%*c%d",
               &y, &mo, &d, &h, &mi, &se);
    if (n != 6) return -1;
    if (y < 2000 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > 31) return -1;
    if (h > 23 || mi > 59 || se > 59) return -1;
    t->year = y; t->month = mo; t->day = d;
    t->hour = h; t->minute = mi; t->second = se;
    return 0;
}
```

### 3.3 Unix 时间戳转换（重要：数据编码会用）

```c
/* hal/ports/<chip>/hal_rtc_<chip>.c */
uint32_t hal_rtc_to_unix(const hal_rtc_time_t *t)
{
    /* 简化版：用 mktime 或自己算（注意不要乘 1000，秒级即可） */
    struct tm tm_info = {
        .tm_year = t->year - 1900,
        .tm_mon  = t->month - 1,
        .tm_mday = t->day,
        .tm_hour = t->hour,
        .tm_min  = t->minute,
        .tm_sec  = t->second,
        .tm_isdst = -1,
    };
    return (uint32_t)mktime(&tm_info);
}
```

---

## 4. 子系统 3：CLI 命令解析

详见 **`.auto-embedded/refs/cli-command-framework.md`**。本节只给最小用法：

```c
/* 命令表注册 */
static const cli_cmd_t s_cmds[] = {
    {"test",          cmd_test,         "系统自检"},
    {"RTC Config",    cmd_rtc_config,   "设置时间"},
    {"RTC now",       cmd_rtc_now,      "显示时间"},
    {"conf",          cmd_conf,         "读 config.ini"},
    {"ratio",         cmd_ratio,        "设变比"},
    {"limit",         cmd_limit,        "设阈值"},
    {"start",         cmd_start,        "开始采样"},
    {"stop",          cmd_stop,         "停止采样"},
    {"hide",          cmd_hide,         "启用加密"},
    {"unhide",        cmd_unhide,       "取消加密"},
    {"config save",   cmd_config_save,  "存参数"},
    {"config read",   cmd_config_read,  "读参数"},
};
```

### 4.1 多词命令（"RTC Config" / "config save"）的解析要点

不能简单按空格分词 → 必须做"最长前缀匹配"。

```c
/* .auto-embedded/refs/cli-command-framework.md 给完整实现 */
int cli_dispatch(const char *line) {
    /* 先按全长比对所有注册命令的字符串，按字符数从长到短 */
    /* 再剩余部分作为 argv */
}
```

### 4.2 二段式交互命令（如 ratio）

```c
/* ratio 命令的状态机式实现 */
static enum { IDLE, WAIT_RATIO } s_state = IDLE;

int cmd_ratio(int argc, char **argv) {
    float r = svc_config_get_ratio();
    printf("Ratio = %.1f\n", r);
    printf("       Input value(0~100):\n");
    s_state = WAIT_RATIO;
    return 0;
}

/* 在 svc_cli_process_line 里检测如果当前 state != IDLE，则把整行当作参数 */
void svc_cli_process_line(const char *line) {
    if (s_state == WAIT_RATIO) {
        s_state = IDLE;
        float v = atof(line);
        if (v >= 0 && v <= 100) {
            svc_config_set_ratio(v);
            printf("ratio modified success\n");
        } else {
            printf("ratio invalid\n");
        }
        printf("Ratio = %.1f\n", svc_config_get_ratio());
        return;
    }
    cli_dispatch(line);
}
```

---

## 5. 子系统 4：配置管理（Flash + INI）

### 5.1 Flash 参数布局（外部 SPI Flash，**双区掉电安全**）

**为什么双区**：上电次数 `boot_count` 每次开机都要写一次 Flash。若在写入过程中掉电，单区方案会让参数永久损坏，开机直接拉 GG。双区方案：主区写入失败 → 自动回退备份区。

```
地址          扇区  内容
0x000000      Sector 0    Config 主区（4 KB）
0x001000      Sector 1    Config 备份区（4 KB，与主区结构相同）
0x002000      Sector 2    Device ID 永久区（写一次，全生命周期不动）
0x010000~     预留         未来扩展（如校准曲线 / 用户数据）
```

**单个 Config 区内布局**（4 KB 扇区前 32 B 用，其余预留）：

```
偏移   长度   字段           说明
0x00   4 B    magic         "IDA0"（0x30414449，判断有效性；如做特定赛事可改本队代号）
0x04   4 B    version       结构体版本号（升级兼容）
0x08   4 B    sequence      写序号（uint32_t，每次写 +1，用于双区比较新旧）
0x0C   4 B    ratio         float
0x10   4 B    limit         float
0x14   4 B    boot_count    uint32_t
0x18   8 B    reserved      预留对齐
0x20   4 B    crc32         整段 (magic..reserved) 的 CRC32 校验
0x24~  ...    用户扩展区
```

**Device ID 永久区**（0x002000，仅工厂烧录一次）：

```
偏移   长度   字段
0x00   4 B    magic "IDA0"
0x04   24 B   device_id "YYYY-<TEAM>-XXXX"（null-terminated；按赛事/团队号定）
0x1C   4 B    crc32
```

### 5.2 Flash 读写抽象（双区 + CRC + 掉电恢复）

```c
/* service/svc_config.h */
#define FLASH_CONFIG_PRI_ADDR   0x000000
#define FLASH_CONFIG_BAK_ADDR   0x001000
#define FLASH_DEVICE_ID_ADDR    0x002000
#define FLASH_CONFIG_MAGIC      0x30414449U   /* "IDA0" little-endian */
#define FLASH_CONFIG_VERSION    0x00000100U   /* v1.0 */

typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint32_t version;
    uint32_t sequence;
    float    ratio;
    float    limit;
    uint32_t boot_count;
    uint8_t  reserved[8];
    uint32_t crc32;
} flash_config_t;

typedef struct __attribute__((packed)) {
    uint32_t magic;
    char     device_id[24];
    uint32_t crc32;
} flash_device_id_t;
```

### 5.3 双区加载策略（掉电恢复核心）

```c
/* service/svc_config.c */
static flash_config_t s_cfg_ram;

static bool config_valid(const flash_config_t *c) {
    if (c->magic != FLASH_CONFIG_MAGIC) return false;
    if (c->version != FLASH_CONFIG_VERSION) return false;
    uint32_t calc = crc32(c, offsetof(flash_config_t, crc32));
    return calc == c->crc32;
}

hal_status_t svc_config_load(void) {
    flash_config_t pri, bak;
    drv_flash_read(FLASH_CONFIG_PRI_ADDR, &pri, sizeof(pri));
    drv_flash_read(FLASH_CONFIG_BAK_ADDR, &bak, sizeof(bak));

    bool pri_ok = config_valid(&pri);
    bool bak_ok = config_valid(&bak);

    if (pri_ok && bak_ok) {
        /* 都有效，选 sequence 大的（最新写入）*/
        s_cfg_ram = (pri.sequence >= bak.sequence) ? pri : bak;
    } else if (pri_ok) {
        s_cfg_ram = pri;
        /* 备份区损坏 → 立刻修复 */
        config_write_to(FLASH_CONFIG_BAK_ADDR, &s_cfg_ram);
    } else if (bak_ok) {
        s_cfg_ram = bak;
        config_write_to(FLASH_CONFIG_PRI_ADDR, &s_cfg_ram);
    } else {
        /* 都坏 / 首次上电 → 默认值 */
        s_cfg_ram = (flash_config_t){
            .magic = FLASH_CONFIG_MAGIC,
            .version = FLASH_CONFIG_VERSION,
            .sequence = 0,
            .ratio = 1.0f,
            .limit = 1.0f,
            .boot_count = 0,
        };
        config_save_both();
    }
    return HAL_OK;
}
```

### 5.4 双区写入策略（保证至少一区永远有效）

```c
hal_status_t svc_config_save(void) {
    s_cfg_ram.sequence++;
    s_cfg_ram.crc32 = crc32(&s_cfg_ram, offsetof(flash_config_t, crc32));

    /* 1. 先写主区 */
    hal_status_t r1 = config_write_to(FLASH_CONFIG_PRI_ADDR, &s_cfg_ram);
    if (r1 != HAL_OK) {
        /* 主区写失败 → 至少备份区可能还是上次有效 */
        return r1;
    }

    /* 2. 验证主区写入成功（防 Flash 坏块）*/
    flash_config_t verify;
    drv_flash_read(FLASH_CONFIG_PRI_ADDR, &verify, sizeof(verify));
    if (!config_valid(&verify)) return HAL_ERR_HW;

    /* 3. 再写备份区（即使中途掉电，主区已经稳了）*/
    return config_write_to(FLASH_CONFIG_BAK_ADDR, &s_cfg_ram);
}

static hal_status_t config_write_to(uint32_t addr, const flash_config_t *c) {
    /* SPI Flash 必须先擦除扇区再写 */
    if (drv_flash_erase_sector(addr) != HAL_OK) return HAL_ERR_HW;
    if (drv_flash_write(addr, c, sizeof(*c)) != HAL_OK) return HAL_ERR_HW;
    return HAL_OK;
}
```

### 5.5 boot_count 自增（关键：上电就写一次，立即落盘）

```c
hal_status_t svc_config_inc_boot_count(void) {
    s_cfg_ram.boot_count++;
    /* 立刻写入，不能等用户 config save。否则掉电会丢上电次数。*/
    return svc_config_save();
}

uint32_t svc_config_get_boot_count(void) {
    return s_cfg_ram.boot_count;
}
```

### 5.6 INI 文件解析（极简 ≤ 100 行）

```c
/* service/svc_config.c — 简化 INI parser，仅支持 [section] + key=value */
int svc_config_load_ini(const char *path)
{
    FILE *fp = fs_fopen(path, "r");
    if (!fp) return -1;

    char  line[64];
    char  section[16] = "";
    while (fs_fgets(line, sizeof(line), fp)) {
        /* 去前后空白 */
        char *s = strip(line);
        if (*s == '\0' || *s == ';' || *s == '#') continue;

        /* [section] */
        if (*s == '[') {
            char *end = strchr(s, ']');
            if (end) { *end = 0; strncpy(section, s+1, sizeof(section)-1); }
            continue;
        }

        /* key = value */
        char *eq = strchr(s, '=');
        if (!eq) continue;
        *eq = 0;
        char *key = strip(s);
        char *val = strip(eq + 1);

        /* 只关心 [Ratio] Ch0= 和 [Limit] Ch0= */
        if (strcmp(section, "Ratio") == 0 && strcmp(key, "Ch0") == 0) {
            svc_config_set_ratio(atof(val));
        } else if (strcmp(section, "Limit") == 0 && strcmp(key, "Ch0") == 0) {
            svc_config_set_limit(atof(val));
        }
    }
    fs_fclose(fp);
    svc_config_save();   /* 落 Flash（双区）*/
    return 0;
}
```

### 5.7 掉电恢复测试用例（赛前必跑）

```
□ 测试 1：正常重启 — boot_count 自增 1，参数不变
□ 测试 2：写主区瞬间断电（用秒表卡 50ms） — 重启后从备份区恢复，sequence 一致
□ 测试 3：故意把主区扇区写脏（用 J-Link 工具） — 重启后从备份区自动修复主区
□ 测试 4：故意把备份区写脏 — 重启后从主区自动修复备份区
□ 测试 5：两区都脏 — 重启加载默认值（首次上电语义）
```

### 5.2 Flash 读写抽象

```c
/* service/svc_config.h */
typedef struct __attribute__((packed)) {
    char     device_id[16];
    float    ratio;
    float    limit;
    uint32_t boot_count;
    uint32_t crc;
} sys_config_t;

hal_status_t svc_config_load(void);          /* 从 Flash 读，CRC 失败 → 默认值 */
hal_status_t svc_config_save(void);          /* 写回 Flash + CRC */
float        svc_config_get_ratio(void);
hal_status_t svc_config_set_ratio(float r);  /* 校验 + 暂存（不立即刷 Flash）*/
uint32_t     svc_config_get_boot_count(void);
hal_status_t svc_config_inc_boot_count(void);/* 自增 + 立即刷 Flash */
```

### 5.3 INI 文件解析（极简 ≤ 100 行）

```c
/* service/svc_config.c — 简化 INI parser，仅支持 [section] + key=value */
int svc_config_load_ini(const char *path)
{
    FILE *fp = fs_fopen(path, "r");
    if (!fp) return -1;

    char  line[64];
    char  section[16] = "";
    while (fs_fgets(line, sizeof(line), fp)) {
        /* 去前后空白 */
        char *s = strip(line);
        if (*s == '\0' || *s == ';' || *s == '#') continue;

        /* [section] */
        if (*s == '[') {
            char *end = strchr(s, ']');
            if (end) { *end = 0; strncpy(section, s+1, sizeof(section)-1); }
            continue;
        }

        /* key = value */
        char *eq = strchr(s, '=');
        if (!eq) continue;
        *eq = 0;
        char *key = strip(s);
        char *val = strip(eq + 1);

        /* 只关心 [Ratio] Ch0= 和 [Limit] Ch0= */
        if (strcmp(section, "Ratio") == 0 && strcmp(key, "Ch0") == 0) {
            svc_config_set_ratio(atof(val));
        } else if (strcmp(section, "Limit") == 0 && strcmp(key, "Ch0") == 0) {
            svc_config_set_limit(atof(val));
        }
    }
    fs_fclose(fp);
    svc_config_save();   /* 落 Flash */
    return 0;
}
```

---

## 6. 子系统 5：采集控制

### 6.1 状态机

```c
typedef enum {
    SAMPLER_IDLE,
    SAMPLER_RUNNING,
    SAMPLER_OVERLIMIT,
} sampler_state_t;

typedef struct {
    sampler_state_t state;
    uint32_t        period_sec;    /* 5 / 10 / 15 */
    uint32_t        last_tick;
    float           last_voltage;
    bool            encrypt_on;    /* hide/unhide 状态 */
} sampler_ctx_t;
```

### 6.1.5 ⭐ 加密 / 超限 / 文件夹三态真值表（关键 — 关系 32 分）

题目里 `hide` / `unhide` 与 `OverLimit` 是两个独立状态，相互组合产生 **4 种采集模式**。每种模式下"串口输出格式"和"3 个 TF 文件夹写哪个"必须明确。

| 模式 | encrypt_on | overlimit | 串口格式 | sample/ | overLimit/ | hideData/ |
|---|---|---|---|---|---|---|
| **A 正常采集** | false | false | `2025-... ch0=10.50V` | ✅ 写 | ❌ 不写 | ❌ 不写 |
| **B 正常 + 超限** | false | true | `2025-... ch0=10.50V OverLimit (30.00) !` | ✅ 写 | ✅ 写 | ❌ 不写 |
| **C 加密采集** | true | false | `6774C4F5000C8000` | ❌ **不写**（题目 6c）| ❌ 不写 | ✅ 写 |
| **D 加密 + 超限** | true | true | `6774C4F5000C8000*` | ❌ **不写**（题目 6c）| ✅ **仍写**（题目 6c）| ✅ 写 |

**关键陷阱**（很多队伍栽在这里）：

1. ❌ **错误理解**："hide 模式下所有数据都加密存"
   ✅ **正确**：hide 只影响 sample/ 和 hideData/；overLimit/ **无论是否 hide 都按原格式存**（题目 6c 明文要求）

2. ❌ **错误理解**："hide 模式 sample/ 也写但写 HEX"
   ✅ **正确**：hide 模式 sample/ **完全不写新数据**，但旧数据保留

3. ❌ **错误理解**："超限事件停止采样"
   ✅ **正确**：超限只是点亮 LED2 + 串口加 OverLimit 标记，**不停止采样**

4. ❌ **错误理解**："unhide 后 hideData/ 文件还在追加"
   ✅ **正确**：unhide 立即停止 hideData/ 追加，原文件保留不删

### 6.1.6 状态转移图

```
                  ┌──────────────────────┐
                  │   IDLE（开机默认）     │
                  └──┬───────────────────┘
                     │ start / KEY1
                     ▼
                  ┌──────────────────────┐
                  │   RUNNING_NORMAL     │  (A 模式)
                  └──┬──────────────┬────┘
                     │              │
              ┌──────▼─────┐  ┌─────▼──────┐
              │  超限     │  │ hide       │
              ▼            │  ▼            │
   RUNNING_NORMAL_OVERLIMIT  RUNNING_HIDE
       (B 模式)                  (C 模式)
              │                  │
              │  超限同时 hide   │
              └────────┬─────────┘
                       ▼
              RUNNING_HIDE_OVERLIMIT  (D 模式)

         ↑ stop / KEY1 任何时候都能回 IDLE ↑
```

实现注意：状态本身只有 RUNNING / IDLE 两个；`encrypt_on` 和 `is_overlimit` 是 RUNNING 子状态的两个**正交标志**，不要写成 4 个独立状态。

### 6.1.7 写入路由代码模板

```c
/* service/svc_sampler.c — 一次采样的完整路由 */
static void emit_sample(const hal_rtc_time_t *t, float v_eng)
{
    char time_str[24];
    snprintf(time_str, sizeof(time_str),
             "%04d-%02d-%02d %02d:%02d:%02d",
             t->year, t->month, t->day, t->hour, t->minute, t->second);

    bool overlimit = (v_eng > svc_config_get_limit());
    drv_led_set(LED2, overlimit);

    /* 1. 串口输出（根据 4 种模式） */
    if (s_ctx.encrypt_on) {
        char hex[32];
        encode_hex(t, v_eng, hex, sizeof(hex));
        printf("%s%s\n", hex, overlimit ? "*" : "");
    } else {
        printf("%s ch0=%.2fV", time_str, v_eng);
        if (overlimit) {
            printf(" OverLimit (%.2f) !", svc_config_get_limit());
        }
        printf("\n");
    }

    /* 2. TF 卡写入（按真值表）*/
    if (!s_ctx.encrypt_on) {
        /* hide 关闭 → 写 sample/ */
        svc_storage_append_sample(time_str, v_eng);
    } else {
        /* hide 开启 → 不写 sample/，写 hideData/ */
        char hex[32];
        encode_hex(t, v_eng, hex, sizeof(hex));
        svc_storage_append_hidedata(hex, overlimit);
    }

    /* 超限独立判断 — 与 encrypt_on 无关 */
    if (overlimit) {
        svc_storage_append_overlimit(time_str, v_eng);
    }

    /* 3. OLED 刷新（只显示时分秒 + 电压，不管 hide）*/
    drv_oled_show_sampling(time_str, v_eng);
}
```

### 6.1.8 真值表自测脚本（赛前必跑）

```
□ 设 limit=10
□ A 模式：变阻器 → 5V（不超限）
   - 串口：xx-xx-xx ch0=5.00V  ✓
   - sample/ 有新数据  ✓
   - overLimit/ 无新数据  ✓
   - hideData/ 无新数据  ✓
□ B 模式：变阻器 → 15V（超限）
   - 串口：xx-xx-xx ch0=15.00V OverLimit (10.00) !  ✓
   - LED2 亮  ✓
   - sample/ 有新数据  ✓
   - overLimit/ 有新数据  ✓
□ C 模式：输入 hide，变阻器 → 5V
   - 串口：6774xxxx0005xxxx（HEX）  ✓
   - sample/ **无新数据**  ✓
   - overLimit/ 无新数据  ✓
   - hideData/ 有新数据  ✓
□ D 模式：变阻器 → 15V（hide + 超限）
   - 串口：6774xxxx000Fxxxx*（尾 *）  ✓
   - LED2 亮  ✓
   - sample/ **无新数据**  ✓
   - overLimit/ **有新数据**（仍按原格式）  ✓
   - hideData/ 有新数据  ✓
□ 输入 unhide
   - 立即回 A/B 模式
   - 之前的 hideData/ 文件不动
```

---

### 6.2 周期采集（主循环 + SysTick）

```c
/* service/svc_sampler.c */
void svc_sampler_tick_1ms(void) {
    static uint32_t led1_div = 0;
    if (s_ctx.state == SAMPLER_RUNNING && ++led1_div >= 500) {
        led1_div = 0;
        drv_led_toggle(LED1);          /* LED1 1Hz 闪烁 */
    }
}

void svc_sampler_process(void) {
    if (s_ctx.state != SAMPLER_RUNNING) return;

    uint32_t now = hal_get_tick_ms();
    if (now - s_ctx.last_tick < s_ctx.period_sec * 1000) return;
    s_ctx.last_tick = now;

    /* 1. 读 ADC */
    uint16_t raw = drv_adc_read(ADC_CH0);
    float v_phys = (float)raw / 4095.0f * 3.3f;
    float v_eng  = v_phys * svc_config_get_ratio();

    /* 2. 取时间 */
    hal_rtc_time_t t;
    hal_rtc_get(&t);
    char time_str[24];
    snprintf(time_str, sizeof(time_str),
             "%04d-%02d-%02d %02d:%02d:%02d",
             t.year, t.month, t.day, t.hour, t.minute, t.second);

    /* 3. 超限检测 */
    bool overlimit = v_eng > svc_config_get_limit();
    drv_led_set(LED2, overlimit);

    /* 4. 串口 / OLED / 文件存储 */
    if (s_ctx.encrypt_on) {
        char hex[32];
        encode_hex(time_str, v_eng, hex, sizeof(hex));
        printf("%s%s\n", hex, overlimit ? "*" : "");
        svc_storage_append_hidedata(hex);
    } else {
        printf("%s ch0=%.2fV%s\n", time_str, v_eng,
               overlimit ? " OverLimit (xx.xx)!" : "");
        svc_storage_append_sample(time_str, v_eng);
    }

    if (overlimit) svc_storage_append_overlimit(time_str, v_eng);

    drv_oled_show_sampling(time_str, v_eng);
}
```

---

## 7. 子系统 6：OLED 显示

```c
/* service/svc_display.c */
void drv_oled_show_idle(void) {
    drv_oled_clear();
    drv_oled_string(0, 0, "system idle");
    drv_oled_refresh();
}

void drv_oled_show_sampling(const char *time_full, float v) {
    char hms[16];
    /* 提取 hh:mm:ss */
    sscanf(time_full + 11, "%s", hms);
    char vstr[16];
    snprintf(vstr, sizeof(vstr), "%.2f V", v);
    drv_oled_clear();
    drv_oled_string(0, 0, hms);
    drv_oled_string(0, 16, vstr);
    drv_oled_refresh();
}
```

**注意**：刷屏频率不能太高（每秒 1-2 次足够）；嵌在 svc_sampler_process 里随采样周期更新即可。

---

## 8. 子系统 7：文件系统存储（4 文件夹）

### 8.1 文件夹结构

```
/sample/
  sampleData20250101003010.txt    ← 每 10 条新建
  sampleData20250101003110.txt
/overLimit/
  overLimit20250101003045.txt
/log/
  log0.txt                          ← 上电次数 0
  log1.txt                          ← 上电次数 1
  log2.txt
/hideData/
  hideData20250101003010.txt
config.ini                          ← 根目录，开机读
```

### 8.2 文件名构造（DRY 原则）

```c
/* service/svc_storage.c */
static void make_timestamp_filename(char *out, size_t len,
                                    const char *prefix, const char *ext)
{
    hal_rtc_time_t t;
    hal_rtc_get(&t);
    snprintf(out, len, "%s%04d%02d%02d%02d%02d%02d.%s",
             prefix, t.year, t.month, t.day, t.hour, t.minute, t.second, ext);
}
```

### 8.3 满 10 条新建（关键！很多队伍栽这）

```c
typedef struct {
    char     dir[16];
    char     prefix[24];
    char     current_path[64];
    FILE    *fp;
    uint32_t records_in_current;
} storage_session_t;

static storage_session_t s_sample = {"/sample", "sampleData"};
static storage_session_t s_overlimit = {"/overLimit", "overLimit"};
static storage_session_t s_hidedata = {"/hideData", "hideData"};

static void session_open_new(storage_session_t *ss) {
    char fname[64];
    make_timestamp_filename(fname, sizeof(fname), ss->prefix, "txt");
    snprintf(ss->current_path, sizeof(ss->current_path),
             "%s/%s", ss->dir, fname);
    ss->fp = fs_fopen(ss->current_path, "a");
    ss->records_in_current = 0;
}

void svc_storage_append_sample(const char *time_str, float v) {
    if (!s_sample.fp || s_sample.records_in_current >= 10) {
        if (s_sample.fp) fs_fclose(s_sample.fp);
        session_open_new(&s_sample);
    }
    fs_fprintf(s_sample.fp, "%s ch0=%.2fV\n", time_str, v);
    fs_fflush(s_sample.fp);
    s_sample.records_in_current++;
}
```

### 8.4 文件系统选择：FatFs vs LittleFs

| | FatFs | LittleFs |
|---|---|---|
| TF 卡 | ✅ 标准 | ⚠️ 不常用 |
| 内部 Flash | ⚠️ 不推荐 | ✅ 首选（有掉电安全）|
| 实现复杂度 | 中 | 中 |
| 工业题首选 | ✅ TF 卡用 FatFs | 仅在 Flash 文件系统时用 |

**西门子赛题用 FatFs**（TF 卡），LittleFs 资料里有但不是首选。

---

## 9. 子系统 8：操作日志

### 9.1 关键设计：日志文件号必须用 Flash 计数器，不能数 TF 卡文件

题目原文："文件 id 号（上电次数）应当记录在 MCU 中，例如将 TF 卡清空后，第五次上电后应当生成的是 log4.txt，而不是从 0 开始。"

```c
/* service/svc_logger.c */
static FILE *s_log_fp = NULL;

void svc_logger_open(void) {
    /* 用 svc_config 已加载的 boot_count（已在 system_init 中自增）*/
    uint32_t id = svc_config_get_boot_count() - 1;  /* 当前次 = boot_count - 1 */
    char path[32];
    snprintf(path, sizeof(path), "/log/log%lu.txt", id);
    s_log_fp = fs_fopen(path, "a");
}

void svc_logger_log(const char *event_fmt, ...) {
    if (!s_log_fp) return;
    hal_rtc_time_t t; hal_rtc_get(&t);
    fs_fprintf(s_log_fp, "[%04d-%02d-%02d %02d:%02d:%02d] ",
               t.year, t.month, t.day, t.hour, t.minute, t.second);
    va_list ap; va_start(ap, event_fmt);
    fs_vfprintf(s_log_fp, event_fmt, ap);
    va_end(ap);
    fs_fputc('\n', s_log_fp);
    fs_fflush(s_log_fp);
}
```

### 9.2 在 CLI 解析层统一插入日志

```c
/* svc_cli.c 主入口 */
void svc_cli_process_line(const char *line) {
    svc_logger_log("CMD: %s", line);     /* 所有命令自动入日志 */
    /* ... 命令分发 ... */
}
```

---

## 10. 数据编解码（hide / unhide）

### 10.1 编码规则

题目原文：

```
时间戳：4 字节 Unix 时间戳
电压值：4 字节分两部分
  整数部分（高 2 字节，big-endian）：12V → 000C
  小数部分（低 2 字节，big-endian）：0.5V → 0.5×65536 = 32768 → 8000
```

### 10.2 实现

```c
/* service/svc_codec.c */
void encode_hex(const char *time_str, float v, char *out, size_t len)
{
    /* 1. 解析时间字符串 → unix */
    hal_rtc_time_t t;
    sscanf(time_str, "%d-%d-%d %d:%d:%d",
           (int*)&t.year, (int*)&t.month, (int*)&t.day,
           (int*)&t.hour, (int*)&t.minute, (int*)&t.second);
    uint32_t unix_ts = hal_rtc_to_unix(&t);

    /* 2. 电压拆分 */
    uint16_t int_part  = (uint16_t)v;
    uint16_t frac_part = (uint16_t)((v - int_part) * 65536.0f);

    /* 3. 拼 HEX 字符串（big-endian）*/
    snprintf(out, len, "%08lX%04X%04X", unix_ts, int_part, frac_part);
}
```

**测试用例**（题目给的）：

```
输入：2025-01-01 12:30:45 ch0=12.5V
预期 unix：1735705845 → 6774C4F5
预期整数：12 → 000C
预期小数：0.5*65536=32768 → 8000
拼起来：6774C4F5000C8000  ✓
```

---

## 11. 完整工程目录骨架

```
<project>/
├── app/
│   ├── system_init.c/.h           # 启动流程
│   └── main.c                      # 仅 bsp_init + svc_init + app_run
├── service/
│   ├── svc_cli.c/.h                # CLI 命令分发
│   ├── svc_config.c/.h             # 参数 + INI
│   ├── svc_sampler.c/.h            # 采集主循环
│   ├── svc_storage.c/.h            # TF 卡存储
│   ├── svc_logger.c/.h             # 操作日志
│   ├── svc_display.c/.h            # OLED 显示
│   ├── svc_rtc.c/.h                # RTC 封装
│   └── svc_codec.c/.h              # hide / unhide
├── drivers/
│   ├── drv_oled.c/.h               # SSD1306
│   ├── drv_flash.c/.h              # SPI Flash（用 SFUD）
│   ├── drv_sd.c/.h                 # TF 卡 SDIO/SPI
│   ├── drv_key.c/.h                # 按键（用 easy_button）
│   ├── drv_led.c/.h
│   └── drv_adc.c/.h
├── middleware/
│   ├── fatfs/                      # 文件系统
│   ├── sfud/                       # SPI Flash 通用驱动
│   └── easy_button/                # 按键
├── hal/
│   ├── inc/                        # hal_uart.h / hal_spi.h / hal_rtc.h ...
│   └── ports/gd32f4/               # 厂商适配（唯一可 include 厂商头）
└── vendor/
    └── gd32f4xx_std/               # 厂商 SDK
```

---

## 12. 与比赛模式 v2 的衔接

### 12.1 派 Agent 方式（电赛 / 西门子赛 这类工业题）

CP-1.5 **跳过 [MATLAB] / [VISION]**（无算法），直接 CP-2 派 4 个 Agent：

```
[DRV]    写 GPIO/UART/SPI/SDIO/ADC/RTC/TIM 驱动
[ALG]    写 svc_cli / svc_sampler / svc_config / svc_codec / svc_storage / svc_logger / svc_display
[QA]     验证 + 静态分析 + 触发 matlab-firmware-pipeline 的编译 + 烧 + 监视 3 步（跳过 MATLAB 仿真 / 对比）
[REPORT] 答辩准备
```

### 12.2 自动决策门

工业题 [MATLAB] 缺席 → CP-1.5 标记 `status=skipped`，[ARCH] 自动跳到 CP-2。

### 12.3 失败兜底

| 失败 | failure_category | 处置 |
|---|---|---|
| FatFs 挂载失败 | `connection-failure` | 检查 SD 卡 SPI/SDIO 配置 |
| 文件名超长 | `project-config-error` | 缩短前缀 / 用短文件名模式 |
| Flash CRC 错误 | `target-response-abnormal` | 加载默认值 + 报警 |
| 串口命令未匹配 | `ambiguous-context` | 提示"unknown command" |
| RTC 跑飞 | `connection-failure` | 检查 LSE 晶振 + 电池 |

---

## 13. 与四文件磁盘记忆映射

| 任务阶段 | 写入文件 | 关键段 |
|---|---|---|
| 第 0 步读题 | `项目规划清单.md` | 8 子系统对应表 + 评分点 |
| 子系统选型 | `研究发现.md` | FatFs / SFUD / letter-shell 等库选型理由 |
| 接口契约 | `架构设计.md` | 12 命令清单 + 4 文件夹结构 + Flash 布局 |
| 实现 | `编辑清单_<role>.md` | 每个子系统的 commit hash |
| 硬件 | `硬件资源表.md` | 引脚 + DMA + 中断分配（OLED I2C/SPI、SD SDIO、Flash SPI、ADC、UART） |

---

## 14. 关联资源

- **比赛模式 v2 主流程**：`.auto-embedded/modes/competition.md`
- **极限工作流（Agent prompt 模板）**：`.auto-embedded/refs/competition-ai-max-workflow.md`
- **CLI 框架详细实现**：`.auto-embedded/refs/cli-command-framework.md`
- **完整工业题端到端示例**：`.auto-embedded/refs/example-siemens-cimc-2025.md`
- **GD32F470 主板模板**：`.auto-embedded/modes/gd32-board.md`、`.auto-embedded/refs/gd32f4xx-api.md`
- **开源库索引**：`.auto-embedded/refs/embed-libs-index.md`（含 letter-shell / SFUD / easy_button 等）
- **驱动移植规则**：`.auto-embedded/refs/driver-porting.md`
- **失败分类**：`.auto-embedded/refs/failure-taxonomy.md`
- **统一约定**：`.auto-embedded/refs/contracts.md`
