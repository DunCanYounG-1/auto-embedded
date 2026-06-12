# 失败分类

以下分类需要在所有 skill 中保持一致使用。

## `environment-missing`

当必需的宿主工具或运行时不可用时使用。

- 例子：缺少 `cmake`、`openocd`、`arm-none-eabi-gdb` 或 `pyserial`
- 响应要求：说明缺失依赖、它是如何被探测出来的，以及完成流程所需的最小安装或路径修复动作

## `project-config-error`

当仓库布局或配置本身阻止了有效工作流时使用。

- 例子：损坏的 CMake preset、缺失的工具链文件、无效的 OpenOCD 配置、冲突的产物命名
- 响应要求：指出出错配置文件或缺失设置，不要继续猜测

## `connection-failure`

当宿主无法连接板卡或探针时使用。

- 例子：探针未连接、USB claim 失败、OpenOCD 找不到 adapter、串口消失
- 响应要求：带上尝试过的探针或串口，以及最可能的物理连接或权限原因

## `artifact-missing`

当请求或必须存在的固件产物不存在，或无法被安全解析时使用。

- 例子：构建后没有 ELF、存在多个 HEX 候选、发现了 `BIN` 但没有基地址
- 响应要求：说明搜索范围，并给出候选列表或缺失路径

## `target-response-abnormal`

当目标设备可达，但其行为异常时使用。

- 例子：烧录后校验不一致、无法停核、重复复位循环、GDB 已附着但符号不匹配
- 响应要求：说明异常发生的具体阶段，并推荐下一步诊断动作

## `permission-problem`

当宿主权限阻止访问设备或文件时使用。

- 例子：Linux 下串口设备不可写、USB 访问被拒绝、构建目录不可写
- 响应要求：明确指出被拒绝的资源，以及需要的最小权限调整

## `ambiguous-context`

当仍存在多个同样合理的目标候选，而任意选择一个都可能浪费时间或破坏流程时使用。

- 例子：同时接了多块板卡、存在多个 OpenOCD 配置、存在多个串口、存在多个同样合理的构建 preset
- 响应要求：列出候选项，并指出只需补充哪一个关键信息即可解除阻塞

## `realtime-violation` ★v2.1

当目标设备功能正常，但**时序/实时性指标**不达标时使用。区别于 `target-response-abnormal`（功能性异常）。

- 例子：
  - 控制周期 jitter 超过阈值（如 1 kHz 控制环 jitter > 50 μs）
  - ISR 最大耗时超过控制周期的 30%
  - 栈水位剩余 < 20%（接近溢出）
  - CPU 占用率 > 90%（无余量给紧急任务）
  - FPU-less MCU 高频路径用 float（单次耗时 > 控制周期 10%）
  - 控制环抖动导致跟踪误差变大但功能不挂
- 测量方式必填：`GPIO toggle + 示波器` / `DWT->CYCCNT` / `RTOS API`（如 `uxTaskGetStackHighWaterMark`）
- 响应要求：报告具体指标 + 测量方法 + 阈值 + 实测值；定向回派优先级 `embedded-drv`（中断优先级/时钟）→ `embedded-alg`（算法降阶/Q15 改造）→ `embedded-arch`（架构重排）
- 自动重试上限：2 次（按 `root_cause_id` 全局计数）
