# Mahony AHRS 姿态解算算法参考

> 高精度姿态解算参考（平衡车 / 无人机 / 机器人）。基于四元数的非线性互补滤波器，融合陀螺仪 + 加速度计，避免欧拉角万向锁。
>
> **与互补滤波对比**：互补滤波用欧拉角、有万向锁、计算极小、精度中等；Mahony 用四元数、无万向锁、计算中等、精度高。

---

## 最小实现（IMU 双传感器版本）

```c
#include <math.h>
#define Ang2Rad 0.01745329252f
#define Rad2Ang 57.295779513f

// —— 可调参数 ——
#define sampleFreq  200.0f                 // 采样频率 Hz
#define twoKpDef    (2.0f * 0.5f)          // 比例增益，常用 1.0
#define twoKiDef    (2.0f * 0.0f)          // 积分增益，常用 0.0；非零启用零偏估计

// —— 状态变量 ——
volatile float q0 = 1.0f, q1 = 0.0f, q2 = 0.0f, q3 = 0.0f;
volatile float integralFBx = 0.0f, integralFBy = 0.0f, integralFBz = 0.0f;
volatile float invsampleFreq = 1.0f / sampleFreq;
volatile float twoKp = twoKpDef, twoKi = twoKiDef;
float Pitch_a_Pi, Roll_a_Pi, Yaw_a_Pi;     // 输出欧拉角（弧度）

// —— Quake III 快速 1/sqrt ——
static float invSqrt(float x) {
    float halfx = 0.5f * x, y = x;
    long i = *(long*)&y;
    i = 0x5f3759df - (i >> 1);
    y = *(float*)&i;
    return y * (1.5f - (halfx * y * y));
}

// —— 核心更新 ——
void MahonyAHRSupdateIMU(float gx, float gy, float gz,   // 角速度 °/s
                         float ax, float ay, float az)   // 加速度 任意单位
{
    float recipNorm, halfvx, halfvy, halfvz, halfex, halfey, halfez, qa, qb, qc;

    if (!(ax == 0.0f && ay == 0.0f && az == 0.0f)) {
        gx *= Ang2Rad; gy *= Ang2Rad; gz *= Ang2Rad;

        // 归一化加速度
        recipNorm = invSqrt(ax*ax + ay*ay + az*az);
        ax *= recipNorm; ay *= recipNorm; az *= recipNorm;

        // 估计重力方向 + 误差（交叉积）
        halfvx = q1*q3 - q0*q2;
        halfvy = q0*q1 + q2*q3;
        halfvz = q0*q0 - 0.5f + q3*q3;
        halfex = ay*halfvz - az*halfvy;
        halfey = az*halfvx - ax*halfvz;
        halfez = ax*halfvy - ay*halfvx;

        // 积分反馈（陀螺仪零偏修正），twoKi=0 时禁用
        if (twoKi > 0.0f) {
            integralFBx += twoKi * halfex * invsampleFreq;
            integralFBy += twoKi * halfey * invsampleFreq;
            integralFBz += twoKi * halfez * invsampleFreq;
            gx += integralFBx; gy += integralFBy; gz += integralFBz;
        } else {
            integralFBx = integralFBy = integralFBz = 0.0f;  // 防饱和
        }

        // 比例反馈
        gx += twoKp * halfex; gy += twoKp * halfey; gz += twoKp * halfez;
    }

    // 四元数微分积分
    gx *= 0.5f * invsampleFreq;
    gy *= 0.5f * invsampleFreq;
    gz *= 0.5f * invsampleFreq;
    qa = q0; qb = q1; qc = q2;
    q0 += -qb*gx - qc*gy - q3*gz;
    q1 +=  qa*gx + qc*gz - q3*gy;
    q2 +=  qa*gy - qb*gz + q3*gx;
    q3 +=  qa*gz + qb*gy - qc*gx;

    // 归一化四元数
    recipNorm = invSqrt(q0*q0 + q1*q1 + q2*q2 + q3*q3);
    q0 *= recipNorm; q1 *= recipNorm; q2 *= recipNorm; q3 *= recipNorm;

    // 四元数 → Z-Y-X 欧拉角（弧度）
    float r11 = 2.0f * (q0*q1 + q2*q3);
    float r12 = 1.0f - 2.0f * (q1*q1 + q2*q2);
    float r21 = 2.0f * (q0*q2 - q3*q1);
    float r31 = 2.0f * (q0*q3 + q1*q2);
    float r32 = 1.0f - 2.0f * (q2*q2 + q3*q3);
    Yaw_a_Pi   = atan2f(r31, r32);
    Pitch_a_Pi = -asinf(r21);   // 注意负号
    Roll_a_Pi  = atan2f(r11, r12);
}
```

> **9 轴版本（含磁力计）**：用 `MahonyAHRSupdate(gx,gy,gz, ax,ay,az, mx,my,mz)` — 多加磁场归一化和误差项；不需要的话**保持 IMU 版即可，但 yaw 会缓慢漂移**（无外部参考）。

---

## 可选预滤波

进 Mahony 前对原始 gx/gy/gz、ax/ay/az 做**二阶低通**（10–30 Hz，Q=0.707 Butterworth）。MPU6050/ICM20602 也可用片上 DLPF 替代（推荐 DLPF=42Hz/20Hz 起步）。

完整 biquad 实现网上有现成（约 30 行）；初始化公式：
```
w0 = 2π·fc/fs, α = sin(w0)/(2Q)
低通: b0 = (1-cos(w0))/2, b1 = 1-cos(w0), b2 = b0,
       a0 = 1+α,         a1 = -2cos(w0), a2 = 1-α
```

---

## 调用顺序（main loop 内）

```c
// 1. 读取原始传感器（含轴映射 / 反向修正！见后文）
imu_read(&gx, &gy, &gz, &ax, &ay, &az);

// 2. （可选）预滤波
gx = biquad_apply(&gx_filter, gx);  // 其他轴同理

// 3. 单位检查：gx/gy/gz 必须 °/s（不是 rad/s 或 LSB 原始值）

// 4. 调用 Mahony
MahonyAHRSupdateIMU(gx, gy, gz, ax, ay, az);

// 5. 输出欧拉角（弧度 → 度，按需）
float roll_deg  = Roll_a_Pi  * Rad2Ang;
float pitch_deg = Pitch_a_Pi * Rad2Ang;
float yaw_deg   = Yaw_a_Pi   * Rad2Ang;

// 6. 把姿态喂给控制器
```

> ⚠ **轴映射检查最重要**：开机静止时 ax≈0, ay≈0, az≈±1g（看安装方向）。若装反或 90° 旋转，必须**在传给 Mahony 前**做轴交换/取反，**不要**事后改公式。详见 `.auto-embedded/refs/imu-gyroscope-checklist.md`。

---

## 参数调优

| 参数 | 默认 | 调高 | 调低 |
|---|---|---|---|
| `twoKp`（比例增益） | 1.0 | 加速度计权重增加，姿态跟随加速度更快但噪声更大 | 主要靠陀螺，慢但平滑 |
| `twoKi`（积分增益） | 0.0 | 修正陀螺零漂，但易振荡 / 初值未收敛会乱跑 | 完全禁用零漂修正 |
| `sampleFreq` | 200 | 计算 / 中断负担更大；高频运动场景需要 | 易丢动态、姿态滞后 |
| 预滤波截止 fc | 20 Hz | 噪声更多但响应更快 | 滞后增大 |

### 症状对照表

| 症状 | 可能原因 | 动作 |
|---|---|---|
| 静止时角度缓慢漂移 | 陀螺零偏未补偿 | 启用积分（`twoKi = 0.1f`）或开机静止采 1s 求零偏 |
| 抖动 / 角度跳变 | 加速度计噪声 / Kp 过大 | Kp 减半、加 DLPF 或 biquad 低通 |
| 振动环境角度跑飞 | 加速度计被结构共振污染 | 减 Kp 或机械减振 |
| Yaw 不准 / 漂移 | IMU 版本只用加速度，无 yaw 参考 | 上 9 轴版（加磁力计）；磁场环境差则接受漂移或加视觉/编码器 |
| 初始几秒发散 | 初值 q=(1,0,0,0) 与实际偏差大 + Kp 太小 | 上电前 1–2s 用 Kp=5 加速收敛后切回正常值 |
| 倾斜方向反 | 轴映射错 | 在传入 Mahony 前 negate 对应轴，不要改 Mahony 内部公式 |

---

## 限制 / 注意

- **IMU 版无 yaw 绝对参考**，yaw 一定会慢慢漂；要绝对 yaw 必须用 9 轴 + 磁力计校准
- **快速旋转下** Mahony 略逊 Madgwick；常规场景两者差不多
- **嵌入式实现**：4 个 sinf/cosf 在 Cortex-M4F 上 ~150 cycles；可接受
- `volatile` 仅为防止编译器优化中断里的写入；多核 / RTOS 下需要更严格同步
