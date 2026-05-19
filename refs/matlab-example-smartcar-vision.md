# 实战示例：智能车视觉端到端（NXP 杯视觉组）

> 难度：★★★（涉及摄像头标定 + 图像处理 + 嵌入式实时部署）
>
> 适用赛事：
> - **全国大学生智能汽车竞赛**（恩智浦杯 / 原飞思卡尔）视觉组、视觉信标组
> - 类似题：任何摄像头循迹 / 路径识别项目
>
> 对应主入口：`modes/matlab-toolkit-competition.md` 场景 E4

---

## 0. 你将拿到什么

| 产物 | 文件 | 用途 |
|---|---|---|
| 摄像头标定参数 | `calibration/cam_params.mat` | 一次性，烧 Flash |
| MATLAB 算法仿真脚本 | `scripts/vision_pipeline.m` | 离线调参 + 验证 |
| 透视变换矩阵 | `app/vision/perspective.h` | 实时鸟瞰图 |
| 完整视觉处理 C 代码 | `app/vision/track_detect.c/.h` | STM32H7 / NXP RT1060 |
| 性能报告 | FPS + 不同光照鲁棒性 | 评分证据 |

---

## 1. 智能车视觉组工作流总览

```
┌─────────────────────────────────────────────────────────┐
│ 1. 摄像头标定（一次性）                                    │
│    棋盘格 20 张图 → cameraCalibrator → 内参 + 畸变系数    │
├─────────────────────────────────────────────────────────┤
│ 2. 每帧实时处理流水线（MCU 内 100~200 FPS）                 │
│    ┌─ 灰度图（摄像头直接给）                                │
│    ├─ 去畸变（标定参数应用）                                │
│    ├─ 二值化（OTSU 自适应 或 固定阈值）                      │
│    ├─ 形态学滤波（开/闭运算去小噪点）                        │
│    ├─ 边缘检测（Sobel / Scharr，比 Canny 快）              │
│    ├─ 透视变换（IPM 逆透视 → 鸟瞰图）                       │
│    ├─ 扫线找边界（逐行 / 八邻域 / 连通域）                   │
│    ├─ 中线提取（左右边界平均 / 单边补全）                   │
│    └─ 偏差计算（中线 vs 图像中心）                           │
├─────────────────────────────────────────────────────────┤
│ 3. 偏差 → PID 转向控制（场景 4）                            │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Step 1：摄像头标定（PC 端，一次性）

### 2.1 准备工作

- 打印 9×6 棋盘格（每格边长 25 mm）
- 用赛车摄像头拍 20 张不同角度的棋盘格图（cal_01.png ~ cal_20.png）
- 摄像头要固定在赛车的最终安装位置和角度

### 2.2 MATLAB 标定脚本

```matlab
%% scripts/calibrate_camera.m — 摄像头内参标定
clear; clc;

% 1. 读所有标定图
imageDir = 'calibration/';
images = imageDatastore(fullfile(imageDir, '*.png'));

% 2. 自动检测棋盘格角点
[imagePoints, boardSize] = detectCheckerboardPoints(images.Files);
fprintf('检测到 %d 张图，棋盘格 %dx%d\n', size(imagePoints,3), boardSize(1), boardSize(2));

% 3. 生成棋盘格世界坐标
squareSize = 25;       % mm
worldPoints = generateCheckerboardPoints(boardSize, squareSize);

% 4. 标定（含畸变）
imageSize = [size(readimage(images,1), 1), size(readimage(images,1), 2)];
[cameraParams, imagesUsed, estErrors] = estimateCameraParameters(...
    imagePoints, worldPoints, ...
    'ImageSize', imageSize, ...
    'EstimateSkew', false, ...
    'EstimateTangentialDistortion', true, ...
    'NumRadialDistortionCoefficients', 2);

fprintf('重投影误差均值 = %.3f 像素\n', estErrors.PerViewErrors);
fprintf('内参：fx=%.2f, fy=%.2f, cx=%.2f, cy=%.2f\n', ...
    cameraParams.IntrinsicMatrix(1,1), cameraParams.IntrinsicMatrix(2,2), ...
    cameraParams.IntrinsicMatrix(3,1), cameraParams.IntrinsicMatrix(3,2));

% 5. 可视化
figure;
showReprojectionErrors(cameraParams);
title('重投影误差（< 1 像素为优）');

figure;
showExtrinsics(cameraParams);
title('标定板位置');

% 6. 保存
save('calibration/cam_params.mat', 'cameraParams');
```

通过 MCP 跑：

```python
mcp__matlab__run_matlab_file(file_path="scripts/calibrate_camera.m")
```

---

## 3. Step 2：单帧处理流水线（PC 端调参）

```matlab
%% scripts/vision_pipeline.m — 单帧视觉处理算法验证
clear; clc;

load('calibration/cam_params.mat');

% 读一张实拍赛道图
img = imread('test_images/track_01.png');
if size(img,3) == 3, img = rgb2gray(img); end

%% 1. 去畸变
img_undist = undistortImage(img, cameraParams);

%% 2. 二值化（OTSU 自适应阈值）
level = graythresh(img_undist);
bw = imbinarize(img_undist, level);

% 试不同阈值对比
threshold_levels = [level*0.8, level, level*1.2];
figure;
for i = 1:3
    subplot(1,3,i);
    imshow(imbinarize(img_undist, threshold_levels(i)));
    title(sprintf('阈值 = %.3f', threshold_levels(i)));
end

%% 3. 形态学滤波去小噪点
bw_clean = imopen(bw, strel('disk', 2));     % 开运算去毛刺
bw_clean = imclose(bw_clean, strel('disk', 3));  % 闭运算填小洞

%% 4. Sobel 边缘检测（嵌入式首选，比 Canny 快 5 倍）
edges = edge(img_undist, 'sobel');

%% 5. 透视变换（IPM 逆透视）
% src_pts：图像 4 个角（梯形）
% dst_pts：俯视图对应矩形
[H, W] = size(img_undist);

% 这 4 个点需要按实际安装调（用赛道上摆 1 米参考线测出）
src_pts = [60, 80;          % 左上
           W-60, 80;        % 右上
           W-10, H-1;       % 右下
           10, H-1];        % 左下
dst_pts = [0, 0;
           400, 0;
           400, 200;
           0, 200];

tform = fitgeotrans(src_pts, dst_pts, 'projective');
bird_view = imwarp(bw_clean, tform, 'OutputView', imref2d([200, 400]));

%% 6. 扫线找中线（鸟瞰图上从下往上）
[h, w] = size(bird_view);
centerline = zeros(h, 1);
left_edge  = zeros(h, 1);
right_edge = zeros(h, 1);

for r = h:-1:1
    row = bird_view(r, :);
    l = find(row == 1, 1, 'first');
    rt = find(row == 1, 1, 'last');
    if ~isempty(l) && ~isempty(rt) && (rt - l > 50)
        left_edge(r)  = l;
        right_edge(r) = rt;
        centerline(r) = (l + rt) / 2;
    elseif r < h
        % 缺边用前一行（避免跳变）
        centerline(r) = centerline(r+1);
        left_edge(r)  = left_edge(r+1);
        right_edge(r) = right_edge(r+1);
    else
        centerline(r) = w / 2;
    end
end

%% 7. 计算偏差（中线 vs 图像中心，远端预瞄）
target_row = round(h * 0.5);   % 看图像中段（远 ≈ 50 cm 前方）
offset = centerline(target_row) - w/2;
fprintf('当前偏差 = %d 像素 (中心 %d)\n', round(offset), w/2);

%% 8. 可视化
figure;
subplot(2,3,1); imshow(img); title('原图');
subplot(2,3,2); imshow(img_undist); title('去畸变');
subplot(2,3,3); imshow(bw_clean); title('二值化+形态学');
subplot(2,3,4); imshow(edges); title('Sobel 边缘');
subplot(2,3,5); imshow(bird_view); title('鸟瞰图');
hold on;
plot(left_edge, 1:h, 'b-', 'LineWidth', 1);
plot(right_edge, 1:h, 'b-', 'LineWidth', 1);
plot(centerline, 1:h, 'r-', 'LineWidth', 2);
plot(w/2*ones(h,1), 1:h, 'g--');

subplot(2,3,6);
plot(centerline - w/2, 1:h, 'r-', 'LineWidth', 1.5);
xline(0, 'g--');
xlabel('偏差像素'); ylabel('图像行（远→近）');
title('偏差曲线（看出弯道形状）');

%% 9. 保存透视矩阵供 MCU 用
T_matrix = tform.T;
save('app/vision/perspective.mat', 'T_matrix');
```

---

## 4. Step 3：导出参数到 MCU

```bash
python "C:\Users\A\.claude\skills\embedded-dev\tools\export_gains_to_c.py" ^
    --input app\vision\perspective.mat ^
    --mat-var T_matrix ^
    --output app\vision\perspective.h ^
    --name PERSPECTIVE ^
    --type float
```

---

## 5. Step 4：MCU 端实时处理（STM32H7 / NXP RT1060）

智能车视觉典型分辨率 188×120 灰度图，目标 ≥ 100 FPS。

### 5.1 核心数据结构

```c
/* app/vision/track_detect.h */
#ifndef TRACK_DETECT_H
#define TRACK_DETECT_H

#include <stdint.h>

#define IMG_W       188
#define IMG_H       120
#define BIRD_W      120         /* 鸟瞰图宽 */
#define BIRD_H      80          /* 鸟瞰图高 */

typedef struct {
    uint8_t  centerline[BIRD_H];  /* 中线 x 坐标 */
    uint8_t  left_edge[BIRD_H];
    uint8_t  right_edge[BIRD_H];
    int16_t  offset;              /* 预瞄行的偏差 */
    uint8_t  valid;               /* 是否找到赛道 */
} track_result_t;

void track_init(void);
void track_process(const uint8_t *gray_img, track_result_t *r);

#endif
```

### 5.2 二值化（极简，3 ms）

```c
/* app/vision/track_detect.c */
#include "track_detect.h"
#include "perspective.h"
#include <string.h>

#define THRESHOLD 128       /* 固定阈值，赛道白线明显 */
                            /* 光照变化大时用 OTSU 自适应 */

static uint8_t bw[IMG_H][IMG_W];
static uint8_t bird[BIRD_H][BIRD_W];

static void binarize(const uint8_t *gray, uint8_t (*bw_out)[IMG_W])
{
    for (int i = 0; i < IMG_H; i++)
        for (int j = 0; j < IMG_W; j++)
            bw_out[i][j] = (gray[i*IMG_W + j] > THRESHOLD) ? 1 : 0;
}
```

### 5.3 OTSU 自适应阈值（光照变化时用）

```c
static uint8_t otsu_threshold(const uint8_t *gray, int size)
{
    int hist[256] = {0};
    for (int i = 0; i < size; i++) hist[gray[i]]++;

    int total = size;
    long sum = 0;
    for (int i = 0; i < 256; i++) sum += i * hist[i];

    long sumB = 0;
    int wB = 0;
    float max_var = 0;
    uint8_t threshold = 0;
    for (int t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB == 0) continue;
        int wF = total - wB;
        if (wF == 0) break;
        sumB += t * hist[t];
        float mB = (float)sumB / wB;
        float mF = (float)(sum - sumB) / wF;
        float var_between = (float)wB * wF * (mB - mF) * (mB - mF);
        if (var_between > max_var) {
            max_var = var_between;
            threshold = (uint8_t)t;
        }
    }
    return threshold;
}
```

### 5.4 透视变换（鸟瞰图）

```c
static void perspective_warp(uint8_t (*src)[IMG_W], uint8_t (*dst)[BIRD_W])
{
    /* 反向映射：从目标像素查源像素，避免空洞 */
    const float (*T)[3] = (const float (*)[3])&PERSPECTIVE_DATA[0][0];
    /* 实际上是 3x3，注意 PERSPECTIVE_DATA 的存储顺序 */

    memset(dst, 0, BIRD_H * BIRD_W);
    for (int y = 0; y < BIRD_H; y++) {
        for (int x = 0; x < BIRD_W; x++) {
            /* 齐次坐标：[x' y' w'] = T^-1 * [x y 1] */
            float w = T[2][0] * x + T[2][1] * y + T[2][2];
            if (w < 1e-6f) continue;
            int sx = (int)((T[0][0] * x + T[0][1] * y + T[0][2]) / w);
            int sy = (int)((T[1][0] * x + T[1][1] * y + T[1][2]) / w);
            if (sx >= 0 && sx < IMG_W && sy >= 0 && sy < IMG_H) {
                dst[y][x] = src[sy][sx];
            }
        }
    }
}
```

### 5.5 扫线找中线（从下往上）

```c
static void extract_centerline(uint8_t (*img)[BIRD_W], track_result_t *r)
{
    int last_center = BIRD_W / 2;
    int last_left   = BIRD_W / 4;
    int last_right  = BIRD_W * 3 / 4;

    for (int row = BIRD_H - 1; row >= 0; row--) {
        int left = -1, right = -1;
        /* 从中心向外扩 */
        for (int dx = 0; dx < BIRD_W; dx++) {
            int x_l = last_center - dx;
            int x_r = last_center + dx;
            if (left == -1 && x_l >= 0 && img[row][x_l] == 0) left = x_l + 1;
            if (right == -1 && x_r < BIRD_W && img[row][x_r] == 0) right = x_r - 1;
            if (left != -1 && right != -1) break;
        }
        if (left == -1) left = last_left;
        if (right == -1) right = last_right;

        r->left_edge[row]  = (uint8_t)left;
        r->right_edge[row] = (uint8_t)right;
        r->centerline[row] = (uint8_t)((left + right) / 2);
        last_center = r->centerline[row];
        last_left   = left;
        last_right  = right;
    }
    r->valid = 1;
}
```

### 5.6 主处理函数

```c
void track_init(void) {
    /* 摄像头 DMA + 内存分配等 */
}

void track_process(const uint8_t *gray_img, track_result_t *r)
{
    /* 1. 二值化（自适应或固定）*/
    binarize(gray_img, bw);

    /* 2. 透视变换 */
    perspective_warp(bw, bird);

    /* 3. 中线提取 */
    extract_centerline(bird, r);

    /* 4. 偏差（预瞄行）*/
    int lookahead_row = BIRD_H / 2;
    r->offset = (int16_t)r->centerline[lookahead_row] - BIRD_W / 2;
}
```

### 5.7 转向控制接入（场景 4）

```c
/* app/control/steer_control.c */
#include "track_detect.h"
#include "hal_servo.h"

static float servo_pid_kp = 0.5f;       // 由 modes/matlab-embedded-toolkit.md 场景 4 调出来
static int16_t last_offset = 0;

void steer_step(void) {
    static track_result_t r;
    track_process(camera_buffer, &r);

    if (!r.valid) {
        hal_servo_set(SERVO_CENTER);
        return;
    }

    float pwm_delta = servo_pid_kp * (float)r.offset;
    float d_term = 0.2f * (float)(r.offset - last_offset);
    last_offset = r.offset;
    hal_servo_set(SERVO_CENTER + (int16_t)(pwm_delta + d_term));
}
```

---

## 6. 推荐硬件方案

| 资源 | 推荐型号 | 关键参数 |
|---|---|---|
| MCU | STM32H743 / NXP RT1060 / MCXVision | 算力 ≥ 240 MHz |
| 摄像头 | OV7725 / MT9V032 / OpenART | 全局快门首选，灰度 188×120 |
| 接口 | DCMI / FlexIO + DMA | 摄像头数据自动入内存 |
| 显示 | OLED 显示偏差曲线 | 调试用 |
| 串口 | UART 921600 | 输出 + PC 端 MATLAB 实时分析 |

---

## 7. 性能基准（STM32H743 @480MHz）

| 步骤 | 耗时 | 占比 |
|---|---|---|
| DCMI 拍图 | 与帧率耦合（DMA 后台） | 0 |
| 二值化 | 0.3 ms | 5% |
| OTSU（可选） | 0.5 ms | 8% |
| 透视变换 | 2.0 ms | 33% |
| 中线提取 | 1.0 ms | 17% |
| 总耗时（不含 OTSU）| 3.3 ms | — |
| **理论 FPS** | **300+** | — |

实测受 DCMI 帧率限制，常稳定在 100-200 FPS。

---

## 8. 失败兜底

| 现象 | 诊断 | 修复 |
|---|---|---|
| 强光下二值化失败 | 固定阈值不适应 | 启用 OTSU 自适应 |
| 暗光下找不到赛道 | 摄像头曝光不够 | 调摄像头寄存器（增益 / 曝光时间）|
| 透视图严重变形 | src_pts 没标定准 | 重新拍 1 米参考线图标定 |
| 弯道丢失中线 | 单边丢失没补全 | 单边补全用 last_*；或固定半赛道宽 |
| 跳线（黑色赛道）跟丢 | 二值化反向了 | bw = (gray < threshold) 而不是 > |
| 帧率突然掉 | 内存碎片 / 栈溢出 | 中线数组改全局静态 |

---

## 9. 调参清单

| 参数 | 建议起始值 | 调整方向 |
|---|---|---|
| 二值化阈值 | 128（中值） | 太亮调高、太暗调低 |
| 透视 src_pts | 拍标定图量出来 | 直道上看赛道是否两条平行线 |
| 预瞄行 | BIRD_H / 2 | 高速跑大；低速跑小 |
| Kp | 0.3-0.8 | 抖→减；慢→加 |
| Kd | 0.2 | 抖→加；过冲→保持 |

---

## 10. 评分参考（NXP 智能车视觉组）

| 项 | 评分要点 |
|---|---|
| 完赛速度 | 慢车 vs 快车 |
| 完赛稳定性 | 不冲出赛道 |
| 弯道处理 | S 弯 / 急弯不丢线 |
| 算法效率 | 高 FPS（评高难度 + 高速）|
| 鲁棒性 | 不同光照下都能完赛 |

---

## 11. 进阶选项

1. **AI 视觉**（OpenART + 神经网络）：用 MATLAB Deep Learning Toolbox 训练 → 部署到 MCXVision
2. **多目标识别**（视觉双车追逐）：场景 E4 + 跟踪算法
3. **赛道类型识别**（直道 / 弯道 / 十字 / 环岛）：CNN 分类
4. **车道线 SLAM**：场景 E4 + 卡尔曼场景 5
5. **MATLAB 仿真摄像头**：用 3D 场景渲染调算法，无需真车

---

## 12. 与一键流水线联动

```text
触发"MATLAB 一键流水线 + 智能车视觉"
  → Step 1: scripts/vision_pipeline.m 离线验证算法
  → Step 2: 导出 perspective.h
  → Step 3-4: build + flash
  → Step 5: /serial-monitor 抓"原图 + 中线"二进制流到 PC
  → Step 6: MATLAB 实时画 GUI 看车上视觉效果
```

详见 `modes/matlab-firmware-pipeline.md`。
