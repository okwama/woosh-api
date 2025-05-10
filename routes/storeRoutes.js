const express = require('express');
const router = express.Router();
const { getStores } = require('../controllers/storeController');
const { protect } = require('../middleware/authMiddleware');

// Get all stores
router.get('/', protect, getStores);

module.exports = router; 