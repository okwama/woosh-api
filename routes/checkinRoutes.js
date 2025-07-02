const express = require('express');
const { checkIn, checkOut, getClientLocation, getHistory, getTotalWorkingHours } = require('../controllers/CheckinController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Check-in route
router.post('/', authenticateToken, checkIn);
// Check-out route
router.post('/checkout', authenticateToken, checkOut);
// Get client location
router.get('/clients/:clientId/location', authenticateToken, getClientLocation);
// Get check-in history
router.get('/history', authenticateToken, getHistory);
// Get working hours
router.get('/working-hours', authenticateToken, getTotalWorkingHours);

module.exports = router;
