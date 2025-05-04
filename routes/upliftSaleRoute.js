const express = require('express');
const router = express.Router();
const upliftSaleController = require('../controllers/upliftSaleController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Create a new uplift sale
router.post('/', upliftSaleController.createUpliftSale);

// Get uplift sales with optional filters
router.get('/', upliftSaleController.getUpliftSales);

// Get a single uplift sale by ID
router.get('/:id', upliftSaleController.getUpliftSaleById);

// Update uplift sale status
router.patch('/:id/status', upliftSaleController.updateUpliftSaleStatus);

// Delete an uplift sale
router.delete('/:id', upliftSaleController.deleteUpliftSale);

module.exports = router;
