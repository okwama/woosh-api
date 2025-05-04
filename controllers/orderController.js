const prisma = require('../lib/prisma');
const asyncHandler = require('express-async-handler');

const createOrder = asyncHandler(async (req, res) => {
  // Get the region and country from the request
  const { items = [], orderItems = [], regionId, countryId } = req.body;
  // Extract clientId from request body or default to 1
  const clientId = req.body.clientId || 1;
  const orderItemsToUse = items.length > 0 ? items : orderItems;
  
  // Ensure we have a valid user ID from the authenticated user
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'User ID is required. Please ensure you are properly authenticated.'
    });
  }

  // Debug log the request body
  console.log('[Order Debug] Request body:', req.body);
  console.log('[Order Debug] User:', req.user);
  
  // Ensure we have region and country IDs
  const userRegionId = regionId || req.user?.region_id;
  const userCountryId = countryId || req.user?.countryId;
  
  if (!userRegionId || !userCountryId) {
    return res.status(400).json({
      success: false,
      error: 'Region and country are required'
    });
  }
  
  console.log('[Order Debug] Region settings:', { 
    requestRegionId: regionId, 
    requestCountryId: countryId,
    userRegionId: userRegionId,
    userCountryId: userCountryId,
    finalRegionId: userRegionId,
    finalCountryId: userCountryId
  });

  const createdItems = [];

  // Set region to country if regionId is null
  const regionToUse = userRegionId || userCountryId;
  console.log('[Order Debug] Using region:', {
    providedRegionId: regionId,
    providedCountryId: countryId,
    regionToUse,
    userRegionId: req.user?.region_id,
    userCountryId: req.user?.countryId
  });

  for (const item of orderItemsToUse) {
    console.log('--- [Order Debug] Processing item:', {
      productId: item.productId,
      requestedQuantity: item.quantity,
      priceOptionId: item.priceOptionId
    });
    console.log('[Order Debug] Starting validation for item:', {
      productId: item.productId,
      quantity: item.quantity,
      priceOptionId: item.priceOptionId,
      userRegion: userRegionId,
      userCountry: userCountryId
    });

    // First get the price option to validate it exists
    const priceOption = await prisma.priceOption.findUnique({
      where: { id: item.priceOptionId },
      include: { category: true }
    });

    if (!priceOption) {
      const error = `Price option ${item.priceOptionId} not found`;
      console.log('[Order Debug] Validation failed:', error);
      return res.status(400).json({ success: false, error });
    }

    console.log('[Order Debug] Found price option:', {
      id: priceOption.id,
      option: priceOption.option,
      value: priceOption.value,
      category: priceOption.category.name
    });

    // Get product with store quantities and store details
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: {
        storeQuantities: {
          include: {
            store: true
          }
        }
      }
    });

    if (!product) {
      const error = `Product ${item.productId} not found`;
      console.log('[Order Debug] Validation failed:', error);
      return res.status(400).json({ success: false, error });
    }

    console.log('[Order Debug] Found product:', {
      id: product.id,
      name: product.name,
      category_id: product.category_id,
      category: product.category,
      totalStores: product.storeQuantities.length
    });

    // Validate that the price option's category matches the product's category
    if (priceOption.categoryId !== product.category_id) {
      const error = `Price option ${item.priceOptionId} (category ${priceOption.category.name}) is not valid for product ${product.name} (category ${product.category})`;
      console.log('[Order Debug] Validation failed:', error);
      return res.status(400).json({ success: false, error });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        error: `Product with ID ${item.productId} not found`
      });
    }

    console.log('[Order Debug] Checking store quantities for product:', {
      productId: product.id,
      productName: product.name,
      totalStores: product.storeQuantities.length,
      stores: product.storeQuantities.map(sq => ({
        storeId: sq.store.id,
        storeRegionId: sq.store.regionId,
        storeCountryId: sq.store.countryId,
        quantity: sq.quantity
      }))
    });

    console.log('[Order Debug] Raw product data:', {
      productId: product.id,
      name: product.name,
      allStores: product.storeQuantities.map(sq => ({
        storeId: sq.store.id,
        quantity: sq.quantity,
        regionId: sq.store.regionId,
        region_id: sq.store.region_id,
        countryId: sq.store.countryId
      }))
    });

    console.log('[Order Debug] User region/country:', {
      userRegionId,
      userCountryId
    });

    // First filter: Get all active stores
    const activeStores = product.storeQuantities.filter(sq => {
      const store = sq.store;
      
      // Store must be active
      if (store.status !== 0) {
        console.log(`[Order Debug] Store ${store.id} (${store.name}) skipped: inactive (status ${store.status})`);
        return false;
      }
      
      return true;
    });
    
    console.log('[Order Debug] Active stores:', {
      total: activeStores.length,
      stores: activeStores.map(sq => ({
        id: sq.store.id,
        name: sq.store.name,
        regionId: sq.store.regionId || sq.store.region_id,
        countryId: sq.store.countryId,
        quantity: sq.quantity
      }))
    });
    
    // Second filter: Get region-matching stores (primary preference)
    const regionMatchingStores = activeStores.filter(sq => {
      const store = sq.store;
      const storeRegionId = store.regionId || store.region_id;
      
      // Store matches if its region matches user's region
      const matches = storeRegionId === userRegionId;
      
      if (matches) {
        console.log(`[Order Debug] Store ${store.id} (${store.name}) matched region:`, {
          storeRegionId,
          userRegionId
        });
      }
      
      return matches;
    });
    
    // Third filter: Get country-level stores (fallback)
    const countryMatchingStores = activeStores.filter(sq => {
      const store = sq.store;
      const storeRegionId = store.regionId || store.region_id;
      const storeCountryId = store.countryId;
      
      // Store matches if it has no region (country-level store) and matches country
      const matches = !storeRegionId && storeCountryId === userCountryId;
      
      if (matches) {
        console.log(`[Order Debug] Store ${store.id} (${store.name}) matched country:`, {
          storeCountryId,
          userCountryId,
          reason: 'country-level store'
        });
      }
      
      return matches;
    });
    
    console.log('[Order Debug] Region and country matching stores:', {
      regionMatches: regionMatchingStores.length,
      countryMatches: countryMatchingStores.length,
      regionStock: regionMatchingStores.reduce((sum, sq) => sum + Number(sq.quantity || 0), 0),
      countryStock: countryMatchingStores.reduce((sum, sq) => sum + Number(sq.quantity || 0), 0)
    });
    
    // Combine both region and country stores for maximum availability
    let availableStoreQuantities = [...regionMatchingStores, ...countryMatchingStores];
    
    console.log('[Order Debug] Available stores after filtering:', {
      total: product.storeQuantities.length,
      matching: availableStoreQuantities.length,
      stores: availableStoreQuantities.map(sq => ({
        id: sq.store.id,
        name: sq.store.name,
        quantity: sq.quantity,
        regionId: sq.store.regionId,
        region_id: sq.store.region_id,
        countryId: sq.store.countryId
      }))
    });

    // Log raw quantities for debugging
    console.log('[Order Debug] Raw quantities before calculation:', {
      allStores: product.storeQuantities.map(sq => ({
        storeId: sq.store.id,
        name: sq.store.name,
        quantity: sq.quantity,
        quantityType: typeof sq.quantity,
        regionId: sq.store.regionId,
        region_id: sq.store.region_id,
        countryId: sq.store.countryId,
        status: sq.store.status
      }))
    });
    
    // Calculate total available quantity from matching stores
    const totalAvailableQuantity = availableStoreQuantities.reduce((sum, sq) => {
      // Ensure quantity is a number
      const quantity = sq.quantity !== null && sq.quantity !== undefined ? Number(sq.quantity) : 0;
      
      console.log(`[Order Debug] Adding quantity from store ${sq.store.id} (${sq.store.name}):`, {
        originalQuantity: sq.quantity,
        originalType: typeof sq.quantity,
        convertedQuantity: quantity,
        convertedType: typeof quantity,
        currentSum: sum
      });
      
      return sum + quantity;
    }, 0);
    
    console.log('[Order Debug] Final stock calculation:', {
      productId: product.id,
      productName: product.name,
      totalStores: availableStoreQuantities.length,
      totalAvailable: totalAvailableQuantity,
      requestedQuantity: item.quantity,
      matchingStores: availableStoreQuantities.map(sq => ({
        storeId: sq.store.id,
        name: sq.store.name,
        regionId: sq.store.regionId,
        region_id: sq.store.region_id,
        countryId: sq.store.countryId,
        quantity: sq.quantity,
        status: sq.store.status
      }))
    });

    // Check if we have any active stores at all for this product
    if (activeStores.length === 0) {
      const error = `No active stores found with stock for product ${product.name}.`;
      console.log('[Order Debug] No active stores found:', {
        productId: product.id,
        productName: product.name,
        totalStores: product.storeQuantities.length
      });
      return res.status(400).json({ success: false, error });
    }
    
    // Check if we have any region or country matching stores
    if (availableStoreQuantities.length === 0) {
      // Get stock information for debugging
      const regionStock = regionMatchingStores.reduce((sum, sq) => sum + Number(sq.quantity || 0), 0);
      const countryStock = countryMatchingStores.reduce((sum, sq) => sum + Number(sq.quantity || 0), 0);
      const totalActiveStock = activeStores.reduce((sum, sq) => sum + Number(sq.quantity || 0), 0);
      
      const error = `No stock available for product ${product.name} in your region (${userRegionId}) or country (${userCountryId}). Please contact support.`;
      console.log('[Order Debug] No matching stores found:', {
        productId: product.id,
        productName: product.name,
        userRegion: userRegionId,
        userCountry: userCountryId,
        totalStores: product.storeQuantities.length,
        activeStores: activeStores.length,
        regionMatchingStores: regionMatchingStores.length,
        countryMatchingStores: countryMatchingStores.length,
        regionStock,
        countryStock,
        totalActiveStock
      });
      return res.status(400).json({ success: false, error });
    }
    
    // Ensure item.quantity is a number
    const requestedQuantity = Number(item.quantity);
    
    // Calculate available stock in region and country
    const regionStock = regionMatchingStores.reduce((sum, sq) => sum + Number(sq.quantity || 0), 0);
    const countryStock = countryMatchingStores.reduce((sum, sq) => sum + Number(sq.quantity || 0), 0);
    
    console.log('[Order Debug] Stock availability:', {
      productName: product.name,
      requestedQuantity,
      regionStock,
      countryStock,
      selectedStock: totalAvailableQuantity,
      usingRegionStock: regionMatchingStores.length > 0
    });
    
    // Check if we have sufficient stock in either region or country
    if (isNaN(totalAvailableQuantity) || totalAvailableQuantity === 0 || totalAvailableQuantity < requestedQuantity) {
      // If region stock is insufficient, check if country stock would be sufficient
      if (countryStock >= requestedQuantity && regionMatchingStores.length > 0) {
        // Switch to country-level stores if they have sufficient stock
        console.log('[Order Debug] Switching to country-level stores due to insufficient region stock');
        availableStoreQuantities = countryMatchingStores;
        totalAvailableQuantity = countryStock;
      } else {
        // Neither region nor country has sufficient stock
        let errorMsg = '';
        if (regionMatchingStores.length > 0) {
          errorMsg = `Insufficient stock for product ${product.name}. You requested ${requestedQuantity} units but only ${regionStock} units are available in your region and ${countryStock} units in your country.`;
        } else {
          errorMsg = `Insufficient stock for product ${product.name}. You requested ${requestedQuantity} units but only ${countryStock} units are available in your country.`;
        }
        
        console.log('[Order Debug] Insufficient stock:', {
          productId: product.id,
          productName: product.name,
          requested: requestedQuantity,
          regionStock,
          countryStock,
          regionStores: regionMatchingStores.length,
          countryStores: countryMatchingStores.length
        });
        
        return res.status(400).json({ success: false, error: errorMsg });
      }
    }
    
    console.log('[Order Debug] ✅ Stock validation passed:', {
      product: product.name,
      requested: item.quantity,
      available: totalAvailableQuantity,
      stores: availableStoreQuantities.map(sq => ({
        store: sq.store.name,
        quantity: sq.quantity,
        regionId: sq.store.regionId,
        region_id: sq.store.region_id,
        countryId: sq.store.countryId
      }))
    });

    console.log('[Order Debug] Available store quantities:', availableStoreQuantities);
    
    // Find the store with the highest quantity for fulfillment
    const maxQuantityStore = availableStoreQuantities.reduce((max, sq) =>
      sq.quantity > (max?.quantity || 0) ? sq : max,
      null
    );

    console.log('[Order Debug] Availability summary:', {
      totalStores: availableStoreQuantities.length,
      totalQuantityAvailable: totalAvailableQuantity,
      requestedQuantity: item.quantity,
      bestStoreId: maxQuantityStore?.store?.id,
      bestStoreQuantity: maxQuantityStore?.quantity
    });

    console.log('[Order Debug] Max available quantity for product', product.name, 'in selected store:', {
      store: maxQuantityStore ? maxQuantityStore.storeId : null,
      maxQuantity: totalAvailableQuantity,
      requestedQuantity: item.quantity
    });
    console.log('[Order Debug] Stock availability result:', {
      productId: product.id,
      productName: product.name,
      requestedQuantity: item.quantity
    });

    // Store the item information for later use
    createdItems.push({
      productId: item.productId,
      quantity: item.quantity,
      priceOptionId: item.priceOptionId,
      storeId: maxQuantityStore.store.id,
      store: maxQuantityStore.store,
      originalQuantity: maxQuantityStore.quantity
    });
  }

  try {
    console.log('[Order Debug] Processing order items for batch operations');
    
    // Gather all productIds and priceOptionIds for batch operations
    const productIds = orderItemsToUse.map(item => item.productId);
    const priceOptionIds = orderItemsToUse.map(item => item.priceOptionId).filter(Boolean);
    
    console.log('[Order Debug] Batch fetching data:', {
      productIds,
      priceOptionIds
    });
    
    // Batch fetch products
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });
    const productsById = Object.fromEntries(products.map(p => [p.id, p]));
    
    // Batch fetch categories with price options
    const categoryIds = [...new Set(products.map(p => p.category_id).filter(Boolean))];
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      include: { priceOptions: true }
    });
    const categoriesById = Object.fromEntries(categories.map(c => [c.id, c]));
    
    console.log('[Order Debug] Batch fetched data:', {
      products: products.length,
      categories: categories.length
    });
    
    // Calculate total amount and prepare order items data
    let totalAmount = 0;
    const orderItemsData = [];
    const validItems = [];
    
    for (const item of orderItemsToUse) {
      const product = productsById[item.productId];
      if (!product) {
        console.log(`[Order Debug] Product ${item.productId} not found in batch results, skipping`);
        continue;
      }
      
      const category = categoriesById[product.category_id];
      if (!category) {
        console.log(`[Order Debug] Category for product ${product.id} not found, skipping`);
        continue;
      }
      
      let itemPrice = 0;
      let priceOptionId = null;
      
      if (item.priceOptionId) {
        const priceOption = category.priceOptions.find(po => po.id === item.priceOptionId);
        if (priceOption) {
          itemPrice = priceOption.value || 0;
          priceOptionId = priceOption.id;
        } else {
          console.log(`[Order Debug] Price option ${item.priceOptionId} not found for product ${product.id}, using default price`);
        }
      }
      
      // Use the store information from createdItems if available
      const createdItem = createdItems.find(ci => ci.productId === item.productId);
      const storeId = createdItem ? createdItem.storeId : null;
      
      if (!storeId) {
        console.log(`[Order Debug] No store found for product ${product.id}, skipping`);
        continue;
      }
      
      totalAmount += itemPrice * item.quantity;
      
      orderItemsData.push({
        quantity: item.quantity,
        productId: item.productId,
        priceOptionId: priceOptionId,
        storeId: storeId
      });
      
      validItems.push({
        ...item,
        storeId,
        itemPrice
      });
    }
    
    if (orderItemsData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid order items to process'
      });
    }
    
    console.log('[Order Debug] Prepared order data:', {
      totalAmount,
      validItems: orderItemsData.length
    });
    
    // Create the order first (outside transaction)
    const newOrder = await prisma.myOrder.create({
      data: {
        userId: userId,
        totalAmount: parseFloat((totalAmount || 0).toFixed(2)),
        comment: req.body.comment || '',
        customerType: req.body.customerType || 'RETAIL',
        customerId: req.body.customerId || '',
        customerName: req.body.customerName || 'Customer',
        clientId: clientId
      }
    });
    
    console.log('[Order Debug] Created order:', {
      orderId: newOrder.id
    });
    
    // Create order items in a transaction with a longer timeout
    await prisma.$transaction(
      async (tx) => {
        // Create order items and update store quantities
        for (const item of validItems) {
          // Update store quantity
          const createdItem = createdItems.find(ci => ci.productId === item.productId);
          
          if (createdItem) {
            // Find the store quantity record first
            const storeQuantity = await tx.storeQuantity.findFirst({
              where: {
                storeId: item.storeId,
                productId: item.productId
              }
            });
            
            if (storeQuantity) {
              await tx.storeQuantity.update({
                where: { id: storeQuantity.id },
                data: {
                  quantity: { decrement: item.quantity }
                }
              });
              
              console.log('[Order Debug] Updated store quantity:', {
                storeId: item.storeId,
                productId: item.productId,
                decremented: item.quantity
              });
            }
          }
          
          // Create order item
          const orderItemData = {
            quantity: item.quantity,
            orderId: newOrder.id,
            productId: item.productId
          };
          
          // Only include priceOptionId if it exists
          if (item.priceOptionId) {
            orderItemData.priceOptionId = item.priceOptionId;
          }
          
          await tx.orderItem.create({
            data: orderItemData
          });
        }
      },
      {
        timeout: 10000 // Increase timeout to 10 seconds
      }
    );
    
    // Get the complete order with all relationships after transaction
    const result = await prisma.myOrder.findUnique({
      where: { id: newOrder.id },
      include: {
        orderItems: {
          include: {
            product: true,
            priceOption: true
          }
        },
        client: true,
        user: {
          select: {
            id: true,
            name: true,
            phoneNumber: true
          }
        }
      }
    });
    
    console.log('[Order Debug] Transaction completed successfully');
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Order Debug] Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: error.message
    });
  }
});




// Get orders with pagination
const getOrders = async (req, res) => {
  const salesRepId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    // Get total count for pagination
    const total = await prisma.myOrder.count({
      where: { userId: salesRepId },
    });

    // Get orders with pagination and order items
    const orders = await prisma.myOrder.findMany({
      where: { userId: salesRepId },
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        client: true,
        user: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
    });

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: orders,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
    });
  }
};


// Update order (updating order items)
const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { orderItems } = req.body;
  const salesRepId = req.user.id;

  try {
    console.log('[Update Order Debug] Request body:', req.body);
    console.log('[Update Order Debug] Order items:', orderItems);
    
    // Validate the order exists and belongs to the sales rep
    const existingOrder = await prisma.myOrder.findFirst({
      where: {
        id: parseInt(id),
        userId: salesRepId,
      },
      include: {
        orderItems: true
      }
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or unauthorized',
      });
    }

    console.log('[Update Order Debug] Found existing order:', {
      id: existingOrder.id,
      totalAmount: existingOrder.totalAmount,
      itemCount: existingOrder.orderItems.length
    });

    // Ensure each order item has productId and quantity
    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing orderItems in the request body',
      });
    }
    
    // First, calculate the new total amount
    let totalAmount = 0;
    
    // Transaction to handle all updates atomically
    await prisma.$transaction(async (tx) => {
      // Get existing order items to compare with new ones
      const existingItems = await tx.orderItem.findMany({
        where: { orderId: existingOrder.id }
      });
      
      console.log('[Update Order Debug] Existing items:', existingItems.length);
      
      // Process each order item
      for (const item of orderItems) {
        if (!item.productId || !item.quantity) {
          throw new Error('Each order item must have productId and quantity');
        }
        
        // Get product and price option to calculate price
        const product = await tx.product.findUnique({
          where: { id: item.productId }
        });
        
        if (!product) {
          console.log(`[Update Order Debug] Product ${item.productId} not found, skipping`);
          continue;
        }
        
        let itemPrice = 0;
        if (item.priceOptionId) {
          const priceOption = await tx.priceOption.findUnique({
            where: { id: item.priceOptionId }
          });
          
          if (priceOption) {
            itemPrice = priceOption.value || 0;
          }
        }
        
        // Add to total amount
        totalAmount += itemPrice * item.quantity;
        
        // Check if the order already has an item for this product
        const existingOrderItem = existingItems.find(
          oi => oi.productId === item.productId && 
               (item.priceOptionId ? oi.priceOptionId === item.priceOptionId : true)
        );

        if (existingOrderItem) {
          // Update the existing order item
          console.log(`[Update Order Debug] Updating existing item: ${existingOrderItem.id}`);
          await tx.orderItem.update({
            where: { id: existingOrderItem.id },
            data: { 
              quantity: item.quantity,
              priceOptionId: item.priceOptionId || null
            }
          });
        } else {
          // Create a new order item
          console.log(`[Update Order Debug] Creating new item for product: ${item.productId}`);
          await tx.orderItem.create({
            data: {
              orderId: existingOrder.id,
              productId: item.productId,
              quantity: item.quantity,
              priceOptionId: item.priceOptionId || null
            }
          });
        }
      }
      
      // Remove items that are no longer in the order
      const newProductIds = orderItems.map(item => item.productId);
      const itemsToRemove = existingItems.filter(item => !newProductIds.includes(item.productId));
      
      for (const item of itemsToRemove) {
        console.log(`[Update Order Debug] Removing item: ${item.id}`);
        await tx.orderItem.delete({
          where: { id: item.id }
        });
      }
      
      // Update the order with the new total amount
      await tx.myOrder.update({
        where: { id: existingOrder.id },
        data: {
          totalAmount: parseFloat(totalAmount.toFixed(2))
        }
      });
    }, { timeout: 10000 }); // 10 second timeout for the transaction
    
    console.log('[Update Order Debug] Updated total amount:', totalAmount);

    // Get the updated order with all relationships
    const updatedOrder = await prisma.myOrder.findUnique({
      where: { id: existingOrder.id },
      include: {
        orderItems: {
          include: {
            product: true,
            priceOption: true
          }
        },
        client: true,
        user: {
          select: {
            id: true,
            name: true,
            phoneNumber: true
          }
        }
      }
    });

    console.log('[Update Order Debug] Order updated successfully');
    
    res.json({
      success: true,
      data: updatedOrder
    });
  } catch (error) {
    console.error('[Update Order Debug] Error updating order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order',
      details: error.message
    });
  }
};

// Delete order
const deleteOrder = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const salesRepId = req.user.id;

    console.log(`[DELETE] Processing request - Order: ${orderId}, SalesRep: ${salesRepId}`);

    if (isNaN(orderId)) {
      console.log('[ERROR] Invalid order ID format');
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format'
      });
    }

    // First find the order with a single query including relations
    const existingOrder = await prisma.myOrder.findFirst({
      where: {
        id: orderId,
        userId: salesRepId,
      },
      include: {
        orderItems: true
      }
    });

    if (!existingOrder) {
      console.log(`[ERROR] Order ${orderId} not found or not owned by sales rep ${salesRepId}`);
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Delete order in a transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      // Delete order items first by disconnecting them
      if (existingOrder.orderItems.length > 0) {
        await tx.myOrder.update({
          where: { id: orderId },
          data: {
            orderItems: {
              disconnect: existingOrder.orderItems.map(item => ({ id: item.id }))
            }
          }
        });
      }

      // Then delete the order
      await tx.myOrder.delete({
        where: { id: orderId }
      });
    });

    console.log(`[SUCCESS] Order ${orderId} deleted successfully`);
    return res.status(200).json({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    console.error('[ERROR] Failed to delete order:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete order'
    });
  }
};

// Get total items sold by the current user (optionally within a date range)
const getUserSalesSummary = async (req, res) => {
  const salesRepId = req.user.id;
  // Optional: filter by last N days
  const { days } = req.query;
  let dateFilter = {};
  if (days) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));
    dateFilter = { gte: sinceDate };
  }

  try {
    // Get all orders for the user (optionally within date range)
    const orders = await prisma.myOrder.findMany({
      where: {
        userId: salesRepId,
        ...(dateFilter.gte ? { createdAt: dateFilter } : {})
      },
      select: { id: true }
    });
    const orderIds = orders.map(o => o.id);

    // Aggregate total quantity from order items
    const totalItems = await prisma.orderItem.aggregate({
      where: { orderId: { in: orderIds } },
      _sum: { quantity: true }
    });

    // Optionally, return recent orders as well
    const recentOrders = await prisma.myOrder.findMany({
      where: { userId: salesRepId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        orderItems: true,
        client: true
      }
    });

    res.json({
      success: true,
      totalItemsSold: totalItems._sum.quantity || 0,
      recentOrders
    });
  } catch (error) {
    console.error('Error aggregating user sales:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to aggregate user sales'
    });
  }
};

module.exports = { 
  createOrder, 
  getOrders, 
  updateOrder, 
  deleteOrder, 
  getUserSalesSummary
};