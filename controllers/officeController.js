const { getPrismaClient } = require('../lib/prisma');
const prisma = getPrismaClient();

// Get all outlets
const getOffice = async (req, res) => {
  try {
    const office = await prisma.office.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
      },
    });
    
    // Keep balance as a string for client compatibility
    const formattedOffice = office.map(office => ({
      ...office,
      // No conversion needed - balance remains a string
    }));
    
    res.status(200).json(formattedOffice);
  } catch (error) {
    console.error('Error fetching office:', error);
    res.status(500).json({ error: 'Failed to fetch office' });
  }
};

// Create a new outlet
const createOffice = async (req, res) => {
  const { name, address, latitude, longitude, balance, email, phone, kraPin } = req.body;

  if (!name || !address) {
    return res.status(400).json({ error: 'Name and address are required' });
  }

  try {
    const newOffice = await prisma.office.create({
      data: {
        name,
        address,
        latitude,
        longitude,
      },
    });
    res.status(201).json(newOffice);
  } catch (error) {
    console.error('Error creating office:', error);
    res.status(500).json({ error: 'Failed to create office' });
  }
};

// Update an office
const updateOffice = async (req, res) => {
  const { id } = req.params;
  const { name, address, latitude, longitude } = req.body;

  if (!name || !address) {
    return res.status(400).json({ error: 'Name and address are required' });
  }

  try {
    const updatedOffice = await prisma.office.update({
      where: { id: parseInt(id) },
      data: {
        name,
        address,
        latitude,
        longitude,
          },
    });
    res.status(200).json(updatedOffice);
  } catch (error) {
    console.error('Error updating office:', error);
    res.status(500).json({ error: 'Failed to update office' });
  }
};



module.exports = {
  getOffice,
  createOffice,
  updateOffice,
};