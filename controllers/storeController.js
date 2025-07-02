const prisma = require('../lib/prisma');


// @desc    Get all stores
// @route   GET /api/stores
// @access  Private
const getStores = async (req, res) => {
  try {
    const { regionId, countryId } = req.query;

    // Build the where clause based on filters
    const whereClause = {
      status: 0, // Only get active stores
    };

    // Add region filter if provided
    if (regionId) {
      whereClause.regionId = regionId;
    }

    // Add country filter if provided
    if (countryId) {
      whereClause.region = {
        countryId: countryId
      };
    }

    const stores = await prisma.stores.findMany({
      where: whereClause,
      include: {
        region: {
          select: {
            id: true,
            name: true,
            country: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json(stores);
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
};

module.exports = {
  getStores,
}; 