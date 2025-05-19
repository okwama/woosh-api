const express = require('express');
const router = express.Router();
const { getRoutes, getRouteById } = require('../controllers/routeController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Get all routes
router.get('/', authenticateToken, getRoutes);

// Get route by ID
router.get('/:id', authenticateToken, getRouteById);

module.exports = router; 