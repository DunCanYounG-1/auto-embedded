# 数据手册查阅模式

> 触发词：`查手册` / `查数据手册` / `datasheet`
>
> 用途：遇到底层寄存器、时序参数、引脚复用等问题时，系统化地搜索→下载→阅读芯片/模块数据手册 PDF，提取精确参数写入代码。
>
> **核心原则**：宁可多花 30 秒查手册，也不凭记忆猜寄存器地址。

---

## 流程总览

```
┌─────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 1.定位   │ →  │ 2.获取   │ →  │ 3.阅读   │ →  │ 4.提取   │ →  │ 5.写入   │
│ 确定手册 │    │ 下载PDF  │    │ MCP解析  │    │ 关键参数 │    │ 代码注释 │
└─────────┘    └─────────┘    └──────────┘    └──────────┘    └──────────┘
```

---

## 阶段一：定位目标手册

### 1.1 识别需要查什么

根据当前问题类型，确定需要查阅的文档：

| 问题类型 | 需要的文档 | 关注章节 |
|---------|-----------|---------|
| 引脚复用/重映射 | 芯片 Datasheet | Pin Definition / Alternate Function Mapping |
| 寄存器配置 | 芯片 Reference Manual | 对应外设章节的 Register Map |
| 电气参数（电压/电流） | 芯片 Datasheet | Electrical Characteristics |
| 时序参数（建立/保持时间） | 芯片 Datasheet 或外设 IC 手册 | Timing Diagrams / AC Characteristics |
| 通信协议时序 | 外设模块 Datasheet | Interface Timing |
| 外设模块寄存器 | 外设模块 Datasheet | Register Description |
| 初始化序列 | 外设模块 Datasheet / Application Note | Power-On Sequence / Initialization |

### 1.2 构造搜索关键词

**模板**：`<芯片/模块型号> <文档类型> <filetype:pdf>`

示例：
```
STM32F103C8T6 Reference Manual filetype:pdf
SSD1306 OLED datasheet filetype:pdf
MPU6050 register map datasheet
ADS1115 timing diagram datasheet pdf
L298N motor driver datasheet
```

---

## 阶段二：获取 PDF 文档

按优先级尝试以下方式获取手册：

### 方式 A：`gh` CLI 搜索 GitHub（优先）

很多开源项目会附带数据手册 PDF，直接搜索：

```
使用 gh CLI：
gh search code "<芯片型号> datasheet extension:pdf"
gh api repos/<owner>/<repo>/contents/<path>  获取文件内容
```

### 方式 B：grok-search 网络搜索

```
调用 grok-search：
python ~/.claude/skills/grok-search/scripts/grok_search.py --query "<芯片型号> datasheet pdf download site:st.com OR site:ti.com OR site:nxp.com"
```

**可信数据手册来源**（按优先级）：
1. 芯片原厂官网：`st.com`、`ti.com`、`nxp.com`、`microchip.com`、`espressif.com`
2. 权威聚合站：`alldatasheet.com`、`datasheet4u.com`
3. GitHub 仓库附带的 `docs/` 或 `datasheets/` 目录

### 方式 C：`/playwright-skill` 直接下载

找到 PDF 链接后，用 playwright-skill 导航到下载页面：

```
调用 /playwright-skill：
1. 编写 Playwright 脚本导航到数据手册下载页
2. 截图确认页面内容
3. 找到 PDF 直链后用 Bash 下载：
   curl -L -o "<保存路径>.pdf" "<PDF直链>"
```

### PDF 本地保存规范

下载的 PDF 统一保存到项目目录下的 `docs/datasheets/`：

```
项目根目录/
├── docs/
│   └── datasheets/
│       ├── STM32F103C8T6_Reference_Manual.pdf
│       ├── SSD1306_Datasheet.pdf
│       └── MPU6050_Register_Map.pdf
```

命名规则：`<型号>_<文档类型>.pdf`，全英文无空格。

---

## 阶段三：MCP 解析 PDF

### 3.1 使用 /pdf skill 阅读

```
使用 /pdf skill 处理 PDF，或直接用 pypdf：
# uv run --with pypdf python -c "from pypdf import PdfReader; ..."
# 文件路径: "docs/datasheets/<文件名>.pdf"
```

**大文件处理策略**（>50 页的手册很常见）：

1. **先读目录页**（通常第 2-5 页），确定目标章节页码
2. **定向读取**目标章节页，不要一次性读完整个手册
3. 每次读取聚焦一个具体问题

### 3.2 常见查阅场景的精准翻页

| 查阅目标 | 典型所在章节 | 搜索关键词 |
|---------|------------|-----------|
| 引脚复用表 | Pin Definition / AF Mapping | "alternate function", "pin definition" |
| 寄存器地址偏移 | Register Map / Register Description | "offset", "register map", "0x" |
| 时钟树 | Clock Configuration | "clock tree", "RCC", "PLL" |
| 电气参数 | Electrical Characteristics | "absolute maximum", "operating conditions" |
| ADC 特性 | ADC Chapter | "conversion time", "sampling", "resolution" |
| 定时器通道映射 | Timer Chapter | "capture/compare", "channel", "remap" |
| I2C/SPI 时序 | Communication Interface | "timing diagram", "setup time", "hold time" |
| DMA 请求映射 | DMA Chapter | "DMA request mapping", "channel" |
| 中断向量表 | NVIC / Interrupt | "vector table", "IRQ", "position" |
| 功耗数据 | Power Consumption | "sleep mode", "standby", "current consumption" |

---

## 阶段四：提取关键参数

从 PDF 中提取到的参数必须结构化记录：

### 4.1 参数提取模板

```
=== 数据手册参数提取 ===
来源: <PDF文件名>, 第 <页码> 页, <表格/图编号>
芯片/模块: <型号>
提取日期: <日期>

[参数类别] <类别名>
├── <参数名>: <值> <单位>  (条件: <测试条件>)
├── <参数名>: <值> <单位>  (条件: <测试条件>)
└── <参数名>: <值> <单位>  (条件: <测试条件>)
```

### 4.2 提取示例

```
=== 数据手册参数提取 ===
来源: STM32F103C8T6_Datasheet.pdf, 第 47 页, Table 26
芯片: STM32F103C8T6
提取日期: 2026-03-10

[ADC 特性]
├── 分辨率: 12 bit
├── 转换时间: 1μs  (条件: ADCCLK=14MHz, 采样周期=1.5)
├── 输入电压范围: 0 ~ 3.6V  (条件: VREF+ = VDDA)
└── 采样率: 最高 1MHz  (条件: 连续转换模式)

[对应代码约束]
├── ADCCLK 不得超过 14MHz → RCC_ADCCLKConfig 分频系数计算
└── 采样周期最小 1.5 cycle → ADC_SampleTime_1Cycles5
```

---

## 阶段五：写入代码

提取的参数**必须以注释形式**写入对应源文件，标注来源：

### 5.1 代码注释规范

```c
/**
 * @brief ADC1 初始化 - 12位精度，DMA 传输
 * @ref   STM32F103C8T6_RM.pdf, Chapter 11, Table 68
 *        ADCCLK ≤ 14MHz (当前: 72MHz / 6 = 12MHz ✓)
 *        采样周期 = 239.5 cycles → 采样时间 = 239.5/12MHz ≈ 20μs
 */
void ADC1_Init(void)
{
    // 时钟分频: APB2(72MHz) / 6 = 12MHz ≤ 14MHz上限
    // @ref RM0008 Section 11.12.2, ADCPRE bits
    RCC_ADCCLKConfig(RCC_PCLK2_Div6);

    // 采样时间: 239.5 cycles, 适合高阻抗信号源
    // @ref RM0008 Table 68, SMPx[2:0] = 111
    ADC_RegularChannelConfig(ADC1, ADC_Channel_0, 1, ADC_SampleTime_239Cycles5);
}
```

### 5.2 关键规则

- **每个"魔数"必须标注来源**：寄存器地址、分频系数、阈值、超时值
- **注释格式**：`@ref <文件名> <章节/表格编号>`
- **计算过程写在注释里**：如时钟分频链 `72MHz / 6 = 12MHz`
- **标注约束条件**：如 `≤ 14MHz上限`，方便后续改时钟时知道边界

---

## 快速查询模式（简化流程）

当问题简单明确（如"PA9 的复用功能是什么"），无需完整走五阶段，直接：

```
1. grok-search 搜索 → 找到答案
2. 若搜索结果不确定 → 下载 PDF 验证
3. 提取参数 → 写入代码注释
```

**触发完整流程的条件**（必须走五阶段）：
- 涉及时序参数（建立时间、保持时间、最大频率）
- 涉及电气参数（最大电流、电压范围）
- 涉及寄存器位域配置（多个位需要联合配置）
- 不同文档信息矛盾时（以原厂 Datasheet 为准）

---

## 核心规则

| # | 规则 | 说明 |
|---|------|------|
| 1 | **原厂优先** | 时序/电气参数只信任原厂 Datasheet，不信博客/论坛的二手数据 |
| 2 | **页码溯源** | 每个提取的参数必须标注 PDF 文件名和页码 |
| 3 | **条件完整** | 参数值必须附带测试条件（温度、电压、频率） |
| 4 | **注释同步** | 代码中的魔数必须有 `@ref` 注释指向数据手册 |
| 5 | **本地存档** | 下载的 PDF 保存到 `docs/datasheets/`，方便离线复查 |
| 6 | **交叉验证** | 关键参数（如最大频率）至少用两种方式确认（PDF + 官网/Context7） |
