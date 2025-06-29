const prisma = require('../lib/prisma');
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const path = require('path');
const { uploadFile } = require('../lib/uploadService');
const { Prisma } = require('@prisma/client');
const { hasOldBalance } = require('./balanceController');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${ext}. Only JPG, JPEG, PNG, and PDF files are allowed.`));
    }
  }
}).single('image');

// Add the balance check function
const checkClientBalance = async (clientId) => {
  try {
    const latestBalance = await prisma.clientHistory.findFirst({
      where: { client_id: parseInt(clientId) },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestBalance) return { hasOldBalance: false };

    const balanceDate = new Date(latestBalance.createdAt);
    const today = new Date();
    const balanceAge = Math.floor((today - balanceDate) / (1000 * 60 * 60 * 24));

    const OLD_BALANCE_THRESHOLD = 30;
    return {
      hasOldBalance: balanceAge > OLD_BALANCE_THRESHOLD,
      balanceAge,
      lastUpdated: latestBalance.createdAt
    };
  } catch (error) {
    console.error('[Balance Check] Error:', error);
    return { hasOldBalance: false };
  }
};

const createOrder = asyncHandler(async (req, res) => {
  upload(req, res, async function(err) {
    if (err) {
      console.error('[Order Debug] Multer error:', err);
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    try {
      const clientId = req.body.clientId || 1;

      // Check for old balances using MyOrder
      const balanceCheck = await hasOldBalance(clientId);
      if (balanceCheck.hasOldBalance) {
        return res.status(200).json({
          success: false,
          hasOutstandingBalance: true,
          error: 'Outstanding Balance',
          message: `This client has an outstanding balance of ${balanceCheck.balance} from ${balanceCheck.balanceAge} days ago. Please ensure the previous balance is settled before creating a new order.`,
          balanceDetails: {
            age: balanceCheck.balanceAge,
            lastUpdated: balanceCheck.lastUpdated,
            balance: balanceCheck.balance,
            oldestOrder: balanceCheck.oldestOrder
          },
          dialog: {
            title: 'Outstanding Balance',
            message: `This client has an outstanding balance of ${balanceCheck.balance} from ${balanceCheck.balanceAge} days ago. Please ensure the previous balance is settled before creating a new order.`,
            type: 'warning'
          }
        });
      }

      // Continue with existing order creation process
      console.log('[Order Debug] Request body:', {
        hasFile: !!req.file,
        fileDetails: req.file ? {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        } : null,
        bodyImageUrl: req.body.imageUrl,
        body: req.body
      });

      // Handle image upload first
      let imageUrl = null;
      let thumbnailUrl = null;

      if (req.file) {
        try {
          const result = await uploadFile(req.file, {
            folder: 'whoosh/orders',
            type: 'document',
            generateThumbnail: true
          });
          imageUrl = result.main.url;
          thumbnailUrl = result.thumbnail?.url;
          console.log('[Order Debug] File upload successful:', {
            imageUrl,
            thumbnailUrl
          });
        } catch (error) {
          console.error('[Order Debug] File upload failed:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to upload order image'
          });
        }
      }

      // Get the region and country from the request
      const { items = [], orderItems = [], regionId, countryId } = req.body;
      // Extract clientId from request body or default to 1
      const orderItemsToUse = items.length > 0 ? items : orderItems;
      
      // Ensure we have a valid user ID from the authenticated user
      const userId = req.user?.id;
      
      // Use either the uploaded image URL or the one from request body
      const finalImageUrl = imageUrl || req.body.imageUrl || null;
      console.log('[Order Debug] Final image URL:', finalImageUrl);
      
      console.log('[Order Debug] Authentication check:', {
        hasUser: !!req.user,
        userId: userId,
        userDetails: req.user ? {
          id: req.user.id,
          name: req.user.name,
          role: req.user.role
        } : null
      });
      
      if (!userId) {
        console.log('[Order Debug] Authentication failed: No user ID');
        return res.status(401).json({
          success: false,
          error: 'Authentication required. Please log in again.'
        });
      }

      // Debug log the request body
      console.log('[Order Debug] Request body:', req.body);
      console.log('[Order Debug] User:', req.user);
      
      // Ensure we have region and country IDs
      const userRegionId = parseInt(regionId) || parseInt(req.user?.region_id);
      const userCountryId = parseInt(countryId) || parseInt(req.user?.countryId);
      
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

        // 🎯 COUNTRY-SPECIFIC STOCK VALIDATION OVERRIDE
        // This implements different stock validation rules based on user's country
        let availableStoreQuantities = [];
        
        if (userCountryId === 2) {
          // 🇹🇿 COUNTRY 2 OVERRIDE (Tanzania): Restrict to user's country only
          // This prevents country 2 users from accessing stock from other countries
          // This is a business rule to ensure country-specific stock management
          console.log('[Order Debug] 🎯 Country 2 override activated - restricting to user country only');
          
          availableStoreQuantities = activeStores.filter(sq => {
            const store = sq.store;
            const matches = store.countryId === userCountryId;
            
            if (matches) {
              console.log(`[Order Debug] Country 2 override: Store ${store.id} (${store.name}) matched user country:`, {
                storeCountryId: store.countryId,
                userCountryId: userCountryId
              });
            }
            
            return matches;
          });
          
          console.log('[Order Debug] Country 2 override results:', {
            totalActiveStores: activeStores.length,
            countryMatchingStores: availableStoreQuantities.length,
            userCountry: userCountryId
          });
          
        } else {
          // 🌍 NORMAL LOGIC: For other countries (1, 3, etc.)
          // Uses region-first, then country fallback approach
          // This allows flexible stock access for non-restricted countries
          console.log('[Order Debug] Using normal stock validation logic for country:', userCountryId);
          
          // Second filter: Get region-matching stores (primary preference)
          // Users prefer to get stock from their own region first
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
          // If no region stores, fall back to country-level stores
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
          availableStoreQuantities = [...regionMatchingStores, ...countryMatchingStores];
        }
        
        console.log('[Order Debug] Available stores after filtering:', {
          total: product.storeQuantities.length,
          matching: availableStoreQuantities.length,
          userCountry: userCountryId,
          overrideApplied: userCountryId === 2,
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
          const totalActiveStock = activeStores.reduce((sum, sq) => sum + Number(sq.quantity || 0), 0);
          
          let error = '';
          if (userCountryId === 2) {
            // Country 2 specific error message
            error = `No stock available for product ${product.name} in your country (${userCountryId}). Country 2 users can only access stock from their own country.`;
          } else {
            // Normal error message for other countries
            error = `No stock available for product ${product.name} in your region (${userRegionId}) or country (${userCountryId}). Please contact support.`;
          }
          
          console.log('[Order Debug] No matching stores found:', {
            productId: product.id,
            productName: product.name,
            userRegion: userRegionId,
            userCountry: userCountryId,
            totalStores: product.storeQuantities.length,
            activeStores: activeStores.length,
            totalActiveStock,
            overrideApplied: userCountryId === 2
          });
          return res.status(400).json({ success: false, error });
        }
        
        // Ensure item.quantity is a number
        const requestedQuantity = Number(item.quantity);
        
        console.log('[Order Debug] Stock availability:', {
          productName: product.name,
          requestedQuantity,
          selectedStock: totalAvailableQuantity,
          userCountry: userCountryId,
          overrideApplied: userCountryId === 2
        });
        
        // Check if we have sufficient stock
        if (isNaN(totalAvailableQuantity) || totalAvailableQuantity === 0 || totalAvailableQuantity < requestedQuantity) {
          let errorMsg = '';
          if (userCountryId === 2) {
            // Country 2 specific error message
            errorMsg = `Insufficient stock for product ${product.name}. You requested ${requestedQuantity} units but only ${totalAvailableQuantity} units are available in your country. Country 2 users can only access stock from their own country.`;
          } else {
            // Normal error message for other countries
            errorMsg = `Insufficient stock for product ${product.name}. You requested ${requestedQuantity} units but only ${totalAvailableQuantity} units are available.`;
          }
          
          console.log('[Order Debug] Insufficient stock:', {
            productId: product.id,
            productName: product.name,
            requested: requestedQuantity,
            available: totalAvailableQuantity,
            userCountry: userCountryId,
            overrideApplied: userCountryId === 2
          });
          
          return res.status(400).json({ success: false, error: errorMsg });
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
        
        // Get the store ID from the first item
        const storeId = orderItemsToUse[0]?.storeId;
        
        console.log('[Order Debug] Using store ID:', storeId);
        
        // Create the order first (outside transaction)
        console.log('[Order Debug] Creating order with image URL:', {
          imageUrl,
          bodyImageUrl: req.body.imageUrl,
          finalImageUrl: imageUrl || req.body.imageUrl || null
        });

        const newOrder = await prisma.myOrder.create({
          data: {
            user: {
              connect: {
                id: userId
              }
            },
            totalAmount: parseFloat((totalAmount || 0).toFixed(2)),
            totalCost: new Prisma.Decimal("0.00"),
            comment: req.body.comment || '',
            customerType: req.body.customerType || 'RETAIL',
            customerId: req.body.customerId || '',
            customerName: req.body.customerName || 'Customer',
            amountPaid: new Prisma.Decimal("0.00"),
            balance: new Prisma.Decimal(totalAmount.toString()),
            approved_by: req.body.approved_by || "Unapproved",
            approved_by_name: req.body.approved_by_name || "Pending",
            storeId: storeId,
            imageUrl: imageUrl || req.body.imageUrl || null,
            client: {
              connect: {
                id: clientId
              }
            },
            countryId: userCountryId,
            regionId: userRegionId,
            retail_manager: 0, // default value
            key_channel_manager: 0, // default value
            distribution_manager: 0 // default value
          }
        });

        console.log('[Order Debug] Order created successfully:', {
          orderId: newOrder.id,
          imageUrl: newOrder.imageUrl
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
    } catch (error) {
      console.error('[Order Debug] Error processing order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process order',
        details: error.message
      });
    }
  });
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


    const formattedOrders = orders.map(order => ({
      ...order,
      balance: String(order.balance ?? '0'),  // Ensure balance is always a string
    }));
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