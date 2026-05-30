#!/bin/sh
# arch-check 回归 / parity 自测：
#   1) 构造覆盖 ARCH-1~8 的临时夹具
#   2) 跑 arch-check.sh --all，断言 exit=1 且命中全部 11 条
#   3) 若有 pwsh，再跑 arch-check.ps1 --all，断言与 .sh 违规集合一致（去 CR 后排序逐字节相同；行序差异属预期）
#   4) 空净目录两者均 exit=0
# 用法：scripts/test-arch-check.sh   （不联网、不烧 token，node/pwsh 可选）
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SH="$SCRIPT_DIR/arch-check.sh"
PS="$SCRIPT_DIR/arch-check.ps1"
FAIL=0

FIX=$(mktemp -d 2>/dev/null || echo "/tmp/archfix.$$")
trap 'rm -rf "$FIX"' EXIT

mkdir -p "$FIX/app" "$FIX/clean"

# ARCH-2：main.c 7 个顶层调用 > 6
cat > "$FIX/app/main.c" <<'EOF'
int main(void) {
    a();
    b();
    c();
    d();
    e();
    f();
    g();
    return 0;
}
EOF
# ARCH-1 + ARCH-1C
cat > "$FIX/app/bad.c" <<'EOF'
#include "stm32f4xx.h"
void foo(void) {
    *(volatile unsigned int *)0x40021000 = 1;
}
EOF
# ARCH-1B
printf '#include "globals.h"\nvoid bar(void) {}\n' > "$FIX/app/cab.c"
# ARCH-4
printf 'extern int g_counter;\n' > "$FIX/app/ext.h"
# ARCH-7B
printf '#include "mega.h"\nvoid baz(void) {}\n' > "$FIX/app/usesmega.c"
# ARCH-3：ISR 函数体 > 20 行
{ echo 'void TIM2_IRQHandler(void) {'; i=1; while [ "$i" -le 21 ]; do echo "    int a$i = $i;"; i=$((i+1)); done; echo '}'; } > "$FIX/app/isr.c"
# ARCH-5：.c > 800 行
i=1; while [ "$i" -le 801 ]; do echo "int v$i;"; i=$((i+1)); done > "$FIX/big.c"
# ARCH-6：.h 公共 API > 20
i=1; while [ "$i" -le 21 ]; do echo "int func$i(void);"; i=$((i+1)); done > "$FIX/api.h"
# ARCH-7：mega-header >=10 个 #include（非 vendor）
for h in stdio stdlib string math time stdint stdbool stddef errno assert; do echo "#include <$h.h>"; done > "$FIX/mega.h"
# ARCH-8：hw_lock 重复 pin
cat > "$FIX/硬件资源表.md" <<'EOF'
# 硬件资源表

```yaml
hw_lock:
  pins:
    - {id: PA0, owner: led}
    - {id: PA0, owner: key}
  dma:
    - {stream: DMA1_S0, owner: uart}
  irq:
    - {irqn: TIM2_IRQn, priority_preempt: 1, priority_sub: 0}
  timers:
    - {id: TIM2, owner: pwm}
```
EOF

# Vendor 目录夹具：以下三者都应被两脚本"跳过"，不进违规清单（违规总数应仍为 11）。
# 这是 vendor-skip 的判别性用例：若 Test-VendorPath / is_vendor_path 有偏差，count 会变成 12+ 或 .sh≠.ps1。
mkdir -p "$FIX/Drivers" "$FIX/libraries"
# ARCH-5 判别：vendor 下超长 .c，不应报
i=1; while [ "$i" -le 801 ]; do echo "int dv$i;"; i=$((i+1)); done > "$FIX/Drivers/hal_big.c"
# ARCH-2 判别：vendor 下 cpu0_main 含 7 个顶层调用，不应报
{ echo 'void cpu0_main(void) {'; for x in p q r s t u v; do echo "    $x();"; done; echo '    return 0;'; echo '}'; } > "$FIX/Drivers/cpu0_main.c"
# ARCH-7 判别：vendor 下 mega-header（>=10 includes）应为 HINT(stderr) 而非违规(stdout)
for h in a b c d e f g h i j k; do echo "#include <lib_$h.h>"; done > "$FIX/libraries/mega_vendor.h"

# parity 判据说明：.sh 用 find、.ps1 用 Get-ChildItem，文件枚举顺序可能不同，
# 故以"去 CR 后排序的违规集合逐字节相同"为权威判据（而非行序相同）。
norm() { tr -d '\r' < "$1" | LC_ALL=C sort; }

echo "=== [1] arch-check.sh --all ==="
( cd "$FIX" && bash "$SH" --all ) > "$FIX/out_sh.txt" 2>/dev/null
SH_RC=$?
SH_N=$(grep -c . "$FIX/out_sh.txt")
echo "exit=$SH_RC violations=$SH_N (期望 exit=1 violations=11)"
[ "$SH_RC" -eq 1 ] && [ "$SH_N" -eq 11 ] || { echo "  ✗ .sh 基准不符预期"; FAIL=1; }

if command -v pwsh >/dev/null 2>&1; then
    echo "=== [2] arch-check.ps1 --all + parity diff ==="
    ( cd "$FIX" && pwsh -NoProfile -File "$PS" --all ) > "$FIX/out_ps.txt" 2>/dev/null
    PS_RC=$?
    PS_N=$(tr -d '\r' < "$FIX/out_ps.txt" | grep -c .)
    echo "exit=$PS_RC violations=$PS_N"
    if [ "$PS_RC" -eq 1 ] && [ "$PS_N" -eq 11 ] && diff <(norm "$FIX/out_sh.txt") <(norm "$FIX/out_ps.txt") >/dev/null; then
        echo "  ✓ 违规集合一致 + exit/count 一致 (PARITY OK)"
        # 信息性：未排序行序是否也恰好一致（不作为失败判据，因枚举顺序 OS 相关）
        if diff <(tr -d '\r' < "$FIX/out_sh.txt") <(tr -d '\r' < "$FIX/out_ps.txt") >/dev/null; then
            echo "  · (附注) 未排序行序也完全一致"
        else
            echo "  · (附注) 行序略有差异（find vs Get-ChildItem 枚举顺序不同，属预期，不影响门禁判定）"
        fi
    else
        echo "  ✗ .ps1 与 .sh 不一致:"; diff <(norm "$FIX/out_sh.txt") <(norm "$FIX/out_ps.txt"); FAIL=1
    fi
else
    echo "=== [2] 跳过 .ps1 parity（未检测到 pwsh）==="
fi

echo "=== [3] 空净目录应 exit=0 ==="
( cd "$FIX/clean" && bash "$SH" --all ) >/dev/null 2>&1
CRC=$?
echo "  sh clean exit=$CRC (期望0)"; [ "$CRC" -eq 0 ] || FAIL=1
if command -v pwsh >/dev/null 2>&1; then
    ( cd "$FIX/clean" && pwsh -NoProfile -File "$PS" --all ) >/dev/null 2>&1
    PCRC=$?
    echo "  ps clean exit=$PCRC (期望0)"; [ "$PCRC" -eq 0 ] || FAIL=1
fi

echo
if [ "$FAIL" -eq 0 ]; then echo "==> ALL PASS"; exit 0; else echo "==> FAIL"; exit 1; fi
