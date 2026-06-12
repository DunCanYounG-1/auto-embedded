# MCP 工具健康检查模式

> 辅助型模式 — 不替代 RIPER-5，在任意阶段可随时触发。

---

## 触发条件

用户输入包含以下关键词时触发：`检查工具` / `检查mcp` / `测试工具` / `mcp检查` / `工具诊断` / `healthcheck` / `check tools` / `检查所有mcp工具`

---

## 执行流程

### 第一步：收集工具清单

**仅检查本 skill（riper5）的 SKILL.md "辅助工具调用规范"和 `.auto-embedded/refs/mcp-tools.md` 中引用的 MCP 工具**，不检查其他无关工具。

**必测工具清单**（来源：SKILL.md 辅助工具调用规范表）：

| 序号 | 工具组 | 测试方法 | 预期结果 |
|------|--------|---------|---------|
| 1 | **Context7 MCP** | `mcp__context7__resolve-library-id` 查询 `react` | 返回库列表 |
| 2 | **Grok-Search（CLI Skill）** | `python ~/.claude/skills/grok-search/scripts/grok_search.py --query "test"` | 返回 JSON 含 content+sources |
| 3 | **Document Skills（/pdf）** | `uv run --with pypdf python -c "from pypdf import PdfReader; print('OK')"` | 输出 OK |
| 4 | **Document Skills（/xlsx）** | `uv run --with openpyxl python -c "import openpyxl; print('OK')"` | 输出 OK |
| 5 | **Sequential Thinking MCP** | 尝试调用 `mcp__sequential-thinking__*` 任一工具 | 返回结果或"工具不存在"错误 |
| 6 | **Embedded Debugger MCP** | 尝试调用任一工具 | 返回结果或"工具不存在"（硬件工具，不可用属正常） |
| 7 | **Serial MCP** | 尝试调用 `list_ports` | 返回结果或"工具不存在"（硬件工具，不可用属正常） |

### 第二步：逐一测试

对清单中的每个工具执行最小化测试调用：

1. **并行测试**：无依赖关系的工具应并行调用，加快检测速度
2. **超时处理**：单个工具测试超时视为不可用
3. **最小化调用**：使用最简单的参数，仅验证连通性，不消耗大量资源
4. **错误捕获**：记录每个工具的返回状态和错误信息

### 第三步：诊断与修复尝试

对于不可用的工具，按以下优先级尝试修复：

1. **配置问题**：检查 `~/.claude/settings.json` 和项目级 `.claude/settings.json` 中的 MCP server 配置
2. **权限问题**：检查 `.claude/settings.local.json` 中是否缺少工具权限
3. **依赖问题**：检查 MCP server 所需的 npm/pip 包是否安装
4. **网络问题**：如果是远程 MCP server，提示检查网络连接

**修复流程**：
```
if (工具不可用) {
    1. 读取相关配置文件，定位问题
    2. 如果是权限缺失 → 提示用户添加权限
    3. 如果是配置缺失 → 提示用户添加 MCP server 配置
    4. 如果是依赖缺失 → 提示安装命令
    5. 如果无法自动修复 → 记录问题详情，返回给用户
}
```

### 第四步：生成报告

以表格形式输出检测结果：

```
## MCP 工具健康检查报告

检查时间：YYYY-MM-DD HH:MM:SS

| 工具 | 状态 | 响应时间 | 备注 |
|------|------|---------|------|
| Context7 MCP | 正常 | ~2s | resolve-library-id 返回正常 |
| Grok-Search (CLI) | 正常 | ~5s | 搜索功能正常，返回 JSON |
| Document Skills (/pdf) | 正常 | ~1s | pypdf 可用 |
| Document Skills (/xlsx) | 正常 | ~1s | openpyxl 可用 |
| Sequential Thinking MCP | 正常 | ~1s | sequentialthinking 可用 |
| Embedded Debugger MCP | 未配置 | - | 硬件工具，需连接开发板后配置 |
| Serial MCP | 未配置 | - | 硬件工具，需连接开发板后配置 |

### 总结
- 可用工具：X/Y
- 需要修复：[列出问题和建议]
- 硬件工具（需连接设备）：[列出]
```

---

## 注意事项

- 硬件相关工具（Embedded Debugger、Serial MCP）未配置属于**正常状态**，仅在用户需要硬件联调时才需要配置
- 检查完成后**返回触发前的阶段**继续工作
- 如果在 RESEARCH 阶段触发，检查结果可用于更新容灾降级策略
