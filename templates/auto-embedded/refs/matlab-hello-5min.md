# 5 分钟 Hello World — 零基础也能成功一次

> 难度：☆（完全不懂 MATLAB / 不懂控制理论 / 不懂滤波器也能跑完）
>
> 唯一目标：**5 分钟内，跑通 5 个命令，拿到一个 gcc 编译通过的 `.h` 文件**。不要求你理解，只要你成功一次。
>
> 适用：第一次接触 `embedded-dev` skill 的 MATLAB 工作流的人；不知道 `.auto-embedded/modes/matlab-embedded-toolkit.md` 8 大场景从哪开始的人。

---

## 前置（30 秒）

只检查 3 件事：

```
1. 你电脑装了 MATLAB（输入 matlab 能启动）           → 已确认
2. Claude Code 能看到 mcp__matlab__* 4 个工具      → 已确认
3. 你电脑上的 STM32 / Arduino 串口能吐数据         → 没有也没关系，第 2 步会教你造假数据
```

如果 (1)(2) 中任意一项不对，**先别看本文**，按 `.auto-embedded/modes/mcp-healthcheck.md` 跑工具诊断。

---

## 步骤 1：跑一行 MATLAB（30 秒）

打开 Claude Code，让它跑：

```python
mcp__matlab__evaluate_matlab_code(code="""
    fs = 1000;
    t  = 0:1/fs:1;
    y  = sin(2*pi*5*t) + 0.3*randn(size(t));    % 5 Hz 信号 + 噪声
    plot(t, y);
    title('Hello MATLAB');
    fprintf('Hello, 我跑了！数据点数 = %d\\n', length(t));
""")
```

**期望看到**：
- 终端输出 `Hello, 我跑了！数据点数 = 1001`
- MATLAB 主窗口弹出一张含噪的正弦波

✅ **成功**：你 MATLAB MCP 工作正常，进入下一步。

❌ **失败**：参考 `.auto-embedded/modes/mcp-healthcheck.md` 排查。

---

## 步骤 2：把"数据"变成你能控制的（1 分钟）

有两种来源，选一种：

### 来源 A：你手头有 STM32 / Arduino 在吐串口数据

用 MATLAB 直接读：

```python
mcp__matlab__evaluate_matlab_code(code="""
    s = serialport('COM3', 115200);   % 改成你的端口（Linux 是 '/dev/ttyUSB0'）
    configureTerminator(s, 'LF');
    flush(s);

    N = 1000;
    data = zeros(N, 1);
    for i = 1:N
        line = readline(s);
        data(i) = str2double(line);
    end
    clear s;

    plot(data);
    title('MCU 实测信号');
    save('hello_data.mat', 'data');
    fprintf('已抓 %d 个样本，存入 hello_data.mat\\n', N);
""")
```

**MCU 端只要持续发数字+换行**（每个采样周期一行）即可：

```c
/* 你 main 循环里加这一行 */
printf("%.3f\n", read_adc());
hal_delay_ms(1);
```

### 来源 B：没硬件 → 用 MATLAB 造假数据

```python
mcp__matlab__evaluate_matlab_code(code="""
    fs = 1000;
    t  = 0:1/fs:2;
    % 模拟：5 Hz 真实信号 + 50 Hz 工频干扰 + 高频噪声
    data = sin(2*pi*5*t) + 0.5*sin(2*pi*50*t) + 0.2*randn(size(t));
    data = data(:);    % 列向量
    plot(t, data); title('假数据：5 Hz 信号 + 50 Hz 工频干扰');
    save('hello_data.mat', 'data', 'fs');
    fprintf('已生成 %d 点假数据\\n', length(data));
""")
```

✅ **成功**：你看到 `hello_data.mat` 已保存。

---

## 步骤 3：找出"噪声在哪个频段"（1 分钟）

不懂 FFT 没关系，跑就行：

```python
mcp__matlab__evaluate_matlab_code(code="""
    load('hello_data.mat');
    if ~exist('fs','var'), fs = 1000; end

    N = length(data);
    Y = abs(fft(data));
    P = Y(1:N/2+1) / N;
    f = fs*(0:N/2)/N;

    figure;
    plot(f, P); title('频谱：哪个频率有能量？');
    xlabel('频率 Hz'); ylabel('幅值');

    [pk, idx] = findpeaks(P, 'SortStr', 'descend', 'NPeaks', 3);
    fprintf('前 3 个能量最大的频率：\\n');
    for i = 1:length(pk)
        fprintf('  #%d: %.1f Hz  幅值 %.4f\\n', i, f(idx(i)), pk(i));
    end
""")
```

**期望输出**（来源 B 的假数据）：

```
前 3 个能量最大的频率：
  #1: 5.0 Hz  幅值 0.4998
  #2: 50.0 Hz  幅值 0.2499
  #3: ...
```

✅ **结论**：你有用信号 5 Hz、噪声 50 Hz。要保留 5 Hz、去掉 50 Hz → 设计**低于 20 Hz 的低通滤波器**。

---

## 步骤 4：设计一个滤波器（1 分钟）

```python
mcp__matlab__evaluate_matlab_code(code="""
    fs    = 1000;
    fc    = 20;        % 截止频率 20 Hz（保留 5 Hz、滤掉 50 Hz）
    order = 4;
    [b, a] = butter(order, fc/(fs/2), 'low');

    fprintf('滤波器系数：\\n');
    fprintf('b = [%.6f %.6f %.6f %.6f %.6f]\\n', b);
    fprintf('a = [%.6f %.6f %.6f %.6f %.6f]\\n', a);

    % 验证滤波效果
    load('hello_data.mat');
    clean = filter(b, a, data);
    figure;
    plot(data, 'r-'); hold on;
    plot(clean, 'b-', 'LineWidth', 1.5);
    legend('滤波前', '滤波后');
    title('滤波效果对比');

    save('hello_filter.mat', 'b', 'a', 'fs', 'fc');
    fprintf('已保存 hello_filter.mat\\n');
""")
```

✅ **成功**：看到滤波后的曲线（蓝线）干净多了，存了 `hello_filter.mat`。

---

## 步骤 5：导出成 C 头文件（1.5 分钟）

让 Claude 跑：

```bash
python ".auto-embedded/tools/export_gains_to_c.py" ^
    --input hello_filter.mat ^
    --mat-var b ^
    --output hello_lpf_b.h ^
    --name LPF_B ^
    --type float ^
    --with-cmsis-template
```

**期望输出**：

```
[export_gains_to_c] 已生成 hello_lpf_b.h  (1x5, float)
```

**验证 gcc 真能编译**：

```bash
gcc -c -x c hello_lpf_b.h -o /tmp/hello_test.o && echo "✓ GCC 编译通过！你拿到可用的 .h 了"
```

✅ **成功**：你做到了！从零到 C 代码，5 步搞定。

---

## 🎉 你刚才做了什么（事后总结）

| 步骤 | 实际做的事 | 学到的概念（可选阅读） |
|---|---|---|
| 1 | 让 MATLAB 跑代码 | MCP 工具调用 |
| 2 | 把数据弄到 MATLAB 里 | 串口 / .mat 文件 |
| 3 | 找噪声频率 | FFT 频谱分析（场景 3） |
| 4 | 设计滤波器 | 数字滤波器（场景 2） |
| 5 | 系数变成 C 代码 | 嵌入式集成 |

如果想往任何一步深挖，看：

- → `.auto-embedded/refs/matlab-example-step-id.md` — 步骤 2-3 进阶（不是看频谱而是辨识系统）
- → `.auto-embedded/refs/matlab-example-iir-filter.md` — 步骤 4 进阶（高阶滤波器、SOS、Q15 定点）
- → `.auto-embedded/refs/matlab-example-serial-plot.md` — 步骤 2 进阶（控制回路日志可视化、超调/调节时间）
- → `.auto-embedded/modes/matlab-embedded-toolkit.md` 决策树 — 你还有 8 个场景能用

如果想"一键完成 MATLAB → 编译 → 烧录 → 实测对比"全流程：

- → `.auto-embedded/modes/matlab-firmware-pipeline.md`（流水线 mode）

---

## 常见首跑报错（按错误码索引）

### ⚠ `mcp__matlab__evaluate_matlab_code` 报 license 错误

```
原因：MATLAB 没启动 / license 失效
检测：mcp__matlab__detect_matlab_toolboxes 看是否能列出 toolbox
修复：手动启动 MATLAB R2025a 等 license 检查通过后重试
```

### ⚠ `serialport('COM3', ...)` 报"端口不存在"

```
原因：COM 号不对
检测：在 MATLAB 里跑 serialportlist('available')
修复：换成实际可用的端口名
```

### ⚠ `butter` 未定义

```
原因：缺 Signal Processing Toolbox
检测：mcp__matlab__detect_matlab_toolboxes 查 Signal Processing
降级：用 scipy.signal.butter（Python 端等价实现）
```

### ⚠ `export_gains_to_c.py: 缺 scipy`

```
原因：scipy 未装（.mat 文件解析需要）
修复：pip install scipy numpy
```

### ⚠ 生成的 .h 含 NaN 或 Inf

```
原因：滤波器设计参数有问题（fc > fs/2 等）
检测：脚本里 fprintf 看 b 是否含 Inf/NaN
修复：检查 fc < fs/2，且 fc 不能太接近 0
```

### ⚠ 步骤 3 频谱图全是噪声

```
原因：数据本身没明显特征频率 / 采样率不对
检测：先 plot(data) 看时域，是不是真有周期信号
修复：换数据；或 fs 设对（与 MCU 端采样周期一致）
```

### ⚠ 步骤 5 gcc 报 "stray `\` in program"

```
原因：把 ^ 当成 Linux 续行符（实际是 Windows cmd 续行）
修复：在 bash / Git Bash 里把 ^ 换成 \，或写成单行命令
```

### ⚠ "我想用 Python 不用 MATLAB"

```
本 hello 全部能用 Python 替代：
- mcp__matlab__evaluate_matlab_code → numpy + matplotlib
- butter → scipy.signal.butter
- fft → numpy.fft.fft
但其他 7 大场景里 MATLAB 优势会显现（Simulink / Embedded Coder / PIL 等）。
建议先按 MATLAB 路径熟悉，再决定是否切。
```

---

## 你刚才**没做**的事（避免误解）

- ❌ 没改 MCU 代码（步骤 2 来源 A 要的只是已有的 printf）
- ❌ 没写一行控制理论代码
- ❌ 没动你的工程目录（产物全在工作目录或 `_demo*` 临时文件）
- ❌ 没生成不可逆的改动（删掉 `hello_*.mat` 和 `hello_lpf_b.h` 就清空了）

所以可以放心多试几次，调参数不会破坏任何东西。

---

## 下一步路线图

按你的真实需求挑一条：

```
我想真的把这个滤波器装到我 STM32 上
   → .auto-embedded/refs/matlab-example-iir-filter.md §3.2/§3.3
   → .auto-embedded/modes/matlab-firmware-pipeline.md（一键流水线）

我想用 MATLAB 替代我现有的 Python LQR 工具
   → .auto-embedded/refs/lqr-example-bicycle-cornell.md

我想了解每个场景能干嘛
   → .auto-embedded/modes/matlab-embedded-toolkit.md（主 mode 决策树）

我想用 Simulink 建模
   → .auto-embedded/modes/matlab-embedded-toolkit.md 场景 9

我担心仿真对了上板不对
   → .auto-embedded/modes/matlab-embedded-toolkit.md 场景 10（MIL/SIL/PIL）
```
