# 外设驱动开发指南

> **基于实战经验总结的通用外设驱动开发最佳实践**
>
> 适用于：I2C、SPI、UART 等接口的外部传感器、执行器、模块驱动开发

---

## 📋 目录

1. [开发前的准备工作](#1-开发前的准备工作)
2. [规格书阅读要点](#2-规格书阅读要点)
3. [驱动架构设计](#3-驱动架构设计)
4. [实现最佳实践](#4-实现最佳实践)
5. [调试技巧](#5-调试技巧)
6. [常见陷阱与解决方案](#6-常见陷阱与解决方案)
7. [验证清单](#7-验证清单)

---

## 1. 开发前的准备工作

### 1.1 收集必要资料

✅ **必须准备的资料**：
- [ ] 芯片/模块规格书（Datasheet）
- [ ] 应用笔记（Application Notes）
- [ ] 参考设计（Schematics, Eval Board）
- [ ] 已有的驱动代码（其他平台，作为参考）

⚠️ **常见错误**：
- 只看中文翻译版，英文原版可能有更详细信息
- 直接复制类似传感器的驱动代码（协议可能完全不同！）

### 1.2 硬件准备

✅ **确认硬件连接**：
- [ ] 引脚映射（VCC、GND、SCL/SDA 或 MOSI/MISO/SCK）
- [ ] 上拉电阻（I2C 通常需要 4.7kΩ）
- [ ] 电源电压（3.3V vs 5V）
- [ ] 信号电平是否匹配

⚠️ **检查清单**：
```
万用表测量：
□ VCC 和 GND 之间是否有短路
□ 上拉电阻是否存在
□ 电源电压是否正常
```

### 1.3 软件环境准备

✅ **配置 STM32CubeMX**：
- [ ] 启用相应外设（I2C/SPI/UART）
- [ ] 配置引脚映射
- [ ] 设置合理的时钟频率
- [ ] 生成代码

✅ **准备调试工具**：
- [ ] 串口调试工具（serial skill）
- [ ] 逻辑分析仪（如果可用）
- [ ] I2C/SPI 扫描工具

---

## 2. 规格书阅读要点

### 2.1 必须确认的关键信息

| 信息类别 | 具体内容 | 为什么重要 |
|---------|---------|-----------|
| **通信接口** | I2C/SPI/UART，地址/速率 | 决定使用哪个 HAL 外设 |
| **命令格式** | 命令长度、字节顺序、参数 | 发送错误的命令会导致无响应 |
| **数据格式** | 字节顺序、数据位宽、CRC | 数据解析错误会得到错误结果 |
| **转换公式** | 原始数据到物理量的公式 | 不同的传感器有不同的转换方式 |
| **时序要求** | 测量时间、命令间隔、延时 | 不遵守时序会导致通信失败 |
| **电气特性** | 工作电压、电流、时序 | 确保硬件兼容性 |

### 2.2 规格书阅读清单

```
□ 1. 通信协议章节
   □ I2C 地址（7 位 vs 8 位）
   □ 时钟频率范围
   □ 是否支持 Clock Stretching

□ 2. 命令集章节
   □ 命令代码（十六进制）
   □ 命令长度（1/2/3 字节）
   □ 命令参数（是否需要）
   □ 字节顺序（MSB first vs LSB first）

□ 3. 数据格式章节
   □ 数据位宽（8/16/20/24 位）
   □ 字节顺序（大端 vs 小端）
   □ 是否有 CRC 校验
   □ CRC 算法参数

□ 4. 转换公式章节
   □ 温度/湿度/压力等转换公式
   □ 分辨率
   □ 测量范围

□ 5. 时序章节
   □ 上电稳定时间
   □ 测量时间
   □ 命令间隔时间
   □ 复位时间

□ 6. 电气特性章节
   □ 工作电压范围
   □ 工作电流
   □ 引脚定义
```

### 2.3 规格书陷阱 ⚠️

| 陷阱 | 示例 | 正确理解 |
|------|------|---------|
| "发送 A，然后发送 B" | "发送 2 字节温度数据，然后发送 2 字节湿度数据" | 可能是**连续**的 4 字节数据流，不是两次独立的读取 |
| "地址 0x44" | I2C 地址 | 需要确认是 7 位地址（传输时左移 1 位）还是 8 位地址 |
| "高重复率" | 测量模式 | 需要查看对应的命令代码和测量时间 |
| "出厂已校准" | 不需要校准命令 | 但可能需要读取状态确认校准状态 |

---

## 3. 驱动架构设计

### 3.1 分层架构

```
┌─────────────────────────────────────┐
│   Application Layer (main.c)         │
│   用户代码，调用驱动 API              │
└─────────────────┬───────────────────┘
                  │ calls
┌─────────────────▼───────────────────┐
│   BSP Driver Layer (bsp_xxx.c)       │
│   硬件抽象层，封装硬件细节           │
└─────────────────┬───────────────────┘
                  │ uses
┌─────────────────▼───────────────────┐
│   HAL Library (stm32f1xx_hal_xxx.c)  │
│   STM32 官方 HAL 库                  │
└─────────────────┬───────────────────┘
                  │ accesses
┌─────────────────▼───────────────────┐
│   Hardware Registers                │
│   外设寄存器                         │
└─────────────────────────────────────┘
```

### 3.2 BSP 驱动文件结构

```
Hardware/bsp_xxx/
├── bsp_xxx.h              # 头文件（API 接口、数据结构、宏定义）
├── bsp_xxx.c              # 实现文件（驱动代码）
├── references/overview.md # 使用文档
└── REFERENCE.pdf          # 参考规格书（可选）
```

### 3.3 命名规范

```c
// 文件命名
bsp_<module>.c/h          // 例: bsp_gxht3l.c/h

// 函数命名
BSP_<Module>_<Action>()   // 例: BSP_GXHT3L_Init()

// 类型命名
<Module>_Data_t           // 例: GXHT3L_Data_t
<Module>_Status_t         // 例: GXHT3L_Status_t

// 宏命名
<MODULE>_<COMMAND>        // 例: GXHT3L_CMD_READ
<MODULE>_<PARAMETER>      // 例: GXHT3L_I2C_ADDR
```

### 3.4 头文件模板

```c
/**
 ******************************************************************************
 * @file    bsp_xxx.h
 * @brief   <模块名称> BSP 驱动头文件
 * @date    2026-04-12
 ******************************************************************************
 */

#ifndef BSP_XXX_H
#define BSP_XXX_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include <stdint.h>

/* Exported types ------------------------------------------------------------*/

/**
 * @brief <数据结构描述>
 */
typedef struct {
    float value;         /* 数据值 */
    uint8_t valid;       /* 有效标志 */
} XXX_Data_t;

/* Exported constants --------------------------------------------------------*/

#define XXX_I2C_ADDR     0x44    /* I2C 地址 */
#define XXX_TIMEOUT      1000    /* 超时时间 (ms) */

/* Exported functions prototypes ---------------------------------------------*/

int8_t BSP_XXX_Init(void);
int8_t BSP_XXX_ReadData(XXX_Data_t *data);

#ifdef __cplusplus
}
#endif

#endif /* BSP_XXX_H */
```

---

## 4. 实现最佳实践

### 4.1 初始化函数

✅ **推荐做法**：
```c
int8_t BSP_XXX_Init(void)
{
    // 1. 等待上电稳定
    HAL_Delay(XXX_POWER_ON_DELAY_MS);

    // 2. 简单检测设备是否响应
    if (HAL_I2C_IsDeviceReady(&hi2c2, XXX_I2C_ADDR << 1, 3, 100) != HAL_OK) {
        return XXX_ERROR_I2C;
    }

    // 3. 发送必要的初始化命令（如果需要）

    return XXX_OK;
}
```

❌ **避免**：
- 初始化函数中做太多事情
- 不检查返回值
- 硬编码延时时长而不说明原因

### 4.2 数据读取函数

✅ **推荐做法**：
```c
int8_t BSP_XXX_ReadData(XXX_Data_t *data)
{
    HAL_StatusTypeDef status;

    // 1. 参数检查
    if (data == NULL) {
        return XXX_ERROR;
    }

    // 2. 发送测量命令
    uint8_t cmd[2] = {0x2C, 0x06};
    status = HAL_I2C_Master_Transmit(&hi2c2, addr, cmd, 2, timeout);
    if (status != HAL_OK) {
        data->valid = 0;
        return XXX_ERROR_I2C;
    }

    // 3. 等待测量完成
    HAL_Delay(XXX_MEAS_TIME_MS);

    // 4. 读取数据（一次性读取所有字节）
    uint8_t buf[6];
    status = HAL_I2C_Master_Receive(&hi2c2, addr, buf, 6, timeout);
    if (status != HAL_OK) {
        data->valid = 0;
        return XXX_ERROR_I2C;
    }

    // 5. 校验 CRC（如果有）
    if (XXX_CalcCRC(&buf[0], 2) != buf[2]) {
        data->valid = 0;
        return XXX_ERROR_INVALID_DATA;
    }

    // 6. 解析数据
    uint16_t raw = (buf[0] << 8) | buf[1];
    data->value = XXX_CONVERT(raw);

    // 7. 限制范围
    if (data->value > XXX_MAX) data->value = XXX_MAX;
    if (data->value < XXX_MIN) data->value = XXX_MIN;

    data->valid = 1;
    return XXX_OK;
}
```

❌ **常见错误**：

| 错误 | 示例 | 后果 |
|------|------|------|
| **分多次读取数据** | 先读 3 字节温度，再读 3 字节湿度 | I2C 通信错误，数据不同步 |
| **不检查返回值** | `HAL_I2C_Master_Transmit(...)` 忽略返回值 | 无法检测通信错误 |
| **不校验 CRC** | 直接使用读取的数据 | 可能读到错误数据 |
| **硬编码延时** | `HAL_Delay(100)` 没有说明 | 不知为何延时，维护困难 |

### 4.3 错误处理

✅ **定义清晰的错误码**：
```c
#define XXX_OK                  0
#define XXX_ERROR               -1
#define XXX_ERROR_I2C           -2
#define XXX_ERROR_TIMEOUT       -3
#define XXX_ERROR_INVALID_DATA  -4
#define XXX_ERROR_NOT_READY     -5
```

✅ **总是返回状态**：
```c
int8_t BSP_XXX_DoSomething(void)
{
    HAL_StatusTypeDef status = HAL_I2C_...;
    if (status != HAL_OK) {
        return XXX_ERROR_I2C;
    }
    return XXX_OK;
}
```

### 4.4 数据校验

✅ **必须实现 CRC 校验**：
```c
// 规格：CRC-8，多项式 0x31，初始值 0xFF
uint8_t XXX_CalcCRC(const uint8_t *data, uint8_t len)
{
    uint8_t crc = 0xFF;
    for (uint8_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0x31;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}
```

---

## 5. 调试技巧

### 5.1 分步验证策略

```
Step 1: 硬件检查
   └─> I2C 扫描，确认设备存在

Step 2: 通信测试
   └─> 发送简单命令，检查返回值

Step 3: 数据读取
   └─> 读取原始数据，打印十六进制

Step 4: 数据解析
   └─> 验证转换公式是否正确

Step 5: 功能验证
   └─> 实际测量，对比预期结果
```

### 5.2 I2C 扫描工具

```c
void I2C_Scan(void)
{
    printf("Scanning I2C bus...\r\n");
    for (uint8_t addr = 0; addr < 128; addr++) {
        if (HAL_I2C_IsDeviceReady(&hi2c2, addr << 1, 1, 100) == HAL_OK) {
            printf("Found device at 0x%02X\r\n", addr);
        }
    }
}
```

### 5.3 原始数据打印

```c
// 打印原始字节数据
printf("RAW: %02X %02X %02X %02X %02X %02X\r\n",
       buf[0], buf[1], buf[2], buf[3], buf[4], buf[5]);
```

### 5.4 使用 Serial Skill

```bash
# 列出可用串口
python scripts/serial.py --list

# 自动检测并读取
python scripts/serial.py --auto

# 带时间戳和详细分析
python scripts/serial.py --port COM45 --timestamp -v
```

### 5.5 Printf 浮点数问题

⚠️ **嵌入式 printf 可能不支持 %f**

**解决方案**：转为整数输出
```c
// 错误：可能显示为空
printf("Temp: %.2f C", temperature);

// 正确：转为整数显示
int16_t temp_int = (int16_t)(temperature * 100);
printf("Temp: %d.%02d C", temp_int / 100, abs(temp_int % 100));
```

---

## 6. 常见陷阱与解决方案

### 6.1 数据格式陷阱

#### 陷阱 1：分多次读取连续数据

❌ **错误实现**：
```c
// 规格书说：发送 2 字节温度，然后发送 2 字节湿度
// 误以为需要两次读取
HAL_I2C_Master_Receive(&hi2c2, addr, temp_buf, 3, timeout);
HAL_I2C_Master_Receive(&hi2c2, addr, humi_buf, 3, timeout);
```

✅ **正确实现**：
```c
// 理解：温度和湿度数据是连续发送的 6 字节
uint8_t buf[6];
HAL_I2C_Master_Receive(&hi2c2, addr, buf, 6, timeout);
```

**如何判断**：
- 规格书中"发送 A，然后发送 B"通常是连续的数据流
- 看数据格式图（Timing Diagram）是否显示连续传输

#### 陷阱 2：字节顺序错误

```c
// 错误：假设小端
uint16_t value = buf[0] | (buf[1] << 8);

// 正确：按规格书，通常是 MSB first
uint16_t value = (buf[0] << 8) | buf[1];
```

### 6.2 时序陷阱

#### 陷阱 1：不遵守测量时间

❌ **错误**：
```c
HAL_I2C_Master_Transmit(&hi2c2, addr, cmd, 2, timeout);
// 立即读取，测量还没完成
HAL_I2C_Master_Receive(&hi2c2, addr, buf, 6, timeout);
```

✅ **正确**：
```c
HAL_I2C_Master_Transmit(&hi2c2, addr, cmd, 2, timeout);
HAL_Delay(16);  // 等待测量完成（参考规格书）
HAL_I2C_Master_Receive(&hi2c2, addr, buf, 6, timeout);
```

#### 陷阱 2：命令间隔太短

```c
// 错误：快速连续发送命令
for (int i = 0; i < 10; i++) {
    HAL_I2C_Master_Transmit(...);
    HAL_Delay(1);  // 间隔太短
}

// 正确：遵守规格书的命令间隔
for (int i = 0; i < 10; i++) {
    HAL_I2C_Master_Transmit(...);
    HAL_Delay(10);  // 至少 1ms（参考规格书）
}
```

### 6.3 I2C 地址陷阱

⚠️ **7 位地址 vs 8 位地址**

```c
// 规格书说 I2C 地址是 0x44
// 这通常是 7 位地址

// HAL 函数需要 8 位地址（左移 1 位）
HAL_I2C_Master_Transmit(&hi2c2, 0x44 << 1, ...);  // 正确
HAL_I2C_Master_Transmit(&hi2c2, 0x44, ...);      // 错误！

// 或使用宏
#define I2C_ADDR_7BIT(x)  ((x) << 1)
HAL_I2C_Master_Transmit(&hi2c2, I2C_ADDR_7BIT(0x44), ...);
```

### 6.4 相似传感器陷阱

🔴 **致命错误**：假设同类传感器协议兼容

**真实案例**：
| 传感器 | 测量命令 | 数据格式 | 温度公式 |
|--------|----------|----------|----------|
| AHT10 | `0xAC 0x33 0x00` (3B) | `[状态][湿][湿][温][温][CRC]` | `raw * 200 / 2^20 - 50` |
| GXHT3L | `0x2C 0x06` (2B) | `[温][温][温CRC][湿][湿][湿CRC]` | `-46.85 + raw * 175.72 / 65535` |

**结论**：
> ❌ AHT10 驱动**完全不适用于** GXHT3L！
>
> ✅ 必须按规格书重新实现！

---

## 7. 验证清单

### 7.1 代码质量检查

- [ ] 所有代码在 USER CODE 区域
- [ ] 符合命名规范
- [ ] 注释完整（特别是复杂算法）
- [ ] 错误处理完善
- [ ] 无魔法数字（使用宏定义）
- [ ] 无硬编码延时（添加注释说明）
- [ ] 函数职责单一
- [ ] 无重复代码

### 7.2 功能验证

- [ ] I2C 扫描能检测到设备
- [ ] 初始化函数返回成功
- [ ] 读取数据返回成功
- [ ] CRC 校验通过
- [ ] 数据值在合理范围内
- [ ] 数据稳定性良好（波动小）
- [ ] 多次读取结果一致

### 7.3 性能验证

- [ ] 测量时间符合规格书
- [ ] 内存使用合理
- [ ] 无内存泄漏
- [ ] CPU 占用率可接受

### 7.4 文档完整性

- [ ] 头文件注释完整
- [ ] README 文档详细
- [ ] 包含使用示例
- [ ] 包含硬件连接图
- [ ] 包含常见问题解答

---

## 8. 经验总结

### 8.1 核心原则

| 原则 | 说明 |
|------|------|
| **规格书优先** | 不要假设、不要猜测，严格按规格书实现 |
| **逐步验证** | 从简单到复杂，先通信后数据再功能 |
| **善用工具** | I2C 扫描、Serial skill、逻辑分析仪 |
| **注意细节** | 字节顺序、数据格式、时序要求 |
| **错误处理** | 所有 HAL 调用都要检查返回值 |
| **数据校验** | 实现 CRC 校验，确保数据可靠性 |

### 8.2 调试策略

```
1. I2C 扫描 → 设备存在
   ↓
2. 发送命令 → 设备响应
   ↓
3. 读取数据 → 原始数据正确
   ↓
4. 解析数据 → 转换公式正确
   ↓
5. 验证结果 → 数据合理稳定
```

### 8.3 一句话总结

> **外设驱动开发的核心是：严格按规格书实现，逐步验证，注意细节，完善错误处理。**

---

## 附录：参考资源

- [STM32 HAL 用户手册](https://www.st.com/resource/en/user_manual/um1850-description-of-stm32f1xx-hal-drivers-stmicroelectronics.pdf)
- [I2C 协议规范](https://www.nxp.com/docs/en/user-guide/UM10204.pdf)
- [CRC 计算原理](https://en.wikipedia.org/wiki/Cyclic_redundancy_check)

---

**文档版本**: v1.0
**最后更新**: 2026-04-12
**作者**: STM32 AI 项目团队
