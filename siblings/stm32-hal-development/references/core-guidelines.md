# STM32 HAL Development - 通用开发规范

## 核心原则

**嵌入式开发需要纪律。** 硬件不会像软件那样原谅错误。

### 🚨 铁律（绝对不可违反）

```
1. 所有代码必须在 USER CODE 区域
2. 不要修改 CubeMX 生成的代码
3. 需要配置外设？→ 用 CubeMX 配置 → 重新生成代码
4. 硬件约束优先于代码优化
```

**违反这些原则 = 不可靠的系统**

## 开发流程

```
1. 需求确认（硬件信息、功能需求、约束条件）
2. CubeMX 配置外设
3. 生成代码
4. 在 USER CODE 区域编写应用代码
5. 编译验证
6. 硬件测试
```

---

## 需求确认清单

**开始编码前，必须确认：**

### 必需信息
- [ ] **芯片型号**（STM32F103RCT6 等）
- [ ] **外设类型**（I2C1/SPI2/USART1 等）
- [ ] **引脚分配**（原理图或硬件连接）
- [ ] **外设设备**（型号、datasheet）
- [ ] **功能需求**（输入/输出/双向）

### 可选信息
- [ ] **工作模式**（轮询/中断/DMA）
- [ ] **时序要求**（波特率、频率、超时）
- [ ] **错误处理**（超时、重试、故障恢复）
- [ ] **性能约束**（CPU占用、响应时间）

---

## CubeMX 使用规范

### ⚠️ 核心规则

**不要手动修改 CubeMX 生成的代码！**

```
CubeMX 生成的代码（受保护）：
├── Core/Src/main.c              → 只在 USER CODE 区域编写
├── Core/Src/i2c.c               → 不要修改
├── Core/Src/usart.c             → 不要修改
├── Core/Src/gpio.c              → 不要修改
├── Core/Src/tim.c               → 不要修改
├── Core/Src/stm32f1xx_hal_msp.c → 不要修改
├── Core/Src/stm32f1xx_it.c      → 只在 USER CODE 区域
├── Core/Inc/main.h              → 只在 USER CODE 区域
└── Drivers/STM32F1xx_HAL_Driver/ → 绝对不要修改
```

### 需要配置外设时？

**正确做法：**
1. 打开项目的 `.ioc` 文件
2. 在 CubeMX 中配置外设
3. 生成代码
4. 在 USER CODE 区域添加应用代码

**错误做法：**
- ❌ 直接修改 `i2c.c` 的初始化代码
- ❌ 在 `stm32f1xx_hal_msp.c` 手动添加 MSP 函数
- ❌ 在 `gpio.c` 中修改 GPIO 配置
- ❌ 修改 `main.h` 中的引脚定义

### CubeMX 基本操作

```
1. 打开 .ioc 文件
2. 配置外设 → 生成代码
3. 在 USER CODE 区域编写应用代码
4. 需要修改配置？→ 回到步骤 1
```

---

## USER CODE 区域说明

### main.c USER CODE 区域

```c
/* USER CODE BEGIN 1 */    // HAL_Init 之前
/* USER CODE END 1 */

/* USER CODE BEGIN Init */  // HAL_Init 之后，时钟配置之前
/* USER CODE END Init */

/* USER CODE BEGIN SysInit */ // 时钟配置之后
/* USER CODE END SysInit */

/* USER CODE BEGIN 2 */    // 外设初始化之后，主循环之前
/* USER CODE END 2 */

/* USER CODE BEGIN WHILE */ // 主循环内
  // ...
/* USER CODE END WHILE */

/* USER CODE BEGIN 3 */    // 主循环结束
/* USER CODE END 3 */

/* USER CODE BEGIN 4 */    // 自定义函数
/* USER CODE END 4 */
```

### 中断文件 USER CODE 区域

```c
// stm32f1xx_it.c
void xxx_IRQHandler(void) {
  /* USER CODE BEGIN xxx_IRQn 0 */

  /* USER CODE END xxx_IRQn 0 */
}
```

---

## 驱动层架构

```
应用层 (main.c USER CODE)
    ↓ 调用
驱动层 (bsp_xxx.c/h)
    ↓ 使用
HAL 库 (STM32F1xx_HAL_Driver)
    ↓ 访问
硬件寄存器
```

**驱动文件存放位置**：
```
Hardware/
├── bsp_eeprom/     (EEPROM 驱动)
│   ├── bsp_eeprom.c
│   └── bsp_eeprom.h
├── bsp_sensor/      (传感器驱动)
└── bsp_xxx/
```

---

## 硬件约束检查清单

### 必须检查

- [ ] **引脚约束** - 引脚无冲突
- [ ] **时钟约束** - 时钟已启用，频率在规格内
- [ ] **时序约束** - 中断中无阻塞调用
- [ ] **内存约束** - 栈/ heap 足够，无大栈缓冲区
- [ ] **中断安全** - 共享数据已保护
- [ ] **DMA 约束** - 缓冲区对齐、生命周期正确
- [ ] **电气约束** - 电压水平、驱动能力

---

## 中断安全

### 🚨 危险：共享数据未保护

```c
❌ 错误：
volatile uint32_t counter = 0;

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    counter++;  // 非原子操作！
}

void main_loop(void) {
    uint32_t local = counter;  // 竞争条件！
}
```

```c
✅ 正确：
volatile uint32_t counter = 0;

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    counter++;  // ISR 中无需 disable_irq，回调本身在中断上下文中执行
}

void main_loop(void) {
    __disable_irq();
    uint32_t local = counter;  // 主循环侧需要保护，防止读取时被 ISR 打断
    __enable_irq();
}
```

### 中断中禁止的操作

- ❌ `HAL_Delay()`
- ❌ `printf()`
- ❌ 大栈缓冲区
- ❌ 浮点运算
- ❌ 阻塞调用

---

## 常见错误

| 错误 | 后果 | 解决方案 |
|------|------|---------|
| **写在外部** | CubeMX 重新生成时丢失 | 移到 USER CODE 区域 |
| **中断中阻塞** | 丢失中断、系统挂起 | 使用标志位 + 主循环处理 |
| **不检查返回值** | 静默失败、难调试 | 检查 `HAL_StatusTypeDef` |
| **大栈缓冲区** | 栈溢出崩溃 | 使用静态/全局变量 |
| **共享数据未保护** | 竞争条件 | 禁用中断或原子操作 |
| **DMA 缓冲区释放** | DMA 写入已释放内存 | 使用静态/全局变量 |
| **时钟未启用** | 外设不工作 | CubeMX 自动启用 |

---

## 快速开始指南

### 5 分钟实现按键控制 LED

**步骤 1**: CubeMX 配置（2 分钟）
- 配置 PA4 为 GPIO_Output（LED）
- 配置 PC1 为 GPIO_Input（按键，上拉）
- 生成代码

**步骤 2**: 编写代码（2 分钟）
```c
// 在 main.c USER CODE BEGIN 3 中添加
if (HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_1) == GPIO_PIN_RESET) {
    HAL_Delay(50);  // 消抖
    if (HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_1) == GPIO_PIN_RESET) {
        HAL_GPIO_TogglePin(LED3_GPIO_Port, LED3_Pin);
        while (HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_1) == GPIO_PIN_RESET);  // 等待释放
    }
}
HAL_Delay(10);
```

**步骤 3**: 编译烧录（1 分钟）

---

## 调试技巧

### 1. LED 调试法
```c
HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_SET);
// ... 代码 ...
HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_RESET);
```

### 2. 串口调试
```c
printf("Debug: var = %d\n", var);  // ⚠️ 不要在中断中使用
```

### 3. 常见问题排查

| 问题 | 检查项 |
|------|--------|
| 外设不工作 | 时钟？引脚？初始化？ |
| 中断不触发 | NVIC？函数名？标志位？ |
| 读到错误数据 | 时序？延时？电平？ |
| 系统死机 | 栈溢出？指针？看门狗？ |

---

## 常见陷阱

### 1. I2C 地址混淆
❌ 错误：直接使用 7 位地址（0x50）传给 HAL 函数
✅ 正确：HAL 需要左移一位的地址（`0x50 << 1` = 0xA0），HAL 内部再添加读写位

### 2. GPIO 中断去抖
❌ 错误：在中断中加 `HAL_Delay(50)`
✅ 正确：在主循环中定时扫描

### 3. DMA 缓冲区生命周期
❌ 错误：DMA 使用局部变量（函数返回后释放）
✅ 正确：DMA 使用静态/全局变量

### 4. printf 时机
❌ 错误：在 `HAL_Init` 之前调用 `printf`
✅ 正确：在 `MX_USART1_UART_Init` 之后调用

---

## 验证清单

提交代码前检查：

- [ ] 所有代码在 USER CODE 区域
- [ ] 中断中无阻塞调用
- [ ] 共享数据已保护
- [ ] HAL 返回值已检查
- [ ] 无大栈缓冲区
- [ ] 无动态内存分配
- [ ] DMA 缓冲区为静态/全局
- [ ] 编译无错误和警告
- [ ] 已在真实硬件测试

---

## 快速参考：常用 HAL 函数

```c
// GPIO
HAL_GPIO_ReadPin(port, pin)
HAL_GPIO_WritePin(port, pin, state)
HAL_GPIO_TogglePin(port, pin)

// UART
HAL_UART_Transmit(&huart1, data, len, timeout)
HAL_UART_Receive_IT(&huart1, data, len)
HAL_UART_Receive_DMA(&huart1, data, len)

// I2C
HAL_I2C_IsDeviceReady(&hi2c1, addr, trials, timeout)
HAL_I2C_Mem_Read(&hi2c1, addr, memaddr, size, pdata, timeout)
HAL_I2C_Mem_Write(&hi2c1, addr, memaddr, size, pdata, timeout)

// SPI
HAL_SPI_Transmit(&hspi1, pdata, size, timeout)
HAL_SPI_Receive(&hspi1, pdata, size, timeout)

// 定时器
HAL_TIM_Base_Start(&htimx)
HAL_TIM_PWM_Start(&htimx, TIM_CHANNEL_x)

// ADC
HAL_ADC_Start(&hadc1)
HAL_ADC_PollForConversion(&hadc1, timeout)
```

---

## 遇到问题？

### 问题：不知道用哪个 HAL 函数
→ 搜索 `HAL_<外设名>_`，例如 `HAL_I2C_`、`HAL_UART_`

### 问题：外设不工作
→ 检查：时钟？引脚？初始化？

### 问题：中断不触发
→ 检查：NVIC？函数名？标志位？

### 问题：DMA 不工作
→ 检查：模式？对齐？时钟？

---

## Bottom Line

**嵌入式开发不可宽容。**

- 写在外部 = 代码丢失
- 中断阻塞 = 系统不稳定
- 共享数据未保护 = 不可复现的 bug
- 不检查返回值 = 静默失败
- 忽略硬件约束 = 生产环境故障

**尊重硬件。遵守规则。彻底测试。**

你的代码将无人值守运行数年。一次做对。
