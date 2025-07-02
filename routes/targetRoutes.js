const express = require('express');
const router = express.Router();
const targetController = require('../controllers/targetController');

// Create test data
router.post('/test-data', targetController.createTestData);

// Get all targets
router.get('/', targetController.getAllTargets);

// Get daily visit targets for a specific user
router.get('/daily-visits/:userId', targetController.getDailyVisitTargets);

// Get monthly visit reports for a specific user
router.get('/monthly-visits/:userId', targetController.getMonthlyVisitReports);

// Get new clients progress for a sales rep
router.get('/clients/:userId/progress', targetController.getNewClientsProgress);

// Get detailed list of new clients added by sales rep
router.get('/clients/:userId/details', targetController.getNewClientsDetails);

// Get product sales progress (vapes/pouches) for a sales rep
router.get('/products/:userId/progress', targetController.getProductSalesProgress);

// Get comprehensive sales rep performance dashboard
router.get('/dashboard/:userId', targetController.getSalesRepDashboard);

// Get team performance overview (for managers)
router.get('/team/:managerId/performance', targetController.getTeamPerformanceOverview);

// Update sales rep targets (vapes, pouches, new clients, visits)
router.put('/targets/:userId', targetController.updateSalesRepTargets);

// Get category mapping for product classification
router.get('/categories/mapping', targetController.getCategoryMapping);

module.exports = router;
