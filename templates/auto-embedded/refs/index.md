# refs —— 嵌入式离线知识库（按需加载）

> 沿用并 bundle 自上一代 `embedded-dev`：装进工程 `.auto-embedded/refs/`，**按需读取**（不自动全量注入，防撑爆上下文）。
> 命中相关主题时由 AI 主动打开对应文件；比赛/MATLAB/板级专项的总入口见 `.auto-embedded/modes/`。

| 文件 | 主题 |
|---|---|
| `arch-gate.md` | 分层架构门禁（arch-check）使用与强制化 |
| `checklist-mechanism.md` | 四文件磁盘记忆机制 |
| `checklist-templates.md` | 清单格式模板参考 |
| `cli-command-framework.md` | CLI 命令解析框架（嵌入式串口命令行） |
| `coding-standards.md` | 嵌入式代码规范（风格细则） |
| `competition-ai-max-workflow.md` | 自动完赛极限工作流（AI Max Throughput Mode） |
| `competition-index.md` | 全国大学生电子设计竞赛赛题索引 |
| `competition-quickstart-1page.md` | 竞赛 AI 完赛 — 单页 15 分钟快速通道 |
| `competition-scoring-checklist-template.md` | 竞赛评分点 → 验收表通用模板 |
| `competition-task-router.md` | 竞赛题型路由器（Task Router） |
| `contracts.md` | 共享约定 |
| `control-loop-sign-debug.md` | 闭环控制符号陷阱与对照实验诊断法 |
| `driver-porting.md` | 驱动库移植完整流程参考 |
| `embedded-architecture.md` | 嵌入式分层架构规范（避免屎山） |
| `embed-libs-index.md` | 嵌入式常用开源库速查索引 |
| `example-siemens-cimc-2025.md` | 端到端示例：2025 CIMC 西门子杯工业嵌入式开发初赛 |
| `failure-taxonomy.md` | 失败分类 |
| `gd32f4xx-api.md` | GD32F4xx 固件库 (Standard Peripheral Library) API 速查手册 |
| `git-snapshot.md` | Git 备份与回档规则 |
| `hooks-design.md` | Hooks 设计文档 |
| `imu-gyroscope-checklist.md` | IMU / 陀螺仪模块开发检查清单 |
| `lqr-example-bicycle-cornell.md` | 进阶示例：纯舵机单车 LQR（Cornell 点质量模型）— MATLAB 重建模 |
| `lqr-example-segway.md` | 端到端示例：两轮平衡车 LQR 设计 |
| `mahony-ahrs-reference.md` | Mahony AHRS 姿态解算算法参考 |
| `matlab-example-dds-signal-gen.md` | 实战示例：DDS 信号发生器（电赛 2001A / 2005A） |
| `matlab-example-iir-filter.md` | 入门示例：一阶低通 IIR 滤波器设计 |
| `matlab-example-modem-am.md` | 实战示例：AM 信号调制度测量（电赛 2022F） |
| `matlab-example-serial-plot.md` | 入门示例：串口 CSV 日志可视化与分析 |
| `matlab-example-step-id.md` | 入门示例：阶跃响应辨识温度对象 |
| `matlab-example-thd-meter.md` | 实战示例：失真度分析仪（电赛 2021A） |
| `matlab-hello-5min.md` | 5 分钟 Hello World — 零基础也能成功一次 |
| `mcp-tools.md` | MCP / 外部工具调用细则 |
| `mspm0g3507-seekfree-api.md` | MSPM0G3507 Seekfree 开源库 API 速查手册 |
| `pin-planning.md` | 引脚规划指南 |
| `platform-compatibility.md` | 平台兼容性 |
| `platform-migration.md` | 跨平台迁移指南 |
| `riper5-protocol.md` | RIPER-5 嵌入式芯片开发协议 |
| `riper5-stages.md` | RIPER-5 五阶段详细规则 |
| `shared-contracts.md` | 共享约定 |
| `shared-failure-taxonomy.md` | 失败分类 |
| `shared-platform-compatibility.md` | 平台兼容性 |
| `static-analysis-pipeline.md` | 静态检查管线（cppcheck + clang-tidy + lizard） |
| `stm32-hal-api.md` | STM32F1xx HAL 库 API 速查手册 |
| `stm32-stdperiph-api.md` | STM32F10x 标准外设库 (StdPeriph) API 速查手册 |
| `systematic-debugging.md` | 系统化调试方法论（四阶段根因分析） |
| `task-template.md` | 任务文件模板 |
| `tool-routing.md` | 工具路由表 + 优先级总表 |
| `troubleshooting.md` | 嵌入式故障快速排查指南 |
| `vibe-workflow.md` | Vibe 工作流补充规范 |

## 领域包

- `stm32-hal/` —— STM32 HAL 开发方法论 + BSP 模板（`references/` 指南 + `assets/` bsp-template.c/.h + `overview.md`）。配合 `aemb-peripheral-driver` 工具技能用。
