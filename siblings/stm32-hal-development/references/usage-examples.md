# STM32 HAL Development Skill - 使用示例

本文档展示如何在实际项目中使用 `stm32-hal-development` skill。

---

## 📋 目录

1. [示例 1：GPIO 控制 LED](#示例-1gpio-控制-led)
2. [示例 2：UART 中断接收](#示例-2uart-中断接收)
3. [示例 3：PWM 输出](#示例-3pwm-输出)
4. [示例 4：SPI 传感器](#示例-4spi-传感器)
5. [示例 5：ADC + DMA 采集](#示例-5adc--dma-采集)
6. [常见错误示例](#常见错误示例)

---

## 示例 1：GPIO 控制 LED

### 场景
控制板载 LED 的开关和翻转。

### 步骤 1：在 CubeMX 中配置
1. 配置 PA4 为 GPIO_Output
2. 生成代码

### 步骤 2：创建 BSP 驱动
创建 `Hardware/bsp_led/` 目录。

**bsp_led.h**:
```c
#ifndef BSP_LED_H
#define BSP_LED_H

#include "main.h"

void BSP_LED_Init(void);
void BSP_LED_Toggle(void);
void BSP_LED_On(void);
void BSP_LED_Off(void);

#endif /* BSP_LED_H */
```

**bsp_led.c**:
```c
#include "bsp_led.h"

void BSP_LED_Init(void) {
    // 已在 CubeMX 中初始化
}

void BSP_LED_Toggle(void) {
    HAL_GPIO_TogglePin(LED3_GPIO_Port, LED3_Pin);
}

void BSP_LED_On(void) {
    HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_SET);
}

void BSP_LED_Off(void) {
    HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_RESET);
}
```

### 步骤 3：在 main.c 中使用
```c
/* USER CODE BEGIN 0 */
#include "bsp_led.h"
/* USER CODE END 0 */

/* USER CODE BEGIN 2 */
BSP_LED_Init();
/* USER CODE END 2 */

/* USER CODE BEGIN WHILE */
while (1) {
    BSP_LED_Toggle();
    HAL_Delay(500);
}
/* USER CODE END 3 */
```

---

## 示例 2：UART 中断接收

### 场景
需要通过 UART 接收不定长数据，使用中断模式。

### 步骤 1：在 CubeMX 中配置
1. 打开 `STM32_AI.ioc`
2. 启用 USART1：
   - Mode: Asynchronous
   - Baud Rate: 115200
   - Word Length: 8 Bits
   - Parity: None
   - Stop Bits: 1
3. 在 NVIC Settings 中启用 USART1 global interrupt
4. 生成代码

### 步骤 2：创建 BSP 驱动
创建 `Hardware/` 目录（不在 `Core/` 中）：
```bash
mkdir -p Hardware/bsp_uart
```

创建 `bsp_uart.h`：
```c
#ifndef BSP_UART_H
#define BSP_UART_H

#include "main.h"
#include <stdint.h>

void BSP_UART_Init(void);
void BSP_UART_ReceiveIT(void);
uint16_t BSP_UART_GetData(uint8_t* data, uint16_t len);

#endif /* BSP_UART_H */
```

### 步骤 3：实现 BSP 驱动
创建 `bsp_uart.c`：
```c
#include "bsp_uart.h"
#include <string.h>

#define RX_BUFFER_SIZE 64
static uint8_t rxBuffer[RX_BUFFER_SIZE];
static volatile uint16_t rxIndex = 0;

void BSP_UART_Init(void) {
    // 已在 CubeMX 中初始化
}

void BSP_UART_ReceiveIT(void) {
    HAL_UART_Receive_IT(&huart1, &rxBuffer[0], 1);
}

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    if (huart->Instance == USART1) {
        rxIndex++;
        if (rxIndex >= RX_BUFFER_SIZE) {
            rxIndex = 0;
        }

        // 重启接收
        HAL_UART_Receive_IT(&huart1, &rxBuffer[rxIndex], 1);
    }
}

uint16_t BSP_UART_GetData(uint8_t* data, uint16_t len) {
    __disable_irq();
    uint16_t available = rxIndex;
    if (len > available) len = available;
    memcpy(data, rxBuffer, len);
    rxIndex = 0;
    __enable_irq();
    return len;
}
```

### 步骤 4：在 main.c 中使用
在 `USER CODE BEGIN 0` 中添加头文件：
```c
/* USER CODE BEGIN 0 */
#include "bsp_uart.h"
/* USER CODE END 0 */
```

在 `USER CODE BEGIN 2` 中初始化：
```c
/* USER CODE BEGIN 2 */
BSP_UART_Init();
BSP_UART_ReceiveIT();
/* USER CODE END 2 */
```

在主循环中处理：
```c
/* USER CODE BEGIN WHILE */
  uint8_t data[64];
  while (1)
  {
    uint16_t len = BSP_UART_GetData(data, 64);
    if (len > 0) {
      // 处理接收到的数据
      HAL_GPIO_TogglePin(LED3_GPIO_Port, LED3_Pin);
    }
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
```

---

## 示例 3：PWM 输出

### 场景
需要在 PA8 引脚输出 1kHz PWM，占空比可调。

### 步骤 1：在 CubeMX 中配置
1. 启用 TIM1：
   - Clock Source: Internal Clock
   - Channel1: PWM Generation CH1
   - Prescaler: 71 (72MHz / 72 = 1MHz)
   - Counter Period: 999 (1MHz / 1000 = 1kHz)
   - Pulse: 500 (50% 占空比)
2. Pinout & Configuration → TIM1 → Channel1 → Mode: PWM mode 1
3. 生成代码

### 步骤 2：创建 BSP 驱动
创建 `Hardware/bsp_pwm/` 目录。

`bsp_pwm.h`：
```c
#ifndef BSP_PWM_H
#define BSP_PWM_H

#include "main.h"

void BSP_PWM_Init(void);
void BSP_PWM_SetDutyCycle(uint16_t duty);
void BSP_PWM_Start(void);
void BSP_PWM_Stop(void);

#endif /* BSP_PWM_H */
```

`bsp_pwm.c`：
```c
#include "bsp_pwm.h"

void BSP_PWM_Init(void) {
    // 已在 CubeMX 中初始化
}

void BSP_PWM_SetDutyCycle(uint16_t duty) {
    if (duty > 1000) duty = 1000;
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, duty);
}

void BSP_PWM_Start(void) {
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);
}

void BSP_PWM_Stop(void) {
    HAL_TIM_PWM_Stop(&htim1, TIM_CHANNEL_1);
}
```

### 步骤 3：在 main.c 中使用
```c
/* USER CODE BEGIN 0 */
#include "bsp_pwm.h"
/* USER CODE END 0 */

/* USER CODE BEGIN 2 */
BSP_PWM_Init();
BSP_PWM_SetDutyCycle(500);  // 50% 占空比
BSP_PWM_Start();
/* USER CODE END 2 */

/* USER CODE BEGIN WHILE */
  while (1)
  {
    // 动态调整占空比
    for (uint16_t i = 0; i < 1000; i++) {
      BSP_PWM_SetDutyCycle(i);
      HAL_Delay(10);
    }
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
```

---

## 示例 4：SPI 传感器

### 场景
通过 SPI 读取温湿度传感器数据。

### 步骤 1：在 CubeMX 中配置
1. 启用 SPI1：
   - Mode: Full-Duplex Master
   - Hardware NSS: Disable
   - Baud Rate: 1 MHz
   - CPOL: Low
   - CPHA: 1 Edge
2. 配置引脚：
   - PA5: SPI1_SCK
   - PA6: SPI1_MISO
   - PA7: SPI1_MOSI
   - PA4: GPIO_Output (CS 片选)
3. 生成代码

### 步骤 2：创建 BSP 驱动
创建 `Hardware/bsp_sensor/` 目录。

`bsp_sensor.h`：
```c
#ifndef BSP_SENSOR_H
#define BSP_SENSOR_H

#include "main.h"
#include <stdint.h>

#define SENSOR_CS_LOW()   HAL_GPIO_WritePin(GPIOA, GPIO_PIN_4, GPIO_PIN_RESET)
#define SENSOR_CS_HIGH()  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_4, GPIO_PIN_SET)

void BSP_Sensor_Init(void);
HAL_StatusTypeDef BSP_Sensor_Read(uint8_t reg, uint8_t* data);

#endif /* BSP_SENSOR_H */
```

`bsp_sensor.c`：
```c
#include "bsp_sensor.h"

void BSP_Sensor_Init(void) {
    // 已在 CubeMX 中初始化
    SENSOR_CS_HIGH();
}

HAL_StatusTypeDef BSP_Sensor_Read(uint8_t reg, uint8_t* data) {
    uint8_t tx_data[2] = {reg, 0x00};
    uint8_t rx_data[2] = {0};
    HAL_StatusTypeDef status;

    SENSOR_CS_LOW();
    HAL_Delay(1);

    status = HAL_SPI_TransmitReceive(&hspi1, tx_data, rx_data, 2, 1000);

    SENSOR_CS_HIGH();

    if (status == HAL_OK) {
        *data = rx_data[1];
    }

    return status;
}
```

### 步骤 3：在 main.c 中使用
```c
/* USER CODE BEGIN 0 */
#include "bsp_sensor.h"
/* USER CODE END 0 */

/* USER CODE BEGIN 2 */
BSP_Sensor_Init();
/* USER CODE END 2 */

/* USER CODE BEGIN WHILE */
  uint8_t temp;
  while (1)
  {
    if (BSP_Sensor_Read(0x00, &temp) == HAL_OK) {
      // 处理温度数据
    }
    HAL_Delay(1000);
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
```

---

## 示例 5：ADC + DMA 采集

### 场景
使用 ADC 以 10kS/s 采样率采集数据，使用 DMA 传输到缓冲区。

### 步骤 1：在 CubeMX 中配置
1. 启用 ADC1：
   - IN0: Channel 0
   - Continuous Conversion Mode: Enable
   - DMA Continuous Requests: Enable
2. 启用 DMA：
   - ADC1 → DMA1
   - Mode: Circular
   - Data Width: Word (32-bit)
3. 生成代码

### 步骤 2：创建 BSP 驱动
创建 `Hardware/bsp_adc/` 目录。

`bsp_adc.h`：
```c
#ifndef BSP_ADC_H
#define BSP_ADC_H

#include "main.h"
#include <stdint.h>

#define ADC_BUFFER_SIZE 256

void BSP_ADC_Init(void);
void BSP_ADC_Start(void);
uint32_t BSP_ADC_GetAverage(void);

#endif /* BSP_ADC_H */
```

`bsp_adc.c`：
```c
#include "bsp_adc.h"

static uint32_t adcBuffer[ADC_BUFFER_SIZE];
static volatile bool adcReady = false;

void BSP_ADC_Init(void) {
    // 已在 CubeMX 中初始化
}

void BSP_ADC_Start(void) {
    HAL_ADC_Start_DMA(&hadc1, adcBuffer, ADC_BUFFER_SIZE);
}

void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef* hadc) {
    if (hadc->Instance == ADC1) {
        adcReady = true;
    }
}

uint32_t BSP_ADC_GetAverage(void) {
    uint64_t sum = 0;
    __disable_irq();
    for (uint16_t i = 0; i < ADC_BUFFER_SIZE; i++) {
        sum += adcBuffer[i];
    }
    __enable_irq();
    return (uint32_t)(sum / ADC_BUFFER_SIZE);
}
```

### 步骤 3：在 main.c 中使用
```c
/* USER CODE BEGIN 0 */
#include "bsp_adc.h"
/* USER CODE END 0 */

/* USER CODE BEGIN 2 */
BSP_ADC_Init();
BSP_ADC_Start();
/* USER CODE END 2 */

/* USER CODE BEGIN WHILE */
  while (1)
  {
    uint32_t avg = BSP_ADC_GetAverage();
    // 使用平均值
    HAL_Delay(100);
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
```

---

## 常见错误示例

### ❌ 错误 1：在 ISR 中使用阻塞函数
```c
// 错误！不要这样做
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    HAL_UART_Transmit(&huart1, data, len, 1000);  // 阻塞！
}
```

### ✅ 正确 1：使用中断或 DMA
```c
// 正确
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    HAL_UART_Transmit_IT(&huart1, data, len);  // 非阻塞
}
```

### ❌ 错误 2：未保护的共享变量
```c
// 错误！竞争条件
volatile uint32_t counter = 0;

void EXTI0_IRQHandler(void) {
    counter++;  // 非原子操作！
}
```

### ✅ 正确 2：中断保护
```c
// 正确
volatile uint32_t counter = 0;

void EXTI0_IRQHandler(void) {
    __disable_irq();
    counter++;
    __enable_irq();
}
```

### ❌ 错误 3：在 USER CODE 区域外编写代码
```c
// 错误！CubeMX 会覆盖
void MX_USART1_UART_Init(void) {
  // CubeMX 生成的代码
  // 我在这里添加了我的初始化 ← 错误！
}
```

### ✅ 正确 3：在 USER CODE 区域内
```c
// 正确
/* USER CODE BEGIN 2 */
// 我的初始化代码
/* USER CODE END 2 */
```

---

## 技能使用提示

1. **始终在开始新功能前阅读 skill**
   - Skill 包含完整的最佳实践和常见陷阱

2. **使用提供的模板**
   - `bsp-template.c/h` 可快速创建新的 BSP 模块

3. **查阅快速参考**
   - `hal-quick-reference.md` 提供常用 HAL 函数

4. **遇到问题查阅故障排查指南**
   - `troubleshooting-guide.md` 包含常见问题诊断

5. **验证清单**
   - 在提交代码前，使用 skill 中的验证清单

---

## 与项目集成

将 skill 集成到你的工作流：

1. **自动触发**
   - 当提及 STM32、HAL、外设配置时，skill 自动加载

2. **手动调用**
   - 在 Claude Code 中：`使用 stm32-hal-development skill`

3. **项目配置**
   - skill 遵循项目的 `CLAUDE.md` 规则
   - 确保代码在 USER CODE 区域内
   - 使用分层架构（BSP → Driver → Application）

---

**记住：嵌入式开发需要纪律。遵循 skill 中的规则，避免常见陷阱。**
