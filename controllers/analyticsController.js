const prisma = require('../lib/prisma');

// Calculate user login hours
const calculateLoginHours = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Validate user exists
    const user = await prisma.salesRep.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build date filter if provided
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    }

    // Get all tokens for the user
    const tokens = await prisma.token.findMany({
      where: {
        salesRepId: parseInt(userId),
        ...dateFilter
      },
      select: {
        createdAt: true,
        expiresAt: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Calculate total login hours
    let totalMinutes = 0;
    let sessionCount = 0;

    tokens.forEach(token => {
      if (token.expiresAt) {
        const duration = token.expiresAt.getTime() - token.createdAt.getTime();
        totalMinutes += duration / (1000 * 60); // Convert milliseconds to minutes
        sessionCount++;
      }
    });

    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);

    res.json({
      userId,
      totalHours: hours,
      totalMinutes: minutes,
      sessionCount,
      formattedDuration: `${hours}h ${minutes}m`,
      averageSessionDuration: sessionCount > 0 ? `${Math.floor(totalMinutes / sessionCount)}m` : '0m'
    });
  } catch (error) {
    console.error('Error calculating login hours:', error);
    res.status(500).json({ error: 'Failed to calculate login hours' });
  }
};

// Calculate journey plan visit counts
const calculateJourneyPlanVisits = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Validate user exists
    const user = await prisma.salesRep.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build date filter if provided
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    }

    // Get all journey plans for the user
    const journeyPlans = await prisma.journeyPlan.findMany({
      where: {
        userId: parseInt(userId),
        ...dateFilter
      },
      select: {
        checkInTime: true,
        checkoutTime: true,
        client: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    // Calculate visit statistics
    const completedVisits = journeyPlans.filter(plan => plan.checkInTime && plan.checkoutTime).length;
    const pendingVisits = journeyPlans.filter(plan => plan.checkInTime && !plan.checkoutTime).length;
    const missedVisits = journeyPlans.filter(plan => !plan.checkInTime).length;

    // Group visits by client
    const clientVisits = {};
    journeyPlans.forEach(plan => {
      if (plan.checkInTime && plan.checkoutTime) {
        const clientId = plan.client.id;
        if (!clientVisits[clientId]) {
          clientVisits[clientId] = {
            clientName: plan.client.name,
            visitCount: 0
          };
        }
        clientVisits[clientId].visitCount++;
      }
    });

    res.json({
      userId,
      totalPlans: journeyPlans.length,
      completedVisits,
      pendingVisits,
      missedVisits,
      clientVisits: Object.values(clientVisits),
      completionRate: journeyPlans.length > 0 
        ? `${Math.round((completedVisits / journeyPlans.length) * 100)}%` 
        : '0%'
    });
  } catch (error) {
    console.error('Error calculating journey plan visits:', error);
    res.status(500).json({ error: 'Failed to calculate journey plan visits' });
  }
};

module.exports = {
  calculateLoginHours,
  calculateJourneyPlanVisits
}; 