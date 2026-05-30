# MISRA-C 2012 常见违规速查表

本文列出嵌入式项目中最常违反的 20 条 MISRA-C 2012 规则。

## 必需规则（Required）

### Rule 8.4 — 函数声明需要兼容的原型

**违规：** 函数定义前没有先前的声明。

```c
// ❌
void foo(int x) { ... }  // 没有先前声明

// ✅
void foo(int x);  // 头文件中声明
void foo(int x) { ... }
```

### Rule 10.3 — 表达式值不应赋给更窄的类型

```c
// ❌
uint8_t x = 256;  // 溢出

// ✅
uint8_t x = 255U;
```

### Rule 10.4 — 运算符两侧应为相同的基本类型

```c
// ❌
if (unsigned_var > signed_var)  // 混合符号比较

// ✅
if (unsigned_var > (uint32_t)signed_var)
```

### Rule 11.3 — 不应在不同对象指针类型之间转换

```c
// ❌
uint32_t *p = (uint32_t *)char_ptr;

// ✅ 通过 void* 中转或使用 memcpy
```

### Rule 12.2 — 移位量应在范围内

```c
// ❌
uint32_t x = 1U << 32;  // 未定义行为

// ✅
uint32_t x = 1U << 31;
```

### Rule 14.4 — if/while 条件应为布尔类型

```c
// ❌
if (ptr)  // 指针隐式转布尔

// ✅
if (ptr != NULL)
```

### Rule 15.7 — else if 链应以 else 结尾

```c
// ❌
if (x == 1) { ... }
else if (x == 2) { ... }
// 缺少 else

// ✅
if (x == 1) { ... }
else if (x == 2) { ... }
else { /* 默认处理 */ }
```

### Rule 17.7 — 函数返回值不应被丢弃

```c
// ❌
memcpy(dst, src, n);  // 返回值被忽略

// ✅
(void)memcpy(dst, src, n);
```

## 建议规则（Advisory）

### Rule 2.5 — 不应有未使用的宏定义

### Rule 4.1 — 八进制和十六进制转义序列应有终止

### Rule 8.7 — 仅在一个翻译单元中引用的函数和对象应使用内部链接

### Rule 8.9 — 仅在一个函数中引用的对象应在块作用域中定义

### Rule 11.5 — void 指针不应转换为对象指针

### Rule 15.5 — 函数应在末尾有单一出口

### Rule 16.4 — switch 每个 case 应有 break

### Rule 18.4 — 不应使用 +/- 运算符操作指针

### Rule 20.7 — 宏参数应加括号

```c
// ❌
#define SQUARE(x) x * x  // SQUARE(a+b) = a+b*a+b

// ✅
#define SQUARE(x) ((x) * (x))
```

### Rule 21.3 — 不应使用 `<stdlib.h>` 的动态内存函数

嵌入式系统中 `malloc`/`free` 可能导致堆碎片。使用静态分配或 RTOS 提供的内存池。

## 快速修复策略

1. **类型转换问题（Rule 10.x, 11.x）：** 使用显式类型转换并确保不溢出
2. **缺少声明（Rule 8.x）：** 确保所有外部函数在头文件中声明
3. **控制流问题（Rule 14.x, 15.x, 16.x）：** 添加 else 分支、break、显式布尔比较
4. **宏安全（Rule 20.7）：** 给宏参数加括号
5. **返回值丢弃（Rule 17.7）：** 使用 `(void)` 显式丢弃
