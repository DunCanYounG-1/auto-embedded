#!/usr/bin/env python
"""知乎站内搜索工具（仅依赖 Python 标准库）。

为 auto-embedded 的 `aemb-zhihu-search` 工具技能提供可重复调用的执行入口：

- 调用知乎开放平台 `GET /api/v1/content/zhihu_search`
- Bearer 鉴权（`ZHIHU_ACCESS_SECRET`）+ 秒级时间戳头 `X-Request-Timestamp`
- 把响应整理成精简、稳定的 JSON 结构，便于下游 skill / subagent 消费

移植自官方 zhihu-search skill，额外强制 UTF-8 stdout，修复 Windows 下
重定向/管道时默认 GBK 编码导致的 UnicodeEncodeError 崩溃。
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, NoReturn
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# Windows 默认 stdout 走 GBK，遇到 ・ 等字符在重定向/管道时会 UnicodeEncodeError。
# 框架内工具统一强制 UTF-8，保证跨平台一致。
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_BASE_URL = "https://developer.zhihu.com"
REQUEST_TIMEOUT_SECONDS = 8


def print_usage() -> None:
    print(
        "Usage:\n"
        "  python zhihu_search.py "
        '\'{"query":"STM32 HAL 串口DMA 空闲中断","count":5}\'\n\n'
        "Environment:\n"
        "  ZHIHU_ACCESS_SECRET      Bearer 鉴权密钥（必填）\n"
        "  ZHIHU_OPENAPI_BASE_URL   可选，默认 https://developer.zhihu.com\n"
        "  ZHIHU_ZHIHU_SEARCH_URL   可选，完整 endpoint 覆盖（预发/代理/网关）\n"
    )


def die(message: str, *, body: Any | None = None, code: str | None = None) -> NoReturn:
    payload: Dict[str, Any] = {"error": message, "exit_code": 1}
    if code is not None:
        payload["triage"] = code
    if body is not None:
        payload["body"] = body
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(1)


def parse_payload(raw: str) -> Dict[str, Any]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        die("Invalid JSON payload", code="ambiguous-context")
    if not isinstance(data, dict):
        die("Invalid JSON payload", code="ambiguous-context")
    return data


def parse_query(payload: Dict[str, Any]) -> str:
    query = payload.get("query") or payload.get("Query") or ""
    if not isinstance(query, str) or not query.strip():
        die("query is required", code="ambiguous-context")
    return query.strip()


def parse_count(payload: Dict[str, Any]) -> int:
    raw = payload.get("count", payload.get("Count", 10))
    try:
        count = int(raw)
    except (TypeError, ValueError):
        count = 10
    return max(1, min(10, count))


def get_endpoint() -> str:
    explicit = os.getenv("ZHIHU_ZHIHU_SEARCH_URL", "").strip()
    if explicit:
        return explicit
    base_url = os.getenv("ZHIHU_OPENAPI_BASE_URL", DEFAULT_BASE_URL).strip()
    return f"{base_url.rstrip('/')}/api/v1/content/zhihu_search"


def build_result(api_resp: Dict[str, Any]) -> Dict[str, Any]:
    data = api_resp.get("Data") if isinstance(api_resp.get("Data"), dict) else {}
    items = data.get("Items") if isinstance(data.get("Items"), list) else []
    normalized_items = []
    for item in items:
        if not isinstance(item, dict):
            continue
        normalized_items.append(
            {
                "title": item.get("Title", ""),
                "url": item.get("Url", ""),
                "author_name": item.get("AuthorName", ""),
                "summary": item.get("ContentText", ""),
                "vote_up_count": item.get("VoteUpCount", 0),
                "comment_count": item.get("CommentCount", 0),
                "edit_time": item.get("EditTime", 0),
            }
        )

    return {
        "code": api_resp.get("Code", -1),
        "message": api_resp.get("Message", ""),
        "item_count": len(normalized_items),
        "items": normalized_items,
    }


def request_zhihu(query: str, count: int) -> Dict[str, Any]:
    secret = os.getenv("ZHIHU_ACCESS_SECRET", "").strip()
    if not secret:
        die("Set ZHIHU_ACCESS_SECRET first (Bearer auth only)", code="environment-missing")

    params = urlencode({"Query": query, "Count": str(count)})
    url = f"{get_endpoint()}?{params}"
    req = Request(
        url=url,
        method="GET",
        headers={
            "Authorization": f"Bearer {secret}",
            "X-Request-Timestamp": str(int(time.time())),
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            body_text = resp.read().decode("utf-8", errors="replace")
    except HTTPError as err:
        body_text = err.read().decode("utf-8", errors="replace")
        triage = "rate-limited" if err.code == 429 else (
            "auth-failure" if err.code in (401, 403) else "network-failure"
        )
        die(f"HTTP {err.code}", body=body_text, code=triage)
    except (URLError, TimeoutError):
        die("HTTP request failed (timeout or network error)", code="network-failure")

    try:
        return json.loads(body_text)
    except json.JSONDecodeError:
        die("Non-JSON response from API", code="network-failure")


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] in {"-h", "--help"}:
        print_usage()
        return

    if len(sys.argv) < 2:
        print_usage()
        raise SystemExit(1)

    payload = parse_payload(sys.argv[1])
    query = parse_query(payload)
    count = parse_count(payload)

    api_resp = request_zhihu(query, count)

    result = build_result(api_resp)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
