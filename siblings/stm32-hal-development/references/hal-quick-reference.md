# STM32 HAL 函数速查表

> 快速参考：常用 STM32 HAL 函数（STM32F1xx 系列）

## GPIO 操作

| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_GPIO_WritePin(GPIOx, GPIO_Pin, state)` | 写引脚 | `HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_SET);` |
| `HAL_GPIO_TogglePin(GPIOx, GPIO_Pin)` | 翻转引脚 | `HAL_GPIO_TogglePin(LED3_GPIO_Port, LED3_Pin);` |
| `HAL_GPIO_ReadPin(GPIOx, GPIO_Pin)` | 读引脚 | `GPIO_PinState state = HAL_GPIO_ReadPin(BUTTON_GPIO_Port, BUTTON_Pin);` |

## UART 通信

### 阻塞模式
| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_UART_Transmit(huart, pData, Size, Timeout)` | 发送数据 | `HAL_UART_Transmit(&huart1, tx_data, len, 1000);` |
| `HAL_UART_Receive(huart, pData, Size, Timeout)` | 接收数据 | `HAL_UART_Receive(&huart1, rx_data, len, 1000);` |

### 中断模式
| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_UART_Transmit_IT(huart, pData, Size)` | 中断发送 | `HAL_UART_Transmit_IT(&huart1, tx_data, len);` |
| `HAL_UART_Receive_IT(huart, pData, Size)` | 中断接收 | `HAL_UART_Receive_IT(&huart1, rx_data, len);` |

### DMA 模式
| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_UART_Transmit_DMA(huart, pData, Size)` | DMA发送 | `HAL_UART_Transmit_DMA(&huart1, tx_data, len);` |
| `HAL_UART_Receive_DMA(huart, pData, Size)` | DMA接收 | `HAL_UART_Receive_DMA(&huart1, rx_data, len);` |

### 回调函数
```c
// 发送完成回调
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart);

// 接收完成回调
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart);

// 错误回调
void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart);
```

## SPI 通信

| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_SPI_Transmit(hspi, pData, Size, Timeout)` | 发送 | `HAL_SPI_Transmit(&hspi1, data, len, 1000);` |
| `HAL_SPI_Receive(hspi, pData, Size, Timeout)` | 接收 | `HAL_SPI_Receive(&hspi1, data, len, 1000);` |
| `HAL_SPI_TransmitReceive(hspi, pTxData, pRxData, Size, Timeout)` | 发送接收 | `HAL_SPI_TransmitReceive(&hspi1, tx, rx, len, 1000);` |

## I2C 通信

| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_I2C_Master_Transmit(hi2c, DevAddress, pData, Size, Timeout)` | 主机发送 | `HAL_I2C_Master_Transmit(&hi2c1, 0x50<<1, data, len, 1000);` |
| `HAL_I2C_Master_Receive(hi2c, DevAddress, pData, Size, Timeout)` | 主机接收 | `HAL_I2C_Master_Receive(&hi2c1, 0x50<<1, data, len, 1000);` |
| `HAL_I2C_Mem_Write(hi2c, DevAddress, MemAddress, MemAddSize, pData, Size, Timeout)` | 内存写入 | `HAL_I2C_Mem_Write(&hi2c1, 0x50<<1, reg_addr, I2C_MEMADD_SIZE_8BIT, data, len, 1000);` |
| `HAL_I2C_Mem_Read(hi2c, DevAddress, MemAddress, MemAddSize, pData, Size, Timeout)` | 内存读取 | `HAL_I2C_Mem_Read(&hi2c1, 0x50<<1, reg_addr, I2C_MEMADD_SIZE_8BIT, data, len, 1000);` |

## 定时器

### 基本定时器
| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_TIM_Base_Start(htim)` | 启动定时器 | `HAL_TIM_Base_Start(&htim6);` |
| `HAL_TIM_Base_Stop(htim)` | 停止定时器 | `HAL_TIM_Base_Stop(&htim6);` |
| `HAL_TIM_Base_Start_IT(htim)` | 中断模式启动 | `HAL_TIM_Base_Start_IT(&htim6);` |

### PWM 输出
| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_TIM_PWM_Start(htim, Channel)` | 启动PWM | `HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);` |
| `__HAL_TIM_SET_COMPARE(htim, Channel, value)` | 设置占空比 | `__HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, 500);` |

### 输入捕获
| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_TIM_IC_Start_IT(htim, Channel)` | 启动输入捕获 | `HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_1);` |

### 回调函数
```c
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim);
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim);
```

## ADC 模数转换

| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_ADC_Start(hadc)` | 启动ADC | `HAL_ADC_Start(&hadc1);` |
| `HAL_ADC_Stop(hadc)` | 停止ADC | `HAL_ADC_Stop(&hadc1);` |
| `HAL_ADC_PollForConversion(hadc, Timeout)` | 等待转换完成 | `HAL_ADC_PollForConversion(&hadc1, 1000);` |
| `HAL_ADC_GetValue(hadc)` | 获取转换结果 | `uint32_t value = HAL_ADC_GetValue(&hadc1);` |
| `HAL_ADC_Start_DMA(hadc, pData, Length)` | DMA模式启动 | `HAL_ADC_Start_DMA(&hadc1, buffer, length);` |

## DAC 数模转换

| 函数 | 用途 | 示例 |
|------|------|------|
| `HAL_DAC_Start(hdac, Channel)` | 启动DAC | `HAL_DAC_Start(&hdac1, DAC_CHANNEL_1);` |
| `HAL_DAC_Stop(hdac, Channel)` | 停止DAC | `HAL_DAC_Stop(&hdac1, DAC_CHANNEL_1);` |
| `HAL_DAC_SetValue(hdac, Channel, Alignment, value)` | 设置输出值 | `HAL_DAC_SetValue(&hdac1, DAC_CHANNEL_1, DAC_ALIGN_12B_R, 2048);` |

## 常用宏定义

| 宏 | 用途 | 示例 |
|-----|------|------|
| `HAL_Delay(ms)` | 延时（阻塞） | `HAL_Delay(1000);` |
| `HAL_GetTick()` | 获取系统滴答数 | `uint32_t tick = HAL_GetTick();` |
| `__disable_irq()` | 关闭全局中断 | `__disable_irq();` |
| `__enable_irq()` | 开启全局中断 | `__enable_irq();` |
| `__NOP()` | 空操作（延时一个周期） | `__NOP();` |

## 常见返回状态

| 状态 | 值 | 含义 |
|------|-----|------|
| `HAL_OK` | 0x00 | 操作成功 |
| `HAL_ERROR` | 0x01 | 错误 |
| `HAL_BUSY` | 0x02 | 忙碌 |
| `HAL_TIMEOUT` | 0x03 | 超时 |

## 最佳实践

1. **始终检查返回值**
```c
if (HAL_UART_Transmit(&huart1, data, len, 1000) != HAL_OK) {
    Error_Handler();
}
```

2. **中断保护共享数据**
```c
__disable_irq();
shared_var++;
__enable_irq();
```

3. **使用原子操作保护共享变量**
```c
// 在主循环中读取被 ISR 修改的变量
__disable_irq();
uint32_t local = shared_var;
__enable_irq();
```

4. **避免在 ISR 中使用阻塞函数**
```c
// ❌ 错误：在 ISR 中阻塞
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    HAL_UART_Transmit(&huart1, data, len, 1000);  // 不要这样做！
}

// ✅ 正确：使用中断或 DMA
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    HAL_UART_Transmit_IT(&huart1, data, len);
}
```
