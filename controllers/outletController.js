const prisma = require('../lib/prisma');
const multer = require('multer');
const path = require('path');
const ImageKit = require('imagekit');

// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

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

// Get all outlets
const getOutlets = async (req, res) => {
  try {
    const { route_id, page = 1, limit = 2000 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build the where clause
    const where = {};
    if (route_id) {
      where.route_id = parseInt(route_id);
    }

    // Get total count for pagination
    const total = await prisma.clients.count({ where });

    // Fetch only required fields
    // const outlets = await prisma.clients.findMany({
    //   where,
    //   select: {
    //     id: true,
    //     name: true,
    //     balance: true,
    //     address: true,
    //     latitude: true,
    //     longitude: true,
    //   },
    //   skip,
    //   take: parseInt(limit),
    //   orderBy: {
    //     name: 'asc',
    //   }
    // });
    const outlets = await prisma.clients.findMany({
      where: {
        ...where, // Ensure your where conditions are properly indexed
        // Consider adding date filters if applicable to reduce scanned rows
      },
      select: {
        id: true,
        name: true,
        balance: true,
        address: true,
        latitude: true,
        longitude: true,
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
    location, 
    tax_pin,
    contact,
    region_id,
    region,
    country,
    client_type
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
        location,
        client_type: 1,
        ...(balance !== undefined && { balance: balance.toString() }),
        ...(email && { email }),
        ...(contact && { contact }),
        ...(tax_pin && { tax_pin }),
        latitude,
        longitude,
        country: {
          connect: { id: parseInt(country) } // Assuming country is the ID
        },
        region_id: parseInt(region_id),
        region: region || "Unknown",
        route_id: route_id ? parseInt(route_id) : null, // Use authenticated user's route_id
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
  const { name, address, latitude, longitude, balance, email, phone, kraPin } = req.body;

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
        ...(contact && { contact }),
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

// Add client payment with file upload (for reference only)
const addClientPayment = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ error: err.message });
    }

    const clientId = parseInt(req.params.id);
    const { amount, method, userId } = req.body;

    if (!clientId || !amount || !userId) {
      return res.status(400).json({ error: 'Client ID, amount and userId are required' });
    }

    try {
      let imageUrl = null;
      if (req.file) {
        // Upload file to ImageKit
        const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
        const result = await imagekit.upload({
          file: req.file.buffer,
          fileName: uniqueFilename,
          folder: 'whoosh/payments'
        });
        imageUrl = result.url;
      }

      // Create payment record for reference only
      const payment = await prisma.clientPayment.create({
        data: {
          clientId,
          amount: parseFloat(amount),
          imageUrl,
          method: method || '',
          status: 'PENDING',
          date: new Date(),
          userId: parseInt(userId)
        }
      });

      res.status(201).json({ 
        success: true, 
        data: payment,
        message: 'Payment record created for reference. Balance will be updated after payment approval.'
      });
    } catch (error) {
      console.error('Error creating client payment:', error);
      res.status(500).json({ error: 'Failed to create client payment' });
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