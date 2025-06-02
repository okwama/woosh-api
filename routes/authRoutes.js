const express = require('express');
const { register, login, logout, refresh, delete: deleteAccount } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.post('/logout', authenticateToken, logout);
router.post('/refresh', authenticateToken, refresh);
// Delete account route (protected)
router.delete('/delete', authenticateToken, deleteAccount);

module.exports = router;