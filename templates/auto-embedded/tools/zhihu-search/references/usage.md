# 知乎搜索 Skill 用法

这个 skill 自带了一个可执行脚本 [scripts/zhihu_search.py](../scripts/zhihu_search.py)，调用知乎开放平台 `GET /api/v1/content/zhihu_search`，把响应整理成精简、稳定的 JSON 结构。仅依赖 Python 标准库。

## 能力概览

- Bearer Access Secret + `X-Request-Timestamp` 时间戳头鉴权
- 单发检索：传入 `query` 与可选 `count`（自动夹到 1-10）
- 输出归一化字段：`title` / `url` / `author_name` / `summary` / `vote_up_count` / `comment_count` / `edit_time`
- 强制 UTF-8 stdout，跨平台（含 Windows 重定向/管道）输出稳定
- 错误以 JSON + `triage` 字段返回，便于自动分流

## 鉴权配置

在知乎开放平台[个人中心](https://developer.zhihu.com/profile)获取 Access Secret，配置到环境变量：

```bash
# Linux / macOS
export ZHIHU_ACCESS_SECRET="你的_access_secret"

# Windows PowerShell
$env:ZHIHU_ACCESS_SECRET = "你的_access_secret"
```

可选覆盖：

- `ZHIHU_OPENAPI_BASE_URL`：默认 `https://developer.zhihu.com`
- `ZHIHU_ZHIHU_SEARCH_URL`：完整 endpoint 覆盖，设置后优先于 base_url + 默认 path（预发/代理/网关）

## 基础用法

```bash
# 检索 5 条
python .auto-embedded/tools/zhihu-search/scripts/zhihu_search.py \
  '{"query":"STM32 HAL 串口DMA 空闲中断","count":5}'

# 仅看用法
python .auto-embedded/tools/zhihu-search/scripts/zhihu_search.py --help
```

> 框架内统一用 `{{PYTHON_CMD}}` 代替 `python` / `python3`，由各平台 hook 注入解释器。

## 输入约定

传入单个 JSON 参数：

```json
{"query":"...", "count":10}
```

规则：

- `query` 必填、非空（会自动 `strip`；也兼容大写 `Query`）。
- `count` 可选，默认 10，自动夹到 1-10（兼容大写 `Count`）。

## 输出约定

### 成功

```json
{
  "code": 0,
  "message": "success",
  "item_count": 3,
  "items": [
    {"title":"...","url":"https://...","author_name":"...","summary":"...","vote_up_count":34,"comment_count":16,"edit_time":1711549514}
  ]
}
```

### 失败

返回带 `error` 与 `triage` 的 JSON，`exit_code=1`：

```json
{"error":"Set ZHIHU_ACCESS_SECRET first (Bearer auth only)","exit_code":1,"triage":"environment-missing"}
{"error":"query is required","exit_code":1,"triage":"ambiguous-context"}
{"error":"HTTP 403","exit_code":1,"triage":"auth-failure","body":"Forbidden"}
{"error":"HTTP 429","exit_code":1,"triage":"rate-limited","body":"..."}
{"error":"HTTP request failed (timeout or network error)","exit_code":1,"triage":"network-failure"}
```

## 故障排查

### environment-missing

未设置 `ZHIHU_ACCESS_SECRET`。先按上面「鉴权配置」导入环境变量。

### auth-failure（401/403）

Access Secret 失效、被吊销或无该接口权限。到开放平台个人中心重新获取，并确认接口已开通。

### rate-limited（429）

触发频控。降低调用频率、合并查询，退避后重试。

### network-failure

超时或连接失败。检查外网连通性、代理设置；必要时用 `ZHIHU_ZHIHU_SEARCH_URL` 指向可达网关。

### 输出中文乱码

脚本已强制 UTF-8 stdout。若仍乱码，多半是终端显示编码（如 Windows 控制台 GBK）问题，把输出重定向到文件再用 UTF-8 读取即可，JSON 本身是正确的。

## 与 Skill 的配合方式

在 `aemb-zhihu-search` skill 中，推荐工作流是：

1. 根据用户问题构造精准 `query`，必要时多关键词分批检索。
2. 读取脚本输出，按 `vote_up_count` / 时效（`edit_time`）筛选高质量结果。
3. 把关键结论与来源链接整理成要点，写回 `Project Profile`，而非原样转贴整段 JSON。
4. 需要多源交叉核实时交给 `deep-research`；涉及具体器件/寄存器时交给对应工具落地。
