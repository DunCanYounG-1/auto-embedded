"""轻量工具路径持久化配置层。

提供 JSON 配置文件的读写，支持工作区级（.em_skill.json）和全局级
（~/.config/em_skill/config.json）两层配置，工作区覆盖全局。

解析优先级（由各脚本自行实现）：
  CLI 参数 → 配置文件 → 环境变量 → 硬编码路径 → PATH
"""

from __future__ import annotations

import json
import os
import platform
from pathlib import Path
from typing import Any

CONFIG_FILENAME = ".em_skill.json"


def user_config_path() -> Path:
    """返回全局配置文件路径（XDG / APPDATA）。"""
    if platform.system() == "Windows":
        base = os.environ.get("APPDATA")
        if base:
            return Path(base) / "em_skill" / "config.json"
    # XDG_CONFIG_HOME 或 ~/.config
    base = os.environ.get("XDG_CONFIG_HOME", "")
    if not base:
        base = str(Path.home() / ".config")
    return Path(base) / "em_skill" / "config.json"


def workspace_config_path(workspace: str | Path | None = None) -> Path:
    """返回工作区级配置文件路径。"""
    ws = Path(workspace) if workspace else Path.cwd()
    return ws / CONFIG_FILENAME


def load_config(path: Path) -> dict[str, Any]:
    """读取 JSON 配置文件，文件不存在或格式错误时返回空字典。"""
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_config(path: Path, data: dict[str, Any]) -> None:
    """将配置写入 JSON 文件，自动创建父目录。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def get_tool_path(
    tool_name: str,
    workspace: str | Path | None = None,
) -> str | None:
    """合并读取工具路径（工作区优先于全局）。"""
    # 工作区级
    ws_cfg = load_config(workspace_config_path(workspace))
    ws_path = ws_cfg.get("tools", {}).get(tool_name)
    if ws_path:
        return ws_path

    # 全局级
    global_cfg = load_config(user_config_path())
    return global_cfg.get("tools", {}).get(tool_name)


def set_tool_path(
    tool_name: str,
    tool_path: str,
    workspace: str | Path | None = None,
    global_: bool = False,
) -> Path:
    """写入工具路径到指定级别的配置文件，返回写入的文件路径。"""
    cfg_path = user_config_path() if global_ else workspace_config_path(workspace)
    data = load_config(cfg_path)
    tools = data.setdefault("tools", {})
    tools[tool_name] = tool_path
    save_config(cfg_path, data)
    return cfg_path


def remove_tool_path(
    tool_name: str,
    workspace: str | Path | None = None,
    global_: bool = False,
) -> bool:
    """从配置中删除工具路径，返回是否实际删除了条目。"""
    cfg_path = user_config_path() if global_ else workspace_config_path(workspace)
    data = load_config(cfg_path)
    tools = data.get("tools", {})
    if tool_name not in tools:
        return False
    del tools[tool_name]
    save_config(cfg_path, data)
    return True


def list_tools(
    workspace: str | Path | None = None,
) -> dict[str, dict[str, str]]:
    """列出所有已配置的工具，返回 {tool_name: {"path": ..., "source": ...}}。"""
    result: dict[str, dict[str, str]] = {}

    global_cfg = load_config(user_config_path())
    for name, path in global_cfg.get("tools", {}).items():
        result[name] = {"path": path, "source": "global"}

    ws_cfg = load_config(workspace_config_path(workspace))
    for name, path in ws_cfg.get("tools", {}).items():
        result[name] = {"path": path, "source": "workspace"}

    return result


def _ensure_utf8_stdout() -> None:
    """Windows 控制台默认 GBK，强制切到 UTF-8 避免中文乱码。"""
    import sys
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except (AttributeError, OSError):
                pass


def _main(argv: list[str]) -> int:
    import argparse

    _ensure_utf8_stdout()

    parser = argparse.ArgumentParser(
        description="嵌入式工具路径持久化配置 CLI（OpenOCD / Keil UV4 / arm-gcc / J-Link 等）。",
    )
    parser.add_argument(
        "--workspace",
        default=None,
        help="工作区路径，默认当前目录。影响 .em_skill.json 的读写位置。",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="以 JSON 格式输出（list / get 子命令）。",
    )

    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="列出所有已配置的工具路径。")

    p_get = sub.add_parser("get", help="读取单个工具路径。")
    p_get.add_argument("tool_name")

    p_set = sub.add_parser("set", help="写入工具路径。")
    p_set.add_argument("tool_name")
    p_set.add_argument("tool_path")
    p_set.add_argument(
        "--global",
        dest="global_",
        action="store_true",
        help="写入全局配置（~/.config/em_skill/config.json 或 %%APPDATA%%/em_skill/config.json），默认写入工作区。",
    )

    p_rm = sub.add_parser("remove", help="移除工具路径。")
    p_rm.add_argument("tool_name")
    p_rm.add_argument(
        "--global",
        dest="global_",
        action="store_true",
        help="从全局配置移除，默认从工作区移除。",
    )

    sub.add_parser("paths", help="打印工作区配置文件路径和全局配置文件路径。")

    args = parser.parse_args(argv)

    if args.cmd == "list":
        tools = list_tools(args.workspace)
        if args.json:
            print(json.dumps(tools, indent=2, ensure_ascii=False))
        elif not tools:
            print("(no tools configured)")
        else:
            width = max(len(n) for n in tools)
            for name, info in sorted(tools.items()):
                print(f"{name:<{width}}  [{info['source']:<9}] {info['path']}")
        return 0

    if args.cmd == "get":
        path = get_tool_path(args.tool_name, args.workspace)
        if path is None:
            if args.json:
                print(json.dumps({"tool": args.tool_name, "path": None}, ensure_ascii=False))
            return 1
        if args.json:
            print(json.dumps({"tool": args.tool_name, "path": path}, ensure_ascii=False))
        else:
            print(path)
        return 0

    if args.cmd == "set":
        cfg_path = set_tool_path(
            args.tool_name, args.tool_path, args.workspace, global_=args.global_
        )
        print(f"wrote {args.tool_name} -> {args.tool_path}  ({cfg_path})")
        return 0

    if args.cmd == "remove":
        ok = remove_tool_path(args.tool_name, args.workspace, global_=args.global_)
        print("removed" if ok else "not_found")
        return 0 if ok else 1

    if args.cmd == "paths":
        paths = {
            "workspace": str(workspace_config_path(args.workspace)),
            "global": str(user_config_path()),
        }
        if args.json:
            print(json.dumps(paths, indent=2, ensure_ascii=False))
        else:
            for k, v in paths.items():
                print(f"{k}: {v}")
        return 0

    return 2


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv[1:]))
