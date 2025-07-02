const express = require('express');
const { register, login, logout, refresh, delete: deleteAccount } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh); // Public - accepts refresh token in body

// Protected routes
router.post('/logout', authenticateToken, logout);
router.delete('/delete', authenticateToken, deleteAccount);

module.exports = router;