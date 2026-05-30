# MATLAB 嵌入式工具箱模式（综合）

> 辅助型模式 — 不替代 RIPER-5，在任意阶段触发；结束后**返回触发前阶段**继续工作。
>
> 主用途：把 MATLAB 作为嵌入式开发的"数学副驾"，覆盖 8 大典型场景：信号采集与系统辨识 / 滤波器设计 / FFT 频谱分析 / 控制器设计 / 观测器与卡尔曼滤波 / 电机参数辨识 / 数据可视化与日志分析 / 定点化与查表生成。
>
> **设计目标**：对没接触过 MATLAB 的嵌入式新手友好。每个场景都告诉你"你需要准备什么数据、我会做什么、你拿到什么、怎么落到 MCU"。

---

## 0. 谁该读这个 mode

### 0.1 触发词

`MATLAB` / `Simulink` / `LQR` / `极点配置` / `pole placement` / `状态反馈` / `控制增益矩阵` / `K 矩阵` / `平衡车控制` / `倒立摆` / `MPC` / `LQG` / `卡尔曼滤波` / `Kalman filter` / `系统辨识` / `阶跃响应辨识` / `滤波器设计` / `FIR` / `IIR` / `低通` / `高通` / `带通` / `FFT` / `频谱分析` / `电机辨识` / `PMSM` / `直流电机` / `串口日志分析` / `CSV 可视化` / `波形分析` / `CAN 日志` / `定点化` / `查表生成` / `lookup table` / `定点 Q15`

### 0.2 决策树：你在 8 个场景里的哪一个？

```
我有一个嵌入式任务，需要数学帮助
│
├── 我有一段实测数据（CSV / 二进制 / CAN 日志），想看波形或找问题
│    → 场景 7：数据可视化与日志分析
│
├── 我录了"输入命令 + 系统响应"两列数据，想得到系统数学模型
│    → 场景 1：信号采集 + 系统辨识
│
├── 我的传感器信号有噪声 / 抖动 / 工频干扰
│    │
│    ├── 我知道要去哪个频段 → 场景 2：数字滤波器设计
│    └── 我不知道噪声在哪个频段 → 先 场景 3：FFT 分析 → 再 场景 2
│
├── 我要算 PID / LQR / 极点 / MPC 参数
│    → 场景 4：控制器设计
│
├── 我的状态不能全部直接测，需要"估计"出来（如位置估计、姿态融合）
│    → 场景 5：观测器与卡尔曼滤波
│
├── 我要调电机控制（FOC / 矢量控制），需要电机参数 Rs / Ld / Lq / Ψf / J
│    → 场景 6：电机参数辨识
│
├── 我的算法用 float 写好了，要移植到没有 FPU 的 MCU 上
│    → 场景 8：定点化与查表生成
│
├── 我已经有 Simulink .slx 模型，要自动生成 C 代码烧到 MCU
│    → 场景 9：Simulink + Embedded Coder
│
├── 我担心仿真对了上板不对，要做三层验证
│    → 场景 10：MIL / SIL / PIL 验证链
│
└── 我在打电赛，要按"赛题门类"组织而不是"算法门类"
     → `modes/matlab-toolkit-competition.md`（7 个竞赛专项场景 E1-E7）
        + `refs/competition-index.md`（历年赛题索引）
```

**用户不清楚时**：直接描述任务和已有数据，AI 助手按上述树落到具体场景。

### 0.3 每场景共用的"四段式"

每个场景都按下面四段写，确保新手不迷路：

```
A. 你需要准备什么数据      ← 数据采集前看
B. 我会做什么              ← 决策门，明确我的产出
C. 你拿到什么              ← 产物清单
D. 怎么落到 MCU            ← C 集成代码模板
```

---

## 1. 通用前置：环境与数据采集

### 1.1 检测 MATLAB 工具箱（每次触发本 mode 必跑）

```python
mcp__matlab__detect_matlab_toolboxes()
```

**最小依赖**（任何场景都要）：MATLAB Base。

**各场景额外需要**：

| 场景 | 必需 toolbox | 缺装替代方案 |
|---|---|---|
| 1 系统辨识 | System Identification Toolbox | python-control + scipy.signal |
| 2 滤波器设计 | Signal Processing Toolbox / DSP System Toolbox | scipy.signal |
| 3 FFT 分析 | Signal Processing Toolbox | numpy.fft |
| 4 控制器设计 | Control System Toolbox | python-control |
| 5 卡尔曼滤波 | Control System Toolbox（基本）/ Sensor Fusion and Tracking Toolbox（高级） | filterpy |
| 6 电机辨识 | Motor Control Blockset | 手工辨识脚本 |
| 7 日志分析 | Base + Vehicle Network Toolbox（CAN） | Python + pandas + cantools |
| 8 定点化 | Fixed-Point Designer | numpy fixed-point 手算 |

**降级原则**：缺 toolbox 时切换到 Python 等价物，本 mode 流程不变；告知用户后继续。

### 1.2 通用：MCU 端如何把数据传到 PC

最常见的两种方式，按需求选：

**方式 A：UART 串口 CSV 流（最简单）**

```c
/* MCU 端 — 每个控制周期发一行 CSV */
#include "hal_uart.h"
#include <stdio.h>

void log_one_sample(uint32_t t_ms, float u, float y)
{
    char buf[64];
    int n = snprintf(buf, sizeof(buf), "%lu,%.4f,%.4f\n", t_ms, u, y);
    hal_uart_write(LOG_UART, (uint8_t *)buf, n, 10);
}
```

PC 端用串口助手或 Python 抓 30 秒，存成 `data.csv`。

**方式 B：二进制流（高频采样用）**

```c
/* MCU 端 — 二进制帧，省带宽 */
typedef struct __attribute__((packed)) {
    uint32_t t_ms;
    float    u;
    float    y;
} log_frame_t;

void log_one_sample_bin(uint32_t t_ms, float u, float y)
{
    log_frame_t f = { t_ms, u, y };
    hal_uart_write(LOG_UART, (uint8_t *)&f, sizeof(f), 10);
}
```

PC 端：

```matlab
fid = fopen('data.bin', 'r');
data = fread(fid, [3, inf], '*single')';  % 转置成 N x 3
fclose(fid);
t = double(data(:,1));
u = data(:,2);
y = data(:,3);
```

**采样率建议**：

- 阶跃响应辨识：10–100 Hz（看时间常数，记录 5–10 倍时间常数长度）
- 滤波器设计 / FFT：至少为关心信号最高频率的 4 倍（实际是 Nyquist 的 2 倍）
- 控制回路：与你的控制周期一致

---

## 2. 场景 1：信号采集 + 系统辨识（"我有数据，要模型"）

### A. 你需要准备什么数据

- **一段时间序列**：列为 `时间(秒) / 输入(u) / 输出(y)` 三列 CSV
- **激励要"有信息量"**：
  - 阶跃响应（最简单，新手优先）：t<0 时 u=0，t≥0 时 u=u0（常值）
  - PRBS / 扫频（chirp）：辨识高阶模型更准，但需 MCU 端能生成
- **录制时长**：至少 5 倍预期时间常数（不知道就先录 10 秒）
- **数据量**：≥ 500 个样本

### B. 我会做什么

```python
mcp__matlab__evaluate_matlab_code(code="""
    % 1. 读数据
    raw = readmatrix('data.csv');     % t, u, y
    t = raw(:,1); u = raw(:,2); y = raw(:,3);
    Ts = mean(diff(t));               % 自动算采样周期

    % 2. 构造辨识对象（去趋势可选）
    data = iddata(y, u, Ts);
    data = detrend(data);             % 去常值偏移

    % 3. 一阶模型估计（最简单，适合温度/转速等）
    sys1 = procest(data, 'P1');
    % 或二阶含零点：sys2 = procest(data, 'P2Z');
    % 或任意阶状态空间：sys_ss = ssest(data, 2);  % 二阶状态空间

    % 4. 验证拟合度
    [y_est, fit_pct] = compare(data, sys1);
    fprintf('一阶模型拟合度: %.1f%%\\n', fit_pct);

    % 5. 输出参数（K=增益、T=时间常数、Td=死区时间）
    [K, T, Td] = procest_to_simple(sys1);  % 自定义辅助函数
""")
```

### C. 你拿到什么

- **简单模型参数**：`G(s) = K / (T*s + 1) * exp(-Td*s)`，三个数：K / T / Td
- **状态空间矩阵**：A / B / C / D（场景 4/5 输入）
- **拟合度**：> 80% 一般够用，< 60% 重新录数据（激励不够 / 噪声太大 / 系统非线性）

### D. 怎么落到 MCU

- 时间常数 T 决定**控制周期上限**：Ts ≤ T/10
- 增益 K 决定**前馈系数**：u_ff = r / K（如果做前馈+反馈）
- 模型直接喂给**场景 4 控制器设计**

---

## 3. 场景 2：数字滤波器设计（"我有噪声，要干净信号"）

### A. 你需要准备什么数据

- **采样率 fs**（Hz）— 通常等于你 ADC 中断频率
- **截止频率 fc**（Hz）— 要保留的最高频率
- **类型**：低通 / 高通 / 带通 / 带阻
- **阶次**：FIR 通常 16–64，IIR 通常 2–6
- 可选：通带纹波 / 阻带衰减（专业要求）

### B. 我会做什么

**IIR（计算量小，嵌入式首选）**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    fs = 1000;       % 采样率 1 kHz
    fc = 50;         % 截止 50 Hz
    order = 4;       % 4 阶 Butterworth
    [b, a] = butter(order, fc/(fs/2), 'low');
    % 显示频响
    freqz(b, a, 1024, fs);
    % 输出二阶节（数值稳定，强烈推荐）
    sos = tf2sos(b, a);
    save('lpf_sos.mat', 'sos');
""")
```

**FIR（线性相位，无失真）**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    fs = 8000;
    fc = 2000;
    N  = 32;                        % 32 阶
    b = fir1(N-1, fc/(fs/2), 'low');
    save('fir_coeffs.mat', 'b');
""")
```

### C. 你拿到什么

- **IIR**：`sos.mat`（二阶节矩阵 N×6）
- **FIR**：`fir_coeffs.mat`（系数向量长度 N）
- 频响图（确认衰减满足要求）

### D. 怎么落到 MCU

用本 skill 自带导出器：

```bash
python "C:\Users\A\.claude\skills\embedded-dev\tools\export_gains_to_c.py" ^
    --input fir_coeffs.mat --mat-var b ^
    --output app\dsp\fir_lpf.h --name FIR_LPF --type float
```

C 端用 CMSIS-DSP：

```c
#include "fir_lpf.h"
#include "arm_math.h"

#define BLOCK_SIZE  32
static float fir_state[FIR_LPF_COLS + BLOCK_SIZE - 1];
static float fir_taps[FIR_LPF_COLS] = { FIR_LPF_FLAT_INIT };
static arm_fir_instance_f32 fir;

void dsp_init(void) {
    arm_fir_init_f32(&fir, FIR_LPF_COLS, fir_taps, fir_state, BLOCK_SIZE);
}

void dsp_process(float *in, float *out) {
    arm_fir_f32(&fir, in, out, BLOCK_SIZE);
}
```

IIR 用 `arm_biquad_cascade_df1_f32`。

---

## 4. 场景 3：FFT 频谱分析（"我不知道噪声在哪个频段"）

### A. 你需要准备什么数据

- **一段稳态时域信号** CSV（一列即可）
- **采样率 fs**
- 信号长度建议 ≥ 1024 点（2 的幂最快）

### B. 我会做什么

```python
mcp__matlab__evaluate_matlab_code(code="""
    data = readmatrix('signal.csv');
    fs   = 1000;
    x    = data(:);
    N    = length(x);

    % 单边幅频谱
    X    = fft(x);
    P2   = abs(X/N);
    P1   = P2(1:N/2+1);
    P1(2:end-1) = 2*P1(2:end-1);
    f    = fs*(0:(N/2))/N;

    figure;
    plot(f, P1);
    title('幅频谱');
    xlabel('频率 Hz');
    ylabel('幅值');

    % 找前 3 个主导频率
    [pks, locs] = findpeaks(P1, 'SortStr', 'descend', 'NPeaks', 3);
    fprintf('主导频率：%.1f Hz, %.1f Hz, %.1f Hz\\n', f(locs));
""")
```

### C. 你拿到什么

- **幅频谱图**（plot 显示在 MATLAB UI）
- **3 个最大噪声频率**
- 决策依据：是 50 Hz 工频？开关电源 PWM 谐波？机械共振？

### D. 怎么落到 MCU

不直接落 MCU，但**指导场景 2 的滤波器截止频率**：

- 找到噪声频率 fn → 低通滤波器截止设为 fn 之下
- 找到要保留信号的最高频 fmax → 截止设为 fmax 的 1.5 倍

---

## 5. 场景 4：控制器设计（"我要算 PID/LQR/极点参数"）

### A. 你需要准备什么数据

按方法分类：

| 方法 | 需要数据 | 适合谁 |
|---|---|---|
| **PID 自整定** | 阶跃响应 CSV 或被控对象传函 | 新手最友好 |
| **LQR** | 状态空间 A/B 矩阵 + Q/R 加权 | 多变量耦合系统 |
| **极点配置** | A/B 矩阵 + 期望极点 | 想精确指定瞬态响应 |
| **MPC** | A/B + 状态/输入约束 | 有硬约束（饱和） |

**新手路径**：场景 1 阶跃响应 → 一阶模型 K/T/Td → PID 自整定 → MCU 部署。

### B. 我会做什么（PID 自整定为例，最简单）

```python
mcp__matlab__evaluate_matlab_code(code="""
    % 假设场景 1 已得到一阶模型
    K  = 1.5; T = 0.8; Td = 0.05;
    G  = tf(K, [T 1], 'OutputDelay', Td);

    % pidtune 自动整定
    [C, info] = pidtune(G, 'PID');
    fprintf('Kp = %.4f\\n', C.Kp);
    fprintf('Ki = %.4f\\n', C.Ki);
    fprintf('Kd = %.4f\\n', C.Kd);
    fprintf('相位裕度 = %.1f deg\\n', info.PhaseMargin);
    fprintf('闭环带宽 = %.2f Hz\\n', info.CrossoverFrequency/2/pi);

    % 仿真验证
    sys_cl = feedback(C*G, 1);
    step(sys_cl); grid on; title('闭环阶跃响应');
""")
```

LQR / 极点配置 / MPC 完整流程见 **`refs/lqr-example-segway.md`**。

### C. 你拿到什么

- **PID**：`Kp / Ki / Kd` 三个数 + 闭环带宽
- **LQR**：K 矩阵（`m × n`，m=输入数、n=状态数）
- **极点配置**：K 矩阵
- **MPC**：QP 求解器配置（嵌入式部署较复杂，本 mode 仅给出离线设计）

### D. 怎么落到 MCU

**PID 模板**（最常见）：

```c
typedef struct {
    float Kp, Ki, Kd;
    float i_acc;            /* 积分累加器 */
    float e_prev;           /* 上一次误差 */
    float i_max;            /* 抗积分饱和上限 */
    float u_max, u_min;     /* 输出饱和 */
} pid_t;

float pid_step(pid_t *c, float ref, float meas, float Ts)
{
    float e = ref - meas;
    float p = c->Kp * e;
    c->i_acc += c->Ki * e * Ts;
    if      (c->i_acc >  c->i_max) c->i_acc =  c->i_max;
    else if (c->i_acc < -c->i_max) c->i_acc = -c->i_max;
    float d = c->Kd * (e - c->e_prev) / Ts;
    c->e_prev = e;
    float u = p + c->i_acc + d;
    if      (u > c->u_max) u = c->u_max;
    else if (u < c->u_min) u = c->u_min;
    return u;
}
```

**LQR 模板**：见 `tools/export_gains_to_c.py --with-cmsis-template`。

---

## 6. 场景 5：观测器 / 卡尔曼滤波（"我估不到状态"）

### A. 你需要准备什么数据

- A / B / C / D 矩阵（来自场景 1 或物理建模）
- **过程噪声协方差 Q**（多大置信你的模型）
- **测量噪声协方差 R**（多大置信你的传感器）

**新手起点**：Q = 0.01 × I、R = 1 × I（按经验，后续调）。

### B. 我会做什么

**线性 Kalman（最简单）**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    A = [...]; B = [...]; C = [...]; D = 0;
    sys = ss(A, B, C, D);
    Q = 0.01 * eye(size(A,1));   % 过程噪声协方差
    R = 1.0;                      % 测量噪声协方差
    [kalmf, L, P] = kalman(sys, Q, R);
    fprintf('观测器增益 L:\\n');
    disp(L);
    save('kalman_L.mat', 'L');
""")
```

**EKF / UKF**：非线性系统，需手动写预测/更新方程，本 mode 提供模板但不展开。

### C. 你拿到什么

- **观测器增益 L**（`n × p`，n=状态、p=测量数）
- **稳态协方差 P**（可选，用于自适应卡尔曼）

### D. 怎么落到 MCU

```c
/* 离散 Kalman：每个采样周期跑一次 */
#include "kalman_l.h"   /* L[STATE_DIM][MEAS_DIM] */

static float x_hat[STATE_DIM] = {0};

void kalman_step(float u, float y_meas, float Ts)
{
    /* 1. 预测 x_pred = A * x_hat + B * u */
    float x_pred[STATE_DIM];
    /* ... 离散 Ad / Bd 矩阵乘 ... */

    /* 2. 创新 y_innov = y_meas - C * x_pred */
    float y_innov = y_meas;
    for (int i = 0; i < STATE_DIM; i++)
        y_innov -= C_DATA[0][i] * x_pred[i];

    /* 3. 修正 x_hat = x_pred + L * y_innov */
    for (int i = 0; i < STATE_DIM; i++)
        x_hat[i] = x_pred[i] + KALMAN_L_DATA[i][0] * y_innov;
}
```

---

## 7. 场景 6：电机参数辨识（"我要 FOC 控制电机"）

### A. 你需要准备什么数据

- 电机三相电流（Ia / Ib / Ic）实测时序
- 母线电压 Vdc
- 转子位置（编码器或 Hall）
- 命令电压（Vd / Vq）
- 工况：堵转 / 空载旋转 / 加载

### B. 我会做什么

```python
# 简化版 — 不依赖 Motor Control Blockset
mcp__matlab__evaluate_matlab_code(code="""
    raw = readmatrix('motor_test.csv');
    % 列：t, Vd, Vq, Id, Iq, omega_e
    t      = raw(:,1);
    Vd     = raw(:,2); Vq = raw(:,3);
    Id     = raw(:,4); Iq = raw(:,5);
    omega  = raw(:,6);

    % 堵转段（omega ≈ 0）估 Rs
    idx_dc = abs(omega) < 0.1;
    Rs = mean(Vd(idx_dc) ./ Id(idx_dc));

    % 阶跃响应段估 Ld、Lq（电流上升时间）
    % 系统辨识通用流程见 refs/matlab-example-step-id.md（阶跃辨识）
    fprintf('Rs ≈ %.4f Ω\\n', Rs);
""")
```

**生产级**用 Motor Control Blockset Parameter Estimator app。

### C. 你拿到什么

- **Rs**：定子电阻
- **Ld / Lq**：直/交轴电感
- **Ψf**：永磁磁链
- **J**：转动惯量
- **B**：粘滞摩擦系数

### D. 怎么落到 MCU

```c
/* foc_params.h — 由 export_gains_to_c.py 生成 */
#define MOTOR_RS    0.45f       /* Ω */
#define MOTOR_LD    1.2e-3f     /* H */
#define MOTOR_LQ    1.5e-3f     /* H */
#define MOTOR_PSI_F 0.012f      /* Wb */
#define MOTOR_POLE_PAIRS  4
```

电流环 PID 参数据此参数推：`Kp_iq = Lq * 2*pi*BW_i`、`Ki_iq = Rs * 2*pi*BW_i`。

---

## 8. 场景 7：数据可视化 / 日志分析（"我有一堆数据，先看一眼"）

### A. 你需要准备什么数据

- **CSV / TSV / TXT** 文本日志（每行一条）
- 或 **.mat** / **.bin** / **.blf**（CAN）/ **.mdf**（汽车）二进制
- 关键列说明：时间列、信号列分别在第几列

### B. 我会做什么

```python
mcp__matlab__evaluate_matlab_code(code="""
    data = readmatrix('serial_log.csv');
    t = data(:,1); ref = data(:,2); meas = data(:,3); u = data(:,4);

    % 多子图布局
    figure;
    subplot(2,1,1);
    plot(t, ref, 'r--', t, meas, 'b-', 'LineWidth', 1.5);
    legend('参考', '实测'); ylabel('位置 (m)'); grid on;
    title('闭环响应');

    subplot(2,1,2);
    plot(t, u, 'k-'); ylabel('控制信号 (V)'); xlabel('时间 (s)'); grid on;

    % 关键指标
    overshoot = (max(meas) - ref(end)) / ref(end) * 100;
    settle    = find(abs(meas - ref(end)) < 0.02 * ref(end), 1, 'last');
    fprintf('超调: %.1f%%\\n', overshoot);
    fprintf('调节时间: %.2f s\\n', t(settle));
""")
```

**CAN 日志（.blf）**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    db = canDatabase('vehicle.dbc');
    log = blfread('drive.blf', db);
    speed_msg = log(log.Name == 'VehicleSpeed', :);
    plot(speed_msg.Time, speed_msg.Signals.speed);
""")
```

### C. 你拿到什么

- **可视化图表**（MATLAB UI 显示）
- **关键指标**：超调 / 调节时间 / 稳态误差 / 最大值
- **异常段位**（如丢帧、跳变）

### D. 怎么落到 MCU

不直接落 MCU；但分析结果**指导调参**或**触发场景 1/2/3/4**进入下一轮。

---

## 9. 场景 8：定点化 / 查表生成（"我要把 float 算法搬到没 FPU 的 MCU"）

### A. 你需要准备什么数据

- 你的浮点算法（公式 / .m 脚本）
- 各变量的**数值范围**（max / min）
- 目标定点格式：Q15（16 位）/ Q31（32 位）/ Qm.n 自定义

### B. 我会做什么

**查表生成（最常用）**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    % sin 查表，0~2π 范围，1024 点
    N = 1024;
    theta = linspace(0, 2*pi, N+1);
    theta = theta(1:end-1);
    sin_table = sin(theta);

    % 转 Q15
    sin_q15 = int16(round(sin_table * 32767));

    % 保存为 .mat
    save('sin_table.mat', 'sin_q15');

    fprintf('查表 %d 点，max=%d, min=%d\\n', N, max(sin_q15), min(sin_q15));
""")
```

**定点化分析**（推荐 Fixed-Point Designer）：

```python
mcp__matlab__evaluate_matlab_code(code="""
    % 浮点版本
    function y = my_filter_float(x, b, a)
        y = filter(b, a, x);
    end
    % 用 fi() 数据类型自动分析范围
    x_fi = fi(x, 1, 16, 15);  % 1 符号位、16 位、15 小数位
    y_fi = filter(fi(b,1,16,15), fi(a,1,16,15), x_fi);
    % 查看溢出统计
    info = fipref;
""")
```

### C. 你拿到什么

- **查表数组**（.mat / .npy）
- **定点参数**：每个变量的 Qm.n 格式
- **数值精度损失评估**：定点 vs 浮点输出 RMSE

### D. 怎么落到 MCU

```bash
python "C:\Users\A\.claude\skills\embedded-dev\tools\export_gains_to_c.py" ^
    --input sin_table.mat --mat-var sin_q15 ^
    --output app\dsp\sin_table.h --name SIN_TABLE --type fixed_q15
```

C 端用法：

```c
#include "sin_table.h"

q15_t sin_lookup(uint32_t phase)
{
    /* phase: 0..0xFFFFFFFF 对应 0..2π */
    uint32_t idx = phase >> 22;            /* 取高 10 bit = 1024 索引 */
    return SIN_TABLE_DATA[0][idx];
}
```

---

## 9b. 场景 9：Simulink + Embedded Coder（"我有 .slx 模型，要自动生成 C 代码"）

> 量产团队最常用的路径。前 8 场景都是"手工 `.m` 算系数 + `export_gains_to_c.py` 出 `.h`"；本场景是另一条线：**用 Simulink 建模 → `slbuild` 一键生成可烧录的 C 代码工程**。

### A. 你需要准备什么

- 一份 Simulink 模型 `.slx`（或本 mode 帮你建）
- Embedded Coder License（必需）+ Simulink Coder（必需）
- 目标 MCU 信息：内核（Cortex-M4/M7/M0+）、字长、是否有 FPU
- 工程目标语言：C 或 C++

### B. 我会做什么

**步骤 1 — 模型预检**：

```python
mcp__matlab__evaluate_matlab_code(code="""
    mdl = 'bicycle_lqr_controller';
    open_system(mdl);

    % 检查能否生成 ERT 代码
    set_param(mdl, 'SystemTargetFile', 'ert.tlc');   % Embedded Real-Time target
    set_param(mdl, 'TargetLang', 'C');
    set_param(mdl, 'GenCodeOnly', 'on');             % 只生成代码，不编译

    % 定点 / 浮点
    set_param(mdl, 'DefaultUnderspecifiedDataType', 'single');   % float32

    % 函数原型控制（关键：让生成的 C 函数命名与你 BSP 对齐）
    set_param(mdl, 'CodeInterfacePackaging', 'Nonreusable function');
    set_param(mdl, 'GenerateAllocFcn', 'off');

    % 生成代码
    slbuild(mdl);

    % 检查生成报告
    rpt = fullfile(pwd, [mdl '_ert_rtw'], 'html', [mdl '_codegen_rpt.html']);
    fprintf('代码生成报告: %s\\n', rpt);
""")
```

**步骤 2 — 关键设置清单（按嵌入式优化必须改的）**：

| 设置 | 默认值 | 推荐值 | 原因 |
|---|---|---|---|
| `SystemTargetFile` | grt.tlc（通用） | **ert.tlc** | ERT 才能去掉仿真桩，生成纯净嵌入式 C |
| `OptimizationLevel` | level1 | **level3** | 完整优化（pass-by-pointer、消死代码、内联） |
| `MemcpyThreshold` | 64 字节 | **8 字节** | 小数组也用 memcpy 替代循环 |
| `MultiInstanceErrorCode` | 默认 | **None** | 单实例工程减运行时检查 |
| `RTWInlineParameters` | off | **on** | 把可调参数硬编进代码而不是 RAM 表 |
| `ConvertIfToSwitch` | off | **on** | 离散状态机用 switch 加速 |
| `EnableMemcpy` | on | **on** | 大块拷贝走库函数 |
| `BlockReductionOpt` | on | **on** | 消去 unity gain、单位转换等无用块 |

**步骤 3 — 函数原型对齐**（让生成的 C 与你 BSP 的命名一致）：

```matlab
% 用 Code Mappings Editor 改函数原型
mapping = coder.mapping.api.get(mdl);
coder.mapping.api.set(mapping, 'Step', 'FunctionName', 'controller_step');
coder.mapping.api.set(mapping, 'Initialize', 'FunctionName', 'controller_init');

% 改全局变量命名
coder.mapping.api.set(mapping, 'InputPort', 'StorageClass', 'ExportedGlobal');
coder.mapping.api.set(mapping, 'OutputPort', 'StorageClass', 'ExportedGlobal');
```

### C. 你拿到什么

生成目录结构（典型）：

```
<workspace>/
├── bicycle_lqr_controller_ert_rtw/
│   ├── bicycle_lqr_controller.c       ← 主算法，纯 C，无依赖
│   ├── bicycle_lqr_controller.h
│   ├── bicycle_lqr_controller_types.h
│   ├── rtwtypes.h                     ← real_T / int32_T 等类型别名
│   └── html/
│       └── bicycle_lqr_controller_codegen_rpt.html   ← 必读！
```

`codegen_rpt.html` 里要看的 3 个标签页：

| 标签页 | 看什么 | 红线 |
|---|---|---|
| **Code Interface Report** | 函数原型、IO 变量、全局变量 | 函数命名不对齐 → 改 mapping |
| **Static Code Metrics** | RAM/Flash 占用、复杂度、嵌套深度 | 单函数 RAM > MCU 上限 / 复杂度 > 10 |
| **Tracebility Report** | C 行号 ↔ 模型块的双向链接 | 调试时点开看是哪个 Simulink 块出问题 |

### D. 怎么落到 MCU

**方案 1：直接复制到工程**

```bash
# 把生成的代码拷到 app/control/
cp bicycle_lqr_controller_ert_rtw/*.c app/control/
cp bicycle_lqr_controller_ert_rtw/*.h app/control/
```

主调用：

```c
/* main.c — 应用层只调生成函数，不直接 include 厂商头 */
#include "bicycle_lqr_controller.h"

int main(void) {
    bsp_init();
    controller_init();              /* 由 Simulink 生成 */
    while (1) {
        ext_input  = drv_read();    /* 通过 ExportedGlobal */
        controller_step();
        drv_write(ext_output);
    }
}
```

**方案 2：与 BSP 解耦（推荐生产用）**

用 Simulink 的 Code Replacement Library（CRL）把 `controller_step` 内部的 `sin()` / `cos()` / `arm_mat_mult` 替换成你 BSP 已有的版本，避免重复实现：

```matlab
% 注册 CRL（一次性）
crl = RTW.TflTable;
addEntry(crl, 'sin', 'arm_sin_f32');    % CMSIS-DSP 加速版
% 在模型属性里启用：'CodeReplacementLibrary' = 'YourCRL'
```

### 选型门：什么时候用 Simulink，什么时候手写 `.m`

```
用 Simulink + Embedded Coder（场景 9）：
  ✓ 已有 .slx 模型库（或团队/客户用它）
  ✓ 算法 > 50 行 C，含多个状态机 / Bus 信号 / 调度器
  ✓ 客户要求模型驱动交付（ISO 26262 / DO-178C / IEC 61508）
  ✓ 团队懂 Simulink，调试用 Tracebility 跳回模型
  ✓ 需要后续做 MIL/SIL/PIL 验证（场景 10）— Simulink 原生支持

用手写 .m + export_gains_to_c.py（场景 1-8）：
  ✓ 只算一次系数（一组 LQR K / 一组滤波器 b/a）
  ✓ 团队不熟 Simulink，不想引入学习成本
  ✓ 需要快速迭代调参（Simulink 启动慢）
  ✓ 没有 Embedded Coder license
  ✓ 算法用 C 写更自然（如位操作、状态机用 switch）
```

**典型项目混用**：底层 BSP 用 C 手写；上层控制算法用 Simulink 生成；Q/R 等可调参数用 `export_gains_to_c.py` 单独导出。

### 失败处置

| 失败 | failure_category | 处置 |
|---|---|---|
| `slbuild` 报 license 错 | `environment-missing` | 检查 Embedded Coder + Simulink Coder license |
| 生成代码含 `error()` / `printf()` 调用 | `project-config-error` | `SystemTargetFile` 没改成 `ert.tlc`；改后重新生成 |
| 代码包含 malloc | `project-config-error` | 关 `GenerateAllocFcn`、把 `MemSecFunc` 改 default |
| Flash 超限 | `target-response-abnormal` | 提高 `OptimizationLevel`、用 CRL 替换重函数 |
| 仿真对、上板错 | 进入场景 10（MIL/SIL/PIL） | 先做 SIL 定位是模型问题还是代码生成问题 |

---

## 9c. 场景 10：MIL / SIL / PIL 验证链（"仿真对了，上板就对吗？"）

> 控制算法上板前最容易踩的坑：**MATLAB 算的对、Simulink 生成的 C 对、MCU 上跑的对，三层是否一致？**
>
> 三级验证链是 MathWorks 工具链最贵的能力之一，每一级用相同测试用例，逐级排查 bug。

### 三层定义

```
MIL (Model-in-the-Loop)
  ├ 在 Simulink 内跑模型，用浮点
  ├ 输入：测试用例（.mat 或 .csv）
  ├ 输出：参考行为（reference output）
  └ 用途：确认算法本身对
       ↓
SIL (Software-in-the-Loop)
  ├ Embedded Coder 生成 C → 编译到主机（PC）
  ├ Simulink 跑同一测试用例，但内部调生成的 C 而不是模型
  ├ 输出：与 MIL 对比
  └ 用途：确认代码生成正确（定点截断 / 优化没改变行为）
       ↓
PIL (Processor-in-the-Loop)
  ├ Embedded Coder 生成 C → 交叉编译到目标 MCU
  ├ Simulink 通过串口/JTAG 把输入推到 MCU、读回输出
  ├ 输出：与 MIL/SIL 对比
  └ 用途：确认 MCU 上跑的与桌面一致（定点溢出 / 编译器差异）
```

### A. 你需要准备什么

- Simulink 模型 `.slx`
- 一组测试用例 `.mat`（输入信号 + 期望输出）
- 目标 MCU 的工具链（gcc-arm-none-eabi 等）
- 误差判定阈值：浮点 1e-6、Q15 定点 ±2 个 LSB

### B. 我会做什么（三步走）

**MIL — 跑参考行为**：

```matlab
mdl = 'bicycle_lqr_controller';
testdata = load('test_inputs.mat');

% 把测试输入放进模型
simIn = Simulink.SimulationInput(mdl);
simIn = simIn.setExternalInput(testdata.u);
simOut = sim(simIn);

mil_output = simOut.yout;
save('mil_ref.mat', 'mil_output');
fprintf('MIL 参考已生成\n');
```

**SIL — 生成 C 在桌面跑**：

```matlab
% 切到 SIL 模式
set_param(mdl, 'SimulationMode', 'Software-in-the-Loop (SIL)');
simOut = sim(simIn);          % Simulink 内部会自动编译生成的 C
sil_output = simOut.yout;

% 对比
diff = max(abs(mil_output - sil_output));
fprintf('SIL vs MIL 最大误差: %.3e\n', diff);
assert(diff < 1e-6, 'SIL 与 MIL 不一致！代码生成有问题');
```

**PIL — 编译到目标 MCU 跑**：

```matlab
% 必须先配好目标工具链（一次性）
% Hardware Implementation → Hardware board: 你的 STM32 / TI / NXP

set_param(mdl, 'SimulationMode', 'Processor-in-the-Loop (PIL)');
simOut = sim(simIn);          % 自动交叉编译、下载、串口通讯
pil_output = simOut.yout;

diff = max(abs(mil_output - pil_output));
fprintf('PIL vs MIL 最大误差: %.3e\n', diff);
if diff < 1e-6
    fprintf('PIL 通过 — 桌面 → MCU 行为一致\n');
elseif diff < 1e-3
    fprintf('PIL 警告 — 误差大于浮点精度，疑似定点截断\n');
else
    fprintf('PIL 失败 — MCU 行为与模型偏差大\n');
end
```

### C. 你拿到什么

| 产物 | 文件 | 用途 |
|---|---|---|
| MIL 参考输出 | `mil_ref.mat` | 黄金标准（永远是对的，因为是设计者意图） |
| SIL 输出 | `sil_output.mat` | 验证代码生成器没引入 bug |
| PIL 输出 | `pil_output.mat` | 验证 MCU 上跑没引入 bug |
| 误差报告 | 表格（max / mean / std） | 三层一致性证据 |
| Tracebility 链接 | html 报告 | 发现偏差时点击直接跳回 Simulink 块 |

### D. 怎么落到 MCU（与现有 RIPER-5 集成）

每一级测试都按 `refs/contracts.md` 的 Command Outcome Schema 返回：

```yaml
# MIL 通过
status: success
summary: MIL 测试通过，参考输出已保存
evidence:
  - test_cases: 15
  - max_output: 12.34
  - reference: mil_ref.mat
next_action: SIL

# SIL 失败
status: failure
summary: SIL 输出与 MIL 偏差 5%，超过阈值 1e-6
evidence:
  - mil_max: 12.34
  - sil_max: 11.78
  - diff_at_t: 2.5s（点击 tracebility 跳到模型块 Saturation1）
failure_category: project-config-error
next_action: 检查模型块 Saturation1 定点配置
```

### 三层失败定位矩阵

| MIL | SIL | PIL | 结论 | 修复方向 |
|---|---|---|---|---|
| ✓ | ✓ | ✓ | 全通 | 上板部署 |
| ✓ | ✗ | — | 代码生成问题 | 改 `ert.tlc` 设置 / 定点配置 / CRL |
| ✓ | ✓ | ✗ | MCU 平台问题 | 检查 endian / 字长 / FPU 配置 / 编译选项 |
| ✗ | — | — | 模型本身错 | 回 Simulink 改算法 |
| ✓ | ✓ (浮点对) | ✗ (定点偏差大) | 定点溢出 | 用 Fixed-Point Designer 重设范围 |

### 阈值经验值

| 算法类型 | MIL/SIL 阈值 | SIL/PIL 阈值 | 备注 |
|---|---|---|---|
| 纯浮点滤波器 | 1e-12 | 1e-6 | 浮点编译器差异 |
| 定点 Q15 滤波器 | 0 | 2 LSB | 编译器对截断方向可能差异 |
| LQR / PID | 1e-9 | 1e-3 | 累积误差 |
| 状态机 | 必须完全相等 | 必须完全相等 | 状态切换不允许差 |
| FFT 频谱 | 1e-6 | 1e-3 | 蝶形运算累积 |

**禁止**：以"差不多嘛、能跑就行"放过 PIL 失败。三层一致是量产必要条件，否则上量后会出"个别批次 MCU 行为异常"的暗病。

### 失败处置（与 RIPER-5 协议集成）

```
MIL 失败 → 回 PLAN 改模型
SIL 失败 → 改 Embedded Coder 设置；不通过禁止 PIL
PIL 失败 → 三层定位矩阵；定位后回对应层修
```

把三层结果记入 `编辑清单.md`：

```markdown
## 2026-05-19 — LQR controller MIL/SIL/PIL 验证
- MIL: ✓ 15 测试用例全通，max=12.34
- SIL: ✓ 与 MIL 偏差 8.2e-13（浮点级精度）
- PIL: ✓ 与 MIL 偏差 3.4e-7（在 1e-6 阈值内）
- 结论：可以上板量产
- commit: a3b4c5d
```

---

## 10. 与主协议的衔接

### 10.1 与四文件磁盘记忆的映射

| 触发场景 | 写入文件 | 关键段 |
|---|---|---|
| 场景 1 系统辨识 | `研究发现.md` | "系统模型 + 工作点 + 单位" |
| 场景 2/3 滤波器/FFT | `编辑清单.md` | 设计参数 + 频响图路径 |
| 场景 4 控制器 | `项目规划清单.md` + `编辑清单.md` | 控制律选型 + 增益迭代 |
| 场景 5 卡尔曼 | `研究发现.md` | Q/R 假设 + 协方差初始值 |
| 场景 6 电机辨识 | `硬件资源表.md` | 电机参数表（Rs/Ld/Lq/Ψf/J） |
| 场景 7 日志分析 | `研究发现.md` | "排查线索"段 |
| 场景 8 定点化 | `编辑清单.md` | 各变量 Qm.n 表 |
| 场景 9 Simulink 生成 | `编辑清单.md` | 模型路径、生成报告路径、关键 ert 配置 |
| 场景 10 MIL/SIL/PIL | `编辑清单.md` + `研究发现.md` | 三层一致性证据、误差表、阈值依据 |

### 10.2 与兄弟 skill 的协作

| 触发场景 | 需要的 skill | 何时调用 |
|---|---|---|
| 所有 | `mcp__matlab__*` 工具组 | 数学计算/仿真 |
| 1 / 7 | `/serial-monitor` | MCU 端数据采集 |
| 4 / 5 | `tools/export_gains_to_c.py` | 增益 → .h 导出 |
| 部署 | `/build-cmake` / `/flash-openocd` | 编译烧录 |
| 6 实测 | `/pid-tune` | 串口实时整定 |
| 7 CAN | `/can-debug` | CAN 总线监听 |
| 全 | `/static-analysis` | REVIEW 阶段 |
| 9 Simulink | Embedded Coder + Simulink Coder | `slbuild` 一键生成 C |
| 10 验证链 | MATLAB SIL/PIL 模式 + 目标 MCU 工具链 | 编译并下载 PIL 测试桩 |
| 9 / 10 | `/build-cmake` + `/flash-openocd` | 把生成的 C 集成到固件并烧录 |

### 10.3 失败分类对照

| 失败现象 | failure_category | 处置 |
|---|---|---|
| MATLAB 未启动 / toolbox 缺 | `environment-missing` | 装 toolbox 或降级 Python |
| 数据维度对不上 | `ambiguous-context` | 回 A 段索取正确数据 |
| 辨识拟合度 < 60% | `target-response-abnormal` | 重新激励 + 录数据 |
| 仿真不稳定 | `target-response-abnormal` | 回参数迭代 |
| `.h` 生成失败 | `artifact-missing` | 检查导出器输入 |

### 10.4 调用示例（端到端）

```text
用户："我的温箱温度有 50 Hz 工频干扰，控不准"

[MODE: RESEARCH]
→ 触发本 mode（关键词："滤波器"+"工频干扰"）
→ 决策树：场景 3 (FFT) → 场景 2 (滤波器) → 场景 4 (重调 PID)

[场景 3] 让用户录 1024 点温度数据 → FFT → 确认 50 Hz 峰值

[MODE: PLAN]
- 列实施清单：
  1. scripts/design_lpf.m（review:true）
  2. app/dsp/lpf_temp.h（review:true，导出器产物）
  3. app/control/temp_control.c 加滤波（review:true）
- 用户确认 → EXECUTE

[场景 2] mcp__matlab__evaluate_matlab_code → 4 阶 Butterworth fc=10Hz
[场景 8] export_gains_to_c.py → 生成 lpf_temp.h
[场景 4] pidtune 在滤波后系统上重整 PID

[MODE: REVIEW]
- 频响图：50Hz 衰减 > 40 dB ✓
- 实测温度噪声 < 0.05℃ ✓
- ARCH 检查通过
```

---

## 11. 入门示例索引

| 示例 | 文件 | 难度 | 适用场景 |
|---|---|---|---|
| **5 分钟 Hello World（零基础首跑）** | `refs/matlab-hello-5min.md` | ☆ | 第一次使用 |
| 阶跃响应辨识温度对象 | `refs/matlab-example-step-id.md` | ★ | 场景 1 入门 |
| 一阶低通滤波器设计 | `refs/matlab-example-iir-filter.md` | ★ | 场景 2 入门 |
| 串口 CSV 日志可视化 | `refs/matlab-example-serial-plot.md` | ★ | 场景 7 入门 |
| 两轮平衡车 LQR | `refs/lqr-example-segway.md` | ★★★ | 场景 4 综合 |
| **纯舵机单车 Cornell LQR（变参数 + 6 项增强分析）** | `refs/lqr-example-bicycle-cornell.md` | ★★★★ | 场景 4 进阶（从 Python+scipy 迁移到 MATLAB） |
| DDS 信号发生器（电赛 2001A）| `refs/matlab-example-dds-signal-gen.md` | ★★ | 竞赛专题 E1 |
| AM 调制度测量（电赛 2022F）| `refs/matlab-example-modem-am.md` | ★★ | 竞赛专题 E2 |
| 失真度分析仪（电赛 2021A）| `refs/matlab-example-thd-meter.md` | ★★ | 竞赛专题 E3 |
| **历年赛题索引（电赛）** | `refs/competition-index.md` | — | 找题入口 |
