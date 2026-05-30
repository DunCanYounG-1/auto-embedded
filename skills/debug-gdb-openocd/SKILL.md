---
name: debug-gdb-openocd
description: 当需要通过 OpenOCD 启动或附着 GDB 会话，调用自带脚本完成固件下载、在线调试或崩溃现场检查时使用。
---

# GDB OpenOCD 调试

## 适用场景

- 用户希望通过 OpenOCD 调试 Cortex-M 类目标。
- 工作区中已有 `ELF` 和与 OpenOCD 兼容的探针信息。
- 烧录或串口监视流程表明，需要进一步查看断点、停核控制、寄存器或回溯信息。
- 需要在调试前确认 OpenOCD 和 GDB 环境是否就绪。

## 必要输入

- 一份带符号的 `ELF`，或包含 `artifact_path` 的 `Project Profile`。
- OpenOCD 配置信息，或足以安全解析配置的工作区线索。
- 可选调试模式：`download-and-halt`、`attach-only`、`crash-context`。
- 可选的 GDB 可执行文件路径。

## 自动探测

- 默认模式为 `download-and-halt`；只有用户显式要求附着调试或崩溃现场检查时才切换。
- GDB 由脚本自动探测，优先级为：显式用户输入、`Project Profile`、`arm-none-eabi-gdb`、`gdb-multiarch`。
- 探针由脚本自动探测，优先级与 `flash-openocd` 保持一致。
- 做符号级调试必须有 `ELF`。若只有 `HEX` 或 `BIN`，应阻塞并要求提供匹配 `ELF`。

## 执行步骤

1. 先阅读 [references/debug-playbook.md](references/debug-playbook.md) 中的决策树，判断应使用条件断点、普通断点还是 OpenOCD Telnet。
2. 再阅读 [references/usage.md](references/usage.md)，确认本次是环境探测，还是执行调试会话。
3. 若不确定环境是否就绪，先运行自带脚本 [scripts/gdb_debugger.py](scripts/gdb_debugger.py) 的 `--detect` 模式确认。
4. 根据用户意图选择调试模式：`download-and-halt`（默认）、`attach-only` 或 `crash-context`。
5. 使用 `--elf` 指定符号文件，配合 `--interface` + `--target` 或 `--config` 启动调试。
6. 读取脚本输出的调试结果，重点关注寄存器状态、回溯帧和 Fault 寄存器（crash-context 模式）。
7. 将调试配置和关键观察写回 `Project Profile`，并在需要时交给下游 skill。

## 失败分流

- 当缺少 `openocd` 或兼容 GDB 时，返回 `environment-missing`。
- 当没有可用的 `ELF` 时，返回 `artifact-missing`。
- 当 OpenOCD 或 GDB 无法连接目标板时，返回 `connection-failure`。
- 当 OpenOCD 配置或符号文件与目标不一致时，返回 `project-config-error`。
- 当会话可以建立，但无法停核、加载或得到可信回溯时，返回 `target-response-abnormal`。
- 当存在多个同样合理的探针、配置或符号文件时，返回 `ambiguous-context`。

## 平台说明

- 自带脚本使用 Python 标准库和 subprocess 调用 openocd 和 gdb，因此调试调度路径本身是跨平台的。
- 输出中应将 OpenOCD 与 GDB 命令分开列出，方便用户在其他 shell 或 IDE 中复现。
- Windows 宿主机可能需要解析 `.exe` 后缀，但逻辑流程与其他平台一致。

## 输出约定

- 输出调试模式、OpenOCD 命令、GDB 可执行文件、`ELF` 路径和关键观察结论。
- 在 `Project Profile` 中保留 `artifact_path`、`artifact_kind`、`gdb_executable`、`openocd_config`。
- 当复位后或继续运行后下一步是观察运行行为时，推荐 `serial-monitor`。

## 交接关系

- 当目标恢复运行后，需要继续观察运行期日志时，将成功会话交给 `serial-monitor`。