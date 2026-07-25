---
name: aemb-build-scons
description: 当需要用 scons 构建基于 RT-Thread 的固件工程，调用自带脚本执行 scons 构建并定位 rtthread.elf/.bin 产物时使用。
---

> **auto-embedded 工具技能**：脚本随框架装在 `.auto-embedded/tools/build-scons/`，用 `{{PYTHON_CMD}}` 运行 `.auto-embedded/tools/build-scons/scripts/` 下脚本；详细用法见 `.auto-embedded/tools/build-scons/references/usage.md`。

# scons 构建（RT-Thread）

## 适用场景

- `Project Profile` 中标明 `build_system: scons`，或工作区含 `SConstruct` + `rtconfig.py`（RT-Thread BSP 工程的标志）。
- 用户希望对 RT-Thread 工程执行编译、重编译或确认固件产物。
- 烧录或调试流程需要新的 `rtthread.elf` / `rtthread.bin`。
- 需要在构建前确认环境是否就绪（scons、交叉编译器、`RTT_ROOT`）。
- RT-Thread 带 OS 开发的完整工作流见 `.auto-embedded/modes/rtos-rtthread.md`。

## 必要输入

- 工作区路径，或一份已有的 `Project Profile`。
- 工程根目录（含 `SConstruct` + `rtconfig.py` 的目录）。

## 首次参数确认

首次调用时，必须向用户确认以下参数，不得跳过或自动使用探测值：

- **工程根目录**：即含 `SConstruct` + `rtconfig.py` 的 BSP 目录（多 BSP 仓库常有多个候选，须确认）。
- **交叉工具链**：`rtconfig.py` 中的 `CROSS_TOOL` 与 `EXEC_PATH`（决定用 gcc/keil/iar 与编译器所在路径），首次须向用户确认探测值是否正确。

当 `Project Profile` 中已记录过上述参数（即非首次），可直接复用，无需再次询问。

## 自动探测

- 检查 `scons` 是否可用（PATH 或配置的工具路径）。
- 在工程根查找 `SConstruct` 与 `rtconfig.py`，确认是 RT-Thread scons 工程。
- 解析 `rtconfig.py` 的 `CROSS_TOOL`、`EXEC_PATH`、编译器前缀（如 `arm-none-eabi-` / `riscv64-unknown-elf-`），推断工具链家族。
- 读取环境变量 `RTT_ROOT`（未设置时 `rtconfig.py` 内常有默认相对路径）。
- 默认产物为工程根下的 `rtthread.elf` / `rtthread.bin`；若已有一致的成功产物，优先复用。

## 执行步骤

1. 先阅读 [references/usage.md](.auto-embedded/tools/build-scons/references/usage.md)，确认本次是环境探测、执行构建，还是仅扫描产物。
2. 若不确定环境是否就绪，先运行自带脚本 [scripts/scons_builder.py](.auto-embedded/tools/build-scons/scripts/scons_builder.py) 的 `--detect --source <工程根>` 模式确认 scons 与工具链。
3. 若用户需要改内核/组件/软件包配置，提示手动运行 `scons --menuconfig`（Kconfig 交互式，不可自动执行）；改配置后需重新构建。
4. 若用户需要拉取/更新软件包，提示手动运行 `pkgs --update`（env 工具，联网交互式，不可自动执行）。
5. 使用 `--build --source <工程根> [-j N]` 执行构建。
6. 读取脚本输出的构建结果和产物扫描报告，重点关注首选产物（ELF > BIN > HEX）和失败分类。
7. 将工程根、产物路径、产物类型、工具链信息写回 `Project Profile`，并在需要时交给下游 skill。

## 失败分流

- 当 `scons` 不可用时，返回 `environment-missing`，提示用户先安装 scons / RT-Thread env 工具。
- 当工程根缺少 `SConstruct` / `rtconfig.py`，或编译错误（语法/链接失败、工具链路径错）时，返回 `project-config-error`。
- 当构建成功但未找到 `rtthread.elf` / `.bin` 等产物时，返回 `artifact-missing`。
- 当存在多个候选工程根（多 BSP）且用户未指定时，返回 `ambiguous-context`。

## 平台说明

- `scons` 是跨平台的 Python 构建工具，自带脚本通过 subprocess 调用 `scons`，调度路径本身跨平台。
- 工具链路径由 `rtconfig.py` 的 `EXEC_PATH` 决定；Windows 上常指向 RT-Thread env 内置的 gcc 目录，须确保该路径存在。
- `scons --menuconfig`（Kconfig）与 `pkgs --update`（软件包管理）是交互式命令，**不由脚本自动执行**，仅在报告中提示用户手动运行——对齐 `aemb-build-idf` 对 `idf.py menuconfig` 的处理。
- 需要导出 IDE 工程（`scons --target=mdk5/iar/cmake`）时，同样提示用户手动执行。

## 输出约定

- 输出构建命令、工程根、工具链家族和首选产物路径。
- 用 `artifact_path`、`artifact_kind`、`build_system: scons`、探测到的工具链细节更新 `Project Profile`；若识别到 RT-Thread，同时更新 `rtos: rt-thread`。
- 成功后推荐 `aemb-flash-openocd` / `aemb-flash-jlink`；需要线程感知调试时推荐 `aemb-rtos-debug`。

## 交接关系

- 当下一步意图是给硬件烧录程序时，将成功构建结果交给 `aemb-flash-openocd` 或 `aemb-flash-jlink`。
- 当需要查看任务列表 / 栈水位 / 死锁时，将带符号的 `rtthread.elf` 交给 `aemb-rtos-debug`。
- 当 scons / env 环境未安装时，提示用户手动安装 RT-Thread env 工具。
