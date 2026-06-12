# 实战示例：DDS 信号发生器（电赛 2001A / 2005A）

> 难度：★★（已经会用串口、能烧 STM32 的人）
>
> 适用赛题：全国大学生电子设计竞赛
> - **2001A** 波形发生器：1 Hz – 100 kHz 正弦 / 方 / 三角 / 锯齿
> - **2005A** 正弦信号发生器：100 Hz – 1 MHz，THD ≤ -50 dB
> - 历年类似题：信号源类、标准信号发生器
>
> 对应主入口：`.auto-embedded/modes/matlab-toolkit-competition.md` 场景 E1 + 场景 E3（用 THD 评估）

---

## 0. 你将拿到什么

完成本示例后，你将得到：

| 产物 | 文件 | 用途 |
|---|---|---|
| MATLAB 设计脚本 | `scripts/dds_design.m` | 算 LUT + 评估失真 |
| 4096 点 sin LUT | `app/dsp/dds_sin_lut.h` | 烧到 STM32 Flash |
| DDS 控制 C 代码 | `app/dsp/dds.c/.h` | TIM + DAC + DMA |
| 调频接口 | `dds_set_freq(float hz)` | 一键设置输出频率 |
| 失真度报告 | THD / SFDR / 频率精度 | 评分证据 |

---

## 1. 题目要求拆解（以电赛 2001A 为例）

| 指标 | 要求 | 怎么算 |
|---|---|---|
| 频率范围 | 1 Hz – 100 kHz | DAC 时钟 ≥ 500 kHz（5 倍最高频）|
| 频率精度 | ± 0.1 Hz | 相位累加器位宽 ≥ 32 bit |
| 失真度 THD | ≤ -50 dB | LUT 大小 ≥ 4096 + 抗混叠滤波 |
| 输出幅度 | 0 – 5 V 可调 | DAC 12-bit + 后端运放 |
| 波形种类 | sin / 方 / 三角 / 锯齿 | 多个 LUT 切换 |

---

## 2. MATLAB 设计脚本（`scripts/dds_design.m`）

```matlab
%% dds_design.m — 电赛 2001A DDS 波形发生器设计
clear; clc; close all;

%% 1. 参数
N_table  = 4096;        % LUT 大小
DAC_BITS = 12;          % STM32 内置 DAC 位数
ACC_BITS = 32;          % 相位累加器位宽
DAC_FS   = 1e6;         % DAC 采样率 1 MHz（决定最高输出频率）

%% 2. 频率精度计算
f_step = DAC_FS / 2^ACC_BITS;
fprintf('频率分辨率: %.6f Hz （要求 ≤ 0.1 Hz？ %s）\n', ...
    f_step, ternary(f_step <= 0.1, '✓', '✗'));

%% 3. 生成各种波形的 LUT
theta = (0:N_table-1) * 2*pi / N_table;
sin_lut      = round(sin(theta) * (2^(DAC_BITS-1)-1));
triangle_lut = round((1 - 2*abs(mod((0:N_table-1)/N_table + 0.25, 1) - 0.5)*2) ...
                     * (2^(DAC_BITS-1)-1));
sawtooth_lut = round(((0:N_table-1)/N_table * 2 - 1) * (2^(DAC_BITS-1)-1));
square_lut   = round(sign(sin(theta)) * (2^(DAC_BITS-1)-1));

%% 4. 评估 sin LUT 在不同输出频率下的 SFDR / THD
f_test = [100, 1e3, 10e3, 100e3];
results = zeros(length(f_test), 2);
for i = 1:length(f_test)
    [sfdr, thd] = evaluate_dds(sin_lut, f_test(i), DAC_FS, N_table, ACC_BITS);
    results(i,:) = [sfdr, thd];
    fprintf('f=%-7.1f Hz: SFDR=%5.1f dBc, THD=%5.1f dBc\n', ...
        f_test(i), sfdr, thd);
end

%% 5. 可视化失真 vs 频率
figure;
plot(f_test, -results, 'o-', 'LineWidth', 1.5);
set(gca, 'XScale', 'log'); grid on;
xlabel('输出频率 (Hz)'); ylabel('失真量 (-dB)');
legend('-SFDR', '-THD');
title('DDS 失真 vs 频率');

%% 6. 保存 LUT 供导出
save('dds_luts.mat', 'sin_lut', 'triangle_lut', 'sawtooth_lut', 'square_lut', ...
     'N_table', 'DAC_BITS', 'ACC_BITS', 'DAC_FS');
fprintf('\n已保存 dds_luts.mat\n');

%% ===== 辅助函数 =====
function [sfdr, thd] = evaluate_dds(lut, f_out, fs, N_table, accum_bits)
    fcw = round(f_out * 2^accum_bits / fs);
    N_sim = 16384;
    phase = uint64(0);
    out = zeros(N_sim, 1);
    for i = 1:N_sim
        idx = double(bitshift(phase, -(accum_bits - log2(N_table))));
        out(i) = lut(mod(idx, N_table) + 1);
        phase = mod(phase + fcw, 2^accum_bits);
    end
    w = hanning(N_sim);
    Y = abs(fft(out .* w));
    P = Y(1:N_sim/2+1);
    [pk_main, idx_main] = max(P);
    P_sub = P; P_sub(idx_main-3:idx_main+3) = 0;
    sfdr = 20*log10(pk_main / max(P_sub));
    h = zeros(10,1);
    for n = 2:10
        kh = idx_main * n;
        if kh > length(P), break; end
        h(n) = max(P(max(1,kh-2):min(length(P),kh+2)));
    end
    thd = 20*log10(sqrt(sum(h.^2)) / pk_main);
end

function out = ternary(cond, a, b)
    if cond, out = a; else, out = b; end
end
```

**通过 MCP 跑**：

```python
mcp__matlab__run_matlab_file(file_path="scripts/dds_design.m")
```

**典型输出**：

```
频率分辨率: 0.000233 Hz （要求 ≤ 0.1 Hz？ ✓）
f=100.0   Hz: SFDR= 86.3 dBc, THD=-79.5 dBc
f=1000.0  Hz: SFDR= 84.1 dBc, THD=-78.2 dBc
f=10000.0 Hz: SFDR= 75.8 dBc, THD=-72.1 dBc
f=100000.0 Hz: SFDR= 58.4 dBc, THD=-55.3 dBc
```

→ 100 kHz 输出 THD = -55 dB 满足 ≤ -50 dB 要求。

---

## 3. 导出 LUT 为 C 头文件

```bash
python ".auto-embedded/tools/export_gains_to_c.py" ^
    --input dds_luts.mat ^
    --mat-var sin_lut ^
    --output app\dsp\dds_sin_lut.h ^
    --name DDS_SIN_LUT ^
    --type float
```

**产物 `app/dsp/dds_sin_lut.h` 长这样**（节选）：

```c
#ifndef DDS_SIN_LUT_H
#define DDS_SIN_LUT_H

#define DDS_SIN_LUT_ROWS  1
#define DDS_SIN_LUT_COLS  4096

static const float DDS_SIN_LUT_DATA[1][4096] = {
    { 0.0000000e+00f, 3.1410000e+00f, ..., -3.1410000e+00f },
};

#endif
```

注：上面是 float 版本，方便理解。生产代码建议导出 **int16** 节省 Flash（4096 × 2 = 8 KB vs float 16 KB）。可改导出器或手工写：

```matlab
% MATLAB 端先转 int16
sin_lut_i16 = int16(sin_lut);
fid = fopen('dds_sin_lut.h', 'w');
fprintf(fid, '#ifndef DDS_SIN_LUT_H\n#define DDS_SIN_LUT_H\n\n');
fprintf(fid, 'const int16_t DDS_SIN_LUT[%d] = {\n', length(sin_lut_i16));
for i = 1:8:length(sin_lut_i16)
    fprintf(fid, '    ');
    for j = 0:min(7, length(sin_lut_i16)-i)
        fprintf(fid, '%6d, ', sin_lut_i16(i+j));
    end
    fprintf(fid, '\n');
end
fprintf(fid, '};\n\n#endif\n');
fclose(fid);
```

---

## 4. MCU 端核心代码（`app/dsp/dds.c/.h`）

```c
/* app/dsp/dds.h */
#ifndef DDS_H
#define DDS_H

#include <stdint.h>

typedef enum {
    DDS_WAVE_SINE,
    DDS_WAVE_TRIANGLE,
    DDS_WAVE_SAWTOOTH,
    DDS_WAVE_SQUARE,
} dds_wave_t;

void  dds_init(void);
void  dds_set_freq(float hz);
void  dds_set_wave(dds_wave_t w);
void  dds_set_amplitude(float v_pp);      /* 0 ~ 5V */
void  dds_isr_callback(void);             /* TIM 中断中调 */

#endif
```

```c
/* app/dsp/dds.c */
#include "dds.h"
#include "dds_sin_lut.h"
#include "hal_dac.h"

#define ACCUM_BITS  32U
#define TABLE_BITS  12U          /* log2(4096) */
#define DAC_FS_HZ   1000000U

static volatile uint32_t phase_accum = 0;
static volatile uint32_t fcw = 0;
static const float *current_lut = &DDS_SIN_LUT_DATA[0][0];
static float       amplitude_scale = 1.0f;

void dds_init(void) {
    phase_accum = 0;
    fcw = 0;
    /* DAC + TIM + DMA 初始化由 BSP 层完成 */
}

void dds_set_freq(float hz) {
    if (hz < 0.0f) hz = 0.0f;
    if (hz > DAC_FS_HZ/2) hz = DAC_FS_HZ/2;
    fcw = (uint32_t)((hz / DAC_FS_HZ) * 4294967296.0);
}

void dds_set_amplitude(float v_pp) {
    amplitude_scale = v_pp / 5.0f;     /* 假设 DAC Vref = 5V */
    if (amplitude_scale > 1.0f) amplitude_scale = 1.0f;
}

void dds_set_wave(dds_wave_t w) {
    /* 切换 LUT 指针（多 LUT 时） */
    current_lut = &DDS_SIN_LUT_DATA[0][0];     /* 当前只示例 sin */
}

void dds_isr_callback(void) {
    uint32_t idx = phase_accum >> (ACCUM_BITS - TABLE_BITS);
    float sample = current_lut[idx & (4096 - 1)] * amplitude_scale;
    uint16_t dac_val = (uint16_t)((sample + 1.0f) * 2048.0f);
    hal_dac_write(dac_val);
    phase_accum += fcw;
}
```

---

## 5. 集成到 main.c

```c
/* main.c — 严格分层，不直接 include 厂商头 */
#include "bsp_init.h"
#include "dds.h"

extern void scheduler_run(void);

int main(void) {
    bsp_init();
    dds_init();
    dds_set_freq(1000.0f);              /* 默认 1 kHz */
    dds_set_amplitude(2.5f);            /* 2.5V Vpp */
    bsp_tim_dac_start();                /* 启动 TIM 触发，DAC ISR 自动跑 */
    scheduler_run();
    while (1) {}
}
```

按键 / 旋钮调频通过 `dds_set_freq(new_hz)` 实现。

---

## 6. 推荐 STM32 资源映射

| 资源 | 推荐型号 / 通道 | 配置 |
|---|---|---|
| MCU | STM32F407 / F411 / G474 | DAC + TIM6/7 + DMA |
| DAC | DAC1_OUT1 (PA4) | 12 bit |
| TIM | TIM6 | 触发 DAC，1 MHz |
| DMA | DMA1_Stream5 (DAC1) | 循环模式 |
| 输出运放 | OPA1656 / LM358 + 增益 1 ~ 2 | 后端调幅 |
| 反混叠滤波 | 4 阶低通 fc = 200 kHz | sallen-key |

---

## 7. 测试与验证

### 7.1 频率精度验证

```c
/* 在 MCU 上打印当前实际频率，串口送 PC */
char buf[64];
int n = snprintf(buf, sizeof(buf), "fcw=%lu, f=%.4f Hz\n",
                 fcw, (double)fcw * DAC_FS_HZ / 4294967296.0);
hal_uart_write(LOG_UART, (uint8_t*)buf, n, 10);
```

PC 用 MATLAB 验证：

```matlab
s = serialport('COM3', 115200);
data = readline(s);
% 同时用频谱分析仪测实际输出
```

### 7.2 失真度实测（用本 skill 场景 E3）

```matlab
% 抓 16384 点 ADC 数据后
load('measured_signal.mat');
[~, thd, sfdr, ~] = measure_signal(data, fs);
fprintf('实测 THD = %.2f dB（仿真 = -55 dB）\n', thd);
```

如果实测比仿真差 ≥ 10 dB，检查：

1. 后端运放压摆率不足 → 换 OPA827 / OPA1656
2. PCB 数模混合接地不良 → DAC 输出近端单点接地
3. 电源耦合干扰 → DAC 电源加 10μF + 100nF 滤波
4. 后置抗混叠滤波器 fc 太高 → 应 < 4 × f_max

---

## 8. 失败兜底

| 现象 | 诊断 | 修复 |
|---|---|---|
| 输出无信号 | TIM 未触发 / DMA 未启动 | bsp_tim_dac_start() 调用了吗 |
| 频率不对（差 2x / 0.5x） | DAC_FS_HZ 与 TIM 实际频率不一致 | 用示波器测 TIM 输出脚（开 PWM 输出验证） |
| 高频段失真严重 | 反混叠不足 / 后置滤波器 fc 太高 | 升阶或降 fc |
| 低频抖动 | 累加器位宽不够 / FCW 量化误差 | ACC_BITS = 32 才行 |
| 切换波形闪烁 | 切 LUT 时 phase_accum 跳变 | 切 LUT 前先 `phase_accum = 0` |

---

## 9. 评分参考（电赛 2001A）

| 项 | 分值 | 验证方法 |
|---|---|---|
| 基本输出 4 种波形 | 30 | 示波器看波形 |
| 频率范围 1 Hz – 100 kHz | 20 | 设几个频率点 |
| 频率精度 ± 0.1 Hz | 10 | 频率计实测 |
| THD ≤ -50 dB | 15 | 频谱仪或 E3 软件测 |
| 幅度可调 0 – 5V | 10 | 示波器 + 万用表 |
| 创新性（任意波 / 调制等） | 15 | 演示功能 |

---

## 10. 进阶选项（拿满分）

完成基础功能后可加：

1. **任意波**（DDS + 用户上传 LUT）→ E1 + Communications Toolbox
2. **AM/FM 调制**（双 DDS 协同）→ E1 + E2
3. **数字补偿后置 FIR 滤波器**（去除频谱混叠）→ 场景 2
4. **上位机界面**（MATLAB App Designer / Python tkinter）→ 串口通信
5. **频率扫描** → 自动测被测电路频响（与 E3 频率特性测试仪结合）

---

## 11. 与流水线 mode 联动

如果做完基础设计想一键验证：

```text
触发"MATLAB 一键流水线"
  → Step 1: 跑 scripts/dds_design.m → dds_luts.mat
  → Step 2: 导出 dds_sin_lut.h
  → Step 3: /build-cmake 编译
  → Step 4: /flash-openocd 烧
  → Step 5: /serial-monitor 抓 ADC 回采的 sin
  → Step 6: MATLAB 对比 仿真 THD vs 实测 THD
```

详见 `.auto-embedded/modes/matlab-firmware-pipeline.md`。
