#!/usr/bin/env bash
# embedded-dev arch-check: 全工程层级合规扫描
#
# 用法：在工程根目录运行 ./scripts/arch-check.sh
#
# 检查项（任一失败即 exit != 0）：
#   ARCH-1: 应用层 (app/) 不得 #include 厂商 HAL 头
#   ARCH-2: main.c 顶层函数调用 ≤ 6
#   ARCH-3: ISR / 回调函数体 ≤ 20 行
#   ARCH-4: 应用层 extern 变量数 = 0（extern 函数声明排除）
#   ARCH-5: 单 .c 文件 ≤ 800 行
#   ARCH-6: 单 .h 公共 API（函数声明）≤ 20
#   ARCH-7: mega-header（项目级 catch-all .h，含 ≥ 10 个 #include）
#
# 输出协议：
#   - stderr：进度（>>> [N/7] ...）和最终汇总
#   - stdout：每行一个违规，格式 [ARCH-N] file:line - reason
#   - exit code：0 = stdout 为空（全通过），1 = stdout 有内容

set -u

# ===== 配置 =====
APP_LAYER_DIRS=(app application project/code/app src/app code/app)
VENDOR_DIRS=(libraries sdk vendor third_party Drivers Middlewares)
# 厂商头：STM32 / GD32 / ESP-IDF / TI MSPM0 / Nordic / Infineon TC2xx (Ifx*.h / ifx*_reg.h / SysSe/*)
VENDOR_HEADERS_RE='#[[:space:]]*include[[:space:]]+[<"](stm32[a-z0-9_]*\.h|gd32[a-z0-9_]*\.h|esp_system\.h|ti_msp_dl_config\.h|nrf[a-z0-9_]*\.h|nrfx[a-z0-9_]*\.h|Ifx[A-Za-z0-9_]+\.h|ifx[a-z0-9_]+_reg\.h|SysSe/[^>"]+|Bsp\.h)[>"]'
# Catch-all mega-header（Seekfree 风格统一头文件，间接拉入厂商头 → 等同违规）
CATCH_ALL_HEADERS_RE='#[[:space:]]*include[[:space:]]+[<"]([a-z_]*_?common_?headfile\.h|[a-z_]*_headfile\.h|headfile\.h|all\.h|globals\.h|project\.h)[>"]'
MAIN_C_MAX_CALLS=6
ISR_BODY_MAX=20
C_FILE_MAX_LINES=800
H_API_MAX=20
MEGA_HEADER_INCLUDE_THRESHOLD=10

# ===== 工具函数 =====
is_vendor_path() {
    local p="$1"
    for d in "${VENDOR_DIRS[@]}"; do
        case "$p" in
            *"/$d/"*|"$d/"*|"./$d/"*) return 0 ;;
        esac
    done
    return 1
}

# ===== 检查 1: 应用层 include 厂商头 / catch-all mega-header =====
check_app_vendor_includes() {
    echo ">>> [1/7] app layer vendor / catch-all includes" >&2
    for d in "${APP_LAYER_DIRS[@]}"; do
        [ -d "$d" ] || continue
        # 1a: 直接 include 厂商头
        grep -rnE "$VENDOR_HEADERS_RE" "$d" \
            --include="*.c" --include="*.h" 2>/dev/null | \
            awk -F: '{
                file=$1; line=$2;
                $1=""; $2=""; rest=$0; sub(/^::/,"",rest); sub(/^[ \t]+/,"",rest);
                printf "[ARCH-1] %s:%s - 应用层 include 厂商头: %s\n", file, line, rest
            }'
        # 1b: 间接：catch-all mega-header（zf_common_headfile.h 等）
        grep -rnE "$CATCH_ALL_HEADERS_RE" "$d" \
            --include="*.c" --include="*.h" 2>/dev/null | \
            awk -F: '{
                file=$1; line=$2;
                $1=""; $2=""; rest=$0; sub(/^::/,"",rest); sub(/^[ \t]+/,"",rest);
                printf "[ARCH-1B] %s:%s - 应用层 include catch-all mega-header（间接拉入厂商头）: %s\n", file, line, rest
            }'
    done
}

# ===== 检查 2: main.c 顶层调用数 =====
# 兼容多种嵌入式入口命名：
#   - 单核：main / app_main / firmware_main
#   - TC264 双核：core0_main / core1_main / cpu0_main / cpu1_main
#   - RTOS：Main_Task / vMainTask
check_main_c_calls() {
    echo ">>> [2/7] main.c-like top-level call count" >&2
    find . -type f \( \
        -name "main.c" -o \
        -name "cpu[0-9]_main.c" -o \
        -name "core[0-9]_main.c" -o \
        -name "*_main.c" -o \
        -name "firmware*.c" \
    \) 2>/dev/null | while IFS= read -r mainc; do
        if is_vendor_path "$mainc"; then continue; fi
        awk -v F="$mainc" -v MAX="$MAIN_C_MAX_CALLS" '
            BEGIN { in_main=0; depth=0; calls=0; start=0 }
            /(^|[ \t])(int|void)[ \t]+(main|core[0-9]+_main|cpu[0-9]+_main|Main_Task|vMainTask|app_main|firmware_main|core_main)[ \t]*\(/ {
                if (!in_main) { in_main=1; start=NR; depth=0; main_name=$0; sub(/.*[ \t]/,"",main_name); sub(/\(.*/,"",main_name) }
            }
            in_main {
                line=$0
                sub(/\/\/.*$/, "", line)
                gsub(/"[^"]*"/, "\"\"", line)
                # 跟踪 { } 深度，同时在 depth==1 状态下扫描顶层语句
                for (i=1; i<=length(line); i++) {
                    c = substr(line,i,1)
                    if (c == "{") {
                        depth++
                        next_top = (depth == 1)
                    } else if (c == "}") {
                        depth--
                        if (depth == 0) {
                            if (calls > MAX) {
                                printf "[ARCH-2] %s:%d - %s() 顶层调用 = %d，超过 %d\n", F, start, main_name, calls, MAX
                            }
                            in_main=0
                            break
                        }
                    }
                }
                # 在 depth==1 时统计顶层调用（以分号分隔）
                if (depth == 1) {
                    # 取出在 depth==1 范围内的字符（粗略：整行 if depth 跨界则不精确）
                    n = split(line, parts, ";")
                    for (k=1; k<=n; k++) {
                        s = parts[k]
                        gsub(/^[ \t{}]+|[ \t]+$/, "", s)
                        if (s == "") continue
                        if (match(s, /^([a-zA-Z_][a-zA-Z0-9_]*)[ \t]*\(/)) {
                            name = substr(s, RSTART, RLENGTH)
                            sub(/[ \t]*\($/,"", name)
                            if (name != "if" && name != "while" && name != "for" && \
                                name != "switch" && name != "return" && name != "sizeof" && \
                                name != "do" && name != "else") {
                                calls++
                            }
                        }
                    }
                }
            }
        ' "$mainc"
    done
}

# ===== 检查 3: ISR / 回调函数体行数 =====
check_isr_body_length() {
    echo ">>> [3/7] ISR / callback body length" >&2
    find . -type f -name "*.c" 2>/dev/null | while IFS= read -r cf; do
        if is_vendor_path "$cf"; then continue; fi
        awk -v MAX="$ISR_BODY_MAX" -v F="$cf" '
            /^[ \t]*(static[ \t]+)?(inline[ \t]+)?void[ \t]+[A-Za-z0-9_]+(_IRQHandler|_Handler|_Callback|_callback|Cb)[ \t]*\([^)]*\)[ \t]*\{/ {
                isr_name=$0
                sub(/^[ \t]*/,"",isr_name)
                sub(/\(.*$/,"",isr_name)
                sub(/^.*[ \t]/,"",isr_name)
                isr_start=NR
                in_isr=1
                depth=1
                body_lines=0
                next
            }
            in_isr {
                line=$0
                sub(/[ \t]+$/,"",line)
                if (line != "" && line !~ /^[ \t]*\/\// && line !~ /^[ \t]*\*/ && line !~ /^[ \t]*\/\*/) {
                    body_lines++
                }
                for (i=1; i<=length($0); i++) {
                    c=substr($0,i,1)
                    if (c=="{") depth++
                    else if (c=="}") {
                        depth--
                        if (depth==0) {
                            if (body_lines > MAX) {
                                printf "[ARCH-3] %s:%d - ISR/callback `%s` 函数体 %d 行 > %d\n", F, isr_start, isr_name, body_lines, MAX
                            }
                            in_isr=0
                            break
                        }
                    }
                }
            }
        ' "$cf"
    done
}

# ===== 检查 4: 应用层 extern 变量 =====
check_app_extern() {
    echo ">>> [4/7] app layer extern variables" >&2
    for d in "${APP_LAYER_DIRS[@]}"; do
        [ -d "$d" ] || continue
        grep -rnE '^[[:space:]]*extern[[:space:]]+(const[[:space:]]+|volatile[[:space:]]+)?[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*(\[[^]]*\])?[[:space:]]*;' \
            "$d" --include="*.c" --include="*.h" 2>/dev/null | grep -v '(' | \
            awk -F: '{
                file=$1; line=$2;
                $1=""; $2=""; rest=$0; sub(/^::/,"",rest); sub(/^[ \t]+/,"",rest);
                printf "[ARCH-4] %s:%s - 应用层 extern 变量: %s\n", file, line, rest
            }'
    done
}

# ===== 检查 5: 单 .c 文件行数 =====
check_c_file_length() {
    echo ">>> [5/7] .c file length" >&2
    find . -type f -name "*.c" 2>/dev/null | while IFS= read -r cf; do
        if is_vendor_path "$cf"; then continue; fi
        lc=$(wc -l < "$cf" 2>/dev/null | tr -d '[:space:]')
        [ -z "$lc" ] && continue
        if [ "$lc" -gt "$C_FILE_MAX_LINES" ]; then
            printf "[ARCH-5] %s:%d - .c 文件 %d 行 > %d\n" "$cf" "$lc" "$lc" "$C_FILE_MAX_LINES"
        fi
    done
}

# ===== 检查 6: 单 .h 公共 API 数量 =====
check_h_api_count() {
    echo ">>> [6/7] .h public API count" >&2
    find . -type f -name "*.h" 2>/dev/null | while IFS= read -r hf; do
        if is_vendor_path "$hf"; then continue; fi
        api=$(grep -cE '^[a-zA-Z_][a-zA-Z0-9_*[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*\([^)]*\)[[:space:]]*;' "$hf" 2>/dev/null)
        [ -z "$api" ] && continue
        if [ "$api" -gt "$H_API_MAX" ]; then
            printf "[ARCH-6] %s:1 - .h 公共 API %d 个 > %d\n" "$hf" "$api" "$H_API_MAX"
        fi
    done
}

# ===== 检查 7: mega-header 检测（全局扫，含 libraries/） =====
# 检测两类：
#   ARCH-7:  任何位置的 mega-header（仅警告，作为代码异味提示）
#   ARCH-7B: app 层 include 了 mega-header（严重违规，间接拉入大量底层）
check_mega_header() {
    echo ">>> [7/7] mega-header detection (global)" >&2

    # 收集所有 mega-header 的文件名（basename），用于后续交叉检查
    local mega_list_file
    mega_list_file=$(mktemp 2>/dev/null || echo "/tmp/_mega.$$.tmp")
    : > "$mega_list_file"

    # 全局扫描（含 libraries/，但跳过 SDK 配置头白名单）
    find . -type f -name "*.h" 2>/dev/null | while IFS= read -r hf; do
        case "$hf" in
            */ti_msp_dl_config.h|*/stm32*_conf.h|*/gd32*_conf.h) continue ;;
        esac
        inc_count=$(grep -cE '^[[:space:]]*#[[:space:]]*include' "$hf" 2>/dev/null)
        [ -z "$inc_count" ] && continue
        if [ "$inc_count" -ge "$MEGA_HEADER_INCLUDE_THRESHOLD" ]; then
            # libraries 内的 mega-header 仅作为 hint，不计入违规计数
            if is_vendor_path "$hf"; then
                printf "[HINT-7] %s:1 - mega-header 含 %d 个 #include（libraries/ 内，仅提示）\n" "$hf" "$inc_count" >&2
                # 记录 basename 供 ARCH-7B 使用
                basename "$hf" >> "$mega_list_file"
            else
                printf "[ARCH-7] %s:1 - mega-header 含 %d 个 #include（阈值 %d）\n" "$hf" "$inc_count" "$MEGA_HEADER_INCLUDE_THRESHOLD"
                basename "$hf" >> "$mega_list_file"
            fi
        fi
    done

    # ARCH-7B: 检查 app 层是否 include 了任何 mega-header
    if [ -s "$mega_list_file" ]; then
        for d in "${APP_LAYER_DIRS[@]}"; do
            [ -d "$d" ] || continue
            while IFS= read -r mega_name; do
                [ -z "$mega_name" ] && continue
                # grep 转义点号
                esc=$(printf '%s' "$mega_name" | sed 's/\./\\./g')
                grep -rnE "#[[:space:]]*include[[:space:]]+[<\"]${esc}[>\"]" "$d" \
                    --include="*.c" --include="*.h" 2>/dev/null | \
                    awk -F: -v MEGA="$mega_name" '{
                        file=$1; line=$2;
                        printf "[ARCH-7B] %s:%s - app 层 include mega-header `%s`（违规）\n", file, line, MEGA
                    }'
            done < "$mega_list_file"
        done
    fi

    rm -f "$mega_list_file" 2>/dev/null
}

# ===== 执行 =====
echo "==> embedded-dev arch-check (project root: $(pwd))" >&2
echo "" >&2

# 把所有违规输出汇总到临时文件，然后计数
TMPOUT="$(mktemp 2>/dev/null || echo "/tmp/arch-check.$$.tmp")"
trap 'rm -f "$TMPOUT"' EXIT

{
    check_app_vendor_includes
    check_main_c_calls
    check_isr_body_length
    check_app_extern
    check_c_file_length
    check_h_api_count
    check_mega_header
} > "$TMPOUT"

# 同时把违规写到 stdout 给调用方
cat "$TMPOUT"

violations=$(wc -l < "$TMPOUT" | tr -d '[:space:]')
echo "" >&2
if [ -z "$violations" ] || [ "$violations" -eq 0 ]; then
    echo "==> PASS: 0 violations" >&2
    exit 0
else
    echo "==> FAIL: $violations violations" >&2
    exit 1
fi
