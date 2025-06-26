const prisma = require('../lib/prisma');
const multer = require('multer');
const ImageKit = require('imagekit');
const path = require('path');
const { getCurrencyValue } = require('../lib/currencyUtils');

// Initialize ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Configure multer for image upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  },
}).single('image'); // 'image' is the field name in the form data

// Ensure userId is not null
const getUserId = (req) => {
  if (!req.user || !req.user.id) {
    throw new Error('User authentication required');
  }
  return req.user.id;
};

/**
 * Get products with stock filtering and country-specific overrides
 * 
 * This function implements a sophisticated product fetching system that:
 * 1. Filters products based on stock availability in user's country
 * 2. Applies country-specific currency filtering
 * 3. Handles price options with country-specific values
 * 4. Provides accurate pagination for filtered results
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with filtered products and pagination
 */
const getProducts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page = 1, limit = 10 } = req.query;

    console.log(`[DEBUG] Fetching products for user ID: ${userId}, page: ${page}, limit: ${limit}`);

    // Get user country information for currency display and stock filtering
    const user = await prisma.salesRep.findUnique({
      where: { id: userId },
      select: { 
        countryId: true,
        country: true,
        name: true
      }
    });

    console.log(`[DEBUG] User info:`, {
      userId,
      countryId: user?.countryId,
      country: user?.country,
      userName: user?.name
    });

    if (!user) {
      console.error(`[ERROR] User not found for ID: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // 🎯 STOCK FILTERING: Only fetch products with stock in user's country
    // This is a database-level filter for better performance
    // Criteria:
    // - quantity > 0 (has stock)
    // - store.countryId matches user's country
    // - store.status = 0 (active store)
    const products = await prisma.product.findMany({
      where: {
        storeQuantities: {
          some: {
            quantity: { gt: 0 },           // Has stock
            store: {
              countryId: user.countryId,   // In user's country
              status: 0                    // Active store
            }
          }
        }
      },
      include: {
        client: true,
        orderItems: true,
        storeQuantities: {
          include: {
            store: true
          }
        },
        purchaseHistory: true
      },
      orderBy: {
        name: 'asc',
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    console.log(`[DEBUG] Found ${products.length} products with stock in country ${user.countryId}`);

    // 🔍 DEBUG: Let's also fetch ALL products to see what's being filtered out
    const allProducts = await prisma.product.findMany({
      include: {
        storeQuantities: {
          include: {
            store: true
          }
        }
      },
      orderBy: {
        name: 'asc',
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    console.log(`[DEBUG] Total products in database: ${allProducts.length}`);
    
    // Debug each product's stock situation
    allProducts.forEach(product => {
      const countryStores = product.storeQuantities.filter(sq => 
        sq.store.countryId === user.countryId
      );
      const countryStoresWithStock = countryStores.filter(sq => 
        sq.quantity > 0 && sq.store.status === 0
      );
      
      console.log(`[DEBUG] Product ${product.id} (${product.name}):`, {
        productId: product.id,
        productName: product.name,
        totalStores: product.storeQuantities.length,
        countryStores: countryStores.length,
        countryStoresWithStock: countryStoresWithStock.length,
        stockDetails: countryStores.map(sq => ({
          storeId: sq.storeId,
          storeName: sq.store.name,
          quantity: sq.quantity,
          countryId: sq.store.countryId,
          status: sq.store.status,
          isActive: sq.store.status === 0,
          hasStock: sq.quantity > 0
        }))
      });
    });

    // Process each product to add price options and apply currency filtering
    const productsWithPriceOptions = await Promise.all(products.map(async (product, index) => {
      console.log(`[DEBUG] Processing product ${index + 1}/${products.length}:`, {
        productId: product.id,
        productName: product.name,
        categoryId: product.category_id
      });

      // 📋 CATEGORY & PRICE OPTIONS: Fetch category with price options
      let categoryWithPriceOptions = null;
      try {
        categoryWithPriceOptions = await prisma.category.findUnique({
          where: { id: product.category_id },
          include: {
            priceOptions: true
          }
        });

        console.log(`[DEBUG] Category lookup for product ${product.id}:`, {
          categoryId: product.category_id,
          categoryFound: !!categoryWithPriceOptions,
          categoryName: categoryWithPriceOptions?.name,
          priceOptionsCount: categoryWithPriceOptions?.priceOptions?.length || 0
        });

        if (categoryWithPriceOptions?.priceOptions) {
          console.log(`[DEBUG] Price options for category ${product.category_id}:`, 
            categoryWithPriceOptions.priceOptions.map(po => ({
              id: po.id,
              option: po.option,
              value: po.value,
              value_tzs: po.value_tzs,
              value_ngn: po.value_ngn
            }))
          );
        }
      } catch (error) {
        console.error(`[ERROR] Failed to fetch category for product ${product.id}:`, error);
        categoryWithPriceOptions = null;
      }

      // 🏪 STORE QUANTITIES FILTERING: Only show stores with stock in user's country
      // This filters the already-fetched store quantities to only show relevant stores
      const filteredStoreQuantities = product.storeQuantities.filter(sq => {
        const store = sq.store;
        const hasStock = sq.quantity > 0;                    // Has stock
        const isUserCountry = store.countryId === user.countryId;  // In user's country
        const isActive = store.status === 0;                 // Active store
        
        return hasStock && isUserCountry && isActive;
      });

      console.log(`[DEBUG] Filtered store quantities for product ${product.id}:`, {
        originalCount: product.storeQuantities.length,
        filteredCount: filteredStoreQuantities.length,
        stores: filteredStoreQuantities.map(sq => ({
          storeId: sq.storeId,
          storeName: sq.store?.name,
          quantity: sq.quantity,
          countryId: sq.store.countryId
        }))
      });

      // 💰 CURRENCY FILTERING: Apply country-specific currency conversion
      // This converts product unit costs based on user's country
      const originalUnitCost = product.unit_cost;
      const filteredUnitCost = getCurrencyValue(product, user.countryId, 'product');
      
      console.log(`[DEBUG] Currency filtering for product ${product.id}:`, {
        countryId: user.countryId,
        originalUnitCost,
        filteredUnitCost,
        currencyType: 'product'
      });

      // 💰 PRICE OPTIONS CURRENCY FILTERING: Convert price option values
      // This applies country-specific currency conversion to each price option
      const filteredPriceOptions = categoryWithPriceOptions?.priceOptions.map(priceOption => {
        const originalValue = priceOption.value;
        const filteredValue = getCurrencyValue(priceOption, user.countryId, 'priceOption');
        
        console.log(`[DEBUG] Price option currency filtering:`, {
          priceOptionId: priceOption.id,
          option: priceOption.option,
          originalValue,
          filteredValue,
          countryId: user.countryId,
          currencyType: 'priceOption'
        });

        return {
          ...priceOption,
          // Filter price option value based on country
          value: filteredValue
        };
      }) || [];

      // 🎯 FINAL PRODUCT OBJECT: Combine all filtered data
      const filteredProduct = {
        ...product,
        // Filter product unit cost based on country
        unit_cost: filteredUnitCost,
        priceOptions: filteredPriceOptions,
        storeQuantities: filteredStoreQuantities  // Only stores with stock in user's country
      };

      console.log(`[DEBUG] Final product ${product.id} data:`, {
        productId: filteredProduct.id,
        productName: filteredProduct.name,
        unitCost: filteredProduct.unit_cost,
        priceOptionsCount: filteredProduct.priceOptions.length,
        storeQuantitiesCount: filteredProduct.storeQuantities.length
      });

      return filteredProduct;
    }));

    // 📊 PAGINATION: Get accurate total count for filtered products
    // This ensures pagination works correctly with stock filtering
    const totalProductsWithStock = await prisma.product.count({
      where: {
        storeQuantities: {
          some: {
            quantity: { gt: 0 },
            store: {
              countryId: user.countryId,
              status: 0
            }
          }
        }
      }
    });

    console.log(`[DEBUG] Final response summary:`, {
      productsReturned: productsWithPriceOptions.length,
      totalProductsWithStock,
      userCountryId: user.countryId,
      userCountry: user.country,
      stockFilterApplied: true
    });

    // 🚀 RESPONSE: Return filtered products with accurate pagination
    res.status(200).json({
      success: true,
      data: productsWithPriceOptions,
      userCountry: user, // Include user country info for frontend currency logic
      pagination: {
        total: totalProductsWithStock,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalProductsWithStock / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    
    if (error.message === 'User authentication required') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Handle image upload
const handleImageUpload = async (req) => {
  if (!req.file) return null;

  try {
    const result = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName: `product-${Date.now()}${path.extname(req.file.originalname)}`,
      folder: '/products'
    });
    return result.url;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error('Failed to upload image');
  }
};

// Create a new product
const createProduct = async (req, res) => {
  // Handle file upload first
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error: ' + err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const {
        name,
        description,
        category_id,
        category,
        currentStock,
        clientId,
        unit_cost,
        unit_cost_tzs,
        unit_cost_ngn,
      } = req.body;
      const userId = getUserId(req);

      // Input validation
      if (!name) {
        return res.status(400).json({ error: 'Missing required field: name' });
      }

      if (!clientId) {
        return res.status(400).json({ error: 'Missing required field: clientId' });
      }

      // Check if client exists
      const client = await prisma.clients.findUnique({
        where: { id: parseInt(clientId) },
      });

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // Upload image if present
      let imageUrl = null;
      try {
        imageUrl = await handleImageUpload(req);
      } catch (error) {
        return res.status(500).json({ error: 'Image upload failed' });
      }

      // Create the product
      const product = await prisma.product.create({
        data: {
          name,
          description,
          category_id: parseInt(category_id),
          category,
          currentStock: parseInt(currentStock) || 0,
          clientId: parseInt(clientId),
          image: imageUrl,
          unit_cost: parseFloat(unit_cost) || 0,
          unit_cost_tzs: parseFloat(unit_cost_tzs) || 0,
          unit_cost_ngn: parseFloat(unit_cost_ngn) || 0,
        },
        include: {
          client: true,
          orderItems: true,
          storeQuantities: true,
          purchase: true,
          purchaseHistory: true
        },
      });

      console.log('Product created successfully:', product);
      res.status(201).json(product);
    } catch (error) {
      console.error('Error creating product:', error);
      
      if (error.message === 'User authentication required') {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      res.status(500).json({ 
        error: 'Failed to create product',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
};

// Update a product
const updateProduct = async (req, res) => {
  // Handle file upload first
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error: ' + err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    try {
      const { id } = req.params;
      const {
        name,
        description,
        category_id,
        category,
        currentStock,
        clientId,
        unit_cost,
        unit_cost_tzs,
        unit_cost_ngn,
      } = req.body;
      const userId = getUserId(req);

      // Check if product exists
      const existingProduct = await prisma.product.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Upload image if present
      let imageUrl = null;
      try {
        imageUrl = await handleImageUpload(req);
      } catch (error) {
        return res.status(500).json({ error: 'Image upload failed' });
      }

      // Update the product
      const product = await prisma.product.update({
        where: { id: parseInt(id) },
        data: {
          name: name || existingProduct.name,
          description: description || existingProduct.description,
          category_id: category_id ? parseInt(category_id) : existingProduct.category_id,
          category: category || existingProduct.category,
          currentStock: currentStock ? parseInt(currentStock) : existingProduct.currentStock,
          clientId: clientId ? parseInt(clientId) : existingProduct.clientId,
          image: imageUrl || existingProduct.image,
          unit_cost: unit_cost ? parseFloat(unit_cost) : existingProduct.unit_cost,
          unit_cost_tzs: unit_cost_tzs ? parseFloat(unit_cost_tzs) : existingProduct.unit_cost_tzs,
          unit_cost_ngn: unit_cost_ngn ? parseFloat(unit_cost_ngn) : existingProduct.unit_cost_ngn,
        },
        include: {
          client: true,
          orderItems: true,
          storeQuantities: true,
          purchase: true,
          purchaseHistory: true
        },
      });

      console.log('Product updated successfully:', product);
      res.json(product);
    } catch (error) {
      console.error('Error updating product:', error);
      
      if (error.message === 'User authentication required') {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      res.status(500).json({ 
        error: 'Failed to update product',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
};

// Delete a product
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    // Input validation
    if (!id) {
      return res.status(400).json({ error: 'Missing required field: id' });
    }

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete the product
    await prisma.product.delete({
      where: { id: parseInt(id) },
    });

    console.log('Product deleted successfully:', id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting product:', error);
    
    if (error.message === 'User authentication required') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete product',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getCurrencyValue,
}; 