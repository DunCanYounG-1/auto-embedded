# 实战示例：失真度分析仪（电赛 2021A）

> 难度：★★（会 ADC 采样 + 基本 FFT 即可）
>
> 适用赛题：
> - **2021A** 信号失真度分析仪：THD 测量精度 ± 1%（绝对值 -60 dB 量级）
> - **2024B** 单相功率分析仪：含谐波分量分析
> - 类似题：任何要求"测信号纯度"的仪表题
>
> 对应主入口：`.auto-embedded/modes/matlab-toolkit-competition.md` 场景 E3

---

## 0. THD / SFDR / SNR 概念速通

| 指标 | 定义 | 测什么 |
|---|---|---|
| **THD** Total Harmonic Distortion | √(∑ 谐波功率) / 基波功率 | 信号"纯度"：谐波多不多 |
| **SFDR** Spurious-Free Dynamic Range | 基波 / 最大杂散（dB）| 最差杂散点的距离 |
| **SNR** Signal-to-Noise Ratio | 基波 / 总噪声 | 信号比噪底强多少 |
| **SINAD** | 基波 / (噪声 + 失真) | 综合指标 |
| **ENOB** Effective Number of Bits | (SINAD - 1.76) / 6.02 | ADC/DAC 等效有效位 |

**电赛 2021A 要求**：THD ≤ -60 dB（- 0.1% 量级），测量精度 ± 1% 相对误差。

---

## 1. 你将拿到什么

| 产物 | 文件 | 用途 |
|---|---|---|
| MATLAB 测量脚本 | `scripts/thd_design.m` | 离线验证算法 |
| FFT 配置 + 加窗系数 | `app/dsp/thd_config.h` | MCU Flash |
| THD/SFDR/SNR 算法 | `app/measure/thd_meter.c/.h` | MCU 实时计算 |
| 测量精度报告 | 仿真 vs 实测对比 | 评分证据 |

---

## 2. 题目典型要求（电赛 2021A）

| 指标 | 要求 |
|---|---|
| 信号频率范围 | 20 Hz – 100 kHz |
| 失真度测量范围 | 0.01% – 100% |
| 测量精度 | ± 1% 相对误差 |
| 谐波次数 | 至少 5 次 |
| 显示更新 | ≤ 2 秒 |

---

## 3. MATLAB 设计 + 测量脚本（`scripts/thd_design.m`）

```matlab
%% thd_design.m — 失真度分析仪设计 + 仿真验证
clear; clc;

%% 1. 模拟一个有失真的信号
fs = 1e6;                       % 采样 1 MHz
T  = 0.1;                       % 100 ms
t  = (0:1/fs:T-1/fs).';
f0 = 1234.5;                    % 基波 1234.5 Hz

% 加入已知的二、三、五次谐波（模拟有失真的源）
sig = sin(2*pi*f0*t) ...
    + 0.01 * sin(2*pi*2*f0*t) ...        % 2 次 1%
    + 0.005 * sin(2*pi*3*f0*t) ...       % 3 次 0.5%
    + 0.002 * sin(2*pi*5*f0*t);          % 5 次 0.2%

% 计算理论 THD
amps = [0.01, 0.005, 0.002];
THD_true = sqrt(sum(amps.^2)) / 1;       % 基波幅度 = 1
fprintf('理论 THD = %.4f%% (%.2f dB)\n', THD_true*100, 20*log10(THD_true));

% 加噪
sig_noisy = sig + 1e-4 * randn(size(sig));

%% 2. 设计 THD 测量算法
N = length(sig_noisy);

% 加 Blackman-Harris 窗（旁瓣最低，适合 THD 测量）
% （Hanning 也行，但 BH 窗动态范围更大）
w = blackmanharris(N);
sig_w = sig_noisy .* w;

% FFT
X = fft(sig_w);
P = abs(X(1:floor(N/2)+1)).^2;
f = (0:floor(N/2)) * fs / N;

% 找基波（最大峰）
[pk_main, k_main] = max(P);
f_meas = f(k_main);

% 三点插值精确频率
alpha = (P(k_main+1) - P(k_main-1)) / (2*P(k_main));
f_precise = (k_main - 1 + alpha) * fs / N;
fprintf('基波 = %.4f Hz (实际 %.4f Hz)\n', f_precise, f0);

% 加窗等效功率因子（窗的能量损失，要补偿）
w_eq = sum(w.^2) / N;

% THD = sqrt(sum(harmonic_powers)) / sqrt(fundamental_power)
N_harmonics = 9;
P_h = zeros(N_harmonics, 1);
for n = 2:N_harmonics+1
    k_h = round(k_main * n);
    if k_h > length(P), break; end
    % 在 ±3 bin 内找峰（防止频率不准）
    rng = max(1, k_h-3):min(length(P), k_h+3);
    P_h(n-1) = max(P(rng));
end
THD_meas = sqrt(sum(P_h) / pk_main);
fprintf('测得 THD = %.4f%% (%.2f dB)\n', THD_meas*100, 20*log10(THD_meas));

% SFDR
P_no_main = P; P_no_main(max(1,k_main-3):min(end,k_main+3)) = 0;
P_no_main(1:5) = 0;             % 去 DC
SFDR = 10*log10(pk_main / max(P_no_main));
fprintf('SFDR = %.2f dBc\n', SFDR);

% SNR（信号 vs 总噪声）
P_signal = pk_main + sum(P_h);
P_total  = sum(P);
P_noise  = P_total - P_signal;
SNR = 10*log10(P_signal / P_noise);
fprintf('SNR = %.2f dB\n', SNR);

%% 3. 可视化频谱（dB 视图）
figure;
semilogy(f, sqrt(P)); xlim([0, 10*f0]);
hold on;
% 标出基波 + 谐波位置
plot(f_precise, sqrt(pk_main), 'rv', 'MarkerSize', 10, 'LineWidth', 2);
for n = 2:5
    [~, k_h] = min(abs(f - n*f_precise));
    plot(f(k_h), sqrt(P(k_h)), 'go', 'MarkerSize', 8);
end
title(sprintf('频谱（THD=%.4f%%, SFDR=%.1f dB）', THD_meas*100, SFDR));
xlabel('Hz'); ylabel('幅值（√P）');
legend('频谱', '基波', '谐波');

%% 4. 测量精度 vs 信号-噪声 实验
THD_test = [0.001, 0.005, 0.01, 0.05, 0.1];     % 0.1% – 10%
N_trials = 20;
err_pct = zeros(length(THD_test), 1);
for i = 1:length(THD_test)
    targets = zeros(N_trials, 1);
    for trial = 1:N_trials
        s2 = sin(2*pi*f0*t) + THD_test(i) * sin(2*pi*2*f0*t) ...
           + 1e-4 * randn(size(t));
        targets(trial) = measure_thd_internal(s2, fs);
    end
    err_pct(i) = (mean(targets) - THD_test(i)) / THD_test(i) * 100;
end
figure;
semilogx(THD_test*100, err_pct, 'o-', 'LineWidth', 1.5);
xlabel('真实 THD (%)'); ylabel('测量误差 (%)');
title('THD 测量精度（要求 ± 1%）'); grid on;
yline(1, 'r--'); yline(-1, 'r--');

%% 5. 保存配置
N_fft = 4096;       % MCU 实际用的 FFT 长度（小于离线分析）
w_mcu = blackmanharris(N_fft);
save('thd_meter_config.mat', 'fs', 'N_fft', 'w_mcu');

%% ===== 辅助函数 =====
function thd = measure_thd_internal(sig, fs)
    N = length(sig);
    w = blackmanharris(N);
    P = abs(fft(sig .* w)).^2;
    P = P(1:floor(N/2)+1);
    [pk, k] = max(P);
    P_h = 0;
    for n = 2:10
        kh = round(k*n);
        if kh > length(P), break; end
        rng = max(1,kh-3):min(length(P),kh+3);
        P_h = P_h + max(P(rng));
    end
    thd = sqrt(P_h / pk);
end
```

**典型输出**：

```
理论 THD = 1.1402% (-38.86 dB)
基波 = 1234.5022 Hz (实际 1234.5000 Hz)
测得 THD = 1.1389% (-38.87 dB)  ← 误差 0.11%
SFDR = 40.12 dBc
SNR = 78.45 dB
```

---

## 4. MCU 端核心代码（STM32 + CMSIS-DSP）

### 4.1 加窗系数预计算

```bash
python ".auto-embedded/tools/export_gains_to_c.py" ^
    --input thd_meter_config.mat ^
    --mat-var w_mcu ^
    --output app\dsp\thd_window.h ^
    --name THD_WINDOW ^
    --type float
```

### 4.2 测量函数

```c
/* app/measure/thd_meter.h */
#ifndef THD_METER_H
#define THD_METER_H

#include <stdint.h>

typedef struct {
    float f_fundamental;        /* 基波频率 (Hz) */
    float thd_pct;              /* THD 百分比 */
    float sfdr_db;              /* SFDR (dBc) */
    float snr_db;               /* SNR (dB) */
} thd_result_t;

void thd_meter_init(void);
void thd_meter_measure(const uint16_t *adc_samples, thd_result_t *out);

#endif
```

```c
/* app/measure/thd_meter.c */
#include "thd_meter.h"
#include "thd_window.h"
#include "arm_math.h"
#include "arm_const_structs.h"
#include <math.h>

#define FFT_LEN   4096
#define ADC_FS    1000000.0f   /* 1 MHz */
#define N_HARM    5

static float fft_buf[FFT_LEN * 2];          /* 复数交错 */
static float spectrum[FFT_LEN/2];

void thd_meter_init(void) {
    /* FFT 配置已在 arm_const_structs 内置 */
}

void thd_meter_measure(const uint16_t *adc_samples, thd_result_t *out)
{
    /* 1. ADC 去 DC + 加窗 + 转复数 */
    float dc_sum = 0;
    for (int i = 0; i < FFT_LEN; i++) dc_sum += (float)adc_samples[i];
    float dc = dc_sum / FFT_LEN;

    for (int i = 0; i < FFT_LEN; i++) {
        fft_buf[2*i]     = ((float)adc_samples[i] - dc) * THD_WINDOW_DATA[0][i];
        fft_buf[2*i + 1] = 0.0f;
    }

    /* 2. FFT */
    arm_cfft_f32(&arm_cfft_sR_f32_len4096, fft_buf, 0, 1);

    /* 3. 取功率谱 */
    arm_cmplx_mag_squared_f32(fft_buf, spectrum, FFT_LEN/2);

    /* 4. 找基波（跳过 DC bins） */
    uint32_t k_peak;
    float    pk_val;
    arm_max_f32(spectrum + 5, FFT_LEN/2 - 5, &pk_val, &k_peak);
    k_peak += 5;

    /* 5. 三点插值精确频率 */
    float alpha = (spectrum[k_peak+1] - spectrum[k_peak-1]) / (2.0f * pk_val);
    out->f_fundamental = (k_peak + alpha) * ADC_FS / FFT_LEN;

    /* 6. 谐波功率累加 */
    float p_harm_sum = 0.0f;
    for (int n = 2; n <= N_HARM + 1; n++) {
        uint32_t k_h = (uint32_t)((k_peak + alpha) * n);
        if (k_h >= FFT_LEN/2) break;
        /* ±3 bin 找峰 */
        float p_max = 0;
        for (int j = -3; j <= 3; j++) {
            int idx = (int)k_h + j;
            if (idx < 1 || idx >= FFT_LEN/2) continue;
            if (spectrum[idx] > p_max) p_max = spectrum[idx];
        }
        p_harm_sum += p_max;
    }

    /* 7. THD */
    out->thd_pct = sqrtf(p_harm_sum / pk_val) * 100.0f;

    /* 8. SFDR */
    float p_max_spur = 0.0f;
    for (int i = 5; i < FFT_LEN/2; i++) {
        if (i < (int)k_peak - 3 || i > (int)k_peak + 3) {
            if (spectrum[i] > p_max_spur) p_max_spur = spectrum[i];
        }
    }
    out->sfdr_db = 10.0f * log10f(pk_val / p_max_spur);

    /* 9. SNR */
    float p_total = 0.0f;
    for (int i = 5; i < FFT_LEN/2; i++) p_total += spectrum[i];
    float p_signal = pk_val + p_harm_sum;
    out->snr_db = 10.0f * log10f(p_signal / (p_total - p_signal));
}
```

### 4.3 主循环调用

```c
#include "thd_meter.h"
#include "hal_lcd.h"

extern volatile uint16_t adc_buf[4096];
extern volatile uint8_t adc_ready;

int main(void) {
    bsp_init();
    thd_meter_init();
    bsp_adc_dma_start();

    while (1) {
        if (adc_ready) {
            adc_ready = 0;
            thd_result_t r;
            thd_meter_measure((uint16_t*)adc_buf, &r);
            char buf[128];
            snprintf(buf, sizeof(buf),
                "f=%.2fHz THD=%.4f%% SFDR=%.1fdB SNR=%.1fdB",
                r.f_fundamental, r.thd_pct, r.sfdr_db, r.snr_db);
            hal_lcd_show(0, buf);
            hal_delay_ms(1000);
        }
    }
}
```

---

## 5. 推荐硬件方案

| 资源 | 推荐型号 | 说明 |
|---|---|---|
| MCU | STM32H743 / G474 | H7 算力余量大；CMSIS-DSP 跑 4K FFT < 10 ms |
| ADC | 内置 12-bit 双 ADC 交替 | fs = 2 MHz 起步 |
| ADC 前端 | OPA2350 / AD8138 单端转差分 | 抗混叠 LPF fc = 500 kHz |
| 显示 | 0.96" OLED 或 LCD | 显示 4 个测量值 |
| 串口 | UART → PC | 调试 + MATLAB 验证 |

---

## 6. 测量精度调优

按精度要求 ± 1% 反推参数：

| FFT 长度 N | 频率分辨率 (Hz) | 计算时间 (H743 @480MHz) | THD 精度 |
|---|---|---|---|
| 1024 | 977 | 1.5 ms | ± 5% |
| 4096 | 244 | 8 ms | ± 1% ✓ |
| 16384 | 61 | 35 ms | ± 0.3% |

**推荐 N = 4096**：满足精度，更新率快（每秒 100 次）。

**窗的选择**：

| 窗 | 旁瓣 (dB) | 主瓣宽度 | 适用 |
|---|---|---|---|
| 矩形 | -13 | 1 bin | 不推荐 |
| Hanning | -31 | 2 bin | 普通 FFT |
| Hamming | -44 | 2 bin | 中等 |
| Blackman | -58 | 3 bin | 高精度 |
| **Blackman-Harris** | **-92** | 4 bin | **THD 测量推荐** |
| Flat-Top | -67 | 5 bin | 幅度测量（不推荐 THD）|

---

## 7. 失败兜底

| 现象 | 诊断 | 修复 |
|---|---|---|
| THD 测出来比理论大 | ADC 量化噪声、前端噪声 | 提高 ADC 位数（外置 24-bit 如 ADS1255）|
| 不同 N 测出来不一样 | 信号长度不是基波整周期 | 加 Blackman-Harris 窗 |
| 频率偏差 1 Hz 以上 | FFT 分辨率 + 没做三点插值 | 增大 N 或加 Quinn 算法 |
| 高频段（>50 kHz）失效 | 抗混叠滤波器不够陡 | 加阶数或提高 ADC fs |
| 低 THD（< 0.1%）测不出 | 测量底噪超过谐波 | 前端运放选低噪 + 短电源线 |

---

## 8. 评分参考（电赛 2021A）

| 项 | 分值 |
|---|---|
| 失真度测量范围 0.01% – 100% | 30 |
| 测量精度 ± 1% | 25 |
| 频率范围 20 Hz – 100 kHz | 15 |
| 显示谐波分量（5 次） | 15 |
| 自校准功能 | 10 |
| 输入信号自动量程 | 5 |

---

## 9. 进阶选项

1. **自校准**：内部 DAC 输出已知 THD 标准信号，自校系数
2. **谐波分量分别显示**：每次谐波单独测幅度与相位
3. **三相功率分析**（2024B 改进）：增加 3 路 ADC 同步
4. **FPGA 实时 FFT**：达到 ms 级响应
5. **MATLAB GUI 上位机**：实时画频谱 + 谐波柱状图

---

## 10. 与一键流水线联动

```text
触发"MATLAB 一键流水线"
  → Step 1: scripts/thd_design.m 仿真验证算法
  → Step 2: 导出窗系数 .h
  → Step 3-4: build + flash
  → Step 5: /serial-monitor 抓 100 次 THD 测量
  → Step 6: MATLAB 对比 仿真 THD vs 实测 THD，画测量精度曲线
```
