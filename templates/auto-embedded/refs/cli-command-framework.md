# CLI 命令解析框架（嵌入式串口命令行）

> 难度：★★ — 不复杂但很多细节，第一次写容易栽坑
>
> 适用：所有需要"串口收命令 → 执行外设操作 → 输出结果"的工业题（西门子赛 / 电赛仪表题 / 实验室仪器等）
>
> 关联：`.auto-embedded/modes/industrial-data-acquisition.md` 子系统 3、`.auto-embedded/refs/example-siemens-cimc-2025.md`

---

## 0. 你将拿到什么

| 产物 | 用途 |
|---|---|
| 命令表数据结构 | 注册命令 |
| 行缓冲 + 分词逻辑 | 串口数据流 → 命令行 |
| **多词命令匹配**（如 `RTC Config` / `config save`） | 关键难点 |
| 状态机式交互（如 `ratio` 命令两段输入） | 关键难点 |
| 输入有效性校验模板 | 范围 / 浮点解析 |
| 错误处理 + 日志钩子 | 集成到 svc_logger |

---

## 1. 为什么不直接抄 letter-shell

| | letter-shell | 本框架（minimal） |
|---|---|---|
| 体积 | 中等（4 KB+ Flash） | 极小（< 1 KB） |
| 学习曲线 | 中（要看完文档） | 低（200 行内看完） |
| 多词命令 | ⚠️ 需配置 / 改造 | ✅ 原生支持 |
| 状态机交互 | ⚠️ 不直接支持 | ✅ 原生支持 |
| 命令补全 / 历史 | ✅ | ❌（赛题不要求） |
| 适合赛场 4 天 | ❌ 学习成本占用时间 | ✅ 当天看懂当天用 |

**推荐**：竞赛/课程项目用本框架；产品级 / 上位机调试工具用 letter-shell。

---

## 2. 数据结构与命令注册

```c
/* service/svc_cli.h */
#ifndef SVC_CLI_H
#define SVC_CLI_H

#include <stdint.h>

typedef int (*cli_handler_t)(int argc, char **argv);

typedef struct {
    const char    *name;          /* 完整命令名（可含空格，如 "RTC Config"） */
    cli_handler_t  handler;
    const char    *help;
} cli_cmd_t;

void  svc_cli_init(const cli_cmd_t *cmds, uint8_t n_cmds);
void  svc_cli_feed(uint8_t c);    /* UART RX 回调每收一字节调一次 */
void  svc_cli_process(void);      /* 主循环每轮调一次 */

#endif
```

```c
/* service/svc_cli_register.c — 命令注册（与业务解耦） */
#include "svc_cli.h"
#include "cmd_handlers.h"

static const cli_cmd_t s_cmds[] = {
    {"test",         cmd_test,         "system selftest"},
    {"RTC Config",   cmd_rtc_config,   "set RTC time"},
    {"RTC now",      cmd_rtc_now,      "show RTC time"},
    {"conf",         cmd_conf,         "read config.ini"},
    {"ratio",        cmd_ratio,        "set ratio"},
    {"limit",        cmd_limit,        "set limit"},
    {"start",        cmd_start,        "start sampling"},
    {"stop",         cmd_stop,         "stop sampling"},
    {"hide",         cmd_hide,         "enable encode"},
    {"unhide",       cmd_unhide,       "disable encode"},
    {"config save",  cmd_config_save,  "save to flash"},
    {"config read",  cmd_config_read,  "read from flash"},
};
#define N_CMDS (sizeof(s_cmds)/sizeof(s_cmds[0]))

void cli_register_all(void) {
    svc_cli_init(s_cmds, N_CMDS);
}
```

---

## 3. 行缓冲（中断收 + 主循环消费）

```c
/* service/svc_cli.c */
#include "svc_cli.h"
#include "hal_uart.h"
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

#define CLI_LINE_MAX  128

static char     s_line[CLI_LINE_MAX];
static uint16_t s_line_idx = 0;
static volatile bool s_line_ready = false;

void svc_cli_feed(uint8_t c) {
    /* 在 UART RX 中断里调用，注意不要做重活 */
    if (s_line_ready) return;     /* 上一行还没消费完，丢弃（赛题不要求 backpressure）*/

    if (c == '\r' || c == '\n') {
        if (s_line_idx > 0) {
            s_line[s_line_idx] = '\0';
            s_line_ready = true;
        }
        s_line_idx = 0;
    } else if (s_line_idx < CLI_LINE_MAX - 1) {
        s_line[s_line_idx++] = (char)c;
    }
}
```

---

## 4. 最长前缀匹配（核心难点）

题目里有 `RTC Config` / `RTC now` / `config save` / `config read` 这种多词命令。如果按"按空格切第一段当命令名"，就会把 `RTC Config 2025-01-01` 切成命令 `RTC` + 参数 `Config 2025-01-01` → 错。

**正确做法**：按命令字符串**字面前缀**匹配，最长优先。

```c
/* service/svc_cli.c — 命令分发 */
static const cli_cmd_t *s_cmds_ptr;
static uint8_t           s_n_cmds;

void svc_cli_init(const cli_cmd_t *cmds, uint8_t n) {
    s_cmds_ptr = cmds;
    s_n_cmds = n;
}

/* 按命令名长度排序 — 让长命令优先匹配 */
/* 为了避免运行时 sort，注册时人工保证 "RTC Config" 排在 "RTC" 前面 */
/* 或者匹配时遍历所有命令找最长前缀匹配 */

static const cli_cmd_t* find_cmd(const char *line, int *match_len) {
    const cli_cmd_t *best = NULL;
    int best_len = 0;
    for (uint8_t i = 0; i < s_n_cmds; i++) {
        int len = (int)strlen(s_cmds_ptr[i].name);
        if (strncmp(line, s_cmds_ptr[i].name, len) == 0) {
            /* 后面要么是结束符要么是空格 */
            if (line[len] == '\0' || line[len] == ' ' || line[len] == '\t') {
                if (len > best_len) {
                    best_len = len;
                    best = &s_cmds_ptr[i];
                }
            }
        }
    }
    if (match_len) *match_len = best_len;
    return best;
}
```

### 4.1 测试用例（关键回归）

```
"RTC Config"              → 命中 cmd_rtc_config，arg=""
"RTC Config 2025-01-01"   → 命中 cmd_rtc_config，arg="2025-01-01"
"RTC now"                 → 命中 cmd_rtc_now
"config save"             → 命中 cmd_config_save
"config read"             → 命中 cmd_config_read
"ratio"                   → 命中 cmd_ratio
"start"                   → 命中 cmd_start
"stop"                    → 命中 cmd_stop
"unknown command"         → 找不到，返回 unknown
```

---

## 5. 参数分词

匹配到命令后，**剩下部分**作为参数串。简单按空格切：

```c
#define ARGV_MAX  8
static char *s_argv[ARGV_MAX];

static int tokenize(char *str, char **argv) {
    int argc = 0;
    while (*str && argc < ARGV_MAX) {
        while (*str == ' ' || *str == '\t') str++;
        if (!*str) break;
        argv[argc++] = str;
        while (*str && *str != ' ' && *str != '\t') str++;
        if (*str) *str++ = '\0';
    }
    return argc;
}
```

---

## 6. 状态机式交互命令（如 ratio / limit）

赛题 `ratio` 命令是两步：

```
Step 1: 用户输 "ratio"
        MCU 回：Ratio = 1.0
                Input value(0~100):
Step 2: 用户输 "10.5"（不是命令，是数）
        MCU 回：ratio modified success
                Ratio = 10.5
```

实现关键：**第二步的输入不能走命令分发**。

```c
typedef enum {
    CLI_STATE_NORMAL,
    CLI_STATE_WAIT_RATIO,
    CLI_STATE_WAIT_LIMIT,
    CLI_STATE_WAIT_RTC,
} cli_state_t;

static cli_state_t s_state = CLI_STATE_NORMAL;

void svc_cli_process(void) {
    if (!s_line_ready) return;

    /* 关键：先看状态机，不在 NORMAL 时直接当参数处理 */
    switch (s_state) {
        case CLI_STATE_WAIT_RATIO:  handle_wait_ratio();  break;
        case CLI_STATE_WAIT_LIMIT:  handle_wait_limit();  break;
        case CLI_STATE_WAIT_RTC:    handle_wait_rtc();    break;
        case CLI_STATE_NORMAL:
        default:                    dispatch_normal();    break;
    }

    s_line_ready = false;
}

static void dispatch_normal(void) {
    int match_len;
    const cli_cmd_t *cmd = find_cmd(s_line, &match_len);
    if (!cmd) {
        printf("unknown command: %s\n", s_line);
        return;
    }
    char *rest = s_line + match_len;
    while (*rest == ' ' || *rest == '\t') rest++;
    int argc = tokenize(rest, s_argv);
    cmd->handler(argc, s_argv);
}

/* —— 各命令处理 —— */
int cmd_ratio(int argc, char **argv) {
    if (argc > 0) {
        /* 单行模式：ratio 10.5 — 也支持，但赛题不要求 */
        return set_ratio(atof(argv[0]));
    }
    /* 两步模式 */
    printf("Ratio = %.1f\n", svc_config_get_ratio());
    printf("       Input value(0~100):\n");
    s_state = CLI_STATE_WAIT_RATIO;
    return 0;
}

static void handle_wait_ratio(void) {
    s_state = CLI_STATE_NORMAL;   /* 先恢复状态再处理，避免卡死 */
    float v = atof(s_line);
    if (v >= 0.0f && v <= 100.0f) {
        svc_config_set_ratio(v);
        printf("ratio modified success\n");
    } else {
        printf("ratio invalid\n");
    }
    printf("Ratio = %.1f\n", svc_config_get_ratio());
}
```

### 6.1 状态机超时保护（防赛场卡死）

```c
static uint32_t s_state_enter_ms = 0;
#define CLI_STATE_TIMEOUT_MS  10000

void svc_cli_process(void) {
    /* 状态超时回正常 */
    if (s_state != CLI_STATE_NORMAL &&
        hal_get_tick_ms() - s_state_enter_ms > CLI_STATE_TIMEOUT_MS) {
        printf("timeout, back to normal\n");
        s_state = CLI_STATE_NORMAL;
    }
    /* ... */
}
```

---

## 7. 输入有效性校验模板

```c
/* 浮点范围校验 */
static int parse_float_in_range(const char *s, float lo, float hi, float *out) {
    if (!s || !*s) return -1;
    char *endp;
    float v = strtof(s, &endp);
    if (endp == s) return -1;            /* 完全没数字 */
    if (*endp != '\0' && *endp != '\r' && *endp != '\n') return -1;  /* 尾随垃圾 */
    if (v < lo || v > hi) return -1;
    *out = v;
    return 0;
}

/* 整数同理 */
static int parse_int_in_range(const char *s, int lo, int hi, int *out) {
    /* ... 类似 ... */
}
```

---

## 8. 输出格式化（提高答辩"完成度"印象分）

```c
/* 标准输出格式 — 让评测员一眼看清结构 */
void cli_print_kv(const char *k, const char *v) {
    printf("%s: %s\n", k, v);
}

void cli_print_kv_float(const char *k, float v, int decimal) {
    printf("%s: %.*f\n", k, decimal, v);
}

void cli_print_block_start(const char *title) {
    printf("=====%s=====\n", title);
}

void cli_print_block_end(const char *title) {
    printf("=====%s=====\n", title);
}
```

使用：

```c
int cmd_test(int argc, char **argv) {
    cli_print_block_start("system selftest");
    cli_print_kv("flash", drv_flash_id_ok() ? "ok" : "error");
    cli_print_kv("TF card", drv_sd_mounted() ? "ok" : "error");
    /* ... */
    cli_print_block_end("system selftest");
    return 0;
}
```

---

## 9. 与日志系统联动

每条命令自动入日志，无需各 handler 自己写：

```c
void svc_cli_process(void) {
    if (!s_line_ready) return;

    /* 在 dispatch 前后各打一次日志 */
    svc_logger_log(">> %s", s_line);

    /* ... 分发 ... */
    int rc = dispatch_normal();
    svc_logger_log("<< rc=%d", rc);

    s_line_ready = false;
}
```

---

## 10. UART 中断接入

```c
/* drivers/drv_uart.c — UART RX ISR 里调 svc_cli_feed */
void USART1_IRQHandler(void) {
    if (USART_GetITStatus(USART1, USART_IT_RXNE) != RESET) {
        uint8_t c = (uint8_t)USART_ReceiveData(USART1);
        svc_cli_feed(c);
    }
}
```

主循环：

```c
while (1) {
    svc_cli_process();        /* 处理一行命令 */
    svc_sampler_process();    /* 处理采样 */
    /* ... */
    iwdg_feed();              /* 喂狗 */
}
```

---

## 11. 完整最小实现（拷贝即用）

下面是一个 ≤ 250 行的完整最小 CLI（不含日志钩子，便于第一次跑通）：

```c
/* svc_cli_minimal.c */
#include "svc_cli.h"
#include "hal_uart.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#define CLI_LINE_MAX  128
#define ARGV_MAX      8

static const cli_cmd_t *s_cmds_ptr;
static uint8_t           s_n_cmds;

static char     s_line[CLI_LINE_MAX];
static uint16_t s_line_idx = 0;
static volatile bool s_line_ready = false;

typedef enum {
    CLI_NORMAL,
    CLI_WAIT_RATIO,
    CLI_WAIT_LIMIT,
    CLI_WAIT_RTC,
} cli_state_t;
static cli_state_t s_state = CLI_NORMAL;

void svc_cli_init(const cli_cmd_t *cmds, uint8_t n) {
    s_cmds_ptr = cmds;
    s_n_cmds = n;
    s_line_idx = 0;
    s_line_ready = false;
    s_state = CLI_NORMAL;
}

void svc_cli_feed(uint8_t c) {
    if (s_line_ready) return;
    if (c == '\r' || c == '\n') {
        if (s_line_idx > 0) {
            s_line[s_line_idx] = '\0';
            s_line_ready = true;
        }
        s_line_idx = 0;
    } else if (s_line_idx < CLI_LINE_MAX - 1) {
        s_line[s_line_idx++] = (char)c;
    }
}

static const cli_cmd_t* find_cmd(const char *line, int *match_len) {
    const cli_cmd_t *best = NULL;
    int best_len = 0;
    for (uint8_t i = 0; i < s_n_cmds; i++) {
        int len = (int)strlen(s_cmds_ptr[i].name);
        if (strncmp(line, s_cmds_ptr[i].name, len) == 0) {
            if (line[len] == '\0' || line[len] == ' ' || line[len] == '\t') {
                if (len > best_len) { best_len = len; best = &s_cmds_ptr[i]; }
            }
        }
    }
    if (match_len) *match_len = best_len;
    return best;
}

static int tokenize(char *str, char **argv) {
    int argc = 0;
    while (*str && argc < ARGV_MAX) {
        while (*str == ' ' || *str == '\t') str++;
        if (!*str) break;
        argv[argc++] = str;
        while (*str && *str != ' ' && *str != '\t') str++;
        if (*str) *str++ = '\0';
    }
    return argc;
}

void svc_cli_process(void) {
    if (!s_line_ready) return;

    /* TODO: 状态机分发（WAIT_RATIO 等）由业务模块外挂 */

    int match_len;
    const cli_cmd_t *cmd = find_cmd(s_line, &match_len);
    if (!cmd) {
        printf("unknown command\n");
    } else {
        char *rest = s_line + match_len;
        while (*rest == ' ' || *rest == '\t') rest++;
        char *argv[ARGV_MAX];
        int argc = tokenize(rest, argv);
        cmd->handler(argc, argv);
    }

    s_line_ready = false;
}
```

---

## 12. 常见坑（按出现频率排序）

| # | 坑 | 表现 | 修复 |
|---|---|---|---|
| 1 | 多词命令按空格切 → 切错 | `RTC Config` 被切成 `RTC` + `Config` | 用本框架的"最长前缀匹配" |
| 2 | 中断里 printf | 系统卡死 / 数据丢失 | 中断只做 feed，处理放主循环 |
| 3 | 状态机没超时 | 用户输错一次卡死 | 加 10s 超时回 NORMAL |
| 4 | 行缓冲溢出 | 长命令导致越界 | `if (idx < MAX-1)` 限制 |
| 5 | `\r\n` 处理不当 | 多收一行空命令 | 把 `\r` 和 `\n` 都视为行终止 |
| 6 | 浮点解析 strtof 不严谨 | `"123abc"` 解析为 123 | 检查 `*endp` 必须是终止符 |
| 7 | 命令名大小写不一致 | `Test` vs `test` | 决定一种风格，全表统一 |
| 8 | 单行模式与两步模式冲突 | `ratio 10.5` 怎么处理 | 检查 argc > 0 走单行，否则走两步 |

---

## 13. 测试清单

写完后必跑：

```
□ "test" → 看到系统自检输出
□ "RTC Config" → 提示输时间；然后输 "2025-01-01 12:00:30" → 设置成功
□ "RTC Config 2025-01-01 12:00:30" → 单行模式也支持（可选）
□ "RTC now" → 显示当前时间
□ "ratio" → 提示输值；输 10.5 → 成功；输 -1 → 无效
□ "ratio" → 提示输值；输 abc → 无效
□ "limit" → 同 ratio
□ "start" → 启动；"stop" → 停止
□ "config save" → 存 Flash
□ "config read" → 读 Flash
□ "abc" → unknown command
□ "RTC" → unknown（无尾部）
□ 状态机超时：在 WAIT_RATIO 状态等 11 秒 → 自动回 NORMAL
```

---

## 14. 关联资源

- **集成框架**：`.auto-embedded/modes/industrial-data-acquisition.md` 子系统 3
- **完整端到端示例**：`.auto-embedded/refs/example-siemens-cimc-2025.md`
- **letter-shell（更强大的现成库）**：`.auto-embedded/refs/embed-libs-index.md` §2.4
- **arch-check 静态检查**：`scripts/arch-check.sh`（确保 svc_cli.c 不 include 厂商头）
