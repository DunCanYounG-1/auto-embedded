#!/usr/bin/env bash
# embedded-dev arch-check: 全工程层级合规扫描
#
# 用法：
#   ./scripts/arch-check.sh             # 默认：跑 ARCH-1~7 层级检查
#   ./scripts/arch-check.sh --hw-check  # 仅跑 ARCH-8 硬件资源冲突检测
#   ./scripts/arch-check.sh --all       # 全部
#
# 检查项（任一失败即 exit != 0）：
#   ARCH-1: 应用层 (app/) 不得 #include 厂商 HAL 头
#   ARCH-1C: 应用层不得直接裸访问寄存器地址（volatile 强转 hex MMIO，应封装到 HAL/BSP）
#   ARCH-2: main.c 顶层函数调用 ≤ 6
#   ARCH-3: ISR / 回调函数体 ≤ 20 行
#   ARCH-4: 应用层 extern 变量数 = 0（extern 函数声明排除）
#   ARCH-5: 单 .c 文件 ≤ 800 行
#   ARCH-6: 单 .h 公共 API（函数声明）≤ 20
#   ARCH-7: mega-header（项目级 catch-all .h，含 ≥ 10 个 #include）
#   ARCH-8: 硬件资源表 hw_lock 块冲突检测（pin/dma/irq 重复、owner 不存在等）
#
# 输出协议：
#   - stderr：进度（>>> [N/M] ...）和最终汇总
#   - stdout：每行一个违规，格式 [ARCH-N] file:line - reason
#   - exit code：0 = stdout 为空（全通过），1 = stdout 有内容

set -u

# ===== 参数解析 =====
RUN_ARCH=1
RUN_HW=1
if [ "${1:-}" = "--hw-check" ]; then
    RUN_ARCH=0
    RUN_HW=1
elif [ "${1:-}" = "--all" ]; then
    RUN_ARCH=1
    RUN_HW=1
elif [ "${1:-}" = "--no-hw" ]; then
    RUN_ARCH=1
    RUN_HW=0
fi

# ===== 配置 =====
APP_LAYER_DIRS=(app application project/code/app src/app code/app)
VENDOR_DIRS=(libraries sdk vendor third_party Drivers Middlewares)
# 厂商头：STM32 / GD32 / ESP-IDF / TI MSPM0 / Nordic / Infineon TC2xx / Dialog
VENDOR_HEADERS_RE='#[[:space:]]*include[[:space:]]+[<"](stm32[a-z0-9_]*\.h|gd32[a-z0-9_]*\.h|esp_system\.h|esp_[a-z0-9_]+\.h|driver/gpio\.h|ti_msp_dl_config\.h|nrf[a-z0-9_]*\.h|nrfx[a-z0-9_]*\.h|Ifx[A-Za-z0-9_]+\.h|ifx[a-z0-9_]+_reg\.h|SysSe/[^>"]+|Bsp\.h|DA[A-Z0-9]+\.h|hal/nrf_[a-z0-9_]+\.h)[>"]'
# Catch-all mega-header（Seekfree 风格统一头文件，间接拉入厂商头 → 等同违规）
CATCH_ALL_HEADERS_RE='#[[:space:]]*include[[:space:]]+[<"]([a-z_]*_?common_?headfile\.h|[a-z_]*_headfile\.h|headfile\.h|all\.h|globals\.h|project\.h)[>"]'
# 逐飞开源库标准 mega-header — 白名单放行（与 pre-write-check.py 同步）
CATCH_ALL_WHITELIST_RE='zf_common_headfile\.h'
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
        # 1b: 间接：catch-all mega-header（zf_common_headfile.h 等），白名单排除
        grep -rnE "$CATCH_ALL_HEADERS_RE" "$d" \
            --include="*.c" --include="*.h" 2>/dev/null | \
            grep -vE "$CATCH_ALL_WHITELIST_RE" | \
            awk -F: '{
                file=$1; line=$2;
                $1=""; $2=""; rest=$0; sub(/^::/,"",rest); sub(/^[ \t]+/,"",rest);
                printf "[ARCH-1B] %s:%s - 应用层 include catch-all mega-header（间接拉入厂商头）: %s\n", file, line, rest
            }'
        # 1c: 应用层裸寄存器访问（volatile 强转 hex 地址，绕过 #include 也算违规，应封装到 HAL/BSP）
        grep -rnE '\*[[:space:]]*\([[:space:]]*volatile[[:space:]][^)]*\*[[:space:]]*\)[[:space:]]*0[xX][0-9A-Fa-f]+' "$d" \
            --include="*.c" --include="*.h" 2>/dev/null | \
            awk -F: '{
                file=$1; line=$2;
                $1=""; $2=""; rest=$0; sub(/^::/,"",rest); sub(/^[ \t]+/,"",rest);
                printf "[ARCH-1C] %s:%s - 应用层直接访问寄存器地址（裸 MMIO，应封装到 HAL/BSP 层）: %s\n", file, line, rest
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
                # 白名单放行
                echo "$mega_name" | grep -qE "$CATCH_ALL_WHITELIST_RE" && continue
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

# ===== 检查 8: 硬件资源表 hw_lock 块冲突检测（ARCH-8）=====
check_hw_lock() {
    echo ">>> [8/8] hw_lock conflict detection (硬件资源表.md)" >&2

    # 找硬件资源表（中文名优先，英文 fallback）
    local hw_file=""
    for candidate in "硬件资源表.md" "hw-resources.md"; do
        if [ -f "$candidate" ]; then
            hw_file="$candidate"
            break
        fi
    done
    if [ -z "$hw_file" ]; then
        echo "[HINT-8] 未找到 硬件资源表.md / hw-resources.md，跳过 hw_lock 检测" >&2
        return 0
    fi

    # 提取 hw_lock 块（```yaml ... ``` 之间，含 'hw_lock:' 行的那段）
    local yaml_block
    yaml_block=$(awk '
        /^```yaml[[:space:]]*$/ { in_block=1; next }
        /^```[[:space:]]*$/      { if (in_block) { in_block=0; if (has_hw) exit } }
        in_block {
            if (/^hw_lock:/) has_hw=1
            if (has_hw) print
        }
    ' "$hw_file")

    if [ -z "$yaml_block" ]; then
        printf "[ARCH-8] %s:1 - 未找到 hw_lock YAML 块（机器可读资源锁定区缺失）\n" "$hw_file"
        return 0
    fi

    # 写到临时文件供 Python / 多次 awk 用
    local hw_yaml
    hw_yaml=$(mktemp 2>/dev/null || echo "/tmp/hw_yaml.$$.tmp")
    printf '%s\n' "$yaml_block" > "$hw_yaml"

    # ---- 统一冲突检测（同时兼容 inline flow `- {id: PA0}` 与 block-style 多行 `- id: PA0`）----
    # 逐 item 累积字段（item 边界 = 以 `-` 开头的列表行），字段用词边界锚定提取，
    # 在 item 切换 / section 切换 / EOF 时结算，对两种 YAML 写法都成立。
    awk '
        function getval(line, key,   m, re) {
            re = "(^|[^A-Za-z0-9_])" key ":[ \t]*[A-Za-z0-9_]+"
            if (match(line, re)) {
                m = substr(line, RSTART, RLENGTH)
                sub(".*" key ":[ \t]*", "", m)
                return m
            }
            return ""
        }
        function flush(   k) {
            if (!have) return
            if (section=="pins"   && cid!="")    { pin[cid]++;    if (pin[cid]>1)    print "pins: pin " cid " 重复" }
            if (section=="dma"    && cstream!="") { dm[cstream]++; if (dm[cstream]>1) print "dma: stream " cstream " 重复" }
            if (section=="irq") {
                if (cirqn!="") { iq[cirqn]++; if (iq[cirqn]>1) print "irq: irqn " cirqn " 重复" }
                if (cpp!="" && cps!="") { k=cpp"_"cps; pr[k]++; if (pr[k]>1) print "irq: priority " cpp "/" cps " 重复（" cirqn " 与之前条目同优先级）" }
            }
            if (section=="timers" && cid!="")    { tm[cid]++;     if (tm[cid]>1)     print "timers: id " cid " 重复" }
            cid=""; cstream=""; cirqn=""; cpp=""; cps=""; have=0
        }
        /^[ \t]*pins:[ \t]*$/   { flush(); section="pins";   next }
        /^[ \t]*dma:[ \t]*$/    { flush(); section="dma";    next }
        /^[ \t]*irq:[ \t]*$/    { flush(); section="irq";    next }
        /^[ \t]*timers:[ \t]*$/ { flush(); section="timers"; next }
        section != "" {
            if ($0 ~ /^[ \t]*-/) { flush(); have=1 }   # 新 item 起始（inline 与 block 都以 `-` 开头）
            v=getval($0,"id");               if (v!="") cid=v
            v=getval($0,"stream");           if (v!="") cstream=v
            v=getval($0,"irqn");             if (v!="") cirqn=v
            v=getval($0,"priority_preempt"); if (v!="") cpp=v
            v=getval($0,"priority_sub");     if (v!="") cps=v
        }
        END { flush() }
    ' "$hw_yaml" | while IFS= read -r dup; do
        [ -z "$dup" ] && continue
        printf "[ARCH-8] %s:1 - hw_lock.%s\n" "$hw_file" "$dup"
    done

    rm -f "$hw_yaml" 2>/dev/null
}

# ===== 执行 =====
echo "==> embedded-dev arch-check (project root: $(pwd))" >&2
echo "" >&2

# 把所有违规输出汇总到临时文件，然后计数
TMPOUT="$(mktemp 2>/dev/null || echo "/tmp/arch-check.$$.tmp")"
trap 'rm -f "$TMPOUT"' EXIT

{
    if [ "$RUN_ARCH" = "1" ]; then
        check_app_vendor_includes
        check_main_c_calls
        check_isr_body_length
        check_app_extern
        check_c_file_length
        check_h_api_count
        check_mega_header
    fi
    if [ "$RUN_HW" = "1" ]; then
        check_hw_lock
    fi
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
