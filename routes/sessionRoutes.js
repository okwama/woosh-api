const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const { recordLogin, recordLogout, getSessionHistory } = require('../controllers/sessionController');

const router = express.Router();

// Record login - no authentication required
router.post('/login',  recordLogin);

// Protect all other routes with authentication middleware
router.use(authenticateToken);

// Record logout
router.post('/logout', recordLogout);

// Get session history
router.get('/history/:userId', getSessionHistory);

module.exports = router; 