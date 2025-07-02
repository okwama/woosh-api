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

module.exports = router;
