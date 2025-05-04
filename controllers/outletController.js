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
    const outlets = await prisma.clients.findMany({
      select: {
        id: true,
        name: true,
        balance: true,  // Just select the balance field
        address: true,
        latitude: true,
        longitude: true
      }
    });

    // Add default value for balance if it's null/undefined
    const outletsWithDefaultBalance = outlets.map(outlet => ({
      ...outlet,
      balance: outlet.balance ?? 0  // Using nullish coalescing operator
    }));

    res.json(outletsWithDefaultBalance);
  } catch (error) {
    console.error('Error fetching outlets:', error);
    res.status(500).json({ error: 'Error fetching outlets' });
  }
};
// Create a new outlet
const createOutlet = async (req, res) => {
  const { name, address, latitude, longitude, balance, email, location, tax_pin,contact ,region_id,region,country,client_type} = req.body;

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
        region,
        region_id: parseInt(region_id),
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

  if (!name || !address) {
    return res.status(400).json({ error: 'Name and address are required' });
  }

  try {
    const updatedOutlet = await prisma.clients.update({
      where: { id: parseInt(id) },
      data: {
        name,
        address,
        ...(balance !== undefined && { balance: balance.toString() }),
        ...(email && { email }),
        ...(contact && { contact }),
        ...(tax_pin && { tax_pin }),
        latitude,
        longitude,
          },
    });
    res.status(200).json(updatedOutlet);
  } catch (error) {
    console.error('Error updating outlet:', error);
    res.status(500).json({ error: 'Failed to update outlet' });
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

// Add client payment with file upload
const addClientPayment = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ error: err.message });
    }

    const clientId = parseInt(req.params.id);
    const { amount } = req.body;

    if (!clientId || !amount || !req.file) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // Upload file to ImageKit
      const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
      const result = await imagekit.upload({
        file: req.file.buffer,
        fileName: uniqueFilename,
        folder: 'whoosh/payments'
      });

      // Create payment record in database
      const payment = await prisma.clientPayment.create({
        data: {
          clientId,
          amount: parseFloat(amount),
          imageUrl: result.url,
          status: 'PENDING',
        },
      });

      res.status(201).json({ success: true, data: payment });
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
  getClientPayments
};