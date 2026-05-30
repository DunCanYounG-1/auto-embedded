#!/bin/sh
# 把 arch-check 的 pre-commit 钩子安装到目标工程的 .git/hooks/
#
# 用法：
#   scripts/install-arch-check-hook.sh [目标工程目录]   # 默认当前目录
#
# 安装后：该工程每次 git commit 涉及 .c/.h 时会自动跑分层架构门禁，不通过则阻断。
set -e

TARGET="${1:-.}"
SRC_DIR=$(cd "$(dirname "$0")" && pwd)
SRC="$SRC_DIR/hooks/pre-commit"

if [ ! -f "$SRC" ]; then
    echo "✗ 找不到钩子源文件：$SRC" >&2
    exit 1
fi

GIT_DIR=$(cd "$TARGET" && git rev-parse --absolute-git-dir 2>/dev/null) || {
    echo "✗ '$TARGET' 不是一个 git 仓库" >&2
    exit 1
}
HOOK_DIR="$GIT_DIR/hooks"
mkdir -p "$HOOK_DIR"

DEST="$HOOK_DIR/pre-commit"
if [ -f "$DEST" ]; then
    cp "$DEST" "$DEST.bak.$(date +%Y%m%d%H%M%S 2>/dev/null || echo bak)"
    echo "↪ 已备份原有 pre-commit"
fi

cp "$SRC" "$DEST"
chmod +x "$DEST"
echo "✓ 已安装 pre-commit 钩子到 $DEST"
echo "  - 仅在提交涉及 .c/.h 时触发"
echo "  - 临时跳过：git commit --no-verify"
