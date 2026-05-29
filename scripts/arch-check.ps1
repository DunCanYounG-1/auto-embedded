#!/usr/bin/env pwsh
# embedded-dev arch-check (PowerShell 版) —— 与 scripts/arch-check.sh 行为对齐
#
# 存在意义：纯 PowerShell 环境（无 POSIX 工具）下也能跑分层架构门禁，
#           让 REVIEW/CP 门禁不依赖会话内"自觉"。git pre-commit 钩子在无 bash 时回退到本脚本。
#
# 用法：
#   pwsh -File scripts/arch-check.ps1            # 默认：ARCH-1~7 + ARCH-8
#   pwsh -File scripts/arch-check.ps1 --hw-check # 仅 ARCH-8 硬件资源冲突检测
#   pwsh -File scripts/arch-check.ps1 --all      # 全部
#   pwsh -File scripts/arch-check.ps1 --no-hw    # 仅 ARCH-1~7
#
# 输出协议（与 .sh 一致）：
#   - stderr：进度（>>> [N/M] ...）和最终汇总
#   - stdout：每行一个违规，格式 [ARCH-N] file:line - reason
#   - exit code：0 = 0 违规，1 = 有违规

$ErrorActionPreference = 'Continue'

# stdout 统一 UTF-8，避免被 OEM 码页 / 管道捕获损坏中文（对 git 钩子捕获尤为关键）
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ===== 参数解析 =====
# 注意：pwsh -File 下以 - 开头的 flag 不会绑定到 param()，而是落入 $args，故直接解析 $args
$RUN_ARCH = $true
$RUN_HW   = $true
foreach ($a in $args) {
    switch ($a) {
        '--hw-check' { $RUN_ARCH = $false; $RUN_HW = $true }
        '--all'      { $RUN_ARCH = $true;  $RUN_HW = $true }
        '--no-hw'    { $RUN_ARCH = $true;  $RUN_HW = $false }
        default      { }   # 未知参数忽略；无参 = 两者都跑
    }
}

# ===== 配置（与 .sh 同步）=====
$APP_LAYER_DIRS = @('app','application','project/code/app','src/app','code/app')
$VENDOR_DIRS    = @('libraries','sdk','vendor','third_party','Drivers','Middlewares')
$VENDOR_HEADERS_RE = '#\s*include\s+[<"](stm32[a-z0-9_]*\.h|gd32[a-z0-9_]*\.h|esp_system\.h|esp_[a-z0-9_]+\.h|driver/gpio\.h|ti_msp_dl_config\.h|nrf[a-z0-9_]*\.h|nrfx[a-z0-9_]*\.h|Ifx[A-Za-z0-9_]+\.h|ifx[a-z0-9_]+_reg\.h|SysSe/[^>"]+|Bsp\.h|DA[A-Z0-9]+\.h|hal/nrf_[a-z0-9_]+\.h)[>"]'
$CATCH_ALL_HEADERS_RE   = '#\s*include\s+[<"]([a-z_]*_?common_?headfile\.h|[a-z_]*_headfile\.h|headfile\.h|all\.h|globals\.h|project\.h)[>"]'
$CATCH_ALL_WHITELIST_RE = 'zf_common_headfile\.h'
$BARE_MMIO_RE = '\*\s*\(\s*volatile\s[^)]*\*\s*\)\s*0[xX][0-9A-Fa-f]+'
$MAIN_C_MAX_CALLS = 6
$ISR_BODY_MAX = 20
$C_FILE_MAX_LINES = 800
$H_API_MAX = 20
$MEGA_HEADER_INCLUDE_THRESHOLD = 10

$BT = [char]0x60   # 反引号字面量，用于复刻 .sh 的 `name` 输出

# ===== 收集器 =====
$script:violations = New-Object System.Collections.Generic.List[string]

# ===== 工具函数 =====
function Write-Err([string]$msg) { [Console]::Error.WriteLine($msg) }

function Get-RelPath([string]$full) {
    $cwd = (Get-Location).Path
    $rel = [System.IO.Path]::GetRelativePath($cwd, $full)
    return ($rel -replace '\\','/')
}

function Test-VendorPath([string]$relPath) {
    # 归一化：反斜杠→正斜杠，并剥掉可能的 ./ 前缀（复刻 .sh is_vendor_path 对 ./Drivers/、Drivers/、a/Drivers/ 三式的覆盖）
    $np = ($relPath -replace '\\','/') -replace '^\./',''
    foreach ($d in $VENDOR_DIRS) {
        $esc = [regex]::Escape($d)
        if ($np -match "(^|/)$esc/") { return $true }
    }
    return $false
}

# 枚举指定基目录下指定扩展名的文件（基目录不存在则空）
function Get-FilesByExt([string]$base, [string[]]$exts) {
    if (-not (Test-Path -LiteralPath $base)) { return @() }
    return Get-ChildItem -LiteralPath $base -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $exts -contains $_.Extension }
}

function Read-Lines([string]$path) {
    try { return [System.IO.File]::ReadLines($path) }
    catch { return @() }
}

# ===== 检查 1：应用层 include 厂商头 / catch-all mega-header / 裸寄存器访问 =====
function Invoke-Check1 {
    Write-Err ">>> [1/7] app layer vendor / catch-all includes"
    foreach ($d in $APP_LAYER_DIRS) {
        foreach ($f in (Get-FilesByExt $d @('.c','.h'))) {
            $rel = Get-RelPath $f.FullName
            $ln = 0
            foreach ($line in (Read-Lines $f.FullName)) {
                $ln++
                if ($line -cmatch $VENDOR_HEADERS_RE) {
                    $script:violations.Add("[ARCH-1] ${rel}:${ln} - 应用层 include 厂商头: $($line.Trim())")
                }
                if (($line -cmatch $CATCH_ALL_HEADERS_RE) -and ($line -cnotmatch $CATCH_ALL_WHITELIST_RE)) {
                    $script:violations.Add("[ARCH-1B] ${rel}:${ln} - 应用层 include catch-all mega-header（间接拉入厂商头）: $($line.Trim())")
                }
                if ($line -cmatch $BARE_MMIO_RE) {
                    $script:violations.Add("[ARCH-1C] ${rel}:${ln} - 应用层直接访问寄存器地址（裸 MMIO，应封装到 HAL/BSP 层）: $($line.Trim())")
                }
            }
        }
    }
}

# ===== 检查 2：main.c 顶层调用数 =====
function Invoke-Check2 {
    Write-Err ">>> [2/7] main.c-like top-level call count"
    $mainStartRe = '(^|[\t ])(int|void)[\t ]+(main|core[0-9]+_main|cpu[0-9]+_main|Main_Task|vMainTask|app_main|firmware_main|core_main)[\t ]*\('
    $keywords = @('if','while','for','switch','return','sizeof','do','else')
    $files = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
        $n = $_.Name
        ($n -eq 'main.c') -or ($n -cmatch '^cpu[0-9]_main\.c$') -or ($n -cmatch '^core[0-9]_main\.c$') -or ($n -cmatch '_main\.c$') -or ($n -cmatch '^firmware.*\.c$')
    }
    foreach ($f in $files) {
        $rel = Get-RelPath $f.FullName
        if (Test-VendorPath $rel) { continue }
        $disp = "./$rel"   # find . 类检查：复刻 .sh 的 ./ 前缀
        $inMain = $false; $depth = 0; $calls = 0; $start = 0; $mainName = ''
        $ln = 0
        foreach ($raw in (Read-Lines $f.FullName)) {
            $ln++
            if (-not $inMain) {
                if ($raw -cmatch $mainStartRe) {
                    $inMain = $true; $start = $ln; $depth = 0; $calls = 0
                    # 复刻 .sh 的名字截取（删到最后一个空白，再删 ( 之后）——与 awk 行为一致，含其 { quirk
                    $mainName = $raw -replace '.*[\t ]','' -replace '\(.*',''
                } else {
                    continue
                }
            }
            # 处理当前行（检测行同样在此处理，因为 { 可能在签名行）
            $line = $raw -replace '//.*$',''
            $line = $line -replace '"[^"]*"','""'
            for ($i = 0; $i -lt $line.Length; $i++) {
                $c = $line[$i]
                if ($c -eq '{') { $depth++ }
                elseif ($c -eq '}') {
                    $depth--
                    if ($depth -eq 0) {
                        if ($calls -gt $MAIN_C_MAX_CALLS) {
                            $script:violations.Add("[ARCH-2] ${disp}:${start} - ${mainName}() 顶层调用 = ${calls}，超过 ${MAIN_C_MAX_CALLS}")
                        }
                        $inMain = $false
                        break
                    }
                }
            }
            if ($depth -eq 1) {
                foreach ($part in ($line -split ';')) {
                    $s = $part -replace '^[\t {}]+','' -replace '[\t ]+$',''
                    if ($s -eq '') { continue }
                    if ($s -cmatch '^([a-zA-Z_][a-zA-Z0-9_]*)[\t ]*\(') {
                        $name = $Matches[1]
                        if ($keywords -notcontains $name) { $calls++ }
                    }
                }
            }
        }
    }
}

# ===== 检查 3：ISR / 回调函数体行数 =====
function Invoke-Check3 {
    Write-Err ">>> [3/7] ISR / callback body length"
    $isrStartRe = '^[\t ]*(static[\t ]+)?(inline[\t ]+)?void[\t ]+[A-Za-z0-9_]+(_IRQHandler|_Handler|_Callback|_callback|Cb)[\t ]*\([^)]*\)[\t ]*\{'
    foreach ($f in (Get-FilesByExt '.' @('.c'))) {
        $rel = Get-RelPath $f.FullName
        if (Test-VendorPath $rel) { continue }
        $disp = "./$rel"
        $inIsr = $false; $depth = 0; $bodyLines = 0; $isrStart = 0; $isrName = ''
        $ln = 0
        foreach ($raw in (Read-Lines $f.FullName)) {
            $ln++
            if (-not $inIsr) {
                if ($raw -cmatch $isrStartRe) {
                    $tmp = $raw -replace '^[\t ]*',''
                    $tmp = $tmp -replace '\(.*$',''
                    $tmp = $tmp -replace '^.*[\t ]',''
                    $isrName = $tmp
                    $isrStart = $ln; $inIsr = $true; $depth = 1; $bodyLines = 0
                }
                continue
            }
            $line = $raw -replace '[\t ]+$',''
            if ($line -ne '' -and $line -notmatch '^[\t ]*//' -and $line -notmatch '^[\t ]*\*' -and $line -notmatch '^[\t ]*/\*') {
                $bodyLines++
            }
            for ($i = 0; $i -lt $raw.Length; $i++) {
                $c = $raw[$i]
                if ($c -eq '{') { $depth++ }
                elseif ($c -eq '}') {
                    $depth--
                    if ($depth -eq 0) {
                        if ($bodyLines -gt $ISR_BODY_MAX) {
                            $script:violations.Add("[ARCH-3] ${disp}:${isrStart} - ISR/callback ${BT}${isrName}${BT} 函数体 ${bodyLines} 行 > ${ISR_BODY_MAX}")
                        }
                        $inIsr = $false
                        break
                    }
                }
            }
        }
    }
}

# ===== 检查 4：应用层 extern 变量 =====
function Invoke-Check4 {
    Write-Err ">>> [4/7] app layer extern variables"
    $externRe = '^\s*extern\s+(const\s+|volatile\s+)?[a-zA-Z_][a-zA-Z0-9_]*\s+[a-zA-Z_][a-zA-Z0-9_]*\s*(\[[^\]]*\])?\s*;'
    foreach ($d in $APP_LAYER_DIRS) {
        foreach ($f in (Get-FilesByExt $d @('.c','.h'))) {
            $rel = Get-RelPath $f.FullName
            $ln = 0
            foreach ($line in (Read-Lines $f.FullName)) {
                $ln++
                if (($line -cmatch $externRe) -and ($line -notmatch '\(')) {
                    $script:violations.Add("[ARCH-4] ${rel}:${ln} - 应用层 extern 变量: $($line.Trim())")
                }
            }
        }
    }
}

# ===== 检查 5：单 .c 文件行数 =====
function Invoke-Check5 {
    Write-Err ">>> [5/7] .c file length"
    foreach ($f in (Get-FilesByExt '.' @('.c'))) {
        $rel = Get-RelPath $f.FullName
        if (Test-VendorPath $rel) { continue }
        $disp = "./$rel"
        $lc = 0
        foreach ($l in (Read-Lines $f.FullName)) { $lc++ }
        if ($lc -gt $C_FILE_MAX_LINES) {
            $script:violations.Add("[ARCH-5] ${disp}:${lc} - .c 文件 ${lc} 行 > ${C_FILE_MAX_LINES}")
        }
    }
}

# ===== 检查 6：单 .h 公共 API 数量 =====
function Invoke-Check6 {
    Write-Err ">>> [6/7] .h public API count"
    $apiRe = '^[a-zA-Z_][a-zA-Z0-9_*\s]+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*;'
    foreach ($f in (Get-FilesByExt '.' @('.h'))) {
        $rel = Get-RelPath $f.FullName
        if (Test-VendorPath $rel) { continue }
        $api = 0
        foreach ($line in (Read-Lines $f.FullName)) {
            if ($line -cmatch $apiRe) { $api++ }
        }
        if ($api -gt $H_API_MAX) {
            $script:violations.Add("[ARCH-6] ./${rel}:1 - .h 公共 API ${api} 个 > ${H_API_MAX}")
        }
    }
}

# ===== 检查 7：mega-header 检测（全局，含 libraries/ 仅作提示）=====
function Invoke-Check7 {
    Write-Err ">>> [7/7] mega-header detection (global)"
    $megaList = New-Object System.Collections.Generic.List[string]
    foreach ($f in (Get-FilesByExt '.' @('.h'))) {
        $name = $f.Name
        if ($name -eq 'ti_msp_dl_config.h' -or $name -cmatch '^stm32.*_conf\.h$' -or $name -cmatch '^gd32.*_conf\.h$') { continue }
        $rel = Get-RelPath $f.FullName
        $incCount = 0
        foreach ($line in (Read-Lines $f.FullName)) {
            if ($line -match '^\s*#\s*include') { $incCount++ }
        }
        if ($incCount -ge $MEGA_HEADER_INCLUDE_THRESHOLD) {
            if (Test-VendorPath $rel) {
                Write-Err "[HINT-7] ./${rel}:1 - mega-header 含 ${incCount} 个 #include（libraries/ 内，仅提示）"
                $megaList.Add($name)
            } else {
                $script:violations.Add("[ARCH-7] ./${rel}:1 - mega-header 含 ${incCount} 个 #include（阈值 ${MEGA_HEADER_INCLUDE_THRESHOLD}）")
                $megaList.Add($name)
            }
        }
    }
    if ($megaList.Count -gt 0) {
        foreach ($d in $APP_LAYER_DIRS) {
            $appFiles = Get-FilesByExt $d @('.c','.h')
            if ($appFiles.Count -eq 0) { continue }
            foreach ($megaName in $megaList) {
                if ($megaName -match $CATCH_ALL_WHITELIST_RE) { continue }
                $esc = [regex]::Escape($megaName)
                $incRe = "#\s*include\s+[<""]$esc[>""]"
                foreach ($f in $appFiles) {
                    $rel = Get-RelPath $f.FullName
                    $ln = 0
                    foreach ($line in (Read-Lines $f.FullName)) {
                        $ln++
                        if ($line -match $incRe) {
                            $script:violations.Add("[ARCH-7B] ${rel}:${ln} - app 层 include mega-header ${BT}${megaName}${BT}（违规）")
                        }
                    }
                }
            }
        }
    }
}

# ===== 检查 8：硬件资源表 hw_lock 块冲突检测 =====
function Get-YamlVal([string]$line, [string]$key) {
    $re = "(^|[^A-Za-z0-9_])$key" + ":[ \t]*[A-Za-z0-9_]+"
    $m = [regex]::Match($line, $re)
    if ($m.Success) {
        return [regex]::Replace($m.Value, ".*$key" + ":[ \t]*", "")
    }
    return ''
}

function Get-HwLockBlock([string]$hwFile) {
    $inBlock = $false; $hasHw = $false
    $collected = New-Object System.Collections.Generic.List[string]
    foreach ($line in (Read-Lines $hwFile)) {
        if ($line -match '^```yaml\s*$') { $inBlock = $true; continue }
        if ($line -match '^```\s*$') {
            if ($inBlock) { $inBlock = $false; if ($hasHw) { break } }
            continue
        }
        if ($inBlock) {
            if ($line -match '^hw_lock:') { $hasHw = $true }
            if ($hasHw) { $collected.Add($line) }
        }
    }
    return ,$collected.ToArray()
}

function Invoke-Check8 {
    Write-Err ">>> [8/8] hw_lock conflict detection (硬件资源表.md)"
    $hwFile = $null
    foreach ($cand in @('硬件资源表.md','hw-resources.md')) {
        if (Test-Path -LiteralPath $cand) { $hwFile = $cand; break }
    }
    if (-not $hwFile) {
        Write-Err "[HINT-8] 未找到 硬件资源表.md / hw-resources.md，跳过 hw_lock 检测"
        return
    }
    $yaml = Get-HwLockBlock $hwFile
    if (($null -eq $yaml) -or ($yaml.Count -eq 0)) {
        $script:violations.Add("[ARCH-8] ${hwFile}:1 - 未找到 hw_lock YAML 块（机器可读资源锁定区缺失）")
        return
    }

    $section = ''
    $cid=''; $cstream=''; $cirqn=''; $cpp=''; $cps=''; $have=$false
    $pin=@{}; $dm=@{}; $iq=@{}; $pr=@{}; $tm=@{}
    $dups = New-Object System.Collections.Generic.List[string]

    # flush：在 item 切换 / section 切换 / EOF 时结算当前累积 item（dot-source 以共享/改写本作用域变量）
    $Flush = {
        if ($have) {
            if ($section -eq 'pins'   -and $cid -ne '')    { if ($pin.ContainsKey($cid)){$pin[$cid]++}else{$pin[$cid]=1};       if ($pin[$cid] -gt 1)    { $dups.Add("pins: pin $cid 重复") } }
            if ($section -eq 'dma'    -and $cstream -ne '') { if ($dm.ContainsKey($cstream)){$dm[$cstream]++}else{$dm[$cstream]=1}; if ($dm[$cstream] -gt 1) { $dups.Add("dma: stream $cstream 重复") } }
            if ($section -eq 'irq') {
                if ($cirqn -ne '') { if ($iq.ContainsKey($cirqn)){$iq[$cirqn]++}else{$iq[$cirqn]=1}; if ($iq[$cirqn] -gt 1) { $dups.Add("irq: irqn $cirqn 重复") } }
                if ($cpp -ne '' -and $cps -ne '') { $k = "${cpp}_${cps}"; if ($pr.ContainsKey($k)){$pr[$k]++}else{$pr[$k]=1}; if ($pr[$k] -gt 1) { $dups.Add("irq: priority $cpp/$cps 重复（$cirqn 与之前条目同优先级）") } }
            }
            if ($section -eq 'timers' -and $cid -ne '')    { if ($tm.ContainsKey($cid)){$tm[$cid]++}else{$tm[$cid]=1};          if ($tm[$cid] -gt 1)     { $dups.Add("timers: id $cid 重复") } }
            $cid=''; $cstream=''; $cirqn=''; $cpp=''; $cps=''; $have=$false
        }
    }

    foreach ($line in $yaml) {
        if ($line -match '^[\t ]*pins:[\t ]*$')   { . $Flush; $section='pins';   continue }
        if ($line -match '^[\t ]*dma:[\t ]*$')    { . $Flush; $section='dma';    continue }
        if ($line -match '^[\t ]*irq:[\t ]*$')    { . $Flush; $section='irq';    continue }
        if ($line -match '^[\t ]*timers:[\t ]*$') { . $Flush; $section='timers'; continue }
        if ($section -ne '') {
            if ($line -match '^[\t ]*-') { . $Flush; $have = $true }
            $v = Get-YamlVal $line 'id';               if ($v -ne '') { $cid = $v }
            $v = Get-YamlVal $line 'stream';           if ($v -ne '') { $cstream = $v }
            $v = Get-YamlVal $line 'irqn';             if ($v -ne '') { $cirqn = $v }
            $v = Get-YamlVal $line 'priority_preempt'; if ($v -ne '') { $cpp = $v }
            $v = Get-YamlVal $line 'priority_sub';     if ($v -ne '') { $cps = $v }
        }
    }
    . $Flush   # EOF 结算

    foreach ($dup in $dups) {
        if ($dup -ne '') { $script:violations.Add("[ARCH-8] ${hwFile}:1 - hw_lock.$dup") }
    }
}

# ===== 执行 =====
Write-Err "==> embedded-dev arch-check / PowerShell (project root: $((Get-Location).Path))"
Write-Err ""

if ($RUN_ARCH) {
    Invoke-Check1
    Invoke-Check2
    Invoke-Check3
    Invoke-Check4
    Invoke-Check5
    Invoke-Check6
    Invoke-Check7
}
if ($RUN_HW) {
    Invoke-Check8
}

# 违规写 stdout
foreach ($v in $script:violations) { Write-Output $v }

Write-Err ""
if ($script:violations.Count -eq 0) {
    Write-Err "==> PASS: 0 violations"
    exit 0
} else {
    Write-Err "==> FAIL: $($script:violations.Count) violations"
    exit 1
}
