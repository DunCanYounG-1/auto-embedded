# MATLAB 嵌入式工具箱 — 大学生竞赛专题

> 辅助型 mode — 不替代 RIPER-5。在 `modes/matlab-embedded-toolkit.md`（10 场景主线）之外，针对**全国大学生电子设计竞赛**（电赛）常见题型，提供 6 个专项场景 E1-E3 + E5-E7。
>
> **核心差异化**：主线工具箱按"算法门类"组织（滤波 / 控制 / 辨识 ...），本竞赛专题按"赛题门类"组织（信号源 / 调制解调 / 仪表 ...），并且每场景配一段"历年赛题对应"指明能解哪些题。
>
> **范围说明**：E4（视觉处理）已剥离至独立 `auto-vision` skill。本 mode 只覆盖控制 / 计算类竞赛题，含摄像头 / 赛道识别 / 目标追踪的题目由 `auto-vision` skill 承担。

---

## 0. 谁该读这个 mode

### 0.1 触发词

`电赛` / `电子设计竞赛` / `全国大学生电子设计竞赛` / `DDS` / `信号发生器` / `波形合成` / `调制` / `解调` / `AM` / `FM` / `ASK` / `FSK` / `PSK` / `调制度` / `失真度` / `THD` / `SFDR` / `谐波分析` / `频率计` / `频谱仪` / `自适应滤波` / `LMS` / `RLS` / `自适应噪声抵消` / `电磁循迹` / `差比和` / `Simscape` / `电路仿真` / `运放仿真`

### 0.2 适用判断

| 你的情况 | 入口 |
|---|---|
| 我在打电赛，想看历年题怎么解 | 本 mode + `refs/competition-index.md` |
| 我有一个具体算法要落到 MCU（不分赛事） | 走主线 `modes/matlab-embedded-toolkit.md`（10 场景） |
| 我想做 MATLAB 算 → 编译 → 烧 → 实测 全闭环 | `modes/matlab-firmware-pipeline.md` |
| 完全零基础，第一次接触 | `refs/matlab-hello-5min.md` |

### 0.3 决策树：你的赛题落在哪个场景？

```
我要做的题是 ……
│
├── 输出一个波形（正弦/方波/任意波）
│    → E1：DDS 信号发生
│
├── 测量一个已调制信号的参数（载频/调制度/相位/带宽）
│    │
│    ├── 知道调制方式 → E2 解调专项
│    └── 不知道调制方式 → E2 自动识别
│
├── 测量信号本身的指标（精确频率 / THD / SFDR / 噪底）
│    → E3：测量仪表
│
├── 含摄像头 / 视觉处理
│    → 调用独立 `auto-vision` skill（不在本 mode）
│
├── 信号里混进了未知噪声 / 干扰，要"学着"滤掉
│    → E5：自适应滤波（LMS / RLS）
│
├── 我要先在 PC 里仿真一个运放电路 / 滤波器 / 电源拓扑
│    → E6：Simscape Electrical 电路仿真
│
└── 让小车看电感跟着导线跑（不是摄像头）
     → E7：电磁循迹信号处理
```

---

## 1. 通用前置：竞赛场景下的 MATLAB 工具箱依赖

针对竞赛场景做的 toolbox 速查（按场景 E1-E3 + E5-E7）：

| 场景 | 最低必需 toolbox | 推荐 toolbox | 缺装替代 |
|---|---|---|---|
| E1 DDS | MATLAB Base | DSP System Toolbox | 用 Base 算 sin LUT 即可 |
| E2 调制解调 | Communications Toolbox | Signal Processing | scipy.signal + commpy |
| E3 测量仪表 | Signal Processing Toolbox | DSP / Audio | scipy.signal |
| E5 自适应滤波 | DSP System Toolbox | — | scipy + 手写 LMS |
| E6 Simscape 电路 | Simscape Electrical | Simscape | PSpice / LTspice |
| E7 电磁循迹 | MATLAB Base | Signal Processing | numpy |

**调用前必跑**（与主 mode 一致）：

```python
mcp__matlab__detect_matlab_toolboxes()
```

---

## 2. 场景 E1：DDS 信号发生器（"我要输出一个波形"）

> 电赛常考。直接数字频率合成（DDS）= 相位累加器 + 查找表，原理简单但精度（SFDR / 杂散）有讲究。

### A. 你需要准备什么数据 / 硬件

- 目标输出频率范围（如 1 Hz – 1 MHz）
- 目标采样率（DAC 时钟，如 1 MS/s）
- 表大小：常用 1024 / 4096 / 16384 点
- 相位累加器位宽：常用 32 位
- 输出波形：sin / 三角 / 方 / 任意波
- 硬件：MCU + DAC（STM32 内置 DAC 或外置 DAC8552）+ TIM 触发 + DMA

### B. 我会做什么

```python
mcp__matlab__evaluate_matlab_code(code="""
    %% DDS 设计 + 失真度评估
    N_table = 4096;             % LUT 大小
    bits    = 12;               % DAC 位数（STM32 内置常 12 bit）
    accum_w = 32;               % 相位累加器位宽

    % 1. 生成 sin LUT
    theta = (0:N_table-1) * 2*pi / N_table;
    sin_lut = round(sin(theta) * (2^(bits-1)-1));

    fprintf('LUT 大小 %d，量化位数 %d，范围 [%d, %d]\\n', ...
        N_table, bits, min(sin_lut), max(sin_lut));

    % 2. 模拟 DDS 输出，验证频率精度与 SFDR
    fs    = 1e6;                % DAC 时钟 1 MHz
    f_out = 12345;              % 期望输出频率
    FCW   = round(f_out * 2^accum_w / fs);  % 频率控制字
    f_actual = FCW * fs / 2^accum_w;
    fprintf('期望 %.4f Hz，实际 %.4f Hz，量化误差 %.2e Hz\\n', ...
        f_out, f_actual, abs(f_out - f_actual));

    % 3. 仿真输出 32768 个采样点
    N_sim = 32768;
    phase_accum = uint32(0);
    output = zeros(N_sim, 1);
    for i = 1:N_sim
        idx = double(bitshift(phase_accum, -(accum_w - log2(N_table))));  % 高位作 LUT 索引
        output(i) = sin_lut(mod(idx, N_table) + 1);
        phase_accum = uint32(mod(double(phase_accum) + FCW, 2^accum_w));
    end

    % 4. FFT 分析失真
    w = hanning(N_sim);
    Y = abs(fft(output .* w));
    P = Y(1:N_sim/2+1);
    [pk_main, idx_main] = max(P);
    P_sub = P; P_sub(idx_main-2:idx_main+2) = 0;
    pk_max_sub = max(P_sub);
    SFDR = 20*log10(pk_main / pk_max_sub);
    fprintf('SFDR = %.2f dBc\\n', SFDR);

    % 5. THD（前 10 次谐波）
    harmonics = [];
    for n = 2:10
        h_idx = idx_main * n;
        if h_idx > length(P), break; end
        harmonics(end+1) = P(h_idx);
    end
    THD = 20*log10(sqrt(sum(harmonics.^2)) / pk_main);
    fprintf('THD = %.2f dBc（前 10 次）\\n', THD);

    % 6. 保存 LUT 供导出
    save('dds_sin_lut.mat', 'sin_lut', 'N_table', 'bits', 'accum_w');
""")
```

### C. 你拿到什么

| 产物 | 用途 |
|---|---|
| `sin LUT`（4096 点 int16/int12）| 烧到 MCU Flash |
| 频率控制字（FCW）计算公式 | 软件设频 |
| SFDR / THD 测量值 | 评估方案是否达标（电赛常要求 SFDR > 60 dB） |
| 表大小与位数权衡曲线 | LUT 越大 SFDR 越高，但 Flash 占用越大 |

### D. 怎么落到 MCU

**Step 1：用导出器把 LUT 转 C 头**

```bash
python "C:\Users\A\.claude\skills\embedded-dev\tools\export_gains_to_c.py" ^
    --input dds_sin_lut.mat --mat-var sin_lut ^
    --output app\dsp\dds_sin_lut.h --name DDS_SIN_LUT --type float
# 注：12-bit 整数也可以用 --type fixed_q15 但要先归一化到 [-1, 1)
```

**Step 2：MCU 端核心代码**

```c
/* app/dsp/dds.c */
#include "dds_sin_lut.h"
#include "hal_dac.h"

#define ACCUM_BITS  32
#define TABLE_BITS  12      /* log2(4096) */
#define DAC_FS_HZ   1000000U

static volatile uint32_t phase_accum = 0;
static volatile uint32_t fcw = 0;

void dds_set_freq(float freq_hz)
{
    fcw = (uint32_t)((freq_hz / DAC_FS_HZ) * (1ULL << ACCUM_BITS));
}

/* TIM 中断里调用，每个 DAC 时钟一次 */
void dds_isr(void)
{
    uint32_t idx = phase_accum >> (ACCUM_BITS - TABLE_BITS);
    hal_dac_write((uint16_t)((DDS_SIN_LUT_DATA[0][idx] + 1.0f) * 2048.0f));  /* float → 12-bit DAC */
    phase_accum += fcw;
}
```

**Step 3：用 TIM + DMA 加速**（推荐生产用法）

```c
/* 提前算好 1 个完整周期的样本到 ring buffer，DMA 自动喂 DAC */
static uint16_t dma_buf[1024];
void dds_dma_prepare(float freq_hz) {
    for (int i = 0; i < 1024; i++) {
        uint32_t accum = (uint32_t)(((float)i / 1024) * (freq_hz / DAC_FS_HZ) * 4294967296.0f);
        uint32_t idx = accum >> (ACCUM_BITS - TABLE_BITS);
        dma_buf[i] = (uint16_t)((DDS_SIN_LUT_DATA[0][idx] + 1.0f) * 2048.0f);
    }
    hal_dma_dac_start(dma_buf, 1024, /*circular*/ 1);
}
```

### E. 历年赛题对应

| 年-题号 | 题目 | 关键考点 | 推荐路径 |
|---|---|---|---|
| 2001A | 波形发生器 | 频率精度 / SFDR / THD | E1 + 自定义滤波后置（场景 2）|
| 2005A | 正弦信号发生器 | 50 Hz – 1 MHz / THD < 1% | E1（注意 LUT 大小） |
| 2017F | 波形识别器 | 反向 — 用 E3 测量识别波形 | E3 + E1 仿真验证 |
| 2022D | 数字示波器配合 | DDS 标准源对照 | E1（标定源） |

**实战详细见**：`refs/matlab-example-dds-signal-gen.md`

---

## 3. 场景 E2：调制解调全家桶（"我要测调制信号 / 自动识别调制方式"）

> 电赛通信类高频题。Communications Toolbox 提供 ammod/fmmod/pskmod 等开箱即用函数 + AWGN 信道 + BER 分析。

### A. 你需要准备什么数据

- 载波频率 fc 和采样率 fs（需满足 fs ≥ 4·fc）
- 已知调制方式（AM/FM/ASK/FSK/PSK 之一）—— 或要求自动识别（更难）
- 调制信号源：基带数据 / 音频信号
- 输入：从 ADC 或文件读取的 IQ 或实信号

### B. 我会做什么

**生成测试信号**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    fs = 200e3; fc = 50e3;
    t  = (0:1/fs:0.01).';
    msg = 0.5 * sin(2*pi*1000*t);    % 1 kHz 基带

    % AM
    am_signal = ammod(msg, fc, fs, 0, 0.5);   % 调制度 0.5
    % FM
    fm_signal = fmmod(msg, fc, fs, 5000);     % 频偏 5 kHz
    % BPSK
    bits = randi([0 1], 100, 1);
    bpsk = pskmod(bits, 2);                   % 调制
    bpsk_carrier = real(bpsk(1:10:end) .* exp(1j*2*pi*fc*t(1:length(bpsk)/10)));

    figure;
    subplot(3,1,1); plot(t, am_signal); title('AM');
    subplot(3,1,2); plot(t, fm_signal); title('FM');
    subplot(3,1,3); plot(t(1:length(bpsk_carrier)), bpsk_carrier); title('BPSK');

    save('mod_signals.mat', 'am_signal', 'fm_signal', 'fs', 'fc');
""")
```

**解调**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    load('mod_signals.mat');
    % AM 包络检波 + 低通
    env = abs(hilbert(am_signal));            % 解析信号取模 = 包络
    [b,a] = butter(4, 5000/(fs/2), 'low');
    am_demod = filter(b, a, env) - mean(env);

    % FM 鉴频（微分 + 包络）
    fm_demod = diff(unwrap(angle(hilbert(fm_signal)))) * fs / (2*pi);

    figure;
    subplot(2,1,1); plot(am_demod); title('AM 解调');
    subplot(2,1,2); plot(fm_demod); title('FM 解调');
""")
```

**调制方式自动识别**（关键技术）：

```python
mcp__matlab__evaluate_matlab_code(code="""
    % 用统计特征 + 决策树识别
    function mod_type = classify_modulation(signal, fs)
        % 提取特征：包络方差、瞬时频率方差、谱平坦度等
        env = abs(hilbert(signal));
        env_var = var(env / mean(env));
        if env_var < 0.01
            mod_type = 'CW';                  % 无调制
        elseif env_var < 0.3
            mod_type = 'FM/PSK';              % 包络平稳
        else
            mod_type = 'AM/ASK';              % 包络变化
        end
    end
""")
```

### C. 你拿到什么

| 产物 | 用途 |
|---|---|
| 已调信号 .mat（带时间向量）| 后续测试用 |
| 解调算法 .m（脚本）| 直接转 C |
| 调制度 / 频偏 / 误码率 测量值 | 电赛评分指标 |
| 自动识别决策树 | 不知道调制方式时用 |

### D. 怎么落到 MCU

**软解调 STM32 方案**（中等带宽，载频 ≤ 200 kHz）：

```c
/* app/dsp/am_demod.c — AM 包络解调 */
#include "lpf_5khz_coeffs.h"
#include "arm_math.h"

static float env_buf[BLOCK_SIZE];
static arm_biquad_casd_df1_inst_f32 lpf;
static float lpf_state[4];

void am_demod_init(void) {
    arm_biquad_cascade_df1_init_f32(&lpf, 1, lpf_5khz_coeffs, lpf_state);
}

float am_demod_step(float adc_sample) {
    /* 1. 取绝对值（半波 / 全波）— 包络近似 */
    float env = fabsf(adc_sample);
    /* 2. 低通去载波 */
    float demod;
    arm_biquad_cascade_df1_f32(&lpf, &env, &demod, 1);
    return demod;
}
```

**高带宽 / 高精度** → 用 FPGA + IQ 下变频 + 数字 LPF（超出 MCU 范围）。

### E. 历年赛题对应

| 年-题号 | 题目 | 关键考点 | 推荐路径 |
|---|---|---|---|
| 2022F | 信号调制度测量 | AM 调制度 ± 1% 精度 | E2 解调 + E3 包络测量 + `refs/matlab-example-modem-am.md` |
| 2023D | 信号调制方式识别 | AM/FM/PSK 自动识别 | E2 自动识别 + 决策树 |
| 2023H | 信号分离 | 多调制方式分离 | E2 + E5 自适应滤波 |
| 2019F | 短距离无线传输 | OOK / FSK 设计与测量 | E2 + E1（载波源）|

**实战详细见**：`refs/matlab-example-modem-am.md`

---

## 4. 场景 E3：测量仪表（"我要做频率计 / 失真度计 / 频谱仪"）

> 电赛仪表类高频题。核心是 FFT + 加窗 + 插值，比单纯做"看波形"难得多 —— 要做到精度。

### A. 你需要准备什么数据

- 待测信号采样数据（建议 ≥ 4096 点）
- 已知采样率 fs
- 待测指标：精确频率 / 失真度 THD / 杂散 SFDR / 信噪比 SNR / 谐波分量

### B. 我会做什么

```python
mcp__matlab__evaluate_matlab_code(code="""
    %% 万能测量函数
    function [f_est, THD, SFDR, SNR] = measure_signal(x, fs)
        N = length(x);
        x = x - mean(x);                       % 去 DC
        w = hanning(N);
        X = fft(x .* w);
        P = abs(X(1:floor(N/2)+1)).^2;
        f = (0:floor(N/2)) * fs / N;

        % 1. 精确频率（峰值插值，三点 Quinn 算法）
        [~, k_peak] = max(P);
        alpha = (P(k_peak+1) - P(k_peak-1)) / (2*P(k_peak));
        f_est = (k_peak - 1 + alpha) * fs / N;

        % 2. THD（前 10 次谐波 / 基波）
        P_h = zeros(9,1);
        for n = 2:10
            kh = round(k_peak * n);
            if kh > length(P), break; end
            % 在 ±2 bin 范围找峰
            [P_h(n-1), ~] = max(P(max(1,kh-2):min(length(P),kh+2)));
        end
        THD = 10*log10(sum(P_h) / P(k_peak));

        % 3. SFDR
        P_no_dc = P; P_no_dc(1:5) = 0;
        P_main = P_no_dc(k_peak);
        P_no_dc(max(1,k_peak-3):min(end,k_peak+3)) = 0;
        SFDR = 10*log10(P_main / max(P_no_dc));

        % 4. SNR（信号 vs 全部其他）
        noise_power = sum(P_no_dc);
        SNR = 10*log10(P(k_peak) / noise_power);
    end

    % 测试
    fs = 100e3; t = (0:1/fs:0.1).';
    x = sin(2*pi*1234.5*t) + 0.01*sin(2*pi*2469*t) + 0.005*randn(size(t));
    [f, THD, SFDR, SNR] = measure_signal(x, fs);
    fprintf('精确频率 = %.4f Hz\\n', f);
    fprintf('THD = %.2f dB\\n', THD);
    fprintf('SFDR = %.2f dBc\\n', SFDR);
    fprintf('SNR = %.2f dB\\n', SNR);
""")
```

### C. 你拿到什么

| 指标 | 典型电赛要求 | 测量原理 |
|---|---|---|
| 精确频率 | ± 0.1 Hz | FFT + 三点插值（Quinn / Jacobsen）|
| 频率分辨率 | ≥ 1 Hz | 长 FFT + 加窗 |
| THD | ≥ 60 dB（- 60 dBc）| 前 N 次谐波平方和 / 基波 |
| SFDR | ≥ 50 dB | 主峰 / 最大非主峰 |
| SNR | ≥ 50 dB | 信号 / 噪底总功率 |
| 谐波幅度 | 每次单测 | 直接读对应频率 bin |

### D. 怎么落到 MCU

**STM32 + CMSIS-DSP FFT**：

```c
/* app/dsp/instrument.c */
#include "arm_math.h"
#include "arm_const_structs.h"

#define FFT_SIZE 4096

static float buf[FFT_SIZE * 2];          /* 复数交错 */
static float spectrum[FFT_SIZE / 2];
static float window[FFT_SIZE];

void instrument_init(void) {
    /* 预算 Hanning 窗 */
    for (int i = 0; i < FFT_SIZE; i++)
        window[i] = 0.5f * (1.0f - cosf(2.0f * 3.14159265f * i / (FFT_SIZE - 1)));
}

void measure(float *samples, float *f_est, float *thd_db) {
    /* 加窗 + 转复数（虚部置 0） */
    for (int i = 0; i < FFT_SIZE; i++) {
        buf[2*i] = samples[i] * window[i];
        buf[2*i+1] = 0;
    }
    arm_cfft_f32(&arm_cfft_sR_f32_len4096, buf, 0, 1);

    /* 取模平方 */
    arm_cmplx_mag_squared_f32(buf, spectrum, FFT_SIZE/2);

    /* 找主峰 */
    uint32_t k_peak;
    float peak_val;
    arm_max_f32(spectrum + 1, FFT_SIZE/2 - 1, &peak_val, &k_peak);
    k_peak += 1;

    /* 三点插值 */
    float alpha = (spectrum[k_peak+1] - spectrum[k_peak-1]) / (2.0f * peak_val);
    *f_est = (k_peak + alpha) * SAMPLE_RATE / FFT_SIZE;

    /* THD：前 5 次谐波 */
    float thd_sum = 0;
    for (int n = 2; n <= 5; n++) {
        uint32_t kh = (uint32_t)(k_peak * n);
        if (kh >= FFT_SIZE/2) break;
        thd_sum += spectrum[kh];
    }
    *thd_db = 10.0f * log10f(thd_sum / peak_val);
}
```

### E. 历年赛题对应

| 年-题号 | 题目 | 关键考点 | 推荐路径 |
|---|---|---|---|
| 2021A | 信号失真度分析仪 | THD 测量 ≤ -60 dB | E3 + `refs/matlab-example-thd-meter.md` |
| 2024B | 单相功率分析仪 | FFT + 功率因数 + 谐波分量 | E3 + 功率扩展 |
| 2015A | 频率特性测试仪 | 频响 Bode 图 | E3 + 扫频 |
| 2003E | 数字频率计 | 高精度频率（0.01 Hz）| E3 + 时间窗扩展 |

**实战详细见**：`refs/matlab-example-thd-meter.md`

---

## 5. 场景 E4：视觉处理 → 已迁出

视觉相关算法（摄像头标定 / 鱼眼校正 / 二值化 / 透视变换 / 中线提取 / 目标检测 / 模型部署到 KPU / NPU）由独立 **`auto-vision` skill** 承担。

调用方式：embedded-arch 在 CP-1.5 通过 Skill Handoff Contract（详见 `refs/contracts.md`）派给 auto-vision skill，其产物（`.h` / `.kmodel` / `.rknn`）由 embedded-alg 在 CP-2 消费。

本 skill 仅做控制、计算、底层驱动。

---

## 6. 场景 E5：自适应滤波（"未知噪声，要学着滤掉"）

> 电赛 2017E 经典题。固定滤波器（场景 2）不行的场景：噪声特征未知 / 时变 / 与信号频谱重叠时。

### A. 你需要准备什么数据

- **期望信号 d(n)**（含噪声）
- **参考信号 x(n)**（与噪声相关，但与有用信号无关）
- 滤波器阶数（典型 32-128）
- 步长 μ（控制收敛速度 vs 稳定性）

### B. 我会做什么

```python
mcp__matlab__evaluate_matlab_code(code="""
    %% LMS 自适应滤波（最经典）
    fs = 8000; t = (0:1/fs:1).';
    signal = sin(2*pi*100*t);                 % 100 Hz 有用信号
    noise_src = randn(size(t));               % 原始噪声源
    % 噪声经过未知通道到达麦克风
    noise_at_mic = filter([1 0.5 0.3], 1, noise_src);
    d = signal + 0.8 * noise_at_mic;          % 期望信号 = 信号 + 噪声
    x = noise_src;                            % 参考信号 = 原始噪声

    % LMS
    M = 32;                                   % 阶数
    mu = 0.01;                                % 步长
    w = zeros(M, 1);
    N = length(d);
    y = zeros(N, 1);
    e = zeros(N, 1);
    for n = M:N
        x_vec = x(n:-1:n-M+1);
        y(n) = w' * x_vec;                    % 输出 = 噪声估计
        e(n) = d(n) - y(n);                   % 误差 = 清洁信号估计
        w = w + mu * x_vec * e(n);            % 权重更新
    end

    figure;
    subplot(3,1,1); plot(t, d); title('原始（含噪）');
    subplot(3,1,2); plot(t, e); title('LMS 输出（去噪）');
    subplot(3,1,3); plot(t, signal); title('期望（无噪参考）');

    snr_before = 20*log10(rms(signal) / rms(noise_at_mic*0.8));
    snr_after  = 20*log10(rms(signal) / rms(e - signal));
    fprintf('改善 SNR: %.1f → %.1f dB\\n', snr_before, snr_after);

    save('lms_weights.mat', 'w', 'mu', 'M');
""")
```

### C. 你拿到什么

| 产物 | 用途 |
|---|---|
| LMS 权重 `w` (M×1) | 嵌入式权重初值（实时仍会更新）|
| 步长 μ / 阶数 M 配置 | MCU 端参数 |
| 收敛曲线 | 证据：算法多久达稳态 |
| 抑制比（dB） | 评分指标 |

### D. 怎么落到 MCU

**STM32 + CMSIS-DSP `arm_lms_f32`**（开箱即用）：

```c
/* app/dsp/lms_anc.c */
#include "arm_math.h"
#include "lms_init_weights.h"   /* 由 MATLAB 离线训练得到 */

#define LMS_TAPS  32
#define BLOCK_SIZE 32

static arm_lms_instance_f32 lms;
static float state[LMS_TAPS + BLOCK_SIZE - 1];
static float coeffs[LMS_TAPS] = LMS_INIT_FLAT_INIT;  /* 用 MATLAB 训练值做初值 */

void lms_init(void) {
    arm_lms_init_f32(&lms, LMS_TAPS, coeffs, state, 0.01f, BLOCK_SIZE);
}

/* 每 32 个样本调用一次 */
void lms_process(float *ref, float *desired, float *cleaned) {
    float y[BLOCK_SIZE];        /* 噪声估计 */
    arm_lms_f32(&lms, ref, desired, y, cleaned, BLOCK_SIZE);
}
```

### E. 历年赛题对应

| 年-题号 | 题目 | 关键考点 | 推荐路径 |
|---|---|---|---|
| 2017E | 自适应滤波器 | LMS / NLMS 实现 + 收敛速度 | E5 |
| 工程类 | 工频干扰抵消 | 50 Hz 参考 + LMS | E5 + E3 评分 |
| 通信类 | 信道均衡 | LMS + 训练序列 | E5 + E2 |

---

## 7. 场景 E6：Simscape Electrical 电路仿真（"先 PC 仿真再做硬件"）

> 适用模电 / 电源类题。**不直接生成 MCU 代码**，但能在硬件焊之前验证拓扑、参数、稳定性。
>
> **与外部 skill `multisim-spice` 的边界**：本场景 E6 面向系统级 / 控制链路 / 与 MATLAB 数据处理耦合的电路（需 Simscape 授权）。若只需纯电路级正确性验证（SPICE 网表 / 小信号 / 频响 / 瞬态 / 元件值），或要在 NI Multisim 出原理图，且无 MATLAB 授权，改走 `multisim-spice`（内置 ngspice，仅 Windows）。

### A. 你需要准备什么

- 电路拓扑（运放型号 / 电源拓扑 Buck/Boost / 滤波器结构）
- 元件参数（R/C/L 值 + 公差）
- 测试激励（DC 扫描 / 阶跃响应 / 频响 / 大信号瞬态）

### B. 我会做什么

```python
mcp__matlab__evaluate_matlab_code(code="""
    %% 二阶有源滤波器仿真（Sallen-Key 低通）
    % 在 Simulink 里拉拽电路；本脚本演示参数计算

    fc = 1000;          % 截止 1 kHz
    Q  = 0.707;         % Butterworth
    R1 = 10e3; R2 = 10e3;
    % fc = 1 / (2*pi*sqrt(R1*R2*C1*C2))
    % 设 C1 = C2 = C
    C = 1 / (2*pi*fc*sqrt(R1*R2));
    fprintf('设计：R1=%.1fk R2=%.1fk C=%.2f nF\\n', R1/1e3, R2/1e3, C*1e9);

    % 用 tf 仿频响（不用 Simscape 也行）
    H = tf([1], [R1*R2*C^2, (R1+R2)*C, 1]);
    bode(H, {2*pi*10, 2*pi*100e3}); grid on;

    % 注意：实际用 Simscape 时要考虑运放带宽限制、压摆率、噪声
""")
```

**Simulink + Simscape 用法**（手工建模，本 mode 只提示）：

```text
1. 打开 Simulink → 新建模型
2. 拖入 Simscape Electrical 库的 Op-Amp / R / C / Voltage Source
3. 连线 → 配置 Solver 为 ode23t (stiff)
4. 加 Spectrum Analyzer 看频响
5. PWM 控制器仿真：Simscape Electrical Specialized → DC-DC Converter
```

### C. 你拿到什么

| 产物 | 用途 |
|---|---|
| 元件参数计算公式（脚本）| 选型 |
| 频响 Bode 图 | 验证设计 |
| 大信号瞬态响应 | 评估稳定性 / 过冲 |
| 元件公差敏感性分析 | 选 1% / 5% / 10% 电阻的依据 |

### D. 怎么落到 MCU

**不直接落 MCU**。这个场景是**硬件设计辅助**：

- 算出 R/C/L 值 → BOM 表
- 验证频响 → 决定是否上板 PCB
- 关联场景：算控制器参数（数字补偿） → E1/E5

但是如果题目要求"数字补偿"（如 PFC 中的数字 PI 控制器），可以把 Simulink 仿真出的 PI 参数走场景 4 控制器设计路径。

### E. 历年赛题对应

| 年-题号 | 题目 | 关键考点 | 推荐路径 |
|---|---|---|---|
| 2019C | 线性放大器 | 频响 / 失真 / 稳定性 | E6 + E3 |
| 2017A | 微弱信号检测 | 前置放大器 + 滤波器 | E6 + E5 |
| 2023A | 电源类 | DC-DC 开关电源 | E6 Simscape Power |
| 2009B | DDS 信号源 | 上位机 + 电路 | E6 + E1 |

---

## 8. 场景 E7：电磁循迹信号处理（"用电感检测导线"）

> 电磁循迹经典场景。检测导线下方 20 kHz 交变电流的磁场。

### A. 你需要准备什么数据

- 几组实测电感采样数据（不同距离 / 角度 / 偏移）
- 电感配置：典型 4 路（左前 / 右前 / 左后 / 右后）或 7 路差分
- ADC 采样率（典型 100 kHz @ 20 kHz 载波 = 5 倍）

### B. 我会做什么

```python
mcp__matlab__evaluate_matlab_code(code="""
    %% 差比和算法（电磁循迹标准做法）
    % 假设有 7 路电感：L1 ~ L7（中心 L4）
    raw = readmatrix('emag_sweep.csv');     % t, L1..L7
    L1 = raw(:,2); L4 = raw(:,5); L7 = raw(:,8);

    % 1. 检波（包络）—— 同步采样多个周期算 RMS
    % 假设已经过预处理拿到 RMS 值
    L1_rms = abs(L1); L4_rms = abs(L4); L7_rms = abs(L7);

    % 2. 差比和（核心算法）
    err = (L1_rms - L7_rms) ./ (L1_rms + L7_rms + 1e-6);

    % 3. 归一化到 [-1, 1]
    err = max(min(err, 1), -1);

    % 4. 卡尔曼平滑（去高频抖动）
    Q = 0.01; R = 0.1;
    x_hat = 0; P = 1;
    err_filtered = zeros(size(err));
    for k = 1:length(err)
        % 预测
        P_pred = P + Q;
        % 更新
        K = P_pred / (P_pred + R);
        x_hat = x_hat + K * (err(k) - x_hat);
        P = (1 - K) * P_pred;
        err_filtered(k) = x_hat;
    end

    figure;
    plot(err, 'r-'); hold on; plot(err_filtered, 'b-', 'LineWidth', 1.5);
    legend('原始差比和', 'Kalman 平滑');
    title('电磁循迹偏差信号');
""")
```

### C. 你拿到什么

| 产物 | 用途 |
|---|---|
| 检波算法 `.m` | MCU 实时检波 |
| 差比和系数 | 通常固定 |
| 卡尔曼 Q/R | 平滑参数 |
| 偏差量 ∈ [-1, 1] | 喂给 PID 转向控制 |

### D. 怎么落到 MCU

```c
/* app/control/emag_track.c */
#include "drv_adc_emag.h"
#include <math.h>

#define N_INDUCTORS 7

static float kalman_x = 0.0f;
static float kalman_P = 1.0f;
static const float kalman_Q = 0.01f;
static const float kalman_R = 0.1f;

float emag_get_offset(void) {
    /* 1. 读 7 路电感 RMS（驱动层封装好） */
    float L[N_INDUCTORS];
    drv_adc_emag_read_rms(L);

    /* 2. 差比和（用最左和最右） */
    float err = (L[0] - L[6]) / (L[0] + L[6] + 1e-6f);
    if (err > 1.0f) err = 1.0f;
    if (err < -1.0f) err = -1.0f;

    /* 3. Kalman 平滑 */
    float P_pred = kalman_P + kalman_Q;
    float K = P_pred / (P_pred + kalman_R);
    kalman_x = kalman_x + K * (err - kalman_x);
    kalman_P = (1.0f - K) * P_pred;

    return kalman_x;
}
```

### E. 历年赛题对应

| 组别 | 关键考点 | 推荐路径 |
|---|---|---|
| 电磁组 | 7 路差分 + 差比和 | E7（完整流程） |
| 电磁三轮组 | 三轮稳定性 + 状态融合 | E7 + 场景 5 卡尔曼 |
| 直立 + 电磁循迹 | E7 + 直立姿态融合 | E7 + 场景 5 + LQR（refs/lqr-example-segway.md） |

---

## 9. 与主协议的衔接

### 9.1 与主线工具箱的关系

```
主线 modes/matlab-embedded-toolkit.md（10 场景）—— 算法门类组织
   │
   └── 当题目背景是"竞赛" → 切到 ↓

竞赛专题 modes/matlab-toolkit-competition.md（6 场景：E1-E3 + E5-E7）—— 赛题门类组织
   │
   └── 内部仍调用主线场景（如 E5 LMS 用主线场景 2 滤波器辅助）
```

### 9.2 与四文件磁盘记忆映射

| 触发场景 | 写入文件 | 关键段 |
|---|---|---|
| E1 DDS | `编辑清单.md` + `硬件资源表.md` | LUT 大小、DAC 引脚 / 时钟配置 |
| E2 调制解调 | `研究发现.md` | 调制方式 / 载频 / 调制度 |
| E3 仪表 | `编辑清单.md` | 测量算法 + 校准曲线 |
| E5 自适应 | `编辑清单.md` | LMS 初值 + μ / M |
| E6 Simscape | `研究发现.md` | 电路拓扑 + 元件值 + 仿真曲线 |
| E7 电磁 | `硬件资源表.md` + `编辑清单.md` | 电感分布 + 差比和系数 + Kalman 参数 |

### 9.3 与兄弟 skill 协作

| 场景 | 主要兄弟 skill |
|---|---|
| 全部 | `mcp__matlab__*` + `tools/export_gains_to_c.py` |
| E1 信号源 | `/build-cmake` + `/flash-openocd` 烧 DAC 程序 |
| E2 调制 | `/serial-monitor` 抓实测信号 + `mcp__matlab__*` 离线分析 |
| E3 仪表 | `/build-cmake` + `/serial-monitor` 验证 |
| E5 LMS | `mcp__matlab__*` 训练初值 + 嵌入式实时更新 |
| E6 电路 | 不落 MCU（除非 PWM 控制器） |
| E7 电磁 | `/serial-monitor` 录电感数据 + `mcp__matlab__*` 调参 |

### 9.4 一键流水线（结合 matlab-firmware-pipeline）

竞赛 E1-E3、E5、E7 都能直接接入 `modes/matlab-firmware-pipeline.md` 的 6 步流水线：

```
MATLAB 算（E1-E3 / E5 / E7） → .mat → .h → build → flash → monitor → 实测对比
```

E6 例外（不落 MCU，只到第 1 步）。

---

## 10. 入门示例索引（竞赛专题）

| 示例 | 文件 | 难度 | 适用赛题 |
|---|---|---|---|
| DDS 信号发生器 | `refs/matlab-example-dds-signal-gen.md` | ★★ | 电赛 2001A / 2005A |
| AM 调制度测量 | `refs/matlab-example-modem-am.md` | ★★ | 电赛 2022F |
| 失真度分析仪 | `refs/matlab-example-thd-meter.md` | ★★ | 电赛 2021A |

完整历年赛题映射见 **`refs/competition-index.md`**。
