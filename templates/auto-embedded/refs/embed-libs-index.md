# 嵌入式常用开源库速查索引

> 来源：[EmbedSummary](https://github.com/zhengnianli/EmbedSummary)（5000+ stars）
> RESEARCH 阶段查找开源库/驱动时，优先查本文件，找到后直接使用链接，无需联网搜索。

---

## 1. RTOS 实时操作系统

| 库名 | 链接 | 说明 | 适用场景 |
|------|------|------|---------|
| **FreeRTOS** | https://www.freertos.org/ | 最流行的轻量级 RTOS | 通用 MCU 多任务 |
| **RT-Thread** | https://github.com/RT-Thread/rt-thread | 国产精品 RTOS，组件丰富 | IoT、产品级开发 |
| **TencentOS tiny** | https://github.com/Tencent/TencentOS-tiny | 腾讯出品，面向 IoT | 腾讯云 IoT 接入 |
| **Zephyr** | https://www.zephyrproject.org/ | Linux 基金会推出，可伸缩 | 专业 IoT 产品 |
| **μC/OS** | https://www.micrium.com/rtos/ | 教学经典，功能齐全（Apache 2.0 开源，原 Silicon Labs） | 学习、教学 |
| **cola_os** | https://gitee.com/schuck/cola_os | 300 行实现多任务 | 极简多任务需求 |
| **eventos-nano** | https://gitee.com/event-os/eventos-nano | 超轻量事件驱动框架 | 资源极度受限的 MCU |

---

## 2. 实用组件库（MCU 开发高频使用）

### 2.1 按键处理

| 库名 | 链接 | 说明 |
|------|------|------|
| **MultiButton** | https://github.com/0x1abin/MultiButton | 事件驱动按键驱动，支持单击/双击/长按，最常用 |
| **FlexibleButton** | https://github.com/murphyzhao/FlexibleButton | 灵活的按键处理库，纯 C，平台无关 |

### 2.2 定时器

| 库名 | 链接 | 说明 |
|------|------|------|
| **MultiTimer** | https://github.com/0x1abin/MultiTimer | 软件定时器扩展模块，轻量 |
| **SmartTimer** | https://github.com/lmooml/SmartTimer | 基于 STM32 的定时器调度器 |

### 2.3 日志系统

| 库名 | 链接 | 说明 |
|------|------|------|
| **EasyLogger** | https://github.com/armink/EasyLogger | 超轻量级 C/C++ 日志库，嵌入式首选 |
| **zlog** | https://github.com/HardySimpson/zlog | 高可靠高性能纯 C 日志库（偏 Linux） |

### 2.4 Shell / 命令行

| 库名 | 链接 | 说明 |
|------|------|------|
| **letter-shell** | https://github.com/NevermindZZT/letter-shell | 功能强大的嵌入式 shell，支持命令补全 |
| **nr_micro_shell** | https://gitee.com/nrush/nr_micro_shell | MCU 命令行交互，极简 |
| **cmd-parser** | https://github.com/jiejieTop/cmd-parser | 简单好用的命令解析器 |

### 2.5 Flash 存储

| 库名 | 链接 | 说明 |
|------|------|------|
| **EasyFlash** | https://github.com/armink/EasyFlash | 轻量级 Flash 存储器库，KV 存储 |
| **SFUD** | https://github.com/armink/SFUD | SPI Flash 通用驱动库，自动识别芯片 |

### 2.6 数据结构 / 缓冲区

| 库名 | 链接 | 说明 |
|------|------|------|
| **lwrb** | https://github.com/MaJerle/lwrb | 轻量级环形缓冲区，DMA+UART 场景必备 |
| **cQueue** | https://gitee.com/yorkjia/cQueue | ANSI C 消息队列 |

### 2.7 JSON 解析

| 库名 | 链接 | 说明 |
|------|------|------|
| **cJSON** | https://github.com/DaveGamble/cJSON | 最流行的轻量级 C JSON 库 |
| **jsmn** | https://github.com/zserge/jsmn | 极小巧的 JSON 解析器，零内存分配 |

### 2.8 调试 / 错误追踪

| 库名 | 链接 | 说明 |
|------|------|------|
| **CmBacktrace** | https://github.com/armink/CmBacktrace | ARM Cortex-M 错误代码自动追踪，HardFault 分析利器 |

### 2.9 状态机

| 库名 | 链接 | 说明 |
|------|------|------|
| **NorthFrame** | https://gitee.com/PISCES_X/NorthFrame | 单片机图形化状态机框架 |
| **QP/C** | https://github.com/QuantumLeaps/qpc | 开源状态机实现，专业级 |
| **EFSM** | https://gitee.com/simpost/EFSM | 事件驱动有限状态机 |

### 2.10 通信协议

| 库名 | 链接 | 说明 |
|------|------|------|
| **mqttclient** | https://github.com/jiejieTop/mqttclient | 省资源、高稳定的 MQTT 客户端 |
| **protobuf-c** | https://github.com/protobuf-c/protobuf-c | C 语言 Protocol Buffers |
| **FreeModbus** | https://github.com/armink/FreeModbus_Slave-Master-RTT-STM32 | 开源 Modbus 协议栈（主从机） |
| **LWIP** | https://savannah.nongnu.org/projects/lwip/ | 小型 TCP/IP 协议栈 |
| **mbedtls** | https://github.com/ARMmbed/mbedtls | 嵌入式 SSL/TLS 库 |

### 2.11 文件系统 / 配置解析

| 库名 | 链接 | 说明 |
|------|------|------|
| **inih** | https://github.com/benhoyt/inih | C 语言 INI 文件解析器 |
| **znfat** | https://gitee.com/dbembed/znfat | 国产嵌入式文件系统 |
| **SQLite** | https://www.sqlite.org/download.html | 嵌入式关系数据库 |

### 2.12 测试框架

| 库名 | 链接 | 说明 |
|------|------|------|
| **Unity** | https://github.com/ThrowTheSwitch/Unity | 轻量级嵌入式 C 测试框架 |
| **CuTest** | https://sourceforge.net/projects/cutest/ | 微小 C 单元测试框架，不到千行 |

### 2.13 OOP / 设计模式

| 库名 | 链接 | 说明 |
|------|------|------|
| **PLOOC** | https://github.com/GorgonMeducer/PLOOC | 受保护的低开销面向对象 C 编程 |
| **lw_oopc** | https://sourceforge.net/projects/lwoopc/ | 轻量级 C 语言 OOP 框架 |

### 2.14 MCU 软件框架

| 库名 | 链接 | 说明 |
|------|------|------|
| **CodeBrick** | https://gitee.com/moluo-tech/CodeBrick | 无 OS 的 MCU 实用软件管理系统 |
| **BabyOS** | https://gitee.com/notrynohigh/BabyOS | 专为 MCU 开发提速的代码框架 |
| **AMetal** | https://github.com/zlgopen/ametal | 芯片级裸机软件包，跨平台通用接口 |

---

### 2.15 控制系统 / 信号处理 / 系统辨识

> 嵌入式数学副驾。**首选 MATLAB MCP**（用户本机已装）— 调用方式见 `.auto-embedded/modes/matlab-embedded-toolkit.md`。下面列开源备选（无 MATLAB 时降级用）。

| 库名 | 链接 | 说明 | 适用场景 |
|------|------|------|---------|
| **python-control** | https://github.com/python-control/python-control | Python 控制系统库，API 仿 MATLAB | `lqr` / `place` / `pidtune` / `c2d` 等离线设计；MATLAB 不可用时降级 |
| **scipy.signal** | https://docs.scipy.org/doc/scipy/reference/signal.html | 数字滤波器设计与信号处理 | FIR/IIR 设计、Butterworth、Chebyshev、FFT、卷积 |
| **scipy.linalg** | https://docs.scipy.org/doc/scipy/reference/linalg.html | 线性代数（含 ARE 求解器） | `solve_continuous_are` / `solve_discrete_are` 算 LQR 增益 |
| **CMSIS-DSP** | https://github.com/ARM-software/CMSIS-DSP | ARM 官方 DSP 库（FIR/IIR/FFT/矩阵乘） | Cortex-M 上跑滤波器、LQR 矩阵乘、FFT |
| **Eigen** | https://eigen.tuxfamily.org/ | C++ 模板矩阵库 | 嵌入式 C++ 项目；header-only，无依赖 |
| **FilterPy** | https://github.com/rlabbe/filterpy | Python Kalman/EKF/UKF 库 | 离线设计观测器，导出参数到 MCU |
| **cantools** | https://github.com/cantools/cantools | Python CAN 数据库工具（.dbc 解析） | 无 MATLAB Vehicle Network Toolbox 时分析 CAN 日志 |
| **AutoLQR (Arduino)** | https://github.com/lily-osp/AutoLQR | Arduino 上的预计算 LQR 实例 | 极简自平衡 / 倒立摆 demo 参考 |
| **EmbedSummary 控制专题** | https://github.com/zhengnianli/EmbedSummary | 总目录里有 PID / Kalman / FOC 等专题分类 | 找其他特定算法实现时 |

**速查路由**：

| 任务 | 走哪条路 |
|---|---|
| 算 K 矩阵 / PID 参数 | MATLAB MCP（`mcp__matlab__*`） → 缺时 python-control |
| 滤波器在线运行 | CMSIS-DSP（C 端）；系数由 MATLAB / scipy.signal 离线算 |
| Kalman 离线设计 | MATLAB `kalman()` / FilterPy；运行用 CMSIS-DSP 矩阵乘手写 |
| CAN 日志解析 | MATLAB Vehicle Network Toolbox / cantools |
| 矩阵运算（嵌入式） | CMSIS-DSP（Cortex-M）/ Eigen（C++ 项目） |

**与 riper5 主协议的协作**：

- 触发关键词（`LQR` / `滤波器设计` / `系统辨识` / `卡尔曼` / `FFT` 等）→ 自动进 `.auto-embedded/modes/matlab-embedded-toolkit.md`
- 增益矩阵 / 滤波系数 / 查表 → 用 ` 一键导出 C 头文件

---

## 3. GUI 图形库

| 库名 | 链接 | 说明 | 适用场景 |
|------|------|------|---------|
| **LVGL** | https://gitee.com/mirrors/lvgl | 最流行的开源嵌入式 GUI | 彩屏 UI 开发 |
| **emWin** | https://www.segger.com/products/user-interface/emwin/ | SEGGER 老牌 GUI（ST 免费授权，非开源，仅限 ST 芯片免费） | 商业产品 |
| **TouchGFX** | https://www.touchgfx.com/zh/ | ST 出品，C++ 编写，硬件加速 | STM32 彩屏 |
| **GuiLite** | https://gitee.com/idea4good/GuiLite | 5 千行/仅头文件/全平台 | 极简 GUI 需求 |
| **AWTK** | https://gitee.com/zlgopen/awtk | ZLG 出品，基于 C 的 GUI 框架 | 国产 GUI 方案 |

---

## 4. 驱动参考

| 库名 | 链接 | 说明 |
|------|------|------|
| **ws2812** | https://github.com/hepingood/ws2812b | WS2812B LED 驱动库 |
| **MCU-Development** | https://github.com/cjeeks/MCU-Development | 基于 51/430/STM32 的各硬件模块 demo |
| **SoftWareSerial** | https://github.com/TonyIOT/SoftWareSerial | STM32 IO 模拟软件串口 |

---

## 5. 调试工具 / 上位机

| 工具 | 链接 | 说明 |
|------|------|------|
| **DAPLink** | https://github.com/ARMmbed/DAPLink | 开源调试器（下载/调试/虚拟串口） |
| **vofa+** | https://www.vofa.plus/ | 插件驱动的高自由度串口上位机 |
| **DSView** | https://github.com/DreamSourceLab/DSView | 跨平台逻辑分析仪 |

---

## 6. Bootloader

| 库名 | 链接 | 说明 |
|------|------|------|
| **OpenBLT** | https://sourceforge.net/projects/openblt/ | 开源引导加载程序 |

---

## 7. 芯片原厂 GitHub 仓库

| 厂商 | 链接 |
|------|------|
| **ST（意法半导体）** | https://github.com/STMicroelectronics |
| **TI（德州仪器）** | https://github.com/ti-simplelink |
| **NXP（恩智浦）** | https://github.com/NXP |
| **Infineon（英飞凌）** | https://github.com/Infineon |
| **Nordic（北欧半导体）** | https://github.com/NordicSemiconductor |
| **Microchip（微芯）** | https://github.com/MicrochipTech |
| **ADI（亚德诺）** | https://github.com/analogdevicesinc |
| **GD（兆易创新）** | https://www.gd32mcu.com/cn/download/7 |
| **Rockchip（瑞芯微）** | https://github.com/rockchip-linux |
| **HiSilicon（海思）** | https://github.com/hisilicon |

---

## 7.5 厂商 SDK / 主板模板（本地优先，远程兜底）

| 名称 | 资源解析 | 内容 | 触发方式 |
|------|---------|------|---------|
| **GD32F470VET6 主板（MICU / CMIC）** | 主仓变量 `$GD_ROOT`，按四级链解析（环境变量 `GD32_SDK_ROOT` → 工程 `硬件资源表.md` 中 `GD32_SDK_ROOT:` 字段 → skill 内置缓存 `$HOME/.claude/skills/embedded-dev/mcu_-gd_-main-board-master/` → 远程 <https://gitee.com/Ahypnis/mcu_-gd_-main-board>）。完整规则见 `.auto-embedded/refs/gd32f4xx-api.md` §0 | GD32F4xx 标准外设库 V3.3.3、CMSIS 5/6 Pack、V1/V2 板卡的 Standalone + Bootloader OTA Keil 模板、数据手册 PDF、原理图、DMA 通道表、UART OTA 上位机 Python 脚本 | API 速查见 `.auto-embedded/refs/gd32f4xx-api.md`；模板用法见 `.auto-embedded/modes/gd32-board.md`（触发词 `GD32` / `兆易` / `MICU 主板`） |

---

## 8. 学习资源 / 论坛

| 名称 | 链接 | 说明 |
|------|------|------|
| 安富莱论坛 | https://www.armbbs.cn/forum.php | 硬汉嵌入式，资料丰富 |
| 野火资料 | https://ebf-products.readthedocs.io/zh_CN/latest/ | 教程系统完整 |
| 正点原子资料 | http://www.openedv.com/docs/index.html | 配套例程多 |
| ST 中文社区 | https://www.stmcu.org.cn/module/forum/forum.php | 官方中文支持 |
| Awesome-Embedded | https://github.com/nhivp/Awesome-Embedded | 英文嵌入式资源汇总 |
| 源代码示例搜索 | https://cpp.hotexamples.com/zh/ | 从 100 万+开源项目搜索代码示例 |

---

## 快速选型指南

### 典型 MCU 项目常用组合

**裸机小项目**（无 OS）：
- 按键：MultiButton
- 定时器：MultiTimer
- 日志：EasyLogger
- Flash 存储：EasyFlash
- 调试：CmBacktrace

**RTOS 中型项目**：
- OS：FreeRTOS 或 RT-Thread
- Shell：letter-shell
- JSON：cJSON
- 环形缓冲：lwrb
- Flash：EasyFlash + SFUD
- 日志：EasyLogger

**IoT 联网项目**：
- OS：RT-Thread / FreeRTOS
- 网络：LWIP
- 安全：mbedtls
- MQTT：mqttclient
- JSON：cJSON
- GUI（可选）：LVGL

**工业控制项目**：
- 协议：FreeModbus
- 状态机：QP/C
- 测试：Unity
- 日志：EasyLogger
