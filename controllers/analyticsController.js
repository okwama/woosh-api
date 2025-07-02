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
        loginAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    }

    // Get all login sessions for the user
    const sessions = await prisma.loginHistory.findMany({
      where: {
        userId: parseInt(userId),
        logoutAt: { not: null }, // Only count completed sessions
        ...dateFilter
      },
      select: {
        duration: true,
        isLate: true,
        isEarly: true,
        status: true
      },
      orderBy: {
        loginAt: 'desc'
      }
    });

    // Calculate total minutes from duration field
    const totalMinutes = sessions.reduce((acc, session) => acc + (session.duration || 0), 0);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);

    // Calculate late/early statistics
    const lateCount = sessions.filter(s => s.isLate).length;
    const earlyCount = sessions.filter(s => s.isEarly).length;

    res.json({
      userId,
      totalHours: hours,
      totalMinutes: minutes,
      sessionCount: sessions.length,
      formattedDuration: `${hours}h ${minutes}m`,
      averageSessionDuration: sessions.length > 0 ? `${Math.floor(totalMinutes / sessions.length)}m` : '0m',
      lateCount,
      earlyCount,
      punctualityRate: sessions.length > 0 
        ? `${Math.round(((sessions.length - lateCount) / sessions.length) * 100)}%` 
        : '0%'
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