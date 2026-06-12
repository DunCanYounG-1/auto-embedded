# 实战示例：AM 信号调制度测量（电赛 2022F）

> 难度：★★（基本会做 ADC 采样 + 基本 FFT 即可）
>
> 适用赛题：
> - **2022F** 信号调制度测量装置：测量 AM 信号载频 + 调制度 + 解调音频
> - **2019F** 短距离无线传输（含 OOK / ASK 测量）
> - 类似题：任何 AM / DSB 解调 + 参数测量
>
> 对应主入口：`.auto-embedded/modes/matlab-toolkit-competition.md` 场景 E2

---

## 0. AM 调制度 (Modulation Index) 速通

```
AM 信号:  s(t) = A · [1 + m·cos(2π·fm·t)] · cos(2π·fc·t)
                    ↑                      ↑
                包络含调制信号           载波

m = 调制度 = (Vmax_包络 - Vmin_包络) / (Vmax_包络 + Vmin_包络)
```

| 调制度 m | 物理含义 |
|---|---|
| 0% | 纯载波，无调制 |
| 50% | 典型 AM 广播 |
| 100% | 临界调制 |
| > 100% | 过调制（包络出现"凹陷"，无法用包络检波解调） |

赛题要求：**精度 ± 1%**（即 m=50% 时测出 49%-51% 算合格）。

---

## 1. 你将拿到什么

| 产物 | 文件 | 用途 |
|---|---|---|
| MATLAB 测量脚本 | `scripts/am_measure.m` | 离线分析采样信号 |
| 包络检波器 .h | `app/dsp/envelope_detector.h` | MCU 实时检波 |
| 调制度计算 C 代码 | `app/measure/am_meter.c/.h` | 测 m 值 |
| 调制度精度报告 | THD 与 m 的 trade-off | 评分证据 |

---

## 2. 题目典型要求（电赛 2022F）

| 指标 | 要求 |
|---|---|
| 载波频率范围 | 200 kHz – 1 MHz |
| 调制信号范围 | 300 Hz – 3 kHz（音频）|
| 调制度测量范围 | 5% – 100% |
| 调制度精度 | ± 1% |
| 显示更新 | ≤ 1 秒 |
| 同时解调音频输出 | 是 |

---

## 3. MATLAB 测量脚本（`scripts/am_measure.m`）

```matlab
%% am_measure.m — AM 信号调制度精确测量
clear; clc;

%% 1. 模拟生成 AM 信号（或从 ADC 文件读）
fs = 4e6;                          % 采样率 4 MHz（载波 5 倍以上）
T  = 0.01;                          % 10 ms 数据
t  = (0:1/fs:T-1/fs).';

fc = 500e3;                         % 载波 500 kHz
fm = 1000;                          % 调制信号 1 kHz
m_true = 0.6;                       % 真实调制度 60%

carrier = cos(2*pi*fc*t);
modulator = cos(2*pi*fm*t);
am_signal = (1 + m_true*modulator) .* carrier;
% 加噪声模拟实测
am_signal = am_signal + 0.005 * randn(size(am_signal));

%% 2. 方法 1：直接包络检波（Hilbert 法，MATLAB 推荐）
% Hilbert 变换得到解析信号，取模 = 瞬时包络
analytic = hilbert(am_signal);
envelope = abs(analytic);

% 调制度 = (max - min) / (max + min)
e_max = max(envelope);
e_min = min(envelope);
m_measured = (e_max - e_min) / (e_max + e_min);
fprintf('真实 m = %.4f，测得 m = %.4f，误差 %.2f%%\n', ...
    m_true, m_measured, abs(m_measured - m_true)/m_true*100);

%% 3. 方法 2：FFT 频域法（更精确，抗噪）
% AM 频谱：fc 处主峰 + fc±fm 处边带
% m = 2 · A_边带 / A_载波
N = length(am_signal);
w = hanning(N);
X = abs(fft(am_signal .* w));
P = X(1:N/2+1);
f = (0:N/2) * fs / N;

% 找载波峰
[~, k_c] = min(abs(f - fc));
[carrier_pk, k_c_real] = max(P(max(1,k_c-50):min(length(P),k_c+50)));
k_c_real = k_c_real + max(1,k_c-50) - 1;
fc_meas = f(k_c_real);

% 找上边带峰（fc + fm 附近）
[~, k_usb] = min(abs(f - (fc + fm)));
[usb_pk, ~] = max(P(max(1,k_usb-20):min(length(P),k_usb+20)));

% 找下边带峰
[~, k_lsb] = min(abs(f - (fc - fm)));
[lsb_pk, ~] = max(P(max(1,k_lsb-20):min(length(P),k_lsb+20)));

% 加窗影响相同，比值不变
m_fft = (usb_pk + lsb_pk) / carrier_pk;
fprintf('FFT 法 m = %.4f（理论 = %.4f）\n', m_fft, m_true);

%% 4. 可视化
figure;
subplot(3,1,1);
plot(t(1:1000), am_signal(1:1000));
hold on; plot(t(1:1000), envelope(1:1000), 'r-', 'LineWidth', 1.5);
title('AM 信号 + Hilbert 包络'); xlabel('t (s)');

subplot(3,1,2);
semilogy(f, P); xlim([fc-5*fm, fc+5*fm]);
title('频谱（载波 + 两边带）'); xlabel('Hz');

subplot(3,1,3);
plot(envelope(1:5000));
yline(e_max, 'r--'); yline(e_min, 'r--');
title(sprintf('包络（m = %.2f%%）', m_measured*100));

%% 5. 解调音频（额外功能）
% 去 DC + 低通到 3 kHz 即得音频
[b, a] = butter(4, 5000/(fs/2), 'low');
audio = filter(b, a, envelope - mean(envelope));
% audiowrite('demod.wav', audio/max(abs(audio)), fs);

%% 6. 保存配置供 MCU 用
save('am_meter_config.mat', 'fc', 'fm', 'fs');
fprintf('\n已保存 am_meter_config.mat\n');
```

**典型输出**：

```
真实 m = 0.6000，测得 m = 0.6021，误差 0.35%
FFT 法 m = 0.5998（理论 = 0.6000）
```

→ 两种方法都满足 ± 1% 精度。

---

## 4. 选型：MCU 还是 FPGA？

| 方案 | 适用场景 | 复杂度 |
|---|---|---|
| **STM32 + 软件 Hilbert** | fc ≤ 200 kHz、调试快 | 中 |
| **STM32 + 半波检波 + LPF** | fc 任意（包络法简单）| 低 |
| **FPGA + IQ 下变频** | fc 任意 + 高带宽 | 高 |
| **STM32H7 + 高速 ADC + CMSIS-DSP FFT** | 中等带宽 + FFT 法 | 中 |

本示例走 STM32 + 半波检波路线（电赛性价比最高）。

---

## 5. MCU 端核心代码（包络检波 + 调制度计算）

### 5.1 ADC 配置

```c
/* bsp/adc.c — STM32F4 高速 ADC */
/* 配置：ADC 三重交替模式 fs=2 MHz，DMA 自动填环形缓冲 */
#define ADC_BUF_SIZE  8192
static volatile uint16_t adc_buf[ADC_BUF_SIZE];
static volatile uint8_t  adc_ready = 0;

void adc_dma_complete_cb(void) {
    adc_ready = 1;
}
```

### 5.2 包络检波（最简单：半波 + 低通）

```c
/* app/dsp/envelope.c */
#include "arm_math.h"

#define BLOCK_SIZE 256

static float env_lpf_state[4];
static arm_biquad_casd_df1_inst_f32 env_lpf;
/* 4 阶 Butterworth 低通，fc = 5 kHz @ fs = 2 MHz，预先 MATLAB 设计 */
static float env_lpf_coeffs[5] = {
    /* MATLAB tf2sos 算出来填这里 */
    0.0001f, 0.0002f, 0.0001f, 1.9844f, -0.9846f
};

void envelope_init(void) {
    arm_biquad_cascade_df1_init_f32(&env_lpf, 1, env_lpf_coeffs, env_lpf_state);
}

/* 输入：ADC 原始数据；输出：包络 */
void envelope_process(const uint16_t *adc_in, float *env_out, uint32_t n) {
    float buf[BLOCK_SIZE];
    for (uint32_t i = 0; i < n; i++) {
        /* 1. ADC int16 → float 居中（去 DC 偏置 2048）*/
        float v = (float)((int16_t)adc_in[i] - 2048);
        /* 2. 半波检波（取绝对值）*/
        buf[i] = fabsf(v);
    }
    /* 3. 低通滤波去载波 */
    arm_biquad_cascade_df1_f32(&env_lpf, buf, env_out, n);
}
```

### 5.3 调制度测量

```c
/* app/measure/am_meter.c */
#include "envelope.h"
#include <float.h>

#define MEAS_WINDOW 16384      /* 8 ms @ fs=2MHz，覆盖 8 个 1 kHz 调制周期 */

static float env_window[MEAS_WINDOW];

float am_measure_modulation(void)
{
    /* 1. 抓一窗 ADC + 检波 */
    envelope_process((uint16_t*)adc_buf, env_window, MEAS_WINDOW);

    /* 2. 找 max/min */
    float e_max = -FLT_MAX, e_min = FLT_MAX;
    for (uint32_t i = 0; i < MEAS_WINDOW; i++) {
        if (env_window[i] > e_max) e_max = env_window[i];
        if (env_window[i] < e_min) e_min = env_window[i];
    }

    /* 3. m = (max-min) / (max+min) */
    if (e_max + e_min < 1.0f) return 0.0f;     /* 信号过小 */
    return (e_max - e_min) / (e_max + e_min);
}
```

### 5.4 载频测量（同步进行）

```c
/* 在调制度测量同时跑 FFT 测载频 */
#include "arm_math.h"
#define FFT_LEN 4096

static float fft_buf[FFT_LEN * 2];

float am_measure_carrier(void)
{
    /* 1. ADC → 复数（虚部 0）*/
    for (int i = 0; i < FFT_LEN; i++) {
        fft_buf[2*i] = (float)((int16_t)adc_buf[i] - 2048);
        fft_buf[2*i+1] = 0;
    }
    arm_cfft_f32(&arm_cfft_sR_f32_len4096, fft_buf, 0, 1);

    /* 2. 取模平方 + 找最大值 */
    float mag_sq[FFT_LEN/2];
    arm_cmplx_mag_squared_f32(fft_buf, mag_sq, FFT_LEN/2);

    uint32_t k_peak;
    float pk_val;
    arm_max_f32(mag_sq + 1, FFT_LEN/2 - 1, &pk_val, &k_peak);
    k_peak += 1;

    /* 3. 三点插值 */
    float alpha = (mag_sq[k_peak+1] - mag_sq[k_peak-1]) / (2.0f * pk_val);
    return (k_peak + alpha) * ADC_FS_HZ / FFT_LEN;
}
```

---

## 6. 集成到 main.c

```c
#include "bsp_init.h"
#include "am_meter.h"
#include "hal_lcd.h"

int main(void) {
    bsp_init();
    envelope_init();
    bsp_adc_dma_start();

    while (1) {
        if (adc_ready) {
            adc_ready = 0;
            float m  = am_measure_modulation();
            float fc = am_measure_carrier();
            char buf[64];
            snprintf(buf, sizeof(buf), "fc=%.1f kHz, m=%.1f%%", fc/1000, m*100);
            hal_lcd_show(0, buf);
            hal_delay_ms(500);   /* 0.5 秒更新一次 */
        }
    }
}
```

---

## 7. 推荐硬件方案

| 资源 | 推荐型号 | 关键参数 |
|---|---|---|
| MCU | STM32F407 / H743 | F407 够用，H7 算力余量大 |
| ADC | 内置 12-bit 三重交替 | 2 MHz × 3 = 6 MSPS |
| ADC 前端 | 单端转差分 + 抗混叠滤波 | fc = 1.2 MHz 4 阶 |
| 输入级 | OPA1656 / AD8138 | 高带宽 + 低噪 |
| 显示 | OLED / LCD | 显示 fc + m |
| 串口 | UART → PC | 调试 + MATLAB 验证 |

---

## 8. 测试方法

### 8.1 标准信号源

用本 skill `.auto-embedded/refs/matlab-example-dds-signal-gen.md` 做的 DDS 输出 AM 信号当激励：

```matlab
% 在 PC 上算 AM 波形数据，下载到 DDS 工程
fc = 500e3; fm = 1e3; m = 0.6;
% ... 用 PC 上位机把 m 调到 0.1, 0.3, 0.5, 0.7, 0.9
% MCU 输出: m_measured = ?
```

绘制 m_real vs m_measured 曲线，理想是 y=x。

### 8.2 PC 端验证脚本

```matlab
% 抓 MCU 的串口输出 + 用频谱仪做 ground truth
s = serialport('COM3', 115200);
N = 100;
m_meas = zeros(N, 1);
for i = 1:N
    line = readline(s);
    m_meas(i) = parse_m_from_line(line);
    pause(0.5);
end
fprintf('100 次测量均值 = %.4f, std = %.4f\n', mean(m_meas), std(m_meas));
```

---

## 9. 失败兜底

| 现象 | 诊断 | 修复 |
|---|---|---|
| 测出的 m 总是偏小 | 包络滤波 fc 太低，把高频调制信号也滤了 | 滤波器 fc ≥ 5×fm |
| 测出的 m 抖动大 | 测量窗内调制周期数不是整数 | 窗长 = N × Tm 整数倍，或加 Hanning 窗 |
| 载频偏差大 | FFT 分辨率不够 | 提高 FFT_LEN 或 ADC fs |
| 低调制度（< 10%）测不准 | ADC 量化误差占比大 | 输入级加增益 |
| 过调制（m > 100%）报错 | 包络变成绝对值，max/min 失效 | 用 FFT 频域法替代 |

---

## 10. 评分参考（电赛 2022F）

| 项 | 分值 |
|---|---|
| 调制度测量 5% – 100% | 30 |
| 精度 ± 1% | 20 |
| 载频识别 200kHz – 1MHz | 15 |
| 解调音频输出 | 15 |
| 调制信号频率显示 | 10 |
| 测量速度 ≤ 1s | 10 |

---

## 11. 进阶选项

- **DSB / SSB 自动识别**：场景 E2 自动调制识别
- **数字 IQ 下变频** + 低通：场景 E2 + E5
- **接 PC 上位机**（MATLAB GUI 实时显示）：用 `serialport` + `animatedline`
- **FM 调制度（调频指数）测量**：FFT 边带数 + 贝塞尔函数

---

## 12. 与一键流水线联动

```text
触发"MATLAB 一键流水线 + AM 测量"
  → Step 1: scripts/am_measure.m 仿真验证
  → Step 2: 导出滤波器 + FFT 配置
  → Step 3-4: 编译 + 烧
  → Step 5: /serial-monitor 抓 100 个测量结果
  → Step 6: MATLAB 对照 仿真 vs 实测，绘 m_real vs m_measured 曲线
```

详见 `.auto-embedded/modes/matlab-firmware-pipeline.md`。
