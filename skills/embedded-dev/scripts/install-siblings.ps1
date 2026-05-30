<#
.SYNOPSIS
  【LEGACY / 非 plugin 安装备选】把本仓库 skills/ 下打包的全部 skill 复制到 ~/.claude/skills/。

.DESCRIPTION
  首选方式是装成 plugin（一条命令、hooks 自动注册，见 INSTALL.md §1）。
  仅当你不想用 plugin、要走传统 user-skill 安装时才需要本脚本：Claude Code 只在
  ~/.claude/skills/<name>/ 这一层发现 skill，本脚本把仓库 skills/ 下打包的全部 skill
  （embedded-dev 本体 + 25 个执行层 skill + shared/ 契约层）就位到 ~/.claude/skills/。
  grok-search 是第三方，未打包，见 INSTALL.md §3.3。

  默认跳过已存在的同名目录（不覆盖你本地可能更新的版本）；-Force 才覆盖。

.PARAMETER Force
  覆盖已存在的同名 skill 目录。

.PARAMETER DryRun
  只打印将执行的动作，不写盘。

.PARAMETER TargetRoot
  安装目标根目录，默认 ~/.claude/skills。

.EXAMPLE
  pwsh scripts/install-siblings.ps1            # 安装缺失的，跳过已有
  pwsh scripts/install-siblings.ps1 -Force     # 覆盖更新全部
  pwsh scripts/install-siblings.ps1 -DryRun    # 预览，不写盘
#>
[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$DryRun,
  [string]$TargetRoot = (Join-Path $HOME ".claude\skills")
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillRoot = Split-Path -Parent $ScriptDir          # skills/embedded-dev
$Source    = Split-Path -Parent $SkillRoot          # 仓库的 skills/ 目录（上两级）

if (-not (Test-Path $Source)) {
  Write-Error "找不到打包目录: $Source（仓库可能不完整，请重新 clone）"
  exit 1
}

if (-not (Test-Path $TargetRoot)) {
  if ($DryRun) { Write-Host "[dry-run] 将创建目标根目录: $TargetRoot" }
  else { New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null }
}

Write-Host "源: $Source"
Write-Host "目标: $TargetRoot"
Write-Host ""

$installed = 0; $overwritten = 0; $skipped = 0
Get-ChildItem -Path $Source -Directory | Sort-Object Name | ForEach-Object {
  $name   = $_.Name
  $dst    = Join-Path $TargetRoot $name
  $exists = Test-Path $dst

  # 同路径自我覆盖防护：仓库本身就在 ~/.claude/skills/embedded-dev 时，源=目标，跳过。
  if ($exists -and ((Resolve-Path $_.FullName).Path -eq (Resolve-Path $dst).Path)) {
    Write-Host ("  [skip]    {0} — 源与目标同路径，跳过" -f $name)
    $script:skipped++
    return
  }

  if ($exists -and -not $Force) {
    Write-Host ("  [skip]    {0} — 已存在（加 -Force 覆盖）" -f $name)
    $script:skipped++
    return
  }
  if ($DryRun) {
    $tag = if ($exists) { "（将覆盖）" } else { "" }
    Write-Host ("  [dry-run] {0} -> {1} {2}" -f $name, $dst, $tag)
    return
  }
  if ($exists) { Remove-Item -Recurse -Force $dst; $script:overwritten++ }
  else { $script:installed++ }
  Copy-Item -Recurse -Force $_.FullName $dst
  Write-Host ("  [ok]      {0}" -f $name)
}

Write-Host ""
if ($DryRun) {
  Write-Host "（dry-run 结束，未写盘）"
} else {
  Write-Host ("完成：新装 {0} · 覆盖 {1} · 跳过 {2}" -f $installed, $overwritten, $skipped)
  if ($skipped -gt 0 -and -not $Force) {
    Write-Host "提示：要更新已存在的 skill，加 -Force 重跑。"
  }
  Write-Host "重启 Claude Code 会话后，这些执行层 skill 即可被路由调用。"
}
