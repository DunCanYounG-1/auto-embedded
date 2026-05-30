/**
 * @file bsp_template.h
 * @brief BSP 层头文件模板
 *
 * 头文件应包含：
 * 1. 防止重复包含的宏
 * 2. extern "C" 包装（C++ 兼容）
 * 3. 公共宏定义
 * 4. 公共类型定义
 * 5. 公共函数声明
 */

#ifndef BSP_TEMPLATE_H
#define BSP_TEMPLATE_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include <stdint.h>
#include <stdbool.h>
#include "stm32f1xx_hal.h"

/* Exported macros -----------------------------------------------------------*/

/** @defgroup BSP_Exported_Macros 导出宏定义
 * @{
 */
#define TEMPLATE_VERSION_MAJOR   1
#define TEMPLATE_VERSION_MINOR   0
#define TEMPLATE_MAX_VALUE       255

/**
 * @}
 */

/* Exported types ------------------------------------------------------------*/

/** @defgroup BSP_Exported_Types 导出类型定义
 * @{
 */

/**
 * @brief BSP 模板状态枚举
 */
typedef enum {
    BSP_TEMPLATE_STATE_OK = 0x00,
    BSP_TEMPLATE_STATE_ERROR = 0x01,
    BSP_TEMPLATE_STATE_BUSY = 0x02,
    BSP_TEMPLATE_STATE_TIMEOUT = 0x03
} BSP_Template_State_t;

/**
 * @brief BSP 模板配置结构体
 */
typedef struct {
    uint32_t parameter1;
    uint32_t parameter2;
    bool enabled;
} BSP_Template_Config_t;

/**
 * @}
 */

/* Exported functions --------------------------------------------------------*/

/** @defgroup BSP_Exported_Functions 导出函数
 * @{
 */

/**
 * @brief 初始化 BSP 模板
 */
void BSP_Template_Init(void);

/**
 * @brief BSP 模板功能示例
 * @param data 输入数据
 * @return HAL_OK 成功，其他值失败
 */
HAL_StatusTypeDef BSP_Template_Process(uint8_t data);

/**
 * @brief 获取 BSP 模板状态
 * @return true 就绪，false 未就绪
 */
bool BSP_Template_IsReady(void);

/**
 * @}
 */

#ifdef __cplusplus
}
#endif

#endif /* BSP_TEMPLATE_H */
