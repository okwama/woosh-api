const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const { calculateLoginHours, calculateJourneyPlanVisits } = require('../controllers/analyticsController');

const router = express.Router();

// Protect all routes with authentication middleware
router.use(authenticateToken);

// Base analytics endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Analytics API',
    availableEndpoints: [
      {
        path: '/login-hours/:userId',
        description: 'Get user login hours statistics',
        example: '/api/analytics/login-hours/1'
      },
      {
        path: '/journey-visits/:userId',
        description: 'Get user journey plan visit statistics',
        example: '/api/analytics/journey-visits/1'
      }
    ]
  });
});

// Calculate login hours for a user
router.get('/login-hours/:userId', calculateLoginHours);

// Calculate journey plan visits for a user
router.get('/journey-visits/:userId', calculateJourneyPlanVisits);

module.exports = router; 