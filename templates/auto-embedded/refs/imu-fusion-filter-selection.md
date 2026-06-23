# IMU 姿态/状态估计：滤波器选型决策

> 本文件在以下情形按需加载：
> - 要为一个新工程选"姿态/位置估计"方案，纠结用互补滤波 / Mahony / Madgwick / 卡尔曼
> - 现有方案不够（漂移、要不确定度、要融合编码器/磁力计）想升级，但不确定升到哪一档
>
> 这是**决策脊柱**：只回答"何时 reach for 哪个"，不写实现。具体实现见各专篇：
> `.auto-embedded/refs/mahony-ahrs-reference.md`、`.auto-embedded/refs/imu-wheel-ekf-fusion.md`、
> `.auto-embedded/refs/omni-wheel-odometry.md`、`.auto-embedded/refs/imu-gyroscope-checklist.md`、
> `.auto-embedded/refs/attitude-estimation-sota.md`（高精度 VQF/MEKF 深化）。

---

## 铁律

**先问"要估什么、有什么传感器、能容忍多少漂"，再选滤波器——不要一上来就上 Kalman。**

- 滤波器**不创造可观测性**：缺绝对参考的量（如无磁力计的 yaw）**任何滤波都修不掉漂移**，只能延缓。升级滤波器前先确认"要估的量物理上可观测"。
- 复杂度阶梯：互补 < Mahony/Madgwick < EKF/ESKF < UKF < InEKF。**每升一档都要有明确理由**（多一个传感器、要不确定度、强非线性）。为"显得高级"上 UKF/InEKF 是反模式。
- 上任何滤波前，先做**轴映射 + 量程 + 零偏标定**（见 `imu-gyroscope-checklist.md`）——脏输入喂再好的滤波器也白搭。

---

## 选型决策表（Cortex-M4F 视角）

| 方案 | 机理 | 传感器 | 给不确定度? | 计算@M4F | 漂移行为 | 何时选 | MCU/电赛判据 |
|---|---|---|---|---|---|---|---|
| 一阶互补滤波 | 高通陀螺 + 低通加计（欧拉角） | 6 轴 | 否 | 极低 | roll/pitch 稳；yaw 漂 | 只要 roll/pitch、资源极紧 | ✅ 入门首选 |
| **Mahony** | PI 反馈修正四元数 | 6/9 轴 | 否 | 低(~150cyc) | 同上；9 轴可定 yaw | 平衡车/四旋翼、精度够用 | ✅ 轻量默认 |
| **Madgwick** | 梯度下降对齐重力/磁 | 6/9 轴 | 否 | 中(FPU) | 同上；快速旋转更优 | 有磁力计、动态强 | ✅ Mahony 同类替代 |
| **VQF** ⭐ | 准惯性系低通 + 磁扰抑制 + 在线零偏 | 6/9 轴 | 否 | 中 | 抗动态加速度，精度最高 | **要解算很准**、强动态/磁扰 | ✅ **高精度首选**（见 sota 篇） |
| **MEKF** | 乘性 EKF（四元数误差状态） | 6/9 轴 | 是 | 中高 | 带协方差 | 卡尔曼范式/航天级纯姿态 | ✅ 见 sota 篇 |
| 标准 EKF 姿态 | 四元数 EKF + Jacobian | 6/9 轴 | 是 | 中 | 带协方差 | 需不确定度、要门控异常观测 | ✅ 但多数姿态场景 Mahony 够 |
| **ESKF（IMU+编码器）** | 误差状态卡尔曼，轮速作观测 | IMU+编码器 | 是 | 中高(定长矩阵) | 位置短期好；仍受 yaw 漂限制 | 走位/定点、打滑、要位置不确定度 | ✅ 见 `imu-wheel-ekf-fusion.md` |
| UKF | 无迹变换，免 Jacobian | IMU(+) | 是 | 中高(~200µs/次) | 同 EKF | Jacobian 难写/强非线性 | ⚠️ 多数电赛 overkill |
| InEKF | 李群不变误差动力学 | IMU+接触/里程 | 是 | 高(需矩阵库) | 收敛性更好 | 足式/接触辅助、研究 | ⚠️ MCU 勉强，电赛 overkill |
| ZUPT 足绑 INS | 触地零速更新修偏 | 足绑 IMU | 是 | 低+检测 | 行人步态定位 | 足绑/行人，非轮式车 | ◻ 罕见，了解即可 |

---

## 决策流程（自顶向下，命中即停）

1. **只要 roll/pitch、资源极紧** → 一阶互补滤波。
2. **要四元数、无万向锁、平衡车/四旋翼、精度够用** → **Mahony**（轻量默认；实现见 mahony 专篇）。
3. **要解算很准 / 强动态加速度 / 磁扰严重** → **VQF**（SOTA，定参开箱）；纯姿态要卡尔曼/不确定度 → **MEKF**。详见 `attitude-estimation-sota.md`。
4. **有磁力计、动态剧烈、要更好 yaw（轻量档内）** → Madgwick 或 9 轴 Mahony。
5. **要平面位置/走位/定点（轮式）** → 先用航位推算（`omni-wheel-odometry.md`）；**打滑严重 / 要位置不确定度 / 长程** → 升 **ESKF 融合编码器**（`imu-wheel-ekf-fusion.md`）。
6. **要不确定度、要门控异常观测、多传感器异步** → EKF（ESKF 是其在 IMU 场景的更优形态）。
7. **Jacobian 难写 / 强非线性** → UKF（代价：~200µs/次、sigma 点调参）。
8. **足式 / 接触辅助 / 研究级** → InEKF（重，MCU 上需大幅优化）。

---

## 各方案陷阱速查

| 方案 | 最常见陷阱 |
|---|---|
| 一阶互补 | α 与 dt 不匹配 → 时间常数错；只给欧拉角有万向锁 |
| Mahony | `twoKp` 过大→抖、过小→慢；`twoKi`≠0 但初值未收敛会乱跑；振动污染加计 |
| Madgwick | 低磁/强运动漂；`β` 调参；需要磁校准 |
| EKF/ESKF | Q/R 设计拍脑袋；协方差失正定（要对称化/Joseph form）；时间戳不同步 |
| UKF | sigma 点缩放参数；比 EKF 慢；收益常被高估 |
| InEKF | 李群数学开销；代码/理论复杂；MCU 内存吃紧 |
| 通用 | **指望滤波器修正不可观测量**（无参考 yaw 必漂）——选错档的根因 |

---

## 电赛默认推荐（按题型）

- **平衡车 / 姿态控制** → 精度够用用 Mahony（6 轴）；**要解算很准用 VQF**（见 `attitude-estimation-sota.md`）；有磁场条件好可上 9 轴/Madgwick。
- **全向/差速走位、定点** → 航位推算起步（`omni-wheel-odometry.md`）；打滑/长程再上 ESKF。
- **需要绝对 yaw** → 9 轴磁力计 + 校准；无磁场条件则接受漂移或加视觉/编码器约束，别幻想纯陀螺能稳。

> ⚠ 滤波器的增益、Q/R、β、α、死区**都是要标定溯源的参数**，禁止跨工程照抄数值，规范见 `coding-standards.md` §4.1。把赛场妥协当通用方案的反例见 `case-dcar-control-defects.md`。

---

## 交叉引用

- `attitude-estimation-sota.md` —— 高精度深化：VQF/MEKF/UKF-M/InEKF/RIANN
- `mahony-ahrs-reference.md` —— Mahony/Madgwick 实现、四元数约定
- `imu-wheel-ekf-fusion.md` —— ESKF 融合 IMU+编码器（第 4 档升级）
- `omni-wheel-odometry.md` —— 航位推算（融合前的起步方案）
- `imu-gyroscope-checklist.md` —— 选滤波器前必做的轴/量程/零偏标定
- `coding-standards.md` §4.1 —— 滤波参数/Q/R 的标定溯源
