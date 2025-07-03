# Product Classification Fix - Category ID Based

## Issue Fixed
The original product classification logic was using string-based keyword matching on product names and category names. However, the actual requirement was to use category IDs for precise classification.

## Solution Implemented

### 1. **Updated Classification Logic**
- **Primary**: Uses `category_id` field from Product table
- **Fallback**: Uses name-based keyword matching if `category_id` is not set

### 2. **Category ID Mapping**
```javascript
// In productSalesService.js
static CATEGORY_MAPPING = {
  VAPES: [1, 3],    // Category IDs for vapes
  POUCHES: [4, 5]   // Category IDs for pouches
};
```

### 3. **Database Changes**
Updated product fetching to include `category_id`:
```javascript
// Before
product: {
  select: {
    id: true,
    name: true,
    category: true
  }
}

// After
product: {
  select: {
    id: true,
    name: true,
    category: true,
    category_id: true  // Added this field
  }
}
```

### 4. **Function Updates**
```javascript
// Before
isVapeProduct(productName, category)
isPouchProduct(productName, category)

// After
isVapeProduct(productName, category, categoryId)
isPouchProduct(productName, category, categoryId)
```

## New Features Added

### 1. **Category Mapping Endpoint**
- **Endpoint**: `GET /api/targets/categories/mapping`
- **Purpose**: Get current category mapping configuration
- **Response**: Complete category information with mapping

### 2. **Configurable Classification**
- Category IDs are now stored in a static constant
- Easy to update without changing logic
- Supports multiple category IDs per product type

## Configuration

### To Update Category Mapping:
1. Edit `ProductSalesService.CATEGORY_MAPPING` in `lib/services/productSalesService.js`
2. Update the arrays with your actual category IDs

```javascript
static CATEGORY_MAPPING = {
  VAPES: [1, 3, 7],      // Add more category IDs as needed
  POUCHES: [4, 5, 8, 9]  // Add more category IDs as needed
};
```

### To Verify Current Categories:
Use the new endpoint to see all categories and their current mapping:
```bash
GET /api/targets/categories/mapping
```

## Benefits

1. **Accuracy**: Category ID-based classification is more reliable than keyword matching
2. **Performance**: Integer comparison is faster than string searching
3. **Maintainability**: Easy to add/remove categories without code changes
4. **Flexibility**: Fallback to name-based matching for edge cases
5. **Transparency**: New endpoint shows exact mapping configuration

## Testing

### Test Category Classification:
1. Create products with category IDs 1, 3, 4, 5
2. Create orders with these products
3. Call product sales progress endpoint
4. Verify correct classification in response

### Test Fallback Logic:
1. Create products without category_id set
2. Use product names with keywords like "vape", "pouch"
3. Verify fallback classification works

## Migration Notes

- **Existing Data**: Products without `category_id` will use fallback logic
- **New Products**: Should have proper `category_id` set for accurate classification
- **Backward Compatibility**: Old logic still works as fallback

## API Changes Summary

### New Endpoints:
- `GET /api/targets/categories/mapping` - Get category mapping

### Modified Responses:
- Product breakdown now includes `categoryId` field
- More accurate classification based on category IDs

### No Breaking Changes:
- All existing endpoints work the same
- Response format is backward compatible
- Added fields are non-breaking additions 