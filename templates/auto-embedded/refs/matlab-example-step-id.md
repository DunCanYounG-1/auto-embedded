# 入门示例：阶跃响应辨识温度对象

> 难度：★（完全零基础，30 分钟跑通）
>
> 用途：把一个未知动态对象（温箱 / 电机转速 / 水位）通过最简单的阶跃实验得到数学模型，供后续 PID 整定或 LQR 设计。
>
> 涉及 `.auto-embedded/modes/matlab-embedded-toolkit.md` 场景 1（系统辨识）。

---

## 0. 学完这个示例你能做什么

- 在 MCU 上录一段"加热命令 → 温度"数据
- 用 MATLAB 一键拟合出一阶传函 `G(s) = K / (T·s + 1) · exp(-Td·s)`
- 拿到的 K / T / Td 三个数，直接喂给 `pidtune` 自动整定 PID
- 全程不用懂控制理论数学

---

## 1. 实验场景示例

| 被控对象 | 输入 u | 输出 y | 典型 K / T |
|---|---|---|---|
| 温箱 | PWM 占空比 0–100% | 温度 (°C) | K≈0.5 °C/%、T≈30 s |
| 直流电机 | PWM 占空比 | 转速 (RPM) | K≈30 RPM/%、T≈0.2 s |
| 水位控制 | 阀门开度 0–100% | 水位 (cm) | K≈0.2 cm/%、T≈10 s |

下面以**温箱**为例（最直观），其他对象同理。

---

## 2. 数据采集（MCU 端）

### 2.1 你需要的最少代码

```c
/* app/exp/step_id_exp.c — 阶跃响应辨识实验 */
#include "hal_uart.h"
#include "drv_heater.h"     /* PWM 加热器 */
#include "drv_temp.h"       /* 温度传感器 DS18B20 / NTC / K 型 */
#include <stdio.h>

void step_id_exp_run(void)
{
    /* 1. 等待稳定（达到环境温度） */
    drv_heater_set_pwm(0);
    for (int i = 0; i < 60; i++) {
        hal_delay_ms(1000);
    }

    /* 2. 给阶跃：PWM 跳到 50% */
    drv_heater_set_pwm(50);
    uint32_t t0 = hal_get_tick_ms();

    /* 3. 每秒采样一次，录 300 秒 */
    for (int i = 0; i < 300; i++) {
        uint32_t t  = hal_get_tick_ms() - t0;
        float    y  = drv_temp_read_celsius();
        char buf[64];
        int n = snprintf(buf, sizeof(buf), "%lu,50.0,%.2f\n", t, y);
        hal_uart_write(LOG_UART, (uint8_t *)buf, n, 100);
        hal_delay_ms(1000);
    }

    /* 4. 关闭加热 */
    drv_heater_set_pwm(0);
}
```

### 2.2 录数据到 PC

```bash
# Linux / macOS / Git Bash on Windows
stty -F /dev/ttyUSB0 115200
cat /dev/ttyUSB0 > step_data.csv

# Windows PowerShell
# 用 PuTTY / 串口助手 / 或调 /serial-monitor skill
```

录完后 `step_data.csv` 长这样：

```
0,50.0,22.50
1000,50.0,22.52
2000,50.0,22.61
...
299000,50.0,68.34
```

第一列 ms、第二列 PWM 命令、第三列温度 °C。

---

## 3. MATLAB 辨识（小白版本，一键跑）

把下面这段贴进 `mcp__matlab__evaluate_matlab_code`：

```matlab
% --- 小白一键辨识 ---

% 1. 读数据
raw = readmatrix('step_data.csv');
t   = raw(:,1) / 1000;       % ms → s
u   = raw(:,2);              % PWM 占空比 (%)
y   = raw(:,3);              % 温度 (°C)
Ts  = mean(diff(t));         % 自动算采样周期

fprintf('采样周期 Ts = %.3f s, 共 %d 点\n', Ts, length(t));

% 2. 去掉初始环境温度（detrend）
y_init = mean(y(1:5));       % 阶跃前 5 个点的平均
y_norm = y - y_init;         % 归一化：从 0 开始

% 3. 构造辨识对象
data = iddata(y_norm, u, Ts);

% 4. 拟合一阶 + 死区时间模型（最简单：P1D）
sys = procest(data, 'P1D');

% 5. 提取参数（K, T, Td）
K  = sys.Kp;
T  = sys.Tp1;
Td = sys.Td;

fprintf('\n=== 辨识结果 ===\n');
fprintf('稳态增益 K  = %.4f °C/%%PWM\n', K);
fprintf('时间常数 T  = %.2f s\n', T);
fprintf('死区时间 Td = %.2f s\n', Td);

% 6. 验证拟合度
[y_fit, fit_pct] = compare(data, sys);
fprintf('拟合度 = %.1f%% (> 80%% 可用，< 60%% 重做实验)\n', fit_pct);

% 7. 可视化
figure;
subplot(2,1,1);
plot(t, y, 'b-', 'LineWidth', 1.5); hold on;
plot(t, y_fit.y + y_init, 'r--', 'LineWidth', 1.5);
legend('实测', '一阶模型拟合');
xlabel('t (s)'); ylabel('温度 (°C)'); grid on;
title(sprintf('辨识结果：K=%.2f, T=%.2fs, Td=%.2fs (拟合 %.1f%%)', K, T, Td, fit_pct));

subplot(2,1,2);
plot(t, u, 'k-', 'LineWidth', 1.5);
xlabel('t (s)'); ylabel('PWM (%)'); grid on; ylim([-5 105]);

% 8. 保存模型，供后续 PID 整定
save('temp_model.mat', 'K', 'T', 'Td', 'Ts');
fprintf('已保存 temp_model.mat\n');
```

**典型输出**：

```
采样周期 Ts = 1.000 s, 共 300 点
=== 辨识结果 ===
稳态增益 K  = 0.9156 °C/%PWM
时间常数 T  = 32.40 s
死区时间 Td = 4.80 s
拟合度 = 92.3% (> 80% 可用，< 60% 重做实验)
已保存 temp_model.mat
```

---

## 4. 拟合度不达标怎么办

### 拟合度 < 60%

| 原因 | 检查方法 | 修复 |
|---|---|---|
| 阶跃幅度太小，被噪声淹没 | 看数据信噪比 | PWM 从 50% 加大到 80% |
| 录制时间不够 | 看输出有没有稳定 | 录满至少 5 倍 T |
| 采样太慢 | 看 t 列间隔 | 改 100 ms 一次 |
| 系统非线性强（如温度饱和） | 看响应曲线形状 | 减小 PWM 阶跃幅度 |
| 实验环境扰动（开窗 / 风扇） | 重做时关闭扰动源 | 重做 |

### 拟合度 60%–80%

尝试更复杂的模型：

```matlab
% 二阶 + 死区
sys2 = procest(data, 'P2D');
% 二阶 + 零点 + 死区（适合震荡型）
sys2z = procest(data, 'P2DZ');
% 看哪个拟合度更高
```

---

## 5. 拿到 K/T/Td 后怎么用

### 5.1 自动 PID 整定（接 `.auto-embedded/modes/matlab-embedded-toolkit.md` 场景 4）

```matlab
load('temp_model.mat');
G = tf(K, [T 1], 'OutputDelay', Td);
[C, info] = pidtune(G, 'PID');
fprintf('Kp = %.4f, Ki = %.4f, Kd = %.4f\n', C.Kp, C.Ki, C.Kd);
```

### 5.2 直接套经验公式（Cohen-Coon 法，最快）

```
α = T / (T + Td)
Kp = (1.35/K) · (T/Td + 0.18)
Ki = Kp / Ti，  Ti = (2.5 + 2*Td/T) · Td
Kd = Kp · Td · (0.37/(0.81 + 0.19*Td/T))
```

实测 K=0.92、T=32.4、Td=4.8 套出来：

```
Kp ≈ 2.4
Ki ≈ 0.18 (Ti≈14)
Kd ≈ 4.5
```

### 5.3 写到 MCU

```c
/* app/control/temp_pid.c */
static pid_t pid = {
    .Kp = 2.4f, .Ki = 0.18f, .Kd = 4.5f,
    .i_max = 100.0f,
    .u_max = 100.0f, .u_min = 0.0f
};

void temp_control_step(float Ts) {
    float pwm = pid_step(&pid, setpoint, current_temp, Ts);
    drv_heater_set_pwm((uint8_t)pwm);
}
```

---

## 6. 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| MATLAB 报 `Undefined function 'procest'` | 缺 System Identification Toolbox | 用 `tfest(data, 1)` 或降级到 Python `scipy.signal` |
| 时间常数 T < Ts | 采样太慢，根本看不到动态 | 减小采样周期到 ≤ T/10 |
| 死区 Td 算出来是负数 | 时间列有错位 / 阶跃时刻没对齐 | 数据切掉阶跃前的部分重做 |
| 不同次实验 K 差 30% | 散热条件变了（环境温度 / 风速） | 实验时控制环境一致 |

---

## 7. 进阶：如何记录这次实验到四文件磁盘记忆

按 riper5 协议，把实验结果写入 `研究发现.md`：

```markdown
## 技术发现

### 2026-05-19 — 温箱系统辨识
- **关联轮次**：Round 1 / Scout
- **查询工具**：mcp__matlab__evaluate_matlab_code
- **实验**：PWM 50% 阶跃，录 300 秒，1 Hz 采样
- **关键发现**：
  - K = 0.92 °C/%PWM
  - T = 32.4 s
  - Td = 4.8 s
  - 一阶模型拟合度 92%
- **来源**：本地实验 (step_data.csv)
- **与本项目关联**：用于 temp_pid PID 整定（场景 4）
- **可信度**：高（拟合度达标）
- **状态**：已采纳
```

---

## 8. 下一步路线图

完成本示例后建议依次做：

1. → `.auto-embedded/refs/matlab-example-iir-filter.md`（场景 2 入门）：给温度信号加个一阶低通去除测量噪声
2. → 用 §5.1 的 PID 在 MCU 上跑闭环
3. → `.auto-embedded/refs/lqr-example-segway.md`（场景 4 进阶）：从单输入单输出升级到多状态 LQR
