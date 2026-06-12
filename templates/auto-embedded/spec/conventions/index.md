# 编码与协作约定 spec（conventions）

> 本层是"怎么写才安全"的可执行约定。EXECUTE/REVIEW 必读。

## 证据优先（铁律）

没有以下任一证据，**禁止**宣称"已修好/应该没问题"：
代码位置 · 编译输出 · 测试结果 · 串口日志 · 数据手册依据 · 网表依据 · 实测波形/寄存器状态。
完成声明必须在当前回复内附"命令 + 输出 + 与验证标准的对照"。

## 复用优先

本地离线索引 → 官方文档/Context7 → 开源驱动 → 最后才自己写。不凭记忆猜接口。

## 代码规范

- 模块化：`.c` + `.h` 成对；公共 API 走 `.h`，内部函数 `static`。
- 命名前缀按层（halport_/bsp_/drv_/mw_/svc_/app_）。
- `volatile`：ISR 与主循环共享变量、MMIO 必须 `volatile`；不滥用。
- 临界区：多字节共享状态读写用临界区/原子；Cortex-M0+ 无 LDREX 注意。
- ISR 纪律：ISR 体 ≤ 20 行，只置标志/搬数据，重活交主循环；ISR 内禁 `printf`/阻塞/动态内存。
- 魔数写回注释来源（`@datasheet p.XX` / `@netlist`）。

## Git 快照

EXECUTE 每完成一个清单项 + 用户确认 → 本地 `git add <具体文件>`（**不用 -A**）→ commit；
**绝不自动 push**。敏感文件（.env/.key/.pem/*secret*/*token*/id_rsa*）暂停存档。

## 沉淀（promote 回流）
> REVIEW 阶段把每次的设计决策/约定/坑/gotcha 沉淀于此，下次自动注入。
