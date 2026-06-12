# 入门示例：串口 CSV 日志可视化与分析

> 难度：★（连 MATLAB 都没用过也能跑通，10 分钟）
>
> 用途：把 MCU 串口录下来的一坨 CSV 日志变成专业的图表，找出超调、震荡、丢帧等问题。
>
> 涉及 `.auto-embedded/modes/matlab-embedded-toolkit.md` 场景 7（数据可视化与日志分析）。

---

## 0. 学完你能做什么

- 一行命令把 CSV 变成多子图
- 自动算出超调量、调节时间、稳态误差三个关键指标
- 发现日志中的丢帧、突跳、漂移异常
- 把分析结果作为后续调参的证据，写进 `研究发现.md`

---

## 1. MCU 端：怎么吐 CSV 日志

最朴素的格式：每行一条，字段以逗号分隔，第一行写表头。

```c
/* app/log/csv_logger.c */
#include "hal_uart.h"
#include <stdio.h>

static int header_sent = 0;

void csv_log_header(void) {
    const char *hdr = "t_ms,setpoint,measured,u_out\n";
    hal_uart_write(LOG_UART, (uint8_t *)hdr, 27, 10);
    header_sent = 1;
}

void csv_log_row(uint32_t t_ms, float ref, float meas, float u)
{
    if (!header_sent) csv_log_header();
    char buf[80];
    int n = snprintf(buf, sizeof(buf), "%lu,%.4f,%.4f,%.4f\n",
                     t_ms, ref, meas, u);
    hal_uart_write(LOG_UART, (uint8_t *)buf, n, 10);
}

/* 在控制中断里调用 */
void control_isr(void) {
    /* ... 你的控制逻辑 ... */
    csv_log_row(hal_get_tick_ms(), setpoint, measured, u_out);
}
```

**采样间隔建议**：与你控制周期一致（如 5 ms），但 UART 115200 bps 单行 ~30 字节，最快只能 ~400 行/秒，所以高频信号可考虑每 N 次中断写一次（如 `if (cnt++ % 5 == 0) csv_log_row(...);`）。

PC 端用串口助手 / `aemb-serial-monitor` skill 抓 30 秒，存成 `control_log.csv`。

---

## 2. MATLAB 可视化（小白一键脚本）

把下面贴进 `mcp__matlab__evaluate_matlab_code`：

```matlab
% --- 一键日志可视化 ---

% 1. 读 CSV
% readtable 自动识别表头，比 readmatrix 智能
T = readtable('control_log.csv');
disp(head(T));   % 看前几行结构

% 字段访问：T.t_ms / T.setpoint / T.measured / T.u_out
t   = T.t_ms / 1000;   % ms → s
ref = T.setpoint;
y   = T.measured;
u   = T.u_out;

% 2. 检测丢帧（时间间隔异常）
dt = diff(t);
dt_median = median(dt);
gaps = find(dt > 3*dt_median);
if ~isempty(gaps)
    fprintf('⚠ 检测到 %d 处丢帧（dt > 3×中位数 %.4fs）\n', length(gaps), dt_median);
    for i = 1:min(5, length(gaps))
        fprintf('   位置 %d: t=%.3fs, dt=%.4fs\n', gaps(i), t(gaps(i)), dt(gaps(i)));
    end
else
    fprintf('✓ 无明显丢帧（采样间隔均匀 = %.4fs）\n', dt_median);
end

% 3. 多子图布局
figure('Position', [100 100 900 700]);

subplot(3,1,1);
plot(t, ref, 'r--', 'LineWidth', 2); hold on;
plot(t, y, 'b-', 'LineWidth', 1.5);
legend('参考 setpoint', '实测 measured', 'Location', 'best');
ylabel('被控量'); grid on;
title('闭环响应');

subplot(3,1,2);
err = ref - y;
plot(t, err, 'k-', 'LineWidth', 1.2);
ylabel('误差 (ref - y)'); grid on;
yline(0, 'r--');

subplot(3,1,3);
plot(t, u, 'm-', 'LineWidth', 1.2);
xlabel('t (s)'); ylabel('控制信号 u'); grid on;

% 4. 关键指标（假设最后阶段是稳态）
ref_steady = mean(ref(end-20:end));   % 取最后 20 个点
y_steady   = mean(y(end-20:end));
ss_error   = ref_steady - y_steady;

% 找参考阶跃的位置
[~, step_idx] = max(abs(diff(ref)));
t_step = t(step_idx);

% 超调（阶跃后最大值）
y_after = y(step_idx:end);
y_max   = max(y_after);
overshoot = (y_max - ref_steady) / (ref_steady - ref(1)) * 100;

% 5% 调节时间
within_band = abs(y_after - ref_steady) < 0.05 * abs(ref_steady - ref(1));
settle_idx = find(~within_band, 1, 'last');
if isempty(settle_idx)
    settle_time = 0;
else
    settle_time = t(step_idx + settle_idx) - t_step;
end

fprintf('\n=== 关键指标 ===\n');
fprintf('稳态值 = %.4f (参考 %.4f)\n', y_steady, ref_steady);
fprintf('稳态误差 = %.4f (%.2f%%)\n', ss_error, ss_error/ref_steady*100);
fprintf('超调 = %.2f%%\n', overshoot);
fprintf('5%% 调节时间 = %.3f s\n', settle_time);
fprintf('控制信号峰值 = %.4f (是否饱和？看你的执行器上限)\n', max(abs(u)));
```

**典型输出**：

```
✓ 无明显丢帧（采样间隔均匀 = 0.0050s）

=== 关键指标 ===
稳态值 = 49.9821 (参考 50.0000)
稳态误差 = 0.0179 (0.04%)
超调 = 8.34%
5% 调节时间 = 1.245 s
控制信号峰值 = 78.5000 (是否饱和？看你的执行器上限)
```

---

## 3. 进阶：频域分析（信号干净不干净）

如果你怀疑信号被周期性噪声污染：

```matlab
% 用稳态段做 FFT
y_steady_seg = y(end-1024+1:end);  % 取最后 1024 点
fs = 1/dt_median;

N = length(y_steady_seg);
Y = fft(y_steady_seg - mean(y_steady_seg));
P1 = abs(Y/N);
P1 = P1(1:N/2+1);
P1(2:end-1) = 2*P1(2:end-1);
f = fs*(0:N/2)/N;

figure;
semilogy(f, P1, 'LineWidth', 1.5); grid on;
xlabel('频率 (Hz)'); ylabel('幅值'); title('稳态噪声频谱');

% 找前 3 个噪声峰
[pks, locs] = findpeaks(P1, 'SortStr', 'descend', 'NPeaks', 3);
fprintf('\n=== 主导噪声频率 ===\n');
for i = 1:length(pks)
    fprintf('  #%d: %.1f Hz (幅值 %.4f)\n', i, f(locs(i)), pks(i));
end
```

发现噪声 → 接 `.auto-embedded/refs/matlab-example-iir-filter.md` 设计低通滤波器。

---

## 4. 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| `readtable` 报"无效字段名" | 表头含中文或特殊字符 | 表头改 ASCII，或用 `readmatrix` |
| 时间列有重复值 | UART 发太快 / 时间戳函数有 bug | MCU 端确保 `t_ms` 单调递增 |
| 大量丢帧 | 串口速率太低 / 单行字段太多 | 提高波特率到 921600 或减字段 |
| 数值精度丢失 | snprintf 用了 `%.2f` 但量级很小（如 1e-5） | 改 `%.6e` |
| 中文乱码 | 串口编码不一致 | 表头和数据都用 ASCII，避免中文 |

---

## 5. 二进制日志（高频采样）

如果 5 ms 一行 CSV 也写不过来（约 6000 行/秒），换二进制：

```c
typedef struct __attribute__((packed)) {
    uint32_t t_ms;
    float    ref, meas, u;
} log_frame_t;

void log_bin(uint32_t t, float r, float m, float u) {
    log_frame_t f = {t, r, m, u};
    hal_uart_write(LOG_UART, (uint8_t*)&f, sizeof(f), 5);
}
```

MATLAB 读：

```matlab
fid = fopen('control_log.bin', 'r');
% 每帧 16 字节：u32 + 3*float
raw = fread(fid, [4, inf], '*single')';   % 注意要转 uint32 → single 强制重解释
fclose(fid);

% u32 时间戳需要单独读
fid = fopen('control_log.bin', 'r');
all_bytes = fread(fid, inf, '*uint8');
fclose(fid);
n = length(all_bytes) / 16;
all_bytes = reshape(all_bytes, 16, n)';
t_ms  = double(typecast(reshape(all_bytes(:,1:4)',[],1), 'uint32'));
ref   = double(typecast(reshape(all_bytes(:,5:8)',[],1), 'single'));
meas  = double(typecast(reshape(all_bytes(:,9:12)',[],1), 'single'));
u_out = double(typecast(reshape(all_bytes(:,13:16)',[],1), 'single'));
```

二进制日志 **体积更小 + 精度无损**，但需要双方约定帧格式，调试稍麻烦。

---

## 6. CAN 日志分析（按需）

如果你做汽车 ECU 或工业总线，日志可能是 `.blf` / `.asc` 而不是 CSV：

```matlab
% 需要 Vehicle Network Toolbox
db  = canDatabase('vehicle.dbc');
log = blfread('drive.blf', db);

% 提取特定信号
speed_msg = log(log.Name == 'VehicleSpeed', :);
plot(speed_msg.Time, speed_msg.Signals.speed);
```

降级（无 toolbox）：用 Python `cantools` 库先转 CSV 再走本示例。

---

## 7. 把分析结果写入磁盘记忆

```markdown
## 技术发现

### 2026-05-19 — 闭环响应分析（control_log.csv）
- **关联轮次**：Round 3 / Verifier
- **查询工具**：mcp__matlab__evaluate_matlab_code
- **关键指标**：
  - 稳态误差 0.04%
  - 超调 8.34%
  - 5% 调节时间 1.245 s
  - 噪声频谱主峰：50 Hz 工频
- **判断**：超调偏大；建议增大 Q_phi_dot 或加 D 项；50 Hz 噪声需加陷波滤波器
- **后续动作**：
  1. 触发 .auto-embedded/refs/matlab-example-iir-filter.md 设计 50 Hz 陷波器
  2. 重整 PID（场景 4）
```

---

## 8. 下一步路线图

1. → `.auto-embedded/refs/matlab-example-step-id.md`（场景 1）：把测出来的响应做系统辨识
2. → `.auto-embedded/refs/matlab-example-iir-filter.md`（场景 2）：消除发现的噪声
3. → 重新调参后再回本示例验证改进效果，形成闭环
