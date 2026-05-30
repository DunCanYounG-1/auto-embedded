# STM32 HAL Development Skill

专为 STM32 嵌入式 HAL 库开发设计的 Claude Code skill。

## 简介

这个 skill 提供了 STM32 HAL 库开发的完整指导，基于 superpowers 框架构建。它确保代码质量、硬件兼容性和最佳实践。

## 何时使用

当你进行以下工作时，此 skill 会自动触发：
- 配置外设（UART、SPI、I2C、TIM、ADC、DAC 等）
- 编写 BSP 驱动
- 实现中断处理程序
- 添加嵌入式功能
- 修改基于 HAL 的现有代码

## 文件结构

```
stm32-hal-development/
├── SKILL.md                             # 主 skill 文件（触发描述 + 工作流）
├── agents/openai.yaml                   # UI 元数据
├── references/core-guidelines.md        # 核心原则、最佳实践
├── references/peripheral-driver-guide.md
├── references/hal-quick-reference.md
├── references/troubleshooting-guide.md
├── references/usage-examples.md
└── assets/bsp-template.c/h              # BSP 层模板
```

## 核心原则

### 📍 铁律
**所有代码必须在 USER CODE 区域内**

STM32CubeMX 生成的代码使用受保护区域：
```c
/* USER CODE BEGIN <tag> */
// 你的代码放在这里
/* USER CODE END <tag> */
```

### 📐 分层架构
```
Application Layer (main.c USER CODE regions)
    ↓ calls
Driver Layer (bsp_xxx.c/h)
    ↓ uses HAL
HAL Library (STM32F1xx_HAL_Driver)
    ↓ accesses
Hardware Registers
```

### ⚠️ 关键规则
1. **绝不**在 USER CODE 区域外编写代码
2. **绝不**在中断服务程序中使用阻塞函数
3. **绝不**在未保护的情况下访问共享数据
4. **始终**检查 HAL 返回值
5. **始终**考虑硬件约束（时钟、内存、时序）

## 📚 文档索引

| 文档 | 用途 | 何时阅读 |
|------|------|---------|
| **[SKILL.md](../SKILL.md)** | 触发描述、核心工作流 | ⭐ 先读 |
| **[core-guidelines.md](core-guidelines.md)** | 核心原则、最佳实践 | 编写 HAL 代码前 |
| **[peripheral-driver-guide.md](peripheral-driver-guide.md)** | 外设驱动开发指南（实战经验） | 开发 I2C/SPI/UART 传感器驱动时 |
| **[hal-quick-reference.md](hal-quick-reference.md)** | HAL 函数速查表 | 忘记函数签名时查阅 |
| **[usage-examples.md](usage-examples.md)** | 完整代码示例 | 参考具体实现 |
| **[troubleshooting-guide.md](troubleshooting-guide.md)** | 故障排查指南 | 遇到问题时查阅 |
| **[assets/bsp-template.c](../assets/bsp-template.c)** | BSP 层模板 | 创建新驱动时的起点 |

---

## 🚀 快速开始

### 1. 创建新的外设功能

使用提供的工作流程：

```dot
检查是否为 CubeMX 项目 → 在 CubeMX 中配置外设 → 生成代码 → 定位 USER CODE 区域 → 阅读 HAL 参考手册 → 在 USER CODE 区域编写代码 → 验证硬件约束 → 编译验证
```

### 2. 使用 BSP 模板

复制 `assets/bsp-template.c` 和 `assets/bsp-template.h` 作为起点：
- 重命名为 `bsp_<功能名>.c/h`
- 修改函数前缀 `BSP_XXX_`
- 实现具体功能

### 3. 查阅 HAL 函数

参考 `references/hal-quick-reference.md` 快速查找：
- GPIO 操作
- UART 通信（阻塞/中断/DMA）
- SPI/I2C 通信
- 定时器/PWM
- ADC/DAC

### 4. 编写外设驱动

参考 `references/peripheral-driver-guide.md`：
- 规格书阅读要点
- 驱动架构设计
- 实现最佳实践
- 调试技巧
- 常见陷阱与解决方案

### 5. 故障排查

遇到问题时参考 `references/troubleshooting-guide.md`：
- 外设无响应
- 中断不触发
- DMA 不工作
- 随机崩溃
- 时序问题

## 常见问题解答

### Q: CubeMX 生成的代码太多了，可以简化吗？
**A:** 不建议。代码效率远不如正确性重要。CubeMX 确保初始化正确，生成的代码会被优化器优化。

### Q: 我可以在 ISR 中使用 `HAL_Delay()` 吗？
**A:** 绝不可以。ISR 中使用阻塞函数会导致：
- 错过中断
- 系统不可预测
- 可能的死锁

### Q: 为什么需要保护共享变量？
**A:** ARM Cortex-M3 上对齐的 32 位读写（LDR/STR）是原子的，但读-改-写操作（如 `counter++`）不是原子的。中断和主循环同时访问同一变量时，需要在主循环侧用 `__disable_irq()` / `__enable_irq()` 保护。

### Q: 如何调试时序问题？
**A:**
1. 使用示波器/逻辑分析仪
2. GPIO 翻转调试（在关键位置翻转引脚）
3. SWO/ITM 输出（如果调试器支持）
4. 不要猜测，要测量

## 技能验证

此 skill 已包含：
- ✅ 防合理化表格（Common Rationalizations）
- ✅ 红旗警示列表（Red Flags）
- ✅ 完整工作流程（带流程图）
- ✅ 快速参考表
- ✅ 常见错误及修复
- ✅ 代码示例
- ✅ 验证清单

## 参考资源

- [STM32F1 HAL 驱动用户手册 UM1850](https://www.st.com/resource/en/user_manual/um1850-description-of-stm32f1xx-hal-drivers-stmicroelectronics.pdf)
- [STM32F103 参考手册 RM0008](https://www.st.com/resource/en/reference_manual/rm0008-stm32f101xx-stm32f102xx-stm32f103xx-stm32f105xx-and-stm32f107xx-advanced-armbased-32bit-microcontrollers-stmicroelectronics.pdf)
- [STM32CubeMX 用户手册](https://www.st.com/resource/en/user_manual/um1718-stm32cubemx-STM32CubeMX-stmicroelectronics.pdf)

## 致谢

本 skill 基于 [obra/superpowers](https://github.com/obra/superpowers) 框架构建，遵循其 TDD 驱动的技能创建方法论。

## 许可证

MIT License

---

## 📊 优化总结

**v1.1 优化内容** (2026-04-12):

✅ **减少重复内容**:
- 移除 SKILL.md 中的代码示例（→ usage-examples.md）
- 精简各文件的重复说明
- 统一示例代码到 usage-examples.md

✅ **改进文件组织**:
- SKILL.md 专注于核心原则和最佳实践
- peripheral-driver-guide.md 专注于驱动开发经验
- usage-examples.md 作为完整的代码示例参考

✅ **保持文件平衡**:
- SKILL.md: ~417 行 → ~320 行（精简 23%）
- troubleshooting-guide.md: 保持原有结构
- hal-quick-reference.md: 保持原有结构（速查表需要详细）
- usage-examples.md: ~477 行 → ~510 行（补充 LED 示例）

---

**记住：嵌入式开发不容许错误。遵循规则，彻底测试。**
