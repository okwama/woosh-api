const prisma = require('../lib/prisma');
const multer = require('multer');
const ImageKit = require('imagekit');
const path = require('path');

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

// Get all products
const getProducts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page = 1, limit = 10 } = req.query;

    // Get products with pagination
    const products = await prisma.product.findMany({
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

    // Get price options for the category_id of each product
    const productsWithPriceOptions = await Promise.all(products.map(async (product) => {
      const categoryWithPriceOptions = await prisma.category.findUnique({
        where: { id: product.category_id },
        include: {
          priceOptions: true
        }
      });

      // Get store quantities for this product
      const storeQuantities = await prisma.storeQuantity.findMany({
        where: { productId: product.id },
        include: {
          store: true
        }
      });

      return {
        ...product,
        priceOptions: categoryWithPriceOptions?.priceOptions || [],
        storeQuantities: storeQuantities
      };
    }));

    // Get total count for pagination
    const totalProducts = await prisma.product.count();

    res.status(200).json({
      success: true,
      data: productsWithPriceOptions,
      pagination: {
        total: totalProducts,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalProducts / parseInt(limit)),
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
}; 