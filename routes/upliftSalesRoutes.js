const express = require('express');
const router = express.Router();
const upliftSaleController = require('../controllers/upliftSaleController');
const { auth } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(auth);

// Create a new uplift sale
router.post('/', upliftSaleController.createUpliftSale);

// Get all uplift sales with optional filters
router.get('/', upliftSaleController.getUpliftSales);

// Get a single uplift sale by ID
router.get('/:id', upliftSaleController.getUpliftSaleById);

// Update uplift sale status
router.patch('/:id/status', upliftSaleController.updateUpliftSaleStatus);

// Delete an uplift sale
router.delete('/:id', upliftSaleController.deleteUpliftSale);

module.exports = router; 