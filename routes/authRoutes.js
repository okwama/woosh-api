const express = require('express');
const {
  register,
  login,
  logout,
  refresh,
  delete: deleteAccount,
} = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { tokenMonitoring } = require('../lib/monitoring');
const { isAdmin } = require('../middleware/isAdmin');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh); // Public - accepts refresh token in body

// Protected routes
router.post('/logout', authenticateToken, logout);
router.delete('/delete', authenticateToken, deleteAccount);

// New monitoring routes
router.get('/metrics', isAdmin, (req, res) => {
  try {
    const metrics = tokenMonitoring.getPerformanceMetrics();
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics'
    });
  }
});

router.get('/metrics/user/:userId', isAdmin, (req, res) => {
  try {
    const metrics = tokenMonitoring.getUserMetrics(parseInt(req.params.userId));
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('Error fetching user metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user metrics'
    });
  }
});

router.post('/metrics/reset', isAdmin, (req, res) => {
  try {
    tokenMonitoring.resetMetrics();
    res.json({
      success: true,
      message: 'Metrics reset successfully'
    });
  } catch (error) {
    console.error('Error resetting metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset metrics'
    });
  }
});

module.exports = router;
