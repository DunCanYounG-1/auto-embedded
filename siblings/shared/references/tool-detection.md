# 工具探测参考

当某个 skill 需要定位宿主工具时，优先复用本文逻辑，避免在多个地方重复写同一套规则。

## 解析优先级

所有工具路径按以下顺序解析，先命中者优先：

1. CLI 参数（`--uv4`、`--iar-root`、`--gdb` 等）
2. 配置文件（工作区 `.em_skill.json` 覆盖全局 `~/.config/em_skill/config.json`）
3. 环境变量（`KEIL_ROOT`、`IAR_ROOT` 等）
4. 硬编码常见安装路径
5. `PATH` 搜索（`shutil.which`）

配置文件通过 `shared/tool_config.py` 读写，CLI 管理工具为 `scripts/em_config.py`。

## 构建工具

面向 CMake 工作流的探测顺序：

1. `cmake`
2. 如果宿主 shell 无法解析 `cmake`，则在 Windows 上尝试 `cmake.exe`

生成器优先级：

1. 若存在 `ninja`，优先使用 `Ninja`
2. 若宿主已安装 `make`、`gmake` 或平台等价工具，则退回原生 Makefile
3. 若两者都不可用，则阻塞并报告缺少生成器支持

## 烧录与调试工具

OpenOCD 查找顺序：

1. 用户或工程画像中显式给出的路径
2. `openocd`
3. Windows 下的 `openocd.exe`

ARM MCU 目标的 GDB 查找顺序：

1. 用户或工程画像中显式给出的路径
2. `arm-none-eabi-gdb`
3. `gdb-multiarch`
4. 若仍未找到，则阻塞并报告缺失调试器，不要回退到宿主专用 `gdb`

## 串口工具

首选探测顺序：

1. `python -m serial.tools.miniterm`
2. Unix-like 宿主上已安装的终端工具，例如 `picocom` 或 `screen`
3. 若都不存在，则阻塞并报告缺失串口监视依赖

## 探针与配置线索

按以下顺序寻找 OpenOCD 配置线索：

1. 用户显式提供的配置列表
2. 已存在的 `Project Profile`
3. 仓库中命名为 `openocd*.cfg` 的文件
4. IDE 启动配置，例如 `.vscode/launch.json`
5. 工作区内的厂商文档

如果检查后仍有多个合理配置路径，应返回 `ambiguous-context`。

## J-Link 工具

JLinkExe（J-Link Commander）查找顺序：

1. 配置文件（`get_tool_path("jlink")`）
2. `JLinkExe`（Linux/macOS PATH）
3. `JLink.exe`（Windows PATH）
4. `/opt/SEGGER/JLink/JLinkExe`（Linux/macOS）
5. `C:\Program Files\SEGGER\JLink\JLink.exe` / `C:\Program Files (x86)\SEGGER\JLink\JLink.exe`（Windows）

JLinkGDBServer 查找顺序：

1. 配置文件（`get_tool_path("jlink-gdbserver")`）
2. `JLinkGDBServerCLExe`（Linux/macOS PATH）
3. `JLinkGDBServerCL.exe`（Windows PATH）
4. `/opt/SEGGER/JLink/JLinkGDBServerCLExe`（Linux/macOS）
5. `C:\Program Files\SEGGER\JLink\JLinkGDBServerCL.exe`（Windows）

`--device` 参数为必需项，J-Link 无法安全推断设备名。

## 静态分析工具

cppcheck 查找顺序：

1. 配置文件（`get_tool_path("cppcheck")`）
2. `cppcheck`（PATH 搜索）
3. MISRA addon 需要 cppcheck 安装目录下的 `addons/misra.py`

clang-tidy 查找顺序：

1. 配置文件（`get_tool_path("clang-tidy")`）
2. `clang-tidy`（PATH 搜索）
3. 准确分析需要 `compile_commands.json`

GCC analyzer：

1. `arm-none-eabi-gcc`（PATH 搜索）
2. `gcc`（宿主 GCC）
3. 需要 GCC 12+ 才有 `-fanalyzer` 支持
