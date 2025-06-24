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

// Helper function for retry logic
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Check if it's a database connection error
      if (error.code === 'P1001' || error.message.includes('Can\'t reach database server')) {
        console.warn(`Database connection attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error; // Don't retry for other types of errors
      }
    }
  }
};

// Helper function to safely fetch store quantities with fallback
const getStoreQuantitiesWithFallback = async (productId) => {
  try {
    return await retryOperation(async () => {
      return await prisma.storeQuantity.findMany({
        where: { productId: productId },
        include: {
          store: true
        }
      });
    });
  } catch (error) {
    console.warn(`Failed to fetch store quantities for product ${productId}:`, error.message);
    // Return empty array as fallback
    return [];
  }
};

// Get all products
const getProducts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page = 1, limit = 10 } = req.query;

    // Get user country information for currency display with retry
    let user;
    try {
      user = await retryOperation(async () => {
        return await prisma.salesRep.findUnique({
          where: { id: userId },
          select: { 
            countryId: true
          }
        });
      });
    } catch (error) {
      console.warn('Failed to fetch user country info, using default:', error.message);
      user = { countryId: 1 }; // Default fallback
    }

    // Get products with pagination and retry
    let products;
    try {
      products = await retryOperation(async () => {
        return await prisma.product.findMany({
          include: {
            client: true,
            orderItems: true,
            storeQuantities: true,
            purchaseHistory: true
          },
          orderBy: {
            name: 'asc',
          },
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        });
      });
    } catch (error) {
      console.error('Failed to fetch products after retries:', error);
      return res.status(503).json({
        error: 'Database temporarily unavailable',
        message: 'Please try again later',
        retryAfter: 30 // Suggest retry after 30 seconds
      });
    }

    // Get price options for the category_id of each product with fallback
    const productsWithPriceOptions = await Promise.all(products.map(async (product) => {
      let categoryWithPriceOptions;
      try {
        categoryWithPriceOptions = await retryOperation(async () => {
          return await prisma.category.findUnique({
            where: { id: product.category_id },
            include: {
              priceOptions: true
            }
          });
        });
      } catch (error) {
        console.warn(`Failed to fetch category for product ${product.id}:`, error.message);
        categoryWithPriceOptions = { priceOptions: [] }; // Fallback
      }

      // Get store quantities for this product with fallback
      const storeQuantities = await getStoreQuantitiesWithFallback(product.id);

      // Apply currency filtering based on user's country
      const filteredProduct = {
        ...product,
        // Filter product unit cost based on country
        unit_cost: getCurrencyValue(product, user.countryId, 'product'),
        priceOptions: categoryWithPriceOptions?.priceOptions.map(priceOption => ({
          ...priceOption,
          // Filter price option value based on country
          value: getCurrencyValue(priceOption, user.countryId, 'priceOption')
        })) || [],
        storeQuantities: storeQuantities
      };

      return filteredProduct;
    }));

    // Get total count for pagination with retry
    let totalProducts;
    try {
      totalProducts = await retryOperation(async () => {
        return await prisma.product.count();
      });
    } catch (error) {
      console.warn('Failed to get total product count, using fallback:', error.message);
      totalProducts = products.length; // Fallback to current page count
    }

    res.status(200).json({
      success: true,
      data: productsWithPriceOptions,
      userCountry: user, // Include user country info for frontend currency logic
      pagination: {
        total: totalProducts,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalProducts / parseInt(limit)),
      },
      // Add metadata about any fallbacks used
      metadata: {
        hasFallbacks: productsWithPriceOptions.some(p => p.storeQuantities.length === 0),
        databaseStatus: 'connected'
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    
    if (error.message === 'User authentication required') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Handle specific database connection errors
    if (error.code === 'P1001' || error.message.includes('Can\'t reach database server')) {
      return res.status(503).json({
        error: 'Database temporarily unavailable',
        message: 'Please try again later',
        retryAfter: 30,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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