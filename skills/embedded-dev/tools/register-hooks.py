#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""register-hooks.py — 把 embedded-dev 的 6 条 hook 显式注册进 settings.json

【为什么需要它】user-level skill（`~/.claude/skills/`）安装时，SKILL.md frontmatter
里的 hooks **不会被 Claude Code 自动加载**（只有 plugin 的 frontmatter hooks 才会，
见 refs/hooks-design.md §注册方式）。所以 SessionStart 引导注入、pre-write-check 写前
分层拦截、四文件提醒在 user-skill 安装下默认是【不生效】的——本脚本提供显式 opt-in。

【安全默认】不带参数 = 只打印 hooks JSON 与用法，**绝不修改任何文件**。
要真正写入必须显式 `--write`。

用法：
    # 1) 只看会注册什么（默认，安全，不写盘）
    python tools/register-hooks.py

    # 2) 写进全局 ~/.claude/settings.json（所有会话都会加载 → session-start 会给所有项目注入引导）
    python tools/register-hooks.py --write

    # 3) 写进【项目级】.claude/settings.json（推荐：只对该工程生效，侵入性小）
    python tools/register-hooks.py --write --target ./.claude/settings.json

    # 4) 预演（显示合并后结果但不落盘）
    python tools/register-hooks.py --write --dry-run

    # 5) 移除本 skill 注册的 hook（按 run-hook.cmd 标记识别）
    python tools/register-hooks.py --remove --target ./.claude/settings.json

退出码：0 = 成功；1 = 用法错误；2 = 读写/解析错误。

注意：写入是【幂等】的——重复 --write 不会产生重复条目（先剔除本 skill 旧条目再追加）。
      写入前会把原 settings.json 备份为 settings.json.bak。
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

# 命令前缀与 SKILL.md frontmatter 完全一致（${CLAUDE_PLUGIN_ROOT:-...} 兼容 plugin/自定义路径）
BASE = 'bash "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/embedded-dev}/hooks/run-hook.cmd" '

# 6 条 hook（4 事件）—— 镜像 SKILL.md frontmatter 的 hooks 块
HOOKS = {
    "SessionStart": [
        {"matcher": "startup|clear|compact",
         "hooks": [{"type": "command", "command": BASE + "session-start.py", "async": False}]},
    ],
    "UserPromptSubmit": [
        {"hooks": [{"type": "command", "command": BASE + "check-memory-files"}]},
    ],
    "PreToolUse": [
        {"matcher": "Write|Edit|MultiEdit",
         "hooks": [{"type": "command", "command": BASE + "pre-write-check.py"},
                   {"type": "command", "command": BASE + "inject-context"}]},
        {"matcher": "Bash",
         "hooks": [{"type": "command", "command": BASE + "inject-context"}]},
    ],
    "PostToolUse": [
        {"matcher": "Write|Edit|Bash",
         "hooks": [{"type": "command", "command": BASE + "remind-update"}]},
    ],
}

MARKER = "run-hook.cmd"   # 本 skill hook 的识别标记


def is_ours(group: dict) -> bool:
    """判断一个 hook group 是否由本 skill 注册（其任一命令含 run-hook.cmd）。"""
    for h in group.get("hooks", []):
        if MARKER in str(h.get("command", "")):
            return True
    return False


def load_settings(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            print("ERROR: %s 顶层不是 JSON 对象" % path, file=sys.stderr)
            sys.exit(2)
        return data
    except (OSError, ValueError) as e:
        print("ERROR: 读取/解析 %s 失败: %s" % (path, e), file=sys.stderr)
        sys.exit(2)


def merge(settings: dict, remove: bool) -> dict:
    """幂等合并：先剔除本 skill 旧条目，remove=False 时再追加最新条目。"""
    hooks = settings.setdefault("hooks", {})
    for event, groups in HOOKS.items():
        cur = [g for g in hooks.get(event, []) if not is_ours(g)]
        if not remove:
            cur.extend(groups)
        if cur:
            hooks[event] = cur
        elif event in hooks:
            del hooks[event]
    if not hooks:
        settings.pop("hooks", None)
    return settings


def write_settings(path: str, settings: dict) -> None:
    parent = os.path.dirname(os.path.abspath(path))
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)
    if os.path.exists(path):
        shutil.copyfile(path, path + ".bak")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def main() -> int:
    ap = argparse.ArgumentParser(description="注册/移除 embedded-dev 的 hooks 到 settings.json")
    ap.add_argument("--write", action="store_true", help="写入（合并）到 --target")
    ap.add_argument("--remove", action="store_true", help="从 --target 移除本 skill 的 hooks")
    ap.add_argument("--target", default=os.path.expanduser("~/.claude/settings.json"),
                    help="目标 settings.json（默认 ~/.claude/settings.json；项目级用 ./.claude/settings.json）")
    ap.add_argument("--dry-run", action="store_true", help="只显示合并后结果，不落盘")
    args = ap.parse_args()

    if args.write and args.remove:
        print("ERROR: --write 与 --remove 不能同时用", file=sys.stderr)
        return 1

    # 默认（既非 write 也非 remove）：只打印 hooks JSON + 用法，安全不写盘
    if not args.write and not args.remove:
        print(json.dumps({"hooks": HOOKS}, indent=2, ensure_ascii=False))
        print("", file=sys.stderr)
        print("以上为本 skill 的 hooks 块。当前未写入任何文件（安全模式）。", file=sys.stderr)
        print("启用方式：", file=sys.stderr)
        print("  全局（所有项目）：python tools/register-hooks.py --write", file=sys.stderr)
        print("  项目级（推荐）：  python tools/register-hooks.py --write --target ./.claude/settings.json", file=sys.stderr)
        print("不启用也可：协议主流程仍由 Claude 手动遵守（degraded 模式），仅失去 hook 的机械提醒/预拦截。", file=sys.stderr)
        return 0

    settings = load_settings(args.target)
    merged = merge(settings, remove=args.remove)

    if args.dry_run:
        print("==> [dry-run] %s 合并后将是：" % args.target, file=sys.stderr)
        print(json.dumps(merged, indent=2, ensure_ascii=False))
        return 0

    try:
        write_settings(args.target, merged)
    except OSError as e:
        print("ERROR: 写入 %s 失败: %s" % (args.target, e), file=sys.stderr)
        return 2

    action = "移除" if args.remove else "注册"
    print("==> 已%s embedded-dev hooks → %s（原文件备份为 .bak）" % (action, args.target), file=sys.stderr)
    if not args.remove:
        print("    重启 Claude Code 会话后生效。验证：新会话首条响应应触发 SessionStart 引导。", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
