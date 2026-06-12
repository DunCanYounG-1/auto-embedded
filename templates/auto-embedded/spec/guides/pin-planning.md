# 引脚规划指南（guide）

> guide = "要考虑什么"的思维清单（区别于 spec 的"怎么做才安全"）。RESEARCH 阶段引脚规划时读。

## 步骤
1. 列出所有外设需求（UART/SPI/I2C/ADC/PWM/TIM/CAN/USB…）与引脚数。
2. 查官方 pinout / datasheet 的复用矩阵（Alternate Function）。
3. 避让调试口（SWD: PA13/PA14；JTAG）与 BOOT/STRAP 脚。
4. 检测冲突：同一物理脚不可被两个外设占用；同一 DMA 通道/中断号不可重复。
5. 把最终分配写入 `../hardware/hw-lock.yaml` 并冻结。

## 冲突自查
- [ ] 无引脚重复占用
- [ ] 无 DMA 通道/流冲突
- [ ] 无中断号重复、抢占/子优先级合理
- [ ] 调试口/STRAP 未被普通外设征用
- [ ] 时钟域：相关外设时钟已使能、频率满足时序

## 沉淀（promote 回流）
> 某芯片引脚复用的非显然约束沉淀于此。
