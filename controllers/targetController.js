const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create test data
exports.createTestData = async (req, res) => {
  try {
    // First, get a sales rep
    const salesRep = await prisma.SalesRep.findFirst();
    
    if (!salesRep) {
      return res.status(404).json({ error: 'No sales rep found. Please create a sales rep first.' });
    }

    // Create a target
    const target = await prisma.Target.create({
      data: {
        salesRepId: salesRep.id,
        isCurrent: true,
        targetValue: 100,
        achievedValue: 0,
        achieved: false
      }
    });

    // Create some journey plans for today
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Create completed visits
    await prisma.JourneyPlan.create({
      data: {
        userId: salesRep.id,
        date: today,
        time: "09:00",
        clientId: 1, // Make sure this client exists
        checkInTime: new Date(today.setHours(9, 0, 0, 0)),
        checkoutTime: new Date(today.setHours(10, 0, 0, 0)),
        status: 1
      }
    });

    // Create pending visit
    await prisma.JourneyPlan.create({
      data: {
        userId: salesRep.id,
        date: today,
        time: "11:00",
        clientId: 2, // Make sure this client exists
        checkInTime: new Date(today.setHours(11, 0, 0, 0)),
        status: 1
      }
    });

    // Create missed visit
    await prisma.JourneyPlan.create({
      data: {
        userId: salesRep.id,
        date: today,
        time: "14:00",
        clientId: 3, // Make sure this client exists
        status: 0
      }
    });

    res.json({
      message: 'Test data created successfully',
      target,
      salesRepId: salesRep.id
    });
  } catch (error) {
    console.error('Error creating test data:', error);
    res.status(500).json({ error: 'Failed to create test data', details: error.message });
  }
};

// Get all targets with calculated progress
exports.getAllTargets = async (req, res) => {
  try {
    console.log('Fetching all targets...');
    const targets = await prisma.Target.findMany();
    console.log('Found targets:', targets);

    if (!targets || targets.length === 0) {
      return res.json([]);
    }

    // For each target, calculate achievedValue and progress
    const targetsWithProgress = await Promise.all(targets.map(async (target) => {
      console.log('Processing target:', target.id);
      
      // Find all orders for this sales rep within the target period
      const orders = await prisma.MyOrder.findMany({
        where: {
          userId: target.salesRepId,
          createdAt: {
            gte: target.createdAt,
            lte: target.updatedAt,
          },
        },
        select: { id: true },
      });
      console.log('Found orders for target:', target.id, orders.length);
      
      const orderIds = orders.map(o => o.id);

      // Sum up all quantities from OrderItem for these orders
      let achievedValue = 0;
      if (orderIds.length > 0) {
        const { _sum } = await prisma.OrderItem.aggregate({
          where: { orderId: { in: orderIds } },
          _sum: { quantity: true },
        });
        achievedValue = _sum.quantity || 0;
        console.log('Achieved value for target:', target.id, achievedValue);
      }
      
      const progress = target.targetValue > 0 ? (achievedValue / target.targetValue) * 100 : 0;
      console.log('Progress for target:', target.id, progress);

      return {
        ...target,
        achievedValue,
        progress,
      };
    }));

    console.log('Sending response with targets:', targetsWithProgress);
    res.json(targetsWithProgress);
  } catch (error) {
    console.error('Error in getAllTargets:', error);
    res.status(500).json({ error: 'Failed to fetch targets', details: error.message });
  }
};

// Get daily visit targets and actual visits for a sales rep
exports.getDailyVisitTargets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;
    console.log('Getting daily visit targets for user:', userId, 'date:', date);

    // Get the sales rep's visit target
    const salesRep = await prisma.SalesRep.findUnique({
      where: { id: parseInt(userId) },
      select: { visits_targets: true }
    });
    console.log('Found sales rep:', salesRep);

    if (!salesRep) {
      return res.status(404).json({ error: 'Sales rep not found' });
    }

    // Set date range for the query
    const queryDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(queryDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(queryDate.setHours(23, 59, 59, 999));
    console.log('Date range:', { startOfDay, endOfDay });

    // Get completed visits for the day
    const completedVisits = await prisma.JourneyPlan.count({
      where: {
        userId: parseInt(userId),
        checkInTime: {
          gte: startOfDay,
          lte: endOfDay
        },
        checkoutTime: {
          not: null
        }
      }
    });
    console.log('Completed visits:', completedVisits);

    // Calculate progress percentage
    const progress = salesRep.visits_targets > 0 
      ? (completedVisits / salesRep.visits_targets) * 100 
      : 0;

    const response = {
      userId,
      date: queryDate.toISOString().split('T')[0],
      visitTarget: salesRep.visits_targets,
      completedVisits,
      remainingVisits: Math.max(0, salesRep.visits_targets - completedVisits),
      progress: Math.round(progress),
      status: completedVisits >= salesRep.visits_targets ? 'Target Achieved' : 'In Progress'
    };
    console.log('Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('Error in getDailyVisitTargets:', error);
    res.status(500).json({ error: 'Failed to fetch daily visit targets', details: error.message });
  }
};

// Get monthly visit reports
exports.getMonthlyVisitReports = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    // Validate user exists
    const user = await prisma.salesRep.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!user) {
      return res.status(404).json({ error: 'Sales rep not found' });
    }

    // Get current month and year if not provided
    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();

    // Calculate start and end dates for the month
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    // Get all journey plans for the month
    const journeyPlans = await prisma.journeyPlan.findMany({
      where: {
        userId: parseInt(userId),
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        date: true,
        checkInTime: true,
        checkoutTime: true
      },
      orderBy: {
        date: 'desc'
      }
    });

    // Group visits by date
    const visitsByDate = {};
    journeyPlans.forEach(plan => {
      const dateStr = plan.date.toISOString().split('T')[0];
      if (!visitsByDate[dateStr]) {
        visitsByDate[dateStr] = {
          completedVisits: 0
        };
      }
      if (plan.checkInTime && plan.checkoutTime) {
        visitsByDate[dateStr].completedVisits++;
      }
    });

    // Generate report for each day of the month
    const reports = [];
    for (let d = 1; d <= endDate.getDate(); d++) {
      const currentDate = new Date(targetYear, targetMonth - 1, d);
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayVisits = visitsByDate[dateStr] || { completedVisits: 0 };
      
      const report = {
        userId: userId.toString(),
        date: dateStr,
        visitTarget: user.visits_targets,
        completedVisits: dayVisits.completedVisits,
        remainingVisits: Math.max(0, user.visits_targets - dayVisits.completedVisits),
        progress: Math.round((dayVisits.completedVisits / user.visits_targets) * 100),
        status: dayVisits.completedVisits >= user.visits_targets ? "Target Achieved" : "In Progress"
      };
      
      reports.push(report);
    }

    res.json(reports);
  } catch (error) {
    console.error('Error fetching monthly visit reports:', error);
    res.status(500).json({ 
      error: 'Failed to fetch monthly visit reports',
      details: error.message 
    });
  }
};

