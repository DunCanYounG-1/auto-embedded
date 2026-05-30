/**
 * @file bsp_template.c
 * @brief BSP 层模板 - 遵循分层架构
 *
 * BSP (Board Support Package) 层位于应用层和 HAL 层之间
 * - 提供硬件抽象接口
 * - 封装 HAL 函数
 * - 实现特定硬件功能
 *
 * 创建新的 BSP 文件时，复制此模板并修改：
 * 1. 文件名：bsp_xxx.c / bsp_xxx.h
 * 2. 函数前缀：BSP_XXX_
 * 3. 包含的头文件
 * 4. 具体功能实现
 */

#include "bsp_template.h"
#include "main.h"

/* Private macros -----------------------------------------------------------*/
#define TEMPLATE_TIMEOUT_MS    1000
#define TEMPLATE_BUFFER_SIZE  64

/* Private variables ---------------------------------------------------------*/
static uint8_t templateBuffer[TEMPLATE_BUFFER_SIZE];
static volatile bool templateReady = false;

/* Public functions ----------------------------------------------------------*/

/**
 * @brief 初始化 BSP 模板
 * @note  通常硬件已在 CubeMX 中初始化，此函数用于软件状态初始化
 */
void BSP_Template_Init(void)
{
    // 如果硬件需要额外初始化，在此处添加
    // 例如：校准、复位序列等

    templateReady = false;
}

/**
 * @brief BSP 模板功能示例
 * @param data 输入数据
 * @return HAL_OK 成功，其他值失败
 */
HAL_StatusTypeDef BSP_Template_Process(uint8_t data)
{
    HAL_StatusTypeDef status;

    // 检查参数
    if (data == 0) {
        return HAL_ERROR;
    }

    // 调用 HAL 函数
    // 示例：HAL_GPIO_WritePin(...);
    //       HAL_UART_Transmit(...);

    return HAL_OK;
}

/**
 * @brief 获取 BSP 模板状态
 * @return true 就绪，false 未就绪
 */
bool BSP_Template_IsReady(void)
{
    return templateReady;
}

/* Private functions ---------------------------------------------------------*/

/**
 * @brief 私有函数示例
 * @param value 输入值
 * @return 处理后的值
 */
static uint32_t Template_PrivateFunction(uint32_t value)
{
    // 私有函数实现
    return value * 2;
}

/* Interrupt callbacks ------------------------------------------------------*/
/* 在 USER CODE BEGIN 4 中调用这些函数 */

/**
 * @brief 模板回调函数示例
 * @note  从 HAL 中断回调中调用
 */
void BSP_Template_IRQHandler(void)
{
    // 处理中断相关逻辑
    templateReady = true;
}
