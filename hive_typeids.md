# Hive TypeIds Documentation

This document tracks all the typeIds used for Hive models in the Woosh application.

## Current TypeIds

| TypeId | Model | File |
|--------|-------|------|
| 0 | OrderModel | `models/hive/order_model.dart` |
| 1 | OrderItemModel | `models/hive/order_model.dart` |
| 3 | SessionModel | `models/hive/session_model.dart` |
| 4 | UserModel | `models/hive/user_model.dart` |
| 5 | JourneyPlanModel | `models/hive/journey_plan_model.dart` |
| 6 | ClientModel | `models/hive/client_model.dart` |
| 8 | PendingJourneyPlanModel | `models/hive/pending_journey_plan_model.dart` |
| 9 | RouteModel | `models/hive/route_model.dart` | 
| 10 | ProductReportHiveModel | `models/hive/product_report_hive_model.dart` |
| 11 | ProductQuantityHiveModel | `models/hive/product_report_hive_model.dart` |
| 12 | ProductHiveModel | `models/hive/product_model.dart` |
| 20 | CartItemModel | `models/hive/cart_item_model.dart` |

## Usage Guidelines

1. Always check this document before assigning a new typeId
2. Keep typeIds sequential when possible
3. Never reuse typeIds across different models
4. Document any new typeIds here immediately

## Reserved TypeIds

- 0-9: Core models
- 10-19: Product and inventory-related models
  - 10: ProductReportHiveModel (Product availability reporting)
  - 11: ProductQuantityHiveModel (Product quantity tracking)
  - 12: ProductHiveModel (Local product storage)
- 20-29: Order-related models
  - 20: CartItemModel (Cart persistence)
- 30-39: Client-related models
- 40-49: Journey-related models
- 50-99: Reserved for future use

## Notes

- If you need to add a new model, use the next available typeId in the appropriate range
- When removing a model, keep its typeId reserved to avoid conflicts with existing data
- Always run `dart run build_runner build` after adding or modifying typeIds 