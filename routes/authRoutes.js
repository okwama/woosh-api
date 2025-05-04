const express = require('express');
const { register, login, logout, refresh } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.post('/logout', authenticateToken, logout);
router.post('/refresh', authenticateToken, refresh);

module.exports = router;