const express = require('express');
const router = express.Router();
const { getRoutes, getRouteById } = require('../controllers/routeController');
const { auth } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(auth);

// Get all routes
router.get('/', getRoutes);

// Get route by ID
router.get('/:id', getRouteById);

module.exports = router; 