---
name: debug-platformio
description: 当需要通过 PlatformIO 内置调试功能对目标板进行 GDB 调试时使用，支持下载暂停、附加和崩溃现场分析。
---

# PlatformIO 调试

## 适用场景

- `Project Profile` 中标明 `build_system: platformio` 或工作区中存在 `platformio.ini`。
- 用户需要对目标板进行在线调试（单步、断点、查看寄存器和变量）。
- 需要分析崩溃现场（HardFault 寄存器、调用栈）。

## 必要输入

- PlatformIO 工程目录（包含 `platformio.ini`）。
- 可选的环境名称和调试模式。

## 自动探测

- 自动定位 `pio` CLI。
- 解析 `platformio.ini` 中的 `debug_tool` 配置。
- PlatformIO 自动管理调试服务器（OpenOCD/pyOCD/J-Link GDB Server），无需手动配置。

## 执行步骤

1. 先阅读 [references/usage.md](references/usage.md)，确认本次操作。
2. 探测调试环境：
   ```bash
   python scripts/pio_debugger.py --detect --project-dir <工程目录> --env <环境名>
   ```
3. 执行调试：
   ```bash
   python scripts/pio_debugger.py --project-dir <工程目录> --env <环境名> --mode download-and-halt
   ```

## 调试模式

- `download-and-halt`：下载固件到目标板，暂停在入口点，输出寄存器和回溯信息。
- `attach-only`：附加到正在运行的目标，不下载固件，输出当前状态。
- `crash-context`：暂停目标，读取寄存器、完整回溯和 Cortex-M Fault 寄存器（CFSR/HFSR/MMFAR/BFAR）。

## 失败分流

- `connection-failure`：调试器未连接或设备无响应。
- `debug-not-supported`：板卡不支持调试或未配置 debug_tool。
- `debug-failure`：调试会话异常终止。

## 输出约定

示例输出格式：

```
调试完成 ✅
  工程: ESP32_DEV → 环境: esp32dev
  板卡: esp32dev | 调试工具: esp-prog
  模式: download-and-halt
  关键观察: 5 条（寄存器、回溯帧）
```

## 交接关系

- 从 `build-platformio` 接收编译成功的工程信息。
- 调试发现问题后可回交给 `build-platformio` 修改代码重新编译。
