# 入门示例：一阶低通 IIR 滤波器设计

> 难度：★（不懂数字信号处理也能跑通，15 分钟）
>
> 用途：给 ADC / IMU / 编码器读出来的脏数据加一个低通滤波器，去除工频干扰、PWM 谐波、机械振动。
>
> 涉及 `.auto-embedded/modes/matlab-embedded-toolkit.md` 场景 2（滤波器设计）+ 场景 8（定点化）。

---

## 0. 学完你能做什么

- 知道**截止频率**怎么选（最常问的问题）
- 用 MATLAB 一键算出 IIR 滤波器系数
- 把系数转成 C 代码，在 STM32 / ESP32 上用 CMSIS-DSP 跑
- 验证滤波效果：滤波前后波形对比 + 频响曲线

---

## 1. 概念速通（小白必读）

### 1.1 截止频率 fc 怎么选？

**经验法则**：

```
fc = (你想保留的信号最高频率) × 1.5 ~ 2
```

| 应用 | 信号最高频率 | 推荐 fc |
|---|---|---|
| 温度控制 | 0.1 Hz（变化慢） | 1 Hz |
| 电池电压监控 | 1 Hz | 5 Hz |
| 直流电机转速反馈 | 10 Hz | 20 Hz |
| 平衡车 IMU 角速度 | 30 Hz | 50 Hz |
| 音频 | 20 kHz | 22 kHz |

**判断噪声频率**：先用 `.auto-embedded/refs/matlab-example-serial-plot.md` + FFT（场景 3）看你的脏信号频谱。

### 1.2 IIR vs FIR

| | IIR | FIR |
|---|---|---|
| 阶数 | 低（2–6） | 高（16–128） |
| 计算量 | 小，嵌入式首选 | 大 |
| 相位 | 非线性（有延迟） | 线性相位 |
| 稳定性 | 设计需小心 | 永远稳定 |

**新手默认选 IIR + Butterworth**（最平滑，无纹波，工程最常用）。

### 1.3 采样率 fs 必须满足

```
fs ≥ 2 × fc           （Nyquist 定理，硬下限）
fs ≥ 10 × fc          （工程经验，避免相位失真）
```

例：fc = 50 Hz → fs 必须 ≥ 500 Hz（即采样周期 ≤ 2 ms）。

---

## 2. MATLAB 设计（一键跑）

把下面贴进 `mcp__matlab__evaluate_matlab_code`：

```matlab
% --- 一阶低通 Butterworth 设计 ---

% 1. 设计参数（按你应用改）
fs    = 1000;    % 采样率 1 kHz
fc    = 50;      % 截止频率 50 Hz
order = 1;       % 一阶（最简单）

% 2. 设计滤波器
Wn = fc / (fs/2);   % 归一化频率（Nyquist 频率为 1）
[b, a] = butter(order, Wn, 'low');

fprintf('=== 滤波器系数 ===\n');
fprintf('b = [%.6f %.6f]\n', b(1), b(2));
fprintf('a = [%.6f %.6f]\n', a(1), a(2));

% 3. 差分方程（用于 C 实现）
%    y[n] = b(1)*x[n] + b(2)*x[n-1] - a(2)*y[n-1]
fprintf('\n=== 差分方程 ===\n');
fprintf('y[n] = %.6f*x[n] + %.6f*x[n-1] - %.6f*y[n-1]\n', b(1), b(2), a(2));

% 4. 可视化频响
figure;
freqz(b, a, 1024, fs);
title(sprintf('低通滤波器频响 (fs=%d, fc=%d Hz, %d 阶)', fs, fc, order));

% 5. 仿真验证：合成"信号 + 噪声"看滤波效果
t = 0:1/fs:1;             % 1 秒
signal = sin(2*pi*5*t);   % 5 Hz 想要保留的信号
noise  = 0.5*sin(2*pi*200*t) + 0.3*randn(size(t));  % 200 Hz 干扰 + 白噪
dirty  = signal + noise;

clean = filter(b, a, dirty);

figure;
subplot(2,1,1);
plot(t(1:200), dirty(1:200), 'r-'); hold on;
plot(t(1:200), signal(1:200), 'b--', 'LineWidth', 1.5);
legend('脏信号', '理想信号'); ylabel('幅值'); grid on;
title('滤波前');

subplot(2,1,2);
plot(t(1:200), clean(1:200), 'b-'); hold on;
plot(t(1:200), signal(1:200), 'k--', 'LineWidth', 1.5);
legend('滤波后', '理想信号'); xlabel('t (s)'); ylabel('幅值'); grid on;
title('滤波后');

% 6. 保存系数供导出
save('lpf_coeffs.mat', 'b', 'a', 'fs', 'fc', 'order');
```

**典型输出**：

```
=== 滤波器系数 ===
b = [0.137323 0.137323]
a = [1.000000 -0.725303]

=== 差分方程 ===
y[n] = 0.137323*x[n] + 0.137323*x[n-1] - -0.725303*y[n-1]
```

---

## 3. 落到 MCU：C 代码三种实现

### 3.1 最简单：手写差分方程（不依赖 CMSIS-DSP）

直接把 MATLAB 输出的 `b` 和 `a` 数值写进去：

```c
/* app/dsp/lpf.c — 一阶低通，零依赖 */

typedef struct {
    float b[2];     /* 分子系数 */
    float a[2];     /* 分母系数（a[0]=1 隐含） */
    float x_prev;   /* 上一次输入 */
    float y_prev;   /* 上一次输出 */
} lpf1_t;

static lpf1_t g_lpf = {
    .b = { 0.137323f, 0.137323f },
    .a = { 1.000000f, -0.725303f },
    .x_prev = 0.0f,
    .y_prev = 0.0f,
};

float lpf_step(lpf1_t *f, float x)
{
    float y = f->b[0]*x + f->b[1]*f->x_prev - f->a[1]*f->y_prev;
    f->x_prev = x;
    f->y_prev = y;
    return y;
}

/* 调用：每个采样周期一次 */
void adc_isr_handler(void) {
    float raw = adc_get_value();
    float filtered = lpf_step(&g_lpf, raw);
    /* 用 filtered ... */
}
```

### 3.2 用导出器（推荐）

```bash
python ".auto-embedded/tools/export_gains_to_c.py" ^
    --input lpf_coeffs.mat --mat-var b ^
    --output app\dsp\lpf_b.h --name LPF_B --type float

python ".auto-embedded/tools/export_gains_to_c.py" ^
    --input lpf_coeffs.mat --mat-var a ^
    --output app\dsp\lpf_a.h --name LPF_A --type float
```

### 3.3 高阶用 CMSIS-DSP biquad（二阶节级联）

如果阶数 > 2，必须用 SOS（second-order section）形式避免数值病态：

```matlab
% MATLAB 端
[b, a] = butter(4, 50/500, 'low');   % 4 阶
sos = tf2sos(b, a);                  % 转 SOS
save('lpf_sos.mat', 'sos');
```

```c
/* C 端 — CMSIS-DSP biquad */
#include "lpf_sos.h"     /* 由 .auto-embedded/tools/export_gains_to_c.py 生成 */
#include "arm_math.h"

#define BLOCK_SIZE 32
#define NUM_STAGES 2     /* 4 阶 = 2 个二阶节 */
static float state[4*NUM_STAGES];
static arm_biquad_casd_df1_inst_f32 lpf;

void dsp_init(void) {
    arm_biquad_cascade_df1_init_f32(&lpf, NUM_STAGES, lpf_coeffs, state);
}

void dsp_process(float *in, float *out) {
    arm_biquad_cascade_df1_f32(&lpf, in, out, BLOCK_SIZE);
}
```

---

## 4. 一行版"一阶 IIR"（嵌入式最常用偷懒写法）

如果只是简单平滑（不在乎精确截止频率），用这个：

```c
/* α 越小越平滑，越大越响应快 */
float lpf_simple(float x, float y_prev, float alpha) {
    return alpha * x + (1 - alpha) * y_prev;
}
```

**α 怎么选**：

```
α = Ts / (Ts + τ)
其中 τ = 1 / (2π·fc)
```

例：Ts = 1 ms、fc = 50 Hz → τ = 0.00318、α = 0.001/0.00418 ≈ 0.239。

用 MATLAB 验证：

```matlab
fs = 1000; fc = 50;
tau = 1/(2*pi*fc);
alpha = (1/fs) / (1/fs + tau);
fprintf('alpha = %.4f\n', alpha);
% 它等价于：b = [alpha 0]; a = [1 -(1-alpha)];
```

---

## 5. 验证滤波效果（实测）

烧录后录两段数据：

```c
/* 同时输出原始 + 滤波后 */
char buf[80];
int n = snprintf(buf, sizeof(buf), "%lu,%.3f,%.3f\n", t_ms, raw, filtered);
hal_uart_write(LOG_UART, (uint8_t*)buf, n, 10);
```

MATLAB 端：

```matlab
data = readmatrix('filter_test.csv');
t = data(:,1)/1000;
raw = data(:,2); filt = data(:,3);

figure;
subplot(2,1,1);
plot(t, raw, 'r-', t, filt, 'b-', 'LineWidth', 1.2);
legend('原始', '滤波后'); ylabel('信号'); grid on;

% RMS 噪声对比
noise_raw  = std(raw - mean(raw));
noise_filt = std(filt - mean(filt));
fprintf('噪声 RMS：原始=%.3f, 滤波后=%.3f, 抑制 %.1f dB\n', ...
    noise_raw, noise_filt, 20*log10(noise_raw/noise_filt));

% 频谱对比
N = 2^nextpow2(length(t));
fft_raw  = abs(fft(raw, N));
fft_filt = abs(fft(filt, N));
f = (0:N/2-1) * (1/mean(diff(t))) / N;

subplot(2,1,2);
semilogy(f, fft_raw(1:N/2), 'r-', f, fft_filt(1:N/2), 'b-');
legend('原始', '滤波后'); xlabel('Hz'); ylabel('幅值（对数）'); grid on;
title('频谱对比');
```

**期望结果**：滤波后 RMS 抑制 20–40 dB、截止频率以上幅度明显下降。

---

## 6. 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| 滤波后波形整体延迟 | IIR 引入相位延迟（物理必然） | 用 FIR 线性相位 / 减小 fc 接受延迟 |
| 滤波后信号被衰减 | 截止频率取低于信号频率 | 提高 fc |
| 输出震荡发散 | 系数计算错误 / 定点溢出 | 检查 `a[0]` 是否归一化为 1 |
| 改了 fs 但没改系数 | 系数与采样率强绑定 | 改 fs 后必须重新设计滤波器 |
| MATLAB 报缺 `butter` | 缺 Signal Processing Toolbox | 降级 scipy `scipy.signal.butter` |

---

## 7. 写入磁盘记忆

```markdown
## 技术发现

### 2026-05-19 — IMU 角速度低通滤波器设计
- **关联轮次**：Round 2 / Builder
- **查询工具**：mcp__matlab__evaluate_matlab_code
- **设计参数**：fs=1000 Hz, fc=50 Hz, 一阶 Butterworth
- **系数**：b=[0.137323, 0.137323]，a=[1.0, -0.725303]
- **实测**：抑制噪声 RMS 28 dB
- **状态**：已采纳，集成到 app/dsp/lpf.c
```

---

## 8. 下一步

- 不知道 fc 选多少 → 先做 FFT（`.auto-embedded/modes/matlab-embedded-toolkit.md` 场景 3）
- 滤波后接 PID → `.auto-embedded/refs/matlab-example-step-id.md` §5
- 高阶滤波器（带通、陷波器去工频）→ 同样用 `butter` / `designfilt` 即可，本示例换 `order` 和 `'bandpass'` / `'stop'`
