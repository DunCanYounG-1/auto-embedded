# 调试决策手册

当用户报告"程序挂了"、"崩溃了"、"运行异常"时，按以下决策树选择调试方法。

## 快速决策树

```
用户报告问题
    │
    ├─ 代码中有明显的测试变量/触发器？
    │   └─ YES → 先检查代码逻辑，可能无需调试
    │
    ├─ 循环/定时/条件相关的问题？
    │   └─ YES → GDB 条件断点（最高效）
    │
    ├─ 需要单步分析代码流程？
    │   └─ YES → GDB 普通断点
    │
    └─ 只是快速检查程序是否在运行？
        └─ YES → OpenOCD Telnet（最快）
```

| 问题类型 | 推荐方法 | 命令模板 |
|---------|---------|---------|
| 循环第 N 次崩溃 | GDB 条件断点 | `break file:line if var >= N` |
| 定时崩溃 | GDB 条件断点 | `break file:line if HAL_GetTick() > N*1000` |
| 指针异常 | GDB 条件断点 | `break file:line if ptr == NULL` |
| 单步分析逻辑 | GDB 普通断点 | `break file:line` + `stepi` |
| 快速检查运行状态 | OpenOCD Telnet | `halt` + `reg pc` + `resume` |

---

## 方法 1：GDB 条件断点（强烈推荐）

适用于循环相关问题、定时崩溃、特定条件下的问题。

优点：
- 自动停在问题点，无需手动监控
- 一次运行即可定位，节省大量时间
- 精确控制触发条件（变量值、循环次数等）
- 完整上下文信息（调用栈、变量值、寄存器）

### 命令模板

```bash
# 创建 GDB 脚本
cat > /tmp/gdb_cond.txt << 'EOF'
target remote localhost:3333
break main.c:165 if loop_counter >= 100
continue
print loop_counter
backtrace
quit
EOF

arm-none-eabi-gdb --batch -x /tmp/gdb_cond.txt build/debug/app.elf
rm -f /tmp/gdb_cond.txt
```

### 常见条件断点示例

```gdb
# 循环计数
break main.c:100 if loop_count >= 100

# 指针为空
break driver.c:50 if ptr == NULL

# 状态码异常
break hal_i2c.c:75 if error_code != 0

# 定时触发（HAL_GetTick 返回毫秒）
break main.c:200 if HAL_GetTick() > 10000
```

---

## 方法 2：GDB 普通断点

适用于单步执行、分析程序流程。

```bash
# 通过 gdb_debugger.py 启动调试会话
python3 skills/debug-gdb-openocd/scripts/gdb_debugger.py \
  --elf build/debug/app.elf \
  --interface stlink \
  --target target/stm32f4x.cfg \
  --mode download-and-halt
```

局限：需要手动多次执行才能找到问题点。

---

## 方法 3：OpenOCD Telnet（仅用于快速验证）

适用于快速检查程序是否运行、验证初始化完成。

```bash
# 通过 Python 一行命令读取内存
python3 -c "
import socket
s = socket.socket()
s.connect(('localhost', 4444))
s.sendall(b'halt\n')
import time; time.sleep(0.5)
s.sendall(b'reg pc\n')
print(s.recv(1024).decode('latin1'))
s.sendall(b'resume\n')
s.close()
"
```

局限：
- 不适合定位问题 — 需要反复手动暂停/读取
- 暂停时机不确定 — 可能在任意位置
- 容易遗漏问题点 — 手动采样可能错过关键时刻

何时使用：
- 验证程序是否在运行
- 检查初始化后的变量值
- 不要用于循环计数监控（用条件断点代替）

---

## OpenOCD 常用 Telnet 命令

```
reset halt          # 复位并暂停
resume              # 继续运行
halt                # 暂停运行
mdw <addr>          # 读取字（4 字节）
mdb <addr> <count>  # 读取字节
mww <addr> <val>    # 写入字
reg                 # 查看所有寄存器
reg pc              # 查看 PC 寄存器
```

---

## OpenOCD 后台管理

### 检查是否运行

```bash
# Linux/macOS
ss -tlnp | grep :3333 || echo "未运行"

# Windows
netstat -an | findstr ":3333"
```

### 启动后台进程

```bash
openocd -f interface/stlink.cfg -f target/stm32f4x.cfg &
```

### 停止

通常不需要关闭 — OpenOCD 占用资源很少（约 10-20MB），建议保持运行。

需要关闭的场景：更换调试器、调试器连接不稳定、完成所有调试工作。

```bash
# Linux/macOS
pkill -f "openocd.*stm32"

# Windows
taskkill /F /IM openocd.exe
```

---

## 代码最佳实践

### 使用 volatile 调试变量

```c
/* USER CODE BEGIN PV */
volatile uint32_t debug_loop_counter = 0;
volatile uint8_t  debug_error_flag = 0;
volatile uint8_t  debug_state = 0;
/* USER CODE END PV */
```

### 查找变量地址

```bash
arm-none-eabi-nm build/debug/app.elf | grep debug_
arm-none-eabi-readelf -s build/debug/app.elf | grep debug_
```

### 验证调试符号

```bash
# 确认 ELF 包含调试信息
file build/debug/app.elf
# 应显示 "with debug_info"

# 确认编译使用了 -g 和 -O0/-Og
```

---

## 避免的低效做法

- 用 OpenOCD Telnet 多次暂停来监控循环进度
- 用 OpenOCD Telnet 等待程序达到某个状态
- 手动反复执行 GDB 命令来找问题点
- 不检查代码就直接启动调试器
- 在 Release 模式下调试（无符号信息）
- 使用 HEX 文件调试（无符号信息，应使用 ELF）
