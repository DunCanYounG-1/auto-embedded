# 开源驱动搜索与评估指南

## 搜索策略

### GitHub 搜索

- 关键词模板：`<device> stm32 hal driver`、`<device> stm32 bsp`、`<device> embedded driver`
- 按 stars 排序，其次按最近更新时间
- 语言过滤器选 C
- forks 数量可作为质量参考信号

### Gitee 搜索

- 中文社区，常见器件覆盖率高
- 关键词：`<device> stm32 驱动`、`<device> HAL`

### 备选来源

- 厂商官方 SDK（Bosch、Sensirion、InvenSense 等）
- Arduino 库（适配工作量较大）
- Linux 内核驱动（仅参考逻辑，不可直接使用）
- STM32Cube 扩展包（X-CUBE-*）

## 评估清单

| 维度 | 好的信号 | 坏的信号 |
|------|---------|---------|
| HAL 兼容性 | 直接使用 STM32 HAL API | 裸寄存器操作、Arduino API、其他平台 |
| 代码质量 | 错误处理完善、命名规范、无魔法数字 | 无返回值检查、魔法数字、全局变量滥用 |
| 完整性 | Init + Read + Write + 错误码 | 只有读取、缺少初始化 |
| 文档 | 有 README、注释、示例 | 无文档、无注释 |
| 许可证 | MIT / BSD / Apache | GPL（传染性）、无许可证 |

## 适配难度评估

- **低**：已使用 STM32 HAL，只需重命名和整理
- **中**：使用其他 MCU 的 HAL，需要替换底层调用
- **高**：裸寄存器操作或 Arduino 库，需要重写通信层

## 快速决策流程

1. 器件在 `device-adaptation.md` 中有记录？ → 直接使用推荐库
2. 找到评分良好的 STM32 HAL 库？ → 使用 `--adapt` 适配
3. 找到逻辑良好的非 HAL 库？ → 手动适配通信层
4. 没有合适的开源库？ → 使用 `--scaffold` 从 datasheet 实现
