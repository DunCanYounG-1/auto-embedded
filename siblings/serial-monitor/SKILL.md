---
name: serial-monitor
description: 当需要识别正确串口、调用自带脚本抓取日志，并分析嵌入式固件运行状态时使用。
---

# 串口监视

## 适用场景

- 用户需要查看目标板的启动日志、断言输出或交互式 UART 输出。
- 烧录或复位刚完成，下一步需要观察运行期行为。
- 需要避免错过早期启动日志，或希望在监听后立即复位目标板。
- 工作区或 profile 中已经有明确的 UART 端口或波特率。

## 必要输入

- 一个串口，或一份足以完成串口探测的 `Project Profile`。
- 可选的波特率、监视模式、关键字符串、日志保存路径。
- 若要自动复位，还需要 OpenOCD 配置，来自显式输入或已有工程画像。

## 自动探测

- 串口优先级为：显式用户输入、`Project Profile`、脚本自动检测结果，否则阻塞。
- 波特率优先级为：显式用户输入、`Project Profile`、工作区文档或代码常量，最后回落到 `115200`。
- 自动检测时，优先选择 CH340、CP210x、CMSIS-DAP、ST-Link 等常见串口或调试器虚拟串口。
- 若存在多个同样合理的串口候选，先列出候选，再按需要阻塞而不是静默猜测。

## 执行步骤

1. 先阅读 [references/usage.md](references/usage.md)，确认本次是列表、抓取、等待字符串、持续监视，还是“先监听后复位”。
2. 运行自带脚本 [scripts/serial_monitor.py](scripts/serial_monitor.py)。列出串口时使用 `--list`，自动选择端口时使用 `--auto`。
3. 普通抓取使用 `--duration`，等待特定输出使用 `--wait`，持续监视使用 `--monitor --timestamp`。
4. 若担心错过早期启动日志，使用 `--wait-reset`；只有在 OpenOCD 配置已经明确时，才启用 `--auto-reset`。
5. 读取脚本输出的分析结果，而不是只转述原始串口文本；重点关注错误、警告、启动标记和关键外设关键词。
6. 将选中的串口、波特率、命令和日志结论写回 `Project Profile`，并在需要时交给下游 skill。

## 失败分流

- 当缺少 `pyserial` 或 `openocd` 等依赖时，返回 `environment-missing`。
- 当选中的串口无法打开或在监视过程中消失时，返回 `connection-failure`。
- 当宿主机没有权限访问串口设备时，返回 `permission-problem`。
- 当存在多个合理串口候选，或工作区中隐含互相冲突的波特率时，返回 `ambiguous-context`。
- 当串口可访问，但日志明显表现为启动失败、重复复位、断言或 Fault 时，返回 `target-response-abnormal`。

## 平台说明

- Linux、macOS、Windows 的串口命名规则复用 [platform-compatibility.md](/home/leo/work/open-git/em_skill/shared/platform-compatibility.md)。
- 自带脚本使用 `pyserial`，因此串口抓取路径本身是跨平台的。
- Windows 输出中要保留准确的 `COM` 端口名，以及 shell 需要的命令行引号形式。

## 输出约定

- 输出选中的串口、波特率、实际执行命令，以及对日志分析结果的简洁总结。
- 当串口和波特率被明确后，用 `serial_port` 和 `baud_rate` 更新 `Project Profile`。
- 若使用了 `--auto-reset`，同时记录 OpenOCD 配置来源和复位命令。
- 当日志表明程序崩溃、卡死或启动异常时，推荐 `debug-gdb-openocd`。

## 交接关系

- 当日志显示需要断点、寄存器或回溯时，将结果交给 `debug-gdb-openocd`。
