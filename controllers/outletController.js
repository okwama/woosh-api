const prisma = require('../lib/prisma');
const multer = require('multer');
const path = require('path');
const ImageKit = require('imagekit');
const { uploadFile } = require('../lib/uploadService');

// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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

// Get all outlets
const getOutlets = async (req, res) => {
  try {
    const { route_id, page = 1, limit = 2000, created_after } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build the where clause
    const where = {
      countryId: req.user.countryId,  // Add countryId filter here
      status: 0  // Only fetch outlets with status 0
    };
    if (route_id) {
      where.route_id = parseInt(route_id);
    }
    if (created_after) {
      where.created_at = {
        gt: new Date(created_after)
      };
    }

    // Get total count for pagination
    const total = await prisma.clients.count({ where });

    const outlets = await prisma.clients.findMany({
      where,
      select: {
        id: true,
        name: true,
        balance: true,
        address: true,
        latitude: true,
        longitude: true,
        created_at: true,
        // Add any frequently used fields to avoid separate queries
      },
      skip: Math.max(0, skip), // Ensure skip is never negative
      take: Math.min(Number(limit), 2000), // Enforce maximum limit and faster conversion
      orderBy: [
        { name: 'asc' }, // Primary sort
        { id: 'asc' } // Secondary sort for consistent pagination
      ]
    });

    // Add default value for balance if it's null/undefined
    const outletsWithDefaultBalance = outlets.map(outlet => ({
      ...outlet,
      balance: String(outlet.balance ?? "0"),
      created_at: outlet.created_at?.toISOString() ?? null,
    }));

    res.json({
      data: outletsWithDefaultBalance,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching outlets:', error);
    res.status(500).json({ error: 'Error fetching outlets' });
  }
};


// Create a new outlet
const createOutlet = async (req, res) => {
  const { 
    name, 
    address, 
    latitude, 
    longitude, 
    balance, 
    email, 
    contact,
    region_id,
    region,
    client_type,
    added_by

  } = req.body;

  // Get route_id from authenticated user
  const route_id = req.user.route_id;

  if (!name || !address) {
    return res.status(400).json({ error: 'Name and address are required' });
  }

  try {
    const newOutlet = await prisma.clients.create({
      data: {
        name,
        address,
        contact,
        client_type: 1,
        ...(balance !== undefined && { balance: balance.toString() }),
        ...(email && { email }),
        tax_pin: req.body.tax_pin || "0",
        location: req.body.location || "Unknown",
        latitude,
        longitude,
        countryId: req.user.countryId, // Get countryId from logged-in user
        region_id: parseInt(region_id),
        region: region || "Unknown",
        route_id: route_id ? parseInt(route_id) : null,
        route_id_update: route_id ? parseInt(route_id) : null,
        route_name_update: req.user.route_name || "Unknown",
        added_by: req.user.id,
        created_at: new Date(),
      },
    });
    res.status(201).json(newOutlet);
  } catch (error) {
    console.error('Error creating outlet:', error);
    res.status(500).json({ error: 'Failed to create outlet' });
  }
};


// Update an outlet
const updateOutlet = async (req, res) => {
  const { id } = req.params;
  const { name, address, latitude, longitude, balance, email, contact, tax_pin } = req.body;

  try {
    // First get the current outlet data
    const currentOutlet = await prisma.clients.findUnique({
      where: { id: parseInt(id) }
    });

    if (!currentOutlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // If this is just a location update (only latitude and longitude provided)
    if (Object.keys(req.body).length === 2 && latitude !== undefined && longitude !== undefined) {
      const updatedOutlet = await prisma.clients.update({
        where: { id: parseInt(id) },
        data: {
          latitude,
          longitude,
        },
      });
      return res.status(200).json(updatedOutlet);
    }

    // For full updates, require name and address
    if (!name || !address) {
      return res.status(400).json({ error: 'Name and address are required for full updates' });
    }

    const updatedOutlet = await prisma.clients.update({
      where: { id: parseInt(id) },
      data: {
        name,
        address,
        ...(balance !== undefined && { balance: balance.toString() }),
        ...(email && { email }),
        ...(tax_pin && { tax_pin }),
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude }),
      },
    });
    res.status(200).json(updatedOutlet);
  } catch (error) {
    console.error('Error updating outlet:', error);
    res.status(500).json({ error: 'Failed to update outlet' });
  }
};

// Update outlet location only
const updateOutletLocation = async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;

  // Validate required fields
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ 
      error: 'Both latitude and longitude are required for location update' 
    });
  }

  try {
    // First check if outlet exists
    const outlet = await prisma.clients.findUnique({
      where: { id: parseInt(id) }
    });

    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // Update only location fields
    const updatedOutlet = await prisma.clients.update({
      where: { id: parseInt(id) },
      data: {
        latitude,
        longitude,
      },
    });

    res.status(200).json(updatedOutlet);
  } catch (error) {
    console.error('Error updating outlet location:', error);
    res.status(500).json({ error: 'Failed to update outlet location' });
  }
};

// Get products for a specific outlet
const getOutletProducts = async (req, res) => {
  const { id } = req.params;
  
  try {
    const outlet = await prisma.clients.findUnique({
      where: { id: parseInt(id) },
      include: {
        products: {
          include: {
            product: true
          }
        }
      }
    });
    
    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }
    
    // Format the response to return just the products
    const products = outlet.products.map(op => ({
      ...op.product,
      quantity: op.quantity
    }));
    
    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching outlet products:', error);
    res.status(500).json({ error: 'Failed to fetch outlet products' });
  }
};

// Get outlet location
const getOutletLocation = async (req, res) => {
  const { id } = req.params;
  
  try {
    const outlet = await prisma.clients.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        latitude: true,
        longitude: true,
      },
    });
    
    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }
    
    res.status(200).json(outlet);
  } catch (error) {
    console.error('Error fetching outlet location:', error);
    res.status(500).json({ error: 'Failed to fetch outlet location' });
  }
};

// Add client payment
const addClientPayment = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { clientId, amount, paymentDate, paymentType } = req.body;

      if (!clientId || !amount || !paymentDate || !paymentType) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      let imageUrl = null;
      let thumbnailUrl = null;

      if (req.file) {
        try {
          const result = await uploadFile(req.file, {
            folder: 'whoosh/payments',
            type: 'document',
            generateThumbnail: true
          });
          imageUrl = result.main.url;
          thumbnailUrl = result.thumbnail?.url;
        } catch (error) {
          return res.status(500).json({ error: 'Failed to upload payment document' });
        }
      }

      const payment = await prisma.clientPayment.create({
        data: {
          clientId: parseInt(clientId),
          amount: parseFloat(amount),
          paymentDate: new Date(paymentDate),
          paymentType,
          documentUrl: imageUrl,
          thumbnailUrl: thumbnailUrl,
          addedBy: req.user.id
        }
      });

      res.status(201).json(payment);
    } catch (error) {
      console.error('Error adding payment:', error);
      res.status(500).json({ error: 'Failed to add payment' });
    }
  });
};

// Get client payments
const getClientPayments = async (req, res) => {
  const clientId = parseInt(req.params.id);
  try {
    const payments = await prisma.clientPayment.findMany({
      where: { clientId },
      orderBy: { date: 'desc' }
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch client payments' });
  }
};

module.exports = {
  getOutlets,
  createOutlet,
  updateOutlet,
  getOutletProducts,
  getOutletLocation,
  addClientPayment,
  getClientPayments,
  updateOutletLocation
};