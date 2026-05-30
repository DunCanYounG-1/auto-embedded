#!/usr/bin/env bash
# 把 embedded-dev/siblings/ 下随仓库打包的执行层兄弟 skill 安装到 ~/.claude/skills/。
#
# Claude Code 只在 ~/.claude/skills/<name>/ 这一层发现 skill；嵌套在
# embedded-dev/siblings/ 里的副本不会被自动识别。本脚本把 vendor 进仓库的
# 25 个执行层兄弟 skill + shared/ 契约层就位到 ~/.claude/skills/，实现
# 「clone 一次即可用」。grok-search 是第三方，未打包，见 INSTALL.md §3.3。
#
# 用法:
#   bash scripts/install-siblings.sh            # 安装缺失的，跳过已有
#   bash scripts/install-siblings.sh --force    # 覆盖更新全部
#   bash scripts/install-siblings.sh --dry-run  # 预览，不写盘
#   bash scripts/install-siblings.sh --target=/custom/.claude/skills
set -euo pipefail

FORCE=0
DRY=0
TARGET_ROOT="${HOME}/.claude/skills"

for arg in "$@"; do
  case "$arg" in
    --force)     FORCE=1 ;;
    --dry-run)   DRY=1 ;;
    --target=*)  TARGET_ROOT="${arg#*=}" ;;
    -h|--help)   echo "用法: $0 [--force] [--dry-run] [--target=DIR]"; exit 0 ;;
    *)           echo "未知参数: $arg（用 --help 看用法）"; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$SKILL_ROOT/siblings"

[ -d "$SRC" ] || { echo "找不到打包目录: $SRC（仓库可能不完整，请重新 clone）"; exit 1; }

if [ ! -d "$TARGET_ROOT" ]; then
  if [ "$DRY" = 1 ]; then echo "[dry-run] 将创建目标根目录: $TARGET_ROOT"
  else mkdir -p "$TARGET_ROOT"; fi
fi

echo "源: $SRC"
echo "目标: $TARGET_ROOT"
echo ""

installed=0; overwritten=0; skipped=0
for d in "$SRC"/*/; do
  name="$(basename "$d")"
  dst="$TARGET_ROOT/$name"

  if [ -e "$dst" ] && [ "$FORCE" != 1 ]; then
    echo "  [skip]    $name — 已存在（加 --force 覆盖）"
    skipped=$((skipped+1)); continue
  fi
  if [ "$DRY" = 1 ]; then
    if [ -e "$dst" ]; then echo "  [dry-run] $name -> $dst （将覆盖）"
    else echo "  [dry-run] $name -> $dst"; fi
    continue
  fi
  if [ -e "$dst" ]; then rm -rf "$dst"; overwritten=$((overwritten+1))
  else installed=$((installed+1)); fi
  cp -r "${d%/}" "$dst"
  echo "  [ok]      $name"
done

echo ""
if [ "$DRY" = 1 ]; then
  echo "（dry-run 结束，未写盘）"
else
  echo "完成：新装 $installed · 覆盖 $overwritten · 跳过 $skipped"
  if [ "$skipped" -gt 0 ] && [ "$FORCE" != 1 ]; then
    echo "提示：要更新已存在的 skill，加 --force 重跑。"
  fi
  echo "重启 Claude Code 会话后，这些执行层 skill 即可被路由调用。"
fi
exit 0
