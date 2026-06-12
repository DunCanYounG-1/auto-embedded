# 分层架构门禁（arch-check）使用与强制化

> 目的：把"分层架构合规"从 REVIEW 阶段的**会话内自觉**升级为**可机械执行、可在提交时强制**的门禁，
> 并保证在**纯 PowerShell 环境**（无 POSIX 工具）下同样可用。

## 1. 两个等价实现

| 脚本 | 运行环境 | 说明 |
|---|---|---|
| `scripts/arch-check.sh` | bash / zsh（含 Git for Windows 自带 bash） | **行为基准**，8 项检查 ARCH-1~8 |
| `scripts/arch-check.ps1` | PowerShell 7（pwsh） | `.sh` 的忠实移植，纯 PS 环境用 |

两者输出协议一致：

- **stdout**：每行一个违规，格式 `[ARCH-N] file:line - reason`
- **stderr**：进度 `>>> [N/M] ...` 与最终 `==> PASS/FAIL`
- **exit code**：`0` = 0 违规，`1` = 有违规

> 已用回归测试验证 `.ps1` 与 `.sh` 在 `--all / --hw-check / --no-hw / 默认 / 空净目录` 五种场景下
> **违规集合一致、exit code 一致**（见 `scripts/test-arch-check.sh`）。
> 注：`find` 与 `Get-ChildItem` 的文件枚举顺序可能不同，故 parity 判据是"去除 CR 后**排序的违规集合逐字节相同**"，
> 而非行序相同；测试夹具含 `Drivers/`、`libraries/` 等 vendor 目录用例，验证两者都正确**跳过** vendor 不误报。

## 2. 手动运行

```bash
# bash（在工程根目录执行）
.auto-embedded/scripts/arch-check.sh             # ARCH-1~7 + ARCH-8
.auto-embedded/scripts/arch-check.sh --hw-check  # 仅 ARCH-8（硬件资源表 hw_lock 冲突）
.auto-embedded/scripts/arch-check.sh --no-hw     # 仅 ARCH-1~7
```

```powershell
# PowerShell（在工程根目录执行）
pwsh -File .auto-embedded/scripts/arch-check.ps1
pwsh -File .auto-embedded/scripts/arch-check.ps1 --hw-check
pwsh -File .auto-embedded/scripts/arch-check.ps1 --no-hw
```

## 3. 检查项一览

| 编号 | 检查 | 阈值/规则 |
|---|---|---|
| ARCH-1  | 应用层 `#include` 厂商 HAL 头 | 禁止 |
| ARCH-1B | 应用层 include catch-all mega-header（间接拉厂商头） | 禁止（`zf_common_headfile.h` 白名单） |
| ARCH-1C | 应用层裸寄存器访问（`*(volatile..*)0x..`） | 禁止（应封装到 HAL/BSP） |
| ARCH-2  | `main.c` 类入口顶层调用数 | ≤ 6 |
| ARCH-3  | ISR / 回调函数体行数 | ≤ 20 |
| ARCH-4  | 应用层 `extern` 变量数 | = 0 |
| ARCH-5  | 单 `.c` 文件行数 | ≤ 800 |
| ARCH-6  | 单 `.h` 公共 API（函数声明）数 | ≤ 20 |
| ARCH-7/7B | mega-header（≥10 个 #include）/ app 层引用 mega-header | 提示 / 违规 |
| ARCH-8  | 硬件资源表 `hw_lock` 块 pin/dma/irq/timer 冲突 | 禁止重复 |

## 4. 强制化：git pre-commit 钩子（推荐）

把门禁挂进**目标固件工程**的 `.git/hooks/pre-commit`，提交涉及 `.c/.h` 时自动跑、不通过即阻断——
不再依赖"会话内记得跑"。

```bash
# 在 skill 目录执行，参数为目标工程路径（缺省当前目录）
scripts/install-arch-check-hook.sh /path/to/your/firmware-project
```

```powershell
pwsh -File scripts/install-arch-check-hook.ps1 C:\path\to\firmware-project
```

钩子工作方式：

1. 仅当本次提交暂存了 `.c/.h` 文件时才触发；
2. 优先 `bash arch-check.sh`（Git for Windows 自带 bash，跨平台），无 bash 时回退 `pwsh arch-check.ps1`；
3. 有违规 → 打印清单并 **阻断提交**（exit 1）；
4. 确需临时跳过：`git commit --no-verify`。

> auto-embedded 下检查脚本随 `aemb init` 装在工程内 `.auto-embedded/scripts/`，钩子直接调用该路径；
> （上一代按 $EMBEDDED_DEV_DIR 全局目录回退的机制已不需要。）

## 5. 自测

```bash
scripts/test-arch-check.sh   # 构造覆盖 ARCH-1~8 的夹具，断言 .sh 命中 11 条并与 .ps1 逐行比对
```

## 6. 与 REVIEW 阶段的关系

- REVIEW Step 3「代码质量」要求**必跑**本门禁（依据 `.auto-embedded/refs/embedded-architecture.md` §7 依赖方向 + §8 屎山预警）。
- 比赛模式 CP-3 QA 同样把本门禁纳入 5 元组验收。
- 门禁只做**机械、可证伪**的结构检查；语义级审查仍由 REVIEW/`/simplify` 承担。
