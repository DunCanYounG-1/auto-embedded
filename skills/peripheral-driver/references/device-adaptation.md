# 常见设备适配要点

> 每个设备包含：推荐库、适配难度、适配要点、常见陷阱

## 总览

| 设备 | 总线 | 类型 | 推荐方案 | 适配难度 |
|------|------|------|---------|---------|
| AT24C02 | I2C | EEPROM | 直接 HAL API | 低 |
| MPU6050 | I2C | 6轴IMU | leech001/MPU6050 | 低 |
| BMP280 | I2C/SPI | 气压/温度 | boschsensortec/BMP2-Sensor-API | 中 |
| SSD1306 | I2C | OLED | afiskon/stm32-ssd1306 | 低 |
| W25Q64 | SPI | NOR Flash | nimaltd/w25qxx | 低 |
| SHT30/SHT40 | I2C | 温湿度 | Sensirion/embedded-sht | 中 |
| DS18B20 | 1-Wire | 温度 | nimaltd/ds18b20 | 中 |
| MAX7219 | SPI | LED矩阵 | 直接实现 | 低 |
| HC-SR04 | GPIO+Timer | 超声波 | 直接实现 | 低 |
| ESP8266 | UART | WiFi AT | 需AT命令框架 | 高 |

---

## AT24C02 — I2C EEPROM

**推荐方案**：不需要开源库，直接使用 HAL API

**适配难度**：低

**适配要点**：
- 直接使用 `HAL_I2C_Mem_Read` / `HAL_I2C_Mem_Write` 即可完成读写
- 设备地址：0x50（7位），实际地址随 A0-A2 引脚接法变化
- 页写入限制：AT24C02 每页 8 字节，写入时必须处理页边界对齐
- 写周期：每次写操作后需等待 5ms

**常见陷阱**：
- 跨页写入未做边界处理，导致数据回绕覆盖
- 连续写入之间未等待写周期（5ms），导致写入失败
- A0-A2 地址引脚与代码中设备地址不匹配

**关键代码片段**：
```c
// 读取
HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, mem_addr, I2C_MEMADD_SIZE_8BIT, buf, len, 100);
// 写入（需注意页边界）
HAL_I2C_Mem_Write(&hi2c1, 0x50 << 1, mem_addr, I2C_MEMADD_SIZE_8BIT, buf, len, 100);
HAL_Delay(5); // 等待写周期完成
```

---

## MPU6050 — I2C 6轴惯性测量单元

**推荐方案**：GitHub leech001/MPU6050，轻量级 HAL 封装

**适配难度**：低
**适配要点**：
- 库仅包含两个文件（mpu6050.c/h），直接加入工程即可
- 初始化时通过读取 WHO_AM_I 寄存器（0x75）验证通信，返回值应为 0x68
- 两种数据获取模式：原始数据（Raw）直接读寄存器，DMP 模式需加载固件到芯片内部
- 推荐先用 Raw 模式验证通信，再按需引入 DMP

**常见陷阱**：
- AD0 引脚电平决定设备地址（低=0x68，高=0x69），需与代码一致
- WHO_AM_I 读取失败通常是 I2C 时钟或上拉电阻问题
- DMP 固件加载需要大量 Flash 空间（约 3KB），小容量 MCU 需注意
- 未配置中断引脚时轮询读取会影响实时性

---

## BMP280 — I2C/SPI 气压温度传感器

**推荐方案**：Bosch 官方 boschsensortec/BMP2-Sensor-API

**适配难度**：中（需实现平台抽象层）

**适配要点**：
- 官方库采用平台无关设计，需要用户实现 `read`、`write`、`delay_us` 三个回调函数
- I2C 模式下地址为 0x76（SDO 接地）或 0x77（SDO 接 VCC）
- 温度和气压原始数据需经过补偿算法转换，库内已包含完整实现
- 支持 Normal / Forced / Sleep 三种工作模式，低功耗场景推荐 Forced 模式

**常见陷阱**：
- 平台抽象层的 `read`/`write` 函数签名必须严格匹配库定义，参数顺序易搞错
- 补偿参数存储在芯片 NVM 中，初始化时必须读取，否则计算结果无意义
- SPI 模式下读操作需要在寄存器地址最高位置 1
- 采样率和滤波器配置影响精度与功耗，需根据应用场景调整

**平台抽象层适配示例**：
```c
int8_t bmp2_i2c_read(uint8_t reg_addr, uint8_t *data, uint32_t len, void *intf_ptr) {
    uint8_t dev_addr = *(uint8_t *)intf_ptr;
    HAL_I2C_Mem_Read(&hi2c1, dev_addr << 1, reg_addr, 1, data, len, 100);
    return 0;
}

int8_t bmp2_i2c_write(uint8_t reg_addr, const uint8_t *data, uint32_t len, void *intf_ptr) {
    uint8_t dev_addr = *(uint8_t *)intf_ptr;
    HAL_I2C_Mem_Write(&hi2c1, dev_addr << 1, reg_addr, 1, (uint8_t *)data, len, 100);
    return 0;
}
```

---

## SSD1306 — I2C OLED 显示屏

**推荐方案**：GitHub afiskon/stm32-ssd1306，专为 STM32 HAL 设计

**适配难度**：低
**适配要点**：
- 库包含字体渲染、基本图形绘制功能，直接加入工程
- I2C 地址通常为 0x3C（部分模块为 0x3D）
- 显示缓冲区占用 1KB RAM（128x64 分辨率，每像素 1 bit）
- 所有绘制操作先写入缓冲区，调用 `ssd1306_UpdateScreen()` 统一刷新
- 可选 DMA 传输提升刷新效率，但非必须

**常见陷阱**：
- 缓冲区 1KB 对于 RAM 紧张的 MCU（如 STM32F030 仅 4KB）需注意
- I2C 速率建议 400kHz，100kHz 下全屏刷新明显卡顿
- 部分廉价模块 I2C 地址与标称不符，建议先用 I2C 扫描确认
- 长时间显示固定内容可能导致 OLED 烧屏

---

## W25Q64 — SPI NOR Flash

**推荐方案**：GitHub nimaltd/w25qxx，支持 W25Q 全系列

**适配难度**：低

**适配要点**：
- 初始化时通过 JEDEC ID（0xEF4017 对应 W25Q64）验证芯片型号
- Flash 写入前必须先擦除，最小擦除单位为扇区（4KB）
- CS 片选引脚需手动管理，库内已封装但需正确配置 GPIO
- 支持标准 SPI、Dual SPI、Quad SPI，普通场景用标准 SPI 即可

**常见陷阱**：
- 未擦除直接写入，数据只能从 1 变 0，无法从 0 变 1
- 擦除和写入操作需要等待完成（轮询 BUSY 位），未等待会导致后续操作失败
- SPI 时钟极性和相位必须为 CPOL=0, CPHA=0（Mode 0）
- 大量数据写入时未做页对齐（256 字节/页），跨页写入数据会回绕

**关键代码片段**：
```c
// 初始化并检查 JEDEC ID
W25qxx_Init();
// 擦除扇区（4KB 对齐）
W25qxx_EraseSector(sector_num);
// 写入数据（自动处理页边界）
W25qxx_WriteSector(data, sector_num, offset, len);
// 读取数据
W25qxx_ReadSector(data, sector_num, offset, len);
```

---

## SHT30/SHT40 — I2C 温湿度传感器

**推荐方案**：Sensirion 官方 embedded-sht，平台无关设计

**适配难度**：中（需实现 HAL I2C 封装层）
**适配要点**：
- 官方库需要实现 `sensirion_i2c_hal_read` 和 `sensirion_i2c_hal_write` 回调
- SHT30 地址：0x44（ADDR 接地）或 0x45（ADDR 接 VCC）
- SHT40 地址固定为 0x44
- 每次测量数据附带 CRC-8 校验，库内已包含校验逻辑
- 单次测量模式下需等待测量完成（高精度约 15ms）

**常见陷阱**：
- CRC 校验失败通常是 I2C 信号质量问题，检查上拉电阻和走线长度
- SHT30 的周期测量模式需要先发送启动命令，否则读取返回 NACK
- 传感器自热效应：高频率连续测量会导致温度偏高 0.5-1 度
- SHT40 与 SHT30 命令集不完全兼容，切换型号需注意

**HAL 封装示例**：
```c
int8_t sensirion_i2c_hal_read(uint8_t addr, uint8_t *data, uint16_t count) {
    if (HAL_I2C_Master_Receive(&hi2c1, addr << 1, data, count, 100) != HAL_OK)
        return -1;
    return 0;
}

int8_t sensirion_i2c_hal_write(uint8_t addr, const uint8_t *data, uint16_t count) {
    if (HAL_I2C_Master_Transmit(&hi2c1, addr << 1, (uint8_t *)data, count, 100) != HAL_OK)
        return -1;
    return 0;
}
```

---

## DS18B20 — 1-Wire 温度传感器

**推荐方案**：GitHub nimaltd/ds18b20，基于 HAL Timer 实现微秒延时

**适配难度**：中（1-Wire 协议需要精确微秒级时序）

**适配要点**：
- 1-Wire 协议时序要求严格，需要微秒级延时，推荐使用硬件定时器实现
- 库依赖一个专用定时器产生精确延时，初始化时需指定定时器句柄
- 温度转换时间取决于精度：12 位精度需 750ms，9 位精度需 94ms
- 支持总线上挂载多个 DS18B20，通过 64 位 ROM 地址区分

**常见陷阱**：
- 使用 `HAL_Delay` 无法满足微秒级时序要求，必须用定时器
- 寄生供电模式下强上拉驱动不足，导致转换失败，建议使用外部供电模式
- 中断可能打断 1-Wire 时序，关键操作期间需临时关中断
- 长线缆（>5m）时信号衰减严重，需降低通信速率或加强上拉

---

## MAX7219 — SPI LED 矩阵/数码管驱动

**推荐方案**：无需开源库，直接 SPI 寄存器写入即可

**适配难度**：低
**适配要点**：
- 通信协议极简：每次传输 16 位（8 位地址 + 8 位数据）
- 关键寄存器：亮度（0x0A）、扫描范围（0x0B）、关断模式（0x0C）、测试模式（0x0F）
- 级联多片时，CS 保持低电平连续发送所有芯片数据后再拉高
- 初始化顺序：退出关断模式 -> 设置扫描范围 -> 设置亮度 -> 关闭测试模式

**常见陷阱**：
- 上电后芯片处于关断模式，必须写 0x0C 寄存器退出
- 测试模式（0x0F 写 0x01）会点亮所有 LED，调试时有用但别忘了关
- CS 信号时序：数据在 CS 上升沿锁存，CS 必须在 16 位传输完成后才能拉高
- 级联时数据顺序：先发送的数据会被推到链路末端的芯片

**关键代码片段**：
```c
static void MAX7219_Write(uint8_t reg, uint8_t data) {
    uint8_t buf[2] = {reg, data};
    HAL_GPIO_WritePin(CS_GPIO_Port, CS_Pin, GPIO_PIN_RESET);
    HAL_SPI_Transmit(&hspi1, buf, 2, 100);
    HAL_GPIO_WritePin(CS_GPIO_Port, CS_Pin, GPIO_PIN_SET);
}

void MAX7219_Init(void) {
    MAX7219_Write(0x0F, 0x00); // 关闭测试模式
    MAX7219_Write(0x0C, 0x01); // 退出关断模式
    MAX7219_Write(0x0B, 0x07); // 扫描全部 8 位
    MAX7219_Write(0x0A, 0x08); // 中等亮度
    MAX7219_Write(0x09, 0x00); // 无 BCD 解码（矩阵模式）
}
```

---

## HC-SR04 — 超声波测距模块

**推荐方案**：无需开源库，GPIO 触发 + Timer 输入捕获即可

**适配难度**：低

**适配要点**：
- 工作流程：Trig 引脚发送 10us 高电平脉冲 -> Echo 引脚返回高电平，宽度正比于距离
- 距离计算：距离(cm) = Echo 高电平时间(us) / 58
- 推荐使用定时器输入捕获测量 Echo 脉宽，比轮询 GPIO 更精确
- 测量范围：2cm - 400cm，测量周期建议 >60ms

**常见陷阱**：
- Trig 脉冲必须 >= 10us，太短不会触发测量
- Echo 引脚输出 5V 电平，STM32 为 3.3V，需要分压电阻保护
- 超出量程时 Echo 可能长时间保持高电平，需设置超时机制
- 温度影响声速，精确测量需补偿（声速 = 331.3 + 0.606 * 温度）

**关键代码片段**：
```c
// Trig 触发
HAL_GPIO_WritePin(TRIG_GPIO_Port, TRIG_Pin, GPIO_PIN_SET);
delay_us(10);
HAL_GPIO_WritePin(TRIG_GPIO_Port, TRIG_Pin, GPIO_PIN_RESET);

// 输入捕获回调中计算距离
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim) {
    if (htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1) {
        uint32_t pulse_us = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
        float distance_cm = (float)pulse_us / 58.0f;
    }
}
```

---

## ESP8266 — UART WiFi 模块（AT 指令）

**推荐方案**：需构建 AT 命令解析框架，建议参考开源 AT 命令引擎而非设备专用库

**适配难度**：高
**适配要点**：
- ESP8266 使用 AT 指令集通信，核心难点在于 UART 异步数据的可靠接收与解析
- 必须实现 UART 环形缓冲区（Ring Buffer），推荐使用 DMA + 空闲中断（IDLE）接收
- AT 命令为请求-响应模式，需实现：发送命令 -> 等待响应 -> 超时处理 的状态机
- 数据透传模式与命令模式切换需要特殊处理（`+++` 退出透传）
- 建议搜索通用 AT 命令框架（如 at_chat、rt-thread AT 组件）而非 ESP8266 专用库

**常见陷阱**：
- UART 接收不完整：AT 响应可能分多次到达，不能收到一次就解析
- 未处理 URC（主动上报信息），如 WiFi 断连、收到数据等异步事件
- ESP8266 默认波特率 115200，但部分固件版本为 9600 或 74880
- 模块功耗峰值可达 300mA，3.3V 供电必须充足，USB 转串口供电通常不够
- `AT+CIPSEND` 发送数据时，需等待 `>` 提示符后再发送数据内容
- 模块启动时会输出乱码（74880 波特率的 boot log），不要误判为通信故障

**AT 命令框架核心结构建议**：
```c
typedef struct {
    uint8_t rx_buf[1024];       // UART DMA 接收缓冲区
    uint8_t ring_buf[2048];     // 环形缓冲区
    uint16_t ring_head;
    uint16_t ring_tail;
    volatile uint8_t resp_ready; // 响应就绪标志
    uint32_t timeout_ms;        // 命令超时
} AT_HandleTypeDef;

// 发送 AT 命令并等待响应
AT_Status AT_SendCmd(AT_HandleTypeDef *hat, const char *cmd,
                     const char *expect, uint32_t timeout_ms);

// UART 空闲中断回调中将数据写入环形缓冲区
void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size);
```

---

## 适配通用建议

1. **先验证通信**：任何设备适配的第一步是确认总线通信正常（I2C 扫描、SPI 读 ID、UART 回环）
2. **从最小示例开始**：先跑通库自带的 example，再集成到项目中
3. **注意电平匹配**：3.3V 与 5V 设备混用时必须做电平转换
4. **预留调试手段**：关键操作加入日志输出，方便定位问题
5. **阅读数据手册**：开源库不能替代对芯片数据手册的理解，尤其是时序和电气参数
