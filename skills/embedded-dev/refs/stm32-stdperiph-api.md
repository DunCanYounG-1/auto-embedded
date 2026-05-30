# STM32F10x 标准外设库 (StdPeriph) API 速查手册

> 来源：STM32F10x_StdPeriph_Lib V3.5.0
> 适用芯片：STM32F103xx 系列
> 离线缓存，RESEARCH/EXECUTE 阶段优先查本文件，无需联网。

---

## 外设总线速查表

| 外设 | 总线 | 时钟函数 | 常量 |
|---|---|---|---|
| GPIOA/B/C/D/E | APB2 | APB2PeriphClockCmd | RCC_APB2Periph_GPIOx |
| AFIO（重映射必须开） | APB2 | APB2PeriphClockCmd | RCC_APB2Periph_AFIO |
| USART1 | APB2 | APB2PeriphClockCmd | RCC_APB2Periph_USART1 |
| SPI1 | APB2 | APB2PeriphClockCmd | RCC_APB2Periph_SPI1 |
| ADC1/ADC2 | APB2 | APB2PeriphClockCmd | RCC_APB2Periph_ADCx |
| TIM1 | APB2 | APB2PeriphClockCmd | RCC_APB2Periph_TIM1 |
| USART2/3 | APB1 | APB1PeriphClockCmd | RCC_APB1Periph_USARTx |
| SPI2 | APB1 | APB1PeriphClockCmd | RCC_APB1Periph_SPI2 |
| I2C1/2 | APB1 | APB1PeriphClockCmd | RCC_APB1Periph_I2Cx |
| TIM2/3/4/5 | APB1 | APB1PeriphClockCmd | RCC_APB1Periph_TIMx |
| DMA1/2 | AHB | AHBPeriphClockCmd | RCC_AHBPeriph_DMAx |

> **总线频率**：APB2 = 72MHz, APB1 = 36MHz (max), AHB = 72MHz

---

## RCC 时钟控制

### 常用函数

```c
void RCC_APB2PeriphClockCmd(uint32_t RCC_APB2Periph, FunctionalState NewState);
void RCC_APB1PeriphClockCmd(uint32_t RCC_APB1Periph, FunctionalState NewState);
void RCC_AHBPeriphClockCmd(uint32_t RCC_AHBPeriph, FunctionalState NewState);
void RCC_APB2PeriphResetCmd(uint32_t RCC_APB2Periph, FunctionalState NewState);
void RCC_APB1PeriphResetCmd(uint32_t RCC_APB1Periph, FunctionalState NewState);
void RCC_GetClocksFreq(RCC_ClocksTypeDef* RCC_Clocks);
```

### 标准 72MHz 时钟配置（HSE 8MHz）

```c
/* 寄存器方式:
 * RCC->CR |= RCC_CR_HSEON;
 * while(!(RCC->CR & RCC_CR_HSERDY));
 * FLASH->ACR |= FLASH_ACR_LATENCY_2;
 * RCC->CFGR |= RCC_CFGR_HPRE_DIV1 | RCC_CFGR_PPRE2_DIV1 | RCC_CFGR_PPRE1_DIV2;
 * RCC->CFGR |= RCC_CFGR_PLLSRC_HSE | RCC_CFGR_PLLMULL9;
 * RCC->CR |= RCC_CR_PLLON;
 * while(!(RCC->CR & RCC_CR_PLLRDY));
 * RCC->CFGR |= RCC_CFGR_SW_PLL;
 */
RCC_DeInit();
RCC_HSEConfig(RCC_HSE_ON);
if(RCC_WaitForHSEStartUp() == SUCCESS) {
    FLASH_PrefetchBufferCmd(FLASH_PrefetchBuffer_Enable);
    FLASH_SetLatency(FLASH_Latency_2);
    RCC_HCLKConfig(RCC_SYSCLK_Div1);     /* AHB = SYSCLK = 72MHz */
    RCC_PCLK2Config(RCC_HCLK_Div1);      /* APB2 = HCLK = 72MHz */
    RCC_PCLK1Config(RCC_HCLK_Div2);      /* APB1 = HCLK/2 = 36MHz */
    RCC_PLLConfig(RCC_PLLSource_HSE_Div1, RCC_PLLMul_9);  /* 8MHz * 9 = 72MHz */
    RCC_PLLCmd(ENABLE);
    while(RCC_GetFlagStatus(RCC_FLAG_PLLRDY) == RESET);
    RCC_SYSCLKConfig(RCC_SYSCLKSource_PLLCLK);
    while(RCC_GetSYSCLKSource() != 0x08);
}
```

---

## GPIO 通用输入输出

### 初始化结构体

```c
typedef struct {
    uint16_t GPIO_Pin;         /* GPIO_Pin_0 ~ GPIO_Pin_15, GPIO_Pin_All */
    GPIOSpeed_TypeDef GPIO_Speed; /* GPIO_Speed_10MHz / 2MHz / 50MHz */
    GPIOMode_TypeDef GPIO_Mode;   /* 见下表 */
} GPIO_InitTypeDef;
```

### GPIO 模式速查

| 模式常量 | 含义 | 典型场景 |
|----------|------|---------|
| GPIO_Mode_AIN | 模拟输入 | ADC 输入 |
| GPIO_Mode_IN_FLOATING | 浮空输入 | USART RX、外部信号 |
| GPIO_Mode_IPD | 下拉输入 | 按键（外部上拉） |
| GPIO_Mode_IPU | 上拉输入 | 按键（外部下拉） |
| GPIO_Mode_Out_OD | 开漏输出 | I2C 模拟、电平转换 |
| GPIO_Mode_Out_PP | 推挽输出 | LED、继电器 |
| GPIO_Mode_AF_OD | 复用开漏 | I2C 硬件 |
| GPIO_Mode_AF_PP | 复用推挽 | USART TX、SPI |

### 常用函数

```c
void GPIO_Init(GPIO_TypeDef* GPIOx, GPIO_InitTypeDef* GPIO_InitStruct);
void GPIO_SetBits(GPIO_TypeDef* GPIOx, uint16_t GPIO_Pin);
void GPIO_ResetBits(GPIO_TypeDef* GPIOx, uint16_t GPIO_Pin);
uint8_t GPIO_ReadInputDataBit(GPIO_TypeDef* GPIOx, uint16_t GPIO_Pin);
uint16_t GPIO_ReadInputData(GPIO_TypeDef* GPIOx);
uint8_t GPIO_ReadOutputDataBit(GPIO_TypeDef* GPIOx, uint16_t GPIO_Pin);
uint16_t GPIO_ReadOutputData(GPIO_TypeDef* GPIOx);
void GPIO_WriteBit(GPIO_TypeDef* GPIOx, uint16_t GPIO_Pin, BitAction BitVal);
void GPIO_Write(GPIO_TypeDef* GPIOx, uint16_t PortVal);
void GPIO_PinLockConfig(GPIO_TypeDef* GPIOx, uint16_t GPIO_Pin);
void GPIO_PinRemapConfig(uint32_t GPIO_Remap, FunctionalState NewState);
void GPIO_EXTILineConfig(uint8_t GPIO_PortSource, uint8_t GPIO_PinSource);
```

### 常用引脚重映射

| 常量 | 重映射内容 |
|------|-----------|
| GPIO_Remap_SPI1 | SPI1: NSS/SCK/MISO/MOSI PA4/5/6/7 → PA15/PB3/4/5 |
| GPIO_PartialRemap_USART3 | USART3 TX/RX: PB10/11 → PC10/11（仅 2 线 UART，CK/CTS/RTS 另查 RM0008） |
| GPIO_FullRemap_USART3 | USART3 TX/RX: PB10/11 → PD8/9（仅 2 线 UART，CK/CTS/RTS 另查 RM0008） |
| GPIO_Remap_I2C1 | I2C1: PB6/7 → PB8/9 |
| GPIO_PartialRemap_TIM3 | TIM3: PA6/7 → PB4/5 |
| GPIO_FullRemap_TIM3 | TIM3: PA6/7 → PC6/7/8/9 |
| GPIO_Remap_SWJ_JTAGDisable | 释放 PA15/PB3/PB4（保留 SWD） |

> **注意**：使用重映射必须先开启 AFIO 时钟：`RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO, ENABLE)`

---

## USART 串口通信

### 初始化结构体

```c
typedef struct {
    uint32_t USART_BaudRate;             /* 波特率，如 9600, 115200 */
    uint16_t USART_WordLength;           /* USART_WordLength_8b / _9b */
    uint16_t USART_StopBits;             /* USART_StopBits_1 / _0_5 / _2 / _1_5 */
    uint16_t USART_Parity;               /* USART_Parity_No / _Even / _Odd */
    uint16_t USART_Mode;                 /* USART_Mode_Rx | USART_Mode_Tx */
    uint16_t USART_HardwareFlowControl;  /* USART_HardwareFlowControl_None */
} USART_InitTypeDef;
```

### 常用函数

```c
void USART_Init(USART_TypeDef* USARTx, USART_InitTypeDef* USART_InitStruct);
void USART_Cmd(USART_TypeDef* USARTx, FunctionalState NewState);
void USART_SendData(USART_TypeDef* USARTx, uint16_t Data);
uint16_t USART_ReceiveData(USART_TypeDef* USARTx);
FlagStatus USART_GetFlagStatus(USART_TypeDef* USARTx, uint16_t USART_FLAG);
void USART_ClearFlag(USART_TypeDef* USARTx, uint16_t USART_FLAG);
ITStatus USART_GetITStatus(USART_TypeDef* USARTx, uint16_t USART_IT);
void USART_ClearITPendingBit(USART_TypeDef* USARTx, uint16_t USART_IT);
void USART_ITConfig(USART_TypeDef* USARTx, uint16_t USART_IT, FunctionalState NewState);
void USART_DMACmd(USART_TypeDef* USARTx, uint16_t USART_DMAReq, FunctionalState NewState);
```

### 常用标志/中断

| 标志 | 含义 |
|------|------|
| USART_FLAG_TXE | 发送数据寄存器空 |
| USART_FLAG_TC | 发送完成 |
| USART_FLAG_RXNE | 接收数据寄存器非空 |
| USART_FLAG_IDLE | 空闲帧检测 |
| USART_FLAG_ORE | 溢出错误 |
| USART_IT_RXNE | 接收中断 |
| USART_IT_TXE | 发送中断 |
| USART_IT_IDLE | 空闲中断 |
| USART_IT_TC | 发送完成中断 |

### 默认引脚分配

| 外设 | TX | RX | 备注 |
|------|----|----|------|
| USART1 | PA9 | PA10 | APB2, 72MHz |
| USART2 | PA2 | PA3 | APB1, 36MHz |
| USART3 | PB10 | PB11 | APB1, 36MHz |

---

## SPI 串行外设接口

### 初始化结构体

```c
typedef struct {
    uint16_t SPI_Direction;          /* SPI_Direction_2Lines_FullDuplex / _1Line_Rx / _1Line_Tx / _2Lines_RxOnly */
    uint16_t SPI_Mode;               /* SPI_Mode_Master / SPI_Mode_Slave */
    uint16_t SPI_DataSize;           /* SPI_DataSize_8b / SPI_DataSize_16b */
    uint16_t SPI_CPOL;               /* SPI_CPOL_Low / SPI_CPOL_High */
    uint16_t SPI_CPHA;               /* SPI_CPHA_1Edge / SPI_CPHA_2Edge */
    uint16_t SPI_NSS;                /* SPI_NSS_Soft / SPI_NSS_Hard */
    uint16_t SPI_BaudRatePrescaler;  /* SPI_BaudRatePrescaler_2/4/8/16/32/64/128/256 */
    uint16_t SPI_FirstBit;           /* SPI_FirstBit_MSB / SPI_FirstBit_LSB */
    uint16_t SPI_CRCPolynomial;      /* CRC 多项式，不用设 7 */
} SPI_InitTypeDef;
```

### 常用函数

```c
void SPI_Init(SPI_TypeDef* SPIx, SPI_InitTypeDef* SPI_InitStruct);
void SPI_Cmd(SPI_TypeDef* SPIx, FunctionalState NewState);
void SPI_I2S_SendData(SPI_TypeDef* SPIx, uint16_t Data);
uint16_t SPI_I2S_ReceiveData(SPI_TypeDef* SPIx);
FlagStatus SPI_I2S_GetFlagStatus(SPI_TypeDef* SPIx, uint16_t SPI_I2S_FLAG);
void SPI_I2S_ClearFlag(SPI_TypeDef* SPIx, uint16_t SPI_I2S_FLAG);
void SPI_I2S_ITConfig(SPI_TypeDef* SPIx, uint16_t SPI_I2S_IT, FunctionalState NewState);
```

### SPI 模式速查

| 模式 | CPOL | CPHA | 说明 |
|------|------|------|------|
| Mode 0 | Low | 1Edge | 最常用，大多数器件默认 |
| Mode 1 | Low | 2Edge | |
| Mode 2 | High | 1Edge | |
| Mode 3 | High | 2Edge | W25Qxx Flash 常用 |

### 默认引脚分配

| 外设 | SCK | MISO | MOSI | NSS | 备注 |
|------|-----|------|------|-----|------|
| SPI1 | PA5 | PA6 | PA7 | PA4 | APB2, 最高36MHz |
| SPI2 | PB13 | PB14 | PB15 | PB12 | APB1, 最高18MHz |

---

## I2C 总线

### 初始化结构体

```c
typedef struct {
    uint32_t I2C_ClockSpeed;          /* 时钟速率 Hz，标准100000，快速400000 */
    uint16_t I2C_Mode;                /* I2C_Mode_I2C / I2C_Mode_SMBusDevice / _SMBusHost */
    uint16_t I2C_DutyCycle;           /* I2C_DutyCycle_2 / I2C_DutyCycle_16_9 */
    uint16_t I2C_OwnAddress1;         /* 自身地址（从机模式） */
    uint16_t I2C_Ack;                 /* I2C_Ack_Enable / I2C_Ack_Disable */
    uint16_t I2C_AcknowledgedAddress; /* I2C_AcknowledgedAddress_7bit / _10bit */
} I2C_InitTypeDef;
```

### 常用函数

```c
void I2C_Init(I2C_TypeDef* I2Cx, I2C_InitTypeDef* I2C_InitStruct);
void I2C_Cmd(I2C_TypeDef* I2Cx, FunctionalState NewState);
void I2C_GenerateSTART(I2C_TypeDef* I2Cx, FunctionalState NewState);
void I2C_GenerateSTOP(I2C_TypeDef* I2Cx, FunctionalState NewState);
void I2C_Send7bitAddress(I2C_TypeDef* I2Cx, uint8_t Address, uint8_t I2C_Direction);
void I2C_SendData(I2C_TypeDef* I2Cx, uint8_t Data);
uint8_t I2C_ReceiveData(I2C_TypeDef* I2Cx);
void I2C_AcknowledgeConfig(I2C_TypeDef* I2Cx, FunctionalState NewState);
ErrorStatus I2C_CheckEvent(I2C_TypeDef* I2Cx, uint32_t I2C_EVENT);
uint32_t I2C_GetLastEvent(I2C_TypeDef* I2Cx);
FlagStatus I2C_GetFlagStatus(I2C_TypeDef* I2Cx, uint32_t I2C_FLAG);
```

### 常用事件

| 事件 | 含义 |
|------|------|
| I2C_EVENT_MASTER_MODE_SELECT | 主模式已选择（EV5） |
| I2C_EVENT_MASTER_TRANSMITTER_MODE_SELECTED | 发送地址已应答（EV6，写） |
| I2C_EVENT_MASTER_RECEIVER_MODE_SELECTED | 接收地址已应答（EV6，读） |
| I2C_EVENT_MASTER_BYTE_TRANSMITTED | 字节发送完成（EV8_2） |
| I2C_EVENT_MASTER_BYTE_RECEIVED | 字节接收完成（EV7） |

### 默认引脚分配

| 外设 | SCL | SDA | 重映射后 |
|------|-----|-----|---------|
| I2C1 | PB6 | PB7 | PB8/PB9 |
| I2C2 | PB10 | PB11 | 无重映射 |

---

## DMA 直接内存访问

### 初始化结构体

```c
typedef struct {
    uint32_t DMA_PeripheralBaseAddr;  /* 外设地址，如 (uint32_t)&USART1->DR */
    uint32_t DMA_MemoryBaseAddr;      /* 内存缓冲区地址 */
    uint32_t DMA_DIR;                 /* DMA_DIR_PeripheralSRC / DMA_DIR_PeripheralDST */
    uint32_t DMA_BufferSize;          /* 传输数据量 */
    uint32_t DMA_PeripheralInc;       /* DMA_PeripheralInc_Enable / _Disable */
    uint32_t DMA_MemoryInc;           /* DMA_MemoryInc_Enable / _Disable */
    uint32_t DMA_PeripheralDataSize;  /* DMA_PeripheralDataSize_Byte / _HalfWord / _Word */
    uint32_t DMA_MemoryDataSize;      /* DMA_MemoryDataSize_Byte / _HalfWord / _Word */
    uint32_t DMA_Mode;                /* DMA_Mode_Normal / DMA_Mode_Circular */
    uint32_t DMA_Priority;            /* DMA_Priority_Low / _Medium / _High / _VeryHigh */
    uint32_t DMA_M2M;                 /* DMA_M2M_Enable / _Disable */
} DMA_InitTypeDef;
```

### 常用函数

```c
void DMA_Init(DMA_Channel_TypeDef* DMAy_Channelx, DMA_InitTypeDef* DMA_InitStruct);
void DMA_Cmd(DMA_Channel_TypeDef* DMAy_Channelx, FunctionalState NewState);
void DMA_DeInit(DMA_Channel_TypeDef* DMAy_Channelx);
void DMA_SetCurrDataCounter(DMA_Channel_TypeDef* DMAy_Channelx, uint16_t DataNumber);
uint16_t DMA_GetCurrDataCounter(DMA_Channel_TypeDef* DMAy_Channelx);
FlagStatus DMA_GetFlagStatus(uint32_t DMAy_FLAG);
void DMA_ClearFlag(uint32_t DMAy_FLAG);
void DMA_ITConfig(DMA_Channel_TypeDef* DMAy_Channelx, uint32_t DMA_IT, FunctionalState NewState);
ITStatus DMA_GetITStatus(uint32_t DMAy_IT);
void DMA_ClearITPendingBit(uint32_t DMAy_IT);
```

### DMA1 常用通道映射（STM32F103，节选）

| 通道 | 外设请求 |
|------|---------|
| DMA1_Channel1 | ADC1 |
| DMA1_Channel2 | SPI1_RX / USART3_TX / TIM1_CH1 |
| DMA1_Channel3 | SPI1_TX / USART3_RX / TIM1_CH2 |
| DMA1_Channel4 | SPI2_RX / USART1_TX / I2C2_TX / TIM1_CH4 |
| DMA1_Channel5 | SPI2_TX / USART1_RX / I2C2_RX / TIM1_UP |
| DMA1_Channel6 | USART2_RX / I2C1_TX / TIM3_CH1 |
| DMA1_Channel7 | USART2_TX / I2C1_RX / TIM2_CH2 |

> **重要**：一个 DMA 通道同时只能服务一个外设请求

---

## TIM 定时器

### 初始化结构体

```c
/* 时基配置 */
typedef struct {
    uint16_t TIM_Prescaler;         /* 预分频器 PSC，0~65535 */
    uint16_t TIM_CounterMode;       /* TIM_CounterMode_Up / _Down / _CenterAligned1/2/3 */
    uint16_t TIM_Period;            /* 自动重载值 ARR，0~65535 */
    uint16_t TIM_ClockDivision;     /* TIM_CKD_DIV1 / _DIV2 / _DIV4 */
    uint8_t  TIM_RepetitionCounter; /* 仅 TIM1/TIM8 有效 */
} TIM_TimeBaseInitTypeDef;

/* 输出比较（PWM） */
typedef struct {
    uint16_t TIM_OCMode;       /* TIM_OCMode_PWM1 / PWM2 / Toggle / Timing / Active / Inactive */
    uint16_t TIM_OutputState;  /* TIM_OutputState_Enable / _Disable */
    uint16_t TIM_Pulse;        /* 比较值 CCR，0~65535 */
    uint16_t TIM_OCPolarity;   /* TIM_OCPolarity_High / _Low */
    /* --- 以下字段仅 TIM1/TIM8 高级定时器有效 --- */
    uint16_t TIM_OutputNState;  /* TIM_OutputNState_Enable / _Disable（互补输出） */
    uint16_t TIM_OCNPolarity;   /* TIM_OCNPolarity_High / _Low */
    uint16_t TIM_OCIdleState;   /* TIM_OCIdleState_Set / _Reset */
    uint16_t TIM_OCNIdleState;  /* TIM_OCNIdleState_Set / _Reset */
} TIM_OCInitTypeDef;

/* 输入捕获 */
typedef struct {
    uint16_t TIM_Channel;      /* TIM_Channel_1 / _2 / _3 / _4 */
    uint16_t TIM_ICPolarity;   /* TIM_ICPolarity_Rising / _Falling / _BothEdge */
    uint16_t TIM_ICSelection;  /* TIM_ICSelection_DirectTI / _IndirectTI / _TRC */
    uint16_t TIM_ICPrescaler;  /* TIM_ICPSC_DIV1 / _DIV2 / _DIV4 / _DIV8 */
    uint16_t TIM_ICFilter;     /* 0x0 ~ 0xF */
} TIM_ICInitTypeDef;
```

### 常用函数

```c
/* 时基 */
void TIM_TimeBaseInit(TIM_TypeDef* TIMx, TIM_TimeBaseInitTypeDef* TIM_TimeBaseInitStruct);
void TIM_Cmd(TIM_TypeDef* TIMx, FunctionalState NewState);

/* PWM 输出 */
void TIM_OC1Init(TIM_TypeDef* TIMx, TIM_OCInitTypeDef* TIM_OCInitStruct);
void TIM_OC2Init(TIM_TypeDef* TIMx, TIM_OCInitTypeDef* TIM_OCInitStruct);
void TIM_OC3Init(TIM_TypeDef* TIMx, TIM_OCInitTypeDef* TIM_OCInitStruct);
void TIM_OC4Init(TIM_TypeDef* TIMx, TIM_OCInitTypeDef* TIM_OCInitStruct);
void TIM_OC1PreloadConfig(TIM_TypeDef* TIMx, uint16_t TIM_OCPreload);
void TIM_SetCompare1(TIM_TypeDef* TIMx, uint16_t Compare1);  /* 动态调占空比 */
void TIM_SetCompare2(TIM_TypeDef* TIMx, uint16_t Compare2);
void TIM_SetCompare3(TIM_TypeDef* TIMx, uint16_t Compare3);
void TIM_SetCompare4(TIM_TypeDef* TIMx, uint16_t Compare4);
void TIM_CtrlPWMOutputs(TIM_TypeDef* TIMx, FunctionalState NewState); /* 仅 TIM1/TIM8 需要 */

/* 输入捕获 */
void TIM_ICInit(TIM_TypeDef* TIMx, TIM_ICInitTypeDef* TIM_ICInitStruct);
uint16_t TIM_GetCapture1(TIM_TypeDef* TIMx);

/* 中断 */
void TIM_ITConfig(TIM_TypeDef* TIMx, uint16_t TIM_IT, FunctionalState NewState);
FlagStatus TIM_GetFlagStatus(TIM_TypeDef* TIMx, uint16_t TIM_FLAG);
void TIM_ClearFlag(TIM_TypeDef* TIMx, uint16_t TIM_FLAG);
ITStatus TIM_GetITStatus(TIM_TypeDef* TIMx, uint16_t TIM_IT);
void TIM_ClearITPendingBit(TIM_TypeDef* TIMx, uint16_t TIM_IT);
void TIM_ARRPreloadConfig(TIM_TypeDef* TIMx, FunctionalState NewState);
```

### 定时器频率计算

```
定时器更新频率 = TIMxCLK / (PSC + 1) / (ARR + 1)

示例：1ms 中断（TIM2，APB1 = 36MHz，但定时器时钟 = 72MHz 因为 APB1 分频 ≠ 1）
  PSC = 7199, ARR = 9  →  72MHz / 7200 / 10 = 1000Hz = 1ms

示例：50Hz PWM（20ms 周期，用于舵机）
  PSC = 71, ARR = 19999  →  72MHz / 72 / 20000 = 50Hz
  占空比 = CCR / (ARR + 1)
```

### 常用中断标志

| 标志 | 含义 |
|------|------|
| TIM_IT_Update | 更新中断（计数溢出） |
| TIM_IT_CC1 ~ CC4 | 捕获/比较通道 1~4 中断 |
| TIM_IT_Trigger | 触发中断 |

### TIM PWM 默认引脚

| 定时器 | CH1 | CH2 | CH3 | CH4 |
|--------|-----|-----|-----|-----|
| TIM1 | PA8 | PA9 | PA10 | PA11 |
| TIM2 | PA0 | PA1 | PA2 | PA3 |
| TIM3 | PA6 | PA7 | PB0 | PB1 |
| TIM4 | PB6 | PB7 | PB8 | PB9 |

---

## ADC 模数转换

### 初始化结构体

```c
typedef struct {
    uint32_t ADC_Mode;               /* ADC_Mode_Independent 最常用 */
    FunctionalState ADC_ScanConvMode;       /* ENABLE 多通道 / DISABLE 单通道 */
    FunctionalState ADC_ContinuousConvMode; /* ENABLE 连续 / DISABLE 单次 */
    uint32_t ADC_ExternalTrigConv;   /* ADC_ExternalTrigConv_None 软件触发 */
    uint32_t ADC_DataAlign;          /* ADC_DataAlign_Right / _Left */
    uint8_t  ADC_NbrOfChannel;       /* 转换通道数 1~16 */
} ADC_InitTypeDef;
```

### 常用函数

```c
void ADC_Init(ADC_TypeDef* ADCx, ADC_InitTypeDef* ADC_InitStruct);
void ADC_Cmd(ADC_TypeDef* ADCx, FunctionalState NewState);
void ADC_RegularChannelConfig(ADC_TypeDef* ADCx, uint8_t ADC_Channel, uint8_t Rank, uint8_t ADC_SampleTime);
void ADC_SoftwareStartConvCmd(ADC_TypeDef* ADCx, FunctionalState NewState);
FlagStatus ADC_GetFlagStatus(ADC_TypeDef* ADCx, uint8_t ADC_FLAG);
uint16_t ADC_GetConversionValue(ADC_TypeDef* ADCx);
void ADC_ResetCalibration(ADC_TypeDef* ADCx);
FlagStatus ADC_GetResetCalibrationStatus(ADC_TypeDef* ADCx);
void ADC_StartCalibration(ADC_TypeDef* ADCx);
FlagStatus ADC_GetCalibrationStatus(ADC_TypeDef* ADCx);
void ADC_DMACmd(ADC_TypeDef* ADCx, FunctionalState NewState);
void ADC_ITConfig(ADC_TypeDef* ADCx, uint16_t ADC_IT, FunctionalState NewState);
void ADC_TempSensorVrefintCmd(FunctionalState NewState); /* 内部温度/参考电压 */
```

### ADC 通道对应引脚

| 通道 | 引脚 | 通道 | 引脚 |
|------|------|------|------|
| ADC_Channel_0 | PA0 | ADC_Channel_8 | PB0 |
| ADC_Channel_1 | PA1 | ADC_Channel_9 | PB1 |
| ADC_Channel_2 | PA2 | ADC_Channel_10 | PC0 |
| ADC_Channel_3 | PA3 | ADC_Channel_11 | PC1 |
| ADC_Channel_4 | PA4 | ADC_Channel_12 | PC2 |
| ADC_Channel_5 | PA5 | ADC_Channel_13 | PC3 |
| ADC_Channel_6 | PA6 | ADC_Channel_14 | PC4 |
| ADC_Channel_7 | PA7 | ADC_Channel_15 | PC5 |
| ADC_Channel_16 | 内部温度传感器 | ADC_Channel_17 | 内部参考电压 |

### 采样时间常量

`ADC_SampleTime_1Cycles5` / `_7Cycles5` / `_13Cycles5` / `_28Cycles5` / `_41Cycles5` / `_55Cycles5` / `_71Cycles5` / `_239Cycles5`

> **ADC 校准**：初始化后必须执行校准流程（ResetCalibration → 等待 → StartCalibration → 等待）

### ADC 校准典型代码

```c
ADC_ResetCalibration(ADC1);
while(ADC_GetResetCalibrationStatus(ADC1));
ADC_StartCalibration(ADC1);
while(ADC_GetCalibrationStatus(ADC1));
```

---

## NVIC 中断控制

### 初始化结构体

```c
typedef struct {
    uint8_t NVIC_IRQChannel;                   /* 中断通道，如 USART1_IRQn */
    uint8_t NVIC_IRQChannelPreemptionPriority; /* 抢占优先级 0~15 */
    uint8_t NVIC_IRQChannelSubPriority;        /* 子优先级 0~15 */
    FunctionalState NVIC_IRQChannelCmd;        /* ENABLE / DISABLE */
} NVIC_InitTypeDef;
```

### 常用 IRQn

| IRQn 常量 | 对应中断 |
|-----------|---------|
| USART1_IRQn | USART1 全局中断 |
| USART2_IRQn | USART2 全局中断 |
| TIM2_IRQn | TIM2 全局中断 |
| TIM3_IRQn | TIM3 全局中断 |
| DMA1_Channel1_IRQn | DMA1 通道1 |
| EXTI0_IRQn ~ EXTI4_IRQn | 外部中断线 0~4 |
| EXTI9_5_IRQn | 外部中断线 5~9 |
| EXTI15_10_IRQn | 外部中断线 10~15 |
| ADC1_2_IRQn | ADC1 和 ADC2 |
| SPI1_IRQn | SPI1 全局中断 |
| I2C1_EV_IRQn | I2C1 事件中断 |
| I2C1_ER_IRQn | I2C1 错误中断 |

### 优先级分组

```c
NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2); /* 2位抢占 + 2位子优先级，最常用 */
/* 分组选项：Group_0(0+4), Group_1(1+3), Group_2(2+2), Group_3(3+1), Group_4(4+0) */
```

---

## EXTI 外部中断

### 初始化结构体

```c
typedef struct {
    uint32_t EXTI_Line;       /* EXTI_Line0 ~ EXTI_Line15 */
    EXTIMode_TypeDef EXTI_Mode;       /* EXTI_Mode_Interrupt / EXTI_Mode_Event */
    EXTITrigger_TypeDef EXTI_Trigger; /* EXTI_Trigger_Rising / _Falling / _Rising_Falling */
    FunctionalState EXTI_LineCmd;     /* ENABLE / DISABLE */
} EXTI_InitTypeDef;
```

### 配置步骤

```c
/* 1. 开启 AFIO 时钟 */
RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO, ENABLE);
/* 2. GPIO 配置为输入模式 */
/* 3. 映射 GPIO 到 EXTI 线 */
GPIO_EXTILineConfig(GPIO_PortSourceGPIOA, GPIO_PinSource0);
/* 4. 配置 EXTI */
EXTI_Init(&EXTI_InitStructure);
/* 5. 配置 NVIC */
```

> **注意**：同一编号的引脚（如 PA0 和 PB0）共享同一条 EXTI 线，不能同时使用
