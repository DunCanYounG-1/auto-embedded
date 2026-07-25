# RT-Thread scons 构建 Skill 用法

这个 skill 自带了一个可执行脚本 [scripts/scons_builder.py](../scripts/scons_builder.py)，适合在需要探测环境、识别 RT-Thread 工程、执行 scons 构建或扫描产物时直接调用。

## 能力概览

- 检测 scons 环境和交叉编译器（arm-none-eabi / riscv）可用性
- 识别 RT-Thread scons 工程（`SConstruct` + `rtconfig.py`），支持在工作区下搜索多个候选工程根
- 解析 `rtconfig.py` 变量（`CROSS_TOOL`、`PREFIX`、`EXEC_PATH`），推断工具链家族
- 执行 `scons` 构建流程
- 扫描构建产物（`rtthread.elf`、`rtthread.bin`），默认产物名靠前
- 执行清理操作（`scons -c`）
- 输出结构化的构建结果报告

> **交互式命令不在本脚本内执行**：`scons --menuconfig`（Kconfig 配置）、`pkgs --update`（软件包管理）、`scons --target=mdk5/iar/cmake`（导出 IDE 工程）都需要用户手动运行。

## 基础用法

```bash
# 探测环境 + 识别工程
python3 skills/build-scons/scripts/scons_builder.py --detect --source /path/to/rtt-bsp

# 解析 rtconfig.py（不构建）
python3 skills/build-scons/scripts/scons_builder.py --parse-rtconfig --source /path/to/rtt-bsp

# 构建工程
python3 skills/build-scons/scripts/scons_builder.py --source /path/to/rtt-bsp -j 8

# 清理后重建
python3 skills/build-scons/scripts/scons_builder.py --source /path/to/rtt-bsp --clean -j 8

# 仅扫描构建产物
python3 skills/build-scons/scripts/scons_builder.py --scan-artifacts /path/to/rtt-bsp
```

## 常见模式

### 1. 环境探测

```bash
python3 skills/build-scons/scripts/scons_builder.py --detect --source /repo/rtt-bsp
```

输出 `scons` 路径与版本、交叉编译器可用性、识别到的工程根，以及 `rtconfig.py` 的 `CROSS_TOOL` / `PREFIX` / `EXEC_PATH` / 工具链家族。

### 2. 首次构建

```bash
# 先探测确认工具链路径正确
python3 skills/build-scons/scripts/scons_builder.py --detect --source /repo/rtt-bsp

# 构建
python3 skills/build-scons/scripts/scons_builder.py --source /repo/rtt-bsp -j 8
```

### 3. 改配置后重建

`scons --menuconfig` 由用户手动运行改配置后，再执行：

```bash
python3 skills/build-scons/scripts/scons_builder.py --source /repo/rtt-bsp --clean -j 8
```

### 4. 只找产物

```bash
python3 skills/build-scons/scripts/scons_builder.py --scan-artifacts /repo/rtt-bsp
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--detect` | 探测构建环境并识别 RT-Thread 工程 |
| `--source` | RT-Thread 工程根（含 `SConstruct` + `rtconfig.py`），或待搜索的工作区 |
| `--parse-rtconfig` | 解析并显示 `rtconfig.py` 变量（不构建） |
| `--scan-artifacts` | 仅扫描指定目录中的产物 |
| `--clean` | 构建前执行 `scons -c` |
| `--extra-args` | 传递给 scons 的额外参数（可重复） |
| `--save-config` | 探测成功后保存 scons 路径到配置 |
| `-v`, `--verbose` | 详细构建输出（`verbose=1`） |
| `-j`, `--jobs` | 并行构建任务数 |

## 返回码

- `0`：操作成功
- `1`：参数非法、环境缺失、工程缺失、构建失败或产物缺失

## 与 Skill 的配合方式

在 `build-scons` skill 中，推荐工作流是：

1. 先用 `--detect --source <工程根>` 确认 scons 与工具链就绪
2. 若环境未就绪，提示用户安装 scons / RT-Thread env 工具
3. 首次使用时，向用户确认工程根与工具链（`rtconfig.py` 的 `EXEC_PATH`）
4. 若需改内核/组件/软件包配置，提示用户手动运行 `scons --menuconfig` / `pkgs --update`
5. 执行 `--source <工程根>` 构建
6. 将构建结果整理成简洁摘要
7. 更新 `Project Profile`（含 `build_system: scons`、`rtos: rt-thread`），交给 `flash-openocd` / `flash-jlink` 或 `rtos-debug`

> RT-Thread 带 OS 开发的完整专项流程见 `.auto-embedded/modes/rtos-rtthread.md`。
