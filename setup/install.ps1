#requires -Version 5
<#
  auto-embedded · 一条龙安装器
  一个命令装齐：aemb CLI（全局）+ 全局技能（multisim-spice / simubridge）+ 打印 MCP/Multisim 提示。

  用法（也可双击仓库根 setup.cmd，或 setup\install.cmd）：
    powershell -ExecutionPolicy Bypass -File setup\install.ps1              # 全套（aemb + 技能）
    powershell -ExecutionPolicy Bypass -File setup\install.ps1 -SkillsOnly  # 只装/更新全局技能
    powershell -ExecutionPolicy Bypass -File setup\install.ps1 -List        # 列出技能来源链接
    powershell -ExecutionPolicy Bypass -File setup\install.ps1 -Mcp         # 额外半自动装 simubridge MCP 后端

  更新全套：git pull 本仓库 → 再跑一次本脚本（aemb 重装 + 各技能 git 拉取最新）。
#>
[CmdletBinding()]
param([switch]$SkillsOnly, [switch]$Mcp, [switch]$List)
$ErrorActionPreference = "Stop"

$Setup     = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $Setup
$RegPath   = Join-Path $Setup "skills.json"
$SkillsDir = Join-Path $env:USERPROFILE ".claude\skills"
$Cache     = Join-Path $env:USERPROFILE ".claude\.skill-sources"

function Info($m) { Write-Host "  $m" }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
$script:Failed = $false
function Fail($m) { Write-Host "  [X]  $m" -ForegroundColor Red; $script:Failed = $true }
function Head($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

foreach ($t in "git", "node", "npm") {
  if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Fail "缺 $t，请先安装。"; exit 1 }
}
if (-not (Test-Path $RegPath)) { Fail "缺 skills.json: $RegPath"; exit 1 }
$reg = Get-Content $RegPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($List) {
  Write-Host "技能来源链接（便于更新）：" -ForegroundColor Cyan
  foreach ($s in $reg.skills) {
    $sub = if ($s.subdir) { $s.subdir } else { "<仓库根>" }
    Write-Host ("  - {0,-15} {1}   [subdir: {2}]" -f $s.name, $s.repo, $sub)
  }
  exit 0
}

function Sync-Repo($repo, $dir) {
  if (Test-Path (Join-Path $dir ".git")) {
    Info "更新 $repo"
    git -C $dir fetch --depth 1 origin 2>&1 | Out-Null
    $br = (git -C $dir rev-parse --abbrev-ref HEAD 2>$null)
    if ($br) { git -C $dir reset --hard "origin/$($br.Trim())" 2>&1 | Out-Null }
    git -C $dir clean -fd 2>&1 | Out-Null
  } else {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    Info "克隆 $repo"
    git clone --depth 1 $repo $dir 2>&1 | Out-Null
  }
}
function Mirror($src, $dst) {
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  New-Item -ItemType Directory -Force $dst | Out-Null
  robocopy $src $dst /E /XD .git /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
}

# —— 1) aemb CLI（全局）——
if (-not $SkillsOnly) {
  Head "安装/更新 aemb CLI（全局）"
  Push-Location $RepoRoot
  try {
    Info "npm install（依赖）"; npm install --silent 2>&1 | Out-Null
    Info "npm install -g .（tsc 构建 + 全局链接）"; npm install -g . 2>&1 | Out-Null
    $aembCmd = Get-Command aemb -ErrorAction SilentlyContinue
    $aemb = if ($aembCmd) { $aembCmd.Source } else { $null }
    if ($aemb) { Ok "aemb 全局可用：$aemb" }
    else { Warn "aemb 未出现在 PATH，检查 npm 全局 bin 是否在 PATH（npm config get prefix）。" }
  } catch { Fail "aemb 安装失败：$($_.Exception.Message)" }
  finally { Pop-Location }
}

# —— 2) 全局技能 ——
Head "安装/更新全局技能 → $SkillsDir"
New-Item -ItemType Directory -Force $SkillsDir | Out-Null
New-Item -ItemType Directory -Force $Cache | Out-Null
foreach ($s in $reg.skills) {
  Write-Host "`n— $($s.name) —" -ForegroundColor Cyan
  $dest = Join-Path $SkillsDir $s.name
  $hasSub = -not [string]::IsNullOrWhiteSpace($s.subdir)
  try {
    if (-not $hasSub) {
      Sync-Repo $s.repo $dest
    } else {
      $reponame = ($s.repo -replace '.*/', '') -replace '\.git$', ''
      $c = Join-Path $Cache $reponame
      Sync-Repo $s.repo $c
      $src = Join-Path $c $s.subdir
      if (-not (Test-Path $src)) { Fail "子目录不存在: $($s.subdir)"; continue }
      Mirror $src $dest
    }
  } catch { Fail "$($s.name) 安装失败：$($_.Exception.Message)"; continue }
  if (Test-Path (Join-Path $dest "SKILL.md")) { Ok "$($s.name) → ~/.claude/skills/$($s.name)" }
  else { Fail "$($s.name) 缺 SKILL.md（检查 subdir）" }
  if ($s.notes) { Warn $s.notes }
}

# —— 3) simubridge MCP 后端（可选，半自动）——
if ($Mcp) {
  Head "simubridge MCP 后端（半自动；MATLAB 侧需手动）"
  $sb = $reg.skills | Where-Object { $_.name -eq 'simubridge' }
  if ($sb) {
    $reponame = ($sb.repo -replace '.*/', '') -replace '\.git$', ''
    $c = Join-Path $Cache $reponame
    if (-not (Test-Path $c)) { Sync-Repo $sb.repo $c }
    $py = $null
    foreach ($cand in @("py -3.12", "py -3.11", "py -3.10", "py -3.9")) {
      $v = (cmd /c "$cand --version 2>&1")
      if ($LASTEXITCODE -eq 0 -and $v -match "3\.(9|10|11|12)\.") { $py = $cand; break }
    }
    if (-not $py) { Warn "未找到 Python 3.9-3.12（你当前默认是 3.13，不兼容 MATLAB 引擎）。装好 3.12 后: <py> -m pip install -e `"$c`"" }
    else { Info "用 [$py] 安装后端"; cmd /c "$py -m pip install -e `"$c`""; Ok "MCP 后端已 pip 安装（python=$py）" }
    Warn "仍需手动（脚本不动你的 MATLAB / ~/.claude.json）："
    Write-Host "    1) MATLAB 引擎: 在 <matlabroot>\extern\engines\python 跑 <py> setup.py install"
    Write-Host "    2) %USERPROFILE%\.claude.json 的 mcpServers 加: simubridge → {command:<py.exe>, args:[-m, simubridge]}"
    Write-Host "    3) MATLAB 内: matlab.engine.shareEngine('SIMULINK_MCP_SESSION')"
    Write-Host "    4) 重启 Claude Code，/mcp 看 simubridge 是否 Connected。详见 $c\README.md"
  }
}

# —— 4) 下一步 ——
Head "完成 · 下一步"
Write-Host "  · 用框架: aemb init <你的固件工程> -u <名> --platforms claude,cursor,codex"
Write-Host "  · multisim-spice: 自检自带 ngspice 即可；最后导入需本机装 NI Multisim 14.x"
Write-Host "  · simubridge 完整功能: 需 MCP 后端（MATLAB + Python 3.9-3.12）。跑 setup\install.ps1 -Mcp，或见 setup\README.md"
Write-Host "  · 更新全套: git pull 本仓 + 再跑本脚本" -ForegroundColor DarkGray

exit ([int]$script:Failed)
