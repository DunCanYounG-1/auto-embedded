---
name: stm32-hal-development
description: Develop STM32 firmware on CubeMX-generated HAL projects, including peripheral configuration, BSP driver structure, interrupt-safe code, and hardware-aware troubleshooting. Use when Codex needs STM32 HAL implementation guidance rather than generic C advice.
---

# STM32 HAL Development

Treat this skill as the working playbook for CubeMX-based STM32 projects.

## Workflow

1. Read [references/core-guidelines.md](references/core-guidelines.md) first.
2. Keep all custom code inside `USER CODE` regions unless the project has an explicit non-CubeMX extension point.
3. Configure peripherals in CubeMX, regenerate code, then add application or BSP logic.
4. Read additional references only as needed:
   - [references/peripheral-driver-guide.md](references/peripheral-driver-guide.md) for sensor and bus drivers
   - [references/hal-quick-reference.md](references/hal-quick-reference.md) for API lookups
   - [references/troubleshooting-guide.md](references/troubleshooting-guide.md) for failure analysis
   - [references/usage-examples.md](references/usage-examples.md) for implementation patterns
5. Reuse [assets/bsp-template.c](assets/bsp-template.c) and [assets/bsp-template.h](assets/bsp-template.h) when starting a new BSP module.

## Notes

- Prioritize hardware constraints, interrupt safety, and regeneration safety over local code convenience.
- Do not modify CubeMX-generated initialization files directly when the same change belongs in the `.ioc` configuration.
