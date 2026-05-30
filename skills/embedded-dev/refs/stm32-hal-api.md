# STM32F1xx HAL 库 API 速查手册

> 来源：STM32CubeF1 HAL Driver
> 适用芯片：STM32F1xx 系列
> 离线缓存，RESEARCH/EXECUTE 阶段优先查本文件，无需联网。

---

## StdPeriph 与 HAL 对照表

| 功能 | StdPeriph | HAL |
|------|-----------|-----|
| 时钟使能 | RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE) | __HAL_RCC_GPIOA_CLK_ENABLE() |
| GPIO 初始化 | GPIO_Init(GPIOA, &GPIO_InitStructure) | HAL_GPIO_Init(GPIOA, &GPIO_InitStruct) |
| GPIO 写 | GPIO_SetBits(GPIOA, GPIO_Pin_5) | HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET) |
| GPIO 读 | GPIO_ReadInputDataBit(GPIOA, GPIO_Pin_0) | HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0) |
| GPIO 翻转 | 无（需读-改-写） | HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5) |
| USART 发送 | USART_SendData(USART1, data) | HAL_UART_Transmit(&huart1, &data, 1, timeout) |
| USART 接收 | USART_ReceiveData(USART1) | HAL_UART_Receive(&huart1, &data, 1, timeout) |
| SPI 收发 | SPI_I2S_SendData / ReceiveData | HAL_SPI_TransmitReceive(&hspi1, tx, rx, len, timeout) |
| 延时 | 无标准实现 | HAL_Delay(ms) / HAL_GetTick() |
| 中断处理 | 手动检查+清除标志 | HAL 回调函数（自动清除标志） |

---

## RCC 时钟控制

### 时钟使能宏

```c
/* GPIO 时钟 */
__HAL_RCC_GPIOA_CLK_ENABLE();
__HAL_RCC_GPIOB_CLK_ENABLE();
__HAL_RCC_GPIOC_CLK_ENABLE();

/* 外设时钟 */
__HAL_RCC_USART1_CLK_ENABLE();   /* APB2 */
__HAL_RCC_USART2_CLK_ENABLE();   /* APB1 */
__HAL_RCC_SPI1_CLK_ENABLE();     /* APB2 */
__HAL_RCC_SPI2_CLK_ENABLE();     /* APB1 */
__HAL_RCC_I2C1_CLK_ENABLE();     /* APB1 */
__HAL_RCC_TIM2_CLK_ENABLE();     /* APB1 */
__HAL_RCC_TIM3_CLK_ENABLE();     /* APB1 */
__HAL_RCC_ADC1_CLK_ENABLE();     /* APB2 */
__HAL_RCC_DMA1_CLK_ENABLE();     /* AHB */
__HAL_RCC_AFIO_CLK_ENABLE();     /* APB2, 重映射必须 */
```

---

## GPIO 通用输入输出

### 初始化结构体

```c
typedef struct {
    uint32_t Pin;       /* GPIO_PIN_0 ~ GPIO_PIN_15, GPIO_PIN_All */
    uint32_t Mode;      /* 见下表 */
    uint32_t Pull;      /* GPIO_NOPULL / GPIO_PULLUP / GPIO_PULLDOWN */
    uint32_t Speed;     /* GPIO_SPEED_FREQ_LOW / _MEDIUM / _HIGH */
} GPIO_InitTypeDef;
```

### GPIO 模式

| 模式常量 | 含义 | StdPeriph 等价 |
|----------|------|---------------|
| GPIO_MODE_INPUT | 输入（配合 Pull 字段区分上拉/下拉/浮空） | IN_FLOATING + IPU + IPD（StdPeriph 拆成 3 个模式） |
| GPIO_MODE_OUTPUT_PP | 推挽输出 | Out_PP |
| GPIO_MODE_OUTPUT_OD | 开漏输出 | Out_OD |
| GPIO_MODE_AF_PP | 复用推挽 | AF_PP |
| GPIO_MODE_AF_OD | 复用开漏 | AF_OD |
| GPIO_MODE_ANALOG | 模拟 | AIN |
| GPIO_MODE_IT_RISING | 上升沿中断 | EXTI + Rising |
| GPIO_MODE_IT_FALLING | 下降沿中断 | EXTI + Falling |
| GPIO_MODE_IT_RISING_FALLING | 双沿中断 | EXTI + Rising_Falling |

### 常用函数

```c
void HAL_GPIO_Init(GPIO_TypeDef *GPIOx, GPIO_InitTypeDef *GPIO_Init);
void HAL_GPIO_DeInit(GPIO_TypeDef *GPIOx, uint32_t GPIO_Pin);
GPIO_PinState HAL_GPIO_ReadPin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);
void HAL_GPIO_WritePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin, GPIO_PinState PinState);
void HAL_GPIO_TogglePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);
/* EXTI 回调（用户重写） */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin);
```

---

## UART 串口通信

### 句柄结构体

```c
UART_HandleTypeDef huart1;
huart1.Instance = USART1;
huart1.Init.BaudRate = 115200;
huart1.Init.WordLength = UART_WORDLENGTH_8B;
huart1.Init.StopBits = UART_STOPBITS_1;
huart1.Init.Parity = UART_PARITY_NONE;
huart1.Init.Mode = UART_MODE_TX_RX;
huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
huart1.Init.OverSampling = UART_OVERSAMPLING_16;
HAL_UART_Init(&huart1);
```

### 常用函数

```c
/* 阻塞模式 */
HAL_StatusTypeDef HAL_UART_Transmit(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_UART_Receive(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size, uint32_t Timeout);

/* 中断模式 */
HAL_StatusTypeDef HAL_UART_Transmit_IT(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UART_Receive_IT(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);

/* DMA 模式 */
HAL_StatusTypeDef HAL_UART_Transmit_DMA(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UART_Receive_DMA(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);

/* 不定长接收（非常实用） */
HAL_StatusTypeDef HAL_UARTEx_ReceiveToIdle_IT(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UARTEx_ReceiveToIdle_DMA(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);

/* 终止传输 */
HAL_StatusTypeDef HAL_UART_Abort(UART_HandleTypeDef *huart);
HAL_StatusTypeDef HAL_UART_AbortReceive(UART_HandleTypeDef *huart);
```

### 回调函数（用户重写）

```c
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart);
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart);
void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size); /* ReceiveToIdle 回调 */
void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart);
void HAL_UART_RxHalfCpltCallback(UART_HandleTypeDef *huart); /* DMA 半传输回调（双缓冲常用） */
```

---

## SPI 串行外设接口

### 句柄配置

```c
SPI_HandleTypeDef hspi1;
hspi1.Instance = SPI1;
hspi1.Init.Mode = SPI_MODE_MASTER;
hspi1.Init.Direction = SPI_DIRECTION_2LINES;
hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
hspi1.Init.NSS = SPI_NSS_SOFT;
hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_8;
hspi1.Init.FirstBit = SPI_FIRSTBIT_MSB;
hspi1.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;
HAL_SPI_Init(&hspi1);
```

### 常用函数

```c
/* 阻塞模式 */
HAL_StatusTypeDef HAL_SPI_Transmit(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_SPI_Receive(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_SPI_TransmitReceive(SPI_HandleTypeDef *hspi, uint8_t *pTxData, uint8_t *pRxData, uint16_t Size, uint32_t Timeout);

/* 中断模式 */
HAL_StatusTypeDef HAL_SPI_Transmit_IT(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_SPI_Receive_IT(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_SPI_TransmitReceive_IT(SPI_HandleTypeDef *hspi, uint8_t *pTxData, uint8_t *pRxData, uint16_t Size);

/* DMA 模式 */
HAL_StatusTypeDef HAL_SPI_Transmit_DMA(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_SPI_Receive_DMA(SPI_HandleTypeDef *hspi, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_SPI_TransmitReceive_DMA(SPI_HandleTypeDef *hspi, uint8_t *pTxData, uint8_t *pRxData, uint16_t Size);
```

### 回调函数

```c
void HAL_SPI_TxCpltCallback(SPI_HandleTypeDef *hspi);
void HAL_SPI_RxCpltCallback(SPI_HandleTypeDef *hspi);
void HAL_SPI_TxRxCpltCallback(SPI_HandleTypeDef *hspi);
void HAL_SPI_ErrorCallback(SPI_HandleTypeDef *hspi);
```

---

## I2C 总线

### 句柄配置

```c
I2C_HandleTypeDef hi2c1;
hi2c1.Instance = I2C1;
hi2c1.Init.ClockSpeed = 400000;
hi2c1.Init.DutyCycle = I2C_DUTYCYCLE_2;
hi2c1.Init.OwnAddress1 = 0;
hi2c1.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;
HAL_I2C_Init(&hi2c1);
```

### 常用函数

```c
/* 主机发送/接收 */
HAL_StatusTypeDef HAL_I2C_Master_Transmit(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_I2C_Master_Receive(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint8_t *pData, uint16_t Size, uint32_t Timeout);

/* 内存读写（传感器常用：地址+寄存器+数据） */
HAL_StatusTypeDef HAL_I2C_Mem_Write(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_I2C_Mem_Read(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size, uint32_t Timeout);

/* 中断模式 */
HAL_StatusTypeDef HAL_I2C_Master_Transmit_IT(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_I2C_Master_Receive_IT(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_I2C_Mem_Write_IT(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_I2C_Mem_Read_IT(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size);

/* DMA 模式 */
HAL_StatusTypeDef HAL_I2C_Mem_Write_DMA(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_I2C_Mem_Read_DMA(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint16_t MemAddress, uint16_t MemAddSize, uint8_t *pData, uint16_t Size);

/* 设备检测 */
HAL_StatusTypeDef HAL_I2C_IsDeviceReady(I2C_HandleTypeDef *hi2c, uint16_t DevAddress, uint32_t Trials, uint32_t Timeout);
```

> **注意**：HAL I2C 地址参数为 7 位地址左移 1 位（即 8 位格式），如 MPU6050 地址 0x68 → 传入 0xD0

### 回调函数

```c
void HAL_I2C_MasterTxCpltCallback(I2C_HandleTypeDef *hi2c);
void HAL_I2C_MasterRxCpltCallback(I2C_HandleTypeDef *hi2c);
void HAL_I2C_MemTxCpltCallback(I2C_HandleTypeDef *hi2c);
void HAL_I2C_MemRxCpltCallback(I2C_HandleTypeDef *hi2c);
void HAL_I2C_ErrorCallback(I2C_HandleTypeDef *hi2c);
```

---

## DMA 直接内存访问

### 句柄配置

```c
DMA_HandleTypeDef hdma_usart1_rx;
hdma_usart1_rx.Instance = DMA1_Channel5;  /* 见 StdPeriph 手册通道映射表 */
hdma_usart1_rx.Init.Direction = DMA_PERIPH_TO_MEMORY;
hdma_usart1_rx.Init.PeriphInc = DMA_PINC_DISABLE;
hdma_usart1_rx.Init.MemInc = DMA_MINC_ENABLE;
hdma_usart1_rx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE;
hdma_usart1_rx.Init.MemDataAlignment = DMA_MDATAALIGN_BYTE;
hdma_usart1_rx.Init.Mode = DMA_CIRCULAR;
hdma_usart1_rx.Init.Priority = DMA_PRIORITY_HIGH;
HAL_DMA_Init(&hdma_usart1_rx);

/* 关联到 UART 句柄 */
__HAL_LINKDMA(&huart1, hdmarx, hdma_usart1_rx);
```

### 常用函数

```c
HAL_StatusTypeDef HAL_DMA_Init(DMA_HandleTypeDef *hdma);
HAL_StatusTypeDef HAL_DMA_DeInit(DMA_HandleTypeDef *hdma);
HAL_StatusTypeDef HAL_DMA_Start(DMA_HandleTypeDef *hdma, uint32_t SrcAddress, uint32_t DstAddress, uint32_t DataLength);
HAL_StatusTypeDef HAL_DMA_Start_IT(DMA_HandleTypeDef *hdma, uint32_t SrcAddress, uint32_t DstAddress, uint32_t DataLength);
HAL_StatusTypeDef HAL_DMA_Abort(DMA_HandleTypeDef *hdma);
uint32_t HAL_DMA_GetError(DMA_HandleTypeDef *hdma);
```

> **DMA 通道映射**：与 StdPeriph 相同，见 StdPeriph 手册 DMA1 通道映射表

---

## TIM 定时器

### 句柄配置

```c
TIM_HandleTypeDef htim2;
htim2.Instance = TIM2;
htim2.Init.Prescaler = 7199;
htim2.Init.CounterMode = TIM_COUNTERMODE_UP;
htim2.Init.Period = 9;
htim2.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE;
HAL_TIM_Base_Init(&htim2);
```

### 常用函数

```c
/* 时基 */
HAL_StatusTypeDef HAL_TIM_Base_Init(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Start(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Start_IT(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Stop_IT(TIM_HandleTypeDef *htim);

/* PWM */
HAL_StatusTypeDef HAL_TIM_PWM_Init(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_PWM_Start(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_PWM_Stop(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_PWM_Start_DMA(TIM_HandleTypeDef *htim, uint32_t Channel, uint32_t *pData, uint16_t Length);

/* 输入捕获 */
HAL_StatusTypeDef HAL_TIM_IC_Init(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_IC_Start_IT(TIM_HandleTypeDef *htim, uint32_t Channel);

/* 编码器 */
HAL_StatusTypeDef HAL_TIM_Encoder_Init(TIM_HandleTypeDef *htim, TIM_Encoder_InitTypeDef *sConfig);
HAL_StatusTypeDef HAL_TIM_Encoder_Start(TIM_HandleTypeDef *htim, uint32_t Channel);

/* 高级定时器互补输出（TIM1/TIM8） */
HAL_StatusTypeDef HAL_TIMEx_PWMN_Start(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIMEx_PWMN_Stop(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIMEx_ConfigBreakDeadTime(TIM_HandleTypeDef *htim, TIM_BreakDeadTimeConfigTypeDef *sBreakDeadTimeConfig);

/* 动态调占空比 */
__HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, pulse_value);
/* 读取计数器 */
__HAL_TIM_GET_COUNTER(&htim2);
```

### PWM 输出配置

```c
TIM_OC_InitTypeDef sConfigOC;
sConfigOC.OCMode = TIM_OCMODE_PWM1;
sConfigOC.Pulse = 500;  /* CCR 值 */
sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;
sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;
HAL_TIM_PWM_ConfigChannel(&htim3, &sConfigOC, TIM_CHANNEL_1);
HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
```

### 回调函数

```c
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim);  /* 更新中断 */
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim);     /* 输入捕获 */
void HAL_TIM_PWM_PulseFinishedCallback(TIM_HandleTypeDef *htim);
```

---

## ADC 模数转换

### 句柄配置

```c
ADC_HandleTypeDef hadc1;
hadc1.Instance = ADC1;
hadc1.Init.ScanConvMode = ADC_SCAN_DISABLE;
hadc1.Init.ContinuousConvMode = DISABLE;
hadc1.Init.DiscontinuousConvMode = DISABLE;
hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;
hadc1.Init.NbrOfConversion = 1;
HAL_ADC_Init(&hadc1);
```

### 常用函数

```c
HAL_StatusTypeDef HAL_ADC_Init(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_Start(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_PollForConversion(ADC_HandleTypeDef *hadc, uint32_t Timeout);
uint32_t HAL_ADC_GetValue(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_Stop(ADC_HandleTypeDef *hadc);

/* 中断模式 */
HAL_StatusTypeDef HAL_ADC_Start_IT(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_Stop_IT(ADC_HandleTypeDef *hadc);

/* DMA 模式（多通道扫描常用） */
HAL_StatusTypeDef HAL_ADC_Start_DMA(ADC_HandleTypeDef *hadc, uint32_t *pData, uint32_t Length);
HAL_StatusTypeDef HAL_ADC_Stop_DMA(ADC_HandleTypeDef *hadc);

/* 通道配置 */
HAL_StatusTypeDef HAL_ADC_ConfigChannel(ADC_HandleTypeDef *hadc, ADC_ChannelConfTypeDef *sConfig);

/* 校准（STM32F1 特有） */
HAL_StatusTypeDef HAL_ADCEx_Calibration_Start(ADC_HandleTypeDef *hadc);
```

### 通道配置

```c
ADC_ChannelConfTypeDef sConfig;
sConfig.Channel = ADC_CHANNEL_0;         /* ADC_CHANNEL_0 ~ _17 */
sConfig.Rank = ADC_REGULAR_RANK_1;       /* 转换顺序 */
sConfig.SamplingTime = ADC_SAMPLETIME_239CYCLES_5;
HAL_ADC_ConfigChannel(&hadc1, &sConfig);
```

### 回调函数

```c
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc);
void HAL_ADC_ConvHalfCpltCallback(ADC_HandleTypeDef *hadc);  /* DMA 半传输 */
void HAL_ADC_ErrorCallback(ADC_HandleTypeDef *hadc);
```

---

## HAL 通用约定

### 返回值

```c
typedef enum {
    HAL_OK       = 0x00,
    HAL_ERROR    = 0x01,
    HAL_BUSY     = 0x02,
    HAL_TIMEOUT  = 0x03
} HAL_StatusTypeDef;
```

### 三种操作模式

| 模式 | 后缀 | 特点 |
|------|------|------|
| 阻塞 | 无 | 带 Timeout 参数，函数返回即完成 |
| 中断 | _IT | 立即返回，完成后触发回调 |
| DMA | _DMA | 立即返回，传输由 DMA 完成，完成后触发回调 |

### MSP 初始化回调

HAL 使用 `HAL_xxx_MspInit()` / `HAL_xxx_MspDeInit()` 回调来配置底层硬件（GPIO、时钟、NVIC、DMA）：

```c
/* 由 HAL_UART_Init() 内部自动调用，用户需在此配置 GPIO 和时钟 */
void HAL_UART_MspInit(UART_HandleTypeDef *huart) {
    if(huart->Instance == USART1) {
        __HAL_RCC_USART1_CLK_ENABLE();
        __HAL_RCC_GPIOA_CLK_ENABLE();
        /* 配置 PA9(TX) PA10(RX) */
        GPIO_InitTypeDef GPIO_InitStruct = {0};
        GPIO_InitStruct.Pin = GPIO_PIN_9;
        GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
        GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_HIGH;
        HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
        GPIO_InitStruct.Pin = GPIO_PIN_10;
        GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
        GPIO_InitStruct.Pull = GPIO_NOPULL;
        HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
    }
}
```

### HAL_Delay 注意事项

- 基于 SysTick 中断，默认 1ms 节拍
- **禁止**在比 SysTick 优先级更高的中断中调用（会死锁）
- SysTick 默认优先级最低（15），确保其他中断不会阻塞它
