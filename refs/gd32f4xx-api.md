# GD32F4xx 固件库 (Standard Peripheral Library) API 速查手册

> 来源：`GD32F4xx_Firmware_Library_V3.3.3`（兆易创新 / GigaDevice 官方）
> 适用芯片：GD32F4xx（GD32F405/407/427/429/450/470 等）
> 板载参考：MICU / CMIC GD32F470VET6 (Cortex-M4，主频 200 MHz)
> 资源仓库：变量 `$GD_ROOT`，按第 0 节四级链解析（环境变量 → 工程登记 → skill 内置 → 远程 <https://gitee.com/Ahypnis/mcu_-gd_-main-board>）
> 离线缓存，RESEARCH/EXECUTE 阶段优先查本文件，无需联网。

---

## 0. 资源定位（必须先读）

### 0.1 仓库位置解析（四级链，不假定特定用户/平台）

GD32 主板 SDK 仓库由变量 **`GD_ROOT`** 表示，按以下优先级解析，找到第一个存在的路径即停止：

| 优先级 | 来源 | 检测方式 | 适用场景 |
|---|---|---|---|
| ① | 环境变量 `GD32_SDK_ROOT` | `[ -n "$GD32_SDK_ROOT" ] && [ -d "$GD32_SDK_ROOT" ]` | 用户显式指定，最高优先 |
| ② | 用户项目 `硬件资源表.md` 中 `GD32_SDK_ROOT:` 字段 | RESEARCH 阶段读取此键 | 多项目复用同一份 SDK |
| ③ | skill 内置缓存 | `[ -d "$HOME/.claude/skills/embedded-dev/mcu_-gd_-main-board-master" ]` | 用户已把 SDK 放进 skill 目录（典型场景） |
| ④ | 远程仓库 | <https://gitee.com/Ahypnis/mcu_-gd_-main-board> | 前三级都未命中，需要 `git clone` |

> 路径解析必须在 **RESEARCH 阶段最早** 完成；解析结果写入用户工程的 `硬件资源表.md`，**禁止**在 PLAN / EXECUTE 阶段反复探测。

### 0.2 跨平台 skill 安装根目录约定

Claude Code 在三个平台下的 skill 安装根目录都是 `$HOME/.claude/skills/embedded-dev/`：

| 平台 | `$HOME` 展开示例 | 完整 skill 根 |
|---|---|---|
| Linux | `/home/<user>` | `/home/<user>/.claude/skills/embedded-dev/` |
| macOS | `/Users/<user>` | `/Users/<user>/.claude/skills/embedded-dev/` |
| Windows (Git Bash / WSL) | `/c/Users/<user>` 或 `~` | `~/.claude/skills/embedded-dev/` |
| Windows (PowerShell) | `$env:USERPROFILE` | `%USERPROFILE%\.claude\skills\embedded-dev\` |

**禁止**在 skill 文档中硬编码任何特定用户名（如 `C:\Users\A\…`），所有路径必须以 `$HOME` / `~` / `${SKILL_ROOT}` 形式表达。

### 0.3 解析脚本（POSIX，Git Bash / bash / zsh 通用）

```bash
detect_gd_root() {
  # ① 环境变量
  if [ -n "${GD32_SDK_ROOT:-}" ] && [ -d "$GD32_SDK_ROOT" ]; then
    printf '%s\n' "$GD32_SDK_ROOT"; return 0
  fi
  # ③ skill 内置缓存（② 由 Claude 在 RESEARCH 阶段读硬件资源表完成）
  local skill_local="$HOME/.claude/skills/embedded-dev/mcu_-gd_-main-board-master"
  if [ -d "$skill_local" ]; then
    printf '%s\n' "$skill_local"; return 0
  fi
  return 1
}

if GD_ROOT=$(detect_gd_root); then
  echo "[GD] 命中本地：$GD_ROOT"
else
  echo "[GD] 未命中本地。远程仓库：https://gitee.com/Ahypnis/mcu_-gd_-main-board"
  echo "[GD] 需要 Claude 向用户索要目标目录后执行 git clone，并把路径写入硬件资源表"
fi
```

> 解析失败时 **禁止 shell 交互式 `read`**（在 Claude 调用的非交互 shell 中不工作）。改由 Claude 在对话中向用户询问 clone 目标目录，然后再执行 `git clone https://gitee.com/Ahypnis/mcu_-gd_-main-board <目标目录>`。

### 0.4 关键资源（相对 `$GD_ROOT`）

> 路径分隔符统一用正斜杠 `/`，Windows 下 Git Bash / WSL / Keil 均可识别；如需在 PowerShell / cmd 内使用，自行替换为 `\`。

| 资源 | 路径（`$GD_ROOT/` 之下） | 用途 |
|---|---|---|
| 用户手册 | `doc/GD32F4xx_Firmware_Library_User_Guide_Rev1.2.pdf` | 完整外设 API/寄存器说明（英文） |
| 用户手册 中文 | `doc/GD32F4xx_固件库使用指南_Rev1.2.pdf` | 中文版速查 |
| 数据手册 | `doc/GD32F470xxDatasheet_Rev2.1.pdf` | 引脚复用、电气特性 |
| DMA 通道表 | `doc/DMA_CHANNEL_MAP.md` | DMA0/DMA1 全通道 × 全 SUB 映射 |
| 原理图 V1/V2 | `datasheet/GD32F470 Development Kit V*.pdf` | 板级网表来源 |
| 标准外设库源码 | `pack/GD32F4xx_Firmware_Library_V3.3.3.7z` | 解压后含 CMSIS + 外设驱动 |
| Keil Pack | `pack/GigaDevice.GD32F4xx_DFP.3.0.3.pack`、`ARM.CMSIS.5.9.0.pack` | 工程依赖（不带 `with_dependence` 后缀的模板需要安装） |
| App 模板 | `template_project/v2/GD32F470_App_Standalone/.../MDK/Project.uvprojx` | 裸机入口工程 |
| Bootloader+OTA 模板 | `template_project/v2/GD32F470_App_Bootloader/` | BootLoader + UART OTA |
| OTA 上位机脚本 | `template_project/v2/GD32F470_App_Bootloader/Tools/ota_uart_sender.py` | PC 端 OTA 发送（Python + pyserial） |

---

## 1. 与 STM32 StdPeriph 的核心差异（一图速记）

| 维度 | STM32 StdPeriph | GD32F4xx 标准库 |
|---|---|---|
| 时钟单元 | RCC | **RCU** |
| GPIO 模式枚举 | `GPIO_Mode_*`、`GPIO_Speed_*` | `GPIO_MODE_*`、`GPIO_OSPEED_*` |
| GPIO 设置位 | `GPIOx->BSRR / BRR` | `GPIO_BOP(GPIOx) / GPIO_BC(GPIOx) / GPIO_TG(GPIOx)` |
| 中断单元 | NVIC + `misc.h` | **NVIC + `misc.h`**（保留命名） |
| DMA 命名 | `DMA1_Stream0` | `DMA0` + `DMA_CH0` + `DMA_SUBPERI0~7`（请求子映射） |
| USART | USART1 (APB2) / USART2 (APB1) | **USART0/USART5 → APB2，USART1/2 + UART3~7 → APB1** |
| 中断向量命名 | `USART1_IRQHandler` | `USART0_IRQHandler`（编号从 0 开始） |
| 头文件入口 | `stm32f4xx.h` | `gd32f4xx.h` |
| 时钟最大 | 168/180 MHz | **200 MHz** (GD32F470) |

> 编号差 1：GD 的 USART0 ≈ STM32 的 USART1；GPIO/TIM/SPI/I2C 都遵循相同的"减 1"对应关系。

---

## 2. 头文件清单（GD32F4xx_Firmware_Library Include 目录）

```
gd32f4xx.h            // 顶层入口
gd32f4xx_adc.h        gd32f4xx_can.h        gd32f4xx_crc.h        gd32f4xx_ctc.h
gd32f4xx_dac.h        gd32f4xx_dbg.h        gd32f4xx_dci.h        gd32f4xx_dma.h
gd32f4xx_enet.h       gd32f4xx_exmc.h       gd32f4xx_exti.h       gd32f4xx_fmc.h
gd32f4xx_fwdgt.h      gd32f4xx_gpio.h       gd32f4xx_i2c.h        gd32f4xx_ipa.h
gd32f4xx_iref.h       gd32f4xx_misc.h       gd32f4xx_pmu.h        gd32f4xx_rcu.h
gd32f4xx_rtc.h        gd32f4xx_sdio.h       gd32f4xx_spi.h        gd32f4xx_syscfg.h
gd32f4xx_timer.h      gd32f4xx_tli.h        gd32f4xx_trng.h       gd32f4xx_usart.h
gd32f4xx_wwdgt.h
```

> 标准头文件命名遵循 `gd32f4xx_<外设小写>.h`，与 STM32 StdPeriph 风格一致。

---

## 3. RCU 时钟控制（对应 STM32 RCC）

### 常用 API

```c
void rcu_periph_clock_enable(rcu_periph_enum periph);
void rcu_periph_clock_disable(rcu_periph_enum periph);
void rcu_periph_reset_enable(rcu_periph_reset_enum periph_reset);
void rcu_periph_reset_disable(rcu_periph_reset_enum periph_reset);
void rcu_clock_freq_get(rcu_clock_freq_enum clock);
void rcu_system_clock_source_config(uint32_t ck_sys);
ErrStatus rcu_osci_stab_wait(rcu_osci_type_enum osci);
```

### 常用外设时钟枚举

| 外设 | 枚举常量 | 总线 |
|---|---|---|
| GPIOA~GPIOI | `RCU_GPIOA` … `RCU_GPIOI` | AHB1 |
| DMA0/DMA1 | `RCU_DMA0` / `RCU_DMA1` | AHB1 |
| CRC | `RCU_CRC` | AHB1 |
| USART0 | `RCU_USART0` | APB2 |
| USART5 | `RCU_USART5` | APB2 |
| USART1/2、UART3~7 | `RCU_USART1` … `RCU_UART7` | APB1 |
| SPI0、SPI3、SPI4、SPI5 | `RCU_SPI0/SPI3/SPI4/SPI5` | APB2 |
| SPI1、SPI2 | `RCU_SPI1/SPI2` | APB1 |
| I2C0~I2C2 | `RCU_I2C0/I2C1/I2C2` | APB1 |
| TIMER0、TIMER7、TIMER8~TIMER10 | `RCU_TIMER0/7/8/9/10` | APB2 |
| TIMER1~TIMER6、TIMER11~TIMER13 | `RCU_TIMERx` | APB1 |
| ADC0/ADC1/ADC2 | `RCU_ADC0/ADC1/ADC2` | APB2 |
| SYSCFG | `RCU_SYSCFG` | APB2 |
| PMU | `RCU_PMU` | APB1 |

> **总线频率（GD32F470 标准配置）**：CK_SYS = 200 MHz, AHB = 200 MHz, APB2 = 100 MHz, APB1 = 50 MHz；TIMER 定时器输入时钟 = APB ×2（若 APB 分频 ≠ 1）。

---

## 4. GPIO 配置

### 标准初始化模板

```c
/* 1. 使能 GPIO 时钟 */
rcu_periph_clock_enable(RCU_GPIOA);

/* 2. 输出模式（推挽 / 开漏） */
gpio_mode_set(GPIOA, GPIO_MODE_OUTPUT, GPIO_PUPD_NONE, GPIO_PIN_5);
gpio_output_options_set(GPIOA, GPIO_OTYPE_PP, GPIO_OSPEED_50MHZ, GPIO_PIN_5);

/* 3. 输入模式（含上拉/下拉） */
gpio_mode_set(GPIOA, GPIO_MODE_INPUT, GPIO_PUPD_PULLUP, GPIO_PIN_0);

/* 4. 复用模式（外设引脚） */
rcu_periph_clock_enable(RCU_USART0);
gpio_mode_set(GPIOA, GPIO_MODE_AF, GPIO_PUPD_PULLUP, GPIO_PIN_9 | GPIO_PIN_10);
gpio_output_options_set(GPIOA, GPIO_OTYPE_PP, GPIO_OSPEED_50MHZ, GPIO_PIN_9 | GPIO_PIN_10);
gpio_af_set(GPIOA, GPIO_AF_7, GPIO_PIN_9 | GPIO_PIN_10);  /* USART0 复用 = AF7 */
```

### 高速位操作（板载 BSP 模板用法）

```c
GPIO_BOP(GPIOA) = GPIO_PIN_5;   /* 置 1（Bit Operation） */
GPIO_BC(GPIOA)  = GPIO_PIN_5;   /* 清 0（Bit Clear） */
GPIO_TG(GPIOA)  = GPIO_PIN_5;   /* 翻转 */
gpio_input_bit_get(GPIOA, GPIO_PIN_0);   /* 读取 */
gpio_bit_set/reset/write(...)            /* 普通 API */
```

### 板载 V2 复用功能映射（来自 `mcu_cmic_gd32f470vet6.h`）

| 外设 | AF 编号 | 典型引脚 |
|---|---|---|
| I2C0（OLED） | `GPIO_AF_4` | PB8 (CLK)、PB9 (DAT) |
| SPI0 (Flash) / SPI3 (GD30AD3344) | `GPIO_AF_5` | SPI0: PB3/PB4/PB5；SPI3: PE12/13/14 |
| USART0/1/2 | `GPIO_AF_7` | USART0: PA9/PA10；USART1: PD5/PD6；USART2: PD8/PD9 |
| USART5 | `GPIO_AF_8` | PC6/PC7 |
| ETH (RMII) | `GPIO_AF_11` | 见下文 ETH 段 |
| SDIO | `GPIO_AF_12` | PC8~PC12 + PD2 |

---

## 5. USART 配置

### 标准初始化模板（DMA 接收）

```c
/* 1. 时钟 */
rcu_periph_clock_enable(RCU_GPIOA);
rcu_periph_clock_enable(RCU_USART0);

/* 2. GPIO 复用 (PA9=TX, PA10=RX, AF7) */
gpio_af_set(GPIOA, GPIO_AF_7, GPIO_PIN_9 | GPIO_PIN_10);
gpio_mode_set(GPIOA, GPIO_MODE_AF, GPIO_PUPD_PULLUP, GPIO_PIN_9 | GPIO_PIN_10);
gpio_output_options_set(GPIOA, GPIO_OTYPE_PP, GPIO_OSPEED_50MHZ, GPIO_PIN_9 | GPIO_PIN_10);

/* 3. USART 参数 */
usart_deinit(USART0);
usart_baudrate_set(USART0, 115200U);
usart_word_length_set(USART0, USART_WL_8BIT);
usart_stop_bit_set(USART0, USART_STB_1BIT);
usart_parity_config(USART0, USART_PM_NONE);
usart_hardware_flow_rts_config(USART0, USART_RTS_DISABLE);
usart_hardware_flow_cts_config(USART0, USART_CTS_DISABLE);
usart_receive_config(USART0, USART_RECEIVE_ENABLE);
usart_transmit_config(USART0, USART_TRANSMIT_ENABLE);
usart_enable(USART0);

/* 4. 中断（接收非空） */
nvic_irq_enable(USART0_IRQn, 1, 0);
usart_interrupt_enable(USART0, USART_INT_RBNE);
```

### 重定向 printf（典型实现）

```c
int fputc(int ch, FILE *f) {
    usart_data_transmit(USART0, (uint8_t)ch);
    while (RESET == usart_flag_get(USART0, USART_FLAG_TBE));
    return ch;
}
```

---

## 6. DMA 配置（GD32F4xx 双 DMA 控制器 × 8 通道 × 8 SUB）

### 核心概念

GD32F4xx 的 DMA 模型与 STM32F4 类似：**DMA0/DMA1 各 8 个通道（CH0~CH7），每个通道通过 `PERIEN[2:0]` 选择 SUB0~SUB7 来挂接不同外设请求**。完整映射查 `doc\DMA_CHANNEL_MAP.md`。

### 高频映射（来自板载 BSP）

| 外设 | DMA 控制器 | 通道 | SUB |
|---|---|---|---|
| USART0_RX | DMA1 | CH5 | SUB4 |
| USART0_TX | DMA1 | CH7 | SUB4 |
| USART1_RX | DMA0 | CH5 | SUB4 |
| USART2_RX（OTA） | DMA0 | CH1 | SUB4 |
| USART2_TX | DMA0 | CH3 | SUB4 |
| USART5_RX | DMA1 | CH1 | SUB5 |
| SPI0_RX/TX | DMA1 | CH0 / CH3 | SUB3 |
| ADC0 | DMA1 | CH0 或 CH4 | SUB0 |

### 单缓冲传输初始化模板

```c
dma_single_data_parameter_struct dma_init;

rcu_periph_clock_enable(RCU_DMA0);
dma_deinit(DMA0, DMA_CH1);

dma_single_data_para_struct_init(&dma_init);
dma_init.periph_addr         = USART2_RDATA_ADDRESS;
dma_init.memory0_addr        = (uint32_t)rx_buffer;
dma_init.direction           = DMA_PERIPH_TO_MEMORY;
dma_init.number              = RX_BUFFER_SIZE;
dma_init.periph_inc          = DMA_PERIPH_INCREASE_DISABLE;
dma_init.memory_inc          = DMA_MEMORY_INCREASE_ENABLE;
dma_init.periph_memory_width = DMA_PERIPH_WIDTH_8BIT;
dma_init.priority            = DMA_PRIORITY_HIGH;
dma_init.circular_mode       = DMA_CIRCULAR_MODE_DISABLE;
dma_single_data_mode_init(DMA0, DMA_CH1, &dma_init);

dma_channel_subperipheral_select(DMA0, DMA_CH1, DMA_SUBPERI4);   /* 选 USART2_RX */
usart_dma_receive_config(USART2, USART_RECEIVE_DMA_ENABLE);
dma_channel_enable(DMA0, DMA_CH1);
```

> **关键陷阱**：忘记 `dma_channel_subperipheral_select` 时 DMA 不工作 — GD32 必须显式选 SUB。

---

## 7. SPI / I2C / TIMER / ADC（要点速记）

### SPI 初始化关键参数
```c
spi_parameter_struct spi_init_struct;
spi_struct_para_init(&spi_init_struct);
spi_init_struct.device_mode          = SPI_MASTER;
spi_init_struct.trans_mode           = SPI_TRANSMODE_FULLDUPLEX;
spi_init_struct.frame_size           = SPI_FRAMESIZE_8BIT;
spi_init_struct.endian               = SPI_ENDIAN_MSB;
spi_init_struct.clock_polarity_phase = SPI_CK_PL_LOW_PH_1EDGE;
spi_init_struct.nss                  = SPI_NSS_SOFT;
spi_init_struct.prescale             = SPI_PSC_8;
spi_init(SPI0, &spi_init_struct);
spi_enable(SPI0);
```

### I2C（OLED 示例参数）
```c
i2c_clock_config(I2C0, 400000, I2C_DTCY_2);            /* 400 kHz Fast Mode */
i2c_mode_addr_config(I2C0, I2C_I2CMODE_ENABLE,
                     I2C_ADDFORMAT_7BITS, I2C0_OWN_ADDRESS7);
i2c_enable(I2C0);
i2c_ack_config(I2C0, I2C_ACK_ENABLE);
```

### TIMER PWM
```c
timer_oc_parameter_struct ocp;
timer_oc_struct_para_init(&ocp);
ocp.outputstate = TIMER_CCX_ENABLE;
ocp.ocpolarity  = TIMER_OC_POLARITY_HIGH;
timer_channel_output_config(TIMER0, TIMER_CH_0, &ocp);
timer_channel_output_mode_config(TIMER0, TIMER_CH_0, TIMER_OC_MODE_PWM0);
timer_channel_output_pulse_value_config(TIMER0, TIMER_CH_0, pulse);
timer_primary_output_config(TIMER0, ENABLE);    /* 高级定时器必加 */
timer_enable(TIMER0);
```

### ADC 单次 / 连续
```c
adc_mode_config(ADC_MODE_FREE);
adc_special_function_config(ADC0, ADC_SCAN_MODE, DISABLE);
adc_data_alignment_config(ADC0, ADC_DATAALIGN_RIGHT);
adc_channel_length_config(ADC0, ADC_REGULAR_CHANNEL, 1);
adc_regular_channel_config(ADC0, 0, ADC_CHANNEL_10, ADC_SAMPLETIME_239POINT5);
adc_external_trigger_source_config(ADC0, ADC_REGULAR_CHANNEL, ADC_EXTTRIG_REGULAR_NONE);
adc_external_trigger_config(ADC0, ADC_REGULAR_CHANNEL, EXTERNAL_TRIGGER_DISABLE);
adc_enable(ADC0);
delay_1ms(1);
adc_calibration_enable(ADC0);
adc_software_trigger_enable(ADC0, ADC_REGULAR_CHANNEL);
while (!adc_flag_get(ADC0, ADC_FLAG_EOC));
val = adc_regular_data_read(ADC0);
```

---

## 8. 中断系统（NVIC + misc）

```c
nvic_priority_group_set(NVIC_PRIGROUP_PRE4_SUB0);     /* 4 位抢占，0 位响应 */
nvic_irq_enable(USART0_IRQn, 1, 0);                   /* 优先级、子优先级 */
nvic_irq_disable(USART0_IRQn);
```

### 中断向量命名（GD32F470 部分）

| 中断 | 向量符号 |
|---|---|
| USART0~USART2 | `USART0_IRQHandler` … `USART2_IRQHandler` |
| UART3~UART7 | `UART3_IRQHandler` … `UART7_IRQHandler` |
| USART5 | `USART5_IRQHandler` |
| DMA0/1 CHx | `DMA0_Channel0_IRQHandler` … `DMA1_Channel7_IRQHandler` |
| EXTI0~4 | `EXTI0_IRQHandler` … `EXTI4_IRQHandler` |
| EXTI5~9 | `EXTI5_9_IRQHandler` |
| EXTI10~15 | `EXTI10_15_IRQHandler` |
| TIMER0_UP | `TIMER0_UP_TIMER9_IRQHandler` |
| SysTick | `SysTick_Handler` |

---

## 9. 板载 BSP 速查（GD32F470VET6 V2）

> 详见 `template_project\v2\GD32F470_App_Standalone\GD_Firmware_Template_ac6_cmsis_6_with_dependence\Components\bsp\mcu_cmic_gd32f470vet6.h`

| 资源 | 引脚 | 备注 |
|---|---|---|
| LED1~6 | PD10~PD15 | V2 高电平点亮（`LED_ACTIVE_HIGH = 1`） |
| KEY1~5 | PE15、PE6、PE11、PE4、PE7 | 用户按键 |
| KEY6 | PB0 | |
| KEY_WAKEUP | PA0 | 唤醒/复位按键 |
| OLED (I2C0) | SCL=PB8, SDA=PB9, AF4 | 0.91" SSD1306 |
| SPI Flash (SPI0, GD25Qxx) | SCK=PB3, MISO=PB4, MOSI=PB5, CS=PA15, AF5 | |
| GD30AD3344 (SPI3) | SCK=PE12, MISO=PE13, MOSI=PE14, CS=PE10, AF5 | |
| SDIO (SD 卡) | CMD=PD2, CLK=PC12, D0~D3=PC8~PC11, CD=PE2, AF12 | FatFs |
| ETH (RMII) | MDC=PC1, MDIO=PA2, REF_CLK=PA1, CRS_DV=PA7, RXD0/1=PC4/PC5, TX_EN=PB11, TXD0/1=PB12/PB13, AF11 | PHY_RST=PD3 |
| ADC0_IN10 | PC0 | 板载分压采样 |
| ADC0_IN12 | PC2 | Vref 监测 |
| DAC0_OUT | PA4 | |
| DAC1_OUT | PA5 | |
| USART0 (Debug) | TX=PA9, RX=PA10, 115200 | printf 重定向 |
| USART1 | TX=PD5, RX=PD6 | |
| USART2 (OTA) | TX=PD8, RX=PD9, 921600 | DMA0 CH1 SUB4 |
| USART5 | TX=PC6, RX=PC7 | |

---

## 10. Bootloader / UART OTA 分区（V2）

> 详见 `template_project\v2\GD32F470_App_Bootloader\README.md` 和 `Project\GD_BootLoader_F470_ac6_cmsis_6\Common\bl_partition.h`

| 区域 | 地址范围 | 大小 | 用途 |
|---|---|---|---|
| BootLoader | `0x0800_0000` ~ `0x0800_BFFF` | 48 KB | BL 本体 |
| 参数页 | `0x0800_C000` ~ `0x0800_CFFF` | 4 KB | 主参数、副本、BL 日志 |
| **APP1**（运行区） | `0x0800_D000` ~ `0x0804_4FFF` | 224 KB | 当前 App |
| APP2（OTA 暂存） | `0x0804_5000` ~ `0x0807_CFFF` | 224 KB | OTA 下载缓存 |
| DATA | `0x0807_D000` ~ `0x0807_FFFF` | 12 KB | 用户数据 |

App 入口必须设置 `SCB->VTOR = 0x0800D000UL;`；scatter 文件 `LR_IROM1 0x0800D000 0x00038000`。

OTA 上位机示例：
```powershell
python Tools\ota_uart_sender.py --port COM4 --baud 921600 \
    --bin <App.bin 路径> --header-version v2 --target-addr 0x0800D000 \
    --monitor-seconds 5
```

---

## 11. 查询优先级规则（与 SKILL.md 主协议对齐）

1. 用户问 GD32 外设 API → **先查本文件**
2. 本文件覆盖不到 → 打开 `doc\GD32F4xx_固件库使用指南_Rev1.2.pdf`（Document Skills / `/pdf`）
3. 涉及寄存器位定义 → `doc\GD32F470xxDatasheet_Rev2.1.pdf`
4. 涉及板级引脚 → `Components\bsp\mcu_cmic_gd32f470vet6.h` 或 `datasheet\*.pdf` 原理图
5. 涉及 DMA 通道分配 → `doc\DMA_CHANNEL_MAP.md`
6. 仍然没有 → Context7 MCP（搜 `GigaDevice GD32F4xx`）→ grok-search

**禁止**：未查上述资料直接套 STM32 命名（如 `RCC_AHB1PeriphClockCmd` 在 GD32 中不存在，应该是 `rcu_periph_clock_enable`）。

---

## 12. 常见踩坑

| 现象 | 根因 | 修复 |
|---|---|---|
| DMA 启动但不传输 | 没调 `dma_channel_subperipheral_select` | 显式选 SUB 编号 |
| `nvic_irq_enable` 不生效 | 未先 `nvic_priority_group_set` | 启动早期设一次优先级分组 |
| USART 收发只有一边工作 | 仅开 `usart_receive_config` 没开 `usart_transmit_config`（或反之） | 两者都开 |
| ADC 读数恒为 0 | 没做 `adc_calibration_enable` | 上电后强制校准 |
| 高级定时器（TIMER0/7）无 PWM 输出 | 未开 `timer_primary_output_config(..., ENABLE)` | 高级 TIMER 必加 MOE 使能 |
| GPIO 设了 `GPIO_MODE_AF` 但外设无响应 | 漏调 `gpio_af_set` | AF 模式必须配 AF 编号 |
| Flash 写失败 | 没解锁 `fmc_unlock()` / 未清状态位 | 解锁 → 擦除 → 校验 → 写 → 锁定 |
| OTA 后无法跳转 | App 工程未改 `SCB->VTOR` 或 scatter 起始地址 | 同步改 `0x0800D000` 与 `LR_IROM1` |
