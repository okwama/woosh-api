const prisma = require('../lib/prisma');

// Get all routes
const getRoutes = async (req, res) => {
  try {
    const routes = await prisma.routes.findMany({
      select: {
        id: true,
        name: true,
        region: true,
        region_name: true,
        country_id: true,
        country_name: true,
        leader_id: true,
        leader_name: true,
        status: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.status(200).json(routes);
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch routes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get route by ID
const getRouteById = async (req, res) => {
  try {
    const { id } = req.params;
    const route = await prisma.routes.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        region: true,
        region_name: true,
        country_id: true,
        country_name: true,
        leader_id: true,
        leader_name: true,
        status: true,
        JourneyPlan: {
          select: {
            id: true,
            date: true,
            time: true,
            status: true,
            client: {
              select: {
                id: true,
                name: true,
                address: true,
                contact: true,
              },
            },
          },
        },
      },
    });

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    res.status(200).json(route);
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({ 
      error: 'Failed to fetch route',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getRoutes,
  getRouteById,
}; 