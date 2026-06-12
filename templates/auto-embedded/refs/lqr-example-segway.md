# 端到端示例：两轮平衡车 LQR 设计

> 完整演示 `.auto-embedded/modes/matlab-embedded-toolkit.md` 场景 4（控制器设计）的"建模 → MATLAB 算 K → `.h` 导出 → C 闭环代码"全链路。
>
> 难度：★★★（涉及物理建模 + 状态空间 + 离散化 + 嵌入式集成）
>
> 适用者：已经能在 STM32/ESP32 上跑 IMU 读姿态、能开关电机的开发者。

---

## 0. 你将得到什么

- 一份 `scripts/lqr_design.m` MATLAB 设计脚本
- 一份 `app/control/lqr_gains.h` 头文件（K 矩阵）
- 一份 `app/control/balance_control.c` C 闭环代码
- 一组验证图：开环极点、闭环极点、阶跃响应、控制信号峰值

---

## 1. 系统建模

### 1.1 物理参数（你需要测的）

| 符号 | 含义 | 典型值 | 怎么测 |
|---|---|---|---|
| `M` | 车体质量（不含轮） | 0.5 kg | 电子秤 |
| `m` | 单个轮子质量 | 0.05 kg | 电子秤 |
| `L` | 重心到轮轴的距离 | 0.10 m | 卷尺 |
| `r` | 轮半径 | 0.034 m | 卷尺 |
| `I` | 车体绕轮轴转动惯量 | 0.005 kg·m² | 估算：`(1/3)*M*L^2` |
| `g` | 重力加速度 | 9.81 m/s² | 常数 |
| `b` | 等效阻尼系数 | 0.01 N·m·s | 实测或留作待辨识 |

### 1.2 状态变量定义

状态向量 `x = [θ, θ̇, φ, φ̇]^T`：

- `θ`：车体俯仰角（rad），平衡位置为 0
- `θ̇`：俯仰角速度（rad/s）
- `φ`：车轮转角（rad），间接反映位置
- `φ̇`：车轮转速（rad/s）

输入 `u`：电机力矩（N·m）

输出 `y = [θ, φ]^T`：可由 IMU + 编码器测得

### 1.3 平衡点附近线性化（小角度近似）

```
ẋ = A x + B u
y = C x + D u
```

其中（详细推导见任意经典倒立摆教材，例如 Ogata《Modern Control Engineering》第 3 章）：

```
        ┌  0          1     0    0  ┐
        │ (M+m)gL/D   0     0   -b/D │
A   =   │  0          0     0    1   │
        │ -mgL/D      0     0    b/D │
        └                            ┘

        ┌  0    ┐
        │ -1/D  │
B   =   │  0    │
        │  1/D  │
        └       ┘

D_factor = I*(M+m) + M*m*L^2     (避免与 D 矩阵同名，下面叫 D_factor)
```

C 矩阵简单（只测 θ 和 φ）：

```
C = [1 0 0 0;
     0 0 1 0];
```

---

## 2. MATLAB 脚本（scripts/lqr_design.m）

```matlab
%% lqr_design.m — 两轮平衡车 LQR 控制器设计
clear; clc; close all;

%% 1. 物理参数（按你的车实测填）
M  = 0.5;     m = 0.05;
L  = 0.10;    r = 0.034;
I  = 0.005;   b = 0.01;
g  = 9.81;

D_factor = I*(M+m) + M*m*L^2;

%% 2. 线性化状态空间
A = [ 0,             1,  0,  0;
      (M+m)*g*L/D_factor, 0, 0, -b/D_factor;
      0,             0,  0,  1;
      -m*g*L/D_factor, 0, 0,  b/D_factor ];

B = [ 0; -1/D_factor; 0; 1/D_factor ];
C = [1 0 0 0; 0 0 1 0];
D = [0; 0];

sys = ss(A, B, C, D);

%% 3. 可控性 / 可观性预检（必跑）
n = size(A,1);
rank_c = rank(ctrb(A, B));
rank_o = rank(obsv(A, C));
fprintf('可控性 rank = %d / %d\n', rank_c, n);
fprintf('可观性 rank = %d / %d\n', rank_o, n);
assert(rank_c == n, '系统不可控');
assert(rank_o == n, '系统不可观');

%% 4. 离散化（采样周期 5 ms）
Ts = 0.005;
sys_d = c2d(sys, Ts, 'zoh');
[Ad, Bd, Cd, Dd] = ssdata(sys_d);

%% 5. Bryson 法则起点 Q/R
theta_max     = 0.20;    % 允许最大倾角 ≈ 11.5°
theta_dot_max = 2.0;
phi_max       = 5.0;     % 位置积累
phi_dot_max   = 10.0;
u_max         = 0.30;    % N·m 电机峰值力矩

Q = diag([1/theta_max^2, 1/theta_dot_max^2, 1/phi_max^2, 1/phi_dot_max^2]);
R = 1/u_max^2;

%% 6. 离散 LQR
[K, S, E] = dlqr(Ad, Bd, Q, R);

%% 7. 闭环验证
A_cl = Ad - Bd * K;
poles_cl = eig(A_cl);

% 极点全部在单位圆内？
in_unit_circle = all(abs(poles_cl) < 1);
fprintf('闭环稳定: %d (极点最大模 = %.4f)\n', ...
        in_unit_circle, max(abs(poles_cl)));

% 阶跃扰动响应：初始倾角 0.1 rad
x0 = [0.1; 0; 0; 0];
t  = 0:Ts:2;
x  = zeros(4, length(t));
u_hist = zeros(1, length(t));
x(:,1) = x0;
for k = 1:length(t)-1
    u_hist(k) = -K * x(:,k);
    x(:,k+1) = Ad * x(:,k) + Bd * u_hist(k);
end

u_peak = max(abs(u_hist));
fprintf('控制信号峰值: %.3f N·m (饱和 %.3f)\n', u_peak, u_max);
fprintf('峰值利用率: %.0f%% (建议 < 80%%)\n', u_peak/u_max*100);

%% 8. 可视化
figure('Name', 'LQR 设计结果');
subplot(2,2,1);
plot(real(poles_cl), imag(poles_cl), 'rx', 'MarkerSize', 10, 'LineWidth', 2);
hold on; theta = linspace(0, 2*pi, 100); plot(cos(theta), sin(theta), 'k--');
title('闭环极点（单位圆内即稳定）'); axis equal; grid on;

subplot(2,2,2);
plot(t, x(1,:)*180/pi, 'LineWidth', 1.5);
title('俯仰角 θ (°)'); xlabel('t (s)'); grid on;

subplot(2,2,3);
plot(t, x(3,:), 'LineWidth', 1.5);
title('车轮转角 φ (rad)'); xlabel('t (s)'); grid on;

subplot(2,2,4);
plot(t(1:end-1), u_hist(1:end-1), 'LineWidth', 1.5);
title('控制力矩 u (N·m)'); xlabel('t (s)');
yline(u_max, 'r--'); yline(-u_max, 'r--');
grid on;

%% 9. 保存增益（供 .auto-embedded/tools/export_gains_to_c.py 用）
save('lqr_gains.mat', 'K', 'Ts');
fprintf('\nK = [%s]\n', sprintf('%.4f ', K));
fprintf('已保存 lqr_gains.mat（行向量 1x4，K = [Kθ Kθ̇ Kφ Kφ̇]）\n');
```

通过 `mcp__matlab__run_matlab_file` 跑：

```python
mcp__matlab__run_matlab_file(file_path="scripts/lqr_design.m")
```

**典型输出**：

```
可控性 rank = 4 / 4
可观性 rank = 4 / 4
闭环稳定: 1 (极点最大模 = 0.9712)
控制信号峰值: 0.218 N·m (饱和 0.300)
峰值利用率: 73%
K = [-32.1457 -3.8201 -1.0000 -1.2841 ]
已保存 lqr_gains.mat
```

---

## 3. 导出为 C 头文件

```bash
python ".auto-embedded/tools/export_gains_to_c.py" ^
    --input scripts\lqr_gains.mat --mat-var K ^
    --output app\control\lqr_gains.h ^
    --name K_BALANCE --type float --with-cmsis-template
```

产物 `app/control/lqr_gains.h`：

```c
/* lqr_gains.h — 自动生成，请勿手改 */
/* 来源: mat file lqr_gains.mat (var=K) */
/* 维度: 1 x 4  类型: float */

#ifndef K_BALANCE_H
#define K_BALANCE_H

#define K_BALANCE_ROWS  1
#define K_BALANCE_COLS  4

static const float K_BALANCE_DATA[K_BALANCE_ROWS][K_BALANCE_COLS] = {
    { -3.2145700e+01f, -3.8201000e+00f, -1.0000000e+00f, -1.2841000e+00f },
};

#define K_BALANCE_FLAT_INIT \
    -3.2145700e+01f, -3.8201000e+00f, -1.0000000e+00f, -1.2841000e+00f

/* CMSIS-DSP 模板见自动附加内容 */

#endif
```

---

## 4. C 闭环代码（app/control/balance_control.c）

```c
/* app/control/balance_control.c
 *
 * 平衡车 LQR 控制回路。
 * 应用层 — 严禁 #include 厂商 HAL 头。
 * 通过 hal_*.h / drv_*.h 间接访问硬件。
 */

#include "lqr_gains.h"
#include "arm_math.h"
#include "hal_motor.h"          /* L1 HAL Port */
#include "drv_imu.h"            /* L3 driver */
#include "drv_encoder.h"        /* L3 driver */

/* === LQR 状态向量映射 === */
#define STATE_THETA      0
#define STATE_THETA_DOT  1
#define STATE_PHI        2
#define STATE_PHI_DOT    3
#define STATE_DIM        4

/* CMSIS-DSP 矩阵实例 */
static float K_data[STATE_DIM] = { K_BALANCE_FLAT_INIT };
static arm_matrix_instance_f32 K_mat = { 1, STATE_DIM, K_data };

static float x_data[STATE_DIM] = { 0 };
static arm_matrix_instance_f32 x_mat = { STATE_DIM, 1, x_data };

static float u_data[1] = { 0 };
static arm_matrix_instance_f32 u_mat = { 1, 1, u_data };

/* 上次值用于差分 */
static float last_phi = 0.0f;
static const float TS = 0.005f;     /* 与设计离散周期一致！ */

/* 执行器物理饱和 */
#define U_MAX_PHYSICAL  0.30f       /* N·m */

void balance_control_init(void)
{
    drv_imu_init();
    drv_encoder_init();
    last_phi = drv_encoder_get_phi();
}

/* 控制中断回调：每 5 ms 触发一次（由 timer ISR 唤醒任务调用） */
void balance_control_step(void)
{
    /* 1. 读状态 */
    float theta, theta_dot;
    drv_imu_read_pitch(&theta, &theta_dot);     /* 已经过 IMU 内部滤波 */
    float phi = drv_encoder_get_phi();
    float phi_dot = (phi - last_phi) / TS;
    last_phi = phi;

    x_data[STATE_THETA]     = theta;
    x_data[STATE_THETA_DOT] = theta_dot;
    x_data[STATE_PHI]       = phi;
    x_data[STATE_PHI_DOT]   = phi_dot;

    /* 2. u = -K * x */
    arm_mat_mult_f32(&K_mat, &x_mat, &u_mat);
    float u = -u_data[0];

    /* 3. 执行器饱和保护（LQR 假设无约束，嵌入式必加） */
    if      (u >  U_MAX_PHYSICAL) u =  U_MAX_PHYSICAL;
    else if (u < -U_MAX_PHYSICAL) u = -U_MAX_PHYSICAL;

    /* 4. 下发（HAL Port 内部处理换算到 PWM 占空比） */
    hal_motor_set_torque(u);
}

/* 倒地保护：超过 ±30° 自动停机 */
void balance_safety_check(void)
{
    const float THETA_TRIP = 0.524f;    /* 30° */
    if (x_data[STATE_THETA] > THETA_TRIP || x_data[STATE_THETA] < -THETA_TRIP) {
        hal_motor_set_torque(0.0f);
        hal_motor_disable();
    }
}
```

---

## 5. 集成到 main.c

```c
/* main.c — 只做编排，不写业务 */
#include "bsp_init.h"
#include "balance_control.h"

extern void scheduler_run(void);

int main(void)
{
    bsp_init();
    balance_control_init();
    scheduler_run();     /* RTOS / 状态机 / 事件循环 */
    while (1) {}         /* 不可达 */
}
```

scheduler 内每 5 ms 唤醒一次 `balance_control_step()`。

---

## 6. REVIEW 阶段验证证据

按 RIPER-5 REVIEW 三步：

### Step 1 — 验证门

| 声明 | 命令 / 证据 |
|---|---|
| MATLAB 设计完成 | `mcp__matlab__run_matlab_file` 输出含"闭环稳定: 1" |
| `.h` 生成 | `ls app\control\lqr_gains.h` |
| 编译通过 | `aemb-build-cmake` exit 0 |
| 烧录成功 | `aemb-flash-openocd` verify ok |
| 实测稳定 | `aemb-serial-monitor` 抓 30 秒日志，俯仰角 RMS < 0.05 rad |

### Step 2 — 硬件合规

核对 `硬件资源表.md`：

- 定时器分配（控制中断必须独占一个，优先级最高）
- IMU SPI / I2C 引脚
- 电机 PWM 引脚 + 编码器输入捕获引脚

### Step 3 — 代码质量

- `app/control/balance_control.c` 不含厂商头 ✓
- `main.c` 仅 4 句编排 ✓
- 跑 `bash .auto-embedded/scripts/arch-check.sh` exit 0 ✓
- 跑 `python ` 无 LAYER-VIOL ✓
- ISR 内只翻信号量，不算 LQR（控制在任务里跑） ✓

---

## 7. 现场调优建议

设计好后，到车上跑通常需要微调：

1. **倾角偏移**：IMU 装配误差导致 θ=0 不是真平衡位置 → 加 `theta_offset`
2. **车轮打滑 / 地面坡度**：会让 φ 项控制效果差 → 减小 `Qφ` 让控制器"放弃位置控制"
3. **机械晃动 / 共振**：表现为 5–20 Hz 振荡 → 在 IMU 通路加场景 2 的低通滤波器（fc ≈ 10 Hz）
4. **电机死区**：小命令电压不转 → 加 `dead_zone_compensation()`
5. **电池电压下降**：力矩输出衰减 → 加 `Vbat` 补偿系数

每次调整都按场景 7（日志可视化）重新抓数据、找问题；不要凭感觉调。

---

## 8. 失败兜底

| 现象 | 诊断 | 处置 |
|---|---|---|
| 仿真闭环不稳 | 重审 A/B 物理参数；检查单位 | 回阶段 1.1 重测 |
| 仿真稳但实车摔 | 大概率 IMU 滤波延迟或控制周期不准 | 用场景 7 录数据看相位 |
| 上电就剧烈抖动 | u 直接打到饱和 = R 太小 | 增大 R 重设计 |
| 缓慢漂移 | 缺积分作用 | 增广状态加 ∫φ |

详细系统调试方法见 `.auto-embedded/refs/systematic-debugging.md`。
