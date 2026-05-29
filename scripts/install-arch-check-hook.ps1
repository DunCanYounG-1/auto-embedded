#!/usr/bin/env pwsh
# 把 arch-check 的 pre-commit 钩子安装到目标工程的 .git/hooks/（Windows / PowerShell 版）
#
# 用法：
#   pwsh -File scripts/install-arch-check-hook.ps1 [目标工程目录]   # 默认当前目录
#
# 说明：git 钩子文件名必须为 pre-commit（无扩展名），git 在 Windows 上也用自带 bash 执行它。

param([string]$Target = ".")

$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'hooks\pre-commit'
if (-not (Test-Path -LiteralPath $src)) {
    Write-Error "找不到钩子源文件：$src"
    exit 1
}

Push-Location $Target
try {
    $gitDir = (git rev-parse --absolute-git-dir 2>$null)
    if (-not $gitDir) {
        Write-Error "'$Target' 不是一个 git 仓库"
        exit 1
    }
    $hookDir = Join-Path $gitDir 'hooks'
    New-Item -ItemType Directory -Force -Path $hookDir | Out-Null
    $dest = Join-Path $hookDir 'pre-commit'

    if (Test-Path -LiteralPath $dest) {
        $stamp = Get-Date -Format 'yyyyMMddHHmmss'
        Copy-Item -LiteralPath $dest -Destination "$dest.bak.$stamp" -Force
        Write-Host "↪ 已备份原有 pre-commit -> pre-commit.bak.$stamp"
    }

    Copy-Item -LiteralPath $src -Destination $dest -Force
    Write-Host "✓ 已安装 pre-commit 钩子到 $dest"
    Write-Host "  - 仅在提交涉及 .c/.h 时触发"
    Write-Host "  - 临时跳过：git commit --no-verify"
}
finally {
    Pop-Location
}
