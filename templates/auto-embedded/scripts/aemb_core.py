#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
auto-embedded 运行时核心（被 .claude/hooks/aemb-*.py 与 .auto-embedded/scripts/*.py 共用）。

单一事实源：项目根定位、active task 解析、spec 索引读取、各类上下文渲染都集中在此，
避免 hook 之间逻辑漂移。所有读盘均显式 encoding="utf-8"（防 Windows cp936 损坏中文）。

它是"装进工程"的一部分：init 时被 aemb.py 拷进 <project>/.auto-embedded/scripts/。
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

ROOT_MARKER = ".auto-embedded"


# ---------------------------------------------------------------------------
# 路径与项目根定位（CWD 漂移健壮：子目录 / monorepo / Git-Bash 风格路径）
# ---------------------------------------------------------------------------
def normalize_shell_path(path_str: str) -> str:
    """把 Git-Bash/MSYS/Cygwin/WSL 的 /c/... 归一成 Windows C:\\...（仅 Windows）。"""
    if not isinstance(path_str, str) or not path_str:
        return path_str
    if not sys.platform.startswith("win"):
        return path_str
    p = path_str.strip()
    if re.match(r"^[A-Za-z]:[\\/]", p):
        return p
    for pat in (r"^/([A-Za-z])/(.*)", r"^/cygdrive/([A-Za-z])/(.*)", r"^/mnt/([A-Za-z])/(.*)"):
        m = re.match(pat, p)
        if m:
            drive, rest = m.group(1).upper(), m.group(2)
            return f"{drive}:\\" + rest.replace("/", "\\")
    return path_str


def find_project_root(start: Optional[str] = None) -> Optional[Path]:
    """从 start（默认 $CLAUDE_PROJECT_DIR 或 CWD）向上找含 .auto-embedded/ 的目录。"""
    if start is None:
        start = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    start = normalize_shell_path(start)
    try:
        cur = Path(start).resolve()
    except OSError:
        return None
    while cur != cur.parent:
        if (cur / ROOT_MARKER).is_dir():
            return cur
        cur = cur.parent
    if (cur / ROOT_MARKER).is_dir():
        return cur
    return None


def aemb_dir(root: Path) -> Path:
    return root / ROOT_MARKER


def _read_text(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def _read_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}


# ---------------------------------------------------------------------------
# 配置 / active task
# ---------------------------------------------------------------------------
def _clean_scalar(v: str) -> str:
    """清洗极简 YAML 标量：去行内 # 注释、去成对引号。"""
    v = v.strip()
    v = re.sub(r"\s+#.*$", "", v).strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
        v = v[1:-1]
    return v.strip()


def load_config(root: Path) -> dict:
    """极简 YAML 读取（只认我们自己写的扁平结构），无 PyYAML 依赖。
    容忍行内注释与引号；用户改坏结构时退化为空 spec_layers（SessionStart 会显示缺失）。"""
    cfg_path = aemb_dir(root) / "config.yaml"
    text = _read_text(cfg_path)
    cfg: dict = {"spec_layers": [], "raw": text}
    # 解析 spec_layers: 下的 "- name: xxx" / "  path: yyy"
    layer = None
    in_layers = False
    for line in text.splitlines():
        if re.match(r"^\s*spec_layers\s*:", line):
            in_layers = True
            continue
        if in_layers:
            if re.match(r"^\S", line) and not line.lstrip().startswith("-"):
                in_layers = False
                continue
            m = re.match(r"^\s*-\s*name\s*:\s*(.+?)\s*$", line)
            if m:
                if layer:
                    cfg["spec_layers"].append(layer)
                layer = {"name": _clean_scalar(m.group(1)), "path": ""}
                continue
            m = re.match(r"^\s*path\s*:\s*(.+?)\s*$", line)
            if m and layer is not None:
                layer["path"] = _clean_scalar(m.group(1))
    if layer:
        cfg["spec_layers"].append(layer)
    return cfg


# ---------------------------------------------------------------------------
# 配置化 hooks（config.yaml 的 hooks: 段）—— 任务生命周期事件可挂用户命令
# 依赖自由的嵌套 YAML 解析（对标 Trellis config.py parse_simple_yaml），不引入 PyYAML。
# 与上面的扁平 load_config 并存、互不影响（lowest-risk：新增而非改写 load_config）。
# ---------------------------------------------------------------------------
def _yaml_unquote(s: str) -> str:
    """剥掉最外层一对匹配引号（保留内部引号），不匹配则原样返回。"""
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        return s[1:-1]
    return s


def _yaml_strip_inline_comment(value: str) -> str:
    """剥 ` #` 行内注释，但保留引号内的 #（YAML 把『空格+#』视为注释起点）。"""
    in_quote = None
    for idx, ch in enumerate(value):
        if in_quote:
            if ch == in_quote:
                in_quote = None
            continue
        if ch in ('"', "'"):
            in_quote = ch
            continue
        if ch == "#" and (idx == 0 or value[idx - 1].isspace()):
            return value[:idx]
    return value


def _yaml_next_content_line(lines: list, start: int) -> tuple:
    i = start
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped and not stripped.startswith("#"):
            return i, lines[i]
        i += 1
    return i, ""


def _parse_yaml_block(lines: list, start: int, min_indent: int, target: dict) -> int:
    """把一段 YAML 解析进 target（按缩进判嵌套：深 2+ 空格=子级），返回下一行下标。
    支持 key: value（字符串）/ key:（后跟 - 列表）/ key:（后跟缩进嵌套 dict）。"""
    i = start
    current_list = None
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        indent = len(line) - len(line.lstrip())
        if indent < min_indent:
            break
        if stripped.startswith("- "):
            if current_list is not None:
                current_list.append(_yaml_unquote(stripped[2:].strip()))
            i += 1
        elif ":" in stripped:
            key, _, value = stripped.partition(":")
            key = key.strip()
            value = _yaml_unquote(_yaml_strip_inline_comment(value).strip())
            current_list = None
            if value:
                target[key] = value
                i += 1
            else:
                next_i, next_line = _yaml_next_content_line(lines, i + 1)
                if next_i >= len(lines):
                    target[key] = {}
                    i = next_i
                elif next_line.strip().startswith("- "):
                    current_list = []
                    target[key] = current_list
                    i += 1
                else:
                    next_indent = len(next_line) - len(next_line.lstrip())
                    if next_indent > indent:
                        nested: dict = {}
                        target[key] = nested
                        i = _parse_yaml_block(lines, i + 1, next_indent, nested)
                    else:
                        target[key] = {}
                        i += 1
        else:
            i += 1
    return i


def parse_yaml(text: str) -> dict:
    """依赖自由的简易嵌套 YAML 解析（只认我们自己写的结构：key:value / 列表 / 缩进嵌套 dict）。"""
    result: dict = {}
    _parse_yaml_block(text.splitlines(), 0, 0, result)
    return result


def get_hooks(root: Path, event: str) -> list:
    """读 config.yaml 的 hooks.<event> 命令列表（缺失/类型不符 → []）。"""
    cfg = parse_yaml(_read_text(aemb_dir(root) / "config.yaml"))
    hooks = cfg.get("hooks")
    if isinstance(hooks, dict) and isinstance(hooks.get(event), list):
        return [str(c) for c in hooks[event] if str(c).strip()]
    return []


def run_hooks(root: Path, event: str, extra_env=None) -> None:
    """跑某生命周期事件挂的 hook 命令（对标 Trellis run_task_hooks）。
    env 注入 TASK_JSON_PATH / AEMB_TASK_ID（+ 调用方 extra_env，如 AEMB_PHASE）；
    shell=True → 命令由宿主 OS shell 解释（Windows cmd.exe / POSIX sh）；
    capture_output 防交互卡死；非零退出只打 [WARN] 到 stderr，绝不阻断任务操作。"""
    import os
    import subprocess
    cmds = get_hooks(root, event)
    if not cmds:
        return
    env = {**os.environ}
    td = resolve_active_task(root)
    if td is not None:
        env["TASK_JSON_PATH"] = str(td / "task.json")
        env["AEMB_TASK_ID"] = td.name
    if extra_env:
        env.update({k: str(v) for k, v in extra_env.items()})
    for cmd in cmds:
        try:
            r = subprocess.run(cmd, shell=True, cwd=str(root), env=env,
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            if r.returncode != 0:
                print(f"[WARN] hook 失败（{event}）: {cmd}", file=sys.stderr)
                if (r.stderr or "").strip():
                    print(f"  {r.stderr.strip()}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"[WARN] hook 执行错误（{event}）: {cmd} — {e}", file=sys.stderr)


def runtime_dir(root: Path) -> Path:
    return aemb_dir(root) / ".runtime"


def tasks_dir(root: Path) -> Path:
    return aemb_dir(root) / "tasks"


def resolve_active_task(root: Path) -> Optional[Path]:
    """active task 解析顺序：
    1) .runtime/active_task 文件内的 task id
    2) 否则取 tasks/ 下 status != archived、mtime 最新的任务目录
    """
    at = runtime_dir(root) / "active_task"
    if at.is_file():
        tid = _read_text(at).strip()
        # 校验：active_task 内容必须是单段安全 id（防被手工污染成 ../ 在 tasks 外读写）
        if tid and "/" not in tid and "\\" not in tid and ".." not in tid:
            cand = tasks_dir(root) / tid
            if cand.is_dir():
                return cand
    best = None
    best_mtime = -1.0
    td = tasks_dir(root)
    if td.is_dir():
        for d in td.iterdir():
            if not d.is_dir():
                continue
            tj = _read_json(d / "task.json")
            if tj.get("status") == "archived":
                continue
            try:
                mt = (d / "task.json").stat().st_mtime
            except OSError:
                mt = d.stat().st_mtime if d.exists() else -1.0
            if mt > best_mtime:
                best, best_mtime = d, mt
    return best


def read_task(task_dir: Optional[Path]) -> dict:
    if task_dir is None:
        return {}
    return _read_json(task_dir / "task.json")


def developer(root: Path) -> str:
    """开发者身份（aemb init -u 写入 .auto-embedded/.developer）。"""
    return _read_text(aemb_dir(root) / ".developer").strip()


# ---------------------------------------------------------------------------
# 跨会话叙事记忆（workspace/journal.md）—— 对标 Trellis 的 journal
# ---------------------------------------------------------------------------
def workspace_dir(root: Path) -> Path:
    return aemb_dir(root) / "workspace"


def journal_path(root: Path) -> Path:
    return workspace_dir(root) / "journal.md"


def read_journal_entries(root: Path, n: int = 3) -> list:
    """返回最近 n 条 journal 条目（每条是以 '## ' 开头的块），新→旧。"""
    text = _read_text(journal_path(root))
    if not text:
        return []
    blocks, cur = [], []
    for line in text.splitlines():
        if line.startswith("## "):
            if cur:
                blocks.append("\n".join(cur).strip())
            cur = [line]
        elif cur:
            cur.append(line)
    if cur:
        blocks.append("\n".join(cur).strip())
    return list(reversed(blocks))[:n]


# ---------------------------------------------------------------------------
# 注入预算（G：token 预算控制 / H：懒加载）
# ---------------------------------------------------------------------------
# 默认值（字符数，近似 token×3~4）。优先级：环境变量 > config.yaml inject_budget > 默认。
_DEFAULT_BUDGET = {
    "subagent_total": 16000,   # 子 Agent 单次注入所有 spec 的总上限
    "per_file": 6000,          # 单文件上限
}


def inject_budget(root: Path, key: str) -> int:
    """读注入预算：env AEMB_BUDGET_<KEY> > config.yaml inject_budget.<key> > 默认。"""
    env = os.environ.get(f"AEMB_BUDGET_{key.upper()}")
    if env and env.isdigit():
        return int(env)
    # config.yaml 里的 inject_budget: 段（极简解析：行内 "key: 数字"）
    text = _read_text(aemb_dir(root) / "config.yaml")
    in_sec = False
    for line in text.splitlines():
        if re.match(r"^\s*inject_budget\s*:\s*$", line):
            in_sec = True
            continue
        if in_sec:
            if re.match(r"^\S", line):  # 回到顶层键，段结束
                break
            m = re.match(rf"^\s*{re.escape(key)}\s*:\s*(\d+)\s*(?:#.*)?$", line)
            if m:
                return int(m.group(1))
    return _DEFAULT_BUDGET.get(key, 6000)


# ---------------------------------------------------------------------------
# spec 索引 / hw-lock 摘要
# ---------------------------------------------------------------------------
def spec_index(root: Path) -> list:
    """返回 [{name, path, title}]，title 取该层 index.md 首个标题行。"""
    cfg = load_config(root)
    out = []
    for layer in cfg.get("spec_layers", []):
        rel = layer.get("path", "")
        idx = aemb_dir(root) / rel / "index.md" if rel else None
        title = ""
        if idx and idx.is_file():
            for line in _read_text(idx).splitlines():
                if line.startswith("#"):
                    title = line.lstrip("#").strip()
                    break
        out.append({"name": layer.get("name", rel), "path": rel, "title": title,
                    "exists": bool(idx and idx.is_file())})
    return out


def hw_lock_summary(root: Path) -> str:
    """硬件资源锁定摘要（机器可读 spec：pins/dma/irq/timers 数量）。"""
    f = aemb_dir(root) / "spec" / "hardware" / "hw-lock.yaml"
    text = _read_text(f)
    if not text:
        return ""
    counts = {}
    for key in ("pins", "dma", "irq", "timers"):
        # 统计该 section 下的 "- " 列表项
        n = 0
        in_sec = False
        for line in text.splitlines():
            if re.match(rf"^\s*{key}\s*:\s*$", line):
                in_sec = True
                continue
            if in_sec:
                if re.match(r"^\s*\w+\s*:\s*$", line) and not re.match(rf"^\s*{key}\s*:", line):
                    in_sec = False
                    continue
                if re.match(r"^\s*-\s", line):
                    n += 1
        counts[key] = n
    return " ".join(f"{k}={v}" for k, v in counts.items())


def _hw_lock_items(text: str) -> dict:
    """从 hw-lock.yaml 解析每个 section 的条目列表。
    兼容 inline flow (`- {id: PA0, owner: x}`) 与 block 多行 (`- id: PA0`\\n`    owner: x`)。
    返回 {section: [ {字段...}, ... ]}。无 PyYAML 依赖。"""
    sections = {"pins": [], "dma": [], "irq": [], "timers": []}
    cur = None
    item = None

    def _flush():
        nonlocal item
        if cur and item:
            sections[cur].append(item)
        item = None

    def _parse_fields(s):
        # 从 "id: PA0, owner: x" 或 "{id: PA0, owner: x}" 提取 k:v
        # 先剥 YAML 行内注释（空白后的 #...），否则 "id: PA0 # x" 会被当成与 "id: PA0" 不同的值 → 漏报冲突
        s = re.sub(r"\s+#.*$", "", s)
        s = s.strip().lstrip("{").rstrip("}")
        out = {}
        for pair in s.split(","):
            if ":" in pair:
                k, _, v = pair.partition(":")
                k = k.strip()
                v = v.strip().strip("'\"")
                if k:
                    out[k] = v
        return out

    for raw in text.splitlines():
        line = raw.rstrip()
        # 去整行注释
        if re.match(r"^\s*#", line) or not line.strip():
            continue
        m = re.match(r"^([a-z_]+)\s*:\s*$", line)
        if m and m.group(1) in sections:
            _flush()
            cur = m.group(1)
            continue
        if cur is None:
            continue
        mi = re.match(r"^\s*-\s*(.*)$", line)
        if mi:
            _flush()
            item = _parse_fields(mi.group(1))
        elif item is not None:
            # block 续行字段
            item.update(_parse_fields(line))
    _flush()
    return sections


def hw_lock_conflicts(root: Path) -> list:
    """检测 hw-lock.yaml 的资源冲突，返回违规字符串列表（空=无冲突）。
    规则：pins.id / dma.stream / irq.irqn / timers.id 不可重复；
    irq 的 (priority_preempt, priority_sub) 不可重复。"""
    f = aemb_dir(root) / "spec" / "hardware" / "hw-lock.yaml"
    text = _read_text(f)
    if not text:
        return []
    secs = _hw_lock_items(text)
    out = []

    def _dup(section, key, label):
        seen = {}
        for it in secs.get(section, []):
            v = it.get(key)
            if not v:
                continue
            seen.setdefault(v, 0)
            seen[v] += 1
        for v, n in seen.items():
            if n > 1:
                out.append(f"[HW-CONFLICT] {section}: {label} {v} 重复 {n} 次")

    _dup("pins", "id", "pin")
    _dup("dma", "stream", "stream")
    _dup("irq", "irqn", "irqn")
    _dup("timers", "id", "timer")

    # irq 优先级冲突（同一 preempt/sub 组合）
    pri = {}
    for it in secs.get("irq", []):
        pp, ps = it.get("priority_preempt"), it.get("priority_sub")
        if pp is not None and ps is not None and pp != "" and ps != "":
            k = f"{pp}/{ps}"
            pri.setdefault(k, [])
            pri[k].append(it.get("irqn", "?"))
    for k, owners in pri.items():
        if len(owners) > 1:
            out.append(f"[HW-CONFLICT] irq: 优先级 {k} 被多个中断占用（{', '.join(owners)}）")
    return out


# ---------------------------------------------------------------------------
# 输出（Claude Code hook：纯文本 stdout 即被注入 SessionStart/UserPromptSubmit 上下文）
# ---------------------------------------------------------------------------
def force_utf8_streams() -> None:
    """把 stdin/stdout/stderr 三条流都切到 UTF-8（仅 Windows）。两类崩溃都要防：
      · 读 stdin —— hook 载荷（任务名/prd 含中文）在 cp936/cp1252 下 json.load(sys.stdin) 抛 UnicodeDecodeError；
      · 写 stdout/stderr —— ✓✗ 与中文在 gbk 下 UnicodeEncodeError。
    reconfigure 为 Py3.7+ 接口，老解释器回退到 TextIOWrapper(detach())；errors='replace' 保证单个坏字节降级不中断整个 hook。"""
    if not sys.platform.startswith("win"):
        return
    import io as _io
    for _name in ("stdin", "stdout", "stderr"):
        stream = getattr(sys, _name, None)
        if stream is None:
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        except Exception:
            try:
                setattr(sys, _name, _io.TextIOWrapper(stream.detach(), encoding="utf-8", errors="replace"))
            except Exception:
                pass


# 向后兼容别名：task.py/check.py/emit() 等旧调用点继续用 force_utf8_stdout，现也覆盖 stdin。
force_utf8_stdout = force_utf8_streams

# 导入即生效（仅 Windows）：保证任何 `import aemb_core` 的 hook 在 json.load(sys.stdin) 之前 stdin 已是 UTF-8。
# reconfigure 必须在任何读取之前完成，否则缓冲区错乱——hook 均在 import 之后才读 stdin，故此处安全。
if sys.platform.startswith("win"):
    force_utf8_streams()


def emit(text: str) -> None:
    """把上下文打到 stdout —— Claude Code 的 SessionStart / UserPromptSubmit / PreToolUse
    会把 hook 的 stdout 注入到模型上下文。空文本则静默退出（不污染）。"""
    if not text:
        return
    force_utf8_stdout()
    sys.stdout.write(text if text.endswith("\n") else text + "\n")


def should_skip() -> bool:
    """非交互 / 显式关闭时跳过注入。"""
    if os.environ.get("AEMB_HOOKS") == "0" or os.environ.get("AEMB_DISABLE_HOOKS") == "1":
        return True
    for v in ("CLAUDE_NON_INTERACTIVE",):
        if os.environ.get(v):
            return True
    return False
