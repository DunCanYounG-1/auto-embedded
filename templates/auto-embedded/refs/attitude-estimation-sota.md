# 高精度姿态解算（SOTA：VQF / MEKF / UKF-M / InEKF / 学习法）

> 本文件在以下情形按需加载：
> - 互补滤波 / Mahony / Madgwick **精度不够**，要"解算很准"的现代方案
> - 强动态加速度、磁干扰、要在线零偏估计，传统滤波扛不住
>
> 这是 `.auto-embedded/refs/imu-fusion-filter-selection.md`（选型脊柱）的**高精度深化篇**。
> Mahony/Madgwick 实现与四元数约定见 `.auto-embedded/refs/mahony-ahrs-reference.md`；
> IMU+轮速融合见 `.auto-embedded/refs/imu-wheel-ekf-fusion.md`。

---

## 结论先行

**当前实时嵌入式上"解算最准"的不是卡尔曼，是 VQF。**

- **要最准 + 还能跑在 Cortex-M4F** → **VQF**（定参开箱、抗动态加速度+磁扰、在线零偏，BROAD 基准上 RMSE 比 Mahony/Madgwick 低 1.8–5×）。
- **要卡尔曼范式 / 不确定度 / 航天级** → **MEKF**（乘性 EKF）。
- **研究/泛化极限** → **RIANN**（GRU 神经网，但需 NN 运行时，MCU 性价比低）。

> ⚠ 精度的另一半来自**标定**：陀螺 Allan 方差定噪声、加计/磁力计椭球标定。再好的滤波器喂脏数据也白搭，见 `imu-gyroscope-checklist.md`。

---

## SOTA 方案对比

### ⭐ VQF（Versatile Quaternion-based Filter, Laidig & Seel 2022/2023）

- **核心**：陀螺捷联积分做预测；**在准惯性系对加计做低通**实现倾角校正——不靠运动检测就能抗动态加速度；磁力计做**解耦航向校正 + 磁扰检测/抑制**；**在线陀螺零偏估计**；有实时（因果）与离线（acausal 平滑）两个变体。参数只有几个时间常数，**默认值跨数据集通用**。
- **精度**：BROAD/OxIOD/RepoIMU/Sassari 多基准最佳；挑战动作 RMSE ~2–4° vs Mahony/Madgwick 5–16°。可 6D（陀螺+加计，倾角）或 9D（加磁，全航向）。
- **磁扰/零偏**：优——三者全在线处理。
- **MCU 可行性**：**高**。纯 C++（可移植 C），无动态分配，浮点量适中，Cortex-M4F 实时跑得动。
- **开源**：[github.com/dlaidig/vqf](https://github.com/dlaidig/vqf)（MIT，C++/Python/Matlab）；基准 [github.com/dlaidig/broad](https://github.com/dlaidig/broad)；论文 arXiv:2203.17024。
- **陷阱**：采样率要够；航向仍需磁力计标定；参数是时间常数（默认稳，但仍属标定项）。
- **M4F 接入清单**：①用官方纯 C 入口 `vqf.c` / `basicvqf.c`（已无动态分配）；②构造参数采样周期 `Ts=1/fs` 来自定时器、不硬编码；③每周期调 `vqf_update(gyr[rad/s], acc[m/s²], mag可选)` 取四元数；④6 轴(陀螺+加计)还是 9 轴(加磁)取决于是否有已标定磁力计；⑤四元数/坐标系约定与 `mahony-ahrs-reference.md` 核对（w-first/Hamilton/机体→世界），输出欧拉角换算复用本仓。

### MEKF（乘性扩展卡尔曼滤波，航天金标准）

- **核心**：SO(3) 上用**四元数乘性误差**（3 维误差旋转 + 陀螺零偏）的误差状态 EKF；参考四元数单独传播，更新后误差重置——本质即"只估姿态的 ESKF"。
- **精度**：调好后优于 Mahony/Madgwick；星敏/太阳敏融合的标准范式。
- **磁扰/零偏**：好（零偏入状态；磁扰靠调 R / 门控）。
- **MCU 可行性**：中高，小定长矩阵（~6 维），<1ms@1kHz；FPU 重但可优化。
- **开源**：[thomaspasser/q-mekf](https://github.com/thomaspasser/q-mekf)（C++）。
- **陷阱**：强动态下 Jacobian 线性化退化；对初始协方差敏感；要 Q/R 整定。
- **落地骨架**：本质是"只估姿态的 ESKF"——状态=[名义 q, 陀螺零偏 bg]、误差态=[δθ(3), δbg(3)]=6 维；预测/更新/注入三步、Joseph form、Q/R 来源直接复用 `imu-wheel-ekf-fusion.md`（去掉位置/速度即可）；上电先做单帧初始对准（见 `attitude-init-single-frame.md`）。

### UKF-M / USQUE（流形无迹卡尔曼 / 无迹四元数估计器）

- **核心**：在旋转流形上取 sigma 点（用 MRP/旋转矢量误差保四元数单位），无迹变换传播，**免 Jacobian**。
- **精度**：强非线性下与/略优于 EKF 类。
- **MCU 可行性**：中——2n+1 个 sigma 点，compute 比 VQF/MEKF 高。
- **开源**：[sfwa/ukf](https://github.com/sfwa/ukf)。
- **陷阱**：sigma 点缩放参数敏感；算力开销。

### InEKF（不变扩展卡尔曼滤波）

- **核心**：误差按群作用定义（左/右不变），**误差动力学与状态无关（对数线性）**→ 收敛域大、一致性强。姿态用 SO(3)，导航用 SE₂(3)（IMU+接触/里程）。
- **精度**：一致性优于标准 EKF；鲁棒。
- **磁扰/零偏**：优（不变性 + 自适应噪声）。
- **MCU 可行性**：低-中——理论上流形保持可优化，但需矩阵库 + 李群 exp/log，Cortex-M4F 上勉强、电赛多为 overkill（与 `imu-fusion-filter-selection.md` 选型脊柱口径一致）。
- **开源**：[RossHartley/invariant-ekf](https://github.com/RossHartley/invariant-ekf)（C++）。
- **陷阱**：李群数学/实现复杂；自适应调参要小心。

### RIANN（GRU 神经网姿态估计）

- **核心**：端到端 GRU 循环网络，输入陀螺+加计（6D，免磁）+ 采样率，直接输出四元数；**推理免调参**，多数据集训练、跨运动/采样率泛化。
- **精度**：优于调好的 Mahony/Madgwick，尤其动态场景。
- **MCU 可行性**：⚠️ **被高估**——裸 MCU 需 NN 运行时（CMSIS-NN/TFLite-Micro）+ 模型入 Flash，非"无 malloc 轻量"；模型虽小但有运行时依赖。
- **开源**：[daniel-om-weber/riann_dev](https://github.com/daniel-om-weber/riann_dev)；论文 arXiv:2104.07391。
- **陷阱**：需训练数据/模型；可解释性差；运行时依赖。

---

## 初始对准：先给滤波器一个好初值（别只靠高增益硬收敛）

上面所有递推滤波器都对**初值**敏感（MEKF 尤其"对初始协方差敏感"）。常见的 `q=(1,0,0,0)` + 上电拉高 Kp 硬收敛只是 workaround：开机前几秒姿态发散，且只对倾角有效、不解决航向。

**更优解**：上电静止时用一帧加计(+磁)做**确定性单帧定姿**（Wahba 问题：TRIAD / QUEST / SVD），闭式解出初始四元数 `q₀` 与初始协方差，让滤波器"开机即对准"。计算量极小（TRIAD 仅几个叉乘），M0+/M4F 都跑得动，适配 Mahony/EKF/ESKF/MEKF/VQF 全部。方法、取舍与 C 骨架见 `.auto-embedded/refs/attitude-init-single-frame.md`。

---

## 选型与落地建议

| 诉求 | 选 | 理由 |
|---|---|---|
| 最准 + 实时 MCU | **VQF** | SOTA 精度、定参开箱、抗动态/磁扰、C++ 无 malloc |
| 卡尔曼/不确定度/航天 | MEKF | 误差状态标准范式 |
| 强非线性、不想写 Jacobian | UKF-M | 免 Jacobian，代价算力 |
| 足式/接触辅助/要一致性 | InEKF | 不变误差、收敛域大 |
| 研究/极限泛化 | RIANN | 学习法,但需 NN 运行时 |
| 轻量/够用 | Mahony | 计算极小、够稳（见 mahony 篇） |

**电赛实操**：要"很准"且时间够 → 移植 **VQF**（有 C/C++ 参考，按上文"M4F 接入清单"做 C 移植 + 约定对齐，并上电先单帧对准）；纯姿态要卡尔曼 → **MEKF**；资源极紧/精度够用 → Mahony。

> ⚠ 这些滤波器的时间常数 / Q / R / 增益**都是标定参数**：优先用上游默认（VQF），需要调时带单位+来源+测量方法+适用硬件，禁裸魔法数字，见 `coding-standards.md` §4.1。

---

## 输出后处理平滑层（与解算器分层，按需）

⚠ **解算 ≠ 平滑**：上面是"求姿态"，这里是"让输出更顺"，两层职责不同、不要互相替代。云台 / 视频防抖 / 显示末端若嫌四元数/欧拉角抖，在解算器**之后**叠一层输出平滑：

- **欧拉角 / 位置**：One-Euro Filter（自适应截止——慢动作强平滑、快动作低延迟，两参 `fc_min` / `beta` 属标定项）。
- **四元数**：Slerp-EMA（`q_out = slerp(q_prev, q_new, α)`）或双指数，避免逐分量 EMA 破坏单位长度。

> 注意：①这是输出抖动抑制的通用技法，不是"云台工业标准"（实体云台主要靠机械 + 控制环）；②过度平滑增延迟；③**别用"加大解算器低通 / 降 Kp"来兼当输出平滑**——那会拖慢姿态估计本身。电赛主场景（平衡车/小车/四旋翼）应把低滞后姿态**直接喂控制器**，通常不需要这一层。

---

## 交叉引用

- `imu-fusion-filter-selection.md` —— 选型脊柱（本篇是其高精度深化）
- `mahony-ahrs-reference.md` —— 轻量基线、四元数约定（VQF/MEKF 也遵循）
- `attitude-init-single-frame.md` —— 单帧确定性定姿（TRIAD/QUEST）：给滤波器初值/初始对准
- `imu-wheel-ekf-fusion.md` —— 把高精度姿态接入 IMU+轮速位置融合
- `imu-gyroscope-checklist.md` —— 标定（Allan 方差/椭球）：精度的另一半
- `coding-standards.md` §4.1 —— 滤波参数/Q/R 标定溯源
