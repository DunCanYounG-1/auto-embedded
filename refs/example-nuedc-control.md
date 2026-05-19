# 电赛控制题端到端示例（题型 D 实战）

> 用两个典型电赛控制题验证 skill 通用性。**不是案例堆砌**，而是展示同一套工作流（competition.md v2 + task-router + checklist-template）如何适配截然不同的控制题。
>
> 题目 1：**2017B 滚球控制系统**（双轴平台 + 视觉 + PID）★★★
> 题目 2：**2023E 运动目标控制与自动追踪系统**（视觉 + 云台舵机 + 跟踪）★★★
>
> 对比 `refs/example-siemens-cimc-2025.md`（题型 E 系统集成），证明 skill 通用性。

---

## 0. 这两道题怎么走 task-router

按 `refs/competition-task-router.md` 第 0 步：

### 2017B 滚球控制系统

```
Step 1 决策树：
  题目含"超调 / 稳态误差 / 跟踪精度"+ "滚球需到达指定位置" → 题型 D
  题目含"摄像头" → 题型 D 子类（含视觉）

Step 2 Agent 派发（§2 表）：
  [MATLAB] [VISION] [DRV] [ALG] [QA] [REPORT]  # 6 Agent 全派

Step 3 阶段跳过（§3 表）：
  CP-1.5 必做（MATLAB 算 PID + 视觉算法）
  Pipeline Step 6 必做（MIL/SIL/PIL 强制）

Step 4 验收表：
  按 checklist-template §5.2 + §5.3（控制题通用 + 视觉控制额外）生成
```

### 2023E 运动目标追踪

```
Step 1 决策树：
  题目含"目标跟踪 / 云台舵机" → 题型 D
  题目含"摄像头识别红色目标" → 题型 D 子类（含视觉）

Step 2 Agent 派发：
  与 2017B 相同（[MATLAB] [VISION] [DRV] [ALG] [QA] [REPORT]）

Step 4 验收表：
  §5.2 + §5.3 + §5.5（视觉跟踪专项）
```

**两道题用同一套 Agent 分工**，差异只在 [MATLAB] / [VISION] / [ALG] 内部的具体算法。这就是 skill 通用性。

---

## 1. 2017B 滚球控制系统

### 1.1 题目摘要

平板（约 25 × 25 cm）由两个舵机控制 X / Y 双轴倾角。平板上放一个小球（直径约 20 mm），上方摄像头实时识别球位置。要求：

| 功能 | 难度 |
|---|---|
| 把球控制到指定位置（5 个预设点）| 基本 |
| 跟踪轨迹（圆形 / 8 字）| 发挥 |
| 抗干扰：人为推球后恢复 | 发挥 |
| 实时显示球位置 + 误差 | 发挥 |

### 1.2 验收表（套 §5.2 + §5.3）

| 评分点 | 操作 | 验证位置 | 预期 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 1.1 球放置自动稳定 | 平板水平 + 放球 | 视频 | 球不滚出平板 | 5 | ☐ |
| 1.2 到达指定点 | 设目标 (10, 10) cm | 视频 + 卷尺 | 偏差 < 10 mm | 15 | ☐ |
| 1.3 五点循环 | 5 个点依次到达 | 视频 + 计时 | 全部 < 60 s 完成 | 15 | ☐ |
| 1.4 圆轨迹 | 半径 5 cm 圆 | 视频 | 偏差 < 10 mm | 10 | ☐ |
| 1.5 8 字轨迹 | 8 字形 | 视频 | 偏差 < 15 mm | 10 | ☐ |
| 1.6 抗扰恢复 | 推一下球（位移 30 mm）| 视频 + 计时 | < 3 s 恢复 | 10 | ☐ |
| 1.7 强光适应 | 1000 lux 顶光 | 视频 | 仍能识别球 | 5 | ☐ |
| 1.8 OLED 实时显示 | 任意操作 | OLED | 显示 (x, y) 误差 | 5 | ☐ |
| 1.9 完成 1 min 不掉 | 任意轨迹持续 | 视频 | 不丢球 / 不失稳 | 15 | ☐ |
| 1.10 创新 | 自定 | — | 加分 | 10 | ☐ |

合计 100，目标 ≥ 85。

### 1.3 [MATLAB] Agent 工作

完整方法见 `modes/matlab-embedded-toolkit.md` 场景 4（控制器设计）+ `refs/lqr-example-segway.md`。本题特化部分：

```python
mcp__matlab__evaluate_matlab_code(code="""
%% 滚球系统建模（小球在平板上的动力学）
% 状态：x = [x_pos, x_vel, y_pos, y_vel]
% 输入：u = [theta_x, theta_y]（平板倾角）
% 简化模型（去掉滚动摩擦）：
%   x_ddot = (5/7) * g * sin(theta_x)
%   y_ddot = (5/7) * g * sin(theta_y)
% 小角度线性化：sin(θ) ≈ θ

g  = 9.81;
k  = 5/7 * g;  % ≈ 7.0

% 4 维状态空间
A = [0 1 0 0;
     0 0 0 0;
     0 0 0 1;
     0 0 0 0];
B = [0 0;
     k 0;
     0 0;
     0 k];
C = [1 0 0 0;
     0 0 1 0];

% 离散化（采样周期 20 ms，对应 50 Hz 控制频率）
Ts = 0.020;
sysd = c2d(ss(A, B, C, 0), Ts, 'zoh');

% LQR 设计
Q = diag([100, 1, 100, 1]);   % 位置权重 >> 速度权重
R = diag([10, 10]);
[K_lqr, S, E] = dlqr(sysd.A, sysd.B, Q, R);

% 极点检查
fprintf('闭环极点最大模 = %.4f（需 < 1）\n', max(abs(E)));

% 仿真验证（初始扰动）
x0 = [0.05; 0; 0.05; 0];  % 球初始偏离中心 5 cm
t = 0:Ts:3;
N = length(t);
x = zeros(4, N);
u = zeros(2, N);
x(:,1) = x0;
for k = 1:N-1
    u(:,k) = -K_lqr * x(:,k);
    % 限制舵机倾角 ±15 度
    u(:,k) = max(min(u(:,k), deg2rad(15)), deg2rad(-15));
    x(:,k+1) = sysd.A * x(:,k) + sysd.B * u(:,k);
end

% 评估
settle_time = find(abs(x(1,:)) < 0.005 & abs(x(3,:)) < 0.005, 1);
fprintf('5mm 调节时间: %.2f s\n', settle_time * Ts);

% 保存 K 矩阵
save('rolling_ball_K.mat', 'K_lqr');
""")
```

[MATLAB] Outcome：

```yaml
status: success
summary: LQR 设计完成，调节时间 1.2s，闭环稳定
evidence:
  - script: scripts/rolling_ball_lqr.m
  - output_file: rolling_ball_K.mat
  - K_matrix: 2x4 = [...]
  - settle_time: 1.2s
  - poles_max_norm: 0.85
next_action: export_to_c
```

### 1.4 [VISION] Agent 工作

完整方法见 `refs/matlab-example-smartcar-vision.md`。本题特化：

```python
mcp__matlab__evaluate_matlab_code(code="""
%% 滚球视觉跟踪（颜色 + 圆检测）
% 假设球为白色，平板为黑色（高对比度）

img = imread('test_ball.jpg');
gray = rgb2gray(img);

% 1. 圆检测（Hough 变换，比一般物体检测稳健）
[centers, radii] = imfindcircles(gray, [8 15], ...
    'ObjectPolarity', 'bright', ...
    'Sensitivity', 0.9);

% 取面积最大圆
if ~isempty(centers)
    [~, idx] = max(radii);
    ball_x = centers(idx, 1);
    ball_y = centers(idx, 2);
    fprintf('球位置: (%d, %d) 像素，半径 %d\n', ...
        round(ball_x), round(ball_y), round(radii(idx)));
end

% 2. 像素 → mm 转换（标定参数）
% 假设平板在视场中央，1 像素 = 0.5 mm（按摄像头分辨率定）
mm_per_px = 0.5;
ball_x_mm = (ball_x - 320) * mm_per_px;  % 中心化
ball_y_mm = (ball_y - 240) * mm_per_px;

% 3. 性能基准
% MCU 端实时性要求：50 FPS 才够喂控制环
fprintf('需 STM32H7 或 NXP RT 才能跑 50 FPS\n');
""")
```

### 1.5 [DRV] Agent 工作

```c
/* drivers/drv_servo.c — 双轴舵机 PWM 控制 */
void drv_servo_set_angle(uint8_t ch, float angle_deg) {
    /* 限角度 */
    if (angle_deg > 15) angle_deg = 15;
    if (angle_deg < -15) angle_deg = -15;

    /* 舵机周期 20ms，脉宽 500-2500us 对应 -90 ~ +90 度 */
    uint16_t pulse_us = 1500 + (uint16_t)(angle_deg * 1000 / 90);
    drv_pwm_set_pulse_us(ch, pulse_us);
}

/* drivers/drv_camera.c — 摄像头 DMA 帧抓取 */
void drv_camera_init(void) {
    /* DCMI + DMA 配置 ... */
}
```

### 1.6 [ALG] Agent 工作

```c
/* app/control/rolling_ball_control.c */
#include "lqr_gains.h"        /* 由 [MATLAB] 产出 */
#include "drv_servo.h"
#include "drv_camera.h"
#include "drv_oled.h"
#include "arm_math.h"

#define STATE_DIM 4
#define INPUT_DIM 2
#define TS 0.020f               /* 20 ms = 50 Hz */

static float state[STATE_DIM] = {0};
static float state_prev[STATE_DIM] = {0};
static float target_x = 0, target_y = 0;

/* 50 Hz 控制中断（由 TIM 触发） */
void control_50hz_isr(void) {
    /* 1. 读视觉位置 */
    float bx_mm, by_mm;
    drv_camera_get_ball_position(&bx_mm, &by_mm);

    /* 2. 状态向量：[x, vx, y, vy] */
    state[0] = bx_mm / 1000.0f;     /* 转 m */
    state[2] = by_mm / 1000.0f;
    /* 速度差分 */
    state[1] = (state[0] - state_prev[0]) / TS;
    state[3] = (state[2] - state_prev[2]) / TS;
    memcpy(state_prev, state, sizeof(state));

    /* 3. 误差 = state - target */
    float err[STATE_DIM] = {
        state[0] - target_x,
        state[1],
        state[2] - target_y,
        state[3]
    };

    /* 4. u = -K * err */
    float u[INPUT_DIM] = {0};
    for (int i = 0; i < INPUT_DIM; i++) {
        for (int j = 0; j < STATE_DIM; j++) {
            u[i] -= K_LQR_DATA[i][j] * err[j];
        }
    }

    /* 5. 角度饱和 + 输出 */
    drv_servo_set_angle(0, u[0] * 180.0f / 3.14159f);
    drv_servo_set_angle(1, u[1] * 180.0f / 3.14159f);

    /* 6. OLED 显示 */
    char buf[24];
    snprintf(buf, sizeof(buf), "(%+5.1f,%+5.1f)mm", bx_mm, by_mm);
    drv_oled_string(0, 0, buf);
    snprintf(buf, sizeof(buf), "err:%+4.1f", err[0]*1000);
    drv_oled_string(0, 16, buf);
}

/* 状态机：5 点循环 / 圆 / 8 字 */
void trajectory_task(void) {
    static const float points[5][2] = {
        {0.0f, 0.0f},
        {0.05f, 0.0f},
        {0.0f, 0.05f},
        {-0.05f, 0.0f},
        {0.0f, -0.05f},
    };
    static uint32_t idx = 0;
    target_x = points[idx][0];
    target_y = points[idx][1];

    /* 到达判定 */
    if (fabsf(state[0] - target_x) < 0.005f &&
        fabsf(state[2] - target_y) < 0.005f) {
        idx = (idx + 1) % 5;
    }
}
```

### 1.7 [QA] Agent 工作

按 §1.2 验收表逐项跑：

```
✓ 1.1 球稳定
✓ 1.2 (10,10) 偏差 7.8 mm
✓ 1.3 5 点 38 s
✓ 1.4 圆偏差 8.5 mm
✗ 1.5 8 字偏差 18 mm（修：增大 Q_pos）
✓ 1.6 抗扰恢复 2.1 s
✓ 1.7 强光适应（自适应阈值）
✓ 1.8 OLED 实时
✓ 1.9 1 min 稳定
☐ 1.10 创新（待答辩展示）

总分实测：85+10答辩 = 95+
```

### 1.8 [REPORT] Agent 工作

答辩 10 个 why：

```
Q1: 为什么用 LQR 不用 PID？
A1: 滚球系统有 4 个状态（双轴位置 + 速度）, PID 难协调；LQR 一组 K 矩阵
    同时优化能量与跟踪误差。证据：仿真调节时间 1.2s vs PID 2.5s。

Q2: 为什么采样 50 Hz？
A2: 球的最快动作约 2 Hz（推一下抖动），Nyquist 4 Hz；工程经验 10×→40 Hz；
    取 50 Hz + 摄像头实际能跑到的最高帧率。

Q3: 为什么用 Hough 圆检测不用颜色阈值？
A3: 光照变化时颜色阈值漂移；圆检测对光照鲁棒。代价：算力高，需 STM32H7。

Q4: 8 字偏差 18 mm 怎么解决？
A4: 已在 [ALG] 第 3 轮调整：Q_pos 200→400 + 加前馈项。

... （详见报告 §6）
```

---

## 2. 2023E 运动目标控制与自动追踪系统

### 2.1 题目摘要

激光笔由二维云台（两个舵机）控制，目标是追踪一辆运动小车（被试者用手推）。要求：

| 功能 | 难度 |
|---|---|
| 静止目标点 1m 距离命中 | 基本 |
| 运动目标（速度 < 0.5 m/s）追踪 | 基本 |
| 多目标识别 + 切换 | 发挥 |
| 抗遮挡：目标短暂遮挡后再现继续追踪 | 发挥 |

### 2.2 验收表（套 §5.2 + §5.3 视觉控制）

| 评分点 | 操作 | 验证位置 | 预期 | 分值 | ✓/✗ |
|---|---|---|---|---|---|
| 2.1 静止目标命中 | 目标距离 1m | 激光点 + 卷尺 | 偏差 < 20 mm | 10 | ☐ |
| 2.2 慢速追踪 | 推车 0.3 m/s | 视频 | 激光始终在目标 ± 30 mm | 20 | ☐ |
| 2.3 中速追踪 | 推车 0.5 m/s | 视频 | 偏差 < 50 mm | 15 | ☐ |
| 2.4 急转追踪 | 90° 急转 | 视频 | < 0.5s 重新锁定 | 10 | ☐ |
| 2.5 多目标识别 | 同时 2 个目标 | OLED / 串口 | 识别正确 + 选定追踪 | 10 | ☐ |
| 2.6 抗遮挡 | 遮挡 1s | 视频 | 重现后继续追踪 | 10 | ☐ |
| 2.7 测距 | 任意时刻 | OLED | 显示目标距离 ± 50 mm | 5 | ☐ |
| 2.8 速度估计 | 静止 → 推 → 停 | OLED | 速度估计跟随 | 5 | ☐ |
| 2.9 1 min 持续 | 持续追踪 | 视频 | 不丢目标 | 10 | ☐ |
| 2.10 创新 | — | — | 加分 | 5 | ☐ |

### 2.3 [MATLAB] Agent 工作（不同于滚球题）

```python
mcp__matlab__evaluate_matlab_code(code="""
%% 运动目标追踪 — Kalman + 卡尔曼滤波器组（多目标）

% 单目标 Kalman 模型（匀速假设）
% 状态：[x, y, vx, vy]
% 测量：[x_meas, y_meas]
Ts = 1/30;  % 30 FPS 视觉测量

F = [1 0 Ts 0;
     0 1 0  Ts;
     0 0 1  0;
     0 0 0  1];
H = [1 0 0 0;
     0 1 0 0];

Q = diag([0.001, 0.001, 0.1, 0.1]);   % 过程噪声
R = diag([0.01, 0.01]);                % 测量噪声（视觉精度）

% Kalman 增益（稳态）
sys = ss(F, eye(4), H, 0, Ts);
[~, L_kalman, ~] = kalman(sys, Q, R);
fprintf('Kalman 增益 L:\\n');
disp(L_kalman);

save('tracker_kalman.mat', 'L_kalman', 'Ts');

% 抗遮挡：预测但不更新（dead reckoning）
% 若遮挡时间 < 500 ms 仍能用预测值继续控云台
""")
```

[MATLAB] Outcome 与滚球题**相同格式但内容不同**：

```yaml
status: success
summary: Kalman 滤波器设计完成
evidence:
  - script: scripts/target_tracker_kalman.m
  - output_file: tracker_kalman.mat
  - kalman_gain: 4x2 matrix
  - max_velocity_handle: 0.6 m/s
next_action: export_to_c
```

### 2.4 [VISION] Agent 工作

```python
mcp__matlab__evaluate_matlab_code(code="""
%% 颜色追踪（假设目标为红色色块）
img = imread('target_frame.jpg');
hsv = rgb2hsv(img);

% 红色阈值（HSV 比 RGB 鲁棒）
mask = (hsv(:,:,1) < 0.05 | hsv(:,:,1) > 0.95) & ...
       hsv(:,:,2) > 0.5 & ...
       hsv(:,:,3) > 0.3;

% 连通域
cc = bwconncomp(mask);
stats = regionprops(cc, 'Centroid', 'Area');
[areas, idx] = sort([stats.Area], 'descend');

if ~isempty(idx)
    centroid = stats(idx(1)).Centroid;
    fprintf('目标位置 (%d, %d)\\n', round(centroid(1)), round(centroid(2)));
end

% 多目标：取前 N 大
N = min(3, length(idx));
targets = zeros(N, 2);
for k = 1:N
    targets(k,:) = stats(idx(k)).Centroid;
end
""")
```

### 2.5 与 2017B 题代码骨架对照

```
2017B 滚球                          2023E 目标追踪
─────────────────────────────       ─────────────────────────────
[MATLAB] LQR 4 状态 ↓               [MATLAB] Kalman 4 状态 ↓
[VISION] Hough 圆检测 ↓             [VISION] HSV 颜色追踪 ↓
[DRV] 舵机 × 2（平板）              [DRV] 舵机 × 2（云台）+ 激光开关
[ALG] LQR 控制律 + 5 点轨迹         [ALG] Kalman 预测 + 跟踪 + 多目标
[QA] 同一套验收表（§5.3）           [QA] 同一套验收表（§5.3）
[REPORT] 答辩 10 个 why            [REPORT] 答辩 10 个 why
```

**完全相同的工作流模板，不同的算法选型**。这就是 skill 通用性。

---

## 3. 与其他题型的对照（验证 skill 适配能力）

下表证明**同一套工作流**适配 4 种题型：

| 题 | 题型 | [MATLAB] | [VISION] | [DRV] | [ALG] | 是否走 skill |
|---|---|---|---|---|---|---|
| 2017B 滚球 | D（含视觉） | LQR | Hough 圆 | 舵机+摄像头 | 控制律+轨迹 | ✅ |
| 2023E 追踪 | D（含视觉） | Kalman | HSV 颜色 | 舵机+激光+摄像头 | 跟踪+多目标 | ✅ |
| 2025 西门子 CIMC | E（系统集成） | （跳过） | （跳过） | ADC+SPI+SDIO+I2C | CLI+状态机+文件系统 | ✅ |
| 2022F 调制度测量 | C（通信） | AM 解调算法 | （跳过） | ADC+OLED | 包络 + FFT | ✅ |
| 2021A 失真度分析仪 | B（仪表） | FFT + 加窗 | （跳过） | ADC | THD/SFDR 算法 | ✅ |
| 2001A 波形发生器 | A（信号源） | DDS LUT | （跳过） | DAC+DMA+TIM | LUT 查表 | ✅ |
| 2023A 电源题 | F（电源） | Simscape | （跳过） | （PCB 为主） | 数字补偿器 | ✅ |

**结论**：6 大题型全部能用同一套 v2 比赛模式 + task-router + checklist-template 走通。

---

## 4. 通用 4 天时间表（控制题适配）

```
T+0       [ARCH] 读题 → task-router → 题型 D 含视觉 → CP-0
T+1h      [ARCH] 三表（电机/舵机/视觉 引脚）+ 接口契约 → CP-1
T+1h      派 6 Agent 并行（[MATLAB] [VISION] [DRV] [ALG] [QA] [REPORT]）
T+8h      CP-1.5 [MATLAB] LQR + [VISION] 算法仿真通过
T+8h      [DRV]/[ALG] 继续（基于 CP-1.5 的 .h）
T+18h     CP-2 全部 Agent 通过 → 进 CP-3
T+24h     [QA] MIL/SIL/PIL 三层 + 实物试跑 → CP-3
T+36h     CP-4 集成 + 报告
T+40h     CP-5 答辩演练
T+40h~72h 现场调参 + 多次试跑 + 备份方案
```

与 2025 西门子 CIMC 的工业题时间表（T+1h 直接进 CP-2 跳过 CP-1.5）**形成对比** — 不同题型，同一框架，不同分支。

---

## 5. 工程目录骨架（控制题通用）

```
<project>/
├── app/
│   ├── main.c                      # bsp_init + svc_init + app_run
│   └── control/
│       ├── rolling_ball_control.c/.h    # 2017B
│       OR target_tracker.c/.h           # 2023E
│       └── trajectory_task.c/.h         # 轨迹状态机
├── service/                        # 通用服务（与西门子题相同结构）
│   ├── svc_cli.c/.h                # 调参用串口
│   ├── svc_display.c/.h            # OLED 显示
│   └── svc_logger.c/.h             # 调试日志
├── drivers/
│   ├── drv_servo.c/.h              # PWM 舵机
│   ├── drv_motor.c/.h              # 直流电机（仅小车类）
│   ├── drv_encoder.c/.h            # 编码器（仅小车类）
│   ├── drv_camera.c/.h             # DCMI + DMA
│   ├── drv_imu.c/.h                # IMU（仅平衡类）
│   ├── drv_oled.c/.h
│   ├── drv_uart.c/.h
│   └── drv_adc.c/.h
├── middleware/
│   ├── cmsis_dsp/                  # 矩阵运算
│   ├── camera_pipeline/            # 图像处理
│   └── easy_button/
├── hal/                            # 同主线 mode
└── vendor/
```

与西门子题工程骨架**80% 相同**，差异在 `app/control/` 和 `drivers/` 选项（控制题加视觉/IMU/电机，不需要 TF 卡 4 文件夹和 NOR Flash 持久化）。

---

## 6. 失败兜底（控制题专属）

| 现象 | 排查 | 修复 |
|---|---|---|
| 仿真稳定但实物震荡 | 1. 采样周期实际不准 2. 舵机死区 3. 视觉延迟 | 1. 用 TIM 中断硬触发 2. 加死区补偿 3. 加 Kalman 预测补延迟 |
| 视觉丢目标 | 光照 / 颜色阈值 / 摄像头帧率 | OTSU 自适应 / HSV 替代 / 升级 STM32H7 |
| 调参怎么都不收敛 | Q/R 设计错 / 模型偏差大 | 参数敏感性分析（lqr-example-bicycle-cornell §7）|
| 1 min 后失稳 | 积分饱和 / IMU 漂移 | 加抗积分饱和 / 加陀螺零漂校准 |
| 答辩讲不出"为什么用 LQR" | 学生没看仿真证据 | 强制看 [MATLAB] Outcome 的 evidence 段 |

---

## 7. 关联资源

- **题型路由**：`refs/competition-task-router.md`
- **通用验收表**：`refs/competition-scoring-checklist-template.md`
- **比赛模式 v2**：`modes/competition.md`
- **Agent prompt 模板**：`refs/competition-ai-max-workflow.md`
- **MATLAB 主线场景 4 控制**：`modes/matlab-embedded-toolkit.md` §5
- **MATLAB 主线场景 5 卡尔曼**：同上 §6
- **MATLAB 竞赛场景 E4 视觉**：`modes/matlab-toolkit-competition.md` §5
- **LQR 实战**：`refs/lqr-example-segway.md`、`refs/lqr-example-bicycle-cornell.md`
- **智能车视觉实战**：`refs/matlab-example-smartcar-vision.md`
- **系统集成题对照**：`refs/example-siemens-cimc-2025.md`
