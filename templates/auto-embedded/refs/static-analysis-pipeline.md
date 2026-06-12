# 静态检查管线（cppcheck + clang-tidy + lizard）

> 用途：REVIEW 阶段把 `embedded-architecture.md §7` 的"依赖方向检查表"从**人眼读 `#include`** 升级为**机械化检查**，把代码屎山预警从主观判断升级为客观指标。
>
> **核心原则**：本管线**不强制 MISRA / CERT-C 全集**，只覆盖 32 位通用 MCU 项目（GD32 / STM32 / MSPM0G3507）实用范围。

---

## 0. 三件套定位

| 工具 | 职责 | 落地优先级 |
|---|---|---|
| **cppcheck** | 静态缺陷检测（空指针 / 越界 / 内存泄漏 / MISRA 必要子集） | **P0** 必跑 |
| **clang-tidy** | 风格 + 复杂度 + 现代 C 警告 + 可选 `cert-*` / `bugprone-*` | **P0** 必跑 |
| **lizard** | 圈复杂度（CCN）+ 函数长度 + 参数数 + 重复块 | **P1** 推荐 |

> 商业工具（LDRA / Polyspace / Parasoft）不在本管线范围 — 那是付费/认证领域。

---

## 1. cppcheck（核心缺陷扫描）

### 1.1 安装

| 平台 | 命令 |
|---|---|
| Windows | 下载 <https://cppcheck.sourceforge.io/>，安装后加入 PATH |
| Linux | `apt install cppcheck` / `pacman -S cppcheck` |
| macOS | `brew install cppcheck` |

> ≥ v2.13 推荐，老版本对 MISRA 2012/2023 支持不完整。

### 1.2 嵌入式项目调用模板

```bash
cppcheck \
  --enable=warning,style,performance,portability,information \
  --inconclusive \
  --std=c11 \
  --platform=unix32 \
  --suppress=missingIncludeSystem \
  --suppress=unusedFunction:libraries/* \
  --suppress=*:libraries/sdk/* \
  --suppress=*:libraries/zf_driver/* \
  --suppress=*:libraries/zf_device/* \
  -I libraries/zf_common \
  -I libraries/zf_driver \
  -I libraries/zf_device \
  -I project/code \
  --xml --xml-version=2 \
  project/code/ project/user/ \
  2> build/cppcheck-report.xml
```

**要点解释**：
- `--platform=unix32`：32 位 MCU 默认平台模型（`int=4`, `pointer=4`）
- 三方库目录全 `--suppress=*:` — 厂商代码不背锅，**只检查用户代码**
- `--xml`：方便 CI / 后处理；交互式调试改用 `--template=gcc`

### 1.3 MISRA C 2012 规则矩阵（Mandatory，对齐 MISRA Compliance:2020）

`cppcheck --addon=misra --addon-options=--misra-rules-file=.misra-rules.txt` 启用。下表是 **32 位通用 MCU 项目默认子集**：分 Mandatory / Required / Advisory 三级，每条标注工具覆盖（C=cppcheck, T=clang-tidy, A=arch-check.sh, M=人工）。

#### Mandatory（强制，违反即 FAIL，无偏差余地）

| 规则 | 内容 | 工具 |
|---|---|---|
| Dir 1.1 | 实现定义行为必须文档化 | M |
| Dir 4.7 | 函数返回错误信息必须被测试 | T (`bugprone-unused-return-value`) |
| Rule 1.1 | C 语言版本与扩展声明 | C/M（含 `static_assert(__STDC_VERSION__ >= 201112L)`） |
| Rule 1.3 | 实现定义/未定义行为禁止 | C |
| Rule 2.1 | 不可达代码禁止 | C (`unreachableCode`) |
| Rule 2.2 | 死代码禁止 | C/T (`bugprone-unused-*`) |
| Rule 9.1 | 自动变量使用前初始化 | C/T (`cppcoreguidelines-init-variables`) |
| Rule 13.1 | 初始化列表无副作用 | C |
| Rule 13.6 | sizeof 操作数无副作用 | C |
| Rule 17.3 | 函数原型不可省略 | C |
| Rule 18.6 | 自动变量地址不可逃逸作用域 | C |
| Rule 21.21 | `system()` 禁用 | C/T |
| Rule 22.x | 资源管理（FILE/dyn-mem/线程） | C |

#### Required（要求，违反需 deviation record，见 §4.5.4）

| 规则 | 内容 | 工具 |
|---|---|---|
| Dir 4.1 | 运行期错误最小化 | M |
| Dir 4.12 | 动态内存默认禁用 | M（与 §13.1 联动） |
| Dir 4.13 | 资源 acquire/release 配对 | M |
| Rule 5.1-5.9 | 标识符显著字符 / 唯一性 / 命名冲突 | C/T (`readability-identifier-naming`) |
| Rule 6.1 | 位域基础类型 unsigned | C |
| Rule 8.4 | 外部链接必须前置声明 | C |
| Rule 8.7 | 单翻译单元函数必须 `static` | C/A（部分） |
| Rule 8.13 | 指针参数可加 const 时必须加 | T (`misc-misplaced-const`) |
| Rule 10.1-10.8 | essential type model（整型转换） | C |
| Rule 11.1-11.6 | 指针转换约束 | C |
| Rule 12.x | 表达式 | C |
| Rule 13.2-13.5 | 副作用 / 序列点 | C |
| Rule 14.1-14.4 | 控制流可达性 / 循环条件 | C |
| Rule 15.x | switch 完整性 | C |
| Rule 17.2 | 禁止递归（直接 + 相互） | C/A |
| Rule 17.7 | 非 void 返回值必须使用 | T (`bugprone-unused-return-value`) |
| Rule 18.1-18.5 | 指针运算 / 数组越界 | C |
| Rule 18.8 | VLA 禁止 | C/T |
| Rule 19.1 | union 访问字段写 ≠ 读 | C |
| Rule 20.1-20.14 | 预处理器规范 | C |
| Rule 21.1-21.6 | 标准库限制（含 setjmp/atexit/system） | C |
| Rule 21.20 | 函数指针不指 NULL | C |

#### Advisory（建议，仅 hint，不阻塞 CI）

| 规则 | 内容 |
|---|---|
| Rule 8.9 | 仅在一处用的对象 `static` |
| Rule 11.9 | NULL 字面量统一 |
| Rule 15.5 | 单一 return 点（争议，默认关） |
| Rule 17.4 | 非 void 函数所有路径有 return |

> **完整矩阵文件**：项目根 `.misra-rules.txt` 列出所有 Mandatory + Required 条目，每行 `misra-c2012-<rule>`。CI 比对配置文件 hash 防偷改。

### 1.3.1 与其他规范对照

| 本规范 P 级 | MISRA 分类 | JPL Power of 10 | CERT-C 优先级 |
|---|---|---|---|
| **P0 Mandatory** | Mandatory + 核心 Required | Rules 1/2/3/10 | L1 (high severity) |
| **P1 Required** | Required + 关键 Advisory | Rules 4/5/9 | L2 |
| **P2 Advisory** | Advisory | Rules 6/7/8 | L3 |

### 1.4 接入 RIPER-5

- **PLAN 阶段**：实施清单加一项 `跑 cppcheck，0 error + 已知警告说明`
- **REVIEW 阶段**：cppcheck 输出**必须**附在证据包中，否则不视为完成
- **失败处置**：警告分两类
  - 真问题（空指针 / 越界 / 类型 punning）→ 回 EXECUTE 修
  - 误报 → 加 `// cppcheck-suppress <rule> // reason: <原因>`，**禁止**全局关规则

---

## 2. clang-tidy（风格 + 复杂度 + bug 模式）

### 2.1 安装

随 LLVM 工具链安装：
- Windows：<https://github.com/llvm/llvm-project/releases>，选 `LLVM-<ver>-win64.exe`
- Linux：`apt install clang-tidy`
- macOS：`brew install llvm`（注意加 PATH）

### 2.2 嵌入式项目 `.clang-tidy` 模板

放在项目根：

```yaml
---
Checks: >
  bugprone-*,
  cert-*,
  -cert-msc30-c,
  -cert-msc50-cpp,
  clang-analyzer-*,
  misc-*,
  performance-*,
  readability-*,
  -readability-identifier-length,
  -readability-magic-numbers,
  -readability-isolate-declaration,
  portability-*

WarningsAsErrors: 'bugprone-*,cert-*,clang-analyzer-*'

HeaderFilterRegex: '^(?!.*(libraries/sdk|libraries/zf_driver|libraries/zf_device)).*$'

CheckOptions:
  - key: readability-function-cognitive-complexity.Threshold
    value: '25'
  - key: readability-function-size.LineThreshold
    value: '50'
  - key: readability-function-size.ParameterThreshold
    value: '3'
  - key: readability-function-size.StatementThreshold
    value: '50'
  - key: readability-function-size.NestingThreshold
    value: '2'
  - key: bugprone-easily-swappable-parameters.MinimumLength
    value: '3'
```

**要点**：
- `bugprone-*` / `cert-*` / `clang-analyzer-*` 设为 error（不通过 CI）
- `HeaderFilterRegex` 排除厂商库，避免噪音
- `function-size` 阈值对齐 `refs\coding-standards.md` 的"函数 ≤ 50 行 / 嵌套 ≤ 2 / 参数 ≤ 3"

### 2.3 调用

```bash
# 单文件
clang-tidy project/code/app/app_pid.c -- -I libraries/zf_common -I project/code

# 全项目（需要 compile_commands.json，CMake 项目用 -DCMAKE_EXPORT_COMPILE_COMMANDS=ON 生成）
run-clang-tidy.py -p build/ 'project/code/.*' > build/clang-tidy-report.txt
```

**Keil 工程**：没有 compile_commands.json，用 [bear](https://github.com/rizsotto/Bear) 或手动 `--`-后参数传 include 路径。简单做法：

```bash
clang-tidy project/code/app/*.c -- \
  -DMSPM0G3507 \
  -I libraries/sdk \
  -I libraries/zf_common \
  -I libraries/zf_driver \
  -I libraries/zf_device \
  -I project/code \
  --target=arm-none-eabi -mcpu=cortex-m0plus
```

---

## 3. lizard（量化复杂度）

### 3.1 安装

```bash
pip install lizard
```

### 3.2 调用

```bash
lizard project/code/ \
  --CCN 10 \
  --length 50 \
  --arguments 3 \
  --modified \
  -x "libraries/*" \
  -x "build/*" \
  > build/lizard-report.txt
```

**输出指标**：
| 列 | 含义 | 阈值 |
|---|---|---|
| NLOC | 不含空行注释的代码行数 | 函数 ≤ 50 |
| CCN | 圈复杂度（McCabe） | ≤ 10 |
| token | token 数量 | — |
| PARAM | 参数个数 | ≤ 3 |
| length | 含注释总长度 | — |

任一超阈值 → 函数需要拆。

### 3.3 重复代码检测

```bash
lizard project/code/ --duplicate 6 > build/duplicate-report.txt
```

连续 6 行以上重复 → 提炼函数或表驱动。

---

## 3.5 嵌入式专项：`arch-check.sh` + `include-graph.py`（本 skill 自带）

> cppcheck / clang-tidy / lizard 是通用 C 工具，**不识别嵌入式分层概念**。本 skill 自带两个嵌入式专项扫描工具，**必须**与三件套一起跑。

### 3.5.1 `scripts/arch-check.sh` — 7 项硬规则

来源：`.auto-embedded/scripts/arch-check.sh`（POSIX bash，跨平台）

| 编号 | 检查 |
|---|---|
| ARCH-1 | 应用层 include 厂商头 |
| ARCH-2 | main() 顶层调用 ≤ 6 |
| ARCH-3 | ISR / 回调函数体 ≤ 20 行 |
| ARCH-4 | 应用层 extern 变量 = 0 |
| ARCH-5 | 单 .c 文件 ≤ 800 行 |
| ARCH-6 | 单 .h 公共 API ≤ 20 |
| ARCH-7 | mega-header 检测（≥ 10 个 include） |

```bash
# 在工程根目录运行
bash .auto-embedded/scripts/arch-check.sh
# stdout = 违规列表；stderr = 进度 + 汇总；exit 0/1
```

### 3.5.2 ` — include DAG 反向依赖检测

来源：`（Python 3，stdlib only）

机械化判定 6 层模型（L0~L6 + L1a 适配器），检测：
- 厂商头穿透（任意 L2+ include L0，除 L1a 适配器）
- 反向依赖（下层 include 上层）
- 跨层跳跃（app 层直接 include bsp 层）

```bash
python  [project_root]
# stdout = 违规边列表；stderr = 层级文件数 + 边总数 + 汇总；exit 0/1
```

---

## 4. 统一调用：`scripts/check.sh`（Mandatory：失败必须 exit ≠ 0）

> **门禁原则**：每个工具结果都参与 `RC` 累加，**禁止** `|| true` 吞掉退出码。仅日志重定向用 `|| RC=$((RC|N))` 累记失败位。

```bash
#!/usr/bin/env bash
set -u                       # 注意：不用 -e；我们自己累加 RC
# set -e 会让 grep 0 匹配返回 1 也炸；改用显式 RC 位

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"
mkdir -p build

SKILL_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/embedded-dev}"
RC=0   # 失败位：bit0=arch, bit1=include, bit2=cppcheck, bit3=tidy, bit4=lizard

echo "=== [1/5] arch-check.sh ==="
bash .auto-embedded/scripts/arch-check.sh > build/arch-check.log 2>&1
[ $? -ne 0 ] && RC=$((RC | 1))

echo "=== [2/5] .auto-embedded/tools/include-graph.py ==="
python " . > build/include-graph.log 2>&1
[ $? -ne 0 ] && RC=$((RC | 2))

echo "=== [3/5] cppcheck ==="
cppcheck --error-exitcode=2 \
  --enable=warning,style,performance,portability \
  --std=c11 --platform=unix32 \
  --suppress=*:libraries/* \
  -I libraries/zf_common -I libraries/zf_driver -I libraries/zf_device \
  -I project/code \
  project/code/ project/user/ \
  2> build/cppcheck.log
[ $? -ne 0 ] && RC=$((RC | 4))

echo "=== [4/5] clang-tidy ==="
clang-tidy --warnings-as-errors='bugprone-*,cert-*,clang-analyzer-*' \
  project/code/**/*.c -- \
  -I libraries/sdk -I libraries/zf_common -I libraries/zf_driver \
  -I libraries/zf_device -I project/code \
  --target=arm-none-eabi -mcpu=cortex-m0plus \
  > build/clang-tidy.log 2>&1
[ $? -ne 0 ] && RC=$((RC | 8))

echo "=== [5/5] lizard ==="
lizard project/code/ --CCN 10 --length 50 --arguments 3 \
  -x "libraries/*" -x "build/*" \
  > build/lizard.log
[ $? -ne 0 ] && RC=$((RC | 16))

echo ""
echo "=== 汇总 ==="
echo "arch-check  violations: $(grep -c '^\[ARCH-'        build/arch-check.log    || echo 0)"
echo "layer       violations: $(grep -c '^\[LAYER-VIOL\]' build/include-graph.log || echo 0)"
echo "cppcheck    issues:     $(grep -cE '(error|warning)' build/cppcheck.log     || echo 0)"
echo "clang-tidy  issues:     $(grep -cE '(error|warning)' build/clang-tidy.log   || echo 0)"
echo "lizard      violations: $(grep -cE '^!!!'            build/lizard.log       || echo 0)"

if [ "$RC" -eq 0 ]; then
  echo "==> PASS"
  exit 0
else
  echo "==> FAIL (RC=$RC, see build/*.log)"
  exit 1
fi
```

**反绕过补充**：
1. `cppcheck --error-exitcode=2`：发现 error 返回非零（默认 cppcheck 返回 0，旧脚本因此漏门禁）
2. `clang-tidy --warnings-as-errors=...`：把 P0 类别警告升级为非零返回
3. **禁止** 在 `check.sh` 写 `|| true`（CI 端用 `--codeowners-required` 保护此文件）
4. Windows 必须用 Git Bash 跑同一脚本（POSIX 语义），不另维护 `.cmd` 版本

---

## 4.5 反绕过补丁（Codex 审查后新增）

> 以下规则解决"形式合规、实质屎山"和"门禁被一行注释架空"两类绕过路径。

### 4.5.1 多 `#ifdef` 配置矩阵扫描

单配置编译能藏违规代码到 `#ifdef DEBUG` / `#ifdef RELEASE` 分支。强制矩阵：

```bash
# 至少跑 2 个配置（DEBUG + RELEASE 或 板卡变体）
for CFG in DEBUG RELEASE PRODUCTION; do
  cppcheck -D$CFG --enable=warning,style,performance,portability \
    --std=c11 --platform=unix32 \
    project/code/ > build/cppcheck-$CFG.log 2>&1
done

# 汇总：任一配置失败 = 总失败
grep -lE "(error|warning)" build/cppcheck-*.log && exit 1
```

> 工程实际有多少 `#ifdef <宏>` 分支，就跑多少 `-D<宏>` 配置。**禁止只跑默认配置忽略其他分支**。

### 4.5.2 `compile_commands.json` 强制覆盖率

clang-tidy 只扫被编译的 `.c` 文件。如果 `compile_commands.json` 没列某个 `.c`，clang-tidy **静默跳过**，留下盲区。

**强制规则**：
- CMake 工程：必须 `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`
- Keil 工程：用 [bear](https://github.com/rizsotto/Bear) 或 `cdb-from-msbuild` 生成
- **REVIEW Step 3 检查**：`compile_commands.json` 列出的 `.c` 数 = `find project/code -name '*.c'` 数。差值 > 0 即视为覆盖率不足，回 EXECUTE 补全

### 4.5.3 baseline 管理

新工程接入静态检查时，已有代码可能有大量历史警告。强制 0 警告会让团队放弃用工具。正确做法：

**冻结 baseline**：
```bash
# 首次跑：生成基线
cppcheck ... --xml 2> baseline.xml

# 后续：只检查新增警告
cppcheck ... --xml 2> current.xml
python scripts/diff-cppcheck.py baseline.xml current.xml --fail-on-new
```

clang-tidy 同理：
```bash
clang-tidy ... | tee current-tidy.log
diff <(sort baseline-tidy.log) <(sort current-tidy.log) | grep '^>' && exit 1
```

> baseline 文件**必须**进 git，每次 review baseline 变更都要附原因说明。

### 4.5.4 Waiver 元数据要求（防 NOLINT 滥用）

`// cppcheck-suppress xxx` / `// NOLINT(xxx)` 一行注释能架空整个门禁。强制规则：

**合规 waiver 必须含三项元数据**：
```c
// cppcheck-suppress nullPointerRedundantCheck
// reason: HAL 返回 NULL 已在上一行检查；cppcheck 无法跨函数追踪
// owner: ethmuskrat
// expire: 2026-09-01
HAL_UART_Init(huart);
```

**审查脚本**：
```bash
# 扫描所有 suppress 注释，缺元数据即违规
grep -rnE 'cppcheck-suppress|NOLINT' project/code/ | while IFS= read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    lineno=$(echo "$line" | cut -d: -f2)
    # 检查后续 3 行内是否含 reason + owner + expire
    if ! sed -n "$lineno,$(($lineno+3))p" "$file" | grep -qE 'reason:'; then
        echo "[WAIVER] $file:$lineno - 缺 reason"
    fi
    if ! sed -n "$lineno,$(($lineno+3))p" "$file" | grep -qE 'owner:'; then
        echo "[WAIVER] $file:$lineno - 缺 owner"
    fi
    if ! sed -n "$lineno,$(($lineno+3))p" "$file" | grep -qE 'expire:'; then
        echo "[WAIVER] $file:$lineno - 缺 expire"
    fi
done
```

**过期 waiver 自动失败**：CI 跑日期比对，超过 expire 日期的 waiver 视为违规，强制 owner 复核或修正根因。

### 4.5.5 CI 独立复跑（防 Claude 自报漏报）

**问题**：Claude 自己跑 cppcheck 后说"通过了"，但可能少跑了选项 / 漏了文件 / 选择性贴报告。

**对策**：CI 用**固定参数 + 固定工具版本**复跑，结果由流水线产出，不接受人工 / Claude 手填证据。

```yaml
# .github/workflows/static-check.yml（关键约束）
jobs:
  static-check:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - name: Pin tool versions
        run: |
          sudo apt-get install -y cppcheck=2.13.0-1 clang-tidy-15
          pip install lizard==1.17.10
      - name: Run check with fixed args
        run: bash scripts/check.sh  # 不接受 PR 改动这个脚本绕过门禁
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: static-reports
          path: build/*.log
      - name: Compare to baseline
        run: python scripts/diff-cppcheck.py baseline.xml build/cppcheck.log --fail-on-new
```

> `scripts/check.sh` 应在 CODEOWNERS 中加保护，修改需架构 owner 批准。

### 4.5.6 Diff-only 模式（PR 阶段）

PR 阶段全量扫描会被历史警告淹没。改为只扫 PR 改动的行：

```bash
# 提取本 PR 改动的文件
git diff --name-only origin/main...HEAD | grep -E '\.(c|h)$' > changed.txt

# 仅检查改动文件
xargs cppcheck < changed.txt
xargs clang-tidy < changed.txt
```

> diff-only 用于 PR 准入；main 分支推荐还跑全量 + baseline。两者互补。

---

## 5. REVIEW 阶段静态检查门

在 `refs\riper5-stages.md` 的 REVIEW 段加一条硬约束：

> **Step 3 代码质量子项**：
> - 跑 `scripts/check.sh`，三个工具的报告**必须**展示在证据包中
> - cppcheck error / clang-tidy WarningsAsErrors 数 = 0 才视为通过
> - lizard CCN > 10 / NLOC > 50 / PARAM > 3 的函数必须**逐个**有说明（拆或例外标注）
> - 失败 → 回 EXECUTE 修，禁止以"不影响功能"略过

---

## 6. CI 集成模板（可选）

### 6.1 GitHub Actions

```yaml
# .github/workflows/static-check.yml
name: Static Analysis
on: [push, pull_request]
jobs:
  static-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install
        run: |
          sudo apt-get update
          sudo apt-get install -y cppcheck clang-tidy
          pip install lizard
      - name: Run check
        run: bash scripts/check.sh
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: static-reports
          path: build/*.log
```

### 6.2 Gitee Go（Gitee CI）

参照 GitHub Actions 改写，命令一致。

---

## 7. 与其他参考的关系

| 文档 | 关系 |
|---|---|
| `refs\embedded-architecture.md` | §7 依赖方向检查表 → 本管线机械化执行 |
| `refs\coding-standards.md` | 函数长度 / 嵌套 / 参数阈值 → `.clang-tidy` `CheckOptions` 落地 |
| `refs\riper5-stages.md` | REVIEW Step 3 引用本管线 §5 静态检查门 |
| `refs\failure-taxonomy.md` | 静态检查失败归类到 `project-config-error`（构建/配置类）或 `target-response-abnormal`（运行期行为类）|

---

## 8. 不做（边界声明）

- ❌ **不实现自定义检查规则**（cppcheck 写自定义 addon、clang-tidy 写自定义 check）— 维护成本高
- ❌ **不接 LDRA / Polyspace / Parasoft** — 商业工具，认证场景外用不到
- ❌ **不替代 REVIEW 阶段的人工判断** — 工具只能抓机械缺陷，逻辑错误 / 时序问题 / 硬件相关 bug 仍需人 + 示波器
- ❌ **不强制 0 警告**（cppcheck information / style 类）— 实用主义，只 0 error + bug 类警告
