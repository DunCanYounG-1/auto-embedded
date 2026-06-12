# Git 备份与回档规则

> SKILL.md 保留触发词 + 4 条核心硬规则；本文是完整命令模板和敏感文件白名单。

---

## 触发词识别（全模式生效）

- **回档类**：`回档` / `回退` / `退回上一步` / `撤销上一步`
- **存档类**：`存档` / `保存进度` / `备份`

---

## 强制规则

1. 用户出现回档类指令时，优先执行 Git 回档流程，**禁止**通过手工改代码"假回退"
2. EXECUTE 阶段每完成一个实施清单项并获得用户确认后，执行一次**本地** Git 存档（只 commit，不 push）
3. 自动存档若检测到无文件变更（clean working tree），跳过提交并在 `编辑清单.md` / `edits.md` 记录"无变更，未提交"
4. **禁止自动 push**：自动存档仅 `git add` + `git commit` 到本地；**`git push` 必须由用户明确指令触发**
5. 自动存档前必须检测敏感文件，命中任一暂停存档：

   | 模式 | 含义 |
   |---|---|
   | `*.env` / `.env*` | 环境变量文件 |
   | `*.key` / `*.pem` | 私钥 |
   | `id_rsa*` | SSH 私钥 |
   | `*secret*` / `*token*` | 凭据相关命名 |
   | `*.pkcs12` / `*.p12` / `*.jks` | 密钥库 |

6. **不使用 `git add -A`**：按文件列表显式 `git add <file>...`（避免误带不该入库的本地配置 / 中间产物）

---

## 默认自动存档命令模板

```bash
# 1. 敏感文件预检（基于已 stage 的文件）
git diff --name-only --cached | \
  grep -iE '\.(env|key|pem|pkcs12|p12|jks)$|secret|token|id_rsa' && \
  { echo '[embedded-dev] 检测到敏感文件，暂停存档'; exit 1; }

# 2. 按 PLAN 清单列出的文件显式 add（非 -A）
git add <plan-listed-files>

# 3. commit（消息格式见下）
git commit -m "[AUTO-SNAPSHOT] 步骤N: <任务摘要>"

# 4. 注意：默认不执行 git push；用户说"push"再推
```

---

## 默认回档策略

- "上一步" 默认指最近一次自动存档提交（`HEAD` 对应的最近快照，回到 `HEAD~1` 的状态）
- **回档前先保护当前未提交改动**：
  ```bash
  git stash push -m "pre-rollback-<日期时间>"
  ```
- **默认使用保守回退**（不丢历史，新增一个反向 commit）：
  ```bash
  git revert --no-edit HEAD
  ```
- 仅当用户**明确要求**"强制退回上一提交且接受丢失改动"时，才允许：
  ```bash
  git reset --hard HEAD~1
  ```
- 回档完成后，必须同步更新 `编辑清单.md` / `edits.md`（记录回档前后 commit hash 与原因）

---

## Commit 消息约定

| 类型 | 前缀 | 用途 |
|---|---|---|
| 自动存档 | `[AUTO-SNAPSHOT]` | EXECUTE 阶段每个清单项完成后的自动 commit |
| 手动里程碑 | `[MILESTONE]` | 用户明确要求的里程碑提交 |
| 回档 | `[ROLLBACK]` | revert / reset 操作 |
| 修复 | `fix:` | 常规 bug 修复 |
| 新功能 | `feat:` | 新增功能 |
| 重构 | `refactor:` | 重构 |

---

## 远端 push 守则

- **不存在远端**：永远只本地 commit，不报错
- **存在远端**：commit 后**不自动 push**；等待用户说 `push` 才推
- **push 前必检**：
  - 工作树干净（`git status` 无未 add / 未 commit）
  - `git log` 显示要推的 commit 列表，用户能预览
  - 当前分支不是受保护分支（`main` / `master` 等），若是必须额外提示
- **永不**用 `--force` / `--force-with-lease`，除非用户**显式书面同意**

---

## 用户喊"push 之前先 codex 审一遍"等审查指令时

不是 push 前的"礼节性步骤"。审查发现的 Critical 必须先修。详见 SKILL.md 的"双模型擂台审查"实践。
