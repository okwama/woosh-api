const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import target services for complex business logic
const targetService = require('../lib/services/targetService');
const clientTrackingService = require('../lib/services/clientTrackingService');
const productSalesService = require('../lib/services/productSalesService');

// Create test data
exports.createTestData = async (req, res) => {
  try {
    const result = await targetService.createTestData();
    res.json(result);
  } catch (error) {
    console.error('Error creating test data:', error);
    res.status(500).json({ error: 'Failed to create test data', details: error.message });
  }
};

// Get all targets with calculated progress
exports.getAllTargets = async (req, res) => {
  try {
    const targets = await targetService.getAllTargetsWithProgress();
    res.json(targets);
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
    
    const result = await targetService.getDailyVisitTargets(parseInt(userId), date);
    res.json(result);
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
    
    const reports = await targetService.getMonthlyVisitReports(
      parseInt(userId), 
      month ? parseInt(month) : null, 
      year ? parseInt(year) : null
    );
    res.json(reports);
  } catch (error) {
    console.error('Error fetching monthly visit reports:', error);
    res.status(500).json({
      error: 'Failed to fetch monthly visit reports',
      details: error.message,
    });
  }
};

// NEW: Get new clients added by sales rep
exports.getNewClientsProgress = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, period } = req.query;
    
    const result = await clientTrackingService.getNewClientsProgress(
      parseInt(userId), 
      startDate, 
      endDate,
      period
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching new clients progress:', error);
    res.status(500).json({ error: 'Failed to fetch new clients progress', details: error.message });
  }
};

// NEW: Get detailed list of new clients added by sales rep
exports.getNewClientsDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, period } = req.query;
    
    const result = await clientTrackingService.getNewClientsDetails(
      parseInt(userId), 
      startDate, 
      endDate,
      period
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching new clients details:', error);
    res.status(500).json({ error: 'Failed to fetch new clients details', details: error.message });
  }
};

// NEW: Get vapes and pouches sales progress
exports.getProductSalesProgress = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, productType } = req.query;
    
    const result = await productSalesService.getProductSalesProgress(
      parseInt(userId),
      productType, // 'vapes', 'pouches', or 'all'
      startDate,
      endDate
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching product sales progress:', error);
    res.status(500).json({ error: 'Failed to fetch product sales progress', details: error.message });
  }
};

// NEW: Get comprehensive sales rep performance dashboard
exports.getSalesRepDashboard = async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = 'current_month' } = req.query; // 'current_month', 'last_month', 'current_year'
    
    const [visitTargets, newClients, productSales] = await Promise.all([
      targetService.getDailyVisitTargets(parseInt(userId)),
      clientTrackingService.getNewClientsProgress(parseInt(userId), null, null, period),
      productSalesService.getProductSalesProgress(parseInt(userId), 'all', null, null, period)
    ]);

    const dashboard = {
      userId: parseInt(userId),
      period,
      visitTargets,
      newClients,
      productSales,
      generatedAt: new Date().toISOString()
    };

    res.json(dashboard);
  } catch (error) {
    console.error('Error fetching sales rep dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch sales rep dashboard', details: error.message });
  }
};

// NEW: Update sales rep targets (vapes, pouches, new clients)
exports.updateSalesRepTargets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { vapes_targets, pouches_targets, new_clients_target, visits_targets } = req.body;
    
    const updatedSalesRep = await prisma.salesRep.update({
      where: { id: parseInt(userId) },
      data: {
        ...(vapes_targets !== undefined && { vapes_targets }),
        ...(pouches_targets !== undefined && { pouches_targets }),
        ...(new_clients !== undefined && { new_clients: new_clients_target }),
        ...(visits_targets !== undefined && { visits_targets }),
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        vapes_targets: true,
        pouches_targets: true,
        new_clients: true,
        visits_targets: true,
        updatedAt: true
      }
    });

    res.json({
      message: 'Sales rep targets updated successfully',
      salesRep: updatedSalesRep
    });
  } catch (error) {
    console.error('Error updating sales rep targets:', error);
    res.status(500).json({ error: 'Failed to update sales rep targets', details: error.message });
  }
};

// NEW: Get team performance overview (for managers)
exports.getTeamPerformanceOverview = async (req, res) => {
  try {
    const { managerId } = req.params;
    const { period = 'current_month' } = req.query;
    
    // Get all sales reps under this manager
    const salesReps = await prisma.salesRep.findMany({
      where: { managerId: parseInt(managerId) },
      select: { id: true, name: true }
    });

    const teamPerformance = await Promise.all(
      salesReps.map(async (rep) => {
        const [visits, clients, products] = await Promise.all([
          targetService.getDailyVisitTargets(rep.id),
          clientTrackingService.getNewClientsProgress(rep.id, null, null, period),
          productSalesService.getProductSalesProgress(rep.id, 'all', null, null, period)
        ]);

        return {
          salesRep: rep,
          performance: { visits, clients, products }
        };
      })
    );

    res.json({
      managerId: parseInt(managerId),
      period,
      teamPerformance,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching team performance:', error);
    res.status(500).json({ error: 'Failed to fetch team performance', details: error.message });
  }
};

// NEW: Get category mapping for product classification
exports.getCategoryMapping = async (req, res) => {
  try {
    const categoryInfo = await productSalesService.getCategoryMapping();
    res.json(categoryInfo);
  } catch (error) {
    console.error('Error fetching category mapping:', error);
    res.status(500).json({ error: 'Failed to fetch category mapping', details: error.message });
  }
};
